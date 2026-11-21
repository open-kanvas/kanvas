import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { gameExample } from '../../src/shared/game';
import { emailRuntime } from './email-oauth-fixture';
import { beginEmailConnector } from './email-oauth-fixture';
import { login } from './support';
import { viewerPath } from './support';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';
import type { ViewSpec } from '../../src/shared/types';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApp } from '../../src/server/app';
import { removeTestDatabase } from '../postgres';
import { operationRequest } from '../mcp/requests.js';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import type { DisplayRecord } from '../../src/shared/types';
import {templateExampleData} from '../../src/shared/template-examples';

test.describe("oauth coverage 1", () => {

const quiet=async(page:Page)=>{for(const button of await page.locator('.viewer-toast button').all())await button.click();};
const fact=(text:string)=>({version:1 as const,template:'fact' as const,data:{text}});

test('standard email confirmation observes real grant completion without signing in email browser',async({page,browser})=>{
 const h=await emailRuntime(),context=await browser.newContext(),confirmation=await context.newPage();
 try{const connection=await beginEmailConnector(h,page),link=await connection.request('nov06-'+randomUUID()+'@example.invalid');await connection.confirm(confirmation,link);await connection.exchange();await expect(confirmation.getByRole('heading',{name:'Connected to Kanvas',exact:true})).toBeVisible();await expect(confirmation.getByRole('status')).toContainText('You can close this window');expect((await confirmation.request.get(h.base+'/api/auth/me')).status()).toBe(401);expect((await page.request.get(h.base+'/api/auth/me')).status()).toBe(200);}
 finally{await context.close();await page.goto('about:blank');await h.close();}
});
});

test.describe("oauth coverage 2", () => {


const view=(template:string,data:Record<string,unknown>,extra:Record<string,unknown>={})=>validateView({template,data,...extra} as never) as ViewSpec;
/** Publish and wait until this window has painted that revision: a measurement taken while the previous
 * view is being replaced reads an element that is already detached (empty computed style, no box). */
const shown=async(page:Page,viewer:Page,s:string,displayId:string,spec:ViewSpec)=>{await publishPrepared(page,s,[displayId],spec);const current=await waitForDisplay(page,s,displayId,x=>x.revision>0&&x.appliedRevision===x.revision);await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(current.revision));return current;};
const setup=async(page:Page,name:string)=>{await register(page);const s=await createSession(page,name),d=await createDisplay(page,s,'Display'),viewer=await openViewer(page,s,d.id);return {s,d,viewer};};
const mcp=async(page:Page,baseURL:string)=>{const token=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Nov10 fixture',scopes:['read','publish']});const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');const client=new Client({name:'nov10-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+token.data!.token}}}));return client;};
const use=async(client:Awaited<ReturnType<typeof mcp>>,operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});return {isError:result.isError===true,structured:result.structuredContent as Record<string,any>};};
const inside=(inner:{x:number;y:number;width:number;height:number},outer:{x:number;y:number;width:number;height:number},slack=1.5)=>inner.x>=outer.x-slack&&inner.y>=outer.y-slack&&inner.x+inner.width<=outer.x+outer.width+slack&&inner.y+inner.height<=outer.y+outer.height+slack;

test('connector identity files are public, typed and not redirected (8f4962dc, e2573eca)',async({request})=>{
 for(const [path,type] of [['/icons/kanvas-512.png','image/png'],['/icons/kanvas-192.png','image/png'],['/favicon-48.png','image/png'],['/favicon-32.png','image/png'],['/favicon.svg','image/svg+xml'],['/favicon.ico','image/']] as const){
  const response=await request.get(`${path}?v=0.40.0`,{maxRedirects:0,headers:{cookie:''}});
  expect(response.status(),path).toBe(200);expect(response.headers()['content-type'],path).toContain(type);expect((await response.body()).length,path).toBeGreaterThan(100);
 }
 const metadata=await (await request.get('/.well-known/oauth-protected-resource/mcp')).json();expect(metadata.resource_documentation).toBe('https://open-kanvas.ai');
 expect(await (await request.get('/')).text()).toContain('name="kanvas-version" content="0.40.0"');
});
});

