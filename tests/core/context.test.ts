import { randomUUID } from 'node:crypto';
import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { PNG } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { DisplayRecord } from '../../src/shared/types.js';
import type { InteractionRecord } from '../../src/shared/types.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';

describe("context coverage 1", () => {
    describe("context contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${s}/displays/${d}`;
        const call = async <T = Record<string, unknown>>(name: string, args: unknown) => (await h.runtime.service.execute(name, args, p)) as Promise<T>;
        const current = async () => (await owner.detail(s)).displays.find(x => x.id === d)!;
        const settle = async (update: UpdateRecord) => owner.settle(s, update.requestId);
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        async function guest(interactive: boolean) {
            const share = await call<{
                id: string;
            }>("kanvas.share.create", { sessionId: s, displayId: d, allowInteraction: interactive });
            const g = h.browser();
            const pair = success(await g.request<{
                id: string;
            }>('POST', '/api/pairings', { shareId: share.id, deviceName: 'Evening test screen', requestedInteractive: interactive }));
            await call("kanvas.pairing.decide", { sessionId: s, pairingId: pair.id, approve: true, confirm: true, interactive });
            success(await g.request('GET', `/api/pairings/${pair.id}/status`));
            g.csrf = success(await g.request<{
                csrfToken: string;
            }>('GET', '/api/auth/me')).csrfToken;
            return g;
        }
        it('notifies context changes once, never stores coordinates in the inbox and ignores late consent resurrection', async () => {
            await owner.submit(s, [d], fact('Weather context'));
            const base = { tabId: 'location-tab', sequence: 1, revision: 1, renderedRevision: 1, status: 'ready', visible: true, text: 'Weather', width: 443, height: 823, context: { consent: true, timeZone: 'Europe/Oslo', locationStatus: 'requesting' } };
            success(await owner.request('POST', `${path()}/observe`, base));
            const granted = { ...base, sequence: 2, context: { ...base.context, locationStatus: 'granted', location: { latitude: 58.461234, longitude: 8.771234, accuracy: 15 } } };
            success(await owner.request('POST', `${path()}/observe`, granted));
            success(await owner.request('POST', `${path()}/observe`, { ...granted, sequence: 3 }));
            success(await owner.request('POST', `${path()}/observe`, { ...granted, sequence: 4, context: null }));
            expect(success(await owner.request<{
                ignored: boolean;
            }>('POST', `${path()}/observe`, granted)).ignored).toBe(true);
            expect(success(await owner.request<{
                ignored: boolean;
            }>('POST', `${path()}/observe`, { ...granted, sequence: undefined })).ignored).toBe(true);
            const events = (await owner.detail(s)).interactions.filter(x => x.actionId === 'viewer.context');
            expect(events).toHaveLength(3);
            expect(JSON.stringify(events)).not.toMatch(/58\.461234|8\.771234|latitude|longitude/);
            expect(events.at(-1)?.value).toMatchObject({ consent: false, locationStatus: 'withdrawn' });
            const viewers = await call<{
                context: unknown;
            }[]>("kanvas.viewers.read", { sessionId: s });
            expect(viewers[0].context).toBeNull();
        });
    });
});
