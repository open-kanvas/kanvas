import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startHarness,fact,type Harness,type Browser} from './harness.js';
import {waitForDelivery,deliveryForUpdate,publishAckWaitMs} from '../../src/server/publish-delivery.js';
import {applyResponsePolicy,ContactLedger} from '../../src/server/mcp/response-policy.js';
import type {UpdateRecord} from '../../src/shared/types.js';

describe('bounded browser acknowledgement',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string};
 const disposers:Array<()=>unknown>=[];
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{for(const dispose of disposers.splice(0))await dispose();await h?.close();});
 const call=(name:string,args:Record<string,unknown>)=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const submit=(requestId='publish',displayIds=[d])=>call('kanvas.publish',{sessionId:s,displayIds,requestId,view:fact(requestId)});
 async function receiver(displayId=d,mode:'applied'|'failed'='applied',delay=60){
  const service=h.runtime.service;disposers.push(await service.connectDisplay(p,s,displayId));
  const seen=new Set<number>();
  disposers.push(service.onEvent(async event=>{if(event.type!=='display'||event.displayId!==displayId||!event.revision||seen.has(event.revision))return;seen.add(event.revision);await new Promise(r=>setTimeout(r,delay));if(mode==='applied')await service.applied(p,s,displayId,event.revision);else await service.reportDelivery(p,s,displayId,{revision:event.revision,status:'failed',code:'VIEW_RENDER_FAILED'});}));
 }
 it('returns promptly offline before preparation, with a per-display explanation',async()=>{const at=performance.now(),r=await submit();expect(r.delivery[d].status).toBe('offline');expect(performance.now()-at).toBeLessThan(900);expect(r.requestId).toBe('publish');});
 it('waits for actual browser ack, returns early, and exact retry does not publish twice',async()=>{await receiver();const at=performance.now(),r=await submit();expect(r.status).toBe('applied');expect(r.delivery[d]).toMatchObject({status:'applied',revision:1});expect(performance.now()-at).toBeLessThan(1000);const retry=await submit();expect(retry.id).toBe(r.id);expect(retry.delivery[d].status).toBe('applied');expect((await h.runtime.service.display(p,s,d)).revision).toBe(1);});
 it('reports real viewer failure without claiming application',async()=>{await receiver(d,'failed');const r=await submit();expect(r.delivery[d]).toMatchObject({status:'failed',code:'VIEW_RENDER_FAILED'});expect(r.delivery[d].message).toContain('retains');expect(r.status).not.toBe('applied');});
 it('reports held requests immediately without claiming an existing painted frame',async()=>{await h.runtime.service.updateDisplay(p,s,d,{held:true});const at=performance.now(),r=await submit();expect(r.status).toBe('held');expect(r.delivery[d].status).toBe('held');expect(performance.now()-at).toBeLessThan(900);});
 it('uses one bounded wait for several screens, preserving mixed success and offline',async()=>{await receiver();const offline=(await o.display(s,'Offline')).id,slow=(await o.display(s,'Slow')).id;disposers.push(await h.runtime.service.connectDisplay(p,s,slow));const at=performance.now(),r=await submit('multi',[d,offline,slow]);expect(r.delivery[d].status).toBe('applied');expect(r.delivery[offline].status).toBe('offline');expect(r.delivery[slow].status).toBe('unconfirmed');expect(performance.now()-at).toBeGreaterThanOrEqual(1950);expect(performance.now()-at).toBeLessThan(3000);});
 it('disconnect during waiting wakes immediately; timeout is not stored as failure',async()=>{const disconnect=await h.runtime.service.connectDisplay(p,s,d);const pending=submit();await vi.waitFor(async()=>expect((await h.runtime.service.display(p,s,d)).revision).toBe(1));await disconnect();const r=await pending;expect(r.delivery[d].status).toBe('offline');expect((await h.runtime.service.store.get<UpdateRecord>('update',r.id))!.delivery).toBeUndefined();});
 it('timeout retry can observe late ack and a newer revision supersedes old receipts',async()=>{disposers.push(await h.runtime.service.connectDisplay(p,s,d));const r=await submit();expect(r.delivery[d].status).toBe('unconfirmed');await h.runtime.service.applied(p,s,d,1);expect((await submit()).delivery[d].status).toBe('applied');await call('kanvas.display.edit',{sessionId:s,displayId:d,data:{text:'new'}});expect((await submit()).delivery[d].status).toBe('superseded');expect((await h.runtime.service.display(p,s,d)).revision).toBe(2);});
 it('a newer publication wakes the old wait as superseded without stealing its receipt',async()=>{disposers.push(await h.runtime.service.connectDisplay(p,s,d));const pending=submit('older');await vi.waitFor(async()=>expect((await h.runtime.service.display(p,s,d)).revision).toBe(1));const next=await h.runtime.service.submit(p,{sessionId:s,displayIds:[d],requestId:'newer',view:fact('newer')});const old=await pending;expect(old.delivery[d].status).toBe('superseded');expect(old.requestId).toBe('older');expect(next.id).not.toBe(old.id);});
 it('mixed held targets explain the all-or-nothing hold immediately',async()=>{const held=(await o.display(s,'Held')).id;await h.runtime.service.updateDisplay(p,s,held,{held:true});const r=await submit('held-batch',[d,held]);expect(r.delivery[d].status).toBe('held');expect(r.delivery[held].status).toBe('held');expect((await h.runtime.service.display(p,s,d)).revision).toBe(0);});
 it('patch and full data edit wait for their own revision ack',async()=>{await receiver();await submit();const patch=await call('kanvas.view.patch',{sessionId:s,displayId:d,requestId:'patch',expectedRevision:1,operations:[{op:'set',path:'/data/text',value:'patched'}]});expect(patch.delivery[d]).toMatchObject({status:'applied',revision:2});const edit=await call('kanvas.display.edit',{sessionId:s,displayId:d,data:{text:'edited'}});expect(edit.delivery[d]).toMatchObject({status:'applied',revision:3});});
 for(const template of ['task-list','checklist'] as const)it(template+' narrow updates and show carry durable revision receipts',async()=>{await receiver();const view=template==='task-list'?{version:1,template,data:{items:[{id:'one',title:'Task'}]}}:{version:1,template,data:{items:[{id:'one',text:'Task'}]}};await call('kanvas.publish',{sessionId:s,displayIds:[d],requestId:'list',view});const display=await h.runtime.service.display(p,s,d),kind=template==='task-list'?'tasklist':'checklist',key=template==='task-list'?'taskListId':'checklistId',listId=display.view!.data[key];const args={sessionId:s,[key]:listId,requestId:'tick',...(template==='task-list'?{check:['one']}:{items:[{id:'one',checked:true}]})};const r=await call('kanvas.'+kind+'.update',args);expect(r.delivery[d]).toMatchObject({status:'applied',revision:2});expect((await call('kanvas.'+kind+'.update',args)).delivery[d].revision).toBe(2);const shown=await call('kanvas.'+kind+'.show',{sessionId:s,[key]:listId,displayId:d,requestId:'show'});expect(shown.delivery[d]).toMatchObject({status:'applied',revision:3});expect((await call('kanvas.'+kind+'.update',args)).delivery[d].status).toBe('superseded');});
 for(const template of ['task-list','checklist'] as const) {
  for(const mixed of [false,true]) it(template+' saves the document while preserving '+(mixed?'mixed held/unheld':'held-only')+' snapshots and exact retries',async()=>{
   const service=h.runtime.service, kind=template==='task-list'?'tasklist':'checklist',key=template==='task-list'?'taskListId':'checklistId';
   await receiver();
   const view=template==='task-list'?{version:1,template,data:{items:[{id:'one',title:'Task',detail:'Original detail'}]}}:{version:1,template,data:{items:[{id:'one',text:'Task'}]}};
   await call('kanvas.publish',{sessionId:s,displayIds:[d],requestId:'held-list',view});
   const listId=(await service.display(p,s,d)).view!.data[key];
   let active:string|undefined;
   if(mixed){active=(await o.display(s,'Active')).id;await receiver(active);await call('kanvas.'+kind+'.show',{sessionId:s,[key]:listId,displayId:active,requestId:'active-show'});}
   await service.updateDisplay(p,s,d,{held:true});
   // Hold toggles themselves publish a revision; settle its independent ack first.
   await vi.waitFor(async()=>{const held=await service.display(p,s,d);expect(held.appliedRevision).toBe(held.revision);});
   const before=structuredClone(await service.store.get('display',d)),events:string[]=[];
   disposers.push(service.onEvent(event=>{if(event.type==='display'&&event.displayId)events.push(event.displayId);}));
   const args={sessionId:s,[key]:listId,requestId:'held-tick',...(template==='task-list'?{check:['one'],items:[{item:'one',detail:'Updated detail'}]}:{items:[{id:'one',checked:true}]})};
   const at=performance.now(),r=await call('kanvas.'+kind+'.update',args);
   expect(performance.now()-at).toBeLessThan(900);
   expect(r.heldDisplayIds).toEqual([d]);expect(r.delivery[d]).toMatchObject({status:'held',waitedMs:0});
   expect(r.delivery[d].revision).toBeUndefined();expect(r.displayRevisions[d]).toBeUndefined();
   expect(await service.store.get('display',d)).toEqual(before);expect(events).not.toContain(d);
   if(template==='task-list'){const detail=await service.taskLists.displayItem(p,s,d,'one');expect(detail.detail).toBe('Original detail');expect(Boolean(detail.checked)).toBe(false);}
   const saved:any=await call('kanvas.'+kind+'.read',{sessionId:s,[key]:listId});
   expect((template==='task-list'?saved.items:saved.view.data.items)[0].checked).toBe(true);
   if(active){expect(r.delivery[active]).toMatchObject({status:'applied',revision:2});expect((await service.display(p,s,active)).view!.data.items).toEqual(expect.arrayContaining([expect.objectContaining({id:'one',checked:true})]));}
   else expect(r.displayRevisions).toEqual({});
   const retry=await call('kanvas.'+kind+'.update',args);expect(retry.revision).toBe(r.revision);expect(retry.displayRevisions).toEqual(r.displayRevisions);expect(retry.delivery[d].status).toBe('held');
   expect(await service.store.get('display',d)).toEqual(before);
   await service.updateDisplay(p,s,d,{held:false});
   await vi.waitFor(async()=>{const released=await service.display(p,s,d);expect(released.appliedRevision).toBe(released.revision);});
   const released=structuredClone(await service.store.get<any>('display',d));
   const afterRelease=await call('kanvas.'+kind+'.update',args);expect(afterRelease.delivery[d].status).toBe('held');expect(afterRelease.delivery[d].revision).toBeUndefined();expect(await service.store.get('display',d)).toEqual(released);
   if(template==='task-list')expect((await service.taskLists.displayItem(p,s,d,'one')).detail).toBe('Original detail');
   const shown=await call('kanvas.'+kind+'.show',{sessionId:s,[key]:listId,displayId:d,requestId:'catch-up'});expect(shown.delivery[d]).toMatchObject({status:'applied',revision:released.revision+1});expect((await service.display(p,s,d)).view!.data.items).toEqual(expect.arrayContaining([expect.objectContaining({id:'one',checked:true})]));
   const historical=await call('kanvas.'+kind+'.update',args);expect(historical.delivery[d].status).toBe('held');expect(historical.delivery[d].revision).toBeUndefined();
   if(active){await call('kanvas.'+kind+'.show',{sessionId:s,[key]:listId,displayId:active,requestId:'new-active'});expect((await call('kanvas.'+kind+'.update',args)).delivery[active].status).toBe('superseded');}
  });
 }
 for(const kind of ['checklist','tasklist'] as const) it(kind+' late acknowledgements remain recoverable by requestId and stored durably and correlated',async()=>{
  const service=h.runtime.service,template=kind==='tasklist'?'task-list':'checklist',key=kind==='tasklist'?'taskListId':'checklistId';
  await call('kanvas.publish',{sessionId:s,displayIds:[d],requestId:'seed-list',view:{version:1,template,data:{items:[kind==='tasklist'?{id:'one',title:'Task'}:{id:'one',text:'Task'}]}}});
  // Offline publish can still be preparing; wait for the saved display.
  await vi.waitFor(async()=>expect((await service.display(p,s,d)).revision).toBe(1));
  const listId=(await service.display(p,s,d)).view!.data[key];
  disposers.push(await service.connectDisplay(p,s,d));
  const args={sessionId:s,[key]:listId,requestId:'late-narrow',...(kind==='tasklist'?{check:['one']}:{items:[{id:'one',checked:true}]})};
  const r=await call('kanvas.'+kind+'.update',args);expect(r.delivery[d].status).toBe('unconfirmed');
  expect(r.updateId).toEqual(expect.any(String));
  expect((await call('kanvas.update.status',{sessionId:s,requestId:'late-narrow'})).id).toBe(r.updateId);
  await service.applied(p,s,d,2);
  const status=await call('kanvas.update.status',{sessionId:s,requestId:'late-narrow'});expect(status.delivery[d].status).toBe('applied');expect(status.status).toBe('applied');
  expect((await service.store.get<UpdateRecord>('update',r.updateId))?.status).toBe('applied');
  const logs=await service.store.list<any>('lifecycle',s);expect(logs.filter(x=>x.requestId==='late-narrow').map(x=>x.stage)).toEqual(expect.arrayContaining(['submission.received','render.prepared','view.pushed','viewer.acknowledged']));
  expect(logs.find(x=>x.stage==='viewer.acknowledged'&&x.revision===2)?.updateId).toBe(r.updateId);
  expect((await call('kanvas.'+kind+'.update',args)).updateId).toBe(r.updateId);expect((await service.display(p,s,d)).revision).toBe(2);
  const shown=await call('kanvas.'+kind+'.show',{sessionId:s,[key]:listId,displayId:d,requestId:'show-status'});
  expect((await call('kanvas.update.status',{sessionId:s,requestId:'show-status'})).id).toBe(shown.id);
  expect((await call('kanvas.update.status',{sessionId:s,requestId:'late-narrow'})).delivery[d].status).toBe('superseded');
 });
 it('full data edits expose generated recoverable requests and supplied IDs retry safely',async()=>{
  await receiver();await submit();const service=h.runtime.service;
  const first=await call('kanvas.display.edit',{sessionId:s,displayId:d,data:{text:'replacement'}});
  expect((await call('kanvas.update.status',{sessionId:s,requestId:first.requestId})).id).toBe(first.updateId);
  const args={sessionId:s,displayId:d,requestId:'edit-once',expectedRevision:2,data:{text:'once'}};
  const edit=await call('kanvas.display.edit',args);expect(edit.delivery[d]).toMatchObject({status:'applied',revision:3});
  expect((await call('kanvas.display.edit',args)).updateId).toBe(edit.updateId);expect((await service.display(p,s,d)).revision).toBe(3);
  await expect(call('kanvas.display.edit',{...args,data:{text:'conflict'}})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
 });
 it('the default budget admits a genuine acknowledgement after the old one-second ceiling',async()=>{
  await receiver(d,'applied',1200);const r=await submit('slow-first');expect(r.delivery[d].status).toBe('applied');expect(r.delivery[d].waitedMs).toBeGreaterThan(1100);expect(r.delivery[d].waitedMs).toBeLessThan(2000);
 });
 it('same requestId cannot cross mutation kinds and an old edit retry stays superseded',async()=>{
  await receiver();await submit();const service=h.runtime.service;
  const args={sessionId:s,displayId:d,requestId:'shared-identity',expectedRevision:1,data:{text:'Edited once'}};
  const edit=await call('kanvas.display.edit',args);const before=structuredClone(await service.store.get<any>('display',d));
  await expect(call('kanvas.view.patch',{sessionId:s,displayId:d,requestId:'shared-identity',expectedRevision:2,operations:[{op:'set',path:'/data/text',value:'Must not change'}]})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  expect(await service.store.get('display',d)).toEqual(before);
  await submit('newer-than-edit');const latest=structuredClone(await service.store.get<any>('display',d));
  const replay=await call('kanvas.display.edit',args);expect(replay.updateId).toBe(edit.updateId);expect(replay.delivery[d].status).toBe('superseded');expect(await service.store.get('display',d)).toEqual(latest);
 });
 it('server failure and retained content never borrow an older applied revision',async()=>{await receiver();const r=await submit();const failed=await deliveryForUpdate(h.runtime.service,{...r,status:'failed',error:'Fixture rendering failed'});expect(failed[d]).toMatchObject({status:'failed',message:'Fixture rendering failed'});const retained=await deliveryForUpdate(h.runtime.service,{...r,status:'retained'});expect(retained[d].status).toBe('unconfirmed');});
 it('held edit and patch preserve the exact display snapshot and create no update',async()=>{
  await receiver();await submit();const service=h.runtime.service;await service.updateDisplay(p,s,d,{held:true});
  await vi.waitFor(async()=>{const held=await service.display(p,s,d);expect(held.appliedRevision).toBe(held.revision);});
  const before=structuredClone(await service.store.get<any>('display',d)),updates=await service.store.list('update',s);
  await expect(call('kanvas.display.edit',{sessionId:s,displayId:d,data:{text:'blocked'}})).rejects.toMatchObject({code:'DISPLAY_HELD'});
  await expect(call('kanvas.view.patch',{sessionId:s,displayId:d,requestId:'held-patch',expectedRevision:before.revision,operations:[{op:'set',path:'/data/text',value:'blocked'}]})).rejects.toMatchObject({code:'DISPLAY_HELD'});
  expect(await service.store.get('display',d)).toEqual(before);expect(await service.store.list('update',s)).toEqual(updates);
 });
 it('empty narrow changes do not imply anything was painted',async()=>{expect(await h.runtime.service.confirmPublication({id:'saved',sessionId:s,displayRevisions:{},unchanged:true})).toMatchObject({delivery:{},unchanged:true});});
 it('observer cleans listeners on read failure',async()=>{const service=h.runtime.service,spy=vi.spyOn(service,'onEvent'),get=vi.spyOn(service.store,'get').mockRejectedValueOnce(new Error('fixture failure'));await expect(waitForDelivery(service,{id:'x',sessionId:s,requestId:'x',displayIds:[d],revisions:{},status:'accepted',createdAt:new Date().toISOString()})).rejects.toThrow('fixture failure');get.mockRestore();expect(spy).toHaveBeenCalledOnce();spy.mockRestore();});
});

