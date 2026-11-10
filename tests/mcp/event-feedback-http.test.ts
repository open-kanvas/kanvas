import { operationRequest } from './requests.js';
import {randomUUID} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {expect,it} from 'vitest';
import {startHarness,success,fact} from '../core/harness.js';
import {eventViewExamples} from '../../src/shared/event-views.js';

// Cold modern SDK + complete presentation discovery measured 9.324s alone (10.395s in the two-worker suite).
// Local budget only; both protocols and every operation/negative assertion remain exercised.
for(const era of ['modern','legacy'] as const)it(`event workflows and navigation discovery are usable through the ${era} MCP client`,async()=>{
  const h=await startHarness({mcpProfile:'twelve'});let client:Client|LegacyClient|undefined;
  try{
    const owner=await h.account(),s=await owner.session(),d=await owner.display(s.id),issued=(await h.runtime.auth.issueToken(owner.user!.id,'Protocol fixture',['read','publish']));
    const options={requestInit:{headers:{Authorization:'Bearer '+issued.value}}};
    if(era==='modern'){client=new Client({name:'event-feedback',version:'1'},{versionNegotiation:{mode:{pin:'2026-07-28'}}});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),options));}
    else{client=new LegacyClient({name:'event-feedback',version:'1'});await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),options));}
    const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client!.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,JSON.stringify(r.content)).not.toBe(true);expect((r.structuredContent as any).truncated).not.toBe(true);return (r.structuredContent as any).data;};
    const catalog=await client.listTools();expect(catalog.tools).toHaveLength(2);expect(catalog.tools.some(t=>t.name==='kanvas_call')).toBe(true);
    for(const template of ['scoreboard','standings','tool-call-log']){const schema=await call('kanvas_inspect','template.get',{template});expect(JSON.stringify(schema)).toContain(template);}
    await owner.submit(s.id,[d.id],eventViewExamples.scoreboard);
    const score={sessionId:s.id,displayId:d.id,expectedRevision:1,requestId:randomUUID(),sideId:'home',action:'increase'};
    await call('kanvas_control','scoreboard.control',score);await call('kanvas_control','scoreboard.control',score);
    expect(((await h.runtime.service.display({userId:owner.user!.id},s.id,d.id)).view!.data.sides as any[])[0].score).toBe(13);
    await call('kanvas_publish','tool-log.append',{sessionId:s.id,requestId:randomUUID(),events:[{id:'actual-agent-call',integration:'KANVAS',tool:'scoreboard.control',timestamp:new Date().toISOString()}]});
    const log=await call('kanvas_inspect','tool-log.read',{sessionId:s.id});expect(log.events.some((e:any)=>e.id==='actual-agent-call')).toBe(true);expect(log.events.some((e:any)=>e.source==='automatic'&&e.tool==='kanvas_call'&&e.operation==='kanvas.scoreboard.control'&&e.status==='completed')).toBe(true);
    await owner.submit(s.id,[d.id],{version:1,template:'presentation',data:{index:0,slides:[fact('One'),fact('Two')]}});
    let run=await call('kanvas_control','autoplay.control',{sessionId:s.id,displayId:d.id,requestId:randomUUID(),action:'start',expectedRevision:3,intervalSeconds:7.25,loop:true});expect(run.status).toBe('running');
    run=await call('kanvas_inspect','autoplay.read',{sessionId:s.id,displayId:d.id});expect(run.intervalSeconds).toBe(7.25);
    for(const action of ['pause','resume','stop'])run=await call('kanvas_control','autoplay.control',{sessionId:s.id,displayId:d.id,requestId:randomUUID(),action});expect(run.status).toBe('stopped');
    await call('kanvas_access','session.public',{sessionId:s.id,expectedRevision:0,enabled:true,confirm:true});expect(success(await h.browser().request<any>('GET',`/api/public/sessions/${s.id}`)).displays[0].view.data.text).toBe('One');
    await call('kanvas_access','session.public',{sessionId:s.id,expectedRevision:1,enabled:false,confirm:true});expect((await h.browser().request('GET',`/api/public/sessions/${s.id}`)).status).toBe(404);
    const schemas=await call('kanvas_inspect','template.get',{template:'presentation',expand:'full'});expect(schemas.truncated).not.toBe(true);expect(JSON.stringify(schemas)).toContain('scoreboard');
    const report=await call('kanvas_feedback','submit',{requestId:randomUUID(),title:'General service fixture',description:'Not bound to a session'});expect(report.sessionId).toBeUndefined();
    const reports=await call('kanvas_inspect','reports.read',{});expect(reports.reports.some((r:any)=>r.id===report.id)).toBe(true);
    const failed=await client.callTool(operationRequest({name:'kanvas_control',arguments:{operation:'autoplay.control',sessionId:s.id,displayId:d.id,action:'pause',privateMarker:'MUST_NOT_BE_LOGGED'}}));expect(failed.isError).toBe(true);
    const captured=await call('kanvas_inspect','tool-log.read',{sessionId:s.id});expect(captured.events.some((e:any)=>e.source==='automatic'&&e.operation==='kanvas.autoplay.control'&&e.status==='failed')).toBe(true);expect(JSON.stringify(captured)).not.toContain('MUST_NOT_BE_LOGGED');expect(new Set(captured.events.map((e:any)=>e.id)).size).toBe(captured.events.length);
    const accountLog=await call('kanvas_inspect','tool-log.read');expect(accountLog.events.some((e:any)=>e.operation==='kanvas.feedback.submit'&&e.source==='automatic')).toBe(true);expect(accountLog.events.every((e:any)=>e.sessionId===undefined)).toBe(true);
    const settings=await call('kanvas_inspect','pointing.read',{sessionId:s.id});expect(settings.enabled).toBe(false);await call('kanvas_access','pointing.configure',{sessionId:s.id,expectedRevision:settings.revision,enabled:true,confirm:true});expect((await call('kanvas_inspect','pointing.read',{sessionId:s.id})).enabled).toBe(true);
  }finally{await client?.close();await h.close();}
}, 30_000);
