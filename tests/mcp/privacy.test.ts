import { describe } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from '../core/harness';
import { success } from '../core/harness';
import { fact } from '../core/harness';
import type { Harness } from '../core/harness';
import { PRIVACY_MAPPING } from './operation-fixtures.js';

describe("privacy coverage 1", () => {
    let h!: Harness;
    const clients: (Client | LegacyClient)[] = [];
    afterEach(async () => { for (const c of clients.splice(0))
        await c.close(); await h?.close(); });
    it.each(['modern', 'legacy'] as const)('%s SDK enforces all three owner locks and records raw attributed calls', async (era) => {
        h = await startHarness();
        const owner = await h.account(), other = await h.account(), s = await owner.session(), d = await owner.display(s.id);
        await owner.submit(s.id, [d.id], fact('Retained private source'));
        const device = success(await owner.request<{
            id: string;
        }>('POST', '/api/devices/register', { installationId: 'nov05-fixture', provisionHome: false }));
        async function connect(userId: string, scopes = ['read', 'publish']) {
            const token = await h.runtime.auth.issueToken(userId, 'Nov05 fixture', scopes), headers = { Authorization: 'Bearer ' + token.value };
            const c = era === 'modern' ? new Client({ name: 'nov05-test', version: '1' }) : new LegacyClient({ name: 'nov05-test', version: '1' });
            clients.push(c);
            const url = new URL('/mcp', h.baseUrl);
            if (c instanceof Client)
                await c.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
            else
                await c.connect(new LegacyTransport(url, { requestInit: { headers } }));
            return c;
        }
        const ownerClient = await connect(owner.user!.id), foreign = await connect(other.user!.id), readOnly = await connect(owner.user!.id, ['read']);
        const exercised = new Set<string>();
        for (const [name] of PRIVACY_MAPPING) {
            const operationId = name;
            const args = name === "kanvas.display.lockdown" ? { sessionId: s.id, displayId: d.id, locked: true } : { deviceId: device.id };
            const request = { name: 'kanvas_call', arguments: { operationId, arguments: args } };
            expect((await foreign.callTool(request)).isError).toBe(true);
            expect((await readOnly.callTool(request)).isError).toBe(true);
            const result = await ownerClient.callTool(request);
            expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
            exercised.add(name);
            if (name === "kanvas.device.lock")
                expect((await owner.request('GET', `/api/sessions/${s.id}`)).status).toBe(423);
            if (name === "kanvas.device.unlock")
                expect((await owner.detail(s.id)).displays[0].view?.data.text).toBe('Retained private source');
        }
        expect([...exercised].sort()).toEqual(PRIVACY_MAPPING.map(([name]) => name).sort());
        expect((await owner.detail(s.id)).displays[0].lockdown).toBe(true);
        const events = (await h.runtime.store.query("SELECT * FROM events WHERE event_type='tool.call' AND user_id=$1", [owner.user!.id])).rows;
        expect(events.filter(e => e.status === 'completed')).toHaveLength(3);
        expect(events.every(e => e.client_context.clientName === 'nov05-test' && e.principal.startsWith('token:'))).toBe(true);
        expect(events.filter(e => e.status === 'failed')).toHaveLength(3);
    }, 30000);
});
