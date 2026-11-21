import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { guideFor } from '../../src/server/mcp/guide.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fact } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { validateMedia } from '../../src/server/rendering/media';
import { PNG } from './harness';
import { materializeSeats } from '../../src/shared/venue';
import { signSchema } from '../../src/shared/venue';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { guidanceTools } from '../../src/server/agent-guidance';
import { DEFAULT_AGENT_GUIDANCE } from '../../src/server/agent-guidance';
import { safeUrl } from '../../src/client/api';
import { bindTemplate } from '../../src/shared/custom-templates';
import { CANONICAL_TOOLS } from '../../src/server/mcp/canonical';
import { normalizeLoginCode } from '../../src/server/device-login.js';
import { loginRead } from '../../src/server/device-login.js';
import { loginDecide } from '../../src/server/device-login.js';
import type { NavigationSnapshot } from '../../src/shared/navigation.js';
import { denied } from './harness.js';
import { normalizedScroll } from '../../src/client/renderers/Navigation.js';

describe("navigation coverage 1", () => {
    describe("navigation contracts", () => {
        let h!: Harness, owner: Browser, s: string, d: string, p: AuthPrincipal;
        beforeEach(async () => { h = await startHarness(); owner = await h.account(); s = (await owner.session()).id; d = (await owner.display(s)).id; p = { userId: owner.user!.id }; });
        afterEach(async () => { await h?.close(); });
        // Tool outputs are heterogeneous envelopes; assertions below narrow the relevant fields.
        const call = async (name: string, args: unknown, actor = p): Promise<any> => h.runtime.service.execute(name, args, actor);
        const target = () => ({ sessionId: s, displayId: d });
        it('distinguishes logical page count from measured overflow and expires stale/old-position measurements', async () => {
            const path = `/api/sessions/${s}/displays/${d}`;
            await owner.submit(s, [d], { version: 1, template: 'table', data: { columns: ['Name'], rows: Array.from({ length: 10 }, (_, i) => ({ Name: `Row ${i}` })), pageSize: 12 } });
            success(await owner.request('POST', `${path}/observe`, { tabId: 'screen', sequence: 1, revision: 1, renderedRevision: 1, status: 'ready', visible: true, text: 'Rows', width: 800, height: 400, context: null }));
            let read = await call("kanvas.navigation.read", target());
            expect(read.capabilities).toMatchObject({ pageCount: 1, matchingItems: 10 });
            expect(read.viewers[0].viewport).toBeNull();
            const measurement = { tabId: 'screen', revision: 1, version: 0, width: 800, height: 300, maxX: 0, maxY: 240 };
            success(await owner.request('POST', `${path}/navigation/viewport`, measurement));
            read = await call("kanvas.navigation.read", target());
            expect(read.viewers[0].viewport).toMatchObject({ contentOverflowsViewport: true, maxY: 240 });
            const command = await call("kanvas.navigation.control", { ...target(), expectedRevision: 1, requestId: 'bottom', navigation: { action: 'scroll', y: 1 } });
            expect(command.state.scroll.y).toBe(1);
            expect((await call("kanvas.navigation.read", target())).viewers[0].viewport).toBeNull();
            expect(success(await owner.request('POST', `${path}/navigation/viewport`, measurement))).toMatchObject({ ignored: true });
            success(await owner.request('POST', `${path}/navigation/viewport`, { ...measurement, version: command.version, maxY: 0 }));
            expect((await call("kanvas.navigation.read", target())).viewers[0].viewport.contentOverflowsViewport).toBe(false);
            const records = await h.runtime.store.list<any>('navigation-viewport', s);
            await h.runtime.store.put('navigation-viewport', { ...records[0], at: '2026-01-01T00:00:00Z' });
            expect((await call("kanvas.navigation.read", target())).viewers[0].viewport).toBeNull();
            const stranger = await h.account();
            expect((await stranger.request('POST', `${path}/navigation/viewport`, measurement)).status).toBeGreaterThanOrEqual(400);
        });
    });
});

