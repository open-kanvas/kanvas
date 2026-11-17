import { afterEach } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { startHarness } from './harness';
import type { Harness } from './harness';
import { visualHelp } from '../../src/server/visual-help';
import { parseCanonicalArguments } from '../../src/server/mcp/canonical';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical';
import { KEYBOARD_SHORTCUTS } from '../../src/shared/keyboard-shortcuts';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { success } from './harness';
import { PNG } from './harness';
import type { Browser } from './harness';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { materializeSeats } from '../../src/shared/venue';
import { VOCABULARY } from '../../src/shared/venue';
import { venueSchemas } from '../../src/shared/venue';
import { validateStatic } from '../../src/server/custom-templates';
import { validateCustomSchema } from '../../src/server/custom-templates';
import { bindTemplate } from '../../src/shared/custom-templates';
import { DiscoveryCatalog } from '../../src/server/mcp/discovery';
import { safeError } from '../../src/server/mcp/results';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical';
import { z } from 'zod';
import type { Request } from 'express';
import type { Response } from 'express';
import { inToolContext } from '../../src/server/mcp/call-context.js';
import { operationCatalog } from '../../src/server/mcp/discovery.js';
import { templateCatalog } from '../../src/server/mcp/discovery.js';
import { normalizeLoginCode } from '../../src/server/device-login.js';
import { loginRead } from '../../src/server/device-login.js';
import { loginDecide } from '../../src/server/device-login.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import type { NavigationSnapshot } from '../../src/shared/navigation.js';
import { randomUUID } from 'node:crypto';
import { fact } from './harness.js';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';

describe("discovery coverage 1", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('describes document-only reading settings and current-view zoom in discoverable schemas', () => {
        const tools = canonicalToolDefinitions();
        const config = tools.find(t => t.name === "kanvas.config.update")!;
        expect(config.description).toContain('only to documents');
        for (const field of ['readingFontSize', 'readingWpm', 'readingZoom']) {
            const serialized = JSON.stringify(config.inputSchema);
            expect(serialized).toContain(field);
            expect(serialized).toContain('only documents using the reading layout');
        }
        expect(tools.find(t => t.name === "kanvas.navigation.control")!.description).toContain('enlarge the current view');
    });
    function worker(clients: any) { const events: Record<string, Function> = {}; const registration = { showNotification: vi.fn() }; runInNewContext(readFileSync('public/sw.js', 'utf8'), { URL, self: { location: { origin: 'https://kanvas.test' }, clients, registration, addEventListener: (name: string, fn: Function) => events[name] = fn } }); return { events, registration }; }
});

