import {afterEach,it,expect,vi} from 'vitest';
import {startHarness,success,denied,type Harness,type Browser} from './harness';
import {gameDataSchema} from '../../src/shared/game';
import type {AuthPrincipal} from '../../src/server/auth';
let h:Harness;afterEach(async()=>{await h?.close();});
const position=(rank:'A'|'K')=>({version:1 as const,template:'game-board' as const,data:gameDataSchema.parse({preset:'poker',zones:{hand:{label:'Your hand'}},cards:{hole1:{face:'up',zone:'hand',order:0,rank,suit:'spades'}}})});
async function paired(owner:Browser,sessionId:string,displayId:string){const screen=h.browser(),pair=success(await screen.request<{id:string}>('POST','/api/pairings',{sessionId,displayId,deviceName:'Isolated card recipient'}));success(await owner.request('POST',`/api/pairings/${pair.id}/decision`,{approve:true}));success(await screen.request('GET',`/api/pairings/${pair.id}/status`));return {screen,pair};}
it('isolates separately authorized recipient sessions across API, history, snapshots, token scopes, paired windows and event streams',async()=>{
 h=await startHarness();const owner=await h.account(),stranger=await h.account(),s1=await owner.session('Recipient 1'),s2=await owner.session('Recipient 2'),d1=await owner.display(s1.id),d2=await owner.display(s2.id),service=h.runtime.service,p={userId:owner.user!.id};
 const u1=await owner.submit(s1.id,[d1.id],position('A')),u2=await owner.submit(s2.id,[d2.id],position('K'));
 const a=await paired(owner,s1.id,d1.id),b=await paired(owner,s2.id,d2.id);
 for(const [receiver,own,other,otherDisplay,wanted,unwanted] of [[a.screen,s1,s2,d2,'A','K'],[b.screen,s2,s1,d1,'K','A']] as const){
  const detail=success(await receiver.request<any>('GET',`/api/sessions/${own.id}`));expect(detail.displays[0].view.data.cards.hole1.rank).toBe(wanted);expect(JSON.stringify(detail)).not.toContain(`"rank":"${unwanted}"`);expect(detail.updates).toEqual([]);
  for(const path of [`/api/sessions/${other.id}`,`/api/sessions/${other.id}/displays/${otherDisplay.id}/history`,`/api/sessions/${other.id}/events?displayId=${otherDisplay.id}`])denied(await receiver.request('GET',path));
 }
 // A fully signed-in controller is intentionally authorized to both, unlike each paired screen.
 expect((await service.detail(p,s2.id)).displays[0].view!.data.cards).toMatchObject({hole1:{rank:'K'}});
 const token=await h.runtime.auth.issueToken(owner.user!.id,'recipient 1 agent',['read','publish'],[s1.id]);const scoped:AuthPrincipal={userId:owner.user!.id,tokenId:token.token.id,agentId:token.token.agentId,scopes:token.token.scopes};
 expect((await service.display(scoped,s1.id,d1.id)).view!.data.cards).toMatchObject({hole1:{rank:'A'}});
 for(const unauthorized of [scoped,{userId:stranger.user!.id}]){
  await expect(service.display(unauthorized,s2.id,d2.id)).rejects.toThrow();await expect(service.displayHistory(unauthorized,s2.id,d2.id)).rejects.toThrow();
  await expect(service.execute('kanvas_display_snapshot',{sessionId:s2.id,displayId:d2.id},unauthorized)).rejects.toThrow();
  await expect(service.execute('kanvas_update_status',{sessionId:s2.id,requestId:u2.update.requestId},unauthorized)).rejects.toThrow();
 }
 // Authorized event delivery contains invalidations only, never retained card payloads.
 const subscription=vi.spyOn(service,'onEvent');const response=await a.screen.raw(`/api/sessions/${s1.id}/events?displayId=${d1.id}`);expect(response.status).toBe(200);const reader=response.body!.getReader();
 try{await reader.read();await vi.waitFor(()=>expect(subscription).toHaveBeenCalled());service.emit({type:'display',sessionId:s1.id,displayId:d1.id,revision:u1.update.revisions[d1.id],data:{secret:'MUST-NOT-EMIT',rank:'A'}});const event=new TextDecoder().decode((await reader.read()).value);expect(event).toContain('change');expect(event).not.toContain('MUST-NOT-EMIT');expect(event).not.toContain('rank');}finally{await reader.cancel();}
 // Revocation is enforced on subsequent reads, not merely CSS state.
 success(await owner.request('DELETE',`/api/pairings/${a.pair.id}`));denied(await a.screen.request('GET',`/api/sessions/${s1.id}`),[401,403,404]);
 for(const path of [`/api/sessions/${s1.id}`,`/api/sessions/${s1.id}/displays/${d1.id}/history`,`/api/sessions/${s1.id}/events`])denied(await stranger.request('GET',path));
},30000);
it('full-account recipients can read only their own session; a back does not erase authorized historical disclosure',async()=>{
 h=await startHarness();const controller=await h.account(),alice=await h.account(),bob=await h.account(),s1=await controller.session('Alice only'),s2=await controller.session('Bob only'),d1=await controller.display(s1.id),d2=await controller.display(s2.id),service=h.runtime.service,p={userId:controller.user!.id};
 success(await controller.request('POST',`/api/sessions/${s1.id}/members`,{username:alice.user!.username,role:'viewer'}));success(await controller.request('POST',`/api/sessions/${s2.id}/members`,{username:bob.user!.username,role:'viewer'}));
 await controller.submit(s1.id,[d1.id],position('A'));await controller.submit(s2.id,[d2.id],position('K'));
 expect((await alice.detail(s1.id)).displays[0].view!.data.cards).toMatchObject({hole1:{rank:'A'}});expect((await bob.detail(s2.id)).displays[0].view!.data.cards).toMatchObject({hole1:{rank:'K'}});
 for(const [reader,other,display] of [[alice,s2,d2],[bob,s1,d1]] as const){denied(await reader.request('GET',`/api/sessions/${other.id}`));denied(await reader.request('GET',`/api/sessions/${other.id}/displays/${display.id}/history`));denied(await reader.request('GET',`/api/sessions/${other.id}/events`));}
 const before=await service.display(p,s1.id,d1.id);await service.execute('kanvas_view_patch',{sessionId:s1.id,displayId:d1.id,requestId:'unknown-back',expectedRevision:before.revision,operations:[{op:'set',path:'/data/cards/hole1',value:{face:'back',zone:'hand',order:0}}]},p);
 const after=await service.display(p,s1.id,d1.id);expect(after.view!.data.cards).toMatchObject({hole1:{face:'back'}});expect(JSON.stringify(after.view)).not.toContain('"rank"');
 expect(JSON.stringify(await service.history.frames(after))).toContain('"rank":"A"');
},30000);
