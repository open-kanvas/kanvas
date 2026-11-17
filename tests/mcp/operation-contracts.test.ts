import { describe } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Response } from 'express';
import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from '../core/harness';
import { success } from '../core/harness';
import type { Harness } from '../core/harness';
import { EXPERIENCE_MAPPING } from './operation-fixtures.js';

describe("operation contracts coverage 1", () => {
    let h!: Harness;
    const clients: (Client | LegacyClient)[] = [];
    afterEach(async () => { for (const c of clients.splice(0))
        await c.close(); await h?.close(); });
    it.each(['modern', 'legacy'] as const)('%s SDK executes all six independently listed November operations against real state', async (era) => {
        h = await startHarness({ mcpProfile: "discovery" });
        const owner = await h.account(), other = await h.account(), p = { userId: owner.user!.id }, svc = h.runtime.service;
        svc.accounts.serviceAdmins.add(p.userId);
        async function connect(userId: string, scopes: string[] = ['read', 'publish']) { const token = await h.runtime.auth.issueToken(userId, 'November fixture', scopes); const headers = { Authorization: 'Bearer ' + token.value }; const c = era === 'modern' ? new Client({ name: 'november', version: '1' }) : new LegacyClient({ name: 'november', version: '1' }); clients.push(c); const url = new URL('/mcp', h.baseUrl); if (c instanceof Client)
            await c.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
        else
            await c.connect(new LegacyTransport(url, { requestInit: { headers } })); return c; }
        const client = await connect(p.userId), foreign = await connect(other.user!.id), readOnly = await connect(p.userId, ['read']);
        expect((await client.listTools()).tools.map(t => t.name).sort()).toEqual(['kanvas_call', 'kanvas_discover']);
        const exercised = new Set<string>();
        const request = (c: Client | LegacyClient, id: string, args: Record<string, unknown>) => c.callTool({ name: 'kanvas_call', arguments: { operationId: id, arguments: args } });
        const call = async (id: string, args: Record<string, unknown>) => { const r = await request(client, id, args); expect(r.isError, JSON.stringify(r.structuredContent)).not.toBe(true); exercised.add(id); return (r.structuredContent as {
            data: any;
        }).data; };
        const catalog = await call('kanvas.guidance.suggestions.list', {});
        expect(catalog.suggestions.some((x: any) => x.suggestionId === 'passive')).toBe(true);
        const save = { suggestionId: 'sdk', name: 'SDK source', text: 'Original editorial text', expectedRevision: 0, requestId: 'save' };
        expect((await request(foreign, 'kanvas.guidance.suggestions.save', save)).isError).toBe(true);
        const saved = await call('kanvas.guidance.suggestions.save', save);
        expect(saved.revision).toBe(1);
        expect(await call('kanvas.guidance.suggestions.save', save)).toEqual(saved);
        expect((await request(readOnly, 'kanvas.guidance.suggestions.save', { ...save, requestId: 'read-denied' })).isError).toBe(true);
        const active = await svc.guidance.read(p, { scope: 'user' });
        const copied = await call('kanvas.guidance.suggestions.import', { suggestionId: 'sdk', expectedRevision: 1, promptId: 'private-sdk', requestId: 'copy' });
        expect(copied).toMatchObject({ activated: false, source: { suggestionId: 'sdk', revision: 1 } });
        expect(copied.prompt.text).toBe('Original editorial text');
        expect(await svc.guidance.read(p, { scope: 'user' })).toEqual(active);
        await call('kanvas.guidance.suggestions.save', { ...save, text: 'Edited source', expectedRevision: 1, requestId: 'edit' });
        expect((await request(client, 'kanvas.guidance.suggestions.import', { suggestionId: 'sdk', expectedRevision: 1, promptId: 'stale-copy', requestId: 'stale' })).isError).toBe(true);
        const removed = await call('kanvas.guidance.suggestions.delete', { suggestionId: 'sdk', expectedRevision: 2, requestId: 'delete' });
        expect(removed.deleted).toBe(true);
        expect((await svc.guidance.library(p, {}, 'list') as any).prompts[0].text).toBe('Original editorial text');
        const session = await owner.session(), display = await owner.display(session.id);
        await owner.submit(session.id, [display.id], { version: 1, template: 'satisfaction', data: { surveyId: 'sdk-survey' } });
        const revision = (await owner.detail(session.id)).displays[0].revision;
        success(await owner.request('POST', `/api/sessions/${session.id}/displays/${display.id}/respond`, { revision, requestId: 'rate', value: { kind: 'satisfaction.rate', rating: 5 } }));
        const range = { sessionId: session.id, displayId: display.id, from: new Date(Date.now() - 60000).toISOString(), to: new Date(Date.now() + 60000).toISOString() };
        const total = await call('kanvas.satisfaction.read', range);
        expect(total.total).toBe(1);
        expect(total.counts['5']).toBe(1);
        expect((await request(foreign, 'kanvas.satisfaction.read', range)).isError).toBe(true);
        const bs = await h.runtime.auth.issueBrowser(p.userId, { cookie: () => { } } as unknown as Response), receiver = { ...p, browserId: bs.id };
        const device = await svc.devices.register(receiver, { installationId: 'sdk-window' }, 'Chrome/140'), w = await svc.devices.windows.register(receiver, device.id, 'sdk'), sibling = await svc.devices.windows.register(receiver, device.id, 'sibling');
        const stream = await svc.devices.windows.stream(receiver, device.id, w.id, () => { });
        try {
            await svc.devices.windows.report(receiver, device.id, w.id, { destination: 'overview' });
            const input = { deviceId: device.id, windowId: w.id, expectedVersion: 0, requestId: 'viewport', navigation: { action: 'zoom', scale: 2 } };
            const result = await call('kanvas.window.viewport', input);
            expect(result.window.overviewScale).toBe(2);
            expect(result.window.command.status).toBe('pending');
            expect((await call('kanvas.window.viewport', input)).commandId).toBe(result.commandId);
            expect((await request(foreign, 'kanvas.window.viewport', { ...input, requestId: 'foreign-window' })).isError).toBe(true);
            await svc.devices.windows.report(receiver, device.id, w.id, { destination: 'viewport', commandId: result.commandId });
            const windows = (await svc.devices.list(receiver)).devices[0].windows;
            expect(windows.find(x => x.id === w.id)?.command?.status).toBe('applied');
            expect(windows.find(x => x.id === sibling.id)?.overviewScale).toBe(1);
        }
        finally {
            stream.close();
        }
        expect([...exercised].sort()).toEqual(EXPERIENCE_MAPPING.map(([name]) => 'kanvas.' + name.slice(7).replaceAll('_', '.')).sort());
    }, 30000);
});
