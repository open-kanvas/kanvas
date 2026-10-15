import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { operationRequest } from '../mcp/requests.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hash, type Token } from '../../src/server/auth.js';
import { ORIGIN, startHarness, success, type Harness, type Browser } from './harness.js';
const GRANT='urn:ietf:params:oauth:grant-type:device_code';
const RESOURCE=`${ORIGIN}/mcp`;
interface Device {device_code:string;user_code:string;verification_uri:string;verification_uri_complete:string;expires_in:number;interval:number}
interface State {id:string;requestId:string;clientId:string;expiresAt:number;interval:number;lastPollAt?:number;consumedAt?:string}
async function post(browser:Browser,path:string,body:Record<string,string>) {
  const response=await browser.raw(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
  const text=await response.text();return {status:response.status,headers:response.headers,body:text?JSON.parse(text):{}};
}
describe('RFC8628 durable account-only device authorization',()=>{
  let h:Harness;
  beforeEach(async()=>{h=await startHarness();});
  afterEach(async()=>{await h?.close();});
  async function client(grants=[GRANT,'refresh_token']) {
    const response=await h.browser().raw('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Synthetic device client',grant_types:grants,...(grants.includes('authorization_code')?{redirect_uris:['https://client.example/callback']}:{response_types:[]})})});
    expect(response.status).toBe(201);const body=await response.json();expect(body.client_secret).toBeUndefined();return body.client_id as string;
  }
  async function begin(clientId:string,extra:Record<string,string>={}) {
    const response=await post(h.browser(),'/oauth/device/authorize',{client_id:clientId,...extra});expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');return response.body as Device;
  }
  async function lookup(device:Device) {return success(await h.browser().request<{requestId:string}>('POST','/api/oauth/device/lookup',{user_code:device.user_code})).requestId;}
  function poll(clientId:string,device:Device,extra:Record<string,string>={}) {return post(h.browser(),'/oauth/token',{grant_type:GRANT,client_id:clientId,device_code:device.device_code,...extra});}
  async function approve(owner:Browser,device:Device) {return owner.request('POST','/api/oauth/approve',{requestId:await lookup(device),approve:true,accessMode:'account',matchesCode:true});}
  it.each([[GRANT],[GRANT,'refresh_token'],['authorization_code',GRANT],['authorization_code','refresh_token',GRANT]].map(grants=>({grants})))('registers public device profiles %j',async ({grants})=>{await client(grants);});
  it('advertises implemented grants and enforces client/resource/scope registration boundaries',async()=>{
    const metadata=await (await h.browser().raw('/.well-known/oauth-authorization-server')).json();expect(metadata.device_authorization_endpoint).toBe(`${ORIGIN}/oauth/device/authorize`);expect(metadata.grant_types_supported).toContain(GRANT);
    const id=await client(),codeOnly=await client(['authorization_code']);
    expect((await post(h.browser(),'/oauth/device/authorize',{client_id:'unknown'})).body.error).toBe('invalid_client');
    expect((await post(h.browser(),'/oauth/device/authorize',{client_id:codeOnly})).body.error).toBe('unauthorized_client');
    expect((await post(h.browser(),'/oauth/device/authorize',{client_id:id,resource:'https://other.example/mcp'})).body.error).toBe('invalid_target');
    expect((await post(h.browser(),'/oauth/device/authorize',{client_id:id,scope:'admin'})).body.error).toBe('invalid_scope');
    const device=await begin(id,{scope:'read',resource:RESOURCE});expect(device).toMatchObject({expires_in:600,interval:5,verification_uri:`${ORIGIN}/connect`});expect(device.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);expect(device.verification_uri_complete).not.toContain(device.device_code);
    const records=JSON.stringify(await h.runtime.store.list('oauth-device'));expect(records).not.toContain(device.device_code);expect(records).toContain(hash(device.device_code));
    expect((await poll('unknown',device)).body.error).toBe('invalid_client');
    expect((await poll(await client(),device)).body.error).toBe('invalid_grant');
    expect((await poll(id,device,{scope:'read publish'})).body.error).toBe('invalid_request');
    expect((await poll(id,device,{resource:'https://other.example/mcp'})).body.error).toBe('invalid_target');
  });
  it('persists pending and escalating slow_down without extending expiry',async()=>{
    const id=await client(),device=await begin(id),digest=hash(device.device_code);
    const original=(await h.runtime.store.get<State>('oauth-device',digest))!;
    expect((await poll(id,device)).body.error).toBe('authorization_pending');
    expect((await poll(id,device)).body.error).toBe('slow_down');
    expect((await poll(id,device)).body.error).toBe('slow_down');
    const state=(await h.runtime.store.get<State>('oauth-device',digest))!;expect(state.interval).toBe(15);expect(state.expiresAt).toBe(original.expiresAt);
    state.expiresAt=Date.now()-1;await h.runtime.store.put('oauth-device',state);expect((await poll(id,device)).body.error).toBe('expired_token');
  });
  it('requires full browser, CSRF, explicit account authority and matching code; opening links grants nothing',async()=>{
    const id=await client(),device=await begin(id),requestId=await lookup(device),owner=h.browser();await owner.register();
    expect((await h.browser().request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true})).status).toBe(401);
    expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true},{csrf:null})).status).toBe(403);
    expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true},{origin:'https://attacker.example'})).status).toBe(403);
    for(const body of [{accessMode:'selected',sessionIds:[]},{accessMode:'account'},{accessMode:'account',sessionIds:[],matchesCode:true}]) expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,...body})).status).toBe(400);
    expect((await h.runtime.store.list('token'))).toHaveLength(0);expect((await poll(id,device)).body.error).toBe('authorization_pending');
    const approved=success(await approve(owner,device)) as {redirectUri:string};expect(approved.redirectUri).toBe(`${ORIGIN}/connect?result=approved`);
    expect((await owner.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true})).status).toBe(410);
  });
  it('connects an empty account once atomically and uses existing refresh replay revocation',async()=>{
    const id=await client(),device=await begin(id,{scope:'read'}),owner=h.browser();await owner.register();success(await approve(owner,device));
    const results=await Promise.all([poll(id,device),poll(id,device)]);expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(results.find(r=>r.status!==200)?.body.error).toBe('invalid_grant');
    const tokens=results.find(r=>r.status===200)!.body;expect(tokens.scope).toBe('read');expect(tokens.refresh_token).toEqual(expect.any(String));
    const connections=await h.runtime.store.list<Token>('token');expect(connections).toHaveLength(1);expect(connections[0].userId).toBe(owner.user!.id);expect(connections[0].sessionIds).toBeUndefined();expect(connections[0].resource).toBe(RESOURCE);
    const refresh=await post(h.browser(),'/oauth/token',{grant_type:'refresh_token',client_id:id,refresh_token:tokens.refresh_token});expect(refresh.status).toBe(200);
    const replay=await post(h.browser(),'/oauth/token',{grant_type:'refresh_token',client_id:id,refresh_token:tokens.refresh_token});expect(replay.body.error).toBe('invalid_grant');expect((await h.runtime.store.get<Token>('token',connections[0].id))!.revoked).toBe(true);
  });
  it('denial and expiry cannot be revived by another account or later decision',async()=>{
    const id=await client(),device=await begin(id),owner=h.browser(),other=h.browser();await owner.register();await other.register();const requestId=await lookup(device);
    success(await owner.request('POST','/api/oauth/approve',{requestId,approve:false}));expect((await poll(id,device)).body.error).toBe('access_denied');
    expect((await other.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true})).status).toBe(410);
    const next=await begin(id),nextId=await lookup(next),consent=(await h.runtime.store.get<{id:string;expiresAt:string}>('oauth-consent',nextId))!;consent.expiresAt=new Date(Date.now()-1).toISOString();await h.runtime.store.put('oauth-consent',consent);
    expect((await owner.request('POST','/api/oauth/approve',{requestId:nextId,approve:true,accessMode:'account',matchesCode:true})).status).toBe(410);
    expect((await h.runtime.store.list('token'))).toHaveLength(0);
  });
  it('serializes competing account decisions and never changes the winning account',async()=>{
    const id=await client(),device=await begin(id),first=await h.account(),second=await h.account(),requestId=await lookup(device);
    const results=await Promise.all([first.request('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account',matchesCode:true}),second.request('POST','/api/oauth/approve',{requestId,approve:false})]);
    expect(results.filter(result=>result.status===200)).toHaveLength(1);expect(results.filter(result=>result.status===410)).toHaveLength(1);
    const result=await poll(id,device);
    if(results[0].status===200){expect(result.status).toBe(200);expect((await h.runtime.store.list<Token>('token'))[0].userId).toBe(first.user!.id);}
    else {expect(result.body.error).toBe('access_denied');expect(await h.runtime.store.list('token')).toHaveLength(0);}
  });
  it('enforces read-only and cross-account boundaries through authenticated MCP',async()=>{
    const id=await client(),device=await begin(id,{scope:'read'}),owner=await h.account(),other=await h.account(),privateSession=await other.session();success(await approve(owner,device));
    const token=(await poll(id,device)).body.access_token;
    const sdk=new Client({name:'device-boundary-test',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});
    try {
      await sdk.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
      const own=await sdk.callTool(operationRequest({name:'kanvas_sessions_list',arguments:{}}));expect(own.isError).not.toBe(true);
      const create=await sdk.callTool(operationRequest({name:'kanvas_session_create',arguments:{name:'Forbidden by read scope'}}));expect(create.isError).toBe(true);
      const read=await sdk.callTool(operationRequest({name:'kanvas_session_state',arguments:{sessionId:privateSession.id}}));expect(read.isError).toBe(true);
    } finally {await sdk.close();}
    const unauthorized=await h.browser().raw('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'anonymous',version:'1'}}})});expect(unauthorized.status).toBe(401);await unauthorized.arrayBuffer();
  });
  it('persists approved state and consumes it once after a real PostgreSQL-backed runtime restart',async()=>{
    const id=await client(),device=await begin(id),owner=h.browser();await owner.register();success(await approve(owner,device));
    await h.shutdown();const restarted=await startHarness({database:h.database});
    try {
      const result=await post(restarted.browser(),'/oauth/token',{grant_type:GRANT,client_id:id,device_code:device.device_code});expect(result.status).toBe(200);
      expect((await post(restarted.browser(),'/oauth/token',{grant_type:GRANT,client_id:id,device_code:device.device_code})).body.error).toBe('invalid_grant');
      expect((await restarted.runtime.store.list<Token>('token'))).toHaveLength(1);
    } finally {await restarted.close();}
  });
  it('bounds recognition-code searches, and does not accept malformed codes',async()=>{
    for(let i=0;i<20;i++) expect((await h.browser().request('POST','/api/oauth/device/lookup',{user_code:'AAAA-AAAA-AAAA'})).status).toBe(410);
    expect((await h.browser().request('POST','/api/oauth/device/lookup',{user_code:'AAAA-AAAA-AAAA'})).status).toBe(429);
  });
  it('keeps code-only device credentials nonrenewable and revokes the connection by access token',async()=>{
    const id=await client([GRANT]),device=await begin(id),owner=h.browser();await owner.register();success(await approve(owner,device));const token=(await poll(id,device)).body;expect(token.refresh_token).toBeUndefined();
    expect((await post(h.browser(),'/oauth/revoke',{client_id:id,token:token.access_token})).status).toBe(200);expect((await h.runtime.store.list<Token>('token'))[0].revoked).toBe(true);
  });
});
