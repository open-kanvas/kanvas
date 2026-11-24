import { afterEach } from 'vitest';
import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { startHarness } from './harness.js';
import { fact } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { accountTier } from '../../src/server/usage-limits.js';
import { accountUsageLimits } from '../../src/server/usage-limits.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';

describe("archive coverage 1", () => {

let h!:Harness;
afterEach(async()=>{vi.restoreAllMocks();delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;delete process.env.KANVAS_MAX_VIEWS_PER_SESSION;await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
describe("archive contracts",()=>{
 it('batch archive is atomic and one two-minute challenge authorizes only the exact selected set',async()=>{
  h=await startHarness();const owner=await h.account(),p=await principal(owner),s=await owner.session(),d=await owner.display(s.id);
  for(const text of ['A','B','C'])await owner.submit(s.id,[d.id],fact(text));
  const targets=(await h.runtime.service.history.list(await h.runtime.service.display(p,s.id,d.id))).entries.filter(x=>x.template).map(x=>x.id),input={sessionId:s.id,resource:'view',targetIds:targets.slice(0,2)};
  await expect(h.runtime.service.archive.create(p,{...input,targetIds:[targets[0],'missing']})).rejects.toBeDefined();
  expect((await h.runtime.service.archive.list(p,{})).items).toHaveLength(0);
  await h.runtime.service.archive.create(p,input);
  expect((await h.runtime.service.archive.list(p,{})).items).toHaveLength(2);
  const request:any=await h.runtime.service.archive.requestDelete(p,{...input,confirmationDisplayId:d.id});
  expect(Date.parse(request.expiresAt)-Date.now()).toBeGreaterThan(115000);expect(request.words).toBeUndefined();
  const challenge:any=await h.runtime.store.get('delete-challenge',request.challengeId),toast:any=await h.runtime.store.get('toast',challenge.toastId);
  expect(toast.confirmationWords.split(' ')).toHaveLength(3);expect(toast.text).not.toContain(toast.confirmationWords);
  await expect(h.runtime.service.archive.confirmDelete(p,{...input,targetIds:[targets[0],targets[2]],challengeId:request.challengeId,words:toast.confirmationWords})).rejects.toMatchObject({code:'NOT_FOUND'});
  const result:any=await h.runtime.service.archive.confirmDelete(p,{...input,targetIds:[...input.targetIds].reverse(),challengeId:request.challengeId,words:toast.confirmationWords});
  expect(result.deleted).toBe(true);expect(await h.runtime.store.get('display-history',targets[0],true)).toBeUndefined();expect(await h.runtime.store.get('display-history',targets[2],true)).toBeDefined();
 });});
});

describe('narrow archive operation contracts',()=>{
 it('publishes four strict mutation schemas with no action escape or legacy alias',async()=>{
  const {archiveOperations}=await import('../../src/server/mcp/operation-domains/archive.js');
  expect(archiveOperations.map(op=>op.name)).toEqual(['kanvas.archive.list','kanvas.archive.create','kanvas.archive.restore','kanvas.archive.delete.request','kanvas.archive.delete.confirm']);
  for(const op of archiveOperations.filter(op=>op.name!=='kanvas.archive.list')){
   const input={resource:'session',sessionId:'session-id',...(op.name.endsWith('.confirm')?{challengeId:'challenge-id',words:'human supplied words'}:{})};
   expect(op.schema.safeParse(input).success).toBe(true);
   expect(op.schema.safeParse({...input,action:'confirm-delete'}).success).toBe(false);
   if(!op.name.endsWith('.confirm'))expect(op.schema.safeParse({...input,challengeId:'challenge-id',words:'Alpha Bravo Charlie'}).success).toBe(false);
   if(!op.name.endsWith('.request'))expect(op.schema.safeParse({...input,confirmationDisplayId:'display-id'}).success).toBe(false);
  }
  const confirm=archiveOperations.find(op=>op.name.endsWith('.confirm'))!;
  expect(confirm.schema.safeParse({resource:'session',sessionId:'session-id'}).success).toBe(false);
 });
 it('dispatches the new archive operations and rejects the retired name',async()=>{
  const h=await startHarness();try{
   const owner=await h.account(),p={userId:owner.user!.id},s=await owner.session(),input={resource:'session',sessionId:s.id};
   const call=(name:string,args:unknown)=>h.runtime.service.execute(name,args,p);
   await expect(call('kanvas.archive.manage',input)).rejects.toMatchObject({code:'UNKNOWN_TOOL'});
   expect(await call('kanvas.archive.create',input)).toMatchObject({archived:true});
   expect(await call('kanvas.archive.restore',input)).toMatchObject({archived:false});
   await expect(call('kanvas.archive.create',{...input,action:'confirm-delete'})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
   const d=await owner.display(s.id),target={resource:'display',sessionId:s.id,targetId:d.id};
   const request:any=await call('kanvas.archive.delete.request',{...target,confirmationDisplayId:d.id});
   const challenge:any=await h.runtime.store.get('delete-challenge',request.challengeId),toast:any=await h.runtime.store.get('toast',challenge.toastId);
   expect(await call('kanvas.archive.delete.confirm',{...target,challengeId:request.challengeId,words:toast.confirmationWords})).toMatchObject({deleted:true});
  }finally{await h.close();}
 });
 it('preserves owner and scoped-token checks and restores archived resources',async()=>{
  const h=await startHarness();try{
   const owner=await h.account(),other=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},s=await owner.session(),archive=h.runtime.service.archive;
   const input={resource:'session',sessionId:s.id};
   await expect(archive.create(q,input)).rejects.toMatchObject({code:'NOT_FOUND'});
   await expect(archive.create({...p,scopedSessionId:s.id},input)).rejects.toMatchObject({code:'FORBIDDEN'});
   await expect(archive.create(p,{...input,action:'confirm-delete'})).rejects.toBeDefined();
   expect(await archive.create(p,input)).toMatchObject({archived:true,recoverable:true});
   expect((await archive.list(p,{})).items).toEqual(expect.arrayContaining([expect.objectContaining({resource:'session',sessionId:s.id})]));
   expect(await archive.restore(p,input)).toMatchObject({archived:false,recoverable:true});
   expect((await archive.list(p,{})).items).toEqual([]);
  }finally{await h.close();}
 });
 it('keeps challenge expiry, three-attempt invalidation, one-use approval and held/locked display flags',async()=>{
  const h=await startHarness();try{
   const owner=await h.account(),p={userId:owner.user!.id},s=await owner.session(),d=await owner.display(s.id),archive=h.runtime.service.archive;
   const stored:any=await h.runtime.store.get('display',d.id);stored.held=true;stored.lockdown=true;await h.runtime.store.put('display',stored);
   const input={resource:'display',sessionId:s.id,targetId:d.id};
   const request=()=>archive.requestDelete(p,{...input,confirmationDisplayId:d.id}) as Promise<any>;
   const first=await request(),row:any=await h.runtime.store.get('delete-challenge',first.challengeId);
   row.expiresAt=Date.now()-1;await h.runtime.store.put('delete-challenge',row);
   await expect(archive.confirmDelete(p,{...input,challengeId:first.challengeId,words:'Wrong words'})).rejects.toMatchObject({code:'CONFIRMATION_EXPIRED'});
   const second=await request();
   expect(await h.runtime.store.get('delete-challenge',first.challengeId)).toBeUndefined();
   for(let n=0;n<3;n++)expect(await archive.confirmDelete(p,{...input,challengeId:second.challengeId,words:'Wrong words'})).toMatchObject({deleted:false,code:'CONFIRMATION_MISMATCH'});
   expect(await h.runtime.store.get('delete-challenge',second.challengeId)).toBeUndefined();
   expect(await h.runtime.store.get('display',d.id)).toMatchObject({held:true,lockdown:true,revision:stored.revision});
   const third=await request(),challenge:any=await h.runtime.store.get('delete-challenge',third.challengeId),toast:any=await h.runtime.store.get('toast',challenge.toastId);
   expect(third).not.toHaveProperty('words');expect(third.warning).toContain('not a browser acknowledgement');
   const confirmation={...input,challengeId:third.challengeId,words:toast.confirmationWords};
   expect(await archive.confirmDelete(p,confirmation)).toMatchObject({deleted:true,recoverable:false});
   expect(await h.runtime.store.get('delete-challenge',third.challengeId)).toBeUndefined();
   expect(await h.runtime.store.get('toast',challenge.toastId)).toBeUndefined();
   await expect(archive.confirmDelete(p,confirmation)).rejects.toBeDefined();
  }finally{await h.close();}
 });
});
