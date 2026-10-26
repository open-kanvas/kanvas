import { operationRequest } from './requests.js';
import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { legacySelectedCode } from '../core/legacy-oauth-fixture.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hash, type OAuthRefreshCredential, type Token } from '../../src/server/auth.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';
import { OPERATION_ENTRIES } from '../../src/server/mcp/operations.js';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import type { DiagnosticRecord, ReportPage, ReportRecord } from '../../src/shared/reports.js';
import type { DisplayRecord, InteractionRecord, SessionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { ControlledInterpreter, ORIGIN, PNG, denied, fact, startHarness, success, type Browser, type Harness } from '../core/harness.js';

// These are real loopback HTTP servers, SQLite stores, accounts and published
// SDKs. Credentials exist only in memory; wire observation retains public
// protocol metadata, never headers, request bodies, source text or bearers.
const ERAS = ['modern', 'legacy'] as const;
type Era = typeof ERAS[number];
const TOOLS = DISCOVERY_TOOL_NAMES;
const CALLBACK = 'http://127.0.0.1:41357/callback';
const RESOURCE = `${ORIGIN}/mcp`;
interface WireItem { method?: string; uri?: string; subscriptionId?: string | number }
type Peer = { era: 'modern'; client: Client; transport: StreamableHTTPClientTransport; wire: WireItem[] }
  | { era: 'legacy'; client: LegacyClient; transport: LegacyTransport; wire: WireItem[] };
interface ToolResult { isError?: boolean; structuredContent: Record<string, unknown> }
interface Failure { code: string; diagnosticId?: string }
const harnesses: Harness[] = [];
const clients = new Set<Client | LegacyClient>();
const subscriptions = new Set<() => Promise<void>>();

afterEach(async () => {
  await Promise.allSettled([...subscriptions].map(close => close())); subscriptions.clear();
  await Promise.allSettled([...clients].map(client => client.close())); clients.clear();
  for (const h of harnesses.reverse()) await h.close(); harnesses.length = 0;
  vi.restoreAllMocks();
});

async function server(options: Parameters<typeof startHarness>[0] = {}) {
  const h = await startHarness({ mcpProfile: 'twelve', ...options }); harnesses.push(h); return h;
}
function observe(wire: WireItem[]): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) return response;
    let buffer = ''; const decoder = new TextDecoder();
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          for (const line of frame.split('\n')) if (line.startsWith('data: ')) {
            try {
              const message = JSON.parse(line.slice(6));
              if (wire.length < 256) wire.push({ method: message.method, uri: message.params?.uri, subscriptionId: message.params?._meta?.['io.modelcontextprotocol/subscriptionId'] });
            } catch { /* Legacy SSE priming frames have no JSON payload. */ }
          }
        }
        controller.enqueue(chunk);
      },
    }));
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
async function connect(h: Harness, era: Era, bearer: string): Promise<Peer> {
  const wire: WireItem[] = [], url = new URL('/mcp', h.baseUrl);
  const options = { requestInit: { headers: { Authorization: `Bearer ${bearer}` } }, fetch: observe(wire) };
  if (era === 'modern') {
    const client = new Client({ name: 'twelve-real-modern', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
    const transport = new StreamableHTTPClientTransport(url, options);
    client.onerror = () => {}; clients.add(client); await client.connect(transport);
    expect(transport.protocolVersion).toBe('2026-07-28'); return { era, client, transport, wire };
  }
  const client = new LegacyClient({ name: 'twelve-real-legacy', version: '1' });
  const transport = new LegacyTransport(url, options);
  client.onerror = () => {}; clients.add(client); await client.connect(transport);
  expect(Boolean(transport.sessionId)).toBe(true); return { era, client, transport, wire };
}
async function disconnect(peer: Peer) { await peer.client.close(); clients.delete(peer.client); }
async function grant(h: Harness, browser: Browser, scopes = ['read', 'publish'], sessionIds?: string[]) {
  return (await h.runtime.auth.issueToken(browser.user!.id, 'Disposable HTTP acceptance connection', scopes, sessionIds));
}
function call(peer: Peer, name: string, operation: string, args: Record<string, unknown> = {}) {
  return peer.client.callTool(operationRequest({ name, arguments: { operation, ...args } }));
}
function toolResult(value: unknown): ToolResult {
  // Both SDKs also type task/deferred variants. This application returns an
  // immediate structured tool envelope even when domain rendering is queued.
  if (!value || typeof value !== 'object' || !('structuredContent' in value)
    || !value.structuredContent || typeof value.structuredContent !== 'object' || Array.isArray(value.structuredContent)
    || ('isError' in value && value.isError !== undefined && typeof value.isError !== 'boolean')) {
    throw new Error('Expected an immediate structured MCP tool result.');
  }
  return value as ToolResult;
}
function data<T>(value: unknown): T {
  const result = toolResult(value), error = result.structuredContent.error;
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  expect(result.isError, code).not.toBe(true);
  expect('data' in result.structuredContent).toBe(true);
  return result.structuredContent.data as T;
}
function failure(value: unknown, codes = ['FORBIDDEN', 'NOT_FOUND']): Failure {
  const result = toolResult(value);
  expect(result.isError).toBe(true);
  const error = result.structuredContent.error;
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') throw new Error('Expected a bounded public tool error.');
  expect(codes).toContain(error.code);
  return { code: error.code, ...('diagnosticId' in error && typeof error.diagnosticId === 'string' ? { diagnosticId: error.diagnosticId } : {}) };
}
async function rejected(work: () => Promise<unknown>) {
  let didReject = false;
  try { await work(); } catch { didReject = true; }
  // Do not print transport errors: an SDK error can retain request metadata.
  expect(didReject, 'The authenticated HTTP/resource request must be rejected').toBe(true);
}
async function resource<T>(peer: Peer, uri: string): Promise<T> {
  const result = await peer.client.readResource({ uri });
  expect(result.contents).toHaveLength(1);
  const content = result.contents[0]; expect('text' in content).toBe(true);
  return JSON.parse((content as { text: string }).text) as T;
}
async function terminal(peer: Peer, sessionId: string, requestId: string): Promise<UpdateRecord> {
  let update: UpdateRecord | undefined;
  await vi.waitFor(async () => {
    update = data<UpdateRecord>(await call(peer, 'kanvas_inspect', 'update.status', { sessionId, requestId }));
    expect(['accepted', 'rendering']).not.toContain(update.status);
  }, { timeout: 4000, interval: 10 });
  return update!;
}
async function publish(peer: Peer, sessionId: string, displayId: string, view: ViewSpec, requestId = randomUUID()) {
  const accepted = data<UpdateRecord>(await call(peer, 'kanvas_publish', 'show', { sessionId, displayIds: [displayId], requestId, view }));
  expect(accepted.status).toBe('accepted');
  const update = await terminal(peer, sessionId, requestId); expect(update.status, update.errorCode).toBe('prepared');
  return update;
}
async function subscribe(peer: Peer, uris: string[], notices: string[]) {
  let close: () => Promise<void>;
  if (peer.era === 'modern') {
    peer.client.setNotificationHandler('notifications/resources/updated', note => { notices.push(note.params.uri); });
    const wireStart = peer.wire.length;
    const subscription = await peer.client.listen({ resourceSubscriptions: uris, resourcesListChanged: true, toolsListChanged: true });
    expect(subscription.honoredFilter.resourceSubscriptions).toEqual(uris);
    expect(subscription.honoredFilter.toolsListChanged).toBeUndefined();
    const first = peer.wire[wireStart]; expect(first?.method).toBe('notifications/subscriptions/acknowledged');
    expect(first.subscriptionId).toBeDefined();
    close = async () => { await subscription.close(); expect(await subscription.closed).toBe('local'); };
  } else {
    expect(peer.client.getServerCapabilities()?.resources?.subscribe).toBe(true);
    peer.client.setNotificationHandler(ResourceUpdatedNotificationSchema, note => { notices.push(note.params.uri); });
    for (const uri of uris) await peer.client.subscribeResource({ uri });
    close = async () => { for (const uri of uris) await peer.client.unsubscribeResource({ uri }); };
  }
  subscriptions.add(close);
  return async () => { subscriptions.delete(close); await close(); };
}
const inbox = (peer: Peer, sessionId: string) => call(peer, 'kanvas_inspect', 'interactions.read', { sessionId }).then(result => data<{ interactions: InteractionRecord[] }>(result));
const click = (browser: Browser, sessionId: string, displayId: string, revision: number, requestId = randomUUID()) => browser.request<InteractionRecord>('POST', `/api/sessions/${sessionId}/interactions`, { displayId, revision, actionId: 'next', value: true, requestId }).then(success);

describe.each(ERAS)('twelve profile on the real %s SDK and application', era => {
  it.each(['twelve', 'legacy'] as const)('keeps failed inspect calls read-only through the %s HTTP profile', async profile => {
    const h = await server({ mcpProfile: profile }), owner = await h.account(), session = await owner.session();
    const peer = await connect(h, era, (await grant(h, owner, ['read'], [session.id])).value);
    const failureRecorder = vi.spyOn(h.runtime.service, 'recordFailure');
    // Authentication may update only token.lastUsedAt. Hash all other saved
    // values so a failing assertion cannot print test credentials or contents.
    const snapshot = async () => createHash('sha256').update(JSON.stringify({
      documents: (await h.runtime.store.db.prepare('SELECT kind,id,session_id,value FROM documents ORDER BY kind,id').all()).map(row => {
        const value = JSON.parse(String(row.value));
        if (row.kind === 'token') delete value.lastUsedAt;
        return { ...row, value };
      }),
      requests: (await h.runtime.store.db.prepare('SELECT * FROM requests ORDER BY session_id,principal,request_id').all()),
      members: (await h.runtime.store.db.prepare('SELECT * FROM members ORDER BY session_id,user_id').all()),
      assets: (await h.runtime.store.db.prepare("SELECT id,encode(bytes,'hex') AS bytes FROM assets ORDER BY id").all()),
    })).digest('hex');
    const before = (await snapshot());
    for (const entry of OPERATION_ENTRIES.filter(entry => entry.tool === 'kanvas_inspect' && !['kanvas_help','kanvas_guide','kanvas_template_get'].includes(entry.canonical))) {
      const args = { sessionId: session.id, unrecognizedField: 'Not stored as diagnostic material' };
      const result = profile === 'twelve'
        ? await call(peer, entry.tool, entry.operation, args)
        : await peer.client.callTool(operationRequest({ name: entry.canonical, arguments: args }));
      expect(failure(result, ['INVALID_ARGUMENT']).diagnosticId).toBeUndefined();
      expect((await snapshot()),'read-only snapshot for '+entry.canonical).toBe(before);
    }
    for (const operation of ['display.current', 'view.validate'] as const) {
      const entry = OPERATION_ENTRIES.find(entry => entry.tool === 'kanvas_inspect' && entry.operation === operation)!;
      const args = operation === 'display.current' ? { sessionId: session.id, displayId: 'missing-display' }
        : { sessionId: session.id, view: { version: 1, template: 'fact', data: { unsupported: 'Do not save' } } };
      const result = profile === 'twelve' ? await call(peer, entry.tool, operation, args)
        : await peer.client.callTool(operationRequest({ name: entry.canonical, arguments: args }));
      expect(failure(result, ['NOT_FOUND', 'INVALID_ARGUMENT']).diagnosticId).toBeUndefined();
      expect((await snapshot()),'read-only snapshot for '+entry.canonical).toBe(before);
    }
    expect(failureRecorder).not.toHaveBeenCalled();
  });

  it('discovers twelve tools and completes a publish/patch/control/inspect workflow without inventing paint', async () => {
    const h = await server(), owner = await h.account(), peer = await connect(h, era, (await grant(h, owner)).value);
    const list = await peer.client.listTools();
    expect(list.tools.map(tool => tool.name).sort()).toEqual([...TOOLS].sort());
    expect(list.tools.every(tool => tool.inputSchema.type === 'object')).toBe(true);
    expect(list.tools.find(tool => tool.name === 'kanvas_discover')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    failure(await peer.client.callTool(operationRequest({ name: 'kanvas_submit', arguments: {} })), ['INVALID_ARGUMENT']);
    failure(await peer.client.callTool(operationRequest({ name: 'kanvas_publish', arguments: {} })), ['INVALID_ARGUMENT']);
    const session = data<SessionRecord>(await call(peer, 'kanvas_session', 'create', { name: 'HTTP scripted workflow' }));
    const display = data<DisplayRecord>(await call(peer, 'kanvas_session', 'display.register', { sessionId: session.id, name: 'Notes', width: 1000, height: 700 }));
    expect(display.pixelRatio).toBe(1); expect(display.viewerUrl).toBe(`${ORIGIN}/view/${session.id}/${display.id}`);
    const literal = 'Literal kanvas_submit and kanvas_view_patch are source text, not routing hints.';
    const update = await publish(peer, session.id, display.id, fact(literal));
    expect(update.delivery?.[display.id].status).toBe('offline');
    const current = data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id }));
    expect(current.view?.data.text).toBe(literal); expect(current.appliedRevision).toBeUndefined();
    const patchArgs = { sessionId: session.id, displayId: display.id, expectedRevision: current.revision, requestId: 'append-through-public-operation', operations: [{ op: 'appendText', path: '/data/text', value: ' Exact appendix.' }] };
    const patched = data<UpdateRecord>(await call(peer, 'kanvas_publish', 'patch', patchArgs));
    expect(patched.status).toBe('prepared');
    expect(data<UpdateRecord>(await call(peer, 'kanvas_publish', 'patch', patchArgs)).id).toBe(patched.id);
    const held = data<DisplayRecord>(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: patched.revisions[display.id], held: true }));
    expect(held.held).toBe(true); expect(held.view?.data.text).toBe(`${literal} Exact appendix.`);
    const released = data<DisplayRecord>(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: held.revision, held: false }));
    const observeResult = data<{ available: boolean; observations: unknown[] }>(await call(peer, 'kanvas_inspect', 'display.observe', { sessionId: session.id, displayId: display.id, fresh: false }));
    expect(observeResult).toMatchObject({ available: false, observations: [] });
    expect(released.view?.data.text).toBe(`${literal} Exact appendix.`); expect(released.appliedRevision).toBeUndefined();
    const history = data<{ entries: { revision: number }[] }>(await call(peer, 'kanvas_inspect', 'display.history', { sessionId: session.id, displayId: display.id }));
    expect(history.entries.map(entry => entry.revision)).toContain(patched.revisions[display.id]);
    // This is an explicit authorized HTTP browser acknowledgement, not a claim
    // that this suite launches Chromium or verifies a human's physical screen.
    success(await owner.request('POST', `/api/sessions/${session.id}/displays/${display.id}/applied`, { revision: released.revision }));
    expect(data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id })).appliedRevision).toBe(released.revision);
  });

  it('enforces roles, read scope and selected-session grants per operation, not per umbrella annotation', async () => {
    const h = await server(), owner = await h.account(), editor = await h.account(), viewer = await h.account(), outsider = await h.account();
    const session = await owner.session(), other = await owner.session('Outside selected grant'), display = await owner.display(session.id);
    const ownerPeer = await connect(h, era, (await grant(h, owner)).value);
    for (const [browser, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) data(await call(ownerPeer, 'kanvas_access', 'member.add', { sessionId: session.id, username: browser.user!.username, role }));
    const editorPeer = await connect(h, era, (await grant(h, editor)).value), viewerPeer = await connect(h, era, (await grant(h, viewer)).value);
    const readPeer = await connect(h, era, (await grant(h, owner, ['read'])).value), selectedPeer = await connect(h, era, (await grant(h, owner, ['read', 'publish'], [session.id])).value);
    const wrongPeer = await connect(h, era, (await grant(h, owner, ['read', 'publish'], [other.id])).value), outsiderPeer = await connect(h, era, (await grant(h, outsider)).value);
    for (const peer of [ownerPeer, editorPeer, viewerPeer, readPeer, selectedPeer]) data(await call(peer, 'kanvas_inspect', 'session.state', { sessionId: session.id }));
    for (const peer of [wrongPeer, outsiderPeer]) {
      failure(await call(peer, 'kanvas_inspect', 'session.state', { sessionId: session.id }));
      failure(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, width: 900 }));
    }
    data(await call(ownerPeer, 'kanvas_inspect', 'pairings.read', { sessionId: session.id }));
    data(await call(selectedPeer, 'kanvas_inspect', 'pairings.read', { sessionId: session.id }));
    for (const peer of [editorPeer, viewerPeer, readPeer]) failure(await call(peer, 'kanvas_inspect', 'pairings.read', { sessionId: session.id }));
    data(await call(editorPeer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 0, config: { theme: 'light' } }));
    for (const peer of [viewerPeer, readPeer, wrongPeer, outsiderPeer]) failure(await call(peer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 1, config: { theme: 'dark' } }));
    for (const peer of [viewerPeer, readPeer]) {
      const resized = data<DisplayRecord>(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, width: 900 }));
      expect(resized.revision).toBe(0); expect(resized.width).toBe(900);
      failure(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: 0, held: true }));
    }
    const held = data<DisplayRecord>(await call(editorPeer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: 0, held: true }));
    expect(held.held).toBe(true);
    data(await call(editorPeer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: held.revision, held: false }));
    data(await call(ownerPeer, 'kanvas_configure', 'preferences.update', { expectedRevision: 0, config: { readingFontSize:28 } }));
    failure(await call(readPeer, 'kanvas_configure', 'preferences.update', { expectedRevision: 1, config: { readingFontSize:22 } }));
    failure(await call(selectedPeer, 'kanvas_configure', 'preferences.update', { expectedRevision: 1, config: { readingFontSize:22 } }));
    failure(await call(selectedPeer, 'kanvas_inspect', 'preferences.get'));
    failure(await call(selectedPeer, 'kanvas_session', 'create', { name: 'Cannot widen selected authorization' }));
    const reportArgs = { sessionId: session.id, requestId: 'viewer-product-report', title: 'Viewer feedback', description: 'A report is not a request to grant access.' };
    const report = data<ReportRecord>(await call(viewerPeer, 'kanvas_feedback', 'submit', reportArgs));
    expect(report.authorId).toBe(viewer.user!.id);
    failure(await call(readPeer, 'kanvas_feedback', 'submit', { ...reportArgs, requestId: 'read-scope-product-report' }));
    for (const peer of [editorPeer, viewerPeer, readPeer]) failure(await call(peer, 'kanvas_feedback', 'report.update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'investigating', note: 'Review requires an owner with publish scope.' }));
    const reviewed = data<ReportRecord>(await call(ownerPeer, 'kanvas_feedback', 'report.update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'investigating', note: 'Owner recorded a review, not a verified fix.' }));
    expect(reviewed.revision).toBe(1); expect((await inbox(ownerPeer, session.id)).interactions).toEqual([]);
    expect((await owner.detail(session.id)).session.config.theme).toBe('light');
  });

  it('requires explicit owner consent for browser access and never turns a locator or report into a grant', async () => {
    const h = await server(), owner = await h.account(), editor = await h.account(), session = await owner.session();
    const display = await owner.display(session.id), privateDisplay = await owner.display(session.id, 'Not shared');
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: editor.user!.username, role: 'editor' }));
    const ownerPeer = await connect(h, era, (await grant(h, owner)).value), editorPeer = await connect(h, era, (await grant(h, editor)).value), readPeer = await connect(h, era, (await grant(h, owner, ['read'])).value);
    data(await call(readPeer, 'kanvas_session', 'address.get', { sessionId: session.id, displayId: display.id }));
    const guest = h.browser(); denied(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`), [401]);
    const shareArgs = { sessionId: session.id, displayId: display.id, allowInteraction: true, requestId: 'explicit-owner-invitation' };
    for (const peer of [editorPeer, readPeer]) failure(await call(peer, 'kanvas_access', 'share.create', shareArgs));
    const share = data<{ id: string; url: string; update?: unknown }>(await call(ownerPeer, 'kanvas_access', 'share.create', shareArgs));
    expect(share.update).toBeUndefined(); expect((await owner.detail(session.id)).displays.every(item => item.view === null)).toBe(true);
    const pair = success(await guest.request<{ id: string; status: string }>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Explicitly confirmed test browser', requestedInteractive: true }));
    expect(pair.status).toBe('pending');
    const pairs = data<Record<string, unknown>[]>(await call(ownerPeer, 'kanvas_inspect', 'pairings.read', { sessionId: session.id }));
    expect(pairs.map(item => item.id)).toContain(pair.id);
    expect(pairs.every(item => !('proofHash' in item) && !('browserSessionId' in item))).toBe(true);
    const decision = { sessionId: session.id, pairingId: pair.id, approve: true, interactive: true };
    failure(await call(ownerPeer, 'kanvas_access', 'pairing.decide', decision), ['INVALID_ARGUMENT']);
    failure(await call(ownerPeer, 'kanvas_access', 'pairing.decide', { ...decision, confirm: false }), ['INVALID_ARGUMENT']);
    for (const peer of [editorPeer, readPeer]) failure(await call(peer, 'kanvas_access', 'pairing.decide', { ...decision, confirm: true }));
    expect(success(await guest.request<{ status: string }>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('pending');
    denied(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`), [401]);
    expect(data<{ status: string }>(await call(ownerPeer, 'kanvas_access', 'pairing.decide', { ...decision, confirm: true })).status).toBe('approved');
    expect(success(await guest.request<{ status: string }>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('approved');
    const me = success(await guest.request<{ csrfToken: string; user: { id: string } }>('GET', '/api/auth/me')); guest.csrf = me.csrfToken;
    expect(me.user.id).toBe(`pairing:${pair.id}`);
    success(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`));
    denied(await guest.request('GET', `/api/sessions/${session.id}?displayId=${privateDisplay.id}`));
    denied(await guest.request('POST', `/api/sessions/${session.id}/feedback`, { requestId: 'paired-browser-feedback', title: 'Cannot mint account rights', description: 'This paired browser is not a full account.' }));
    success(await owner.request('DELETE', `/api/pairings/${pair.id}`));
    denied(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`), [401]);
  });

  it('recovers from the reported agent inputs without losing consent, source text or retry protection', async () => {
    const h = await server(), owner = await h.account(), session = await owner.session();
    const peer = await connect(h, era, (await grant(h, owner)).value);
    const display = data<DisplayRecord>(await call(peer, 'kanvas_session', 'display.register', { sessionId: session.id, name: 'First screen' }));
    expect(display).toMatchObject({ width: 1280, height: 720 });
    expect(new URL(display.viewerUrl!).pathname).toBe(`/view/${session.id}/${display.id}`);
    const guest = h.browser(), otherBrowser = h.browser();
    const pair = success(await guest.request<{ id: string; expiresAt: string; status: string }>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id, deviceName: 'Intended screen' }));
    expect(Date.parse(pair.expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(Date.parse(pair.expiresAt) - Date.now()).toBeLessThanOrEqual(ACCESS_LIMITS.pairingMs);
    const args = { sessionId: session.id, pairingId: pair.id };
    const invalid = await call(peer, 'kanvas_access', 'pairing.decide', args);
    failure(invalid, ['INVALID_ARGUMENT']);
    expect(toolResult(invalid).structuredContent.error).toMatchObject({
      issues: [{ path: 'approve', problem: 'Required boolean (true or false); received missing.', expected:'boolean', received:'missing' }, { path: 'confirm', problem: expect.stringContaining('owner confirms') }],
      schemaTool: 'kanvas_discover', schemaArguments: {catalog:'tools',action:'get',id:'kanvas.pairing.decide'}, topic: 'tools',
    });
    denied(await guest.request('GET', `/api/sessions/${session.id}`), [401]);
    denied(await otherBrowser.request('GET', `/api/pairings/${pair.id}/status`), [401, 403, 404]);

    // A real human/tool exchange can take longer than the former two-minute
    // window. Time alone grants nothing; an explicit owner decision still does.
    const realNow = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(realNow + 3 * 60_000);
    expect(success(await guest.request<{ status: string }>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('pending');
    expect(data<{ status: string }>(await call(peer, 'kanvas_access', 'pairing.decide', { ...args, approve: true, confirm: true })).status).toBe('approved');
    expect(success(await guest.request<{ status: string }>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('approved');
    clock.mockRestore();
    guest.csrf = success(await guest.request<{ csrfToken: string }>('GET', '/api/auth/me')).csrfToken;
    success(await guest.request('PATCH', `/api/sessions/${session.id}/displays/${display.id}`, { width: 443, height: 823 }));
    expect(data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id }))).toMatchObject({ width: 443, height: 823 });
    denied(await guest.request('POST', `/api/sessions/${session.id}/feedback`, { requestId: 'guest-report', title: 'Not an account', description: 'Pairing must not create account authority.' }));

    const steps = '1. Open the intended display.\n2. Request access and confirm the intended browser.\n'.repeat(9).trim();
    const input = { sessionId: session.id, requestId: 'agent-prose-report', title: 'Reproduction from the agent', description: 'A concrete testing observation.', steps };
    const report = data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', input));
    expect(report.steps).toEqual([steps]);
    expect(data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', input)).id).toBe(report.id);
    failure(await call(peer, 'kanvas_feedback', 'error.report', { ...input, description: 'Changed content' }), ['REQUEST_ID_CONFLICT']);
    expect(data<ReportPage>(await call(peer, 'kanvas_inspect', 'reports.read', { sessionId: session.id })).reports).toHaveLength(1);
    expect((await h.runtime.store.get<ReportRecord>('report', report.id))?.steps).toEqual([steps]);

    const expires = success(await otherBrowser.request<{ id: string; expiresAt: string }>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id, deviceName: 'Never confirmed screen' }));
    const expiredClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(expires.expiresAt) + 1);
    failure(await call(peer, 'kanvas_access', 'pairing.decide', { sessionId: session.id, pairingId: expires.id, approve: true, confirm: true }), ['REQUEST_CLOSED']);
    denied(await otherBrowser.request('GET', `/api/sessions/${session.id}`), [401]);
    expiredClock.mockRestore();
  });

  it('recovers encoded mutation fields through the real SDK while retaining consent, revision checks and safe diagnostics', async () => {
    // The reported host projected non-text fields as JSON strings. Scheduling
    // is disabled here: this checks monitor creation, not an external service.
    const h = await server({ monitoringOptions: { automatic: false } }), owner = await h.account();
    const session = await owner.session(), other = await owner.session('Separate diagnostics');
    const peer = await connect(h, era, (await grant(h, owner)).value), reader = await connect(h, era, (await grant(h, owner, ['read'], [session.id])).value);
    expect(peer.client.getServerVersion()?.version).toBe(KANVAS_VERSION);
    expect(await fetch(`${h.baseUrl}/healthz`).then(response => response.json())).toMatchObject({ version: KANVAS_VERSION });
    const display = data<DisplayRecord>(await call(peer, 'kanvas_session', 'display.register', { sessionId: session.id, name: 'Encoded-input screen' }));
    const guest = h.browser(), pair = success(await guest.request<{ id: string }>('POST', '/api/pairings', { sessionId: session.id, displayId: display.id, deviceName: 'Confirmed test screen' }));
    const decision = { sessionId: session.id, pairingId: pair.id, approve: 'true' };
    const invalid = await call(peer, 'kanvas_access', 'pairing.decide', { ...decision, confirm: 'yes' });
    const invalidId = failure(invalid, ['INVALID_ARGUMENT']).diagnosticId;
    expect(invalidId).toBeDefined();
    expect(toolResult(invalid).structuredContent.server).toMatchObject({ version: KANVAS_VERSION, profile: 'discovery', tools: 2, operations: OPERATION_ENTRIES.length - 3 });
    expect((invalid.content as Array<{ text?: string }>)[0].text).toContain('confirm');
    expect((invalid.content as Array<{ text?: string }>)[0].text).toContain('session.state');
    failure(await call(reader, 'kanvas_access', 'pairing.decide', { ...decision, confirm: 'true' }));
    expect(success(await guest.request<{ status: string }>('GET', `/api/pairings/${pair.id}/status`)).status).toBe('pending');
    expect(data<{ status: string }>(await call(peer, 'kanvas_access', 'pairing.decide', { ...decision, confirm: 'true', interactive: 'false' })).status).toBe('approved');
    success(await guest.request('GET', `/api/pairings/${pair.id}/status`));
    guest.csrf = success(await guest.request<{ csrfToken: string }>('GET', '/api/auth/me')).csrfToken;

    const source = 'Exact source: 1.2300 and 9007199254740993; do not log this prose.';
    const showArgs = { sessionId: session.id, requestId: 'encoded-fact', displayIds: JSON.stringify([display.id]), view: JSON.stringify(fact(source)) };
    const submitted = data<UpdateRecord>(await call(peer, 'kanvas_publish', 'show', showArgs));
    expect((await terminal(peer, session.id, showArgs.requestId)).status).toBe('prepared');
    expect(data<UpdateRecord>(await call(peer, 'kanvas_publish', 'show', { ...showArgs, displayIds: [display.id], view: fact(source) })).id).toBe(submitted.id);
    failure(await call(reader, 'kanvas_publish', 'show', { ...showArgs, requestId: 'read-grant-must-not-publish' }));
    const current = data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id }));
    expect(current.view?.data.text).toBe(source);
    const held = data<DisplayRecord>(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: String(current.revision), held: 'true' }));
    failure(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: String(current.revision), held: 'false' }), ['REVISION_CONFLICT']);
    const released = data<DisplayRecord>(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, expectedRevision: String(held.revision), held: 'false' }));
    expect(released.held).toBe(false); expect(released.view?.data.text).toBe(source);
    data(await call(peer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: '0', config: '{"theme":"light"}' }));
    expect((await owner.detail(session.id)).session).toMatchObject({ config: { theme: 'light' }, configRevision: 1 });
    failure(await call(peer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: '0', config: '{"theme":"dark"}' }), ['REVISION_CONFLICT']);
    const deck = data<{ id: string; slides: ViewSpec[] }>(await call(peer, 'kanvas_control', 'presentation.create', { sessionId: session.id, name: 'Encoded deck', slides: JSON.stringify([fact(source)]) }));
    expect(deck.slides[0].data.text).toBe(source);
    const monitorDisplay = await owner.display(session.id, 'Explicit source job');
    const startArgs = { sessionId: session.id, displayId: monitorDisplay.id, requestId: 'encoded-monitor', expectedRevision: '0', config: JSON.stringify({ mode: 'uptime', url: 'https://status.example.org/health', intervalSeconds: 60, durationSeconds: 300 }) };
    const job = data<{ id: string; version: number; status: string }>(await call(peer, 'kanvas_monitor', 'start', startArgs));
    expect(job.status).toBe('active');
    expect(data<{ id: string }>(await call(peer, 'kanvas_monitor', 'start', startArgs)).id).toBe(job.id);
    data(await call(peer, 'kanvas_monitor', 'stop', { sessionId: session.id, jobId: job.id, requestId: 'stop-encoded-monitor', expectedVersion: String(job.version) }));

    type Recovery = { recentDiagnostics: { diagnosticId: string; tool: string; operation: string; code: string; issues?: { path: string }[] }[] };
    const result = await call(reader, 'kanvas_inspect', 'session.state', { sessionId: session.id });
    expect(toolResult(result).structuredContent.server).toMatchObject({ version: KANVAS_VERSION, tools: 2, operations: OPERATION_ENTRIES.length - 3 });
    const diagnostics = data<Recovery>(result).recentDiagnostics;
    expect(diagnostics.find(item => item.diagnosticId === invalidId)).toMatchObject({ tool: 'kanvas_call', operation: 'kanvas.pairing.decide', code: 'INVALID_ARGUMENT', issues: [{ path: 'confirm' }] });
    expect(diagnostics.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(diagnostics)).not.toContain(source);
    expect(data<Recovery>(await call(peer, 'kanvas_inspect', 'session.state', { sessionId: other.id })).recentDiagnostics).toEqual([]);
    failure(await call(reader, 'kanvas_inspect', 'session.state', { sessionId: other.id }));
    expect(success(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`))).not.toHaveProperty('recentDiagnostics');
    // Diagnostic IDs are useful in a report, but the original arguments remain
    // absent. A JSON-looking prose field is still literal source text.
    const steps = '["These are literal reproduction notes, not nested arguments"]';
    const reportArgs = { sessionId: session.id, requestId: 'encoded-recovery-report', title: 'Wire recovery', description: source, diagnosticId: invalidId, steps };
    const report = data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', reportArgs));
    expect(report.steps).toEqual([steps]);
    expect(data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', reportArgs)).id).toBe(report.id);
    expect(data<ReportPage>(await call(peer, 'kanvas_inspect', 'reports.read', { sessionId: session.id })).reports).toHaveLength(1);
    success(await owner.request('DELETE', `/api/pairings/${pair.id}`));
    denied(await guest.request('GET', `/api/sessions/${session.id}?displayId=${display.id}`), [401]);
  });

  it('subscribes and reconnects to config/inbox/reports while reads stay unacknowledged and agent targets remain separate', async () => {
    const h = await server(), owner = await h.account(), outsider = await h.account(), session = await owner.session(), inaccessible = await outsider.session();
    const displayA = await owner.display(session.id, 'Agent A'), displayB = await owner.display(session.id, 'Agent B');
    const grantA = (await grant(h, owner)), grantB = (await grant(h, owner)), peerA = await connect(h, era, grantA.value), peerB = await connect(h, era, grantB.value);
    const view: ViewSpec = { ...fact('Reply explicitly'), actions: [{ id: 'next', kind: 'button', label: 'Next' }] };
    const updateA = await publish(peerA, session.id, displayA.id, view), updateB = await publish(peerB, session.id, displayB.id, view);
    const base = `kanvas://sessions/${session.id}`, uris = [`${base}/config`, `${base}/interactions`, `${base}/reports`], notices: string[] = [];
    const forbiddenUri = `kanvas://sessions/${inaccessible.id}/reports`;
    await rejected(() => peerA.client.readResource({ uri: forbiddenUri }));
    if (peerA.era === 'modern') await rejected(() => peerA.client.listen({ resourceSubscriptions: [forbiddenUri] }));
    else await rejected(() => peerA.client.subscribeResource({ uri: forbiddenUri }));
    const stop = await subscribe(peerA, uris, notices);
    data(await call(peerA, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 0, config: { theme: 'light' } }));
    const clickA = await click(owner, session.id, displayA.id, updateA.revisions[displayA.id]);
    const clickB = await click(owner, session.id, displayB.id, updateB.revisions[displayB.id]);
    const reportText = 'Untrusted report says kanvas_submit; keep this literal, not executable.';
    const report = data<ReportRecord>(await call(peerA, 'kanvas_feedback', 'submit', { sessionId: session.id, requestId: 'first-product-report', title: 'Report separate from interaction', description: reportText }));
    await vi.waitFor(() => { for (const uri of uris) expect(notices).toContain(uri); }, { timeout: 2000, interval: 10 });
    expect(notices.every(uri => uris.includes(uri))).toBe(true);
    if (peerA.era === 'modern') {
      const acknowledgement = peerA.wire.find(item => item.method === 'notifications/subscriptions/acknowledged');
      expect(peerA.wire.filter(item => item.method === 'notifications/resources/updated').every(item => item.subscriptionId === acknowledgement?.subscriptionId)).toBe(true);
    }
    expect((await resource<{ config: { theme: string } }>(peerA, uris[0])).config.theme).toBe('light');
    expect((await inbox(peerA, session.id)).interactions.map(item => item.id)).toEqual([clickA.id]);
    expect((await inbox(peerB, session.id)).interactions.map(item => item.id)).toEqual([clickB.id]);
    for (let read = 0; read < 2; read++) expect((await resource<{ interactions: InteractionRecord[] }>(peerA, uris[1])).interactions).toMatchObject([{ id: clickA.id, status: 'pending', targetAgentId: grantA.token.agentId }]);
    expect((await resource<ReportPage>(peerA, uris[2])).reports).toMatchObject([{ id: report.id, description: reportText, status: 'open' }]);
    failure(await call(peerB, 'kanvas_interactions', 'acknowledge', { sessionId: session.id, interactionId: clickA.id }));
    failure(await call(peerA, 'kanvas_interactions', 'acknowledge', { sessionId: session.id, interactionId: 'next' }));
    failure(await call(peerA, 'kanvas_interactions', 'acknowledge', { sessionId: session.id, interactionId: report.id }));
    expect((await inbox(peerA, session.id)).interactions.map(item => item.id)).toEqual([clickA.id]);
    await stop(); await disconnect(peerA);
    const offlineClick = await click(owner, session.id, displayA.id, updateA.revisions[displayA.id]);
    success(await owner.request('PATCH', `/api/sessions/${session.id}/config`, { expectedRevision: 1, config: { theme: 'dark' } }));
    const offlineReport = success(await owner.request<ReportRecord>('POST', `/api/sessions/${session.id}/feedback`, { requestId: 'offline-product-report', title: 'While disconnected', description: 'Durable state must survive transport reconnect.' }));
    const reconnect = await connect(h, era, grantA.value);
    // Explicit fallback works before re-subscribing; neither protocol promises
    // to wake an idle host agent or replay every missed invalidation.
    expect((await inbox(reconnect, session.id)).interactions.map(item => item.id)).toEqual([clickA.id, offlineClick.id]);
    const reconnectStop = await subscribe(reconnect, uris, []);
    expect(await resource(reconnect, uris[0])).toMatchObject({ revision: 2, config: { theme: 'dark' } });
    expect((await resource<ReportPage>(reconnect, uris[2])).reports.map(item => item.id)).toEqual([offlineReport.id, report.id]);
    for (let retry = 0; retry < 2; retry++) expect(data<InteractionRecord>(await call(reconnect, 'kanvas_interactions', 'acknowledge', { sessionId: session.id, interactionId: clickA.id })).status).toBe('acknowledged');
    expect((await inbox(reconnect, session.id)).interactions.map(item => item.id)).toEqual([offlineClick.id]);
    expect((await inbox(peerB, session.id)).interactions.map(item => item.id)).toEqual([clickB.id]);
    expect((await resource<ReportPage>(reconnect, uris[2])).reports.every(item => item.status === 'open')).toBe(true);
    await reconnectStop();
  });

  it('rechecks actual membership and bearer revocation before reads and subsequent resource notifications', async () => {
    const h = await server(), owner = await h.account(), member = await h.account(), session = await owner.session();
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: member.user!.username, role: 'viewer' }));
    const memberGrant = (await grant(h, member)), memberPeer = await connect(h, era, memberGrant.value), ownerPeer = await connect(h, era, (await grant(h, owner)).value);
    const uri = `kanvas://sessions/${session.id}/config`, memberNotices: string[] = [], ownerNotices: string[] = [];
    const stopMember = await subscribe(memberPeer, [uri], memberNotices), stopOwner = await subscribe(ownerPeer, [uri], ownerNotices);
    data(await call(ownerPeer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 0, config: { theme: 'light' } }));
    await vi.waitFor(() => { expect(memberNotices).toContain(uri); expect(ownerNotices).toContain(uri); }, { timeout: 2000, interval: 10 });
    memberNotices.length = 0; ownerNotices.length = 0;
    data(await call(ownerPeer, 'kanvas_access', 'member.remove', { sessionId: session.id, userId: member.user!.id }));
    failure(await call(memberPeer, 'kanvas_inspect', 'session.state', { sessionId: session.id }));
    await rejected(() => memberPeer.client.readResource({ uri }));
    data(await call(ownerPeer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 1, config: { theme: 'dark' } }));
    await vi.waitFor(() => expect(ownerNotices).toContain(uri), { timeout: 2000, interval: 10 });
    expect(memberNotices).toEqual([]);
    await stopMember(); await disconnect(memberPeer);
    // Independently revoke a live subscriber whose owner membership remains
    // intact. A lost membership must not mask a broken bearer recheck.
    const revocable = (await grant(h, owner, ['read'])), revokedPeer = await connect(h, era, revocable.value), revokedNotices: string[] = [];
    const stopRevoked = await subscribe(revokedPeer, [uri], revokedNotices);
    data(await call(ownerPeer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 2, config: { theme: 'light' } }));
    await vi.waitFor(() => expect(revokedNotices).toContain(uri), { timeout: 2000, interval: 10 });
    revokedNotices.length = 0; ownerNotices.length = 0;
    success(await owner.request('DELETE', `/api/tokens/${revocable.token.id}`));
    await rejected(() => call(revokedPeer, 'kanvas_inspect', 'sessions.list'));
    await rejected(() => revokedPeer.client.readResource({ uri }));
    data(await call(ownerPeer, 'kanvas_configure', 'session.update', { sessionId: session.id, expectedRevision: 3, config: { theme: 'dark' } }));
    await vi.waitFor(() => expect(ownerNotices).toContain(uri), { timeout: 2000, interval: 10 });
    expect(revokedNotices).toEqual([]); expect(memberNotices).toEqual([]);
    if (revokedPeer.era === 'modern') await stopRevoked();
    else await rejected(stopRevoked); // Unsubscribe itself requires a current bearer.
    await disconnect(revokedPeer); await stopOwner();
  });

  it('keeps legacy-issued OAuth grants valid after a same-audience restart into twelve, then rotates and revokes them without widening scope', async () => {
    const old = await server({ mcpProfile: 'legacy' }), owner = await old.account(), session = await owner.session(), outside = await owner.session('Not consented');
    const display = await owner.display(session.id), original = await oauthConnection(old, owner, [session.id]);
    const stable = (await old.runtime.store.list<Token>('token'))[0];
    expect(stable.resource).toBe(RESOURCE); expect(stable.sessionIds).toEqual([session.id]);
    const before = await connect(old, era, original.tokens.access_token);
    expect((await before.client.listTools()).tools).toHaveLength(2);
    const submission = { sessionId: session.id, displayIds: [display.id], requestId: 'identical-across-profile-restart', view: fact('Grant and retry identity survive a catalogue-only release.') };
    const first = data<UpdateRecord>(await before.client.callTool(operationRequest({ name: 'kanvas_submit', arguments: submission })));
    expect((await owner.settle(session.id, submission.requestId)).update.status).toBe('prepared');
    const oldMetadata = await protectedResource(old); expect(oldMetadata.resource).toBe(RESOURCE);
    await disconnect(before); await old.shutdown();
    const next = await server({ database: old.database, mcpProfile: 'twelve' }), continued = await connect(next, era, original.tokens.access_token);
    expect((await continued.client.listTools()).tools.map(tool => tool.name).sort()).toEqual([...TOOLS].sort());
    expect(await protectedResource(next)).toEqual(oldMetadata);
    expect(data<UpdateRecord>(await call(continued, 'kanvas_publish', 'show', submission)).id).toBe(first.id);
    data(await call(continued, 'kanvas_inspect', 'session.state', { sessionId: session.id }));
    failure(await call(continued, 'kanvas_inspect', 'session.state', { sessionId: outside.id }));
    failure(await continued.client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: session.id } }), ['INVALID_ARGUMENT']);
    for (const path of ['/mcp/twelve', '/mcp/legacy']) {
      const response = await next.browser().raw(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(response.status).toBe(404); await response.arrayBuffer();
    }
    const invalidAudience = await refresh(next, original.clientId, original.tokens.refresh_token, { resource: `${RESOURCE}/twelve` });
    expect(invalidAudience.status).toBe(400); expect(invalidAudience.body.error).toBe('invalid_target');
    const narrowed = issued(await refresh(next, original.clientId, original.tokens.refresh_token, { scope: 'read' }));
    expect(narrowed.scope).toBe('read');
    expect(narrowed.access_token !== original.tokens.access_token && narrowed.refresh_token !== original.tokens.refresh_token).toBe(true);
    const saved = (await next.runtime.store.get<Token>('token', stable.id))!;
    expect({ id: saved.id, agentId: saved.agentId, resource: saved.resource, sessionIds: saved.sessionIds }).toEqual({ id: stable.id, agentId: stable.agentId, resource: RESOURCE, sessionIds: [session.id] });
    expect((await next.runtime.store.get<OAuthRefreshCredential>('oauth-refresh', hash(original.tokens.refresh_token)))?.usedAt).toEqual(expect.any(String));
    const readPeer = await connect(next, era, narrowed.access_token);
    data(await call(readPeer, 'kanvas_inspect', 'session.state', { sessionId: session.id }));
    data(await call(readPeer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, width: 900 }));
    failure(await call(readPeer, 'kanvas_publish', 'show', { ...submission, requestId: 'read-credential-cannot-publish' }));
    failure(await call(readPeer, 'kanvas_inspect', 'session.state', { sessionId: outside.id }));
    failure(await call(readPeer, 'kanvas_configure', 'preferences.update', { expectedRevision: 0, config: { theme: 'light' } }));
    const widened = await refresh(next, original.clientId, narrowed.refresh_token, { scope: 'read publish' });
    expect(widened.status).toBe(400); expect(widened.body.error).toBe('invalid_scope');
    const rotated = issued(await refresh(next, original.clientId, narrowed.refresh_token)); expect(rotated.scope).toBe('read');
    // Previously issued access retains its original scope until expiry; refresh
    // does not silently replace that bearer or extend its authorization.
    expect(data<UpdateRecord>(await call(continued, 'kanvas_publish', 'show', submission)).id).toBe(first.id);
    const persisted = JSON.stringify((await next.runtime.store.list('token')).concat((await next.runtime.store.list('oauth-access')), (await next.runtime.store.list('oauth-refresh'))));
    expect([original.tokens, narrowed, rotated].some(tokens => persisted.includes(tokens.access_token) || persisted.includes(tokens.refresh_token))).toBe(false);
    const revoked = await next.browser().raw('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: original.clientId, token: rotated.refresh_token }).toString() });
    expect(revoked.status).toBe(200); expect(await revoked.text()).toBe('');
    await rejected(() => call(continued, 'kanvas_inspect', 'sessions.list'));
    await rejected(() => call(readPeer, 'kanvas_inspect', 'sessions.list'));
    const afterRevocation = await refresh(next, original.clientId, rotated.refresh_token);
    expect(afterRevocation.status).toBe(400); expect(afterRevocation.body.error).toBe('invalid_grant');
  }, 20_000);

  it('returns current recovery routes for historical diagnostics without rewriting persisted provenance', async () => {
    const h = await server(), owner = await h.account(), session = await owner.session();
    const peer = await connect(h, era, (await grant(h, owner)).value);
    const historical: DiagnosticRecord = { id: 'historical-route-fixture', sessionId: session.id, operation:'kanvas_submit', publicTool:'kanvas_control', publicOperation:'presentation.cue', phase:'rendering', code:'INVALID_SOURCE_CONTENT', createdAt:new Date().toISOString() };
    await h.runtime.store.put('diagnostic', historical);
    const state=data<{recentDiagnostics:{diagnosticId:string;tool:string;operation:string}[]}>(await call(peer,'kanvas_inspect','session.state',{sessionId:session.id}));
    expect(state.recentDiagnostics.find(item=>item.diagnosticId===historical.id)).toMatchObject({tool:'kanvas_call',operation:'kanvas.presentation.cue'});
    expect(await h.runtime.store.get('diagnostic', historical.id)).toEqual(historical);
  });

  it('records content-free public routing context for synchronous validation and deferred rendering failures', async () => {
    const interpreter = new ControlledInterpreter(), h = await server({ interpreter }), owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const peer = await connect(h, era, (await grant(h, owner)).value);
    const source = 'PRIVATE_SOURCE_MARKER_kanvas_submit', provider = 'PRIVATE_PROVIDER_PAYLOAD_MARKER', unknownKey = 'PRIVATE_ARGUMENT_KEY_MARKER';
    const sync = failure(await call(peer, 'kanvas_publish', 'patch', { sessionId: session.id, displayId: display.id, requestId: 'invalid-patch-context', expectedRevision: -1, operations: [{ op: 'appendText', path: '/data/text', value: source }], [unknownKey]: source }), ['INVALID_ARGUMENT']);
    expect(typeof sync.diagnosticId).toBe('string');
    const syncReport = data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', { sessionId: session.id, requestId: 'link-sync-diagnostic', title: 'Synchronous validation failure', description: 'Bounded diagnostic metadata only.', diagnosticId: sync.diagnosticId }));
    expect(syncReport.diagnostic).toMatchObject({ operation: 'kanvas_view_patch', publicTool: 'kanvas_call', publicOperation: 'kanvas.view.patch', phase: 'validation', code: 'INVALID_ARGUMENT' });
    data(await call(peer, 'kanvas_publish', 'show', { sessionId: session.id, displayIds: [display.id], requestId: 'deferred-public-context', context: source }));
    await interpreter.waitFor(1);
    // Interleave a different successful route while the real async render is
    // pending; its context must not replace the originating publish operation.
    data(await call(peer, 'kanvas_control', 'display.update', { sessionId: session.id, displayId: display.id, width: 999 }));
    interpreter.calls[0].reject(new RenderingError('INVALID_SOURCE_CONTENT', provider));
    const failed = await terminal(peer, session.id, 'deferred-public-context');
    expect(failed.status).toBe('failed'); expect(failed.errorCode).toBe('INVALID_SOURCE_CONTENT'); expect(typeof failed.diagnosticId).toBe('string');
    const asyncReport = data<ReportRecord>(await call(peer, 'kanvas_feedback', 'error.report', { sessionId: session.id, requestId: 'link-render-diagnostic', title: 'Deferred rendering failure', description: 'Safe report links the originating route.', updateId: failed.id, diagnosticId: failed.diagnosticId }));
    expect(asyncReport.diagnostic).toMatchObject({ operation: 'kanvas_submit', publicTool: 'kanvas_call', publicOperation: 'kanvas.submit', phase: 'rendering', code: 'INVALID_SOURCE_CONTENT', updateId: failed.id });
    const read = data<ReportPage>(await call(peer, 'kanvas_inspect', 'reports.read', { sessionId: session.id, kind: 'error' }));
    expect(read.reports.map(report => report.diagnosticId)).toEqual([failed.diagnosticId, sync.diagnosticId]);
    const diagnostics = (await h.runtime.store.list<DiagnosticRecord>('diagnostic', session.id));
    expect(diagnostics).toHaveLength(2);
    const allowedKeys = ['id', 'sessionId', 'operation', 'code', 'publicTool', 'publicOperation', 'phase', 'createdAt', 'template', 'updateId', 'issues'];
    expect(diagnostics.every(record => Object.keys(record).every(key => allowedKeys.includes(key)))).toBe(true);
    const serialized = JSON.stringify({ sync, failed, read, diagnostics });
    for (const marker of [source, provider, unknownKey]) expect(serialized.includes(marker)).toBe(false);
    expect(diagnostics.every(record => Buffer.byteLength(JSON.stringify(record)) < 3000)).toBe(true);
    expect(data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id })).view).toBeNull();
  });

  it.each(['presentation.cue', 'share.create'] as const)('retains the originating %s route when nested deferred publication fails', async operation => {
    const h = await server(), owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const peer = await connect(h, era, (await grant(h, owner)).value);
    let deckId: string | undefined;
    if (operation === 'presentation.cue') {
      const asset = data<{ url: string }>(await call(peer, 'kanvas_import', 'asset.import', { sessionId: session.id, name: 'Disposable source.png', mimeType: 'image/png', base64: PNG }));
      deckId = data<{ id: string }>(await call(peer, 'kanvas_control', 'presentation.create', { sessionId: session.id, name: 'Deferred source validation', slides: [{ version: 1, template: 'image', data: { images: [{ url: asset.url, alt: 'Source may disappear before final rendering' }] } }] })).id;
    }
    let removed = false;
    // Reproduce a source disappearing after enqueue but before final rendering.
    // Use the real deferred renderer and asset checks, not a mocked diagnostic.
    const originalList=h.runtime.store.list.bind(h.runtime.store);
    const list=vi.spyOn(h.runtime.store,'list').mockImplementation(async(kind:string,scope?:string)=>{
      if(!removed&&kind==='asset'&&(await originalList<UpdateRecord>('update',session.id)).some(update=>update.status==='rendering')){
        removed=true;for(const asset of await originalList<{id:string}>('asset',session.id))await h.runtime.store.delete('asset',asset.id);
      }
      return originalList<any>(kind,scope);
    });
    let accepted: UpdateRecord;
    try {
      accepted = operation === 'presentation.cue'
        ? data<UpdateRecord>(await call(peer, 'kanvas_control', operation, { sessionId: session.id, deckId, index: 0, displayIds: [display.id], requestId: 'nested-cue-failure' }))
        : data<{ update: UpdateRecord }>(await call(peer, 'kanvas_access', operation, { sessionId: session.id, displayId: display.id, showOnDisplay: true, expectedRevision: 0, requestId: 'nested-share-failure' })).update;
    } catch(error) {list.mockRestore();throw error;}
    expect(accepted.status).toBe('accepted');
    const failed = await terminal(peer, session.id, accepted.requestId);list.mockRestore();expect(removed).toBe(true);
    expect(failed.status).toBe('failed'); expect(typeof failed.diagnosticId).toBe('string');
    const diagnostic = (await h.runtime.store.get<DiagnosticRecord>('diagnostic', failed.diagnosticId!));
    expect(diagnostic).toMatchObject({ operation: 'kanvas_submit', publicTool: 'kanvas_call', publicOperation: `kanvas.${operation}`, phase: 'rendering', updateId: accepted.id });
    expect(data<DisplayRecord>(await call(peer, 'kanvas_inspect', 'display.current', { sessionId: session.id, displayId: display.id })).view).toBeNull();
  });
});

