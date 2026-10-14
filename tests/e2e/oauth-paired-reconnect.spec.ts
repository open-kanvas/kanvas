import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/app';
import { testDatabase, removeTestDatabase } from '../postgres';
import { test, expect } from './support';

for (const target of ['current', 'origin', 'expired'] as const) test(`paired screen reconnects as its own email account (${target} device confirmation)`, async ({ page, browser, diagnostics }) => {
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test listener');
  const base=`http://127.0.0.1:${address.port}`,database=testDatabase(),mail:string[]=[];
  const runtime=await createApp({database,publicUrl:base,allowRegistration:true,signinMailer:async(_email,link)=>{mail.push(link);}});server.on('request',runtime.app);
  const owner=await browser.newContext();
  try {
    expect((await owner.request.post(`${base}/api/auth/email/request`,{data:{email:`owner-${randomUUID()}@example.com`}})).ok()).toBe(true);
    const ownerLink=mail.pop()!;
    const registered=await owner.request.post(`${base}/api/auth/email/consume`,{data:{token:new URL(ownerLink).hash.slice('#email-signin='.length),confirm:true,target:'current'}});expect(registered.ok()).toBe(true);
    const ownerAuth=(await registered.json()).data,headers={'X-Kanvas-CSRF':ownerAuth.csrfToken};
    const created=await owner.request.post(`${base}/api/sessions`,{headers,data:{name:'Private paired owner session',initialDisplay:false}});expect(created.ok()).toBe(true);const session=(await created.json()).data;
    const displayResponse=await owner.request.post(`${base}/api/sessions/${session.id}/displays`,{headers,data:{name:'Paired screen',width:1200,height:800,pixelRatio:1}});expect(displayResponse.ok()).toBe(true);const display=(await displayResponse.json()).data;
    const requested=await page.request.post(`${base}/api/pairings`,{data:{sessionId:session.id,displayId:display.id}});expect(requested.ok()).toBe(true);const pairing=(await requested.json()).data;
    expect((await owner.request.post(`${base}/api/pairings/${pairing.id}/decision`,{headers,data:{approve:true}})).ok()).toBe(true);
    expect((await page.request.get(`${base}/api/pairings/${pairing.id}/status`)).ok()).toBe(true);
    // Ordinary paired root entry still goes straight to its approved display.
    await page.goto(base);await expect(page.locator('.viewer-shell')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/view/${session.id}/${display.id}`);
    const redirect='https://paired-reconnect.example/callback',verifier=randomBytes(32).toString('base64url'),state=randomUUID();
    const client=(await (await page.request.post(`${base}/oauth/register`,{data:{client_name:'Paired reconnect client',redirect_uris:[redirect]}})).json()).client_id;
    const pending=await page.request.get(`${base}/oauth/authorize?${new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'read publish',resource:`${base}/mcp`,state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')})}`,{maxRedirects:0});expect(pending.status()).toBe(303);
    const intent=pending.headers().location;
    // Even a viewer entry carrying OAuth intent must not win over account sign-in.
    await page.goto(`${base}/view/${session.id}/${display.id}${new URL(intent).search}`);
    await expect(page.getByRole('heading',{name:'Sign in to connect your agent.'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open session',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Allow account access',exact:true})).toHaveCount(0);
    await page.getByLabel('Email address',{exact:true}).fill(`reconnect-${randomUUID()}@example.com`);
    await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();await expect.poll(()=>mail.length).toBe(1);
    if(target==='expired') {
      await page.goto(mail[0]);await expect(page.getByRole('heading',{name:'Connect Paired reconnect client'})).toBeVisible();
      const requestId=new URL(intent).searchParams.get('authorize')!;
      const pendingConsent=await runtime.store.get<{id:string;expiresAt:string}>('oauth-consent',requestId);
      if(!pendingConsent)throw new Error('Test consent missing');pendingConsent.expiresAt=new Date(Date.now()-1).toISOString();await runtime.store.put('oauth-consent',pendingConsent);
      diagnostics.allowHttp(page,'/api/oauth/approve',410);diagnostics.allowHttp(page,`/api/oauth/requests/${requestId}`,410);
      await page.getByRole('button',{name:'Sign in here and connect',exact:true}).click();
      await expect(page.getByText('Return to your agent and choose Connect again. No connection was approved.')).toBeVisible();
      expect(new URL(page.url()).search).toBe(new URL(intent).search);
      await expect(page.getByRole('button',{name:'Allow account access',exact:true})).toHaveCount(0);
      expect((await (await page.request.get(`${base}/api/tokens`)).json()).data).toHaveLength(0);
      return;
    }
    if(target==='origin') {
      const confirmation=await owner.newPage();let deviceRegistrations=0;confirmation.on('request',request=>{if(new URL(request.url()).pathname==='/api/devices/register')deviceRegistrations++;});await confirmation.goto(mail[0]);
      await confirmation.getByRole('checkbox').check();await confirmation.getByRole('button',{name:'Approve requesting device',exact:true}).click();
      await expect(confirmation.getByRole('status')).toContainText('Return to that screen');expect(deviceRegistrations).toBe(0);
    } else {
      await page.goto(mail[0]);await page.getByRole('button',{name:'Sign in on this device instead',exact:true}).click();
    }
    await expect(page.getByRole('heading',{name:'Paired reconnect client',exact:true})).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    expect(new URL(page.url()).search).toBe(new URL(intent).search);
    const signed=(await (await page.request.get(`${base}/api/auth/me`)).json()).data;
    expect(signed.viewOnly).not.toBe(true);expect(signed.user.id===ownerAuth.user.id).toBe(false);
    expect((await (await owner.request.get(`${base}/api/tokens`)).json()).data).toHaveLength(0);
    let returned:URL|undefined;
    await page.route(url=>url.origin+url.pathname===redirect,async route=>{returned=new URL(route.request().url());await route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Connection complete</h1>'});});
    await page.getByRole('button',{name:'Allow account access',exact:true}).click();await expect(page.getByRole('heading',{name:'Connection complete'})).toBeVisible();
    expect(returned?.searchParams.get('state')===state).toBe(true);
    const exchange=await page.request.post(`${base}/oauth/token`,{form:{grant_type:'authorization_code',client_id:client,redirect_uri:redirect,resource:`${base}/mcp`,code:returned!.searchParams.get('code')!,code_verifier:verifier}});expect(exchange.status()).toBe(200);
    expect((await (await page.request.get(`${base}/api/tokens`)).json()).data).toMatchObject([{accessMode:'account'}]);
    expect((await (await owner.request.get(`${base}/api/tokens`)).json()).data).toHaveLength(0);
    expect([403,404]).toContain((await page.request.get(`${base}/api/sessions/${session.id}`)).status());
  } finally {
    await page.close();await owner.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await runtime.close();await removeTestDatabase(database);
  }
});