describe("discovery coverage 2", () => {
    describe("discovery contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
        it('private templates repeat escaped data, normal replacement/patch works and discovery never leaks accounts', async () => {
            const t = await call("kanvas.account.templates.create", definition);
            const published = await call("kanvas.account.templates.publish", { templateId: t.id, values: { title: 'Team <one>', items: [{ name: 'Alex' }, { name: '<script>alert(1)</script>' }] }, sessionId: s, displayIds: [d] });
            await o.settle(s, published.requestId);
            const before = await current();
            expect(before.view!.data.html).toContain('&lt;script&gt;');
            expect(before.view!.data.html).toContain('<li>Alex</li>');
            await update("kanvas.display.edit", { data: { templateId: t.id, values: { title: 'Updated', items: [] } } });
            expect((await current()).view!.data.html).toContain('<h1>Updated</h1>');
            await update("kanvas.view.patch", { operations: [{ op: 'set', path: '/data/values/title', value: 'Patched' }] });
            expect((await current()).view!.data.html).toContain('<h1>Patched</h1>');
            const privateTemplates = await h.runtime.service.customTemplateCatalog(p);
            const catalog = new DiscoveryCatalog();
            const own: any = catalog.query('template', 'search', { query: 'Team list', limit: 20 }, { principal: p, privateTemplates });
            expect(JSON.stringify(own)).toContain(t.id);
            const outsider = await h.account(), other = { userId: outsider.user!.id };
            expect(await h.runtime.service.customTemplateCatalog(other)).toEqual([]);
            await expect(h.runtime.service.customTemplates.get(other, t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
            const sameName = await h.runtime.service.execute("kanvas.account.templates.create", definition, other) as any;
            expect(sameName.id).not.toBe(t.id);
            await call("kanvas.account.templates.delete", { templateId: t.id });
            expect((await current()).view!.data.html).toContain('Patched');
            await expect(update("kanvas.display.edit", { data: { templateId: t.id, values: { title: 'No', items: [] } } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        });
    });
});

describe("discovery coverage 3", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('publishes exact registry catalogs with only the calling account private templates', async () => {
        h = await startHarness();
        const a = await h.account(), s = await a.session('Catalog'), d = await a.display(s.id), service = h.runtime.service, p = { userId: a.user!.id };
        const update: any = await service.execute("kanvas.catalog.show", { sessionId: s.id, displayIds: [d.id], requestId: 'catalog-ops', catalog: 'operations' }, p);
        await a.settle(s.id, 'catalog-ops');
        const current = await service.display(p, s.id, d.id);
        expect(current.view?.template).toBe('catalog-list');
        expect(current.view?.data.items).toEqual(operationCatalog().slice().sort((a, b) => a.id.localeCompare(b.id, 'en')).map(x => x.id.replace(/^kanvas\.(template\.)?/, '')));
        const definition = { name: 'Owner catalog template', schema: { type: 'object', properties: {} }, html: '<p>Template</p>', css: '' };
        const own: any = await service.execute("kanvas.account.templates.create", definition, p);
        const other = await h.account();
        await service.execute("kanvas.account.templates.create", { ...definition, name: 'Foreign private template' }, { userId: other.user!.id });
        await service.execute("kanvas.catalog.show", { sessionId: s.id, displayIds: [d.id], requestId: 'catalog-templates', catalog: 'templates' }, p);
        await a.settle(s.id, 'catalog-templates');
        expect((await service.display(p, s.id, d.id)).view?.data.items).toHaveLength(templateCatalog().length + 1);
        expect(JSON.stringify((await service.display(p, s.id, d.id)).view)).toContain('Owner catalog template (account)');
        expect(JSON.stringify((await service.display(p, s.id, d.id)).view)).not.toContain('Foreign private template');
        expect(update).toBeTruthy();
    });
});

describe("discovery coverage 4", () => {
    let h!: Harness;
    afterEach(async () => { await h?.close(); });
    it('catalog templates use owner names and scope filters preserve private boundaries', async () => {
        h = await startHarness();
        const a = await h.account(), b = await h.account(), s = h.runtime.service, p = { userId: a.user!.id }, session = await a.session('Catalog scope'), d = await a.display(session.id);
        const definition = { name: 'My readable template', schema: { type: 'object', properties: {} }, html: '<p>Template</p>', css: '' };
        await s.execute("kanvas.account.templates.create", definition, p);
        await s.execute("kanvas.account.templates.create", { ...definition, name: 'Foreign secret' }, { userId: b.user!.id });
        for (const scope of ['account', 'system', 'all']) {
            await s.execute("kanvas.catalog.show", { sessionId: session.id, displayIds: [d.id], requestId: 'scope-' + scope, catalog: 'templates', scope }, p);
            await a.settle(session.id, 'scope-' + scope);
            const items = (await s.display(p, session.id, d.id)).view!.data.items as string[];
            expect(items.join(' ')).not.toContain('Foreign secret');
            if (scope === 'account') {
                expect(items).toHaveLength(1);
                expect(items[0]).toMatch(/^My readable template \(account\)/);
            }
            if (scope === 'system')
                expect(items.join(' ')).not.toContain('My readable template');
            if (scope === 'all')
                expect(items.length).toBeGreaterThan(1);
        }
    });
});

describe("discovery coverage 5", () => {
    let h!: Harness;
    afterEach(async () => { vi.restoreAllMocks(); delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; delete process.env.KANVAS_MAX_VIEWS_PER_SESSION; await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
    describe("discovery contracts", () => {
        it('discovers the new operations in every MCP profile', () => {
            for (const [canonical, tool, operation, args] of [
                ["kanvas.report.patch", 'kanvas_feedback', 'patch', { reportId: 'r', expectedRevision: 0, note: 'Finding' }],
                ["kanvas.asset.export", 'kanvas_import', 'asset.export', { sessionId: 's', assetId: 'a' }],
                ["kanvas.account.begin", 'kanvas_account', 'begin', { requestId: 'start' }],
            ] as const) {
                expect(resolveToolCall('legacy', canonical, args).error).toBeUndefined();
                expect(resolveToolCall('domains', tool, { operation, ...args }).error).toBeUndefined();
            }
        });
    });
});
