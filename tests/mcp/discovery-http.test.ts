import { TEMPLATE_IDS } from '../../src/shared/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { harness } from './harness.js';
import { startHarness, fact, PNG, type Harness } from '../core/harness.js';
import { DISCOVERY_TOOL_NAMES, type McpProfile } from '../../src/server/mcp/operations.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { currentToolContext } from '../../src/server/mcp/call-context.js';
const fixtureServers: Awaited<ReturnType<typeof harness>>[] = [], servers: Harness[] = [], clients: (Client | LegacyClient)[] = [];
afterEach(async () => { await Promise.allSettled(clients.splice(0).map(c => c.close())); for (const h of fixtureServers.splice(0)) await h.close(); for (const h of servers.splice(0)) await h.close(); vi.restoreAllMocks(); });
const data = (result: any): any => { expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true); return result.structuredContent.data; };
const use = (client: Client | LegacyClient, operationId: string, args: Record<string, unknown> = {}) => client.callTool({ name: 'kanvas_call', arguments: { operationId, arguments: args } });

describe('two-tool authenticated HTTP contract', () => {
  it.each(['discovery', 'domains', 'twelve', 'legacy'] as McpProfile[])('lists exactly two for profile %s in both protocol eras; discovery never executes or records mutations', async profile => {
    const h = await harness({ profile }); fixtureServers.push(h);
    const record = vi.fn(); h.service.recordToolCall = record;
    const token = h.service.issue('owner');
    for (const era of ['modern', 'legacy'] as const) {
      record.mockClear();
      const { client } = await h[era](token);
      const tools = (await client.listTools()).tools;
      expect(tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
      const count = h.service.calls.length;
      for (const catalog of ['tools','templates','help']) {
        const listed = await client.callTool({ name:'kanvas_discover', arguments:{catalog,action:'list'} });
        expect(listed.isError).not.toBe(true); expect(listed.structuredContent).toBeUndefined();
        expect(((listed.content as {text:string}[])[0]).text).toContain('(complete)');
        const searched = data(await client.callTool({name:'kanvas_discover',arguments:{catalog,action:'search',query:'display'}}));
        expect(searched.results.length).toBeGreaterThan(0);
        expect(Object.keys(searched.results[0]).sort()).toEqual(['description','id']);
        const got=data(await client.callTool({name:'kanvas_discover',arguments:{catalog,action:'get',id:searched.results[0].id}}));
        expect(got.entry.id).toBe(searched.results[0].id);
      }
      for (const name of ['kanvas_tool_use','kanvas_tool_search','kanvas_help_search','kanvas_template_index','kanvas_session_state','kanvas_session']) expect((await client.callTool({name,arguments:{sessionId:'alpha',operation:'state'}})).isError).toBe(true);
      expect(h.service.calls.length).toBe(count); expect(record).not.toHaveBeenCalled();
      const invalid = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: '', unexpected: true } }); expect(invalid.isError).toBe(true);
      expect(record).not.toHaveBeenCalled();
      expect((await use(client, 'kanvas.session.state', { sessionId: 'alpha' })).isError).not.toBe(true);
      expect(h.service.calls.at(-1)).toMatchObject({ name: 'kanvas_session_state', userId: 'owner', args: { sessionId: 'alpha' } });
      expect((await client.callTool({ name: 'unknown_method', arguments: {} })).isError).toBe(true);
    }
  });
  it.each(['modern', 'legacy'] as const)('%s preserves errors, image content, invocation context, nested session metadata and cancellation signal', async era => {
    const h = await harness({ profile: 'discovery' }); fixtureServers.push(h);
    const record = vi.fn(), failures = vi.fn(); h.service.recordToolCall = record; h.service.recordFailure = failures;
    const { client } = await h[era](h.service.issue('owner'));
    const execute = vi.spyOn(h.service, 'execute').mockImplementation(async (name, args, principal, options) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(currentToolContext()).toMatchObject({ tool: 'kanvas_call', operation: 'kanvas.display.snapshot', canonicalName: 'kanvas_display_snapshot' });
      expect(args.sessionId).toBe('alpha'); expect(principal.userId).toBe('owner');
      return new VisualCaptureResult({ sessionId: 'alpha' }, Buffer.from(PNG, 'base64'), 'image/png');
    });
    const result = await use(client, 'kanvas.display.snapshot', { sessionId: 'alpha', displayId: 'd' });
    expect(result.isError).not.toBe(true);
    expect(result.content).toContainEqual({ type: 'image', mimeType: 'image/png', data: PNG });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }), expect.objectContaining({ tool: 'kanvas_call', operation: 'kanvas.display.snapshot', sessionId: 'alpha', status: 'completed' }));
    execute.mockRejectedValue(new Error('PRIVATE_ERROR_MUST_NOT_LEAK'));
    const error = await use(client, 'kanvas.display.snapshot', { sessionId: 'alpha', displayId: 'd' });
    expect(error.isError).toBe(true); expect(JSON.stringify(error)).not.toContain('PRIVATE_ERROR_MUST_NOT_LEAK');
    expect(record).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sessionId: 'alpha', status: 'failed' }));
    const invalid = await use(client, 'kanvas.display.snapshot', { sessionId: 'alpha' });
    expect(invalid.isError).toBe(true); expect(record).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ sessionId: 'alpha', status: 'failed' }));
    expect(failures).toHaveBeenLastCalledWith('kanvas_display_snapshot', { sessionId: 'alpha' }, expect.objectContaining({ userId: 'owner' }), expect.anything());
  });
  it.each(['modern', 'legacy'] as const)('%s forwards actual cancellation to a cooperative operation without losing principal context', async era => {
    const h = await harness({ profile: 'discovery' }); fixtureServers.push(h);
    const { client } = await h[era](h.service.issue('owner'));
    const controller = new AbortController(); let entered!: () => void, cancelled = false;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(h.service, 'execute').mockImplementation(async (_name, _args, principal, context) => {
      expect(principal.userId).toBe('owner'); entered();
      return new Promise((_resolve, reject) => context!.signal!.addEventListener('abort', () => { cancelled = true; reject(context!.signal!.reason); }, { once: true }));
    });
    const call = { name: 'kanvas_call', arguments: { operationId: 'kanvas.session.state', arguments: { sessionId: 'alpha' } } };
    const promise = (era === 'modern' ? (client as Client).callTool(call, { signal: controller.signal }) : (client as LegacyClient).callTool(call, undefined, { signal: controller.signal })).then(() => false, () => true);
    await started; controller.abort(); expect(await promise).toBe(true);
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });
  it.each(['modern', 'legacy'] as const)('%s executes formerly nested read/write capabilities with read-scope, selected-session and cross-account parity', async era => {
    const h = await startHarness({ mcpProfile: 'discovery' }); servers.push(h);
    const owner = await h.account(), other = await h.account();
    const session = await owner.session(), display = await owner.display(session.id), second = await owner.display(session.id), outside = await owner.session(), foreign = await other.session();
    const connect = async (scopes: string[], selected?: string[]) => {
      const token = await h.runtime.auth.issueToken(owner.user!.id, 'Discovery acceptance', scopes, selected);
      const options = { requestInit: { headers: { Authorization: `Bearer ${token.value}` } } };
      if (era === 'modern') { const client = new Client({ name: 'discovery-modern', version: '1' }); clients.push(client); await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), options)); return client; }
      const client = new LegacyClient({ name: 'discovery-legacy', version: '1' }); clients.push(client); await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), options)); return client;
    };
    const client = await connect(['read', 'publish']);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    await owner.submit(session.id, [display.id], { version: 1, template: 'checklist', data: { items: [{ id: 'a', text: 'Read exact source', checked: false }] } });
    const found = data(await use(client, 'kanvas.checklist.read', { sessionId: session.id }));
    const checklistId = found.checklists[0].id;
    const read = data(await use(client, 'kanvas.checklist.read', { sessionId: session.id, checklistId }));
    const edited = data(await use(client, 'kanvas.checklist.update', { sessionId: session.id, checklistId, expectedRevision: read.revision, requestId: 'edit', items: [{ id: 'a', text: 'Read exact source', checked: true }] }));
    expect(edited.revision).toBe(read.revision + 1);
    data(await use(client, 'kanvas.checklist.show', { sessionId: session.id, checklistId, displayId: second.id, expectedRevision: 0, requestId: 'show' }));
    const current = data(await use(client, 'kanvas.display.current', { sessionId: session.id, displayId: second.id })); expect(current.view.data.items[0].checked).toBe(true);
    expect((await use(client, 'kanvas.session.state', { sessionId: foreign.id })).isError).toBe(true);
    const readOnly = await connect(['read'], [session.id]);
    data(await use(readOnly, 'kanvas.session.state', { sessionId: session.id }));
    expect((await use(readOnly, 'kanvas.session.state', { sessionId: outside.id })).isError).toBe(true);
    expect((await use(readOnly, 'kanvas.checklist.update', { sessionId: session.id, checklistId, expectedRevision: edited.revision, requestId: 'forbidden', items: [{ id: 'a', text: 'Unauthorized change', checked: false }] })).isError).toBe(true);
    const scoped = await connect(['read', 'publish'], [session.id]);
    expect((await use(scoped, 'kanvas.session.create', { name: 'Must not escape scope' })).isError).toBe(true);
    expect((await use(scoped, 'kanvas.account.details')).isError).toBe(true);
    expect(data(await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.checklist.show' } })).entry.id).toBe('kanvas.checklist.show');
    // Static built-in contracts are safe for selected-session readers; no account content is read.
    const inventory = await readOnly.callTool({name:'kanvas_discover',arguments:{catalog:'templates',action:'list'}});
    expect(((inventory.content as {text:string}[])[0]).text.split('\n').filter(line=>line.includes(' — '))).toHaveLength(TEMPLATE_IDS.length);
  }, 30000);
});
