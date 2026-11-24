
import { operationRequest } from './requests.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it, vi } from 'vitest';
import { operationEntries } from '../../src/server/mcp/operations';
import type { DisplayRecord, UpdateRecord } from '../../src/shared/types';
import { fact, startHarness, type Harness } from '../core/harness';
const harnesses: Harness[] = [], clients: (Client | LegacyClient)[] = [];
afterEach(async () => { for (const c of clients.splice(0))
    await c.close(); for (const h of harnesses.splice(0))
    await h.close(); });
it.each(['modern', 'legacy'] as const)('performs first publication and ordinary slide navigation through the real %s MCP client without setup calls', async (era) => {
    const h = await startHarness({ mcpProfile: "discovery" });
    harnesses.push(h);
    const b = await h.account(), issued = (await h.runtime.auth.issueToken(b.user!.id, 'Synthetic MCP acceptance'));
    const home = (await h.runtime.store.list<DisplayRecord>('display'));
    expect(home).toHaveLength(1);
    const options = { requestInit: { headers: { Authorization: `Bearer ${issued.value}` } } };
    const client = era === 'modern' ? new Client({ name: 'publish-first', version: '1' }) : new LegacyClient({ name: 'publish-first', version: '1' });
    clients.push(client);
    await client.connect(era === 'modern' ? new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), options) : new LegacyTransport(new URL('/mcp', h.baseUrl), options));
    const call = async <T>(name: string, operation: string, args: Record<string, unknown> = {}) => {
        const result = await client.callTool(operationRequest({ name, arguments: { operation, ...args } }));
        expect(result.isError).not.toBe(true);
        return (result.structuredContent as {
            data: T;
        }).data;
    };
    const catalog = await client.listTools();
    expect(catalog.tools).toHaveLength(2);
    const inventory = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'operations', action: 'list' } });
    expect(((inventory.content as {
        text: string;
    }[])[0]).text.split('\n').filter(line => line.includes(' — '))).toHaveLength(operationEntries().length);
    const contract = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'operations', action: 'get', id: 'kanvas.publish' } });
    const definition = (contract.structuredContent as any).data.entry;
    expect(definition.requiredInputs).not.toContain('sessionId');
    expect(definition.inputSchema.properties).toHaveProperty('newSession');
    expect(definition.description).toContain('targetRef');
    const receipt = await call<UpdateRecord & {
        targetRef: string;
        targets: {
            viewerUrl: string;
            shortUrl: string;
        }[];
    }>("kanvas_call", "kanvas.publish", {
        requestId: 'first', view: JSON.stringify({ version: 1, template: 'presentation', data: { slides: [fact('First'), fact('Second')], index: 0 } }),
    });
    expect(receipt.status).toBe('accepted');
    expect(receipt.targets[0].viewerUrl).toContain(`/view/${receipt.sessionId}/`);
    expect(receipt.targets[0].shortUrl).toContain('/s/');
    expect(receipt.targetRef).toBeTruthy();
    let update: UpdateRecord;
    await vi.waitFor(async () => { update = await call("kanvas_call", "kanvas.update.status", { sessionId: receipt.sessionId, requestId: 'first' }); expect(update.status).toBe('prepared'); });
    const moved = await call<UpdateRecord>("kanvas_call", "kanvas.presentation.navigate", { sessionId: receipt.sessionId, displayId: receipt.displayIds[0], requestId: 'next', expectedRevision: String(update!.revisions[receipt.displayIds[0]]), action: 'next' });
    const read = await call<UpdateRecord>("kanvas_call", "kanvas.update.status", { sessionId: receipt.sessionId, requestId: 'next' });
    expect(read.id).toBe(moved.id);
    const current = await call("kanvas_call", "kanvas.display.current", { sessionId: receipt.sessionId, displayId: receipt.displayIds[0] });
    expect(current).toHaveProperty('view.data.index', 1);
    const replay = await call<UpdateRecord>("kanvas_call", "kanvas.publish", { requestId: 'continued', targetRef: receipt.targetRef, view: fact('Same target.') });
    expect(replay.sessionId).toBe(receipt.sessionId);
    expect((await h.runtime.store.list('session'))).toHaveLength(2);
    expect((await h.runtime.store.get('display', home[0].id))).toEqual(home[0]);
});
