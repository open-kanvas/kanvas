import { beforeEach } from 'vitest';
import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { startHarness } from './harness';
import { success } from './harness';
import { PNG } from './harness';
import type { Harness } from './harness';
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

describe("menu coverage 1", () => {
    describe("menu contracts", () => {
        let h!: Harness, o: Browser, s: string, d: string, p: {
            userId: string;
        };
        beforeEach(async () => { h = await startHarness(); o = await h.account(); s = (await o.session()).id; d = (await o.display(s)).id; p = { userId: o.user!.id }; });
        afterEach(async () => { await h?.close(); });
        const call = (name: string, args: Record<string, unknown> = {}) => h.runtime.service.execute(name, args, p) as Promise<any>;
        const update = (name: string, args: Record<string, unknown>) => call(name, { sessionId: s, displayId: d, ...args });
        const publish = async (template: any, data: any) => { const result = await o.submit(s, [d], { version: 1, template, data }); expect(result.update.status).toBe('prepared'); return result.detail.displays.find(x => x.id === d)!; };
        const current = async () => (await o.detail(s)).displays.find(x => x.id === d)!;
        it('menu optional combinations, price narrow update, availability, items and quick styling', async () => {
            for (const item of [{}, { price: 189 }, { name: 'Lunch' }, { image: 'https://example.org/dish.jpg' }, { description: 'Fresh today' }])
                expect(venueSchemas['todays-special'].safeParse({ item }).success).toBe(true);
            await publish('menu-board', { sections: [{ id: 'm', name: 'Mains', items: [{ id: 'burger', name: 'Burger', price: 169 }] }], currency: 'NOK', locale: 'nb-NO' });
            await update("kanvas.menu.update", { action: 'price', itemId: 'burger', price: 189 });
            await update("kanvas.menu.update", { action: 'availability', itemId: 'burger', availability: 'sold-out' });
            await update("kanvas.menu.update", { action: 'add-item', sectionId: 'm', item: { id: 'soup', price: 99 } });
            await update("kanvas.menu.update", { action: 'remove-item', sectionId: 'm', itemId: 'soup' });
            await update("kanvas.menu.update", { action: 'style', style: { preset: 'bold', showPrice: false } });
            const data: any = (await current()).view!.data;
            expect(data.sections[0].items[0]).toMatchObject({ price: 189, availability: 'sold-out' });
            expect(data).toMatchObject({ preset: 'bold', showPrice: false });
            await publish('todays-special', { item: { name: 'Old' } });
            await update("kanvas.menu.update", { action: 'swap-special', item: { name: 'Today', price: 129 } });
            expect((await current()).view!.data.item).toMatchObject({ name: 'Today' });
        });
        const definition = { name: 'Team list', schema: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, required: ['title', 'items'] }, html: '<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>', css: 'article {padding: 24px; color: white;} h1 {font-size: 48px;}' };
    });
});
