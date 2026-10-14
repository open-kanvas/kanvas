import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,type Harness} from './harness';
import {DEFAULT_AGENT_GUIDANCE} from '../../src/server/agent-guidance';
let h:Harness;afterEach(async()=>{await h?.close();});
it('requires current version acceptance at final email confirmation and stores it atomically',async()=>{
 let link='';h=await startHarness({signinMailer:async(_email,url)=>{link=url;}});const browser=h.browser();
 success(await browser.request('POST','/api/auth/email/request',{email:'legal@example.invalid'}));const token=new URL(link).hash.split('=')[1];
 for(const acceptedLegalVersion of [undefined,'old'])expect((await browser.request('POST','/api/auth/email/consume',{token,confirm:true,...(acceptedLegalVersion?{acceptedLegalVersion}:{})})).status).toBe(400);
 expect(await h.runtime.store.list('legal-acceptance')).toHaveLength(0);
 success(await browser.request('POST','/api/auth/email/inspect',{token}));
 const signed=success(await browser.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));
 expect(await h.runtime.store.get('legal-acceptance',`${signed.user.id}:2026-10-14`)).toMatchObject({userId:signed.user.id,version:'2026-10-14',method:'email-confirmation'});
 expect((await browser.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'})).status).toBe(410);
 for(const path of ['/legal/privacy','/legal/terms','/legal/2026-10-14/privacy','/legal/2026-10-14/terms']){const response=await fetch(h.baseUrl+path);expect(response.status).toBe(200);expect(await response.text()).toContain('Version 2026-10-14');}
});
it('scopes active guidance, private draft revisions, explicit saves and concurrent edits',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},s=await owner.session(),g=h.runtime.service.guidance;
 expect((await g.read(p,{scope:'user'})).text).toBe(DEFAULT_AGENT_GUIDANCE);
 expect((await g.read(p,{scope:'session',sessionId:s.id})).text).toBe('');
 const a={scope:'user',text:'Wait for explicit visual requests.',expectedDraftRevision:0,requestId:'draft'};
 const draft:any=await g.mutate(p,a,'draft_edit');expect(draft.draft.revision).toBe(1);expect(draft.text).toBe(DEFAULT_AGENT_GUIDANCE);
 expect(await g.mutate(p,a,'draft_edit')).toEqual(draft);
 expect((await g.read(q,{scope:'user'})).draft.revision).toBe(0);
 const save={scope:'user',expectedRevision:0,expectedDraftRevision:1,requestId:'save'};
 expect((await g.mutate(p,save,'draft_save') as any).text).toBe(a.text);
 await expect(g.mutate(p,{...save,requestId:'stale'},'draft_save')).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 await expect(g.mutate(p,{scope:'user',text:'',expectedRevision:1,requestId:'blank'},'set')).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
 await expect(g.read(q,{scope:'session',sessionId:s.id})).rejects.toThrow();
 await expect(g.mutate(q,{scope:'session',sessionId:s.id,text:'steal',expectedRevision:0,requestId:'unauthorized'},'set')).rejects.toThrow();
 const writes=await Promise.allSettled(['one','two'].map(text=>g.mutate(p,{scope:'session',sessionId:s.id,text,expectedRevision:0,requestId:text},'set')));expect(writes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect((await g.exposure(q,{sessionId:s.id}))?.levels.map(x=>x.scope)).toEqual(['user']);
});
it('exposes distinct authorized organization/team/user/session only for explicit context',async()=>{
 h=await startHarness();const owner=await h.account(),other=await h.account(),p={userId:owner.user!.id},q={userId:other.user!.id},s=await owner.session(),g=h.runtime.service.guidance;
 const group=async(kind:string)=>success(await owner.request<any>('POST','/api/groups',{kind,name:kind,requestId:randomUUID()}));const org=await group('organization'),team=await group('team');
 success(await owner.request('POST',`/api/sessions/${s.id}/context`,{expectedRevision:0,organizationId:org.id,teamId:team.id}));
 for(const a of [{scope:'organization',groupId:org.id},{scope:'team',groupId:team.id},{scope:'session',sessionId:s.id}])await g.mutate(p,{...a,text:`${a.scope} guidance`,expectedRevision:0,requestId:randomUUID()},'set');
 const exposed=await g.exposure(p,{sessionId:s.id});expect(exposed?.levels.map(x=>x.scope)).toEqual(['organization','team','user','session']);
 expect((await g.exposure(p))?.levels.map(x=>x.scope)).toEqual(['user']);
 expect((await g.exposure(q,{groupId:org.id}))?.levels.map(x=>x.scope)).toEqual(['user']);
 await expect(g.read(q,{scope:'organization',groupId:org.id})).rejects.toThrow();
 await expect(g.mutate(q,{scope:'team',groupId:team.id,text:'malicious',expectedRevision:1,requestId:randomUUID()},'set')).rejects.toThrow();
});

it('selected-session clients cannot read or edit standing personal/group guidance',async()=>{
 h=await startHarness();const owner=await h.account(),s=await owner.session(),token=await h.runtime.auth.issueToken(owner.user!.id,'Selected',['read','publish'],[s.id]),p={userId:owner.user!.id,tokenId:token.token.id},g=h.runtime.service.guidance;
 await expect(g.read(p,{scope:'user'})).rejects.toMatchObject({code:'FORBIDDEN'});
 await expect(g.mutate(p,{scope:'user',text:'Change whole account',expectedRevision:0,requestId:'denied'},'set')).rejects.toMatchObject({code:'FORBIDDEN'});
 await g.mutate({userId:owner.user!.id},{scope:'session',sessionId:s.id,text:'This session only',expectedRevision:0,requestId:'session'},'set');
 expect((await g.exposure(p,{sessionId:s.id}))?.levels.map(x=>x.scope)).toEqual(['session']);
});
