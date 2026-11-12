import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,denied,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {experienceTools} from '../../src/server/mcp/experience-tools.js';
import {applyChecklistChanges,checklistTools,CHECKLIST_RETAINED_REVISIONS} from '../../src/server/checklists.js';
import {safeError} from '../../src/server/mcp/results.js';
import {toastBuiltInIcon,TOAST_TYPES,type ToastRecord,type ViewerPresence} from '../../src/shared/viewer-experience.js';
import {PRESENCE_GRACE_MS,PRESENCE_LEAVE_MS} from '../../src/server/receiving-presence.js';
import {runPrivacyCycle,privacyBackoffMs,PRIVACY_DEADLINE_MS} from '../../src/client/device-privacy-check.js';

describe('042944fe privacy-lock verification is hedged and bounded',()=>{
 beforeEach(()=>{vi.useFakeTimers();});afterEach(()=>{vi.useRealTimers();});
 const never=(signal:AbortSignal)=>new Promise<'open'>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 it('retries an outright failure almost at once instead of pausing a second',async()=>{
  let calls=0;const cycle=runPrivacyCycle({probe:async()=>{if(++calls===1)throw new Error('network');return 'open';}});
  await vi.advanceTimersByTimeAsync(250);
  await expect(cycle).resolves.toMatchObject({answer:'open',attempts:2});
 });
 it('gives a silent request a parallel sibling and takes the first answer',async()=>{
  let calls=0;const cycle=runPrivacyCycle({probe:signal=>++calls===1?never(signal):Promise.resolve('open' as const)});
  await vi.advanceTimersByTimeAsync(1250);
  const result=await cycle;expect(result).toMatchObject({answer:'open',attempts:2});
 });
 it('reports unknown at the documented bound and never invents an open answer',async()=>{
  const cycle=runPrivacyCycle({probe:never});
  await vi.advanceTimersByTimeAsync(PRIVACY_DEADLINE_MS-1);let settled=false;void cycle.then(()=>{settled=true;});await Promise.resolve();expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(2);expect((await cycle).answer).toBe('unknown');
 });
 it('hides at the first failure while content is visible, and a locked answer always wins',async()=>{
  const visible=runPrivacyCycle({probe:async()=>{throw new Error('offline');},failFast:true});
  await vi.advanceTimersByTimeAsync(1);expect((await visible).answer).toBe('unknown');
  const locked=runPrivacyCycle({probe:async()=>'locked'});await vi.advanceTimersByTimeAsync(1);expect((await locked).answer).toBe('locked');
 });
 it('never waits longer than the former fixed second between cycles',()=>{
  expect(privacyBackoffMs(1)).toBe(150);expect(privacyBackoffMs(2)).toBe(300);expect(privacyBackoffMs(9)).toBe(1000);
 });
});

