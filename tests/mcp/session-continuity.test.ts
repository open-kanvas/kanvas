import { operationId, publicGuidanceText } from '../../src/server/mcp/operations.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { listToolDefinitions } from '../../src/server/mcp/catalog.js';
import { KANVAS_INSTRUCTIONS, guideFor, orientationFor } from '../../src/server/mcp/guide.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { MAX_SESSION_CONTINUITY_GUIDANCE_CHARACTERS, MAX_SESSION_CONTINUITY_RECIPE_CHARACTERS, SESSION_CONTINUITY_GUIDANCE, SESSION_CONTINUITY_RECIPE, SESSION_CONTINUITY_TOOL_GUIDANCE, sessionContinuityGuidanceFor } from '../../src/server/mcp/session-continuity.js';
import type { SessionRecord, UpdateRecord } from '../../src/shared/types.js';
import { fact, startHarness, type Browser, type Detail, type Harness } from '../core/harness.js';

const entryPoints = ['kanvas_session_create', 'kanvas_sessions_list', 'kanvas_session_overview', 'kanvas_session_state'] as const;
interface Envelope<T = unknown> { data: T; orientation?: { sessionContinuity?: string }; error?: { code: string; message: string } }
function unpack<T = unknown>(result: unknown): Envelope<T> {
  if (!result || typeof result !== 'object') throw new Error('Expected an MCP tool result');
  const response = result as Record<string, unknown>;
  if (response.structuredContent) return response.structuredContent as Envelope<T>;
  if (!Array.isArray(response.content)) throw new Error('Expected direct MCP content, not a task placeholder');
  const block = response.content.find(item => item && typeof item === 'object' && typeof item.text === 'string');
  if (!block) throw new Error('Expected MCP text content');
  return JSON.parse(block.text) as Envelope<T>;
}
function envelope<T = unknown>(result: unknown): Envelope<T> {
  expect((result as { isError?: boolean }).isError).not.toBe(true);
  const value = unpack<T>(result); expect(value.error).toBeUndefined(); return value;
}
function forbidden(result: unknown) {
  expect((result as { isError?: boolean }).isError).toBe(true);
  expect(unpack(result).error).toMatchObject({ code: 'FORBIDDEN', message: 'This publisher is not authorized for this operation.' });
}

let app: Harness | undefined;
const clients: (Client | LegacyClient)[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  await app?.close(); app = undefined;
});

