import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { isolatedContext } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { tab } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import type { Browser } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import { advancedChartExamples } from '../../src/shared/advanced-chart-examples';
import { samples } from '../../src/shared/template-examples';

test.describe("events coverage 1", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const sessionId=await createSession(page,'Afternoon release acceptance'),display=await createDisplay(page,sessionId,'Receiving screen'),viewer=await openViewer(page,sessionId,display.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable release client',scopes:['read','publish']});expect(issued.status).toBe(201);
  const options={requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}},client=info.project.name.startsWith('phone')?new LegacyClient({name:'afternoon-legacy',version:'1'}):new Client({name:'afternoon-modern',version:'1'});
  if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),options));else await client.connect(new LegacyTransport(new URL('/mcp',baseURL),options));
  const call=async<T=any>(tool:string,operation:string,args:Record<string,unknown>={})=>{const result=await client.callTool(operationRequest({name:tool,arguments:{operation,...args}}));expect(result.isError,`${tool} ${operation} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
  const show=async(view:ViewSpec)=>{await publishPrepared(page,sessionId,[display.id],view);return current();};
  const nav=async(navigation:unknown)=>{const d=await current();return call('kanvas_control','navigation.control',{sessionId,displayId:display.id,requestId:randomUUID(),expectedRevision:d.revision,navigation});};
  return {sessionId,display,viewer,client,call,current,show,nav};
}
async function photo(page:Page,info:TestInfo,name:string){const directory=info.outputPath('visuals');await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('progress appends preserve events and proportional spines; log inspection retains exact lines and surrounding context',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    await s.show({version:1,template:'progress',data:{task:'Verify the release',events:[{id:'one',title:'Read exact source',timestamp:'2026-09-16T14:00:00Z',description:'Original decimal 9007199254740993.001'}]}});
    for(const [i,seconds] of [10,40].entries()){const d=await s.current();await s.call('kanvas_publish','progress.append',{sessionId:s.sessionId,displayId:s.display.id,requestId:`append-${i}`,expectedRevision:d.revision,event:{id:`event-${i}`,title:i?'Public browser checked':'Database checked',timestamp:`2026-09-16T14:00:${seconds}Z`,status:'completed'},...(i?{status:'completed'}:{})});await s.current();}
    await expect(s.viewer.locator('.spine-card')).toHaveCount(3);await expect(s.viewer.locator('.spine-line')).toHaveCount(1);
    expect(await s.viewer.locator('[data-time-position]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-time-position'))))).toEqual([0,.25,1]);
    const cards=await s.viewer.locator('.spine-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};}));expect(cards[1].left).toBeGreaterThan(cards[0].right);expect(cards[2].left).toBeGreaterThan(cards[1].right);await photo(s.viewer,info,'progress');
    await s.show({version:1,template:'timeline',data:{orientation:'vertical',events:[{id:'start',title:'Start',start:'2026-09-01'},{id:'span',title:'A real duration',start:'2026-09-02',end:'2026-09-04'},{id:'last',title:'Finish',start:'2026-09-05'}]}});const timeline=s.viewer.getByRole('region',{name:'Timeline',exact:true});
    await expect(timeline.locator('.temporal-ticks')).toHaveCount(1);
    await expect(timeline.locator('.temporal-card')).toHaveCount(3);
    await expect(timeline.locator('.temporal-duration')).toHaveCount(1);
    await expect(timeline.locator('.temporal-point')).toHaveCount(2);
    expect(await timeline.locator('[data-time-position]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-time-position'))))).toEqual([0,.25,1]);
    const geometry=await timeline.locator('[data-event-id="span"] .temporal-lane').evaluate(el=>{
      const lane=el.getBoundingClientRect(),bar=el.querySelector('.temporal-duration')!.getBoundingClientRect(),vertical=innerWidth>650;
      return {offset:vertical?(bar.top-lane.top)/lane.height:(bar.left-lane.left)/lane.width,
        duration:vertical?bar.height/lane.height:bar.width/lane.width,length:vertical?lane.height:lane.width};
    });
    expect(geometry.length).toBeGreaterThan(100);
    expect(geometry.offset).toBeCloseTo(.25,2);
    expect(geometry.duration).toBeCloseTo(.5,2);
    await photo(s.viewer,info,'timeline');
    const raw='  opening line\n\tERROR original 9007199254740993.001\n  after the error\nnext page\n';
    const original=await s.show({version:1,template:'log',data:{source:'Exact application log',raw,startLine:101,pageSize:3}});await expect(s.viewer.locator('.log-line pre')).toHaveText(['  opening line','\tERROR original 9007199254740993.001','  after the error'],{useInnerText:false});
    await s.nav({action:'search',query:'ERROR'});await expect(s.viewer.locator('.log-line')).toHaveCount(3);await s.viewer.getByRole('button',{name:'Inspect log line 102'}).click();
    await expect.poll(async()=>{const result=await s.call('kanvas_inspect','interactions.read',{sessionId:s.sessionId});return JSON.stringify(result);}).toContain('9007199254740993.001');
    expect((await s.current()).view).toEqual(original.view);await photo(s.viewer,info,'log');await s.viewer.getByRole('navigation',{name:'Log pagination'}).getByRole('button',{name:'Next'}).click();await expect(s.viewer.getByRole('button',{name:'Inspect log line 104'})).toBeVisible();
  }finally{await s.client.close();}
});
});

test.describe("events coverage 2", () => {


async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const s=await createSession(page,'September 23 feedback'),d=await createDisplay(page,s,'Acceptance screen'),v=await openViewer(page,s,d.id);
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
type Fixture=Awaited<ReturnType<typeof setup>>;
test.setTimeout(180_000);

async function stable(page:Page,selector:string){
  const sizes=await page.locator(selector).evaluate(async el=>{const values:string[]=[];for(let i=0;i<65;i++){await new Promise(requestAnimationFrame);const r=el.getBoundingClientRect();if(i>=20)values.push([r.width,r.height,el.scrollWidth,el.scrollHeight].map(x=>Math.round(x*2)/2).join(':'));}return [...new Set(values)];});
  expect(sizes,'Settled chart geometry must not oscillate between scrollbar sizes').toHaveLength(1);
}
async function contained(page:Page,selector:string){
  expect(await page.locator(selector).evaluate(el=>({horizontal:el.scrollWidth-el.clientWidth,vertical:el.scrollHeight-el.clientHeight}))).toEqual({horizontal:0,vertical:0});
}

test('long list labels remain readable without horizontal overflow and tool logs use compact rows',async({page,baseURL},info)=>{
 const a=await setup(page,info,baseURL!);try{
  const items=['Line chart','Bar chart','Area chart','Pie chart','Donut chart','Gauge','Funnel','Waterfall','Heatmap','Radar','Treemap','Sankey flow','Bubble chart','Scatter plot','Histogram','Box-and-whisker chart','Network graph','Parallel coordinates','Geographic choropleth','Stacked area chart','Stacked bar chart'];
  await a.show({version:1,template:'list',data:{items}});await expect(a.v.locator('.plain-list li')).toHaveCount(21);expect(await a.v.locator('.plain-list-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(await a.v.locator('.plain-list li').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);await photo(a.v,info,'long-list');
  await a.call('kanvas_publish','tool-log.append',{sessionId:a.s,channel:'acceptance',requestId:randomUUID(),events:[{id:'a',integration:'Fixture',tool:'Example tool',status:'completed',timestamp:'2026-09-23T10:00:00Z',durationMs:42,summary:'Completed source refresh.'}]});await a.show({version:1,template:'tool-call-log',data:{channel:'acceptance'}});await expect(a.v.locator('.tool-call-content')).toContainText('Example tool');expect(await a.v.locator('.tool-call-content>ol>li').first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(170);await photo(a.v,info,'compact-tool-log');
 }finally{await a.client.close();}
});
async function photo(page:Page,info:TestInfo,name:string){for(const notice of await page.getByRole('button',{name:'Dismiss notification',exact:true}).all())await notice.click();await page.evaluate(()=>document.fonts.ready);await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
async function asset(a:Fixture,color='#267f9f',w=240,h=120){return a.call('kanvas_import','asset.import',{sessionId:a.s,name:'Acceptance logo.svg',mimeType:'image/svg+xml',base64:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="1" y="1" width="${w-2}" height="${h-2}" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="${w/2}" cy="${h/2}" r="${h/3}" fill="#ffffff"/><text x="${w/2}" y="${h/2+5}" text-anchor="middle" fill="${color}" font-size="16">K</text></svg>`).toString('base64')});}
});
