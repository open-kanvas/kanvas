import { operationRequest } from '../mcp/requests.js';
import { testDatabase } from '../postgres.js';
import {createServer} from 'node:http';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createApp} from '../../src/server/app';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {test,expect} from './support';

test('normal OAuth provisions via email and grants access only after explicit browser confirmation',async({page})=>{
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Test listener unavailable');
  const base=`http://127.0.0.1:${address.port}`,mail:{link:string}[]=[],runtime=await createApp({database:testDatabase(),publicUrl:base,mcpProfile:'twelve',allowRegistration:true,signinMailer:async(_email,link)=>{mail.push({link});}});server.on('request',runtime.app);
  try{
    const redirect='https://email-connector.example/callback',verifier=randomBytes(32).toString('base64url');
    const registration=await page.request.post(`${base}/oauth/register`,{data:{client_name:'Chosen email connector',redirect_uris:[redirect],response_types:['code'],grant_types:['authorization_code'],token_endpoint_auth_method:'none'}});expect(registration.status()).toBe(201);const client=await registration.json();
    const parameters=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'read publish',resource:`${base}/mcp`,state:randomUUID(),code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
    const pending=await page.request.get(`${base}/oauth/authorize?${parameters}`,{maxRedirects:0});expect(pending.status()).toBe(303);const authorizationRequestId=new URL(pending.headers().location).searchParams.get('authorize');
    await page.goto(new URL(pending.headers().location,base).href);await expect(page.locator('input[type=password]')).toHaveCount(0);await page.getByLabel('Email address',{exact:true}).fill(`browser-${randomUUID()}@example.com`);await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();await expect.poll(()=>mail.length).toBe(1);
    let receive!:(code:string)=>void;const receipt=new Promise<string>(resolve=>{receive=resolve;});
    await page.route(url=>url.origin+url.pathname===redirect,async route=>{const code=new URL(route.request().url()).searchParams.get('code')??'';await route.fulfill({contentType:'text/html',body:'<!doctype html><script>history.replaceState(null,"","/callback")</script><h1>Connected client</h1>'});receive(code);});
    await page.goto(mail[0].link);await expect(page.getByRole('heading',{name:'Connect Chosen email connector'})).toBeVisible();await expect(page.getByRole('button',{name:'Sign in here and connect',exact:true})).toBeVisible();expect(Number(((await runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get()) as {n:number}).n)).toBe(0);
    await page.getByRole('button',{name:'Sign in here and connect',exact:true}).click();
    await expect(page.getByText('Accept the Terms of Use and acknowledge the Privacy Policy to continue.',{exact:true})).toBeVisible();
    expect(Number(((await runtime.store.db.prepare('SELECT COUNT(*) n FROM users').get()) as {n:number}).n)).toBe(0);
    await page.getByRole('checkbox',{name:/I accept/}).check();
    await page.getByRole('button',{name:'Sign in here and connect',exact:true}).click();await expect(page.getByRole('heading',{name:'Connected client'})).toBeVisible();const code=await receipt;expect(Boolean(code)).toBe(true);
    const exchange=await page.request.post(`${base}/oauth/token`,{form:{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,resource:`${base}/mcp`,code,code_verifier:verifier}});expect(exchange.status()).toBe(200);const granted=await exchange.json();
    const connected=new Client({name:'verified-email-client',version:'1'});try{await connected.connect(new StreamableHTTPClientTransport(new URL('/mcp',base),{requestInit:{headers:{Authorization:`Bearer ${granted.access_token}`}}}));const start=await connected.callTool(operationRequest({name:'kanvas_inspect',arguments:{operation:'start.read'}}));expect(Boolean(start.isError)).toBe(false);}finally{await connected.close();}
    await page.goto(`${base}/start`);await expect(page.getByRole('region',{name:'Your sessions'})).toBeVisible();await expect(page.locator('.viewer-shell')).toBeVisible();expect((await runtime.store.list('account-entry'))).toHaveLength(1);
  }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await runtime.close();}
});
