import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { login } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { viewerPath } from './support';
import { waitForDisplay } from './support';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';

test.describe("planner coverage 1", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('planner weather points are one row with icon first and no empty values; tool detail fits a phone (bebc556b, 7e7fb1b1)',async({page},info)=>{
 const {s,d,viewer}=await setup(page,'Planner and tool detail');
 const day='2026-11-14',weather=[9,12,15,18].map((hour,i)=>({time:`${day}T${String(hour).padStart(2,'0')}:00:00+01:00`,condition:i%2?'cloudy':'rain',temperature:6+i,unit:'C',precipitationChance:i===1?0:40,...(i===2?{}:{wind:{direction:'SW',speed:i===3?0:5,unit:'m/s'}})}));
 await publishPrepared(page,s,[d.id],view('planner',{view:'day',anchorDate:day,timeZone:'Europe/Oslo',items:[{id:'a',title:'Walk',start:`${day}T10:00:00+01:00`,end:`${day}T11:00:00+01:00`}],weather}));
 const points=viewer.locator('.viewer-candidate .weather-point');await expect(points).toHaveCount(4);
 const rows=await points.evaluateAll(list=>list.map(point=>{const icon=point.querySelector('.weather-icon')!.getBoundingClientRect(),values=point.querySelector('.weather-values')!.getBoundingClientRect();return {iconLeftOfValues:icon.right<=values.left+1,sameRow:Math.abs((icon.top+icon.height/2)-(values.top+values.height/2))<icon.height,precipitation:point.querySelectorAll('.weather-precipitation').length,wind:point.querySelectorAll('.weather-wind').length};}));
 expect(rows.every(row=>row.iconLeftOfValues&&row.sameRow)).toBe(true);expect(rows.map(row=>row.precipitation)).toEqual([1,0,1,1]);expect(rows.map(row=>row.wind)).toEqual([1,1,0,0]);
 await viewer.screenshot({path:info.outputPath('planner-weather.png')});
 await publishPrepared(page,s,[d.id],view('tool-detail',{name:'kanvas.update.status',integration:'Kanvas',description:'Read whether a publication was prepared and whether a receiving browser applied it.',parameters:[{name:'sessionId',type:'string',required:true,description:'The session that holds the update.'},{name:'updateId',type:'string (UUID) | undefined',required:false,description:'One update; omit for the most recent update of the session, which is what a voice agent normally wants right after publishing.'},{name:'requestId',type:'string matching ^[A-Za-z0-9_.:-]{1,128}$',required:false,description:'Find the update by the request ID that created it.'}],returns:'Status, revisions and per-display delivery.'}));
 const detail=viewer.locator('.viewer-candidate .tool-detail');await expect(detail.locator('tbody tr')).toHaveCount(3);
 const fit=await detail.evaluate(el=>({horizontal:el.scrollWidth>el.clientWidth+1,rows:[...el.querySelectorAll('tbody tr')].map(row=>{const r=row.getBoundingClientRect(),box=el.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1;}),stacked:getComputedStyle(el.querySelector('tbody tr')!).display==='grid'}));
 expect(fit.horizontal).toBe(false);expect(fit.rows.every(Boolean)).toBe(true);expect(fit.stacked).toBe(info.project.name.startsWith('phone'));
 await expect(detail.locator('.parameter-need.is-required')).toHaveCount(1);await viewer.screenshot({path:info.outputPath('tool-detail.png')});
});
});
