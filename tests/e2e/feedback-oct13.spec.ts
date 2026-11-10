import {createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,test} from './support';
test('bubble chat preserves source text and fits desktop/phone',async({page})=>{
 await register(page);const s=await createSession(page,'Bubble regression'),d=await createDisplay(page,s,'Chat');
 await publishPrepared(page,s,[d.id],{version:1,template:'chat',data:{style:'bubbles',selfSender:'Alex',messages:[{id:'1',sender:'Sam',text:'Hello there'},{id:'2',sender:'Alex',text:'An exact response'}]}});
 const viewer=await openViewer(page,s,d.id);await expect(viewer.locator('.viewer-candidate .chat-bubbles')).toBeVisible();await expect(viewer.locator('.viewer-candidate .chat-self')).toContainText('An exact response');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('flashcards are voice-first, visually graded and preserve agent-controlled progress',async({page})=>{
 await register(page);const s=await createSession(page,'Flashcard regression'),d=await createDisplay(page,s,'Cards');
 await publishPrepared(page,s,[d.id],{version:1,template:'flashcards',data:{mode:'test',cards:[{id:'hola',prompt:'Translate hola',answer:'hello',promptVisual:{kind:'diagram',data:{nodes:[{id:'q',label:'hola',shape:'terminal'}],edges:[]}}},{id:'adios',prompt:'Translate adiós',answer:'goodbye'}]}});
 const viewer=await openViewer(page,s,d.id),deck=viewer.locator('.viewer-candidate .flashcards');
 await expect(deck).toBeVisible();await expect(deck.getByRole('button')).toHaveCount(0);await expect(deck.getByRole('textbox')).toHaveCount(0);
 await expect(deck.getByRole('progressbar',{name:'Card position'})).toHaveAttribute('value','1');
 const control=async(action:string,response?:string)=>{const detail=await sessionApi<any>(page,`/api/sessions/${s}`),display=detail.data.displays.find((x:any)=>x.id===d.id),data=display.view.data;
  const result=await page.evaluate(async body=>{const me=await (await fetch('/api/auth/me')).json();const r=await fetch('/api/flashcards/control',{method:'POST',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},body:JSON.stringify(body)});return r.status;},{sessionId:s,displayId:d.id,deckId:data.deckId,expectedRevision:display.revision,expectedDeckRevision:data.deckRevision,requestId:crypto.randomUUID(),cardId:data.cards[data.index].id,action,...(response?{response}:{})});expect(result).toBe(200);};
 await control('answer','incorrect response');await expect(deck.getByRole('img',{name:'Incorrect answer',exact:true})).toBeVisible();await expect(deck).toContainText('hello');await expect(deck).not.toContainText('Exact text matching');
 const face=await deck.locator('.flashcard-face').boundingBox();expect(face!.height).toBeGreaterThan(viewer.viewportSize()!.height*.55);
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards-incorrect.png`});
 await control('answer','hello');await expect(deck.getByRole('img',{name:'Correct answer',exact:true})).toBeVisible();
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards-correct.png`});
 await control('next');await expect(deck).toContainText('Translate adiós');await viewer.reload();await expect(viewer.locator('.viewer-candidate .flashcards progress')).toHaveAttribute('value','2');
 expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(viewer.locator('.viewer-toast')).toHaveCount(0,{timeout:15000});
 await viewer.screenshot({path:`/home/deploy/kanvas-feedback-20261014-visuals/${test.info().project.name}-flashcards.png`});
});

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
  for(let i=0;i<27;i++)results.push((await fetch('/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},body:JSON.stringify({supportRef,windowId:crypto.randomUUID(),events:Array.from({length:i<7?20:1},()=>({event:'startup'}))})})).status);
  return results;
 });
 expect(statuses).toEqual(Array(27).fill(200));
 const dropped=page.waitForResponse(r=>r.url().endsWith('/api/diagnostics')&&r.request().method()==='POST'&&r.request().postData()?.includes('js-error')===true);
 await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Quota probe must not be retained'})));
 const response=await dropped;expect(response.status()).toBe(200);expect((await response.json()).data).toMatchObject({accepted:0,rateLimited:true});
 const uploads:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/diagnostics')&&r.method()==='POST')uploads.push(r.url());});
 await page.evaluate(()=>window.dispatchEvent(new PopStateEvent('popstate')));
 // Cross the normal five-second upload interval: the quota pause must prevent another attempt.
 await page.waitForTimeout(6500);expect(uploads).toEqual([]);
});
