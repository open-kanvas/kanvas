import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startHarness,success,type Harness,type Browser} from './harness';
import {hash,type AuthPrincipal,type BrowserSession} from '../../src/server/auth';
import {browserRevokeSchema} from '../../src/server/browser-auth';
import {inviteSendSchema} from '../../src/server/invite-email';
describe('Explicit remote browser logout and native invitation email',()=>{
 let h:Harness,owner:Browser,p:AuthPrincipal;
 const send=vi.fn(async()=>{});
 beforeEach(async()=>{send.mockReset();h=await startHarness({inviteMailer:send});owner=await h.account();p={userId:owner.user!.id};});
 afterEach(async()=>{await vi.waitFor(async()=>expect((await h.runtime.store.list<{status:string}>('invite-email-dispatch')).filter(r=>r.status==='queued'||r.status==='sending')).toHaveLength(0));await h.close();});
 const browserId=()=>hash(owner.cookies.get('kanvas')!);
 const invite=()=>h.runtime.service.invitations.create(p,{requestId:'create-invite'});
 const dispatch=async(invitationId:string,requestId='send-1',email='recipient@example.com')=>h.runtime.service.inviteEmail.send(p,{invitationId,requestId,email,confirm:true});
 it('lists management IDs without cookie hashes/CSRF and excludes other accounts and scoped pairings',async()=>{
  await h.account();const b=await h.runtime.store.get<BrowserSession>('browser',browserId());
  await h.runtime.store.put('browser',{...b!,id:'paired',scopedSessionId:'session',pairingId:'pair'});
  const result=await h.runtime.service.browserAuth.list({...p,browserId:browserId()},{});
  expect(result.browsers).toHaveLength(1);expect(result.browsers[0]).toMatchObject({current:true});
  expect(JSON.stringify(result)).not.toContain(browserId());expect(JSON.stringify(result)).not.toContain(b!.csrf);
 });
 it('revokes one browser durably with exact retry and push cleanup, without touching another account/OAuth',async()=>{
  const other=await h.account(),token=await h.runtime.auth.issueToken(p.userId!,'independent');
  const {browsers}=await h.runtime.service.browserAuth.list(p,{});
  await h.runtime.store.put('push-subscription',{id:'push-test',browserId:browserId()});
  const a={browserSessionId:browsers[0].id,confirm:true,requestId:'logout'};
  expect(await h.runtime.service.browserAuth.revoke(p,a)).toEqual({revoked:true,count:1});
  expect(await h.runtime.service.browserAuth.revoke(p,a)).toEqual({revoked:true,count:1});
  expect((await owner.request('GET','/api/auth/me')).status).toBe(401);
  expect((await other.request('GET','/api/auth/me')).status).toBe(200);
  expect(await h.runtime.store.get('push-subscription','push-test')).toBeUndefined();
  await expect(h.runtime.auth.assertCurrent({userId:p.userId,tokenId:token.token.id},'publish')).resolves.toBeUndefined();
  await expect(h.runtime.service.browserAuth.revoke(p,{...a,all:true,browserSessionId:undefined})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
 });
 it('rolls back the full browser logout and receipt without emitting a revocation event',async()=>{
  const listener=vi.fn(),unsubscribe=h.runtime.auth.onBrowserRevoked(browserId(),listener);
  try{
   await expect(h.runtime.store.transaction(async()=>{await h.runtime.service.browserAuth.revoke(p,{all:true,confirm:true,requestId:'rollback-logout'});throw new Error('abort logout');})).rejects.toThrow('abort logout');
   expect(await h.runtime.store.get('browser',browserId())).toBeDefined();
   expect(await h.runtime.store.list('browser-revoke-receipt')).toHaveLength(0);expect(listener).not.toHaveBeenCalled();
   expect((await owner.request('GET','/api/auth/me')).status).toBe(200);
  }finally{unsubscribe();}
 });
 it('all:true uses an exact snapshot and retry does not log out newly created browsers',async()=>{
  const initial=await h.runtime.store.get<BrowserSession>('browser',browserId());
  await h.runtime.store.put('browser',{...initial!,id:'second'});
  await h.runtime.store.put('browser',{...initial!,id:'pair',scopedSessionId:'s'});
  const args={all:true,confirm:true,requestId:'all'};
  expect(await h.runtime.service.browserAuth.revoke(p,args)).toEqual({revoked:true,count:2});
  await h.runtime.store.put('browser',{...initial!,id:'later'});
  expect(await h.runtime.service.browserAuth.revoke(p,args)).toEqual({revoked:true,count:2});
  expect(await h.runtime.store.get('browser','later')).toBeDefined();expect(await h.runtime.store.get('browser','pair')).toBeDefined();
 });
 it('denies read-only/selected-session tokens, paired principals and foreign management IDs',async()=>{
  for(const token of [await h.runtime.auth.issueToken(p.userId!,'read',['read']),await h.runtime.auth.issueToken(p.userId!,'selected',['read','publish'],['s'])]){
   await expect(h.runtime.service.browserAuth.list({userId:p.userId,tokenId:token.token.id},{})).rejects.toMatchObject({code:'FORBIDDEN'});
  }
  await expect(h.runtime.service.browserAuth.list({...p,captureOnly:true},{})).rejects.toMatchObject({code:'FORBIDDEN'});
  const other=await h.account(),b=(await h.runtime.service.browserAuth.list({userId:other.user!.id},{})).browsers[0];
  await expect(h.runtime.service.browserAuth.revoke(p,{browserSessionId:b.id,confirm:true,requestId:'foreign'})).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('closes an attached session event stream promptly on committed remote revocation',async()=>{
  const s=await owner.session(),response=await owner.raw(`/api/sessions/${s.id}/events`,{}, {signal:AbortSignal.timeout(3000)}),reader=response.body!.getReader();
  await reader.read();const next=reader.read();
  await h.runtime.service.browserAuth.revoke(p,{all:true,confirm:true,requestId:'stream-logout'});
  expect((await next).done).toBe(true);
  await expect(h.runtime.auth.assertCurrent({...p,browserId:browserId()})).rejects.toMatchObject({code:'SESSION_REVOKED'});
 });
 it('never sends from create and explicitly queues one normalized recipient with exact concurrent retries',async()=>{
  const i=await invite();expect(send).not.toHaveBeenCalled();
  const results=await Promise.all([dispatch(i.id),dispatch(i.id)]);expect(results[0].requestAccepted).toBe(true);
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
  await vi.waitFor(async()=>expect((await dispatch(i.id)).status).toBe('sent'));
  const args=send.mock.calls[0] as unknown as [string,{subject:string;text:string},string];expect(args[0]).toBe('recipient@example.com');expect(args[1].text).toContain(i.url);
  expect(JSON.stringify(await h.runtime.store.list('invite-email-dispatch'))).not.toContain('recipient@example.com');
  await expect(dispatch(i.id,'send-1','different@example.com')).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
 });
 it('validates explicit confirmation/exact target and recipient; disabled delivery keeps link flows',async()=>{
  expect(inviteSendSchema.safeParse({invitationId:'i',shareId:'s',requestId:'r',email:'a@example.com',confirm:true}).success).toBe(false);
  expect(inviteSendSchema.safeParse({invitationId:'i',requestId:'r',email:'a@example.com\r\nBcc:x@example.com',confirm:true}).success).toBe(false);
  expect(inviteSendSchema.safeParse({invitationId:'i',requestId:'r',email:'a@example.com'}).success).toBe(false);
  expect(browserRevokeSchema.safeParse({all:true,browserSessionId:'b',confirm:true,requestId:'r'}).success).toBe(false);
  h.runtime.service.inviteEmail.mailer=undefined;const i=await invite();
  await expect(dispatch(i.id)).rejects.toMatchObject({code:'INVITE_EMAIL_UNAVAILABLE'});expect(send).not.toHaveBeenCalled();
 });
 it('blocks foreign, revoked and expired onboarding invitations without sends',async()=>{
  const i=await invite(),other=await h.account();
  await expect(h.runtime.service.inviteEmail.send({userId:other.user!.id},{invitationId:i.id,requestId:'x',email:'recipient@example.com',confirm:true})).rejects.toMatchObject({code:'NOT_FOUND'});
  await h.runtime.service.invitations.revoke(p,{invitationId:i.id});await expect(dispatch(i.id)).rejects.toMatchObject({code:'INVITATION_REVOKED'});
  const expired=await h.runtime.service.invitations.create(p,{requestId:'expired'}),row=await h.runtime.store.get<any>('invitation',expired.id);row.expiresAt=new Date(0).toISOString();await h.runtime.store.put('invitation',row);
  await expect(dispatch(expired.id,'expired')).rejects.toMatchObject({code:'INVITATION_EXPIRED'});expect(send).not.toHaveBeenCalled();
 });
 it('sends session share invitations only for the current owner and denies closed links',async()=>{
  const s=await owner.session(),d=await owner.display(s.id);
  const share=success(await owner.request<any>('POST',`/api/sessions/${s.id}/shares`,{displayId:d.id}));
  const args={shareId:share.id,requestId:'share-send',email:'guest@example.com',confirm:true};
  const other=await h.account();await expect(h.runtime.service.inviteEmail.send({userId:other.user!.id},args)).rejects.toThrow();
  await h.runtime.service.inviteEmail.send(p,args);await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
  expect((send.mock.calls[0] as unknown as [string,{text:string}])[1].text).toContain(`/join/${share.id}`);
  success(await owner.request('DELETE',`/api/shares/${share.id}`));
  await expect(h.runtime.service.inviteEmail.send(p,{...args,requestId:'revoked'})).rejects.toMatchObject({code:'SHARE_CLOSED'});
 });
 it('durably records uncertain/failed attempts without automatic resend or provider detail leakage',async()=>{
  send.mockRejectedValue(new Error('private provider detail'));const i=await invite();await dispatch(i.id);
  await vi.waitFor(async()=>expect((await dispatch(i.id)).status).toBe('failed'));
  expect(send).toHaveBeenCalledTimes(1);expect(JSON.stringify(await dispatch(i.id))).not.toContain('private provider detail');
 });
 it('checks group administrator authority and transaction rollback before any outbound attempt',async()=>{
  const group=success(await owner.request<any>('POST','/api/groups',{kind:'team',name:'Invitation team',requestId:'team'}));
  const i=await h.runtime.service.invitations.create(p,{requestId:'group-invite',groupId:group.id});
  await expect(h.runtime.store.transaction(async()=>{await dispatch(i.id,'rolled-back');throw new Error('abort');})).rejects.toThrow('abort');
  expect(await h.runtime.store.list('invite-email-dispatch')).toHaveLength(0);expect(send).not.toHaveBeenCalled();
  const key=hash(`${group.id}:${p.userId}`),member=await h.runtime.store.get<any>('group-member',key);await h.runtime.store.put('group-member',{...member,role:'member'});
  await expect(dispatch(i.id,'no-longer-admin')).rejects.toThrow();expect(send).not.toHaveBeenCalled();
 });
 it('exposes validated native MCP schemas and executes email/logout through the two-tool surface',async()=>{
  const token=await h.runtime.auth.issueToken(p.userId!,'MCP invitation test'),client=new Client({name:'auth-invites-test',version:'1'});
  try{
   await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${token.value}`}}}));
   expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['kanvas_call','kanvas_discover']);
   for(const id of ['kanvas.browser.auth.list','kanvas.browser.auth.revoke','kanvas.invite.send']){
    const result=await client.callTool({name:'kanvas_discover',arguments:{catalog:'operations',action:'get',id}});expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain(id);
   }
   const call=async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);return (result.structuredContent as {data:any}).data;};
   const i=await call('kanvas.invite.create',{requestId:'mcp-invite'});
   await call('kanvas.invite.send',{invitationId:i.id,email:'mcp@example.com',confirm:true,requestId:'mcp-send'});
   await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
   const b=await call('kanvas.browser.auth.list',{});expect(b.browsers).toHaveLength(1);
   await call('kanvas.browser.auth.revoke',{browserSessionId:b.browsers[0].id,confirm:true,requestId:'mcp-revoke'});
   expect((await owner.request('GET','/api/auth/me')).status).toBe(401);
   expect((await call('kanvas.browser.auth.list',{})).browsers).toHaveLength(0);
  }finally{await client.close();}
 });
 it('limits recipient globally and sender hourly without counting exact retries twice',async()=>{
  const i=await invite();for(let n=0;n<3;n++)await dispatch(i.id,`recipient-${n}`);
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(3));
  await expect(dispatch(i.id,'fourth')).rejects.toMatchObject({code:'RATE_LIMIT'});
  for(let n=0;n<7;n++)await dispatch(i.id,`other-${n}`,`other-${n}@example.com`);
  await expect(dispatch(i.id,'eleventh','last@example.com')).rejects.toMatchObject({code:'RATE_LIMIT'});
  await vi.waitFor(()=>expect(send).toHaveBeenCalledTimes(10));
 });
});
