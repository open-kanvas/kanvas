import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,fact,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {validationIssues} from '../../src/server/input-errors.js';
import {z} from 'zod';
import {gameDataSchema} from '../../src/shared/game.js';
import {createApp} from '../../src/server/app.js';
import {rawEvent,eventContext} from '../../src/server/raw-events.js';

describe('November 5 privacy, retention and raw event contracts',()=>{
 let h:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('locks all browser API routes, persists state, preserves other devices and restores content',async()=>{
  await owner.submit(sessionId,[displayId],fact('Sensitive source'));
  const device=success(await owner.request<{id:string}>('POST','/api/devices/register',{installationId:randomUUID(),provisionHome:false}));
  const p={userId:owner.user!.id};const outsider=await h.account();
  await expect(h.runtime.service.privacy.set({userId:outsider.user!.id},{deviceId:device.id},true)).rejects.toMatchObject({code:'NOT_FOUND'});
  await h.runtime.service.execute('kanvas_device_lock',{deviceId:device.id},p);
  for(const path of ['/api/auth/me','/api/sessions',`/api/sessions/${sessionId}`,`/api/sessions/${sessionId}/displays/${displayId}/history`]){const result=await owner.request('GET',path);expect(result.status).toBe(423);expect(result.text).not.toContain('Sensitive source');}
  expect(success(await owner.request<{locked:boolean}>('GET','/api/device-privacy/status')).locked).toBe(true);
  expect(success(await outsider.request('GET','/api/sessions'))).toBeDefined();
  expect((await h.runtime.store.get<any>('device-privacy',device.id)).locked).toBe(true);
  await h.runtime.service.execute('kanvas_device_unlock',{deviceId:device.id},p);
  expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe('Sensitive source');
 });
 it('closes already-open event streams and keeps device lock through a real runtime restart',async()=>{
  const device=success(await owner.request<{id:string}>('POST','/api/devices/register',{installationId:randomUUID(),provisionHome:false}));
  const controller=new AbortController(),response=await owner.raw(`/api/sessions/${sessionId}/events`,{},{signal:controller.signal});expect(response.status).toBe(200);
  const reader=response.body!.getReader();let closed=false;const finished=(async()=>{try{while(!(await reader.read()).done){}}finally{closed=true;}})();
  try{await h.runtime.service.privacy.set({userId:owner.user!.id},{deviceId:device.id},true);await vi.waitFor(()=>expect(closed).toBe(true));await finished;}finally{controller.abort();}
  await h.shutdown();const restarted=await createApp({database:h.database});
  try{expect(await restarted.service.privacy.locked(device.id)).toBe(true);expect((await restarted.store.list('device-privacy-binding')).length).toBeGreaterThan(0);await restarted.service.privacy.set({userId:owner.user!.id},{deviceId:device.id},false);expect(await restarted.service.privacy.locked(device.id)).toBe(false);}finally{await restarted.close();}
 });
 it('serializes presence disconnect reads with concurrent owner lockdown writes',async()=>{
  const p={userId:owner.user!.id},disconnect=await h.runtime.service.connectDisplay(p,sessionId,displayId);
  let start!:()=>void;const signal=new Promise<void>(resolve=>{start=resolve;});
  // Create outside the transaction so the callback does not inherit its ALS context.
  const pending=(async()=>{await signal;await disconnect();})();
  try{
   await h.runtime.store.atomic(async()=>{
    const display=await h.runtime.store.get<any>('display',displayId);display.lockdown=true;await h.runtime.store.put('display',display);
    const read=vi.spyOn(h.runtime.store,'get');
    try{start();await new Promise<void>(resolve=>setImmediate(resolve));expect(read.mock.calls.filter(([kind])=>kind==='display')).toHaveLength(0);}
    finally{read.mockRestore();}
   });
  }finally{start();await pending;}
  expect(await h.runtime.store.get<any>('display',displayId)).toMatchObject({lockdown:true,online:false});
 });
 it('retains image diagnostic history beyond its former cap and captures content-free raw failures',async()=>{
  const url='https://example.com/reference.png';await owner.submit(sessionId,[displayId],validateView({template:'image',data:{images:[{url,alt:'Reference'}]}}));
  await h.runtime.store.query(`INSERT INTO documents(kind,id,session_id,value) SELECT 'image-diagnostic','diagnostic-'||n,$1::text,json_build_object('id','diagnostic-'||n,'sessionId',$1::text,'displayId',$2::text,'revision',0,'reason','HTTP_404','at','2026-11-05T00:00:00Z')::text FROM generate_series(1,100) n`,[sessionId,displayId]);
  const display=await h.runtime.service.display({userId:owner.user!.id},sessionId,displayId);
  success(await owner.request('POST',`/api/sessions/${sessionId}/displays/${displayId}/image-diagnostic`,{expectedRevision:display.revision,url,reason:'HTTP_404'}));
  expect(await h.runtime.store.list('image-diagnostic',sessionId)).toHaveLength(101);
  const events=(await h.runtime.store.query("SELECT user_id,properties FROM events WHERE event_type='document.image-diagnostic'")).rows;
  expect(events).toEqual([expect.objectContaining({user_id:owner.user!.id,properties:expect.objectContaining({reason:'HTTP_404'})})]);expect(JSON.stringify(events)).not.toContain(url);
 });
 it('kiosk remains separate from privacy and only the owner may configure it',async()=>{
  const p={userId:owner.user!.id};await owner.submit(sessionId,[displayId],fact('Visible kiosk'));
  await h.runtime.service.execute('kanvas_display_lockdown',{sessionId,displayId,locked:true},p);
  expect((await owner.detail(sessionId)).displays[0]).toMatchObject({lockdown:true,view:{data:{text:'Visible kiosk'}}});
  await owner.submit(sessionId,[displayId],fact('Owner replacement'));
  expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe('Owner replacement');
  await expect(h.runtime.service.execute('kanvas_display_lockdown',{sessionId,displayId,locked:false},{userId:(await h.account()).user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
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
 });
 it('retains more than the former 6 MiB budget without archiving or truncating exact sources',async()=>{
  const display=await h.runtime.service.display({userId:owner.user!.id},sessionId,displayId);
  const source='x'.repeat(100000),view=validateView({template:'code',data:{kind:'diff',before:source,after:source}});
  for(let i=0;i<35;i++){display.revision++;display.view=view;await h.runtime.service.history.record(display,'publication');}
  const rows=(await h.runtime.store.list<any>('display-history',sessionId,true)).filter(e=>e.view);
  expect(rows.length).toBe(35);expect(Buffer.byteLength(JSON.stringify(rows))).toBeGreaterThan(6*1024*1024);
  expect(rows.every(e=>!e.archivedAt&&e.view.data.before===source&&e.view.data.after===source)).toBe(true);
  expect((await h.runtime.service.history.list(display)).entries.filter(e=>e.template)).toHaveLength(35);
 });
 it('rejects the 1001st publication without evicting stored views',async()=>{
  const p={userId:owner.user!.id};await owner.submit(sessionId,[displayId],fact('First'));
  await h.runtime.store.query(`INSERT INTO documents(kind,id,session_id,value) SELECT 'display-history','capacity-'||n,$1::text,json_build_object('id','capacity-'||n,'sessionId',$1::text,'displayId',$2::text,'revision',n,'view',json_build_object('version',1,'template','fact','data',json_build_object('text','retained')),'createdAt','2026-11-05T00:00:00Z','reason','fixture')::text FROM generate_series(1,999) n`,[sessionId,displayId]);
  const display=await h.runtime.service.display(p,sessionId,displayId);display.revision++;display.view=fact('Too many');
  await expect(h.runtime.service.history.record(display,'prepared')).rejects.toMatchObject({code:'LIMIT_REACHED',message:expect.stringContaining('Start a new session')});
  expect((await h.runtime.store.list<any>('display-history',sessionId,true)).filter(e=>e.view)).toHaveLength(1000);
  // Navigating the current retained publication and clearing the screen remain
  // possible at capacity; neither removes or frees a retained publication.
  display.revision++;display.view=fact('Navigation state');await h.runtime.service.history.record(display,'display-sync');
  display.revision++;display.view=null;await h.runtime.service.history.record(display,'clear');
  expect(await h.runtime.service.history.retainedCount(sessionId)).toBe(1000);
  display.revision++;display.view=fact('Still full');await expect(h.runtime.service.history.record(display,'prepared')).rejects.toMatchObject({code:'LIMIT_REACHED'});

 });
 it('attributes otherwise-public status requests only when their browser credential is valid',async()=>{
  success(await owner.request('GET','/api/device-privacy/status'));
  success(await h.browser().request('GET','/api/device-privacy/status'));
  await vi.waitFor(async()=>{
   const rows=(await h.runtime.store.query("SELECT user_id FROM events WHERE event_type='http.request' AND operation='GET /api/device-privacy/status'")).rows;
   expect(rows).toHaveLength(2);expect(rows.map(r=>r.user_id)).toEqual(expect.arrayContaining([owner.user!.id,null]));
   const signins=(await h.runtime.store.query("SELECT user_id FROM events WHERE event_type='http.request' AND operation='POST /api/auth/register'")).rows;
   expect(signins).toContainEqual({user_id:owner.user!.id});
  });
 });
 it('keeps raw attributed events append-only without writing new hourly aggregates or content',async()=>{
  const marker='PRIVATE_CONTENT_NEVER_IN_EVENTS';await owner.submit(sessionId,[displayId],fact(marker));
  await eventContext.run({userId:owner.user!.id,client:{timeZone:'Europe/Oslo'}},()=>rawEvent(h.runtime.store,'test.event',{sessionId,properties:{status:'ok'}}));
  const rows=(await h.runtime.store.query('SELECT * FROM events')).rows;
  expect(rows.some(r=>r.event_type==='test.event'&&r.user_id===owner.user!.id&&r.client_context.timeZone==='Europe/Oslo')).toBe(true);
  expect(JSON.stringify(rows)).not.toContain(marker);
  expect((await h.runtime.store.query('SELECT count(*)::int AS n FROM request_metrics')).rows[0].n).toBe(0);
  await expect(h.runtime.store.query("UPDATE events SET status='changed'")).rejects.toThrow('append-only');
  await expect(h.runtime.store.query('DELETE FROM events')).rejects.toThrow('append-only');
  const user=(await h.runtime.store.query('SELECT created_at,last_login_at,last_seen_at FROM users WHERE id=$1',[owner.user!.id])).rows[0];expect(user.created_at).toBeTruthy();expect(user.last_login_at).toBeTruthy();expect(user.last_seen_at).toBeTruthy();
 });
});

describe('November 5 template diagnostics',()=>{
 it('accepts visible board coordinates with unambiguous normalized mapping',()=>{
  expect(gameDataSchema.parse({preset:'chess',pieces:{knight:{cell:'f3',symbol:'knight'}}}).pieces.knight.cell).toBe('r6c6');
  expect(gameDataSchema.parse({preset:'sudoku',cells:{C7:{value:'4'}}}).cells.r7c3.value).toBe('4');
  expect(()=>gameDataSchema.parse({preset:'sudoku',cells:{C7:{value:'4'},r7c3:{value:'5'}}})).toThrow();
 });

 it('suggests valid unknown-template alternatives without echoing arbitrary source',()=>{
  const value={version:1,template:'quick-fact',data:{text:'Secret source'}};
  try{validateView(value);throw Error('Expected invalid template');}catch(e){expect(e).toBeInstanceOf(z.ZodError);const issues=validationIssues(e as z.ZodError,'view',value);expect(JSON.stringify(issues)).toContain('Unknown template');expect(JSON.stringify(issues)).toContain('fact');expect(JSON.stringify(issues)).not.toContain('Secret source');}
 });
 it('accepts arbitrary QR text, keeps controls opt-in, rejects excessive UTF8',()=>{
  const view=validateView({template:'qr',data:{content:'WIFI:T:WPA;S:Example;P:secret;;',title:'Connect',text:'Scan here'}});expect(view.showControls).not.toBe(true);
  expect(()=>validateView({template:'qr',data:{content:'😀'.repeat(1000)}})).toThrow();
 });
});