test.describe("oauth coverage 3", () => {


test('email form has centered primary action, sender guidance and centered device code',async({page})=>{
 await page.route('**/api/auth/options',route=>route.fulfill({json:{data:{emailSignin:true,emailSender:'kanvas@open-kanvas.ai',allowRegistration:true}}}));
 await page.route('**/api/auth/email/request',route=>route.fulfill({json:{data:{code:'123456',device:'Test browser',expiresAt:Date.now()+600000,sender:'kanvas@open-kanvas.ai'}}}));
 await page.route('**/api/auth/email/status',route=>route.fulfill({json:{data:{status:'pending'}}}));
 await page.goto('/start');await expect(page.locator('.login-letters')).toHaveAttribute('aria-label',/^Sign-in code [A-Z]{6}$/);await page.getByRole('button',{name:'Have a keyboard? Sign in with email instead',exact:true}).click();await page.getByLabel('Email address').fill('test@example.invalid');
 const button=page.getByRole('button',{name:'Email a sign-in link'});await expect(button).toBeVisible();
 expect(await button.evaluate(e=>getComputedStyle(e).textAlign)).toBe('center');
 expect(await button.evaluate(e=>getComputedStyle(e).justifyContent)).toBe('center');
 expect(await button.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(page.getByText('Check your spam folder',{exact:false})).toContainText('kanvas@open-kanvas.ai');
 await button.click();await expect(page.locator('.email-match-code')).toHaveText('123456');
 // 2026-11-10 (aef9fccb): the address is the configured sender, named before the request and on the waiting step, as selectable text.
 await expect(page.locator('[role=status] [data-email-sender]')).toHaveText('kanvas@open-kanvas.ai');expect(await page.locator('[role=status] [data-email-sender]').evaluate(e=>getComputedStyle(e).userSelect)).not.toBe('none');
 expect(await page.locator('.email-match-code').evaluate(e=>getComputedStyle(e).textAlign)).toBe('center');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
});

test.describe("oauth coverage 4", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feedback acceptance',scopes:['read','publish']});expect(issued.status).toBe(201);const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
test('email-confirmed connector redirects only its original browser and persists through console and reload',async({page,browser})=>{
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('No test server');const base=`http://127.0.0.1:${address.port}`,database=testDatabase(),mail:string[]=[],runtime=await createApp({database,publicUrl:base,allowRegistration:true,signinMailer:async(_email,link)=>{mail.push(link);}});server.on('request',runtime.app);const confirmation=await browser.newContext({viewport:page.viewportSize()!}),emailPage=await confirmation.newPage();
 try{const callback='https://client.example/callback',verifier=randomBytes(32).toString('base64url'),state='bound-'+randomUUID()+'x'.repeat(1500),registration=await page.request.post(`${base}/oauth/register`,{data:{client_name:'Verified test client',redirect_uris:[callback],grant_types:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'}}),client=await registration.json();expect(registration.status()).toBe(201);
 const query=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'read publish',resource:base+'/mcp',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}),pending=await page.request.get(`${base}/oauth/authorize?${query}`,{maxRedirects:0});expect(pending.status()).toBe(303);let code='',returnedState='';await page.route(url=>url.origin+url.pathname===callback,async route=>{const url=new URL(route.request().url());code=url.searchParams.get('code')??'';returnedState=url.searchParams.get('state')??'';await route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Connected client</h1>'});});
 await page.goto(pending.headers().location);await expect(page.getByLabel('Email address',{exact:true})).toBeEditable();await page.getByLabel('Email address',{exact:true}).fill('browser-'+randomUUID()+'@example.invalid');await page.getByRole('button',{name:'Continue with email',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your email'})).toBeVisible();await expect.poll(()=>mail.length).toBe(1);
 await emailPage.goto(mail[0]);await expect(emailPage.getByRole('heading',{name:'Approve this connection',exact:true})).toBeVisible();expect(code).toBe('');await emailPage.getByRole('button',{name:'Confirm email and connect',exact:true}).click();await expect(emailPage.getByText('Email confirmed. Return to the tab where you started connecting.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Connected client'})).toBeVisible();expect(returnedState).toBe(state);expect(code.length).toBeGreaterThan(0);expect(new URL(emailPage.url()).origin).toBe(base);
 const token=await page.request.post(`${base}/oauth/token`,{form:{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:callback,resource:base+'/mcp',code,code_verifier:verifier}});expect(token.status()).toBe(200);
 await page.goto(base+'/');await expect(page.locator('main.account-overview')).toBeVisible();const me=await page.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data);expect(me.user.id).toBeTruthy();await page.goto(base+'/console');await expect(page.locator('.workspace')).toBeVisible();await page.reload();await expect(page.locator('.workspace')).toBeVisible();expect((await page.evaluate(async()=> (await(await fetch('/api/auth/me')).json()).data)).user.id).toBe(me.user.id);
 const stateMemory=await page.context().storageState(),reopened=await browser.newContext({storageState:stateMemory,viewport:page.viewportSize()!});try{const again=await reopened.newPage();await again.goto(base+'/');await expect(again.locator('main.account-overview')).toBeVisible();}finally{await reopened.close();}
 }finally{await confirmation.close();await page.goto('about:blank');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await runtime.close();await removeTestDatabase(database);}
});
});

test.describe("oauth coverage 5", () => {


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('screen code stays primary, email is available, and opening confirmation never consumes a link',async({page})=>{
  let requests=0,consumes=0,inspections=0,statusReads=0;await page.route('**/api/auth/email/inspect',route=>{inspections++;return route.fulfill({json:{data:{email:'synthetic@example.com'}}});});await page.route('**/api/auth/options',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{emailSignin:true,allowRegistration:false}})}));
  await page.route('**/api/auth/email/request',route=>{requests++;return route.fulfill({json:{data:{device:'Synthetic browser',code:'Synthetic fixture — not a sign-in code',expiresAt:Date.now()+600000}}});});
  // This isolated UI test mocks creation, so it must also mock the matching
  // status read instead of racing the real server's correctly expired result.
  await page.route('**/api/auth/email/status',route=>{statusReads++;return route.fulfill({json:{data:{status:'pending'}}});});
  await page.goto('/');await page.getByRole('button',{name:'Have a keyboard? Sign in with email instead',exact:true}).click();await page.getByLabel('Email address',{exact:true}).fill('synthetic@example.com');await page.getByRole('button',{name:'Email a sign-in link'}).click();await expect.poll(()=>statusReads).toBeGreaterThan(0);await expect(page.getByRole('status')).toContainText('If this address is eligible');expect(requests).toBe(1);
  const synthetic='x'.repeat(43);await page.route('**/api/auth/email/consume',route=>{consumes++;return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{returnTo:'/'}})});});
  await page.goto(`/#email-signin=${synthetic}`);await expect(page.getByRole('button',{name:'Confirm sign-in'})).toBeVisible();expect(new URL(page.url()).hash).toBe('');expect(consumes).toBe(0);await expect.poll(()=>inspections).toBe(1);await page.getByRole('checkbox',{name:/I accept/}).check();await page.getByRole('button',{name:'Confirm sign-in'}).click();await expect.poll(()=>consumes).toBe(1);await expect(page.getByRole('heading',{name:'Sign in on this screen',exact:true})).toBeVisible();
});
});
