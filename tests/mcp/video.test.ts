
import { describe } from 'vitest';
import { operationRequest } from './requests.js';
import { operationEntries } from '../../src/server/mcp/operations.js';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { startHarness } from '../core/harness.js';
import { success } from '../core/harness.js';
import type { Browser } from '../core/harness.js';
import { CONTROL_MAPPING } from './operation-fixtures.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
describe("video coverage 1", () => {
    it.each(['modern', 'legacy'] as const)('exercises every new operation through the actual %s client with separate player identities and preserved scope', async (era) => {
        const h = await startHarness({ mcpProfile: "discovery", }), clients: Array<Client | LegacyClient> = [], seen = new Set<string>();
        const connect = async (browser: Browser, scopes = ['read', 'publish']) => {
            const token = success(await browser.request<{
                token: string;
            }>('POST', '/api/tokens', { name: 'Ephemeral integration client', scopes }));
            const client = era === 'modern' ? new Client({ name: 'round-acceptance', version: '1' }) : new LegacyClient({ name: 'round-acceptance', version: '1' });
            clients.push(client);
            const options = { requestInit: { headers: { Authorization: `Bearer ${token.token}` } } };
            if (client instanceof Client)
                await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), options));
            else
                await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), options));
            return client;
        };
        try {
            const owner = await h.account(), guest = await h.account(), s = (await owner.session()).id, d = (await owner.display(s)).id;
            const host = await connect(owner), other = await connect(guest), reader = await connect(owner, ['read']);
            const call = async <T>(tool: string, operation: string, args: Record<string, unknown> = {}, client: Client | LegacyClient = host): Promise<T> => {
                const result = await client.callTool(operationRequest({ name: tool, arguments: { operation, ...args } }));
                expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
                seen.add(`${tool}:${operation}`);
                return (result.structuredContent as {
                    data: T;
                }).data;
            };
            const catalog = await host.listTools();
            expect(catalog.tools).toHaveLength(2);
            expect(catalog.tools.some(t => t.name === 'kanvas_discover')).toBe(true);
            const composite = await host.callTool(operationRequest({
                name: "kanvas_discover",
                arguments: {
                    catalog: "templates",
                    action: "get",
                    id: `kanvas.template.${'presentation'}`,
                    expand: 'full'
                }
            }));
            expect(composite.isError).not.toBe(true);
            expect(composite.structuredContent).not.toHaveProperty('truncated');
            // Composite leaf growth may omit the illustrative example, never the complete schema.
            expect((composite.structuredContent as {
                data: {
                    entry: {
                        schema: unknown;
                    };
                };
            }).data.entry.schema).toHaveProperty('type', 'object');
            expect(JSON.stringify((composite.structuredContent as {
                data: {
                    entry: {
                        schema: unknown;
                    };
                };
            }).data.entry.schema)).toContain('progress');
            expect(Buffer.byteLength((composite.content as {
                text: string;
            }[])[0].text)).toBeLessThanOrEqual(384 * 1024);
            expect(catalog.tools.some(t => t.name === 'kanvas_games')).toBe(false);
            expect(operationEntries().some(entry => /^kanvas\.games?(?:\.|$)/.test(entry.operation))).toBe(false);
            await call("kanvas_call", "kanvas.submit", { sessionId: s, displayIds: [d], requestId: 'progress-seed', view: { version: 1, template: 'progress', data: { task: 'Verify exact source', events: [] } } });
            await owner.settle(s, 'progress-seed');
            await call("kanvas_call", "kanvas.progress.append", { sessionId: s, displayId: d, expectedRevision: 1, requestId: 'append-1', event: { id: 'source', title: 'Source checked', description: '9007199254740993.001', status: 'completed' } });
            expect((await owner.detail(s)).displays[0].revision).toBe(2);
            (await h.runtime.store.put('address-entitlement', { id: owner.user!.id, customAddresses: true, expiresAt: Date.now() + 60000 }));
            expect(await call("kanvas_call", "kanvas.address.customize", { sessionId: s, displayId: d, alias: 'testworkshop' })).toMatchObject({ alias: 'testworkshop', access: 'locator-only' });
            const invitation = await call<{
                sent: boolean;
            }>("kanvas_call", "kanvas.invite.create", { requestId: 'welcome-invite' });
            expect(invitation.sent).toBe(false);
            expect([...seen].filter(x => CONTROL_MAPPING.some(([, tool, op]) => x === `${tool}:${op}`)).sort()).toEqual(CONTROL_MAPPING.map(([, tool, op]) => `${tool}:${op}`).sort());
            expect((await guest.request('GET', `/api/sessions/${s}`)).status).toBe(404);
        }
        finally {
            await Promise.all(clients.map(c => c.close()));
            await h.close();
        }
    }, 20000);
});
