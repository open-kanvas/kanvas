import { describe } from 'vitest';
import { KANVAS_VERSION } from '../../src/shared/version.js';
import { operationRequest } from './requests.js';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from '../core/harness.js';
import type { Harness } from '../core/harness.js';

describe("checklist coverage 1", () => {
    let h!: Harness, client: Client | LegacyClient;
    afterEach(async () => { await client?.close(); await h?.close(); });
    it.each(['modern', 'legacy'])('%s real MCP restores a durable checklist and exposes only own account details', async (era) => {
        h = await startHarness({ mcpProfile: "discovery" });
        const owner = await h.account(), s = await owner.session(), d = await owner.display(s.id), second = await owner.display(s.id);
        const token = await h.runtime.auth.issueToken(owner.user!.id, 'Disposable October4 checks', ['read', 'publish']);
        const headers = { Authorization: 'Bearer ' + token.value };
        if (era === 'modern') {
            client = new Client({ name: 'oct04-current', version: '1' });
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers } }));
        }
        else {
            client = new LegacyClient({ name: 'oct04-legacy', version: '1' });
            await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers } }));
        }
        const call = async (name: string, operation: string, args: Record<string, unknown> = {}) => {
            const result = await client.callTool(operationRequest({ name, arguments: { operation, ...args } }));
            expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
            return (result.structuredContent as {
                data: any;
            }).data;
        };
        const details = await call("kanvas_call", "kanvas.account.details");
        expect(details.id).toBe(owner.user!.id);
        expect(details.tier).toBe('trial');
        const invalid = await client.callTool(operationRequest({
            name: "kanvas_call",
            arguments: {
                operationId: "kanvas.account.details",
                arguments: {
                    accountId: 'not-the-owner'
                }
            }
        }));
        expect(invalid.isError).toBe(true);
        await owner.submit(s.id, [d.id], { version: 1, template: 'checklist', title: 'Checklist', data: { items: [{ id: 'a', text: 'Review', checked: false }] } });
        const list = await call("kanvas_call", "kanvas.checklist.read", { sessionId: s.id }), key = list.checklists[0].id;
        const read = await call("kanvas_call", "kanvas.checklist.read", { sessionId: s.id, checklistId: key });
        expect(read.view.data.items[0].checked).toBe(false);
        const edited = await call("kanvas_call", "kanvas.checklist.update", { sessionId: s.id, checklistId: key, expectedRevision: read.revision, requestId: 'edit', items: [{ id: 'a', text: 'Review', checked: true }] });
        expect(edited.revision).toBe(1);
        const shown = await call("kanvas_call", "kanvas.checklist.show", { sessionId: s.id, checklistId: key, displayId: second.id, expectedRevision: 0, requestId: 'show' });
        expect(shown.status).toBe('prepared');
        expect((await owner.detail(s.id)).displays.find(x => x.id === second.id)!.view!.data.items).toEqual([{ id: 'a', text: 'Review', checked: true }]);
        if (era === 'legacy') {
            const info = (client as LegacyClient).getServerVersion();
            expect(info?.icons).toEqual([{ src: 'http://127.0.0.1/favicon-48.png?v=' + KANVAS_VERSION, mimeType: 'image/png', sizes: ['48x48'] }, { src: 'http://127.0.0.1/icons/kanvas-192.png?v=' + KANVAS_VERSION, mimeType: 'image/png', sizes: ['192x192'] }, { src: 'http://127.0.0.1/icons/kanvas-512.png?v=' + KANVAS_VERSION, mimeType: 'image/png', sizes: ['512x512'] }, { src: 'http://127.0.0.1/favicon.svg?v=' + KANVAS_VERSION, mimeType: 'image/svg+xml', sizes: ['any'] }]);
            expect((info as {
                websiteUrl?: string;
            } | undefined)?.websiteUrl).toBe('https://open-kanvas.ai');
        }
    }, 30000);
});
