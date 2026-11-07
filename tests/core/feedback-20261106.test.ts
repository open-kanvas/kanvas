import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,fact,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {KANVAS_VERSION} from '../../src/shared/version.js';
import {feedbackSubmitSchema} from '../../src/shared/reports.js';
import {experienceTools} from '../../src/server/mcp/experience-tools.js';
import {rawEvent} from '../../src/server/raw-events.js';
const toastSchema=experienceTools.find(t=>t.name==='kanvas_toast')!.schema;
it('accepts generic rich notices and legacy text, rejecting unsafe icons/oversized fields',()=>{
 expect(toastSchema.safeParse({sessionId:'s',displayIds:['d'],text:'Original'}).success).toBe(true);
 const base={sessionId:'s',displayIds:['d'],title:'Sender',description:'Notice',icon:'https://example.com/icon.png',time:'2026-11-06T14:38:00Z'};
 expect(toastSchema.safeParse(base).success).toBe(true);
 for(const extra of [{icon:'javascript:alert(1)'},{icon:'http://127.0.0.1/a'},{title:'x'.repeat(161)},{time:'not-time'},{type:'email'},{action:'https://example.com'}])expect(toastSchema.safeParse({...base,...extra}).success).toBe(false);
 expect(toastSchema.safeParse({sessionId:'s',displayIds:['d']}).success).toBe(false);
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
 beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;});afterEach(async()=>{await h?.close();});
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
 it('stamps new sessions/window reports without inventing a historical release',async()=>{
  expect((await h.runtime.service.access(p(),s)).serverVersion).toBe(KANVAS_VERSION);
  const device=success(await owner.request<any>('POST','/api/devices/register',{installationId:randomUUID(),windowId:randomUUID(),clientVersion:'0.35.0',provisionHome:false}));expect(device.window.clientVersion).toBe('0.35.0');
  const legacy={id:'legacy',name:'Old',ownerId:owner.user!.id,config:{},createdAt:'2020-01-01',updatedAt:'2020-01-01'};await h.runtime.store.put('session',legacy);expect((await h.runtime.store.get<any>('session','legacy')).serverVersion).toBeUndefined();
 });
});
