import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach,expect,it} from 'vitest';
import {startHarness,success,type Harness} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {validateMedia} from '../../src/server/rendering/media.js';
import {safeError} from '../../src/server/mcp/results.js';
import {samples} from '../../src/shared/template-examples.js';
import {initialNavigation} from '../../src/shared/navigation.js';
let h:Harness;const id=()=>randomUUID();afterEach(async()=>{await h?.close();});

it('pushes all six prioritized live views, preserves exact samples, replays lost responses and rejects stale, held, foreign or changed targets',async()=>{
 h=await startHarness();const a=await h.account(),b=await h.account(),s=await a.session(),d=await a.display(s.id),svc=h.runtime.service,p={userId:a.user!.id};
 const views:any[]=[{version:1,template:'number',data:{value:'1.2300',label:'Exact'}}];
 for(const kind of ['gauge','line','area','bar','heatmap'])views.push({version:1,template:'chart',data:kind==='gauge'?{kind,gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:12}]}]}:{kind,series:[{name:'Sensor',points:[{x:'T1',y:12,...(kind==='heatmap'?{value:12}:{})},{x:'T2',y:18,...(kind==='heatmap'?{value:18}:{})}]}]}});
 for(const view of views){await a.submit(s.id,[d.id],view);const before=(await svc.display(p,s.id,d.id)),data=structuredClone(before.view!.data);if(view.template==='number')data.value='9007199254740993';else(data.series as any)[0].points[0].y=23;
  const input={sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:before.revision,data};
  const result:any=await svc.execute('kanvas_live_push',input,p);expect((await svc.display(p,s.id,d.id)).view!.data).toEqual(validateView({...view,data}).data);
  expect((await svc.execute('kanvas_live_push',input,p) as any).id).toBe(result.id);
  await expect(svc.execute('kanvas_live_push',{...input,requestId:id()},p)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(svc.execute('kanvas_live_push',{...input,requestId:id(),expectedRevision:result.revisions[d.id]},{userId:b.user!.id})).rejects.toThrow();
 }
 const before=(await svc.display(p,s.id,d.id));(await svc.updateDisplay(p,s.id,d.id,{held:true,expectedRevision:before.revision}));const revision=(await svc.display(p,s.id,d.id)).revision;
 await expect(svc.execute('kanvas_live_push',{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:revision,data:before.view!.data},p)).rejects.toMatchObject({code:'DISPLAY_HELD'});
 expect((await svc.display(p,s.id,d.id)).revision).toBe(revision);
});

it('existing public JSON polling really updates gauge samples without content regeneration and keeps the last valid value on failure',async()=>{
 let value=12,time=Date.now();h=await startHarness({monitoringOptions:{automatic:false,now:()=>time,fetcher:async()=>({statusCode:200,latencyMs:3,mimeType:'application/json',body:Buffer.from(JSON.stringify({value})),finalUrl:'https://example.com/sensor'})}});
 const a=await h.account(),s=await a.session(),d=await a.display(s.id),p={userId:a.user!.id},svc=h.runtime.service;
 const job=(await svc.monitoring.start(p,{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:0,config:{mode:'json',url:'https://example.com/sensor',intervalSeconds:30,template:'chart',mapping:{kind:'gauge',gauge:{min:0,max:100},series:[{name:'Sensor',points:[{x:'Now',y:{$path:'/value'}}]}]}}}));
 await svc.monitoring.runDue();await expect.poll(async ()=>(((await svc.display(p,s.id,d.id)).view?.data.series as any)?.[0].points[0].y)).toBe(12);
 value=23;time+=31000;await svc.monitoring.runDue();await expect.poll(async ()=>(((await svc.display(p,s.id,d.id)).view?.data.series as any)?.[0].points[0].y)).toBe(23);
 value=101;time+=31000;await svc.monitoring.runDue();await expect.poll(async ()=>((await svc.monitoring.read(p,{sessionId:s.id,jobId:job.id})) as any).health.consecutiveFailures).toBe(1);expect(((await svc.display(p,s.id,d.id)).view!.data.series as any)[0].points[0].y).toBe(23);
});

it('imports real Pillow RGB PNG bytes and returns actionable safe errors for invalid encodings and files',async()=>{
 const bytes=readFileSync(new URL('../fixtures/feedback-plot.png',import.meta.url)),media=validateMedia({name:'plot.png',mimeType:'image/png',base64:bytes.toString('base64')});expect(media).toMatchObject({width:240,height:100});
 h=await startHarness();const a=await h.account(),s=await a.session();const asset:any=await h.runtime.service.execute('kanvas_asset_import',{sessionId:s.id,name:'plot.png',mimeType:'image/png',base64:bytes.toString('base64')},{userId:a.user!.id});expect(asset.mimeType).toBe('image/png');expect(asset.size).toBe(bytes.length);
 for(const base64 of ['data:image/png;base64,'+bytes.toString('base64'),bytes.toString('base64')+'\n',Buffer.from('not a png').toString('base64')]){let error:unknown;try{validateMedia({name:'plot.png',mimeType:'image/png',base64});}catch(e){error=e;}const result=safeError(error);expect(result.code).toMatch(/^INVALID_MEDIA/);expect(result.message).toMatch(/base64/);expect(result.message).not.toContain(bytes.toString('base64'));}
});

it('preserves generic record fields, source activity and optional story/recipe media while keeping strict contracts',()=>{
 const record={version:1,template:'record-detail',data:{id:'A-1',title:'Ticket',status:'Review',statusColor:'#123456',description:'Full\nthread',fields:{Exact:'1.2300'},activity:[{id:'a',author:'Kim',timestamp:'Yesterday (source)',text:'Exact note.'}],related:[{id:'b',type:'Contract',title:'Deal'}]}};
 expect(validateView(record).data).toEqual(record.data);expect(()=>validateView({...record,data:{...record.data,statusColor:'red'}})).toThrow();
 for(const name of ['story-cards','recipe','itinerary','website'] as const)expect(validateView(samples[name]).template).toBe(name);
 const images=Array.from({length:20},(_,i)=>({url:`https://example.com/${i}.png`}));const gallery=validateView({version:1,template:'image-gallery',data:{images}});expect(gallery.data.images).toHaveLength(20);expect(()=>validateView({...gallery,data:{...gallery.data,images:[...images,images[0]]}})).toThrow();
});

it('keeps public broadcast navigation on reload and never exposes private viewer positioning',async()=>{
 h=await startHarness();const a=await h.account(),s=await a.session(),d=await a.display(s.id),p={userId:a.user!.id},svc=h.runtime.service;
 await a.submit(s.id,[d.id],{version:1,template:'image-gallery',data:{mode:'carousel',images:[{url:'https://example.com/1.png'},{url:'https://example.com/2.png'}]}});
 await svc.execute('kanvas_navigation_control',{sessionId:s.id,displayId:d.id,requestId:id(),expectedRevision:1,navigation:{action:'page',page:2}},p);
 const nav=(await svc.navigation.publicPosition(s.id,d.id));expect(nav?.state.page).toBe(1);expect(nav).not.toHaveProperty('viewerId');expect((await svc.display(p,s.id,d.id)).revision).toBe(1);
});