describe("navigation coverage 2", () => {


describe("navigation contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('navigation consumes no history slots and publishing preserves forward history and more than 60 frames',async()=>{
  const p={userId:owner.user!.id};
  await owner.submit(sessionId,[displayId],{version:1,template:'presentation',data:{slides:[fact('One'),fact('Two')],index:0}});
  const before=(await h.runtime.store.list('display-history',sessionId,true)).length;
  for(let i=0;i<5;i++)await h.runtime.service.navigatePresentation(p,{sessionId,displayId,requestId:randomUUID(),action:i%2?'previous':'next'});
  expect((await h.runtime.store.list('display-history',sessionId,true)).length).toBe(before);
  const display=await h.runtime.service.display(p,sessionId,displayId);
  for(let i=0;i<70;i++){display.revision++;display.view=fact(`Retained ${i}`);await h.runtime.service.history.record(display,'test-publication');}
  expect((await h.runtime.service.history.frames(display)).filter(e=>e.view).length).toBe(71);
  await h.runtime.service.history.moved(display,1);display.revision++;display.view=fact('Branch preserved');await h.runtime.service.history.record(display,'test-publication');
  expect((await h.runtime.service.history.frames(display)).filter(e=>e.view).length).toBe(72);
 });});
});

describe("navigation coverage 3", () => {

it('platform zoom supports any template without modifying source or reading settings',()=>{
 for(const template of ['kanban','menu','image','website','document','seat-map']){const view:any={version:1,template,data:{}};expect(navigationCapabilities(view).zoom).toBe(true);const initial=initialNavigation(view),next=navigate(view,initial,{action:'zoom',scale:.5});expect(next.scale).toBe(.5);expect(initial.scale).toBeUndefined();expect(navigate(view,next,{action:'zoom',direction:'reset'}).scale).toBe(1);}
 expect(navigationActionSchema.safeParse({action:'zoom',scale:0}).success).toBe(false);
});
});

describe("navigation coverage 4", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
it('retains browser-window zoom through static edits/history/fresh publications without leaking to new windows',async()=>{
 h=await startHarness();const a=await h.account(),session=await a.session('Static zoom'),d=await a.display(session.id),other=await a.display(session.id),s=h.runtime.service,p={userId:a.user!.id};
 const view={version:1 as const,template:'fact' as const,data:{text:'Original'}};
 await a.submit(session.id,[d.id],view);
 const path=`/api/sessions/${session.id}/displays/${d.id}/navigation`;
 const scale=async(tabId:string)=>success(await a.request<NavigationSnapshot>('GET',`${path}?tabId=${tabId}`)).state.scale;
 const initial=await s.display(p,session.id,d.id);success(await a.request('POST',path,{tabId:'static-window',requestId:'static-zoom',expectedRevision:initial.revision,navigation:{action:'zoom',scale:1.6}}));
 const edited=await s.edit(p,session.id,d.id,undefined,{text:'Edited'});
 expect(await scale('static-window')).toBe(1.6);expect(await scale('phone-window')).toBe(1);
 await a.submit(session.id,[d.id],{...view,data:{text:'Another'}});
 const current=await s.display(p,session.id,d.id);
 expect(await scale('static-window')).toBe(1.6);expect(await scale('phone-window')).toBe(1);
 await s.navigate(p,{sessionId:session.id,displayIds:[d.id],requestId:'history-zoom',expectedRevisions:{[d.id]:current.revision},revision:edited.revision});
 expect(await scale('static-window')).toBe(1.6);expect(await scale('new-window')).toBe(1);
 await a.submit(session.id,[other.id],view);
 const otherPath=`/api/sessions/${session.id}/displays/${other.id}/navigation`;
 expect(success(await a.request<NavigationSnapshot>('GET',`${otherPath}?tabId=static-window`)).state.scale).toBe(1.6);
 expect(success(await a.request<NavigationSnapshot>('GET',`${otherPath}?tabId=phone-window`)).state.scale).toBe(1);
 await a.submit(session.id,[d.id],view);
 expect(await scale('static-window')).toBe(1.6);expect(await scale('new-window')).toBe(1);
 expect((await s.navigation.read(p,{sessionId:session.id,displayId:d.id})).state.scale).toBe(1);
});
});

describe("navigation coverage 5", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});const id=()=>randomUUID();
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="#abcdef"/></linearGradient></defs><rect width="100" height="60" fill="url(#g)"/><text x="4" y="30">Team &amp; Friends</text></svg>';
it('normalizes browser overscroll, fractional endpoints and zero extents before navigation requests',()=>{expect(normalizedScroll(-15,100)).toBe(0);expect(normalizedScroll(101.25,100)).toBe(1);expect(normalizedScroll(0,0)).toBe(0);expect(normalizedScroll(50,100)).toBe(.5);expect(normalizedScroll(Infinity,1)).toBe(0);});
});
