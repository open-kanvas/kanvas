import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,fact,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {KANVAS_VERSION} from '../../src/shared/version.js';
import {feedbackSubmitSchema} from '../../src/shared/reports.js';
import {experienceTools} from '../../src/server/mcp/experience-tools.js';
import {pairedDisplayAllowsAsset} from '../../src/server/access-flows.js';
import {parseDataset} from '../../src/server/rendering/datasets.js';
import {rawEvent,recordHttpOperation} from '../../src/server/raw-events.js';
const toastSchema=experienceTools.find(t=>t.name==='kanvas_toast')!.schema;
it('accepts generic rich notices and legacy text, rejecting unsafe icons/oversized fields',()=>{
 expect(toastSchema.safeParse({sessionId:'s',displayIds:['d'],text:'Original'}).success).toBe(true);
 const base={sessionId:'s',displayIds:['d'],title:'Sender',description:'Notice',icon:'https://example.com/icon.png',time:'2026-11-06T14:38:00Z'};
 expect(toastSchema.safeParse(base).success).toBe(true);
 for(const extra of [{icon:'javascript:alert(1)'},{icon:'http://127.0.0.1/a'},{title:'x'.repeat(161)},{time:'not-time'},{type:'email'},{action:'https://example.com'}])expect(toastSchema.safeParse({...base,...extra}).success).toBe(false);
 expect(toastSchema.safeParse({sessionId:'s',displayIds:['d']}).success).toBe(false);
});
it('retains real API mutations and failures but suppresses read/observation/auth polling completions',()=>{
 for(const operation of ['POST /api/sessions/:id/assets','POST /api/sessions/:id/datasets','PATCH /api/preferences','POST /api/sessions/:id/displays/:displayId/toasts/dismiss','POST /api/devices/register'])expect(recordHttpOperation('api',200,operation),operation).toBe(true);
 for(const operation of ['GET /api/sessions/:id','POST /api/diagnostics','POST /api/sessions/:id/displays/:displayId/observe','POST /api/sessions/:id/displays/:displayId/navigation/viewport','POST /api/devices/:deviceId/windows/:windowId/report']){expect(recordHttpOperation('api',200,operation),operation).toBe(false);expect(recordHttpOperation('api',500,operation),operation).toBe(true);}
 for(const operation of ['GET /api/auth/me','POST /api/auth/activity','GET /api/auth/email/status','POST /api/auth/email/connection-status']){expect(recordHttpOperation('account',200,operation)).toBe(false);expect(recordHttpOperation('account',401,operation)).toBe(true);}
 expect(recordHttpOperation('account',200,'POST /api/auth/email/consume')).toBe(true);expect(recordHttpOperation('agent',200,'POST /mcp')).toBe(true);
});
it('feedback no longer publishes or requires a category',()=>{
 const base={requestId:'r',title:'Finding',description:'Description'};expect(feedbackSubmitSchema.parse(base)).toEqual(base);expect(feedbackSubmitSchema.safeParse({...base,category:'improvement'}).success).toBe(false);
});
it('weather temperature is genuinely optional with precise field errors',()=>{
 expect(validateView({template:'weather',data:{condition:'rain',display:{visualOnly:true}}}).data.temperature).toBeUndefined();
 expect(()=>validateView({template:'weather',data:{condition:'rain',temperature:''}})).toThrow();
 try{validateView({template:'weather',data:{condition:'rain',temperature:17}});}catch(e:any){expect(e.issues[0].path).toEqual(['data','temperature']);}
});
it('split schema has 2/4/6 bounded ordinary panes and rejects recursive composition',()=>{
 for(const count of [2,4,6])expect(validateView({template:'split-screen',data:{panes:Array.from({length:count},(_,i)=>({id:'p'+i,view:fact('Pane')}))}}).data.panes).toHaveLength(count);
 for(const count of [1,3,5,7])expect(()=>validateView({template:'split-screen',data:{panes:Array.from({length:count},(_,i)=>({id:'p'+i,view:fact('Pane')}))}})).toThrow();
 const nested={version:1,template:'split-screen',data:{panes:[{id:'a',view:fact('a')},{id:'b',view:fact('b')}]}};
 expect(()=>validateView({template:'split-screen',data:{panes:[{id:'a',view:nested},{id:'b',view:fact('b')}]}})).toThrow();
});
it('database schema preserves 12+ columns and validates explicit relationship endpoints',()=>{
 const columns=Array.from({length:14},(_,i)=>({schema:'public',table:'events',column:'field'+i,type:'text',nullable:i>0,primaryKey:i===0}));
 const v=validateView({template:'database-schema',data:{columns,relationships:[{from:{schema:'public',table:'events',column:'field1'},to:{schema:'public',table:'events',column:'field0'},kind:'inferred'}]}});expect(v.data.columns).toEqual(columns);
 expect(()=>validateView({...v,data:{...v.data,relationships:[{from:{table:'missing',column:'id'},to:{table:'missing',column:'id'},kind:'declared'}]}})).toThrow();
});
describe('November 6 isolated operation regressions',()=>{
 let h:Harness,owner:Browser,s:string,d:string;const p=()=>({userId:owner.user!.id});
 beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;await vi.waitFor(async()=>expect((await h.runtime.store.query("SELECT count(*)::int n FROM events WHERE event_type='http.request' AND operation='POST /api/sessions/:id/displays'")).rows[0].n).toBe(1));});afterEach(async()=>{await h?.close();});
 it('refreshes all matching checklist displays, not replacement content, without history growth',async()=>{
  await owner.submit(s,[d],{version:1,template:'checklist',data:{items:[{id:'one',text:'One',checked:false}]}});
  const view=(await owner.detail(s)).displays.find(x=>x.id===d)!.view!,checklistId=String(view.data.checklistId),d2=(await owner.display(s)).id,d3=(await owner.display(s)).id;
  await h.runtime.service.checklists.show(p(),{sessionId:s,displayId:d2,checklistId,requestId:'show2'});await h.runtime.service.checklists.show(p(),{sessionId:s,displayId:d3,checklistId,requestId:'show3'});
  await owner.submit(s,[d3],fact('Newer content wins'));
  const before=await h.runtime.store.list('display-history',s);
  for(let i=0;i<8;i++)await h.runtime.service.checklists.update(p(),{sessionId:s,checklistId,requestId:'update'+i,items:[{id:'one',text:'One',checked:i%2===1}]});
  for(const target of [d,d2])expect((await h.runtime.service.display(p(),s,target)).view?.data.items).toEqual([{id:'one',text:'One',checked:true}]);
  expect((await h.runtime.service.display(p(),s,d3)).view?.data.text).toBe('Newer content wins');expect(await h.runtime.store.list('display-history',s)).toEqual(before);
 });
 it('bounds the whole split after dataset expansion, without publishing a partial screen',async()=>{
  const dataset={...parseDataset({name:'Large supplied data',rows:Array.from({length:100},()=>({value:'x'.repeat(12000)}))}),id:'large',sessionId:s,createdAt:new Date().toISOString()};await h.runtime.store.put('dataset',dataset);
  const child={version:1 as const,template:'table' as const,data:{binding:{datasetId:'large'}}};
  expect((await h.runtime.service.verifyView(p(),s,child)).data.rows).toBeTruthy();
  await expect(h.runtime.service.verifyView(p(),s,{version:1,template:'split-screen',data:{panes:Array.from({length:6},(_,i)=>({id:'p'+i,view:child}))}})).rejects.toThrow(/size|complexity/);
 });
 it('paired media authority includes split current slides and public live toast icons only',async()=>{
  const store=h.runtime.store,browser=await h.runtime.auth.issueBrowser(owner.user!.id,{cookie:()=>{}} as any),pairId='fixture-pair';
  await store.put('pairing',{id:pairId,status:'approved',ownerId:owner.user!.id,sessionId:s,displayId:d,browserSessionId:browser.id,grantExpiresAt:Date.now()+60000});
  const principal={...p(),browserId:browser.id,pairingId:pairId,scopedDisplayId:d,scopedSessionId:s};
  const image=(id:string)=>({version:1 as const,template:'image' as const,data:{images:[{url:'/api/assets/'+id}]}});
  const display=await store.get<any>('display',d);display.view={version:1,template:'split-screen',data:{panes:[{id:'one',view:image('shown')},{id:'two',view:{version:1,template:'presentation',data:{index:1,slides:[image('hidden'),image('current')]}}}]}};await store.put('display',display);
  const allows=(id:string)=>pairedDisplayAllowsAsset(store,principal,{id,sessionId:s,url:'/api/assets/'+id});
  expect(await allows('shown')).toBe(true);expect(await allows('current')).toBe(true);expect(await allows('hidden')).toBe(false);expect(await allows('unreferenced')).toBe(false);
  for(const [id,ownerId,expiry] of [['icon',undefined,60000],['private',owner.user!.id,60000],['expired',undefined,-1]] as const)await store.put('toast',{id,sessionId:s,displayId:d,icon:'/api/assets/'+id,ownerId,expiresAt:new Date(Date.now()+expiry).toISOString()});
  expect(await allows('icon')).toBe(true);expect(await allows('private')).toBe(false);expect(await allows('expired')).toBe(false);
  display.view=fact('Replacement');await store.put('display',display);expect(await allows('shown')).toBe(false);
 });
 it('reports public pages one-based without changing internal browser indices or history',async()=>{
  await owner.submit(s,[d],{version:1,template:'table',data:{columns:['N'],rows:Array.from({length:30},(_,i)=>({N:i})),pageSize:10}});
  const count=(await h.runtime.store.list('display-history',s)).length;
  for(const page of [1,2,3]){const result=await h.runtime.service.navigation.control(p(),{sessionId:s,displayId:d,requestId:randomUUID(),navigation:{action:'page',page}});expect(result.state.page).toBe(page);expect(result.state.pageIndex).toBe(page-1);expect((await h.runtime.service.navigation.read(p(),{sessionId:s,displayId:d})).state.page).toBe(page);}
  expect((await h.runtime.store.list('display-history',s)).length).toBe(count);
 });
 it('suppresses housekeeping only, retains failures/actions and preserves historical rows',async()=>{
  const store=h.runtime.store;await rawEvent(store,'historical.fixture',{sessionId:s,properties:{sentinel:'preserved'}});
  const before=await store.query('SELECT * FROM events ORDER BY occurred_at,event_id');
  for(let i=0;i<50;i++){await store.put('navigation-viewport',{id:'v',sessionId:s,width:390});await store.put('registered-window',{id:'w',sessionId:s});await store.put('connection-history',{id:'c',sessionId:s});await h.runtime.service.accounts.recordRequest('api',200,1,'fixture');}
  expect((await store.query('SELECT count(*)::int n FROM events')).rows[0].n).toBe(before.rows.length);
  await h.runtime.service.accounts.recordRequest('api',500,2,'fixture-failure');await rawEvent(store,'tool.call',{sessionId:s,operation:'fixture.operation',status:'success'});
  const after=await store.query('SELECT * FROM events ORDER BY occurred_at,event_id');expect(after.rows.slice(0,before.rows.length)).toEqual(before.rows);expect(after.rows).toHaveLength(before.rows.length+2);
  expect(after.rows.at(-1)?.properties.serverVersion).toBe(KANVAS_VERSION);
 });
 it('retains an authenticated browser upload operation without copying uploaded bytes or filename',async()=>{
  const result=await owner.request('POST',`/api/sessions/${s}/assets`,{name:'private-upload-name-7721.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});expect(result.status).toBe(201);
  await vi.waitFor(async()=>{const rows=(await h.runtime.store.query("SELECT * FROM events WHERE event_type='http.request' AND operation='POST /api/sessions/:id/assets'")).rows;expect(rows).toHaveLength(1);expect(rows[0].user_id).toBe(owner.user!.id);expect(JSON.stringify(rows)).not.toContain('private-upload-name-7721');expect(JSON.stringify(rows)).not.toContain('iVBORw0KGgo');});
 });
 it('omits credential renewal snapshots while retaining creation and explicit authentication changes',async()=>{
  const store=h.runtime.store,browser=await h.runtime.auth.issueBrowser(owner.user!.id,{cookie:()=>{}} as any);const count=async()=>Number((await store.query("SELECT count(*) n FROM events WHERE event_type='document.browser'")).rows[0].n),before=await count();
  const current=await store.get<any>('browser',browser.id);current.lastActiveAt=new Date().toISOString();current.renewedAt=Date.now()+1;current.expiresAt+=1000;current.idleExpiresAt=current.expiresAt;await store.put('browser',current);expect(await count()).toBe(before);current.authenticatedAt+=1000;await store.put('browser',current);expect(await count()).toBe(before+1);
 });
 it('stamps new sessions/window reports without inventing a historical release',async()=>{
  expect((await h.runtime.service.access(p(),s)).serverVersion).toBe(KANVAS_VERSION);
  const device=success(await owner.request<any>('POST','/api/devices/register',{installationId:randomUUID(),windowId:randomUUID(),clientVersion:'0.35.0',provisionHome:false}));expect(device.window.clientVersion).toBe('0.35.0');
  const legacy={id:'legacy',name:'Old',ownerId:owner.user!.id,config:{},createdAt:'2020-01-01',updatedAt:'2020-01-01'};await h.runtime.store.put('session',legacy);expect((await h.runtime.store.get<any>('session','legacy')).serverVersion).toBeUndefined();
 });
});