describe('toasts: account-wide dismissal and built-in icons',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const observe=async(browser:Browser,tabId:string,displayId=d)=>{const display=(await browser.detail(s)).displays.find(x=>x.id===displayId)!;return success(await browser.request<{toasts:ToastRecord[]}>('POST',`/api/sessions/${s}/displays/${displayId}/observe`,{tabId,sequence:Date.now(),revision:display.revision,renderedRevision:null,status:'empty',visible:true,width:800,height:600,text:'',elements:[],context:null}));};
 it('1559c2fd/b4c5d005: one dismissal removes a sticky toast for the whole account, on new windows and after restart',async()=>{
  const sent=await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'Handled once',sticky:true});const toastId=sent.notifications[0].id;
  expect((await observe(o,'laptop-window')).toasts.map(t=>t.id)).toEqual([toastId]);
  // A second device of the same account: a separate browser session on the same user.
  const phone=h.browser();await h.runtime.auth.issueBrowser(o.user!.id,{cookie:(name:string,value:string)=>{phone.cookies.set(name,value);}} as never);phone.csrf=success(await phone.request<{csrfToken:string}>('GET','/api/auth/me')).csrfToken;
  expect((await observe(phone,'phone-window')).toasts.map(t=>t.id)).toEqual([toastId]);
  const events:unknown[]=[];const stop=h.runtime.service.onEvent(event=>{events.push(event);});
  expect(success(await o.request('POST',`/api/sessions/${s}/displays/${d}/toasts/dismiss`,{tabId:'laptop-window',id:toastId}))).toMatchObject({dismissed:true,scope:'account'});
  stop();expect(events).toContainEqual(expect.objectContaining({type:'toast',sessionId:s,displayId:d}));
  expect((await observe(phone,'phone-window')).toasts).toEqual([]);
  // "Restarted app": a window id the server has never seen.
  expect((await observe(phone,`restarted-${randomUUID()}`)).toasts).toEqual([]);
  expect((await observe(o,`reopened-${randomUUID()}`)).toasts).toEqual([]);
  // The notification itself still exists for other accounts until it expires.
  expect(await h.runtime.store.get('toast',toastId)).toBeTruthy();
 });
 it('a dismissal by one account does not dismiss for another member of a shared session',async()=>{
  const member=await h.account();success(await o.request('POST',`/api/sessions/${s}/members`,{username:member.user!.username,role:'viewer'}));
  const toastId=(await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'Shared notice',sticky:true})).notifications[0].id;
  success(await member.request('POST',`/api/sessions/${s}/displays/${d}/toasts/dismiss`,{tabId:'member-window',id:toastId}));
  expect((await observe(member,'member-window')).toasts).toEqual([]);
  expect((await observe(o,'owner-window')).toasts.map(t=>t.id)).toEqual([toastId]);
 });
 it('one notification sent to several displays is dismissed on all of them together',async()=>{
  const second=(await o.display(s,'Second')).id;
  const sent=await call('kanvas_toast',{sessionId:s,displayIds:[d,second],text:'Two screens',sticky:true});
  expect(new Set(sent.notifications.map((n:ToastRecord)=>n.groupId)).size).toBe(1);
  success(await o.request('POST',`/api/sessions/${s}/displays/${d}/toasts/dismiss`,{tabId:'one',id:sent.notifications[0].id}));
  expect((await observe(o,'two',second)).toasts).toEqual([]);
 });
 it('keeps honouring a per-window dismissal written by 0.36',async()=>{
  const toastId=(await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'Legacy',sticky:true})).notifications[0].id;
  const viewerId=(await observe(o,'old-window') as unknown as {viewerId:string}).viewerId;
  await h.runtime.store.put('toast-dismissed',{id:viewerId,sessionId:s,ids:[toastId]});
  expect((await observe(o,'old-window')).toasts).toEqual([]);
 });
 it('e6ae1605: built-in pictograms are optional; explicit image wins; plain toasts are unchanged',async()=>{
  const schema=experienceTools.find(t=>t.name==='kanvas_toast')!.schema;
  expect(TOAST_TYPES).toHaveLength(9);
  for(const type of TOAST_TYPES)expect(schema.safeParse({sessionId:'s',displayIds:['d'],text:'x',type}).success).toBe(true);
  expect(schema.safeParse({sessionId:'s',displayIds:['d'],text:'x',type:'gmail'}).success).toBe(false);
  const plain=(await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'Plain'})).notifications[0];
  expect(plain).toMatchObject({severity:'info'});expect(plain.type).toBeUndefined();expect(toastBuiltInIcon(plain)).toBeUndefined();
  const warned=(await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'Careful',severity:'warning'})).notifications[0];expect(toastBuiltInIcon(warned)).toBe('warning');
  const mail=(await call('kanvas_toast',{sessionId:s,displayIds:[d],text:'New mail',type:'email',severity:'success'})).notifications[0];expect(toastBuiltInIcon(mail)).toBe('email');
  expect(toastBuiltInIcon({icon:'https://example.com/i.png',type:'email',severity:'warning',severityStated:true})).toBeUndefined();
 });
});

