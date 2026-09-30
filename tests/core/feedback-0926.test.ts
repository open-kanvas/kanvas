import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, success, fact, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { toolFailure, toolSuccess } from '../../src/server/mcp/results.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { OPERATION_ENTRIES } from '../../src/server/mcp/operations.js';
import { AppError } from '../../src/server/store.js';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';

describe('September 26 feedback round', () => {
  let h: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
  const path = (id = displayId) => `/api/sessions/${sessionId}/displays/${id}`;
  beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
  afterEach(async () => { await h?.close(); });

  it('replace_data works on every template and validation errors always carry issues', async () => {
    const chart = { version: 1, template: 'chart', data: { kind: 'line', series: [{ name: 'Observed', points: [{ x: '2026-01-01', y: 2 }] }] } } as ViewSpec;
    const revision = (await owner.submit(sessionId, [displayId], chart)).detail.displays[0].revision;
    const edited = await call('kanvas_display_edit', { sessionId, displayId, expectedRevision: revision, data: { kind: 'line', series: [{ name: 'Observed', points: [{ x: '2026-01-01', y: 5 }] }] } });
    expect(edited.revision).toBe(revision + 1);
    expect((await owner.detail(sessionId)).displays[0].view?.data).toMatchObject({ series: [{ points: [{ y: 5 }] }] });
    const invalid = await call('kanvas_display_edit', { sessionId, displayId, expectedRevision: revision + 1, data: { kind: 'line' } }).catch(error => error);
    expect(invalid).toMatchObject({ code: 'INVALID_ARGUMENT' }); expect(invalid.issues.length).toBeGreaterThan(0);
    const mapped = toolFailure(new AppError('SOME_RULE', 'Explain the rule.', 400)).structuredContent as { error: { code: string; issues: unknown[] } };
    expect(mapped.error.code).toBe('INVALID_ARGUMENT'); expect(mapped.error.issues).toEqual([{ path: 'arguments', problem: 'SOME_RULE: Explain the rule.' }]);
  });

  it('identifies displays with stable numbers without changing revisions', async () => {
    const second = await owner.display(sessionId, 'Second screen');
    const revisions = async () => Object.fromEntries((await owner.detail(sessionId)).displays.map(d => [d.id, d.revision]));
    const before = await revisions();
    const result = await call('kanvas_displays_identify', { sessionId });
    expect(result.identified.map((d: { ordinal: number }) => d.ordinal)).toEqual([1, 2]);
    expect(result.identified[1]).toMatchObject({ displayId: second.id, name: 'Second screen', online: false });
    expect(await revisions()).toEqual(before);
    await expect(call('kanvas_displays_identify', { sessionId, displayIds: ['not-in-session'] })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('names the current view on each topology display node', async () => {
    await owner.submit(sessionId, [displayId], fact('Plain fact'));
    const node = async () => (await call('kanvas_topology_read', { sessionId })).displays.find((d: { id: string }) => d.id === displayId);
    expect((await node()).view).toMatchObject({ template: 'fact', label: 'Quick Fact' });
    await owner.submit(sessionId, [displayId], { ...fact('Titled'), title: 'Morning briefing' });
    expect((await node()).view).toMatchObject({ template: 'fact', title: 'Morning briefing', label: 'Morning briefing' });
  });

  it('serves the live display grid only to a display that shows it', async () => {
    const wall = await owner.display(sessionId, 'Wall');
    await owner.submit(sessionId, [wall.id], fact('On the wall'));
    expect((await owner.request('GET', `${path()}/grid`)).status).toBe(409);
    await owner.submit(sessionId, [displayId], { version: 1, template: 'display-grid', data: {} } as ViewSpec);
    const grid = success(await owner.request<{ tiles: unknown[]; total: number }>('GET', `${path()}/grid`));
    expect(grid.total).toBe(2);
    expect(grid.tiles).toEqual([expect.objectContaining({ displayId: wall.id, name: 'Wall', template: 'fact', online: false, view: expect.objectContaining({ data: expect.objectContaining({ text: 'On the wall' }) }) })]);
  });

  it('keeps pending pairing requests open for one hour without granting access', () => {
    expect(ACCESS_LIMITS.pairingMs).toBe(60 * 60_000);
    expect(ACCESS_LIMITS.pairedBrowserMs).toBe(7 * 86400_000);
  });

  it('keeps devices.read truthful, live-embed checks scoped, and the static demo retired', async () => {
    const devices = await call('kanvas_devices_read', {});
    expect(devices.devices).toEqual([]); expect(devices.publishRecipe).toBeUndefined();
    const revision = (await owner.submit(sessionId, [displayId], fact('Not a web page'))).detail.displays[0].revision;
    expect((await owner.request('POST', `${path()}/web-embed`, { expectedRevision: revision })).status).toBe(404);
    expect(canonicalToolDefinitions().some(tool => tool.name.startsWith('kanvas_demo'))).toBe(false);
    expect(OPERATION_ENTRIES.some(entry => entry.operation.startsWith('demo.'))).toBe(false);
  });

  it('lists ended sessions too, so the account can still find them (fixes sessions.list dropping ended sessions)', async () => {
    const gone = await owner.session('Gone');
    await h.runtime.service.execute('kanvas_session_end', { sessionId: gone.id }, p);
    const listed = (await h.runtime.service.sessions(p));
    expect(listed.find(session => session.id === gone.id)).toMatchObject({ role: 'owner', endedAt: expect.any(String) });
    expect(listed.find(session => session.id === sessionId)).toMatchObject({ role: 'owner' });
    expect(listed.find(session => session.id === sessionId)?.endedAt).toBeUndefined();
  });
});
