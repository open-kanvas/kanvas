import {afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Response} from 'express';
import {startHarness,fact,type Harness,type Browser} from './harness.js';
import {accountTier,accountUsageLimits} from '../../src/server/usage-limits.js';
import {VisualCaptureResult} from '../../src/server/visual-capture.js';
import {resolveToolCall} from '../../src/server/mcp/catalog.js';
let h:Harness;
afterEach(async()=>{vi.restoreAllMocks();delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;delete process.env.KANVAS_MAX_VIEWS_PER_SESSION;await h?.close();});
async function principal(a:Browser){const session=await h.runtime.auth.issueBrowser(a.user!.id,{cookie:()=>{}} as unknown as Response);return {userId:a.user!.id,browserId:session.id};}
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
describe('October platform feedback',()=>{
 it('discovers the new operations in every MCP profile',()=>{
  for(const [canonical,tool,operation,args] of [
   ['kanvas_report_patch','kanvas_feedback','patch',{reportId:'r',expectedRevision:0,note:'Finding'}],
   ['kanvas_asset_export','kanvas_import','asset.export',{sessionId:'s',assetId:'a'}],
   ['kanvas_account_begin','kanvas_account','begin',{requestId:'start'}],
  ] as const){
   expect(resolveToolCall('legacy',canonical,args).error).toBeUndefined();
   expect(resolveToolCall('domains',tool,{operation,...args}).error).toBeUndefined();
  }
 });
 it('tiers retain session entitlements and share the fixed view cap without gaining administrator authority',async()=>{
  h=await startHarness();const a=await h.account(),p=await principal(a);
  process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT=String((await h.runtime.service.sessions(p)).length+1);process.env.KANVAS_MAX_VIEWS_PER_SESSION='1';
  expect(await accountTier(h.runtime.store,p.userId)).toBe('trial');
  const s=await h.runtime.service.createSession(p,'Trial'),d=await h.runtime.service.createDisplay(p,s.id,{name:'Screen',width:800,height:600});
  await expect(h.runtime.service.createSession(p,'Too many')).rejects.toMatchObject({code:'LIMIT_REACHED'});
  await h.runtime.store.put('account-tier',{id:p.userId,tier:'future-invalid'});
  await expect(h.runtime.service.createSession(p,'Still trial')).rejects.toMatchObject({code:'LIMIT_REACHED'});
  for(const tier of ['free','admin']){await h.runtime.store.put('account-tier',{id:p.userId,tier});await h.runtime.service.createSession(p,`Tier ${tier}`);expect(await h.runtime.service.accounts.isServiceAdmin(p)).toBe(false);}
  for(let i=0;i<3;i++)await a.submit(s.id,[d.id],fact(`View ${i}`));
  expect((await h.runtime.service.history.list(await h.runtime.service.display(p,s.id,d.id))).entries.filter(x=>x.template)).toHaveLength(3);
  await h.runtime.store.put('account-tier',{id:p.userId,tier:'trial'});
  expect((await accountUsageLimits(h.runtime.store,p.userId)).views).toBe(1000);await a.submit(s.id,[d.id],fact('Within fixed cap'));
  for(const tier of ['free','admin']){await h.runtime.store.put('account-tier',{id:p.userId,tier});expect((await accountUsageLimits(h.runtime.store,p.userId)).views).toBe(1000);}
 });
 it('author patches by report ID across conversation context with revision and access checks',async()=>{
  h=await startHarness();const owner=await h.account(),other=await h.account(),p=await principal(owner),q=await principal(other),s=await owner.session();
  const report=await h.runtime.service.reports.submit(p,'feedback',{sessionId:s.id,requestId:'report',title:'Synthetic finding',description:'Initial description',category:'feature'});
  const patched:any=await h.runtime.service.execute('kanvas_report_patch',{reportId:report.id,expectedRevision:0,note:'Follow-up observation',title:'Updated finding'},p);
  expect(patched).toMatchObject({revision:1,title:'Updated finding',status:'open',history:[{note:'Follow-up observation'}]});
  await expect(h.runtime.service.execute('kanvas_report_patch',{reportId:report.id,expectedRevision:0,note:'Stale'},p)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
  await expect(h.runtime.service.execute('kanvas_report_patch',{reportId:report.id,expectedRevision:1,note:'Cross-account'},q)).rejects.toMatchObject({code:'NOT_FOUND'});
  const grant=await h.runtime.auth.issueToken(p.userId,'Selected',['read','publish'],['different']);
  await expect(h.runtime.service.execute('kanvas_report_patch',{reportId:report.id,expectedRevision:1,note:'Wrong grant'}, {userId:p.userId,tokenId:grant.token.id})).rejects.toBeDefined();
 });
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
 });
 it('portable asset chunks preserve bytes and original session authorization',async()=>{
  h=await startHarness();const owner=await h.account(),other=await h.account(),p=await principal(owner),q=await principal(other),s=await owner.session();
  const asset=await h.runtime.service.importAsset(p,s.id,{name:'pixel.png',mimeType:'image/png',base64:pixel});
  const chunks:Buffer[]=[];let offset=0;
  for(;;){const r:any=await h.runtime.service.execute('kanvas_asset_export',{sessionId:s.id,assetId:asset.id,offset,length:13},p);chunks.push(Buffer.from(r.base64,'base64'));if(r.complete)break;offset=r.nextOffset;}
  expect(Buffer.concat(chunks).toString('base64')).toBe(pixel);
  await expect(h.runtime.service.execute('kanvas_asset_export',{sessionId:s.id,assetId:asset.id},q)).rejects.toBeDefined();
  await expect(h.runtime.service.execute('kanvas_asset_export',{sessionId:s.id,assetId:asset.id,offset:999},p)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  const d=await owner.display(s.id);vi.spyOn(h.runtime.service.visualCapture,'capture').mockResolvedValue(new VisualCaptureResult({readiness:'ready'},Buffer.from(pixel,'base64'),'image/png'));
  const snapshot:any=await h.runtime.service.execute('kanvas_display_snapshot',{sessionId:s.id,displayId:d.id,includeBase64:true},p);
  expect(snapshot.metadata.export).toMatchObject({base64:pixel,mimeType:'image/png',size:Buffer.from(pixel,'base64').length});
 });
 it('omitted display targets the stable primary instead of blocking or broadcasting',async()=>{
  h=await startHarness();const owner=await h.account(),p=await principal(owner),s=await owner.session(),first=await owner.display(s.id),second=await owner.display(s.id);
  const r:any=await h.runtime.service.execute('kanvas_submit',{sessionId:s.id,requestId:'primary',view:fact('First screen only')},p);
  expect(r.status).not.toBe('needs_target');expect(r.targets.map((x:any)=>x.displayId)).toEqual([first.id]);
  expect((await h.runtime.service.display(p,s.id,second.id)).view).toBeNull();
 });
 it('begin prompts the bare environment URL without creating sessions until a receiver is selected',async()=>{
  h=await startHarness();const owner=await h.account(),p=await principal(owner);
  const before=(await h.runtime.service.sessions(p)).length;
  const none:any=await h.runtime.service.execute('kanvas_account_begin',{requestId:'begin'},p);expect(none.status).toBe('needs_display');expect(new URL(none.startUrl).pathname).toBe('/');expect((await h.runtime.service.sessions(p)).length).toBe(before);
  const device={id:'own-device',name:'My laptop',windows:[{id:'one',name:'One',connected:true,version:0},{id:'two',name:'Two',connected:true,version:0}]};
  vi.spyOn(h.runtime.service.devices,'list').mockResolvedValue({devices:[device],note:''} as any);
  const ambiguous:any=await h.runtime.service.execute('kanvas_account_begin',{requestId:'begin'},p);expect(ambiguous.status).toBe('needs_target');expect((await h.runtime.service.sessions(p)).length).toBe(before);
  const present=vi.spyOn(h.runtime.service.devices.windows,'present').mockResolvedValue({commandId:'command'} as any);
  const args={requestId:'begin',deviceId:'own-device',windowId:'one'},started:any=await h.runtime.service.execute('kanvas_account_begin',args,p);
  expect(started.status).toBe('started');expect((await h.runtime.service.display(p,started.sessionId,started.displayId)).view).toBeNull();
  expect((await h.runtime.service.execute('kanvas_account_begin',args,p) as any).sessionId).toBe(started.sessionId);expect(present).toHaveBeenCalledTimes(1);
 });
});