async function connect(owner: Browser, profile: 'modern' | 'legacy' = 'modern', sessionIds?: string[], scopes = ['read', 'publish']) {
  if (!app) throw new Error('Start the isolated test runtime first');
  // Only ephemeral fixture credentials. The real Auth/Domain enforce the same
  // stored selected-session boundary used by OAuth; no live grants are touched.
  const issued = (await app.runtime.auth.issueToken(owner.user!.id, 'Session continuity fixture', scopes, sessionIds));
  const client = profile === 'modern'
    ? new Client({ name: 'continuity-modern', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    : new LegacyClient({ name: 'continuity-legacy', version: '1' });
  const endpoint = new URL('/mcp', app.baseUrl), options = { requestInit: { headers: { Authorization: `Bearer ${issued.value}` } } };
  const transport = profile === 'modern' ? new StreamableHTTPClientTransport(endpoint, options) : new LegacyTransport(endpoint, options);
  clients.push(client); await client.connect(transport);
  return { client, tokenId: issued.token.id };
}

describe('bounded host session-continuity guidance', () => {
  it('covers only the intended entry points with bounded immutable advice and scenarios', () => {
    expect(Object.keys(SESSION_CONTINUITY_TOOL_GUIDANCE)).toEqual(entryPoints);
    for (const tool of entryPoints) {
      const advice = sessionContinuityGuidanceFor(tool)!;
      expect(advice).toContain(SESSION_CONTINUITY_GUIDANCE); expect(advice).toContain(SESSION_CONTINUITY_TOOL_GUIDANCE[tool]);
      expect(advice.length).toBeLessThanOrEqual(MAX_SESSION_CONTINUITY_GUIDANCE_CHARACTERS);
    }
    for (const name of ['kanvas_submit', 'kanvas_session_end', 'session_create', '__proto__', 'constructor', '', 'KANVAS_SESSIONS_LIST']) expect(sessionContinuityGuidanceFor(name)).toBeUndefined();
    expect(Object.isFrozen(SESSION_CONTINUITY_TOOL_GUIDANCE)).toBe(true);
    expect(Object.isFrozen(SESSION_CONTINUITY_RECIPE)).toBe(true); expect(Object.isFrozen(SESSION_CONTINUITY_RECIPE.steps)).toBe(true);
    expect(Object.isFrozen(SESSION_CONTINUITY_RECIPE.scenarios)).toBe(true);
    expect(SESSION_CONTINUITY_RECIPE.scenarios.every(Object.isFrozen)).toBe(true);
    expect(SESSION_CONTINUITY_RECIPE.steps.length).toBeLessThanOrEqual(8); expect(SESSION_CONTINUITY_RECIPE.scenarios.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(SESSION_CONTINUITY_RECIPE).length).toBeLessThanOrEqual(MAX_SESSION_CONTINUITY_RECIPE_CHARACTERS);
  });
});

describe('guide, catalogue and result integration', () => {
  it('pushes the same advice through initialization, getting-started and all four relevant tools', () => {
    expect(KANVAS_INSTRUCTIONS).toContain('Never choose an unrelated session just because it is recent');expect(KANVAS_INSTRUCTIONS).toContain('newSession:true');
    expect(guideFor('getting-started')).toMatchObject({ sessionContinuity: SESSION_CONTINUITY_GUIDANCE, continuityRecipe: SESSION_CONTINUITY_RECIPE });
    const definitions = listToolDefinitions();
    for (const tool of entryPoints) {
      const definition = definitions.find(item => item.name === tool)!;
      expect(definition.description).toContain(SESSION_CONTINUITY_TOOL_GUIDANCE[tool]);
      expect(orientationFor(tool)?.sessionContinuity).toBe(sessionContinuityGuidanceFor(tool));
      expect(definition.annotations?.readOnlyHint).toBe(tool !== 'kanvas_session_create');
    }
    expect(orientationFor('kanvas_submit')?.sessionContinuity).toBeUndefined();
    expect(orientationFor('kanvas_session_end')).toBeUndefined();
  });

  it('does not rank, rename, match or insert conversation IDs into returned source records', () => {
    const source = Object.freeze([
      Object.freeze({ id: 'source-newest', name: 'FlyNorse analytics', updatedAt: '2026-09-14T09:00:00Z' }),
      Object.freeze({ id: 'source-intended', name: 'Kanvas Demo for Alex', updatedAt: '2026-08-01T09:00:00Z' }),
    ]);
    const result = envelope<typeof source>(toolSuccess(source, undefined, 'kanvas_sessions_list'));
    expect(result.data).toEqual(source); expect(result.orientation?.sessionContinuity).toBe(sessionContinuityGuidanceFor('kanvas_sessions_list'));
    expect(result).not.toHaveProperty('selectedSessionId'); expect(result).not.toHaveProperty('conversationId');
    const preview = Object.freeze({ cards: [{ title: 'Original retained title', preview: 'Literal source content.', revision: 7 }], note: 'Retained views only.' });
    expect(envelope(toolSuccess(preview, 'source-intended', 'kanvas_session_overview')).data).toEqual(preview);
  });

  it.each(['modern', 'legacy'] as const)('delivers the actual four entry-point hints through the %s SDK without hidden session reuse or cleanup', async profile => {
    app = await startHarness();
    const owner = await app.account(), old = await owner.session('Kanvas Demo for Alex'), display = await owner.display(old.id);
    await owner.submit(old.id, [display.id], fact('Literal retained demo content.'));
    const oldSession = (await app.runtime.store.get('session', old.id)), oldDisplays = (await app.runtime.store.list('display', old.id)), beforeSessions = (await app.runtime.store.list<SessionRecord>('session'));
    expect(beforeSessions).toHaveLength(2); expect(beforeSessions.some(s => s.name === 'Home')).toBe(true);
    const { client } = await connect(owner, profile);
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(7);
    for (const tool of entryPoints) {
      const found = await client.callTool({ name: 'kanvas_tool_search', arguments: { query: operationId(tool) } });
      const detail = (found.structuredContent as any).data.results[0];
      expect(detail.description).toContain(publicGuidanceText(SESSION_CONTINUITY_TOOL_GUIDANCE[tool], 'discovery'));
    }
    const sessions = envelope<SessionRecord[]>(await client.callTool({ name: 'kanvas_sessions_list', arguments: {} }));
    expect(sessions.data.map(item => ({ id: item.id, name: item.name })).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(beforeSessions.map(item=>({id:item.id,name:item.name})).sort((a,b)=>a.id.localeCompare(b.id)));
    expect(sessions.orientation?.sessionContinuity).toBe(sessionContinuityGuidanceFor('kanvas_sessions_list'));
    const overview = envelope<{ cards: { preview: string; revision: number }[]; note: string }>(await client.callTool({ name: 'kanvas_session_overview', arguments: { sessionId: old.id } }));
    expect(overview.data.cards).toHaveLength(1); expect(overview.data.cards[0]).toMatchObject({ preview: 'Literal retained demo content.', revision: 1 });
    expect(overview.orientation?.sessionContinuity).toBe(sessionContinuityGuidanceFor('kanvas_session_overview'));
    const state = envelope<Detail>(await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: old.id } }));
    expect(state.data.displays[0].view).toMatchObject(fact('Literal retained demo content.'));
    expect(state.orientation?.sessionContinuity).toBe(sessionContinuityGuidanceFor('kanvas_session_state'));
    expect((await app.runtime.store.list('session'))).toEqual(beforeSessions);
    const created = envelope<SessionRecord>(await client.callTool({ name: 'kanvas_session_create', arguments: { name: 'Weekend in Bergen' } }));
    expect(created.data.name).toBe('Weekend in Bergen'); expect(created.data.id).not.toBe(old.id);
    expect(created.orientation?.sessionContinuity).toBe(sessionContinuityGuidanceFor('kanvas_session_create'));
    const clean = await owner.detail(created.data.id);
    expect(clean.displays).toHaveLength(1); expect(clean.displays[0].view).toBeNull(); expect(clean.updates).toEqual([]); expect(clean.interactions).toEqual([]);
    expect((await app.runtime.store.list('session'))).toHaveLength(3);
    expect((await app.runtime.store.get('session', old.id))).toEqual(oldSession); expect((await app.runtime.store.list('display', old.id))).toEqual(oldDisplays);
  });
});

