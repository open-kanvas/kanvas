import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { login } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { waitForDisplay } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { isolatedContext } from './support';

test.describe("timeline coverage 1", () => {
    async function setup(page: Page, info: TestInfo, baseURL: string) {
        const account = await register(page), s = await createSession(page, 'Evening acceptance'), d = await createDisplay(page, s, 'Retained content'), v = await openViewer(page, s, d.id);
        const issued = await sessionApi<{
            token: string;
        }>(page, '/api/tokens', 'POST', { name: 'Disposable evening checks', scopes: ['read', 'publish'] });
        expect(issued.status).toBe(201);
        const headers = { Authorization: `Bearer ${issued.data!.token}` }, client = info.project.name.startsWith('phone') ? new LegacyClient({ name: 'evening-legacy', version: '1' }) : new Client({ name: 'evening-current', version: '1' });
        if (client instanceof LegacyClient)
            await client.connect(new LegacyTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        else
            await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers } }));
        const call = async <T = any>(name: string, operation: string, args: Record<string, unknown> = {}) => { const r = await client.callTool(operationRequest({ name, arguments: { operation, ...args } })); expect(r.isError, `${name} ${operation}: ${JSON.stringify((r.structuredContent as any)?.error ?? {}).slice(0, 600)}`).not.toBe(true); return (r.structuredContent as {
            data: T;
        }).data; };
        const current = () => waitForDisplay(page, s, d.id, x => x.revision > 0 && x.appliedRevision === x.revision), show = async (view: ViewSpec) => { await publishPrepared(page, s, [d.id], view); return current(); };
        const nav = async (navigation: unknown) => { const before = await current(); return call("kanvas_call", "kanvas.navigation.control", { sessionId: s, displayId: d.id, expectedRevision: before.revision, requestId: randomUUID(), navigation }); };
        return { account, s, d, v, call, client, current, show, nav };
    }
    async function photo(page: Page, info: TestInfo, name: string) { await expect(page.locator('.viewer-toast')).toHaveCount(0, { timeout: 15000 }); await page.evaluate(() => document.fonts.ready); await mkdir(info.outputPath('visuals'), { recursive: true }); await page.screenshot({ path: `${info.outputPath('visuals')}/${info.project.name}-${name}.png`, animations: 'disabled' }); }
    test('long progress timelines alternate around a centered axis without overlap and preserve one-sided choice', async ({ page, baseURL }, info) => {
        const a = await setup(page, info, baseURL!);
        try {
            for (const orientation of ['horizontal', 'vertical']) {
                const view: ViewSpec = { version: 1, template: 'progress', data: { task: 'Verified release milestones', orientation, layout: 'alternating', events: Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, title: `Milestone ${i + 1}`, timestamp: `2026-09-17T${String(10 + i).padStart(2, '0')}:00:00Z`, status: i === 7 ? 'running' : 'completed', description: i % 3 === 0 ? 'A longer supplied description that must fit without crossing the timeline or another card.' : 'Verified source step.' })) } };
                await a.show(view);
                await expect(a.v.locator('[data-progress-layout]')).toHaveAttribute('data-progress-layout', 'alternating');
                await expect.poll(() => a.v.locator('.spine-connector').count()).toBe(8);
                const geometry = await a.v.locator('.spine-content').evaluate((root, orientation) => { const axis = root.querySelector('.spine-line')!, line = Number(axis.getAttribute(orientation === 'horizontal' ? 'y1' : 'x1')), box = root.getBoundingClientRect(); return [...root.querySelectorAll('.spine-card')].map((e, i) => { const r = e.getBoundingClientRect(); return { before: orientation === 'horizontal' ? r.bottom - box.top < line : r.right - box.left < line, after: orientation === 'horizontal' ? r.top - box.top > line : r.left - box.left > line, i }; }); }, orientation);
                geometry.forEach(({ before, after, i }) => expect(i % 2 === 0 ? before : after).toBe(true));
                await photo(a.v, info, `alternating-${orientation}`);
                await a.show({ ...view, data: { ...view.data, layout: 'single' } });
                await expect(a.v.locator('[data-progress-layout]')).toHaveAttribute('data-progress-layout', 'single');
            }
        }
        finally {
            await a.client.close();
        }
    });
});
