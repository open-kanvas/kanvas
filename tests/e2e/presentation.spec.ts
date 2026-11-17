import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { publishPrepared } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createApp } from '../../src/server/app';
import { testDatabase } from '../postgres';
import { removeTestDatabase } from '../postgres';

test.describe("presentation coverage 1", () => {

const evidence='/home/deploy/kanvas-feedback-20261101-evidence';
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('all mirror directions and legacy true preserve private cue instructions',async({page})=>{
 const {s,d}=await setup(page),mcp=await clientFor(page);try{for(const [mirrored,matrix] of [[true,'matrix(1, 0, 0, -1, 0, 0)'],['vertical','matrix(1, 0, 0, -1, 0, 0)'],['horizontal','matrix(-1, 0, 0, 1, 0, 0)'],['both','matrix(-1, 0, 0, -1, 0, 0)'],[false,'none']] as const){const deck=await mcp.call('kanvas.presentation.create',{sessionId:s,name:'Mirror direction',mirrored,instructions:'Private deck instructions',cardInstructions:['Private next cue'],slides:[{version:1,template:'fact',data:{text:'Top left → bottom right'}}]});await mcp.call('kanvas.presentation.cue',{sessionId:s,deckId:deck.id,index:0,displayIds:[d.id],requestId:randomUUID()});await expect.poll(async()=>((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view?.data.mirrored??false)).toBe(mirrored);await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.presentation-slide')).toHaveCSS('transform',matrix);await expect(page.locator('.viewer-candidate')).not.toContainText('Private');for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.screenshot({path:`${evidence}/${test.info().project.name}-mirror-${mirrored}.png`});}}finally{await mcp.client.close();}
});
});

test.describe("presentation coverage 2", () => {

const evidence='/home/deploy/kanvas-feedback-20261029-evidence';
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feedback acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
test('retained cue decks preserve private authored cues and mirrored live card changes',async({page})=>{
 await register(page);const s=await createSession(page,'Cue cards'),d=await createDisplay(page,s,'Speaker'),mcp=await clientFor(page);
 try{const deck=await mcp.call('kanvas.presentation.create',{sessionId:s,name:'Talk notes',instructions:'Listen only when the host supplies speech.',cardInstructions:['Flip when I say next topic.','Wait for my closing sentence.'],mirrored:true,slides:[{version:1,template:'fact',data:{text:'Opening notes'}},{version:1,template:'fact',data:{text:'Closing notes'}}]});await mcp.call('kanvas.presentation.cue',{sessionId:s,deckId:deck.id,index:0,displayIds:[d.id],requestId:randomUUID()});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.presentation-slide')).toContainText('Opening notes');await expect(page.locator('.presentation-slide')).toHaveCSS('transform','matrix(1, 0, 0, -1, 0, 0)');await expect(page.getByText('Flip when I say next topic.',{exact:true})).toHaveCount(0);
 await mcp.call('kanvas.presentation.cue',{sessionId:s,deckId:deck.id,index:1,displayIds:[d.id],requestId:randomUUID()});await expect(page.locator('.presentation-slide')).toContainText('Closing notes');await page.screenshot({path:`${evidence}/${test.info().project.name}-cue-card.png`});const decks=await mcp.call('kanvas.presentations.list',{sessionId:s});expect(decks.find((x:any)=>x.id===deck.id).cardInstructions).toHaveLength(2);
 }finally{await mcp.client.close();}
});
});
