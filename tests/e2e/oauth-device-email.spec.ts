import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../../src/server/app';
import { testDatabase, removeTestDatabase } from '../postgres';
import { test, expect } from './support';

for (const target of ['current', 'origin'] as const) test(`device flow replaces view-only pairing with its own email account (${target} device confirmation)`, async ({ page, browser, diagnostics }) => {
  const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test listener');
  const base=`http://127.0.0.1:${address.port}`,database=testDatabase(),mail:string[]=[];
  const runtime=await createApp({database,publicUrl:base,allowRegistration:true,signinMailer:async(_email,link)=>{mail.push(link);}});server.on('request',runtime.app);
  const owner=await browser.newContext();
  try {
    expect((await owner.request.post(`${base}/api/auth/email/request`,{data:{email:`owner-${randomUUID()}@example.com`}})).ok()).toBe(true);
    const ownerLink=mail.pop()!;
    const registered=await owner.request.post(`${base}/api/auth/email/consume`,{data:{token:new URL(ownerLink).hash.slice('#email-signin='.length),confirm:true,acceptedLegalVersion:'2026-10-14',target:'current'}});expect(registered.ok()).toBe(true);
    const ownerAuth=(await registered.json()).data,headers={'X-Kanvas-CSRF':ownerAuth.csrfToken};
    const created=await owner.request.post(`${base}/api/sessions`,{headers,data:{name:'Private paired owner session',initialDisplay:false}});expect(created.ok()).toBe(true);const session=(await created.json()).data;
    const displayResponse=await owner.request.post(`${base}/api/sessions/${session.id}/displays`,{headers,data:{name:'Paired screen',width:1200,height:800,pixelRatio:1}});expect(displayResponse.ok()).toBe(true);const display=(await displayResponse.json()).data;
    const requested=await page.request.post(`${base}/api/pairings`,{data:{sessionId:session.id,displayId:display.id}});expect(requested.ok()).toBe(true);const pairing=(await requested.json()).data;
    expect((await owner.request.post(`${base}/api/pairings/${pairing.id}/decision`,{headers,data:{approve:true}})).ok()).toBe(true);
    expect((await page.request.get(`${base}/api/pairings/${pairing.id}/status`)).ok()).toBe(true);
    // Ordinary paired root entry still goes straight to its approved display.
    await page.goto(base);await expect(page.locator('.viewer-shell')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/view/${session.id}/${display.id}`);
    const grant='urn:ietf:params:oauth:grant-type:device_code';
    const client=(await (await page.request.post(`${base}/oauth/register`,{data:{client_name:'Device reconnect client',grant_types:[grant,'refresh_token'],response_types:[]}})).json()).client_id;
    const device=await (await page.request.post(`${base}/oauth/device/authorize`,{form:{client_id:client}})).json();
    await page.goto(device.verification_uri_complete);
    await page.getByRole('button',{name:'Review connection',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Sign in to connect your agent.'})).toBeVisible();
    const intent=page.url();
    // Even a viewer entry carrying OAuth intent must not win over account sign-in.
    await page.goto(`${base}/view/${session.id}/${display.id}${new URL(intent).search}`);
    await expect(page.getByRole('heading',{name:'Sign in to connect your agent.'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open session',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Allow account access',exact:true})).toHaveCount(0);
    await page.getByLabel('Email address',{exact:true}).fill(`reconnect-${randomUUID()}@example.com`);
    await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();await expect.poll(()=>mail.length).toBe(1);
    if(target==='origin') {
      const confirmation=await owner.newPage();let deviceRegistrations=0;confirmation.on('request',request=>{if(new URL(request.url()).pathname==='/api/devices/register')deviceRegistrations++;});await confirmation.goto(mail[0]);
      await confirmation.getByRole('checkbox',{name:/I accept/}).check();await confirmation.getByRole('checkbox',{name:/I started/}).check();await confirmation.getByRole('button',{name:'Approve requesting device',exact:true}).click();
      await expect(confirmation.getByRole('status')).toContainText('Return to that screen');expect(deviceRegistrations).toBe(0);
    } else {
      await page.goto(mail[0]);await expect(page.getByRole('button',{name:'Sign in here and connect',exact:true})).toHaveCount(0);await page.getByRole('checkbox',{name:/I accept/}).check();await page.getByRole('button',{name:'Sign in and review connection code',exact:true}).click();
    }
    await expect(page.getByRole('heading',{name:'Device reconnect client',exact:true})).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
    expect(new URL(page.url()).search).toBe(new URL(intent).search);
    const signed=(await (await page.request.get(`${base}/api/auth/me`)).json()).data;
    expect(signed.viewOnly).not.toBe(true);expect(signed.user.id===ownerAuth.user.id).toBe(false);
    expect((await (await owner.request.get(`${base}/api/tokens`)).json()).data).toHaveLength(0);
    await expect(page.getByText(device.user_code,{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Allow account access',exact:true})).toBeDisabled();
    await page.getByRole('checkbox',{name:/I started this connection/}).check();
    await page.getByRole('button',{name:'Allow account access',exact:true}).click();await expect(page.getByRole('heading',{name:'Connection approved.',exact:true})).toBeVisible();
    const exchange=await page.request.post(`${base}/oauth/token`,{form:{grant_type:grant,client_id:client,device_code:device.device_code}});expect(exchange.status()).toBe(200);
    expect((await (await page.request.get(`${base}/api/tokens`)).json()).data).toMatchObject([{accessMode:'account'}]);
    expect((await (await owner.request.get(`${base}/api/tokens`)).json()).data).toHaveLength(0);
    expect([403,404]).toContain((await page.request.get(`${base}/api/sessions/${session.id}`)).status());
  } finally {
    await page.close();await owner.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await runtime.close();await removeTestDatabase(database);
  }
});
