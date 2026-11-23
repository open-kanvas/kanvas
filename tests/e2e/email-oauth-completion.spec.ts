import {randomUUID} from 'node:crypto';
import {test,expect} from './support';
import {emailRuntime,beginEmailConnector} from './email-oauth-fixture';

for(const state of ['closed','paused','active'] as const)test('email callback completes with original tab '+state,async({page,browser})=>{
 const h=await emailRuntime(),emailContext=await browser.newContext(),confirmation=await emailContext.newPage();let cdp:import('@playwright/test').CDPSession|undefined;
 try{
  const connection=await beginEmailConnector(h,page),link=await connection.request('independent-'+randomUUID()+'@example.invalid');
  let originalCompletions=0;page.on('request',r=>{if(['/api/auth/email/complete','/api/oauth/approve'].includes(new URL(r.url()).pathname))originalCompletions++;});
  if(state==='closed')await page.close();
  if(state==='paused'){cdp=await page.context().newCDPSession(page);await cdp.send('Page.setWebLifecycleState',{state:'frozen'});}
  await connection.confirm(confirmation,link);const token=await connection.exchange();expect(token.token_type).toBe('Bearer');
  expect(originalCompletions).toBe(0);expect(await h.runtime.store.list('oauth-code')).toHaveLength(1);expect(await h.runtime.store.list('browser')).toHaveLength(0);
  if(state==='paused'){await cdp!.send('Page.setWebLifecycleState',{state:'active'});await page.bringToFront();}
  if(state!=='closed'){await expect(page.getByRole('heading',{name:'Connection approved'})).toBeVisible();expect(originalCompletions).toBe(0);expect(new URL(page.url()).origin).toBe(h.base);}
 }finally{await cdp?.detach();await emailContext.close();if(!page.isClosed())await page.goto('about:blank');await h.close();}
});
