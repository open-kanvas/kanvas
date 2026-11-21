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
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { KanvasService } from '../../src/server/domain.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { stackChart } from '../../src/shared/chart-stacks.js';
import { chartDataSchema } from '../../src/shared/chart-contract.js';
import type { Request } from 'express';
import { denied } from './harness.js';
import { menuBoardSchema } from '../../src/shared/venue.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { navigationCapabilities } from '../../src/shared/navigation.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { redactDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { deliveryIngress } from '../../src/server/delivery-telemetry.js';
import { recordDeliveryRequest } from '../../src/server/delivery-telemetry.js';
import { readingDefaults } from '../../src/shared/reading.js';
import { liveSurfaceLayout } from '../../src/shared/live-surface.js';

describe("signage coverage 1", () => {

describe("signage contracts",()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(name:string,args:Record<string,unknown>)=>call(name,{sessionId:s,displayId:d,...args});
 const publish=async(template:any,data:any)=>{const result=await o.submit(s,[d],{version:1,template,data});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;};
 const current=async()=> (await o.detail(s)).displays.find(x=>x.id===d)!;
 it('shop switches preserve return view, day updates and custom poster security',async()=>{
  await publish('fact',{text:'Welcome'});
  for(const template of ['back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign'])await update('kanvas_signage_update',{action:'set',template,data:{message:'Hello'}});
  await update('kanvas_signage_update',{action:'set-hours',data:{hours:[{day:'Monday',opens:'09:00',closes:'17:00'}]}});
  await update('kanvas_signage_update',{action:'set-day',day:{day:'Monday',closed:true}});
  expect((await current()).view!.data.hours).toEqual([{day:'Monday',closed:true}]);
  await update('kanvas_signage_update',{action:'clear'});expect((await current()).view).toMatchObject({template:'fact',data:{text:'Welcome'}});
  await expect(update('kanvas_signage_update',{action:'set',template:'sale-poster',data:{html:'<img src="x" onerror="alert(1)"/>'}})).rejects.toThrow();
 });
 const definition={name:'Team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>',css:'article {padding: 24px; color: white;} h1 {font-size: 48px;}'};
 it('temporary signs restore a sign originally published through the ordinary publication path',async()=>{
  await publish('opening-hours',{heading:'Normal hours',hours:[{day:'Monday',opens:'09:00',closes:'17:00'}]});
  await update('kanvas_signage_update',{action:'set',template:'back-at',data:{time:'14:30'}});
  await update('kanvas_signage_update',{action:'clear'});
  expect((await current()).view).toMatchObject({template:'opening-hours',data:{heading:'Normal hours'}});
 });
 it('signage can set and clear a previously blank display',async()=>{
  await update('kanvas_signage_update',{action:'set',template:'back-at',data:{time:'14:30'}});
  expect((await current()).view!.template).toBe('back-at');
  await update('kanvas_signage_update',{action:'clear'});expect((await current()).view).toBeNull();
 });});
});

describe("signage coverage 2", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe("signage contracts",()=>{
 it('supports signage columns/colors/border and full bleed',()=>{const d=menuBoardSchema.parse({columns:7,sectionColor:'#ffffff',accent:'#ff8c00',minFontSize:24});expect(d).toMatchObject({columns:7,bordered:false,minFontSize:24});expect(liveSurfaceLayout(validateView({version:1,template:'sale-poster',data:{heading:'Sale'}})).fullBleed).toBe(true);});});
});
