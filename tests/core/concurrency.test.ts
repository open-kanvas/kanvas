import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatasetRecord, DisplayRecord, SessionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { ControlledInterpreter, denied, fact, startHarness, success, type Browser, type Harness } from './harness.js';

describe('acceptance versus rendering and deterministic update races', () => {
  let h: Harness, interpreter: ControlledInterpreter, browser: Browser, session: SessionRecord, display: DisplayRecord;
  beforeEach(async () => {
    interpreter = new ControlledInterpreter(); h = await startHarness({ interpreter });
    browser = await h.account(); session = await browser.session(); display = await browser.display(session.id);
  });
  afterEach(async () => { interpreter?.releaseAll(); await h?.close(); });
  async function submit(requestId: string, text: string) {
    return success(await browser.request<UpdateRecord>('POST', `/api/sessions/${session.id}/submit`, { requestId, displayIds: [display.id], data: { text } }));
  }

  it('returns acceptance promptly and claims applied only after a matching browser acknowledgement', async () => {
    const accepted = await submit('apply-status', 'Source fact');
    expect(['accepted', 'rendering']).toContain(accepted.status);
    await interpreter.waitFor(1);
    let detail = await browser.detail(session.id);
    expect(detail.displays[0].view).toBeNull();
    expect(detail.updates[0].status).not.toBe('applied');
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Source fact') });
    const prepared = await browser.settle(session.id, 'apply-status');
    expect(prepared.update.status).toBe('prepared');
    expect(prepared.detail.displays[0].view?.data.text).toBe('Source fact');
    const revision = prepared.detail.displays[0].revision;
    denied(await browser.request('POST', `/api/sessions/${session.id}/displays/${display.id}/applied`, { revision: revision + 1 }), [400, 409, 422]);
    expect((await browser.detail(session.id)).updates[0].status).toBe('prepared');
    success(await browser.request('POST', `/api/sessions/${session.id}/displays/${display.id}/applied`, { revision }));
    detail = await browser.detail(session.id);
    expect(detail.updates[0].status).toBe('applied');
    expect(detail.displays[0].appliedRevision).toBe(revision);
    expect(interpreter.calls).toHaveLength(1);
  });

  it('lets newer intent win even when an older rendering request finishes last', async () => {
    await submit('old', 'Old source'); await interpreter.waitFor(1);
    await submit('new', 'New source'); await interpreter.waitFor(2);
    interpreter.calls[1].resolve({ action: 'replace', view: fact('New source') });
    const newer = await browser.settle(session.id, 'new');
    expect(newer.detail.displays[0].view?.data.text).toBe('New source');
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Old source') });
    const older = await browser.settle(session.id, 'old');
    expect(older.update.status).toBe('superseded');
    expect(older.detail.displays[0].view?.data.text).toBe('New source');
    expect(older.detail.displays[0].revision).toBe(newer.detail.displays[0].revision);
  });

  it('makes clear authoritative over in-flight render completion', async () => {
    await submit('slow-before-clear', 'Will finish too late'); await interpreter.waitFor(1);
    const cleared = success(await browser.request<UpdateRecord>('POST', `/api/sessions/${session.id}/clear`, { requestId: 'clear', displayIds: [display.id] }));
    expect(cleared.status).not.toBe('applied');
    const afterClear = await browser.detail(session.id);
    expect(afterClear.displays[0].view).toBeNull();
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Will finish too late') });
    const late = await browser.settle(session.id, 'slow-before-clear');
    expect(late.update.status).toBe('superseded');
    expect(late.detail.displays[0].view).toBeNull();
    expect(late.detail.displays[0].revision).toBe(afterClear.displays[0].revision);
  });

  it('deduplicates identical retries while refusing a request-ID payload conflict', async () => {
    const first = await submit('retry', 'Same source'); await interpreter.waitFor(1);
    const retry = await submit('retry', 'Same source');
    expect(retry.id).toBe(first.id);
    expect(interpreter.calls).toHaveLength(1);
    denied(await browser.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'retry', displayIds: [display.id], data: { text: 'Different source' } }), [409]);
    denied(await browser.request('POST', `/api/sessions/${session.id}/clear`, { requestId: 'retry', displayIds: [display.id] }), [409]);
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Same source') });
    const result = await browser.settle(session.id, 'retry');
    expect(result.detail.updates.filter(item => item.requestId === 'retry')).toHaveLength(1);
    expect(result.detail.displays[0].view?.data.text).toBe('Same source');
  });

  it('holds an existing view through delayed completion and does not replay discarded work on release', async () => {
    await submit('seed', 'Retained view'); await interpreter.waitFor(1);
    interpreter.calls[0].resolve({ action: 'replace', view: fact('Retained view') });
    await browser.settle(session.id, 'seed');
    await submit('in-flight', 'Delayed replacement'); await interpreter.waitFor(2);
    const current = (await browser.detail(session.id)).displays[0];
    success(await browser.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}`, { held: true, expectedRevision: current.revision }));
    interpreter.calls[1].resolve({ action: 'replace', view: fact('Delayed replacement') });
    const blocked = await browser.settle(session.id, 'in-flight');
    expect(['held', 'superseded']).toContain(blocked.update.status);
    expect(blocked.detail.displays[0].view?.data.text).toBe('Retained view');
    expect(blocked.detail.displays[0].held).toBe(true);
    const held = await submit('submitted-while-held', 'No automatic replay');
    expect(held.status).toBe('held');
    expect(interpreter.calls).toHaveLength(2);
    const holding = (await browser.detail(session.id)).displays[0];
    success(await browser.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}`, { held: false, expectedRevision: holding.revision }));
    const released = await browser.detail(session.id);
    expect(released.displays[0].held).toBe(false);
    expect(released.displays[0].view?.data.text).toBe('Retained view');
    expect(interpreter.calls).toHaveLength(2);
  });

  it('does not expose a private adapter error or claim delivery on render failure', async () => {
    const privateMarker = 'synthetic-private-diagnostic-must-not-be-public';
    await submit('failing', 'Input'); await interpreter.waitFor(1);
    interpreter.calls[0].reject(new Error(privateMarker));
    const failed = await browser.settle(session.id, 'failing');
    expect(failed.update.status).toBe('failed');
    expect(failed.detail.displays[0].view).toBeNull();
    expect(JSON.stringify(failed.detail).includes(privateMarker)).toBe(false);
    expect(failed.update.error?.length).toBeLessThan(500);
  });

  it('rejects completion from a publisher whose session access was revoked while rendering', async () => {
    const editor = await h.account();
    success(await browser.request('POST', `/api/sessions/${session.id}/members`, { username: editor.user!.username, role: 'editor' }));
    success(await editor.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'revoked-in-flight', displayIds: [display.id], data: { text: 'No longer authorized' } }));
    await interpreter.waitFor(1);
    success(await browser.request('DELETE', `/api/sessions/${session.id}/members/${editor.user!.id}`));
    interpreter.calls[0].resolve({ action: 'replace', view: fact('No longer authorized') });
    const result = await browser.settle(session.id, 'revoked-in-flight');
    expect(['superseded', 'failed']).toContain(result.update.status);
    expect(result.detail.displays[0].view).toBeNull();
  });

  it('keeps unrelated session data and browser authentication out of the interpreter input', async () => {
    const other = await browser.session('Unrelated session');
    const allowed = success(await browser.request<DatasetRecord>('POST', `/api/sessions/${session.id}/datasets`, { name: 'Allowed', rows: [{ value: 1 }] }));
    const excluded = success(await browser.request<DatasetRecord>('POST', `/api/sessions/${other.id}/datasets`, { name: 'Unrelated', rows: [{ privateValue: 'other-session-marker' }] }));
    success(await browser.request('POST', `/api/sessions/${session.id}/submit`, { requestId: 'scoped-input', displayIds: [display.id], datasetId: allowed.id, templateHint: 'number' }));
    await interpreter.waitFor(1);
    const input = interpreter.calls[0].input, serialized = JSON.stringify(input);
    expect(input.submission.sessionId).toBe(session.id);
    expect(input.display).toMatchObject({ width: display.width, height: display.height });
    expect(input.datasets.some(item => item.id === allowed.id)).toBe(true);
    expect(input.datasets.some(item => item.id === excluded.id)).toBe(false);
    expect(serialized.includes('other-session-marker')).toBe(false);
    expect(serialized.includes(browser.csrf!)).toBe(false);
    expect([...browser.cookies.values()].some(value => serialized.includes(value))).toBe(false);
    interpreter.calls[0].resolve({ action: 'retain' });
    await browser.settle(session.id, 'scoped-input');
  });
});