describe('checklists: by-ID updates, explicit removal, history, highlight',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string},checklistId:string;
 const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Acceptance item ${i+1}`,checked:false,detail:`Note for item ${i+1}`}));
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};
  const published=await o.submit(s,[d],{version:1,template:'checklist',title:'Release',data:{items}} as never);checklistId=String(published.detail.displays[0].view!.data.checklistId);});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(args:Record<string,unknown>)=>call('kanvas_checklist_update',{sessionId:s,checklistId,requestId:randomUUID(),...args});
 const saved=async()=>(await call('kanvas_checklist_read',{sessionId:s,checklistId})).view.data.items as typeof items;
 it('2a3bdc12/a416fadc: two partial items change two items and nothing else (the incident)',async()=>{
  const result=await update({expectedRevision:0,items:[{id:'t4',checked:true},{id:'t9',detail:'Corrected note'}]});
  expect(result).toMatchObject({revision:1,previousRevision:0,itemCount:19,checkedCount:1,changes:{added:[],changed:['t4','t9'],removed:[],moved:[]},counts:{added:0,changed:2,removed:0,untouched:17}});
  const after=await saved();expect(after).toHaveLength(19);
  expect(after.find(x=>x.id==='t4')).toEqual({...items[3],checked:true});expect(after.find(x=>x.id==='t9')).toEqual({...items[8],detail:'Corrected note'});
  expect(after.filter(x=>!['t4','t9'].includes(x.id))).toEqual(items.filter(x=>!['t4','t9'].includes(x.id)));
 });
 it('adds at a position, clears a note with null, removes only through removeIds and reports unknown ids',async()=>{
  const result=await update({items:[{id:'new',text:'Inserted',index:0},{id:'t2',detail:null}],removeIds:['t19','ghost']});
  expect(result.changes).toEqual({added:['new'],changed:['t2'],removed:['t19'],moved:[]});expect(result.notFound).toEqual(['ghost']);
  const after=await saved();expect(after[0]).toMatchObject({id:'new',text:'Inserted',checked:false});expect(after.find(x=>x.id==='t2')).not.toHaveProperty('detail');expect(after.some(x=>x.id==='t19')).toBe(false);expect(after).toHaveLength(19);
  let missing:unknown;try{await update({items:[{id:'unknown-item',checked:true}]});}catch(e){missing=e;}
  expect(safeError(missing)).toMatchObject({code:'INVALID_ARGUMENT',issues:[expect.objectContaining({path:'items[0].text',expected:'string',received:'missing'})]});
  expect(await saved()).toHaveLength(19);
 });
 it('replace is explicit and refuses to delete saved items without allowRemove, naming them',async()=>{
  let refused:unknown;try{await update({mode:'replace',items:[{id:'t1',text:'Only one',checked:true},{id:'t2',text:'And two'}]});}catch(e){refused=e;}
  const error=safeError(refused);expect(error.code).toBe('INVALID_ARGUMENT');expect(error.wouldRemoveIds).toHaveLength(17);expect(error.wouldRemoveIds).toContain('t19');expect(error.message).toMatch(/would delete 17 saved items/);
  expect(await saved()).toEqual(items);
  const done=await update({mode:'replace',allowRemove:true,items:[{id:'t1',text:'Only one',checked:true},{id:'t2',text:'And two'}]});
  expect(done.counts).toMatchObject({removed:17,changed:2});expect(await saved()).toHaveLength(2);
  let partial:unknown;try{await update({mode:'replace',allowRemove:true,items:[{id:'t1',checked:false}]});}catch(e){partial=e;}expect(safeError(partial).issues?.[0].path).toBe('items[0].text');
 });
 it('keeps earlier revisions readable and restores one as a one-step undo',async()=>{
  await update({items:[{id:'t1',checked:true}]});
  const wiped=await update({mode:'replace',allowRemove:true,items:[{id:'t1',text:'Only this',checked:true}]});expect(wiped.revision).toBe(2);
  const current=await call('kanvas_checklist_read',{sessionId:s,checklistId});expect(current.retainedRevisions.map((x:{revision:number})=>x.revision)).toEqual([0,1]);
  const earlier=await call('kanvas_checklist_read',{sessionId:s,checklistId,revision:1});expect(earlier).toMatchObject({revision:1,retained:true,currentRevision:2});expect(earlier.view.data.items).toHaveLength(19);
  const restored=await update({restoreRevision:1,expectedRevision:2});expect(restored).toMatchObject({revision:3,itemCount:19,checkedCount:1});expect(restored.counts.added).toBe(18);
  expect((await saved()).find(x=>x.id==='t7')).toEqual(items[6]);
  let gone:unknown;try{await call('kanvas_checklist_read',{sessionId:s,checklistId,revision:77});}catch(e){gone=e;}expect(safeError(gone).code).toBe('NOT_FOUND');
  for(let i=0;i<CHECKLIST_RETAINED_REVISIONS+4;i++)await update({items:[{id:'t3',detail:`edit ${i}`}]});
  expect((await call('kanvas_checklist_read',{sessionId:s,checklistId})).retainedRevisions).toHaveLength(CHECKLIST_RETAINED_REVISIONS);
 });
 it('two writers changing different items do not overwrite each other; requestId retries are exact',async()=>{
  const first={sessionId:s,checklistId,requestId:'tick-one',items:[{id:'t5',checked:true}]};
  const [a,b]=await Promise.all([call('kanvas_checklist_update',first),update({items:[{id:'t6',detail:'Second writer'}]})]);
  expect(new Set([a.revision,b.revision])).toEqual(new Set([1,2]));
  const after=await saved();expect(after.find(x=>x.id==='t5')!.checked).toBe(true);expect(after.find(x=>x.id==='t6')!.detail).toBe('Second writer');
  expect((await call('kanvas_checklist_update',first)).revision).toBe(a.revision);
  let conflict:unknown;try{await call('kanvas_checklist_update',{...first,items:[{id:'t5',checked:false}]});}catch(e){conflict=e;}expect(safeError(conflict).code).toBe('REQUEST_ID_CONFLICT');
  let stale:unknown;try{await update({expectedRevision:0,items:[{id:'t1',checked:true}]});}catch(e){stale=e;}expect(safeError(stale)).toMatchObject({code:'REVISION_CONFLICT',currentRevision:2});
 });
 it('d0e13f12: an in-place update keeps the navigation root, and an unchanged call changes nothing',async()=>{
  const before=(await o.detail(s)).displays[0];
  await update({items:[{id:'t17',checked:true}]});
  const after=(await o.detail(s)).displays[0];expect(after.revision).toBe(before.revision+1);expect(after.navigationRoot??after.revision).toBe(before.navigationRoot??before.revision);
  const again=await update({items:[{id:'t17',checked:true}]});expect(again).toMatchObject({unchanged:true,revision:1});expect((await o.detail(s)).displays[0].revision).toBe(after.revision);
 });
 it('a38d9e45: one item can be highlighted by id, in a view and through update; bad ids are explained',async()=>{
  expect(validateView({template:'checklist',data:{highlight:'b',items:[{id:'a',text:'A'},{id:'b',text:'B'}]}}).data.highlight).toBe('b');
  expect(()=>validateView({template:'checklist',data:{highlight:'zzz',items:[{id:'a',text:'A'}]}})).toThrow();
  const marked=await update({highlightId:'t12'});expect(marked).toMatchObject({highlightId:'t12',revision:1,counts:{changed:0}});
  expect((await o.detail(s)).displays[0].view!.data.highlight).toBe('t12');expect(await saved()).toEqual(items);
  await update({removeIds:['t12']});expect((await call('kanvas_checklist_read',{sessionId:s,checklistId})).view.data.highlight).toBeUndefined();
  await update({highlightId:'t3'});const cleared=await update({highlightId:null});expect(cleared.highlightId).toBeUndefined();
  let bad:unknown;try{await update({highlightId:'nope'});}catch(e){bad=e;}expect(safeError(bad).issues?.[0]).toMatchObject({path:'highlightId'});
 });
 it('the description and schema state the by-ID contract; pure merge never deletes by omission',()=>{
  const tool=checklistTools.find(t=>t.name==='kanvas_checklist_update')!;
  expect(tool.description).toMatch(/BY ID/);expect(tool.description).toMatch(/items you do not name stay exactly as they are/);expect(tool.description).toContain('items:[{id,checked:true}]');
  const merged=applyChecklistChanges(items,[{id:'t1',checked:true}]);expect(merged.items).toHaveLength(19);expect(merged.changes.removed).toEqual([]);
  expect(()=>applyChecklistChanges(items,[{id:'t1',checked:true}],['t1'])).toThrow();
 });
});

describe('7263db4a presence is debounced and the display has a size of its own',()=>{
 let h:Harness,o:Browser,s:string,d:string;
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s,'Shared',1200,800)).id;});
 afterEach(async()=>{await h?.close();});
 const notices=async()=>success(await o.request<ToastRecord[]>('GET','/api/account/notices')).map(x=>x.text);
 const viewers=async()=>success(await o.request<(ViewerPresence&{presence:string})[]>('GET',`/api/sessions/${s}/viewers`));
 const stream=async(tabId:string,signal:AbortSignal)=>{const response=await o.raw(`/api/sessions/${s}/events?displayId=${d}&tabId=${tabId}`,{}, {signal});expect(response.status).toBe(200);return response;};
 const observe=async(tabId:string,width:number,height:number,visible=true)=>{const display=(await o.detail(s)).displays[0];return success(await o.request('POST',`/api/sessions/${s}/displays/${d}/observe`,{tabId,sequence:Date.now(),revision:display.revision,renderedRevision:null,status:'empty',visible,width,height,text:'',elements:[],context:null}));};
 it('the lease is several heartbeats long and the debounce comfortably outlasts a browser reconnect',()=>{
  expect(PRESENCE_GRACE_MS).toBeGreaterThanOrEqual(30_000);expect(PRESENCE_LEAVE_MS).toBeLessThan(PRESENCE_GRACE_MS/10);
 });
 it('a dropped stream that returns produces no join/leave notice and stays listed as reconnecting',async()=>{
  h.runtime.service.experience.receiving.graceMs=1200;
  const a=new AbortController();await stream('tv',a.signal);
  await vi.waitFor(async()=>expect((await notices()).filter(x=>/connected ·/.test(x))).toHaveLength(1));
  a.abort();
  await vi.waitFor(async()=>expect((await viewers()).find(x=>x.presence==='reconnecting')).toBeTruthy());
  const b=new AbortController();await stream('tv',b.signal);
  await new Promise(resolve=>setTimeout(resolve,1500));
  const all=await notices();expect(all.filter(x=>/connected ·/.test(x))).toHaveLength(1);expect(all.some(x=>/disconnected|left this display/.test(x))).toBe(false);
  expect((await viewers()).filter(x=>x.connected)).toHaveLength(1);
  b.abort();
 },15000);
 it('a stream that stays away is announced once, and a window that says it is closing is announced promptly',async()=>{
  h.runtime.service.experience.receiving.graceMs=60_000;
  const a=new AbortController();await stream('phone',a.signal);
  expect(success(await o.request<{left:boolean}>('POST',`/api/sessions/${s}/displays/${d}/leave`,{tabId:'phone'})).left).toBe(true);
  a.abort();
  await vi.waitFor(async()=>expect((await notices()).filter(x=>/disconnected from the display/.test(x))).toHaveLength(1),{timeout:5000,interval:100});
  expect(success(await o.request<{left:boolean}>('POST',`/api/sessions/${s}/displays/${d}/leave`,{tabId:'never-connected'})).left).toBe(false);
 },15000);
 it('display size follows the largest connected foreground screen, not the last reporter',async()=>{
  const tv=new AbortController(),phone=new AbortController();await stream('tv',tv.signal);await stream('phone',phone.signal);
  await observe('tv',960,540);await observe('phone',443,880);
  const size=async()=>{const display=(await o.detail(s)).displays[0];return [display.width,display.height];};
  expect(await size()).toEqual([960,540]);
  // The phone keeps reporting (heartbeat PATCH and observations): the display must not flip.
  for(let i=0;i<3;i++){success(await o.request('PATCH',`/api/sessions/${s}/displays/${d}`,{width:443,height:880,pixelRatio:2}));await observe('phone',443,880);}
  expect(await size()).toEqual([960,540]);
  const before=(await o.detail(s)).displays[0].viewportRevision;
  success(await o.request('PATCH',`/api/sessions/${s}/displays/${d}`,{width:443,height:880,pixelRatio:2}));
  expect((await o.detail(s)).displays[0].viewportRevision).toBe(before);
  // Per-viewer sizes stay visible separately.
  const listed=await viewers();expect(listed.find(x=>x.width===443)?.height).toBe(880);expect(listed.find(x=>x.width===960)?.height).toBe(540);
  // The TV goes to the background: the foreground phone becomes the display's size.
  await observe('tv',960,540,false);expect(await size()).toEqual([443,880]);
  tv.abort();phone.abort();
 },15000);
 it('an agent can still set a viewport explicitly',async()=>{
  const result=await h.runtime.service.execute('kanvas_display_update',{sessionId:s,displayId:d,width:1920,height:1080},{userId:o.user!.id}) as {width:number;height:number};
  expect([result.width,result.height]).toEqual([1920,1080]);denied(await h.browser().request('PATCH',`/api/sessions/${s}/displays/${d}`,{width:1,height:1}),[401,403]);
 });
});
