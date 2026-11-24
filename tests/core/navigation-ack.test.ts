import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {startHarness,type Harness,type Browser} from './harness.js';
import {hash,type AuthPrincipal} from '../../src/server/auth.js';

describe('bounded per-viewer navigation acknowledgement',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:AuthPrincipal;
 const dispose:Array<()=>unknown>=[];
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id,browserId:hash(o.cookies.get('kanvas')!)};await o.submit(s,[d],{version:1,template:'table',data:{columns:['Name'],rows:[{Name:'One'},{Name:'Two'}],pageSize:1}});});
 afterEach(async()=>{for(const f of dispose.splice(0))await f();await h?.close();});
 const args=(requestId='navigate')=>({sessionId:s,displayId:d,requestId,expectedRevision:1,navigation:{action:'page',page:2}});
 async function receiver(tabId:string){const c=await h.runtime.service.experience.receiving.connect(p,s,d,tabId,'Ack fixture');dispose.push(()=>c.disconnect());return h.runtime.service.experience.viewerId(p,tabId);}
 async function acknowledge(tabId:string,status:'applied'|'failed'='applied'){const n=h.runtime.service.navigation,snapshot=await n.browserRead(p,s,d,tabId);return n.acknowledge(p,s,d,{tabId,revision:1,commandId:snapshot.commandId,status});}
 it('returns immediately offline without synthetic viewer success',async()=>{const start=performance.now(),r=await h.runtime.service.navigation.control(p,args());expect(r.deliveryStatus).toBe('offline');expect(r.viewers).toEqual([]);expect(performance.now()-start).toBeLessThan(900);});
 it('waits for all original viewers and reports mixed failure without borrowing another viewer ack',async()=>{
  const a=await receiver('one'),b=await receiver('two'),n=h.runtime.service.navigation;
  const promise=n.control(p,args());await vi.waitFor(async()=>expect((await n.browserRead(p,s,d,'one')).version).toBe(1));
  await acknowledge('one');let settled=false;void promise.then(()=>settled=true);await new Promise(r=>setTimeout(r,30));expect(settled).toBe(false);
  await acknowledge('two','failed');const result=await promise;expect(result.delivery[a].status).toBe('applied');expect(result.delivery[b].status).toBe('failed');expect(result.waitedMs).toBeLessThan(1500);
  const replay=await n.control(p,args());expect(replay.commandId).toBe(result.commandId);expect(replay.delivery[b].status).toBe('failed');
 });
 it('unconfirmed commands accept late genuine acknowledgements without reapplying',async()=>{
  const viewerId=await receiver('late'),n=h.runtime.service.navigation,r=await n.control(p,args());expect(r.delivery[viewerId].status).toBe('unconfirmed');expect(r.waitedMs).toBeGreaterThanOrEqual(1950);
  await acknowledge('late');const replay=await n.control(p,args());expect(replay.delivery[viewerId].status).toBe('applied');expect(replay.commandId).toBe(r.commandId);expect(replay.version).toBe(r.version);
  const read=await n.read(p,{sessionId:s,displayId:d});expect(read.viewers[0].status).toBe('applied');
 });
 it('a replacement command supersedes the old wait and stale acknowledgements are rejected',async()=>{
  const v=await receiver('replace'),n=h.runtime.service.navigation,pending=n.control(p,args('old'));await vi.waitFor(async()=>expect((await n.browserRead(p,s,d,'replace')).version).toBe(1));
  const old=await n.browserRead(p,s,d,'replace');await n.browserControl(p,s,d,{tabId:'replace',requestId:'new',expectedRevision:1,navigation:{action:'page',page:1}});
  expect((await pending).delivery[v].status).toBe('superseded');expect(await n.acknowledge(p,s,d,{tabId:'replace',revision:1,commandId:old.commandId,status:'applied'})).toEqual({ignored:true});
 });
 it('revocation during the bounded wait rejects the response',async()=>{
  await receiver('revoked');const service=h.runtime.service,n=service.navigation,other=await h.account(),member={userId:other.user!.id};
  await service.addMember(p,s,other.user!.username,'editor');
  const outcome=n.control(member,args()).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
  await vi.waitFor(async()=>expect((await n.browserRead(p,s,d,'revoked')).version).toBe(1));
  await service.removeMember(p,s,other.user!.id);const result=await outcome;expect(result.error).toBeDefined();expect(result.value).toBeUndefined();
 });
 it('unauthorized and conflicting retries do not mutate',async()=>{
  await receiver('access');const n=h.runtime.service.navigation,r=await n.control(p,args());await expect(n.control(p,{...args(),navigation:{action:'page',page:1}})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  const other=await h.account();await expect(n.control({userId:other.user!.id},args())).rejects.toBeDefined();expect((await n.browserRead(p,s,d,'access')).commandId).toBe(r.commandId);
 });
});
