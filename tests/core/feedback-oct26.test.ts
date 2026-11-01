import {EventEmitter} from 'node:events';
import type {Response} from 'express';
import type {KanvasService} from '../../src/server/domain.js';
import type {UpdateRecord} from '../../src/shared/types.js';
import {stackChart} from '../../src/shared/chart-stacks.js';
import {chartDataSchema} from '../../src/shared/chart-contract.js';
import {afterEach,describe,it,expect} from 'vitest';
import type {Request} from 'express';
import {z} from 'zod';
import {startHarness,success,denied,type Harness} from './harness.js';
import {materializeSeats,menuBoardSchema} from '../../src/shared/venue.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {navigationCapabilities,navigate,initialNavigation} from '../../src/shared/navigation.js';
import {validationIssues} from '../../src/server/input-errors.js';
import {redactDeliveryRequest,deliveryIngress,recordDeliveryRequest} from '../../src/server/delivery-telemetry.js';
import {readingDefaults} from '../../src/shared/reading.js';
import {liveSurfaceLayout} from '../../src/shared/live-surface.js';
let h:Harness;afterEach(async()=>{await h?.close();});
describe('October26 feedback contracts',()=>{
 it('honors pod cluster sizes and explicit classroom section count',()=>{for(const clusterSize of [2,3,4])expect(materializeSeats({layout:'classroom-pods',tableCount:6,clusterSize}).seats).toHaveLength(6*clusterSize);expect(materializeSeats({layout:'classroom-grid',sections:1,seatsPerTable:20}).tables).toHaveLength(1);expect(materializeSeats({layout:'horseshoe',seating:'inner',tables:[{id:'head',seating:'both'}]}).tables[0]).toMatchObject({seating:'both'});});
 it('supports signage columns/colors/border and full bleed',()=>{const d=menuBoardSchema.parse({columns:7,sectionColor:'#ffffff',accent:'#ff8c00',minFontSize:24});expect(d).toMatchObject({columns:7,bordered:false,minFontSize:24});expect(liveSurfaceLayout(validateView({version:1,template:'sale-poster',data:{heading:'Sale'}})).fullBleed).toBe(true);});
 it('uses readable reading defaults while preserving saved overrides',()=>{expect(readingDefaults({}).fontSize).toBe(30);expect(readingDefaults({readingFontSize:24,readingWpm:190})).toMatchObject({fontSize:24,wpm:190});});
 it('validates paged chord sheets and advances without republishing',()=>{const v=validateView({version:1,template:'sing-along',data:{pages:[{lines:[{lyrics:'Evening song',chords:[{at:0,chord:'C'}]}]},{lines:[{lyrics:'Second verse'}]}]}});expect(navigationCapabilities(v).pageCount).toBe(2);expect(navigate(v,initialNavigation(v),{action:'page',direction:'next'}).page).toBe(1);expect(()=>validateView({version:1,template:'sing-along',data:{pages:[{lines:[{lyrics:'Hi',chords:[{at:40,chord:'C'}]}]}]}})).toThrow();});
 it('reports precise envelope paths, numeric indices and received type for every issue',()=>{const schema=z.object({arguments:z.object({displayIds:z.array(z.string()),source:z.string()})}),raw={arguments:{displayIds:[5,6,7,8,9,10,11],source:[]}},parsed=schema.safeParse(raw);if(parsed.success)throw Error('Expected rejection');const issues=validationIssues(parsed.error,'',raw,false,schema);expect(issues).toHaveLength(8);expect(issues[0].path).toBe('arguments.displayIds[0]');expect(issues.at(-1)).toMatchObject({path:'arguments.source',problem:expect.stringContaining('received array')});expect(JSON.stringify(issues)).not.toContain('[field]');});
 it('retains raw payload while excluding credentials and signed URL secrets',()=>{expect(redactDeliveryRequest({view:{data:{text:'Customer source text'}},authorization:'Bearer private',nested:{refresh_token:'private'},url:'https://example.test/image?signature=private&size=3'})).toEqual({view:{data:{text:'Customer source text'}},authorization:'[credential redacted]',nested:{refresh_token:'[credential redacted]'},url:'https://example.test/image?signature=[redacted]&size=3'});});
});
describe('keyboardless account receiver boundary',()=>{
 it('requires code AND exact label + confirm, claims once, retargets only by owner, and revokes retained access',async()=>{
  h=await startHarness();const owner=await h.account(),screen=h.browser(),stranger=await h.account(),service=h.runtime.service;
  const req=success(await screen.request<any>('POST','/api/screens/request',{}));expect(req).not.toHaveProperty('proof');
  expect(await service.execute('kanvas_screen_read',{code:req.code},{userId:owner.user!.id})).toMatchObject({code:req.code,label:req.label,status:'pending'});
  denied(await screen.request('POST','/api/screens/lookup',{code:req.code}),[401]);
  denied(await owner.request('POST','/api/screens/decide',{code:req.code,label:'wrong label',approve:true,confirm:true}),[400]);
  denied(await owner.request('POST','/api/screens/decide',{code:req.code,label:req.label,approve:true}),[400]);
  success(await owner.request('POST','/api/screens/decide',{code:req.code,label:req.label,approve:true,confirm:true,name:'Classroom TV'}));
  const claims=await Promise.all([screen.request<any>('POST','/api/screens/claim',{}),screen.request<any>('POST','/api/screens/claim',{})]);expect(claims.filter(x=>x.status===200)).toHaveLength(1);
  const me=success(await screen.request<any>('GET','/api/auth/me'));screen.csrf=me.csrfToken;expect(me).toMatchObject({viewOnly:true,user:{username:'guest'}});expect(me.receiverDeviceId).toEqual(expect.any(String));
  for(const path of ['/api/start','/api/devices','/api/auth/sessions','/api/media-library','/api/account/details'])denied(await screen.request('GET',path));
  denied(await screen.request('POST','/api/sessions',{name:'Not allowed'}));
  const p=(await h.runtime.auth.browser({cookies:Object.fromEntries(screen.cookies),get:()=>undefined} as unknown as Request)).principal;
  const received:unknown[]=[];const stream=await service.devices.stream(p,me.receiverDeviceId,x=>received.push(x));await stream.push();
  const session=await owner.session('Target'),display=await owner.display(session.id),op={userId:owner.user!.id};
  await expect(service.devices.present(p,{deviceId:me.receiverDeviceId,sessionId:session.id,displayId:display.id,requestId:'forbidden'})).rejects.toThrow();
  await expect(service.devices.present({userId:stranger.user!.id},{deviceId:me.receiverDeviceId,sessionId:session.id,displayId:display.id,requestId:'foreign'})).rejects.toThrow();
  await service.devices.present(op,{deviceId:me.receiverDeviceId,sessionId:session.id,displayId:display.id,requestId:'owner-presents'});await stream.push();expect(received.at(-1)).toMatchObject({command:{displayId:display.id}});
  expect((await service.display(p,session.id,display.id)).id).toBe(display.id);await expect(service.display(p,me.sessionId,me.displayId)).rejects.toThrow();
  await h.runtime.auth.revokeBrowser(p.browserId!);await expect(stream.push()).rejects.toThrow();await expect(service.display(p,session.id,display.id)).rejects.toThrow();stream.close();
 });
 it('rejects copied codes without proof and expired requests',async()=>{h=await startHarness();const owner=await h.account(),screen=h.browser(),other=h.browser();const req=success(await screen.request<any>('POST','/api/screens/request',{}));success(await owner.request('POST','/api/screens/decide',{code:req.code,label:req.label,approve:true,confirm:true}));denied(await other.request('POST','/api/screens/claim',{code:req.code}),[401]);const record=(await h.runtime.store.list<any>('screen-enrollment')).find(x=>x.code===req.code);record.expiresAt=Date.now()-1;await h.runtime.store.put('screen-enrollment',record);denied(await screen.request('POST','/api/screens/claim',{}));});
});

