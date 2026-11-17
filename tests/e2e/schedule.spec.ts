import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { DisplayRecord } from '../../src/shared/types';
import type { ViewSpec } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import { createDisplay } from './support';
import { createSession } from './support';
import { expect } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { register } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { test } from './support';
import { waitForDisplay } from './support';

test.describe("schedule coverage 1", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('month calendar retains every day and custom HTML stays in an opaque static sandbox',async({page})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  await publishPrepared(page,sessionId,[display.id],{version:1,template:'schedule',data:{view:'month',date:'2026-09-01',timeZone:'Europe/Oslo',events:[{id:'month-test',title:'Last day source',start:'2026-09-30T10:00:00+02:00',end:'2026-09-30T11:00:00+02:00'}]}});await painted(page,sessionId,display.id,'schedule');await expect(viewer.locator('.schedule-month-grid .schedule-cell[data-day]')).toHaveCount(30);await expect(viewer.getByText('Last day source')).toHaveCount(1);
  await publishPrepared(page,sessionId,[display.id],{version:1,template:'html',data:{description:'A static custom diagram',html:'<article><h1>Static diagram</h1><p>Supplied words stay visible.</p></article>',css:'article{padding:24px;border:4px solid white}'}});await painted(page,sessionId,display.id,'html');await expect(viewer.frameLocator('.custom-visual').getByRole('heading',{name:'Static diagram'})).toBeVisible();await expect(viewer.locator('.custom-visual')).toHaveAttribute('sandbox','');
  const frame=viewer.frames().find(x=>x.parentFrame());expect(Boolean(frame)).toBe(true);expect(await frame!.evaluate(()=>{try{void parent.document.body;return false;}catch{return true;}})).toBe(true);
});
});
