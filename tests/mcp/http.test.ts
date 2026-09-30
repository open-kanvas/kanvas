import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { MCP_TOOLS } from '../../src/server/mcp/catalog.js';
import { KANVAS_DESCRIPTION } from '../../src/server/mcp/guide.js';
import { harness } from './harness.js';

type Harness = Awaited<ReturnType<typeof harness>>;
let server: Harness | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

function data(result: { content: unknown[]; structuredContent?: unknown }) {
  const structured = result.structuredContent as { data?: Record<string, unknown> } | undefined;
  return structured?.data ?? JSON.parse((result.content[0] as { text: string }).text).data;
}

describe('authenticated MCP HTTP using published SDK clients', () => {
  it('negotiates 2026-07-28 and 2025-11-25 and exposes the same domain tools/resources', async () => {
    server = await harness();
    const bearer = server.service.issue('owner');
    const modern = await server.modern(bearer, 'auto');
    const legacy = await server.legacy(bearer);
    const [modernTools, legacyTools] = await Promise.all([modern.client.listTools(), legacy.client.listTools()]);
    expect(modernTools.tools.map(t => t.name)).toEqual(legacyTools.tools.map(t => t.name));
    expect(modernTools.tools.map(tool => tool.name).sort()).toEqual(MCP_TOOLS.map(tool => tool.name).sort());
    expect(modernTools.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['kanvas_view_patch', 'kanvas_timer_control', 'kanvas_monitoring_start', 'kanvas_monitoring_read', 'kanvas_monitoring_update', 'kanvas_monitoring_stop']));
    const reads=['kanvas_session_state','kanvas_display_current','kanvas_display_inspect','kanvas_update_status','kanvas_viewers_read','kanvas_session_overview','kanvas_interactions_read','kanvas_template_get','kanvas_styles_list','kanvas_preferences_get','kanvas_pairings_read','kanvas_display_history','kanvas_reports_read','kanvas_session_log','kanvas_view_validate'];
    for(const list of [modernTools.tools,legacyTools.tools]){
      for(const name of reads)expect(list.find(t=>t.name===name)?.annotations,name).toMatchObject({readOnlyHint:true,destructiveHint:false,idempotentHint:true});
      for(const name of ['kanvas_clear','kanvas_session_end','kanvas_member_remove','kanvas_asset_delete','kanvas_dataset_delete'])expect(list.find(t=>t.name===name)?.annotations,name).toMatchObject({readOnlyHint:false,destructiveHint:true});
      for(const name of ['kanvas_submit','kanvas_display_snapshot','kanvas_address_get','kanvas_procedure_control','kanvas_share_create'])expect(list.find(t=>t.name===name)?.annotations,name).toMatchObject({readOnlyHint:false,destructiveHint:false});
    }
    expect(modernTools.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['kanvas_template_get', 'kanvas_feedback_submit', 'kanvas_error_report', 'kanvas_reports_read', 'kanvas_report_update']));
    expect(modernTools.tools.some(t => t.name === 'kanvas_asset_import')).toBe(true);
    expect(modernTools.tools.some(t => t.name === 'kanvas_presentation_cue')).toBe(true);
    expect(modernTools.tools.some(t => t.name === 'kanvas_member_remove')).toBe(true);
    expect(modern.transport.protocolVersion).toBe('2026-07-28');
    expect(legacy.transport.sessionId).toBeTruthy();
    expect(server.methods.some(m => m.method === 'server/discover' && m.version === '2026-07-28')).toBe(true);
    expect(server.methods.some(m => m.method === 'initialize' && m.version === '2025-11-25')).toBe(true);
    expect(legacy.client.getServerCapabilities()?.resources?.subscribe).toBe(true);
    const list = await modern.client.listResources();
    expect(list.resources).toHaveLength(4);
    expect(list.resources.every(r => !r.uri.includes('beta'))).toBe(true);
    expect((await legacy.client.listResourceTemplates()).resourceTemplates).toHaveLength(4);
  });

  it('round-trips session creation, independent displays, selected data and acceptance/status without fabricating applied state', async () => {
    server = await harness();
    const { client } = await server.modern(server.service.issue('owner'));
    const session = data(await client.callTool({ name: 'kanvas_session_create', arguments: { name: 'Meeting' } }));
    const sessionId = session.id;
    const left = data(await client.callTool({ name: 'kanvas_display_register', arguments: { sessionId, name: 'Facts', width: 400, height: 800 } }));
    const right = data(await client.callTool({ name: 'kanvas_display_register', arguments: { sessionId, name: 'Plot', width: 1920, height: 1080, pixelRatio: 1 } }));
    const result = data(await client.callTool({ name: 'kanvas_submit', arguments: { sessionId, requestId: 'request-1', displayIds: [left.id, right.id], data: { value: 42.125, unit: 'kg' }, source: { title: 'Measured source' } } }));
    expect(result.status).toBe('accepted');
    expect(result.displayIds).toEqual([left.id, right.id]);
    const status = data(await client.callTool({ name: 'kanvas_update_status', arguments: { sessionId, requestId: 'request-1' } }));
    expect(status.status).toBe('accepted');
    server.service.updates.get(String(result.id))!.status = 'applied';
    const applied = data(await client.callTool({ name: 'kanvas_update_status', arguments: { sessionId, updateId: result.id } }));
    expect(applied.status).toBe('applied');
    const original = server.service.calls.find(call => call.name === 'kanvas_submit')!;
    expect(original.args.data).toEqual({ value: 42.125, unit: 'kg' });
    expect(original.userId).toBe('owner');
  });

  it('validates destructive/ambiguous arguments before domain dispatch and returns bounded safe errors', async () => {
    server = await harness();
    const { client } = await server.modern(server.service.issue('owner'));
    const before = server.service.calls.length;
    const badInputs = [
      { name: 'kanvas_clear', arguments: { sessionId: 'alpha', displayIds: [], requestId: 'clear' } },
      { name: 'kanvas_update_status', arguments: { sessionId: 'alpha', updateId: 'one', requestId: 'two' } },
      { name: 'kanvas_dataset_import', arguments: { sessionId: 'alpha', name: 'bad', csv: 'x\n1', rows: [{ x: 1 }] } },
      { name: 'kanvas_member_add', arguments: { sessionId: 'alpha', username: 'other', role: 'owner' } },
      { name: 'kanvas_submit', arguments: { sessionId: 'alpha', displayIds: ['display'], requestId: 'x', principal: { userId: 'other' } } },
    ];
    for (const input of badInputs) expect((await client.callTool(input)).isError).toBe(true);
    expect(server.service.calls).toHaveLength(before);
    server.service.failWithPrivateError = true;
    const failed = await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: 'alpha' } });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed).includes(server.service.privateErrorMarker)).toBe(false);
    // Modern MCP repeats public server discovery metadata on tool results.
    // Bound the actual application error independently of that description.
    const { _meta: metadata, ...errorBody } = failed;
    expect(JSON.stringify(errorBody).length).toBeLessThan(1000);
    expect(metadata).toEqual({ 'io.modelcontextprotocol/serverInfo': expect.objectContaining({ description: KANVAS_DESCRIPTION }) });
    expect(JSON.stringify(metadata).length).toBeLessThan(1200);
    server.service.failWithPrivateError = false;
    server.service.oversizedResult = true;
    const large = await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: 'alpha' } });
    expect(large.isError).not.toBe(true);
    expect((large.structuredContent as { truncated: boolean }).truncated).toBe(true);
    expect(Buffer.byteLength((large.content[0] as { text: string }).text)).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES);
  });

  it('rejects anonymous, query/cookie-only, hostile-origin, and cross-identity legacy-session requests', async () => {
    server = await harness();
    const anonymous = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toContain('https://kanvas.example/.well-known/oauth-protected-resource/mcp');
    const owner = server.service.issue('owner');
    const other = server.service.issue('other');
    const cookieOnly = await fetch(server.url, { method: 'GET', headers: { Cookie: 'kanvas_session=test-fixture-only' } });
    expect(cookieOnly.status).toBe(401);
    const hostile = await fetch(server.url, { method: 'POST', headers: { ...server.headers(owner), Origin: 'https://untrusted.example' }, body: '{}' });
    expect(hostile.status).toBe(403);
    const { transport } = await server.legacy(owner);
    const hijack = await fetch(server.url, { method: 'POST', headers: { ...server.headers(other), 'MCP-Session-Id': transport.sessionId!, 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/list' }) });
    expect(hijack.status).toBe(404);
    expect((await hijack.text()).includes('alpha')).toBe(false);
    const missingAuth = await fetch(server.url, { method: 'GET', headers: { 'MCP-Session-Id': transport.sessionId! } });
    expect(missingAuth.status).toBe(401);
  });

  it('authorizes both subscription eras per resource and cannot publish using read-only scope', async () => {
    server = await harness();
    const bearer = server.service.issue('owner', 'agent-a', ['read']);
    const modern = await server.modern(bearer);
    const legacy = await server.legacy(bearer);
    await expect(modern.client.readResource({ uri: 'kanvas://sessions/beta/state' })).rejects.toThrow();
    await expect(modern.client.listen({ resourceSubscriptions: ['kanvas://sessions/beta/interactions'] })).rejects.toThrow();
    await expect(legacy.client.subscribeResource({ uri: 'kanvas://sessions/beta/config' })).rejects.toThrow();
    const forbidden = await modern.client.callTool({ name: 'kanvas_clear', arguments: { sessionId: 'alpha', displayIds: ['display'], requestId: 'read-only' } });
    expect(forbidden.isError).toBe(true);
    expect((forbidden.structuredContent as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('honors ACK-first modern subscription filters, notifies config/inbox updates, and preserves targeted actions until acknowledged', async () => {
    server = await harness();
    const { client, wire } = await server.modern(server.service.issue('owner'));
    const notices: string[] = [];
    client.setNotificationHandler('notifications/resources/updated', note => { notices.push(note.params.uri); });
    const configUri = 'kanvas://sessions/alpha/config';
    const inboxUri = 'kanvas://sessions/alpha/interactions';
    const subscription = await client.listen({ resourceSubscriptions: [configUri, inboxUri], resourcesListChanged: true, toolsListChanged: true });
    expect(subscription.honoredFilter.resourceSubscriptions).toEqual([configUri, inboxUri]);
    expect(subscription.honoredFilter.toolsListChanged).toBeUndefined();
    expect(wire[0].method).toBe('notifications/subscriptions/acknowledged');
    const subscriptionId = wire[0].subscriptionId;
    expect(subscriptionId).toBeDefined();
    await client.callTool({ name: 'kanvas_config_update', arguments: { sessionId: 'alpha', expectedRevision: 0, config: { theme: 'light' } } });
    const id = server.service.interact('alpha');
    server.service.interact('alpha', 'agent-b');
    server.service.emit({ type: 'config', sessionId: 'beta', data: { mustNotLeak: true } });
    await vi.waitFor(() => { expect(notices).toContain(configUri); expect(notices).toContain(inboxUri); });
    expect(notices.every(uri => uri === configUri || uri === inboxUri)).toBe(true);
    expect(wire.filter(item => item.method === 'notifications/resources/updated').every(item => item.subscriptionId === subscriptionId)).toBe(true);
    const config = await client.readResource({ uri: configUri });
    expect(JSON.parse((config.contents[0] as { text: string }).text).config.theme).toBe('light');
    const inbox = data(await client.callTool({ name: 'kanvas_interactions_read', arguments: { sessionId: 'alpha' } }));
    expect((inbox.interactions as { id: string }[]).map(item => item.id)).toEqual([id]);
    const readAgain = await client.readResource({ uri: inboxUri });
    expect(JSON.parse((readAgain.contents[0] as { text: string }).text).interactions).toHaveLength(1);
    await client.callTool({ name: 'kanvas_interaction_ack', arguments: { sessionId: 'alpha', interactionId: id } });
    await client.callTool({ name: 'kanvas_interaction_ack', arguments: { sessionId: 'alpha', interactionId: id } });
    const empty = data(await client.callTool({ name: 'kanvas_interactions_read', arguments: { sessionId: 'alpha' } }));
    expect(empty.interactions).toEqual([]);
    await subscription.close();
    expect(await subscription.closed).toBe('local');
  });

  it('serves legacy resources/subscribe notifications and reconnects by re-subscribing and reading durable feedback', async () => {
    server = await harness();
    const bearer = server.service.issue('owner');
    const first = await server.legacy(bearer);
    const uri = 'kanvas://sessions/alpha/interactions';
    const notices: string[] = [];
    first.client.setNotificationHandler(ResourceUpdatedNotificationSchema, note => { notices.push(note.params.uri); });
    await first.client.subscribeResource({ uri });
    const firstId = server.service.interact('alpha');
    await vi.waitFor(() => { expect(notices).toContain(uri); });
    await first.client.unsubscribeResource({ uri });
    await first.client.close();
    const offlineId = server.service.interact('alpha');
    const second = await server.legacy(bearer);
    await second.client.subscribeResource({ uri });
    const inbox = await second.client.readResource({ uri });
    expect(JSON.parse((inbox.contents[0] as { text: string }).text).interactions.map((item: { id: string }) => item.id)).toEqual([firstId, offlineId]);
    const ack = await second.client.callTool({ name: 'kanvas_interaction_ack', arguments: { sessionId: 'alpha', interactionId: offlineId } });
    expect(ack.isError).not.toBe(true);
  });

  it('modern reconnect re-reads missed state and explicit reads work without a subscription or automatic agent wakeup', async () => {
    server = await harness();
    const bearer = server.service.issue('owner');
    const first = await server.modern(bearer);
    const uri = 'kanvas://sessions/alpha/interactions';
    const oldSubscription = await first.client.listen({ resourceSubscriptions: [uri] });
    await oldSubscription.close();
    await first.client.close();
    const offlineId = server.service.interact('alpha');
    const second = await server.modern(bearer);
    const fallback = data(await second.client.callTool({ name: 'kanvas_interactions_read', arguments: { sessionId: 'alpha', limit: 1 } }));
    expect((fallback.interactions as { id: string }[])[0].id).toBe(offlineId);
    const subscription = await second.client.listen({ resourceSubscriptions: [uri] });
    const inbox = await second.client.readResource({ uri });
    expect(JSON.parse((inbox.contents[0] as { text: string }).text).interactions[0].id).toBe(offlineId);
    await subscription.close();
  });

  it('stops notification delivery after membership or bearer revocation, even with a misfiltered domain event source', async () => {
    server = await harness({ authRecheckMs: 30 });
    const bearer = server.service.issue('owner');
    const { client } = await server.modern(bearer);
    const notices: string[] = [];
    client.setNotificationHandler('notifications/resources/updated', note => { notices.push(note.params.uri); });
    const uri = 'kanvas://sessions/alpha/config';
    const subscription = await client.listen({ resourceSubscriptions: [uri] });
    server.service.sessions.get('alpha')!.members.delete('owner');
    server.service.emit({ type: 'config', sessionId: 'alpha' });
    await expect(client.readResource({ uri })).rejects.toThrow();
    expect(notices).toEqual([]);
    server.service.tokens.delete(bearer);
    server.service.emit({ type: 'config', sessionId: 'alpha' });
    await vi.waitFor(() => { expect(server!.service.listeners.size).toBe(0); });
    expect(await subscription.closed).toBe('remote');
    expect(notices).toEqual([]);
    await expect(client.listResources(undefined, { cacheMode: 'bypass' })).rejects.toThrow();
  });

  it('does not downgrade malformed/unsupported modern protocol requests onto the legacy service', async () => {
    server = await harness();
    const bearer = server.service.issue('owner');
    const response = await fetch(server.url, {
      method: 'POST', headers: { ...server.headers(bearer), 'MCP-Protocol-Version': '2099-01-01', 'Mcp-Method': 'tools/list' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01', 'io.modelcontextprotocol/clientInfo': { name: 'future-client', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} } } }),
    });
    expect(response.status).toBe(400);
    const result = await response.json() as { error: { code: number; data: unknown } };
    expect(result.error.code).toBe(-32022);
    expect(response.headers.get('mcp-session-id')).toBeNull();
    expect(server.service.calls).toHaveLength(0);
    const noAuth = await fetch(server.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 100, method: 'server/discover' }) });
    expect(noAuth.status).toBe(401);
  });

  it('uses resources/subscribe, not listen, when the modular client is kept in its legacy era', async () => {
    server = await harness();
    const { client, transport } = await server.modern(server.service.issue('owner'), 'legacy');
    expect(transport.protocolVersion).toBe('2025-11-25');
    await expect(client.listen({ resourceSubscriptions: ['kanvas://sessions/alpha/config'] })).rejects.toThrow();
    await client.subscribeResource({ uri: 'kanvas://sessions/alpha/config' });
    const resource = await client.readResource({ uri: 'kanvas://sessions/alpha/config' });
    expect(JSON.parse((resource.contents[0] as { text: string }).text).config.theme).toBe('dark');
  });

  it('enforces connection/subscription bounds even during concurrent initialization', async () => {
    server = await harness({ maxSessionsPerPrincipal: 1 });
    const bearer = server.service.issue('owner');
    const legacyResults = await Promise.allSettled([server.legacy(bearer), server.legacy(bearer)]);
    expect(legacyResults.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(legacyResults.filter(result => result.status === 'rejected')).toHaveLength(1);
    const { client } = await server.modern(bearer);
    const modernResults = await Promise.allSettled([
      client.listen({ resourceSubscriptions: ['kanvas://sessions/alpha/config'] }),
      client.listen({ resourceSubscriptions: ['kanvas://sessions/alpha/interactions'] }),
    ]);
    expect(modernResults.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(modernResults.filter(result => result.status === 'rejected')).toHaveLength(1);
    for (const result of modernResults) if (result.status === 'fulfilled') await result.value.close();
  });

  it('paginates authorized resource discovery and redacts malformed JSON errors', async () => {
    server = await harness();
    for (let i = 0; i < 38; i++) server.service.createSession(`session-${i}`, 'owner');
    const bearer = server.service.issue('owner');
    const { client } = await server.legacy(bearer);
    const first = await client.listResources();
    expect(first.resources).toHaveLength(100);
    expect(first.nextCursor).toBeTruthy();
    const second = await client.listResources({ cursor: first.nextCursor });
    expect(second.resources).toHaveLength(18);
    expect(second.nextCursor).toBeUndefined();
    expect([...first.resources, ...second.resources].every(resource => !resource.uri.includes('/beta/'))).toBe(true);
    await expect(client.listResources({ cursor: 'arbitrary-client-cursor' })).rejects.toThrow();
    const malformed = await fetch(server.url, { method: 'POST', headers: server.headers(bearer), body: `{malformed:${server.service.privateErrorMarker}` });
    expect(malformed.status).toBe(400);
    const body = await malformed.text();
    expect(body.includes(server.service.privateErrorMarker)).toBe(false);
    expect(body.includes('SyntaxError')).toBe(false);
    expect(body.length).toBeLessThan(500);
  });

  it('closes and invalidates a legacy publisher connection when its credential is revoked', async () => {
    server = await harness({ authRecheckMs: 30 });
    const bearer = server.service.issue('owner');
    const { client, transport } = await server.legacy(bearer);
    await client.subscribeResource({ uri: 'kanvas://sessions/alpha/config' });
    const sessionId = transport.sessionId!;
    server.service.tokens.delete(bearer);
    server.service.emit({ type: 'config', sessionId: 'alpha' });
    await vi.waitFor(() => { expect(server!.service.listeners.size).toBe(0); });
    const nextIdentity = server.service.issue('owner');
    const response = await fetch(server.url, { method: 'GET', headers: { ...server.headers(nextIdentity), 'MCP-Session-Id': sessionId } });
    expect(response.status).toBe(404);
  });
});