interface OAuthTokens { access_token: string; refresh_token: string; scope: string; token_type: string }
interface TokenResponse { status: number; headers: Headers; body: Partial<OAuthTokens> & { error?: string } }
async function tokenRequest(h: Harness, body: Record<string, string>): Promise<TokenResponse> {
  const response = await h.browser().raw('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
  return { status: response.status, headers: response.headers, body: await response.json() as TokenResponse['body'] };
}
function issued(result: TokenResponse): OAuthTokens {
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store');
  expect(typeof result.body.access_token).toBe('string'); expect(typeof result.body.refresh_token).toBe('string');
  expect(result.body.token_type).toBe('Bearer'); return result.body as OAuthTokens;
}
const refresh = (h: Harness, clientId: string, refreshToken: string, extra: Record<string, string> = {}) => tokenRequest(h, { grant_type: 'refresh_token', client_id: clientId, resource: RESOURCE, refresh_token: refreshToken, ...extra });
async function protectedResource(h: Harness) {
  const response = await h.browser().raw('/.well-known/oauth-protected-resource/mcp'); expect(response.status).toBe(200);
  return await response.json() as { resource: string; authorization_servers: string[] };
}
async function oauthConnection(h: Harness, owner: Browser, sessionIds: string[]) {
  const registered = await h.browser().raw('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Twelve profile restart acceptance', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }) });
  expect(registered.status).toBe(201); const { client_id: clientId } = await registered.json() as { client_id: string };
  const verifier = randomBytes(32).toString('base64url');
  const pending = await h.browser().raw(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, resource: RESOURCE, scope: 'read publish', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomUUID() })}`);
  expect(pending.status).toBe(303);
  const requestId = new URL(pending.headers.get('location')!).searchParams.get('authorize'); await pending.arrayBuffer();
  expect(typeof requestId).toBe('string');
  const approval = success(await owner.request<{ redirectUri: string }>('POST', '/api/oauth/approve', { requestId, approve: true, accessMode:'account' }));
  const code = new URL(approval.redirectUri).searchParams.get('code'); expect(typeof code).toBe('string'); await legacySelectedCode(h,code!,sessionIds);
  const tokens = issued(await tokenRequest(h, { grant_type: 'authorization_code', client_id: clientId, redirect_uri: CALLBACK, resource: RESOURCE, code: code!, code_verifier: verifier }));
  return { clientId, tokens };
}
