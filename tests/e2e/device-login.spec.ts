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
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';

test.describe("device login coverage 1", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('signout from exact display returns root and fresh six-letter code',async({page,diagnostics})=>{
 const {s,d}=await setup(page);await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Private session'}});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-candidate')).toContainText('Private session');await page.getByRole('button',{name:'Display controls',exact:true}).click();// Revocation may win against an already in-flight protected viewer read.
 diagnostics.allowHttp(page,`/api/sessions/${s}`,401);diagnostics.allowHttp(page,`/api/sessions/${s}/displays/${d.id}/client-capture`,401);await page.getByRole('button',{name:'Sign out of this screen',exact:true}).click();await expect(page).toHaveURL(/\/$/);await expect(page.locator('.login-letters')).toHaveAttribute('aria-label',/^Sign-in code [A-Z]{6}$/);
});
});

test.describe("device login coverage 2", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}
test('keyboardless UI claims only after explicit approval on another signed-in device',async({page,browser})=>{
 await register(page);const screen=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:page.viewportSize()!}),receiver=await screen.newPage();try{await receiver.goto('/');const pending=await receiver.evaluate(async()=> (await(await fetch('/api/screens/request',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).data);const {code,label}=pending;await page.goto(`/connect?screen_code=${code}`);await page.getByRole('button',{name:'Review screen',exact:true}).click();await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Approve screen',exact:true})).toBeDisabled();await page.getByLabel('I am looking at this screen and its code and label match.').check();await page.getByRole('button',{name:'Approve screen',exact:true}).click();await expect(page.getByText('Decision saved. Return to the screen.',{exact:true})).toBeVisible();const claimed=await receiver.evaluate(async()=> (await(await fetch('/api/screens/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()).data);await receiver.goto(claimed.viewerUrl);await expect(receiver).toHaveURL(/\/view\//);await expect(receiver.locator('.viewer-shell')).toBeVisible();const me=await receiver.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data);expect(me.viewOnly).toBe(true);expect(me.receiverDeviceId).toBeTruthy();}finally{await screen.close();}
});
});

test.describe("device login coverage 3", () => {

const evidence=()=>test.info().outputPath("screenshots");
test('six letters fit one viewport and one agent-approved login persists across root console viewer reload and browser reopen',async({page,browser})=>{
 await register(page);const s=await createSession(page,'Account login continuity'),d=await createDisplay(page,s,'Shared owner session');await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Real account sign-in confirmed'}});
 const screen=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:page.viewportSize()!}),receiver=await screen.newPage();try{
 await receiver.goto('/');await expect(receiver.locator('.login-letters strong')).toHaveCount(6);expect(await receiver.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(receiver.locator('img[src^="data:image/png"]')).toHaveCount(0);
 let code=(await receiver.locator('.login-letters strong').allTextContents()).join('');const fixtures=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID!));try{await fixtures.ready;let pending=(await fixtures.list<any>('device-login')).find(x=>x.code===code)!;pending.expiresAt=Date.now()-1;await fixtures.put('device-login',pending);await expect.poll(async()=> (await receiver.locator('.login-letters strong').allTextContents()).join('')).not.toBe(code);code=(await receiver.locator('.login-letters strong').allTextContents()).join('');pending=(await fixtures.list<any>('device-login')).find(x=>x.code===code)!;pending.createdAt=new Date(Date.now()-25*3600000).toISOString();await fixtures.put('device-login',pending);await expect.poll(async()=> (await receiver.locator('.login-letters strong').allTextContents()).join('')).not.toBe(code);code=(await receiver.locator('.login-letters strong').allTextContents()).join('');}finally{await fixtures.close();}const read=await sessionApi<any>(page,'/api/login/lookup','POST',{code});expect(read.status).toBe(200);expect(read.data.context).toHaveProperty('browser');expect(read.data.permissions).toEqual(['Choose full account access or view-only access to one session during approval']);
 const decision=await sessionApi(page,'/api/login/decide','POST',{code,approvalToken:read.data.approvalToken,approve:true,confirm:true,scope:'account'});expect(decision.status).toBe(200);await expect(receiver.locator('main.account-overview')).toBeVisible();
 const owner=(await sessionApi<any>(page,'/api/auth/me')).data.user.id;expect((await receiver.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data)).user.id).toBe(owner);
 await receiver.goto(`/view/${s}/${d.id}`);await expect(receiver.locator('.viewer-candidate')).toContainText('Real account sign-in confirmed');await receiver.goto('/console?account=sessions');await expect(receiver.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();await receiver.reload();await expect(receiver.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
 await receiver.screenshot({path:`${evidence()}/${test.info().project.name}-login-account.png`});
 const state=await screen.storageState();const reopened=await browser.newContext({baseURL:new URL(page.url()).origin,storageState:state,viewport:page.viewportSize()!});try{const again=await reopened.newPage();await again.goto('/');await expect(again.locator('main.account-overview')).toBeVisible();expect((await again.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data)).user.id).toBe(owner);}finally{await reopened.close();}
 const sessions=await sessionApi<any>(page,'/api/auth/sessions');const browserId=(await receiver.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data)).browserSessionId;expect(sessions.data.browsers.some((x:any)=>x.id===browserId)).toBe(true);
 await sessionApi(page,'/api/auth/sessions/revoke','POST',{browserSessionId:browserId,confirm:true,requestId:crypto.randomUUID()});expect(await receiver.evaluate(async()=> (await fetch('/api/auth/me')).status)).toBe(401);
 }finally{await screen.close();}
});
});
