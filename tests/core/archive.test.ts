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
  await expect(h.runtime.service.archive.manage(p,{...input,targetIds:[targets[0],'missing']})).rejects.toBeDefined();
  expect((await h.runtime.service.archive.list(p,{})).items).toHaveLength(0);
  await h.runtime.service.archive.manage(p,input);
  expect((await h.runtime.service.archive.list(p,{})).items).toHaveLength(2);
  const request:any=await h.runtime.service.archive.manage(p,{...input,action:'request-delete',confirmationDisplayId:d.id});
  expect(Date.parse(request.expiresAt)-Date.now()).toBeGreaterThan(115000);expect(request.words).toBeUndefined();
  const challenge:any=await h.runtime.store.get('delete-challenge',request.challengeId),toast:any=await h.runtime.store.get('toast',challenge.toastId);
  expect(toast.confirmationWords.split(' ')).toHaveLength(3);expect(toast.text).not.toContain(toast.confirmationWords);
  await expect(h.runtime.service.archive.manage(p,{...input,targetIds:[targets[0],targets[2]],action:'confirm-delete',challengeId:request.challengeId,words:toast.confirmationWords})).rejects.toMatchObject({code:'NOT_FOUND'});
  const result:any=await h.runtime.service.archive.manage(p,{...input,targetIds:[...input.targetIds].reverse(),action:'confirm-delete',challengeId:request.challengeId,words:toast.confirmationWords});
  expect(result.deleted).toBe(true);expect(await h.runtime.store.get('display-history',targets[0],true)).toBeUndefined();expect(await h.runtime.store.get('display-history',targets[2],true)).toBeDefined();
 });});
});
