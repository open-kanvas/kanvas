import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '../../src/shared/types.js';
import { denied, fact, startHarness, success, type Browser, type Harness } from './harness.js';

async function openEvents(browser: Browser, sessionId: string, displayId?: string) {
  const controller = new AbortController();
  const response = await browser.raw(`/api/sessions/${sessionId}/events${displayId ? `?displayId=${encodeURIComponent(displayId)}` : ''}`, {}, { signal: controller.signal });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
  expect(response.headers.get('cache-control')).toMatch(/no-store|no-cache/);
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  const state: { events: SessionEvent[]; closed: boolean; error?: unknown } = { events: [], closed: false };
  const finished = (async () => {
    let buffer = '';
    try {
      while (true) {
        const read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true }).replaceAll('\r\n', '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          if (!frame.split('\n').some(line => line === 'event: change')) continue;
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data) state.events.push(JSON.parse(data));
        }
      }
    } catch (error) { if (!controller.signal.aborted) state.error = error; }
    finally { state.closed = true; reader.releaseLock(); }
  })();
  return { state, async close() { controller.abort(); await finished; } };
}

describe('authorized live updates and reconnect', () => {
  let h: Harness, streams: Awaited<ReturnType<typeof openEvents>>[];
  beforeEach(async () => { h = await startHarness(); streams = []; });
  afterEach(async () => { await Promise.all(streams.map(stream => stream.close())); await h?.close(); });

  it('streams only the authorized session and lets a reconnect read current state without replaying history', async () => {
    const owner = await h.account(), a = await owner.session('A'), b = await owner.session('B'), da = await owner.display(a.id), db = await owner.display(b.id);
    const stream = await openEvents(owner, a.id); streams.push(stream);
    await owner.submit(a.id, [da.id], fact('A current state'));
    await vi.waitFor(() => expect(stream.state.events.some(event => event.type === 'display' && event.displayId === da.id)).toBe(true));
    await owner.submit(b.id, [db.id], fact('B private state'));
    await delay(50);
    expect(stream.state.events.every(event => event.sessionId === a.id)).toBe(true);
    expect(stream.state.error).toBeUndefined();
    await stream.close();
    const current = await owner.submit(a.id, [da.id], fact('A newest state'));
    const reconnect = await openEvents(owner, a.id); streams.push(reconnect);
    const read = await owner.detail(a.id);
    expect(read.displays[0].view?.data.text).toBe('A newest state');
    expect(read.displays[0].revision).toBe(current.detail.displays[0].revision);
    // Reconnect does not manufacture browser acknowledgements or re-run display generation.
    expect(read.updates.find(update => update.id === current.update.id)!.status).toBe('prepared');
    expect(read.updates).toHaveLength(2);
  });

  it('stops a revoked participant receiving private change notifications and rejects their reconnect', async () => {
    const owner = await h.account(), participant = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: participant.user!.username, role: 'viewer' }));
    const revoked = await openEvents(participant, session.id), control = await openEvents(owner, session.id); streams.push(revoked, control);
    await owner.submit(session.id, [display.id], fact('Before revocation'));
    await vi.waitFor(() => expect(revoked.state.events.some(event => event.type === 'display')).toBe(true));
    success(await owner.request('DELETE', `/api/sessions/${session.id}/members/${participant.user!.id}`));
    await delay(25);
    const cutoff = revoked.state.events.length, controlCutoff = control.state.events.length;
    const updated = await owner.submit(session.id, [display.id], fact('After revocation'));
    await vi.waitFor(() => expect(control.state.events.slice(controlCutoff).some(event => event.type === 'display' && event.revision === updated.detail.displays[0].revision)).toBe(true));
    await delay(75);
    expect(revoked.state.events.slice(cutoff).filter(event => ['display', 'update', 'interaction', 'dataset', 'asset', 'config'].includes(event.type))).toHaveLength(0);
    denied(await participant.request('GET', `/api/sessions/${session.id}/events`));
    denied(await participant.request('GET', `/api/sessions/${session.id}`));
  });

  it('ends existing streams on session end and rejects further stream connections', async () => {
    const owner = await h.account(), session = await owner.session();
    const stream = await openEvents(owner, session.id); streams.push(stream);
    success(await owner.request('POST', `/api/sessions/${session.id}/end`, {}));
    await vi.waitFor(() => expect(stream.state.closed).toBe(true), { timeout: 2000, interval: 10 });
    denied(await owner.request('GET', `/api/sessions/${session.id}/events`), [403, 404, 409, 410]);
  });

  it('tracks per-display connection presence without erasing retained content on disconnect', async () => {
    const owner = await h.account(), session = await owner.session(), screen = await owner.display(session.id), other = await owner.display(session.id, 'Offline screen');
    const prepared = await owner.submit(session.id, [screen.id], fact('Retained offline'));
    expect(prepared.detail.displays.every(display => display.online === false)).toBe(true);
    const stream = await openEvents(owner, session.id, screen.id); streams.push(stream);
    await vi.waitFor(async () => expect((await owner.detail(session.id)).displays.find(display => display.id === screen.id)!.online).toBe(true));
    expect((await owner.detail(session.id)).displays.find(display => display.id === other.id)!.online).toBe(false);
    await stream.close();
    await vi.waitFor(async () => expect((await owner.detail(session.id)).displays.find(display => display.id === screen.id)!.online).toBe(false));
    const offline = (await owner.detail(session.id)).displays.find(display => display.id === screen.id)!;
    expect(offline.view?.data.text).toBe('Retained offline');
    expect(offline.revision).toBe(prepared.detail.displays.find(display => display.id === screen.id)!.revision);
    const reconnect = await openEvents(owner, session.id, screen.id); streams.push(reconnect);
    await vi.waitFor(async () => expect((await owner.detail(session.id)).displays.find(display => display.id === screen.id)!.online).toBe(true));
  });
});
