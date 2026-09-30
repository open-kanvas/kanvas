import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InteractionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { fact, startHarness, success, type Browser, type Harness } from './harness.js';

interface Issued { id: string; name: string; token: string; scopes: string[]; sessionIds: string[] }
async function connect(h: Harness, owner: Browser, sessionIds: string[], scopes = ['read', 'publish'], name = 'Acceptance agent') {
  const issued = success(await owner.request<Issued>('POST', '/api/tokens', { name, scopes, sessionIds }));
  expect(typeof issued.token).toBe('string');
  const client = new Client({ name: 'kanvas-core-acceptance', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } } });
  await client.connect(transport);
  return { client, issued, async close() { await client.close(); } };
}
async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toHaveProperty('data');
  return (result.structuredContent as Record<string, unknown>).data as T;
}

describe('real MCP SDK against persisted publisher authorization', () => {
  let h: Harness, connections: Awaited<ReturnType<typeof connect>>[];
  beforeEach(async () => { h = await startHarness(); connections = []; });
  afterEach(async () => { await Promise.all(connections.map(connection => connection.close())); await h?.close(); });

  it('enforces token session/read-only scope, exposes only metadata, and rejects revoked tokens', async () => {
    const owner = await h.account(), a = await owner.session('Allowed'), b = await owner.session('Not granted'), display = await owner.display(a.id);
    const connection = await connect(h, owner, [a.id], ['read']); connections.push(connection);
    const sessions = await call<{ id: string }[]>(connection.client, 'kanvas_sessions_list', {});
    expect(sessions.map(session => session.id)).toEqual([a.id]);
    const forbiddenRead = await connection.client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: b.id } });
    expect(forbiddenRead.isError).toBe(true);
    const forbiddenWrite = await connection.client.callTool({ name: 'kanvas_submit', arguments: { sessionId: a.id, requestId: 'read-only', displayIds: [display.id], view: fact('Not authorized') } });
    expect(forbiddenWrite.isError).toBe(true);
    expect((await owner.detail(a.id)).updates).toHaveLength(0);
    const listed = await owner.request<Record<string, unknown>[]>('GET', '/api/tokens');
    const metadata = success(listed);
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toHaveProperty('id', connection.issued.id);
    expect(metadata.some(record => Object.keys(record).some(key => /token$|hash|secret|password/i.test(key)))).toBe(false);
    expect(listed.text.includes(connection.issued.token)).toBe(false);
    success(await owner.request('DELETE', `/api/tokens/${connection.issued.id}`));
    await expect(connection.client.callTool({ name: 'kanvas_sessions_list', arguments: {} })).rejects.toThrow();
  });

  it('does not convert a publisher bearer into a browser login or a browser cookie into MCP authorization', async () => {
    const owner = await h.account(), session = await owner.session();
    const connection = await connect(h, owner, [session.id]); connections.push(connection);
    const noLogin = h.browser();
    const response = await noLogin.request('GET', '/api/auth/me', undefined, { headers: { Authorization: `Bearer ${connection.issued.token}` } });
    expect(response.status).toBe(401);
    const noBearer = await owner.request('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'browser-cookie-is-not-publisher', version: '1.0' } } }, { headers: { accept: 'application/json, text/event-stream' } });
    expect(noBearer.status).toBe(401);
    expect(noBearer.headers.get('www-authenticate')).toMatch(/Bearer/i);
  });

  it('routes feedback to the originating publisher, leaving it pending until that publisher acknowledges', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
    const a = await connect(h, owner, [session.id], ['read', 'publish'], 'Agent A'); connections.push(a);
    const b = await connect(h, owner, [session.id], ['read', 'publish'], 'Agent B'); connections.push(b);
    const view: ViewSpec = { ...fact('Choose the next comparison.'), actions: [{ id: 'pick', kind: 'choice', label: 'Next', options: ['A', 'B'] }] };
    await call<UpdateRecord>(a.client, 'kanvas_submit', { sessionId: session.id, requestId: 'agent-a-question', displayIds: [display.id], view });
    const prepared = await owner.settle(session.id, 'agent-a-question');
    const clicked = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, { displayId: display.id, revision: prepared.detail.displays[0].revision, actionId: 'pick', value: 'A', requestId: 'click' }));
    expect(clicked.targetAgentId).toEqual(expect.any(String));
    const inboxA = await call<{ interactions: InteractionRecord[] }>(a.client, 'kanvas_interactions_read', { sessionId: session.id });
    const inboxB = await call<{ interactions: InteractionRecord[] }>(b.client, 'kanvas_interactions_read', { sessionId: session.id });
    expect(inboxA.interactions.map(item => item.id)).toEqual([clicked.id]);
    expect(inboxB.interactions).toHaveLength(0);
    expect(inboxA.interactions[0].status).toBe('pending');
    const foreignAck = await b.client.callTool({ name: 'kanvas_interaction_ack', arguments: { sessionId: session.id, interactionId: clicked.id } });
    expect(foreignAck.isError).toBe(true);
    expect((await call<{ interactions: InteractionRecord[] }>(a.client, 'kanvas_interactions_read', { sessionId: session.id })).interactions[0].status).toBe('pending');
    await call(a.client, 'kanvas_interaction_ack', { sessionId: session.id, interactionId: clicked.id });
    await call(a.client, 'kanvas_interaction_ack', { sessionId: session.id, interactionId: clicked.id });
    expect((await call<{ interactions: InteractionRecord[] }>(a.client, 'kanvas_interactions_read', { sessionId: session.id })).interactions).toHaveLength(0);
    const acknowledged = await call<{ interactions: InteractionRecord[] }>(a.client, 'kanvas_interactions_read', { sessionId: session.id, status: 'all' });
    expect(acknowledged.interactions[0].status).toBe('acknowledged');
  });
});
