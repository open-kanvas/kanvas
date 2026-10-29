import {operationRequest} from './requests.js';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {afterEach,expect,it} from 'vitest';
import {startHarness,success,type Harness} from '../core/harness';
let h:Harness,client:Client|LegacyClient;
afterEach(async()=>{await client?.close();await h?.close();});
for(const era of ['modern','legacy'] as const)for(const profile of ['discovery','twelve','domains'] as const){
 it(`${era} ${profile} configuration routes full-account login through the actual discovery SDK wire and proof claim`,async()=>{
  h=await startHarness({mcpProfile:profile});const owner=await h.account(),screen=h.browser(),token=await h.runtime.auth.issueToken(owner.user!.id,'Login protocol regression',['read','publish']);const headers={Authorization:'Bearer '+token.value};
  if(era==='modern'){client=new Client({name:'login-current',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}else{client=new LegacyClient({name:'login-legacy',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers}}));}
  const call=async(operation:'read'|'decide',args:Record<string,unknown>)=>client.callTool(operationRequest(profile==='discovery'?{name:'kanvas_call',arguments:{operationId:'kanvas.login.'+operation,arguments:args}}:{name:profile==='domains'?'kanvas_screen':operation==='read'?'kanvas_inspect':'kanvas_access',arguments:{operation:'login.'+operation,...args}}));
  const pending=success(await screen.request<any>('POST','/api/login/request',{}));const read=await call('read',{code:pending.phonetic.join(' ')});expect(read.isError).not.toBe(true);const review=(read.structuredContent as any).data;expect(review.context).toHaveProperty('browser');expect(review.permissions[0]).toContain('Full account');
  const rejected=await call('decide',{code:pending.code,approvalToken:review.approvalToken,approve:true,confirm:false});expect(rejected.isError).toBe(true);expect(success(await screen.request<any>('GET','/api/login/status')).status).toBe('pending');
  const approved=await call('decide',{code:pending.code,approvalToken:review.approvalToken,approve:true,confirm:true});expect(approved.isError).not.toBe(true);success(await screen.request('POST','/api/login/claim',{}));const me=success(await screen.request<any>('GET','/api/auth/me'));expect(me.user.id).toBe(owner.user!.id);expect(me.viewOnly).toBeFalsy();expect(me.browserSessionId).toEqual(expect.any(String));expect((await call('decide',{code:pending.code,approvalToken:review.approvalToken,approve:true,confirm:true})).isError).toBe(true);
 },30000);
}
