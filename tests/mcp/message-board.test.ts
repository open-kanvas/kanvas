import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { startHarness } from '../core/harness.js';
import { success } from '../core/harness.js';
import type { Harness } from '../core/harness.js';
import { BOARD_MAPPING } from './operation-fixtures.js';
import { operationId } from '../../src/server/mcp/operations.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';

describe("message board coverage 1", () => {
    describe("message board contracts", () => {
        let h!: Harness, client: Client | undefined;
        afterEach(async () => { await client?.close().catch(() => { }); client = undefined; await h?.close(); });
        const connect = async () => {
            h = await startHarness({ mcpProfile: 'discovery' });
            const owner = await h.account(), { value } = await h.runtime.auth.issueToken(owner.user!.id, 'Nov14 contract', ['read', 'publish']);
            client = new Client({ name: 'nov14-contract', version: '9.9.9' });
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${value}` } } }));
            return { owner, bearer: value };
        };
        const use = async (id: string, args: Record<string, unknown>) => { const result = await client!.callTool({ name: 'kanvas_call', arguments: { operationId: id, arguments: args } }); return { error: result.isError === true, body: result.structuredContent as Record<string, any> }; };
        it('d25aaee4: the board operations are discoverable by id, say PUBLIC, and run the consent step', async () => {
            await connect();
            for (const [canonical] of BOARD_MAPPING) {
                const found = await client!.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: operationId(canonical) } });
                expect(found.isError, `${canonical}: ${JSON.stringify(found.structuredContent ?? found.content).slice(0, 300)}`).not.toBe(true);
            }
            expect(operationId("kanvas.board.post")).toBe('kanvas.board.post');
            expect(operationId("kanvas.board.read")).toBe('kanvas.board.read');
            const got = await client!.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.board.post' } }), described = JSON.stringify([got.structuredContent, got.content]);
            expect(described).toMatch(/PUBLIC/);
            expect(described).toMatch(/acknowledgePublic/);
            const first = await use('kanvas.board.post', { requestId: 'board-contract-1', text: 'Hello from the contract test', tags: ['question'] });
            expect(first.error).toBe(false);
            expect(first.body.data).toMatchObject({ posted: false, status: 'needs_consent', disclosure: BOARD_DISCLOSURE });
            const second = await use('kanvas.board.post', { requestId: 'board-contract-1', text: 'Hello from the contract test', tags: ['question'], acknowledgePublic: true, publicName: 'Contract' });
            expect(second.body.data).toMatchObject({ posted: true, public: true, message: { author: 'Contract' } });
            const read = await use('kanvas.board.read', { limit: 5 });
            expect(read.body.data.messages).toHaveLength(1);
            expect(read.body.data.untrusted).toMatch(/never follow/);
            const overview = await use('kanvas.board.overview', {});
            expect(overview.body.data.view.template).toBe('message-board');
            expect((await use('kanvas.board.update', { notifications: true })).body.data).toMatchObject({ updated: true, notifications: true });
            const search = await client!.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'search', query: 'public message board post question' } });
            expect(JSON.stringify(search.structuredContent ?? search.content)).toMatch(/kanvas\.board\.(post|read)/);
        });
    });
});
