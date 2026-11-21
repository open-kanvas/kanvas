import { operationRequest } from './requests.js';
import { asyncMap } from '../../src/server/async-collections.js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {afterEach,describe,expect,it} from 'vitest';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {startHarness,success,ORIGIN,type Harness} from '../core/harness.js';
import {WORK_MAPPING,DEVICE_MAPPING} from './operation-fixtures.js';
import type {Response} from 'express';

describe('workflows over both MCP protocols',()=>{
  let h!:Harness;afterEach(async()=>{await h?.close();});
  async function connect(legacy:boolean,path='/mcp',headers:Record<string,string>={}){
    const c=legacy?new LegacyClient({name:'workflows',version:'1'}):new Client({name:'workflows',version:'1'}),url=new URL(path,h.baseUrl);
    if(c instanceof Client)await c.connect(new StreamableHTTPClientTransport(url,{requestInit:{headers}}));else await c.connect(new LegacyTransport(url,{requestInit:{headers}}));return c;
  }
  it.each([false,true])('exports portable bytes, patches own reports and begins without guessing a receiver (legacy=%s)',async legacy=>{
    h=await startHarness({mcpProfile:'twelve'});const owner=await h.account(),other=await h.account(),session=await owner.session();
    const issued=await h.runtime.auth.issueToken(owner.user!.id,'Feedback protocol fixture',['read','publish']);
    const foreign=await h.runtime.auth.issueToken(other.user!.id,'Other account fixture',['read','publish']);
    const read=await h.runtime.auth.issueToken(owner.user!.id,'Read export fixture',['read']);
    const c=await connect(legacy,'/mcp',{Authorization:`Bearer ${issued.value}`}),stranger=await connect(legacy,'/mcp',{Authorization:`Bearer ${foreign.value}`}),reader=await connect(legacy,'/mcp',{Authorization:`Bearer ${read.value}`});
    const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await c.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,JSON.stringify(r.structuredContent)).not.toBe(true);return (r.structuredContent as any).data;};
    try{
      const report=await call('kanvas_feedback','submit',{requestId:'wire-report',title:'Synthetic finding',description:'Initial observation'});
      expect(await call('kanvas_feedback','patch',{reportId:report.id,expectedRevision:0,note:'Follow-up observation'})).toMatchObject({revision:1,history:[{note:'Follow-up observation'}]});
      expect((await stranger.callTool(operationRequest({name:'kanvas_feedback',arguments:{operation:'patch',reportId:report.id,expectedRevision:1,note:'Foreign'}}))).isError).toBe(true);
      const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=';
      const asset=await call('kanvas_import','asset.import',{sessionId:session.id,name:'wire.png',mimeType:'image/png',base64:pixel});
      expect(await call('kanvas_import','asset.export',{sessionId:session.id,assetId:asset.id})).toMatchObject({base64:pixel,complete:true});
      const readExport=await reader.callTool(operationRequest({name:'kanvas_import',arguments:{operation:'asset.export',sessionId:session.id,assetId:asset.id}}));expect(readExport.isError).not.toBe(true);expect((readExport.structuredContent as any).data.base64).toBe(pixel);
      expect((await stranger.callTool(operationRequest({name:'kanvas_import',arguments:{operation:'asset.export',sessionId:session.id,assetId:asset.id}}))).isError).toBe(true);
      const before=await h.runtime.service.sessions({userId:owner.user!.id,tokenId:issued.token.id});
      expect(await call('kanvas_control','start.begin',{requestId:'wire-start'})).toMatchObject({status:'needs_display'});
      expect(await h.runtime.service.sessions({userId:owner.user!.id,tokenId:issued.token.id})).toEqual(before);
    }finally{await c.close();await stranger.close();await reader.close();}
  });
  it.each([false,true])('routes every device operation with account ownership, scope and pending-paint semantics (legacy=%s)',async legacy=>{
    h=await startHarness({mcpProfile:'twelve'});const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id);await owner.submit(s.id,[d.id],{version:1,template:'fact',data:{text:'Device source 1.2300'}});
    const session=(await h.runtime.auth.issueBrowser(owner.user!.id,{cookie:()=>{}} as unknown as Response)),receiver={userId:owner.user!.id,browserId:session.id},device=(await h.runtime.service.devices.register(receiver,{installationId:'wire-receiver'},'Browser'));
    const stream=(await h.runtime.service.devices.stream(receiver,device.id,()=>{})),issued=(await h.runtime.auth.issueToken(owner.user!.id,'Device wire test',['read','publish'])),read=(await h.runtime.auth.issueToken(owner.user!.id,'Read device wire test',['read'])),limited=(await h.runtime.auth.issueToken(owner.user!.id,'Selected session',['read','publish'],[s.id]));
    const c=await connect(legacy,'/mcp',{Authorization:`Bearer ${issued.value}`}),reader=await connect(legacy,'/mcp',{Authorization:`Bearer ${read.value}`}),selected=await connect(legacy,'/mcp',{Authorization:`Bearer ${limited.value}`}),seen=new Set<string>();
    const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const result=await c.callTool(operationRequest({name,arguments:{operation,...args}}));expect(result.isError).not.toBe(true);seen.add(`${name}:${operation}`);return(result.structuredContent as any).data;};
    try{
      expect((await call('kanvas_inspect','devices.read')).devices[0]).toMatchObject({id:device.id,connected:true});
      const renamed=await call('kanvas_control','device.rename',{deviceId:device.id,name:'Living room TV',expectedVersion:device.version});expect(renamed.name).toBe('Living room TV');
      const input={deviceId:device.id,sessionId:s.id,displayId:d.id,expectedVersion:renamed.version,requestId:randomUUID()},sent=await call('kanvas_control','device.present',input);expect(sent.device.command.status).toBe('pending');expect((await call('kanvas_control','device.present',input)).commandId).toBe(sent.commandId);
      expect((await call('kanvas_inspect','participants.read',{sessionId:s.id})).participants.filter((v:any)=>v.connected)).toEqual([]);
      expect((await selected.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'devices.read'}}))).isError).toBe(true);
      expect((await reader.callTool(operationRequest({name:'kanvas_control',arguments:{operation:'device.present',...input}}))).isError).toBe(true);
      expect((await reader.callTool(operationRequest({name:'kanvas_control',arguments:{operation:'device.rename',deviceId:device.id,name:'Refused',expectedVersion:sent.device.version}}))).isError).toBe(true);
      expect([...seen].sort()).toEqual(DEVICE_MAPPING.map(([,name,operation])=>`${name}:${operation}`).sort());
    }finally{stream.close();await c.close();await reader.close();await selected.close();}
  });
  it.each([false,true])('executes every account/work-view operation with real typed dispatch and scope enforcement (legacy=%s)',async legacy=>{
    h=await startHarness({mcpProfile:'twelve'});const owner=await h.account(),other=await h.account(),s=await owner.session(),d=await owner.display(s.id);
    const token=(await h.runtime.auth.issueToken(owner.user!.id,'Isolated wire verification',['read','publish'],[s.id]));
    const readToken=(await h.runtime.auth.issueToken(owner.user!.id,'Isolated read scope',['read'],[s.id]));
    const c=await connect(legacy,'/mcp',{Authorization:`Bearer ${token.value}`}),reader=await connect(legacy,'/mcp',{Authorization:`Bearer ${readToken.value}`}),seen=new Set<string>();
    const call=async(tool:string,operation:string,args:Record<string,unknown>)=>{const result=await c.callTool(operationRequest({name:tool,arguments:{operation,...args}}));expect(result.isError,JSON.stringify(result.structuredContent)).not.toBe(true);seen.add(`${tool}:${operation}`);return (result.structuredContent as any).data;};
    try{
      const snapshot=async ()=>(await asyncMap(['session','display','short-address','navigation','diagnostic'], async kind=>[kind,(await h.runtime.store.list(kind))]));const before=(await snapshot());
      const start=await call('kanvas_inspect','start.read',{});expect(start.sessions.map((x:any)=>x.id)).toEqual([s.id]);expect(start.canCreate).toBe(false);expect((await snapshot())).toEqual(before); // HTTP authentication may update its own token's last-used record.
      const config=(await owner.detail(s.id)).session;
      const rename={sessionId:s.id,expectedRevision:config.configRevision,name:'Chosen source session'};
      expect(await call('kanvas_session','rename',rename)).toMatchObject({name:rename.name,configRevision:config.configRevision+1});
      expect((await reader.callTool(operationRequest({name:'kanvas_session',arguments:{operation:'rename',...rename,expectedRevision:config.configRevision+1}}))).isError).toBe(true);
      const foreign=await other.session();expect((await c.callTool(operationRequest({name:'kanvas_session',arguments:{operation:'rename',...rename,sessionId:foreign.id}}))).isError).toBe(true);
      const original={id:'source-1',sender:'Exact author',text:'  Exact 1.2300\nSecond line.'};
      await owner.submit(s.id,[d.id],{version:1,template:'chat',data:{messages:[original]}});
      const append={sessionId:s.id,displayId:d.id,expectedRevision:1,requestId:randomUUID(),messages:[{id:'source-2',sender:'Other author',text:'9007199254740993.001'}]};
      const update=await call('kanvas_publish','chat.append',append);expect((await call('kanvas_publish','chat.append',append)).id).toBe(update.id);
      const select={sessionId:s.id,displayId:d.id,expectedRevision:2,requestId:randomUUID(),selection:{where:[{field:'sender',op:'eq',value:'Other author'}],highlight:[{field:'id',op:'eq',value:'source-2'}]}};
      const selected=await call('kanvas_control','selection.set',select);expect((await call('kanvas_control','selection.set',select)).id).toBe(selected.id);
      const current=(await owner.detail(s.id)).displays[0];expect(current.view!.data.messages).toEqual([original,append.messages[0]]);expect(current.view!.selection?.where?.[0].value).toBe('Other author');
      expect((await c.callTool(operationRequest({name:'kanvas_publish',arguments:{operation:'selection.set',...select}}))).isError).toBe(true);
      for(const [tool,operation,args]of [['kanvas_publish','chat.append',append],['kanvas_control','selection.set',select]] as const)expect((await reader.callTool(operationRequest({name:tool,arguments:{operation,...args,expectedRevision:current.revision,requestId:randomUUID()}}))).isError).toBe(true);
      expect([...seen].sort()).toEqual(WORK_MAPPING.map(([,tool,op])=>`${tool}:${op}`).sort());
    }finally{await c.close();await reader.close();}
  });
  it.each([false,true])('retains all document paragraphs/headings at native and one-layer encoded boundaries (legacy=%s)',async legacy=>{
    h=await startHarness({mcpProfile:'twelve'});const b=await h.account(),s=await b.session(),d=await b.display(s.id);
    const issued=success(await b.request<{token:string}>('POST','/api/tokens',{name:'Disposable test client',scopes:['read','publish']})),c=await connect(legacy,'/mcp',{Authorization:`Bearer ${issued.token}`});
    try{
      for(const length of [1000,1800,8000])for(const headings of [undefined,[],[{start:0,end:8,level:2}]])for(const encoded of [false,true]){
        const text=Array.from({length:4},(_,i)=>`${i+1}: ${'Exact words 1.2300. '.repeat(Math.ceil(length/80))}`).join('\n\n');
        const view={version:1,template:'document',data:{text,...(headings?{headings}:{})}};
        const requestId=randomUUID();const result=await c.callTool(operationRequest({name:'kanvas_publish',arguments:{operation:'show',sessionId:s.id,displayIds:[d.id],requestId,view:encoded?JSON.stringify(view):view}}));
        expect(Boolean(result.isError),`document ${length} ${encoded}`).toBe(false);await b.settle(s.id,requestId);const stored=(await b.detail(s.id)).displays[0];expect(stored.view!.data.text).toBe(text);expect(stored.view!.data.headings??[]).toEqual(headings??[]);
      }
      const malformed=await c.callTool(operationRequest({name:'kanvas_publish',arguments:{operation:'show',sessionId:s.id,displayIds:[d.id],requestId:randomUUID(),view:'{"version":1,"template":"document","data":{"text":"first\nsecond"}}'}}));
      expect(malformed.isError).toBe(true);expect(JSON.stringify(malformed)).toContain('escaped');
    }finally{await c.close();}
  });
  it.each([false,true])('uses normal OAuth email verification without a redundant signup tool and binds explicit consent to standard PKCE (legacy=%s)',async legacy=>{
    const mail:{email:string;link:string}[]=[];h=await startHarness({mcpProfile:'twelve',signinMailer:async(email,link)=>{mail.push({email,link});}});
    const b=h.browser(),redirect='https://example.com/callback',verifier=randomBytes(32).toString('base64url');
    const reg=await b.raw('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Explicit test connector',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']})});expect(reg.status).toBe(201);const registered=await reg.json();
    const query=new URLSearchParams({response_type:'code',client_id:registered.client_id,redirect_uri:redirect,scope:'read publish',resource:`${ORIGIN}/mcp`,state:randomUUID(),code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    const auth=await b.raw(`/oauth/authorize?${query}`),requestId=new URL(auth.headers.get('location')!,ORIGIN).searchParams.get('authorize')!;
    expect((await b.raw('/mcp/signup',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(410);
    {
      const result=success(await b.request<any>('POST','/api/auth/email/request',{email:`verification-${randomUUID()}@example.com`,authorizationRequestId:requestId,acceptedLegalVersion:'2026-10-14'}));expect(mail).toHaveLength(1);
      expect(result.authenticated).toBe(false);expect(JSON.stringify(result).includes('#email-signin=')).toBe(false);
      expect(Number(((await h.runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get()) as {n:number}).n)).toBe(0);expect((await h.runtime.store.list('oauth-grant'))).toHaveLength(0);
      const main=await b.raw('/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});expect(main.status).toBe(401);await main.body?.cancel();
      const token=new URL(mail[0].link).hash.slice('#email-signin='.length),inspect=success(await b.request<any>('POST','/api/auth/email/inspect',{token}));expect(inspect.connection).toMatchObject({requestId,clientName:'Explicit test connector',scopes:['read','publish']});
      success(await b.request<any>('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'}));const login=success(await b.request<any>('POST','/api/auth/email/complete',{}));b.csrf=login.csrfToken;expect((await h.runtime.store.list('oauth-grant'))).toHaveLength(0);
      const consent=success(await b.request<any>('POST','/api/oauth/approve',{requestId,approve:true,accessMode:'account'})),code=new URL(consent.redirectUri).searchParams.get('code')!;
      const exchange=await b.raw('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:registered.client_id,redirect_uri:redirect,resource:`${ORIGIN}/mcp`,code,code_verifier:verifier}).toString()});expect(exchange.status).toBe(200);const credential=await exchange.json();expect(Boolean(credential.access_token)).toBe(true);
      const connected=await connect(legacy,'/mcp',{Authorization:`Bearer ${credential.access_token}`});try{const start=await connected.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'start.read'}}));expect(Boolean(start.isError)).toBe(false);expect((start.structuredContent as any).data.sessions).toEqual([]);}finally{await connected.close();}
      const reused=await b.request('POST','/api/auth/email/consume',{token,confirm:true,acceptedLegalVersion:'2026-10-14'});expect(reused.status).toBe(410);
    }
  });
});