describe('unchanged real selected-session and account authority', () => {
  it('allows same-session continuation but rejects new creation and does not inherit workspace-created access', async () => {
    app = await startHarness();
    const owner = await app.account(), old = await owner.session('FlyNorse analytics'), display = await owner.display(old.id);
    await owner.submit(old.id, [display.id], fact('Original analytics view.'));
    const { client, tokenId } = await connect(owner, 'modern', [old.id]);
    const before = (await app.runtime.store.list('session'));
    forbidden(await client.callTool({ name: 'kanvas_session_create', arguments: { name: 'Weekend in Bergen' } }));
    expect((await app.runtime.store.list('session'))).toEqual(before);
    const clean = await owner.session('Weekend in Bergen');
    forbidden(await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: clean.id } }));
    const selected = envelope<SessionRecord[]>(await client.callTool({ name: 'kanvas_sessions_list', arguments: {} }));
    expect(selected.data.map(item => item.id)).toEqual([old.id]);
    expect((await app.runtime.auth.tokenMetadata(owner.user!.id)).find(item => item.id === tokenId)).toMatchObject({ accessMode: 'selected', sessionIds: [old.id], scopes: ['read', 'publish'] });
    const state = envelope<Detail>(await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: old.id } }));
    expect(state.data.displays[0].id).toBe(display.id);
    const continued = envelope<UpdateRecord>(await client.callTool({ name: 'kanvas_submit', arguments: { sessionId: old.id, displayIds: [display.id], requestId: 'explicit-analytics-continuation', view: fact('Next supplied analytics view.') } }));
    expect(continued.data.displayIds).toEqual([display.id]);
    const settled = await owner.settle(old.id, 'explicit-analytics-continuation');
    expect(settled.detail.displays[0]).toMatchObject({ id: display.id, revision: 2, view: fact('Next supplied analytics view.') });
    const overview = envelope<{ cards: { preview: string }[] }>(await client.callTool({ name: 'kanvas_session_overview', arguments: { sessionId: old.id } }));
    expect(overview.data.cards.map(item => item.preview)).toEqual(['Original analytics view.', 'Next supplied analytics view.']);
    expect((await owner.detail(clean.id)).displays).toEqual([]); expect(settled.detail.session.endedAt).toBeUndefined();
  });

  it('does not misdiagnose a valid read-only account denial as selected scope or expand its grant', async () => {
    app = await startHarness();
    const owner = await app.account(), old = await owner.session('Kanvas Demo for Alex');
    const { client, tokenId } = await connect(owner, 'modern', undefined, ['read']);
    const before = (await app.runtime.store.list('session'));
    forbidden(await client.callTool({ name: 'kanvas_session_create', arguments: { name: 'Weekend in Bergen' } }));
    expect((await app.runtime.store.list('session'))).toEqual(before);
    expect(envelope<Detail>(await client.callTool({ name: 'kanvas_session_state', arguments: { sessionId: old.id } })).data.session.id).toBe(old.id);
    expect((await app.runtime.auth.tokenMetadata(owner.user!.id)).find(item => item.id === tokenId)).toMatchObject({ accessMode: 'account', scopes: ['read'] });
    expect((await app.runtime.auth.tokenMetadata(owner.user!.id)).find(item => item.id === tokenId)?.sessionIds).toBeUndefined();
  });
});
