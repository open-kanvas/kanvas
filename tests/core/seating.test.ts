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

describe("seating coverage 1", () => {

describe("seating contracts",()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(name:string,args:Record<string,unknown>)=>call(name,{sessionId:s,displayId:d,...args});
 const publish=async(template:any,data:any)=>{const result=await o.submit(s,[d],{version:1,template,data});expect(result.update.status).toBe('prepared');return result.detail.displays.find(x=>x.id===d)!;};
 const current=async()=> (await o.detail(s)).displays.find(x=>x.id===d)!;
 it('all fourteen seat presets materialize unique bounded seats including large events',()=>{
  for(const layout of SEAT_LAYOUTS){const data=materializeSeats({layout,tableCount:50,seatsPerTable:10});expect(data.seats.length).toBeGreaterThan(0);expect(data.seats.length).toBeLessThanOrEqual(1000);expect(new Set(data.seats.map(s=>s.id)).size).toBe(data.seats.length);}
  expect(materializeSeats({tableCount:100,seatsPerTable:10}).seats).toHaveLength(1000);
  expect(()=>materializeSeats({tableCount:100,seatsPerTable:11})).toThrow();
 });
 const definition={name:'Team list',schema:{type:'object',properties:{title:{type:'string'},items:{type:'array',items:{type:'object',properties:{name:{type:'string'}},required:['name']}}},required:['title','items']},html:'<article><h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul></article>',css:'article {padding: 24px; color: white;} h1 {font-size: 48px;}'};});
});

describe("seating coverage 2", () => {

let h!:Harness;afterEach(async()=>{await h?.close();});
describe("seating contracts",()=>{
 it('honors pod cluster sizes and explicit classroom section count',()=>{for(const clusterSize of [2,3,4])expect(materializeSeats({layout:'classroom-pods',tableCount:6,clusterSize}).seats).toHaveLength(6*clusterSize);expect(materializeSeats({layout:'classroom-grid',sections:1,seatsPerTable:20}).tables).toHaveLength(1);expect(materializeSeats({layout:'horseshoe',seating:'inner',tables:[{id:'head',seating:'both'}]}).tables[0]).toMatchObject({seating:'both'});});});
});