describe('revisioned collaboration and independent screens', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('accepts exactly one concurrent shared edit and rejects stale overwrite', async () => {
    const owner = await h.account(), editor = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: editor.user!.username, role: 'editor' }));
    const view: ViewSpec = { version: 1, template: 'checklist', data: { items: [{ id: 'check', text: 'Confirm evidence', checked: false }] } };
    const seeded = await owner.submit(session.id, [display.id], view), revision = seeded.detail.displays[0].revision;
    const changes = [
      { items: [{ id: 'check', text: 'Owner edit', checked: true }] },
      { items: [{ id: 'check', text: 'Collaborator edit', checked: false }] },
    ];
    const responses = await Promise.all([owner, editor].map((browser, index) => browser.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}/view`, { expectedRevision: revision, data: changes[index] })));
    expect(responses.filter(result => result.status >= 200 && result.status < 300)).toHaveLength(1);
    expect(responses.filter(result => result.status === 409)).toHaveLength(1);
    const winner = responses.findIndex(result => result.status < 300);
    const current = (await owner.detail(session.id)).displays[0];
    expect(current.view?.data.items).toEqual(changes[winner].items);
    expect(current.revision).toBeGreaterThan(revision);
    denied(await owner.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}/view`, { expectedRevision: revision, data: view.data }), [409]);
  });

  it('keeps content and viewport per screen while persisting shared appearance settings', async () => {
    const owner = await h.account(), session = await owner.session();
    const phone = await owner.display(session.id, 'Phone', 390, 844), wall = await owner.display(session.id, 'Room display', 1920, 1080);
    success(await owner.request('PATCH', `/api/sessions/${session.id}/config`, { expectedRevision: session.configRevision, config: { theme: 'light' } }));
    const config = (await owner.detail(session.id)).session;
    expect(config.config.theme).toBe('light');
    expect(config.config.theme).toBe('light');
    denied(await owner.request('PATCH', `/api/sessions/${session.id}/config`, { expectedRevision: session.configRevision, config: { theme: 'dark' } }), [409]);
    await owner.submit(session.id, [phone.id], fact('Phone content'), 'phone');
    await owner.submit(session.id, [wall.id], fact('Room content'), 'wall');
    success(await owner.request('PATCH', `/api/sessions/${session.id}/displays/${phone.id}`, { width: 844, height: 390, pixelRatio: 2 }));
    const detail = await owner.detail(session.id);
    expect(detail.displays.find(item => item.id === phone.id)).toMatchObject({ width: 844, height: 390, view: { data: { text: 'Phone content' } } });
    expect(detail.displays.find(item => item.id === wall.id)).toMatchObject({ width: 1920, height: 1080, view: { data: { text: 'Room content' } } });
    expect(detail.session.config.theme).toBe('light');
    expect(detail.session.configRevision).toBe(config.configRevision);
    expect(detail.updates).toHaveLength(2);
  });

  it('tracks a multi-screen update as applied only once all targeted screens acknowledge', async () => {
    const owner = await h.account(), session = await owner.session(), first = await owner.display(session.id), second = await owner.display(session.id, 'Second');
    const prepared = await owner.submit(session.id, [first.id, second.id], fact('Shared fact'), 'multi-screen');
    expect(prepared.update.status).toBe('prepared');
    const firstRevision = prepared.detail.displays.find(item => item.id === first.id)!.revision;
    const secondRevision = prepared.detail.displays.find(item => item.id === second.id)!.revision;
    success(await owner.request('POST', `/api/sessions/${session.id}/displays/${first.id}/applied`, { revision: firstRevision }));
    expect((await owner.detail(session.id)).updates.find(item => item.requestId === 'multi-screen')!.status).toBe('prepared');
    success(await owner.request('POST', `/api/sessions/${session.id}/displays/${second.id}/applied`, { revision: secondRevision }));
    expect((await owner.detail(session.id)).updates.find(item => item.requestId === 'multi-screen')!.status).toBe('applied');
  });
});