describe('event privacy and idle-volume boundaries',()=>{
 let h:Harness;afterEach(async()=>{await h?.close();});
 it('keeps connect/disconnect, but sixty simulated heartbeat touches write no event rows',async()=>{
  h=await startHarness();const owner=await h.account(),s=(await owner.session()).id,d=(await owner.display(s)).id;
  const browser=await h.runtime.auth.issueBrowser(owner.user!.id,{cookie:()=>{}} as any);
  const connection=await h.runtime.service.experience.receiving.connect({userId:owner.user!.id,browserId:browser.id},s,d,'idle-tab','Synthetic Browser');
  const count=Number((await h.runtime.store.query('SELECT count(*) n FROM events')).rows[0].n);for(let i=0;i<60;i++)connection.touch();
  expect(Number((await h.runtime.store.query('SELECT count(*) n FROM events')).rows[0].n)).toBe(count);expect((await h.runtime.store.query("SELECT event_type FROM events WHERE event_type='connection.connect'")).rows).toHaveLength(1);connection.disconnect();
 });
 it('meaningful HTTP event context excludes test credentials, body, query and raw IP',async()=>{
  h=await startHarness();const owner=await h.account();const secrets=['private-query-7721','private-body-7721','private-header-7721','203.0.113.77'];
  success(await owner.request('POST','/api/sessions?private='+secrets[0],{name:secrets[1]},{headers:{'X-API-Key':secrets[2],'X-Forwarded-For':secrets[3]}}));
  const rows=(await h.runtime.store.query('SELECT * FROM events')).rows;expect(rows.some(r=>r.event_type==='document.session')).toBe(true);const serialized=JSON.stringify(rows);for(const secret of secrets)expect(serialized).not.toContain(secret);for(const cookie of owner.cookies.values())expect(serialized).not.toContain(cookie);
 });
});
