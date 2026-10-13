import {createDisplay,createSession,expect,openViewer,publishPrepared,register,test} from './support';
test('bubble chat preserves source text and fits desktop/phone',async({page})=>{
 await register(page);const s=await createSession(page,'Bubble regression'),d=await createDisplay(page,s,'Chat');
 await publishPrepared(page,s,[d.id],{version:1,template:'chat',data:{style:'bubbles',selfSender:'Alex',messages:[{id:'1',sender:'Sam',text:'Hello there'},{id:'2',sender:'Alex',text:'An exact response'}]}});
 const viewer=await openViewer(page,s,d.id);await expect(viewer.locator('.viewer-candidate .chat-bubbles')).toBeVisible();await expect(viewer.locator('.viewer-candidate .chat-self')).toContainText('An exact response');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('flashcards support keyboard self-testing and durable next card',async({page})=>{
 await register(page);const s=await createSession(page,'Flashcard regression'),d=await createDisplay(page,s,'Cards');
 await publishPrepared(page,s,[d.id],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'Translate hola',answer:'hello'},{id:'adios',prompt:'Translate adiós',answer:'goodbye'}]}});
 const viewer=await openViewer(page,s,d.id);const deck=viewer.locator('.viewer-candidate .flashcards');
 await expect(deck).toBeVisible();await deck.getByLabel('Your answer').fill('hello');await deck.getByRole('button',{name:'Check answer'}).click();await expect(deck).toContainText('correct · Exact text matching');
 await deck.getByRole('button',{name:'Next',exact:true}).click();await expect(deck).toContainText('Translate adiós');await viewer.reload();await expect(viewer.locator('.viewer-candidate .flashcards')).toContainText('Card 2 of 2');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('email form has centered primary action, sender guidance and centered device code',async({page})=>{
 await page.route('**/api/auth/options',route=>route.fulfill({json:{data:{emailSignin:true,allowRegistration:true}}}));
 await page.route('**/api/auth/email/request',route=>route.fulfill({json:{data:{code:'123456',device:'Test browser',expiresAt:Date.now()+600000}}}));
 await page.route('**/api/auth/email/status',route=>route.fulfill({json:{data:{status:'pending'}}}));
 await page.goto('/start');await page.getByLabel('Email address').fill('test@example.invalid');
 const button=page.getByRole('button',{name:'Email a sign-in link'});await expect(button).toBeVisible();
 expect(await button.evaluate(e=>getComputedStyle(e).textAlign)).toBe('center');
 expect(await button.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(page.getByText('Check your spam folder',{exact:false})).toContainText('kanvas@open-kanvas.ai');
 await button.click();await expect(page.locator('.email-match-code')).toHaveText('123456');
 expect(await page.locator('.email-match-code').evaluate(e=>getComputedStyle(e).textAlign)).toBe('center');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('diagnostic batches exclude raw errors and preserve support reference across navigation',async({page})=>{
 await register(page);
 const reference=await page.evaluate(()=>sessionStorage.getItem('kanvas-diagnostic-reference'));
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Private typed answer https://example.invalid/?token=do-not-record',filename:'https://example.invalid/private.js?token=do-not-record'})));
 await page.goto('/start');
 expect(await page.evaluate(()=>sessionStorage.getItem('kanvas-diagnostic-reference'))).toBe(reference);
 await expect.poll(async()=>{const result=await page.request.get('/api/diagnostics?supportRef='+reference);if(!result.ok())return false;const body=(await result.json()).data;expect(JSON.stringify(body)).not.toContain('Private typed');expect(JSON.stringify(body)).not.toContain('do-not-record');expect(body.supportRef).toBe(reference);return body.timeline.some((batch:{events:{event:string}[]})=>batch.events.some(event=>event.event==='js-error'));}).toBe(true);
});

test('diagnostic quota drops are quiet and back off browser uploads',async({page})=>{
 await register(page);
 const statuses=await page.evaluate(async()=>{
  const me=await(await fetch('/api/auth/me')).json(),supportRef=sessionStorage.getItem('kanvas-diagnostic-reference');
  const results:number[]=[];
  for(let i=0;i<7;i++)results.push((await fetch('/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},body:JSON.stringify({supportRef,windowId:crypto.randomUUID(),events:Array.from({length:20},()=>({event:'startup'}))})})).status);
  return results;
 });
 expect(statuses).toEqual(Array(7).fill(200));
 const dropped=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST'&&r.request().postData()?.includes('js-error')===true);
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Quota probe must not be retained'})));
 const response=await dropped;expect(response.status()).toBe(200);expect((await response.json()).data).toMatchObject({accepted:0,rateLimited:true});
 const uploads:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/diagnostics')&&r.method()==='POST')uploads.push(r.url());});
 await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
 // Cross the normal five-second upload interval: the quota pause must prevent another attempt.
 await page.waitForTimeout(6500);expect(uploads).toEqual([]);
});
