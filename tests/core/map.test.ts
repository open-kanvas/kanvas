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
import { validateView } from '../../src/shared/view-schemas.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';

describe("map coverage 1", () => {
    describe("map contracts", () => {
        let h!: Harness, owner: Browser, sessionId: string, displayId: string, p: AuthPrincipal;
        const path = () => `/api/sessions/${sessionId}/displays/${displayId}`;
        const call = async (name: string, args: unknown) => (await h.runtime.service.execute(name, args, p));
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); sessionId = (await owner.session()).id; displayId = (await owner.display(sessionId)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        it('keeps map geometry exact when changing only the camera, checks source revision', async () => {
            await owner.submit(sessionId, [displayId], { version: 1, template: 'map', data: { markers: [{ lat: 58, lng: 8, label: 'Source' }] } });
            const requestId = randomUUID();
            await call("kanvas.map.camera", { sessionId, displayId, requestId, expectedRevision: 1, center: { lat: 59, lng: 9 }, zoom: 10 });
            const result = await owner.settle(sessionId, requestId);
            expect(result.detail.displays[0].view?.data.markers).toEqual([{ lat: 58, lng: 8, label: 'Source' }]);
            await expect(call("kanvas.map.camera", { sessionId, displayId, requestId: randomUUID(), expectedRevision: 1, center: { lat: 58, lng: 8 }, zoom: 10 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
        });
    });
});
