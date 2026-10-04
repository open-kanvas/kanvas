import { DISCOVERY_TOOL_NAMES } from '../../src/server/mcp/operations.js';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPORT_CREATE_BYTES, REPORT_DESCRIPTION_MAX, type ReportPage, type ReportRecord } from '../../src/shared/reports.js';
import { TEMPLATE_IDS, type SessionRecord, type DisplayRecord, type UpdateRecord } from '../../src/shared/types.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { MCP_TOOLS } from '../../src/server/mcp/catalog.js';
import { fact, startHarness, success, type Harness, type Browser } from './harness.js';

interface Result { isError?:boolean; structuredContent?:{ data?:unknown; truncated?:boolean; orientation?:Record<string,unknown>; error?:{code:string;message:string;schemaTool?:string;topic?:string;issues?:{path:string;maximum?:number;actual?:number;unit?:string}[]} } }
function value<T>(r:Result):T {expect(r.isError).not.toBe(true);expect(r.structuredContent?.truncated).not.toBe(true);return r.structuredContent!.data as T;}
function invalid(r:Result) {expect(r.isError).toBe(true);expect(r.structuredContent?.error?.code).toBe('INVALID_ARGUMENT');return r.structuredContent!.error!;}

describe.each(['modern','legacy'] as const)('%s September 13 feedback and agent orientation',protocol=>{
  let h:Harness;
  const clients:(Client|LegacyClient)[]=[];
  beforeEach(async()=>{h=await startHarness();});
  afterEach(async()=>{await Promise.all(clients.splice(0).map(x=>x.close().catch(()=>{})));await h?.close();});
  async function connect(owner:Browser, sessions:string[]) {
    const credential=(await h.runtime.auth.issueToken(owner.user!.id,'Disposable September 13 acceptance',['read','publish'],sessions));
    const requestInit={headers:{Authorization:`Bearer ${credential.value}`}};
    const client=protocol==='modern'?new Client({name:'guide-acceptance',version:'1'},{versionNegotiation:{mode:'auto'}}):new LegacyClient({name:'guide-acceptance',version:'1'});
    clients.push(client);
    if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',h.baseUrl),{requestInit}));
    else await client.connect(new LegacyTransport(new URL('/mcp',h.baseUrl),{requestInit}));
    return {client,call:async(name:string,args:Record<string,unknown>={}):Promise<Result>=>await client.callTool({name,arguments:args}) as Result};
  }

  it('seeds orientation before a naive caller searches for a guide, without rewriting operation data',async()=>{
    const owner=await h.account(),session=await owner.session(),p=await connect(owner,[session.id]);
    const index=await p.client.listTools();
    expect(index.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    const lookup=async(query:string)=>(await p.client.callTool({name:'kanvas_tool_search',arguments:{query}})).structuredContent as any;
    const submit=(await lookup('kanvas.submit')).data.results[0],viewer=(await lookup('kanvas.viewers.read')).data.results[0];
    expect(JSON.stringify(submit)).toMatch(/current displays and revisions/);
    expect(JSON.stringify(submit)).toContain('kanvas_tool_use');
    expect(viewer.description?.slice(0,500)).toMatch(/location.*weather|weather.*location/i);
    expect(p.client.getServerVersion()?.description).toMatch(/weather|near-me/);
    expect(p.client.getInstructions()).toContain('glanceable');
    expect(p.client.getInstructions()).toContain('kanvas.session.state');
    expect(p.client.getInstructions()).toContain('never bypasses host approvals');
    const result=await p.call('kanvas_sessions_list');
    expect(value<SessionRecord[]>(result).map(x=>x.id)).toEqual([session.id]);
    expect(result.structuredContent?.orientation?.guide).toEqual({tool:'kanvas_guide',topic:'getting-started'});
    const display=value<DisplayRecord>(await p.call('kanvas_display_register',{sessionId:session.id,name:'Screen',width:1280,height:800}));
    const accepted=await p.call('kanvas_submit',{sessionId:session.id,displayIds:[display.id],requestId:'quiet-publish',view:fact('One useful visual')});
    expect(value<UpdateRecord>(accepted).status).toBe('accepted');
    expect(accepted.structuredContent?.orientation).toBeDefined();
    expect((await owner.settle(session.id,'quiet-publish')).detail.displays[0].view?.data.text).toBe('One useful visual');
  });

  it('makes focused guidance read-only and keeps dynamic modes/policy in current state',async()=>{
    const owner=await h.account(),session=await owner.session(),p=await connect(owner,[session.id]);
    const original=(await owner.detail(session.id)).session;
    for(const topic of GUIDE_TOPICS){
      const r=await p.call('kanvas_guide',{topic}),g=value<{topic:string;catalogue?:{template:string}[];limits?:{descriptionCharacters:number}}>(r);
      expect(g.topic).toBe(topic);
      expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(64*1024);
      if(topic==='templates')expect(g.catalogue?.map(x=>x.template).sort()).toEqual([...TEMPLATE_IDS].sort());
      if(topic==='feedback')expect(g.limits?.descriptionCharacters).toBe(12000);
    }
    expect(value<{topic:string}>(await p.call('kanvas_guide')).topic).toBe('getting-started');
    expect((await owner.detail(session.id)).session).toEqual(original);
    const previous=await p.call('kanvas_session_state',{sessionId:session.id});
    const next=value<SessionRecord>(await p.call('kanvas_config_update',{sessionId:session.id,expectedRevision:original.configRevision,config:{theme:'light'}}));
    expect(next.config.theme).toBe('light');
    const updated=await p.call('kanvas_session_state',{sessionId:session.id});
    expect(value<{session:SessionRecord}>(updated).session.config).toMatchObject({theme:'light'});
    expect(updated.structuredContent?.orientation).toEqual(previous.structuredContent?.orientation);
    expect(JSON.stringify(updated.structuredContent?.orientation)).not.toContain('"config"');
    expect(value<{note:string}>(await p.call('kanvas_guide',{topic:'templates'})).note).toContain('static');
  });

  it('retains long Unicode reports, replay identity, paginated full text and review notes',async()=>{
    const owner=await h.account(),session=await owner.session(),p=await connect(owner,[session.id]);
    const reports:ReportRecord[]=[];
    for(let i=0;i<3;i++){
      const description=`Case ${i}\n`+'漢'.repeat(REPORT_DESCRIPTION_MAX-8);
      const input={sessionId:session.id,requestId:`long-${i}`,title:`Detailed finding ${i}`,description};
      const r=value<ReportRecord>(await p.call('kanvas_feedback_submit',input));
      expect(r.description).toBe(description);reports.push(r);
      expect(value<ReportRecord>(await p.call('kanvas_feedback_submit',input)).id).toBe(r.id);
    }
    let afterId:string|undefined;const read:ReportRecord[]=[];
    do{const r=await p.call('kanvas_reports_read',{sessionId:session.id,limit:20,...(afterId?{afterId}:{})});const page=value<ReportPage>(r);expect(Buffer.byteLength(JSON.stringify(r.structuredContent))).toBeLessThan(64*1024);read.push(...page.reports);afterId=page.nextCursor;}while(afterId);
    expect(read.map(x=>x.id).sort()).toEqual(reports.map(x=>x.id).sort());
    for(const r of read)expect(r.description).toBe(reports.find(x=>x.id===r.id)!.description);
    let current=reports[0];
    for(let i=0;i<8;i++)current=value<ReportRecord>(await p.call('kanvas_report_update',{sessionId:session.id,reportId:current.id,expectedRevision:current.revision,status:'investigating',note:`Review ${i}: `+'漢'.repeat(1900)}));
    expect(current.description).toBe(reports[0].description);
    expect(current.history.at(-1)?.note).toContain('Review 7:');
    expect(Buffer.byteLength(JSON.stringify(current))).toBeLessThanOrEqual(60*1024);
  });

  it('puts over-limit field, maximum and actual length in the error headline without reflecting input',async()=>{
    const owner=await h.account(),session=await owner.session(),p=await connect(owner,[session.id]);
    const marker=randomUUID(),description=marker+'x'.repeat(12001-marker.length);
    const e=invalid(await p.call('kanvas_error_report',{sessionId:session.id,requestId:'large',title:'Oversized',description}));
    expect(e.message).toContain('description');expect(e.message).toContain('12000');expect(e.message).toContain('12001');
    expect(e).toMatchObject({schemaTool:'kanvas_guide',topic:'feedback',issues:[{path:'description',maximum:12000,actual:12001,unit:'characters'}]});
    expect(JSON.stringify(e)).not.toContain(marker);
    const repaired=value<ReportRecord>(await p.call('kanvas_error_report',{sessionId:session.id,requestId:'large',title:'Oversized',description:'x'.repeat(12000)}));
    expect(repaired.description.length).toBe(12000);
    const byteError=invalid(await p.call('kanvas_feedback_submit',{sessionId:session.id,requestId:'bytes',title:'Control characters',description:'prefix'+'\u0001'.repeat(11000)}));
    expect(byteError.message).toContain('UTF-8');expect(byteError.message).toContain(String(REPORT_CREATE_BYTES));
    expect(byteError.issues?.[0].unit).toBe('bytes');expect(byteError.issues?.[0].actual).toBeGreaterThan(REPORT_CREATE_BYTES);
    expect(value<ReportPage>(await p.call('kanvas_reports_read',{sessionId:session.id})).reports).toHaveLength(1);
  });

  it('exposes the same richer limits and precise validation through the workspace HTTP API',async()=>{
    const owner=await h.account(),session=await owner.session();
    const r=await owner.request('POST',`/api/sessions/${session.id}/feedback`,{requestId:'http-over',title:'Description limit',description:'x'.repeat(12001)});
    expect(r.status).toBe(400);expect(r.error?.message).toMatch(/description.*12000.*12001/);
    const saved=success(await owner.request<ReportRecord>('POST',`/api/sessions/${session.id}/feedback`,{requestId:'http-over',title:'Description limit',description:'x'.repeat(12000)}));
    expect(saved.description.length).toBe(12000);
  });
});