describe('composable charts',()=>{
 const source={kind:'bar',series:[{name:'A',points:[{x:'Mon',y:20},{x:'Tue',y:-5}]},{name:'B',points:[{x:'Mon',y:30},{x:'Tue',y:-10}]}]};
 it('stacks signed values on independent positive/negative baselines and preserves raw totals',()=>{const model=stackChart(chartDataSchema.parse({...source,stacking:'stacked',showTotals:true}));expect(model.series[1][0]).toMatchObject({start:20,end:50,total:50});expect(model.series[1][1]).toMatchObject({start:-5,end:-15,total:-15});expect(source.series[1].points[0].y).toBe(30);});
 it('normalizes percent stacks and rejects misleading negative proportions',()=>{const model=stackChart(chartDataSchema.parse({...source,stacking:'percent',series:source.series.map(s=>({...s,points:s.points.slice(0,1)}))}));expect(model.series[0][0].value).toBe(40);expect(model.series[1][0].end).toBe(100);expect(()=>chartDataSchema.parse({...source,stacking:'percent'})).toThrow();});
 it('supports combo charts and isolates stacked values on explicit independent axes',()=>{expect(chartDataSchema.parse({...source,orientation:'horizontal',series:[{...source.series[0],kind:'bar',color:'#336699'},{...source.series[1],kind:'line',axis:'secondary',dashed:true}]}).series[1].axis).toBe('secondary');const separate=stackChart(chartDataSchema.parse({...source,stacking:'stacked',series:source.series.map((s,i)=>({...s,axis:i?'secondary':'primary'}))}));expect(separate.series.map(s=>s[0].end)).toEqual([20,30]);});
});

it('does not attribute later background deliveries to the request that created their timer',async()=>{
 const response=new EventEmitter(),records:any[]=[],service={store:{put:async(_kind:string,record:unknown)=>records.push(record)}} as unknown as KanvasService;
 const update={id:'update',requestId:'request',sessionId:'session',revisions:{display:1},status:'prepared',createdAt:new Date().toISOString()} as unknown as UpdateRecord;
 let task:Promise<void>|undefined;
 deliveryIngress({body:{original:'request payload'}} as Request,response as unknown as Response,()=>{task=(async()=>{
  await recordDeliveryRequest(service,update,{internal:'first'},'submit');
  response.emit('finish');await new Promise(resolve=>setTimeout(resolve,1));
  await recordDeliveryRequest(service,update,{internal:'scheduled update'},'monitor');
 })();});
 await task;
 expect(records[0]).toMatchObject({origin:'http-request',request:{original:'request payload'}});
 expect(records[1]).toMatchObject({origin:'internal-update',request:{internal:'scheduled update'}});
});
