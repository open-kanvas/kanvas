
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { ViewSpec } from '../../src/shared/types.js';
import { toolFailure } from '../../src/server/mcp/results.js';
import { toolSuccess } from '../../src/server/mcp/results.js';
import { canonicalToolDefinitions } from '../../src/server/mcp/canonical.js';
import { operationEntries } from '../../src/server/mcp/operations.js';
import { AppError } from '../../src/server/store.js';
import { ACCESS_LIMITS } from '../../src/server/access-flows.js';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
describe("publishing coverage 1", () => {
    describe("publishing contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as any;
        const path = (id = displayId) => `/api/sessions/${sessionId}/displays/${id}`;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('replace_data works on every template and validation errors always carry issues', async () => {
            const chart = { version: 1, template: 'chart', data: { kind: 'line', series: [{ name: 'Observed', points: [{ x: '2026-01-01', y: 2 }] }] } } as ViewSpec;
            const revision = (await owner.submit(sessionId, [displayId], chart)).detail.displays[0].revision;
            const edited = await call("kanvas.display.edit", { sessionId, displayId, expectedRevision: revision, data: { kind: 'line', series: [{ name: 'Observed', points: [{ x: '2026-01-01', y: 5 }] }] } });
            expect(edited.revision).toBe(revision + 1);
            expect((await owner.detail(sessionId)).displays[0].view?.data).toMatchObject({ series: [{ points: [{ y: 5 }] }] });
            const invalid = await call("kanvas.display.edit", { sessionId, displayId, expectedRevision: revision + 1, data: { kind: 'line' } }).catch(error => error);
            expect(invalid).toMatchObject({ code: 'INVALID_ARGUMENT' });
            expect(invalid.issues.length).toBeGreaterThan(0);
            const mapped = toolFailure(new AppError('SOME_RULE', 'Explain the rule.', 400)).structuredContent as {
                error: {
                    code: string;
                    issues: unknown[];
                };
            };
            expect(mapped.error.code).toBe('INVALID_ARGUMENT');
            expect(mapped.error.issues).toEqual([{ path: 'arguments', problem: 'SOME_RULE: Explain the rule.' }]);
        });
    });
});
describe("publishing coverage 2", () => {
    let h!: Harness;
    afterEach(async () => { vi.restoreAllMocks(); delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT; delete process.env.KANVAS_MAX_VIEWS_PER_SESSION; await h?.close(); });
    async function principal(a: Browser) { const session = await h.runtime.auth.issueBrowser(a.user!.id, { cookie: () => { } } as unknown as Response); return { userId: a.user!.id, browserId: session.id }; }
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
    describe("publishing contracts", () => {
        it('omitted display targets the stable primary instead of blocking or broadcasting', async () => {
            h = await startHarness();
            const owner = await h.account(), p = await principal(owner), s = await owner.session(), first = await owner.display(s.id), second = await owner.display(s.id);
            const r: any = await h.runtime.service.execute("kanvas.submit", { sessionId: s.id, requestId: 'primary', view: fact('First screen only') }, p);
            expect(r.status).not.toBe('needs_target');
            expect(r.targets.map((x: any) => x.displayId)).toEqual([first.id]);
            expect((await h.runtime.service.display(p, s.id, second.id)).view).toBeNull();
        });
    });
});
