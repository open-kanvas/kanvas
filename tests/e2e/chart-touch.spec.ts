import { operationRequest } from '../mcp/requests.js';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo,Browser} from '@playwright/test';
import type {ViewSpec,DisplayRecord} from '../../src/shared/types';
import {samples} from '../../src/shared/template-examples';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionApi,sessionDetail,tab} from './support';

async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September improvements'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`},client=info.project.name.startsWith('phone')?new LegacyClient({name:'september-legacy',version:'1'}):new Client({name:'september-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async(name:string,operation:string,args:Record<string,unknown>={})=>{const r=await client.callTool(operationRequest({name,arguments:{operation,...args}}));expect(r.isError,`${name}/${operation}: ${JSON.stringify(r.isError?r.content:[])}`).not.toBe(true);expect((r.structuredContent as any).truncated).not.toBe(true);return(r.structuredContent as any).data;};
  const current=async()=>{const r=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;return r;};
  const painted=async(revision:number)=>{await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(revision));await expect(v.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');};
  const show=async(view:ViewSpec)=>{const before=await current();await publishPrepared(page,s,[d.id],view);const next=await waitForDisplay(page,s,d.id,x=>x.revision>before.revision&&x.appliedRevision===x.revision);await painted(next.revision);return next;};
  const nav=async(navigation:unknown)=>call('kanvas_control','navigation.control',{sessionId:s,displayId:d.id,expectedRevision:(await current()).revision,requestId:randomUUID(),navigation});
  return{s,d,v,client,call,current,painted,show,nav};
}

test.use({hasTouch:true});
test('line and bar marks accept actual touch, expose browser eligibility, and keep agent writes forbidden',async({page,baseURL},info)=>{
  const a=await setup(page,info,baseURL!);
  try{
    await a.call('kanvas_access','pointing.configure',{sessionId:a.s,enabled:true,expectedRevision:0,confirm:true});
    for(const kind of ['line','bar']){
      await a.show({...samples.chart,data:{...samples.chart.data,kind}});
      const eligibility=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});
      expect(eligibility).toMatchObject({enabled:true,canPoint:false,canPointScope:'calling-principal',eligibilityReason:'agent-read-only'});
      const browser=await sessionApi<any>(a.v,`/api/sessions/${a.s}/displays/${a.d.id}/pointing`,'GET');
      expect(browser.data).toMatchObject({canPoint:true,eligibilityReason:'eligible'});
      await a.v.getByRole('button',{name:'Point together'}).tap();
      const mark=a.v.locator('[data-chart-series="This year"][data-chart-x="Mar"][data-chart-y="45"]').first(),r=await mark.boundingBox();expect(r).not.toBeNull();
      await a.v.touchscreen.tap(r!.x+r!.width/2+(kind==='line'?12:0),r!.y+r!.height/2);
      await expect(a.v.locator('[data-pointer-kind="chart"] .semantic-pointer-mark')).toBeVisible();
      const state=await a.call('kanvas_inspect','pointing.read',{sessionId:a.s,displayId:a.d.id});
      expect(state.pointers[0].anchor).toEqual({kind:'chart',series:'This year',x:'Mar',y:'45'});
      await a.v.getByRole('button',{name:'Stop pointing'}).tap();await expect(a.v.locator('.viewer-shell')).not.toHaveClass(/semantic-pointing-active/);
    }
  }finally{await a.client.close();}
});
