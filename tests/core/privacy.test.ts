import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { validationIssues } from '../../src/server/input-errors.js';
import { z } from 'zod';
import { gameDataSchema } from '../../src/shared/game.js';
import { createApp } from '../../src/server/app.js';
import { rawEvent } from '../../src/server/raw-events.js';
import { eventContext } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { experienceTools } from '../../src/server/mcp/experience-tools.js';
import { applyChecklistChanges } from '../../src/server/checklists.js';
import { checklistTools } from '../../src/server/checklists.js';
import { CHECKLIST_RETAINED_REVISIONS } from '../../src/server/checklists.js';
import { safeError } from '../../src/server/mcp/results.js';
import { toastBuiltInIcon } from '../../src/shared/viewer-experience.js';
import { TOAST_TYPES } from '../../src/shared/viewer-experience.js';
import type { ToastRecord } from '../../src/shared/viewer-experience.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { PRESENCE_GRACE_MS } from '../../src/server/receiving-presence.js';
import { PRESENCE_LEAVE_MS } from '../../src/server/receiving-presence.js';
import { runPrivacyCycle } from '../../src/client/device-privacy-check.js';
import { privacyBackoffMs } from '../../src/client/device-privacy-check.js';
import { PRIVACY_DEADLINE_MS } from '../../src/client/device-privacy-check.js';

describe("privacy coverage 1", () => {


describe("privacy contracts",()=>{
 let h!:Harness,owner:Browser,sessionId:string,displayId:string;
 beforeEach(async()=>{h=await startHarness();owner=await h.account();sessionId=(await owner.session()).id;displayId=(await owner.display(sessionId)).id;});
 afterEach(async()=>{await h?.close();});
 it('closes already-open event streams and keeps device lock through a real runtime restart',async()=>{
  const device=success(await owner.request<{id:string}>('POST','/api/devices/register',{installationId:randomUUID(),provisionHome:false}));
  const controller=new AbortController(),response=await owner.raw(`/api/sessions/${sessionId}/events`,{},{signal:controller.signal});expect(response.status).toBe(200);
  const reader=response.body!.getReader();let closed=false;const finished=(async()=>{try{while(!(await reader.read()).done){}}finally{closed=true;}})();
  try{await h.runtime.service.privacy.set({userId:owner.user!.id},{deviceId:device.id},true);await vi.waitFor(()=>expect(closed).toBe(true));await finished;}finally{controller.abort();}
  await h.shutdown();const restarted=await createApp({database:h.database});
  try{expect(await restarted.service.privacy.locked(device.id)).toBe(true);expect((await restarted.store.list('device-privacy-binding')).length).toBeGreaterThan(0);await restarted.service.privacy.set({userId:owner.user!.id},{deviceId:device.id},false);expect(await restarted.service.privacy.locked(device.id)).toBe(false);}finally{await restarted.close();}
 });
 it('kiosk remains separate from privacy and only the owner may configure it',async()=>{
  const p={userId:owner.user!.id};await owner.submit(sessionId,[displayId],fact('Visible kiosk'));
  await h.runtime.service.execute('kanvas_display_lockdown',{sessionId,displayId,locked:true},p);
  expect((await owner.detail(sessionId)).displays[0]).toMatchObject({lockdown:true,view:{data:{text:'Visible kiosk'}}});
  await owner.submit(sessionId,[displayId],fact('Owner replacement'));
  expect((await owner.detail(sessionId)).displays[0].view?.data.text).toBe('Owner replacement');
  await expect(h.runtime.service.execute('kanvas_display_lockdown',{sessionId,displayId,locked:false},{userId:(await h.account()).user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('omits routine privacy status polls while retaining attributed sign-in requests',async()=>{
  success(await owner.request('GET','/api/device-privacy/status'));
  success(await h.browser().request('GET','/api/device-privacy/status'));
  await vi.waitFor(async()=>{
   const rows=(await h.runtime.store.query("SELECT user_id FROM events WHERE event_type='http.request' AND operation='GET /api/device-privacy/status'")).rows;
   expect(rows).toHaveLength(0);
   const signins=(await h.runtime.store.query("SELECT user_id FROM events WHERE event_type='http.request' AND operation='POST /api/auth/register'")).rows;
   expect(signins).toContainEqual({user_id:owner.user!.id});
  });
 });});
});

describe("privacy coverage 2", () => {


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
 });});
});