describe('truthful response policy',()=>{
 it('operator wait tuning is bounded and invalid values fall back',()=>{const prior=process.env.KANVAS_PUBLISH_ACK_WAIT_MS;try{delete process.env.KANVAS_PUBLISH_ACK_WAIT_MS;expect(publishAckWaitMs()).toBe(2000);process.env.KANVAS_PUBLISH_ACK_WAIT_MS='200';expect(publishAckWaitMs()).toBe(200);process.env.KANVAS_PUBLISH_ACK_WAIT_MS='900000';expect(publishAckWaitMs()).toBe(5000);process.env.KANVAS_PUBLISH_ACK_WAIT_MS='bad';expect(publishAckWaitMs()).toBe(2000);}finally{if(prior===undefined)delete process.env.KANVAS_PUBLISH_ACK_WAIT_MS;else process.env.KANVAS_PUBLISH_ACK_WAIT_MS=prior;}});

 it.each(['accepted','prepared','failed','held','unconfirmed','offline','superseded'])('never says On screen for %s without applied receipts',status=>{const ledger=new ContactLedger();const result=applyResponsePolicy({data:{status,delivery:{screen:{status}}}},{state:ledger.observe('c'),context:{},guidance:undefined,isError:false,operation:'kanvas.publish',sessionId:'s'}).structured!;expect(result.rhythm).toBeUndefined();expect(result.firstContact).toBeUndefined();});
 it('only all applied receipts justify On screen, including narrow operations',()=>{const ledger=new ContactLedger();const run=(delivery:unknown)=>applyResponsePolicy({data:{delivery}},{state:ledger.observe('c'),context:{},guidance:undefined,isError:false,operation:'kanvas.view.patch',sessionId:'s'}).structured!;expect(run({a:{status:'applied'},b:{status:'offline'}}).rhythm).toBeUndefined();expect(run({a:{status:'applied'}}).rhythm).toMatch(/^On screen/);expect(run({a:{status:'applied'}}).rhythm).toBeUndefined();});
});
