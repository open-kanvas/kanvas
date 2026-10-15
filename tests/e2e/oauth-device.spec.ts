import { expect, register, test } from './support';
const GRANT='urn:ietf:params:oauth:grant-type:device_code';
for (const decision of ['approve','deny'] as const) test(`device connection ${decision} requires matching code and explicit account consent`,async({page,baseURL},testInfo)=>{
  await register(page);
  const registration=await page.request.post('/oauth/register',{data:{client_name:'Device acceptance client',grant_types:[GRANT,'refresh_token'],response_types:[]}});expect(registration.status()).toBe(201);const client=(await registration.json()).client_id;
  const response=await page.request.post('/oauth/device/authorize',{form:{client_id:client,scope:'read'}});expect(response.status()).toBe(200);const device=await response.json();
  await page.goto(device.verification_uri_complete);
  await expect(page.getByLabel('Connection code',{exact:true})).toHaveValue(device.user_code);
  expect((await (await page.request.get('/api/tokens')).json()).data).toHaveLength(0);
  await page.getByRole('button',{name:'Review connection',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Device acceptance client',exact:true})).toBeVisible();
  await expect(page.getByText(device.user_code,{exact:true})).toBeVisible();
  await expect(page.getByText(/client name is self-reported/)).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByLabel('New session name',{exact:true})).toHaveCount(0);
  const allow=page.getByRole('button',{name:'Allow account access',exact:true});await expect(allow).toBeDisabled();
  await page.reload();await expect(allow).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  if(decision==='approve') {await page.getByRole('checkbox',{name:/I started this connection/}).check();await allow.click();await expect(page.getByRole('heading',{name:'Connection approved.',exact:true})).toBeVisible();}
  else {await page.getByRole('button',{name:'Decline',exact:true}).click();await expect(page.getByRole('heading',{name:'Connection declined.',exact:true})).toBeVisible();}
  await page.screenshot({path:testInfo.outputPath(`device-${decision}.png`),fullPage:true});
  expect(page.url()).not.toContain(device.device_code);
  const result=await page.request.post('/oauth/token',{form:{grant_type:GRANT,client_id:client,device_code:device.device_code}});
  expect(result.status()).toBe(decision==='approve'?200:400);
  const body=await result.json();if(decision==='deny')expect(body.error).toBe('access_denied');else {expect(body.scope).toBe('read');expect(typeof body.refresh_token).toBe('string');}
});
test('device code entry has accessible recovery and does not grant access',async({page,diagnostics})=>{
  await page.goto('/connect');await expect(page.getByRole('heading',{name:'Connect your agent.',exact:true})).toBeVisible();
  diagnostics.allowHttp(page,'/api/oauth/device/lookup',410);
  await page.getByLabel('Connection code',{exact:true}).fill('AAAA-AAAA-AAAA');await page.getByRole('button',{name:'Review connection',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used');
});
