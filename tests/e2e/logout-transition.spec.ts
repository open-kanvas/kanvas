import {test,expect,register,createSession,createDisplay,publishPrepared} from './support';
test.use({serviceWorkers:'block'});

test('logout never renders display sign-in choices while root navigation is pending',async({page,diagnostics})=>{
 await register(page);const session=await createSession(page,'Logout transition'),display=await createDisplay(page,session,'Screen');
 await publishPrepared(page,session,[display.id],{version:1,template:'fact',data:{text:'Private screen'}});
 await page.goto('/view/'+session+'/'+display.id);await expect(page.locator('.viewer-candidate')).toContainText('Private screen');
 await page.getByRole('button',{name:'Display controls',exact:true}).click();
 diagnostics.allowHttp(page,'/api/sessions/'+session,401);
 diagnostics.allowHttp(page,'/api/sessions/'+session+'/displays/'+display.id+'/client-capture',401);
 let intercepted!:()=>void;const pendingNavigation=new Promise<void>(resolve=>{intercepted=resolve;});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/',async route=>{if(route.request().isNavigationRequest()){intercepted();await gate;}await route.continue();});
 const seen:{choices:boolean;loading:boolean;privateView:boolean}[]=[];await page.exposeFunction('recordLogoutFrame',(frame:any)=>seen.push(frame));
 await page.evaluate(()=>{
  const record=()=>{const text=document.body.innerText;void (window as any).recordLogoutFrame({choices:text.includes('Choose how to connect.')||text.includes('Sign in to my account'),loading:!!document.querySelector('.app-loading'),privateView:!!document.querySelector('.viewer-candidate')});};
  new MutationObserver(record).observe(document.body,{childList:true,subtree:true});
 });
 try{
  await page.getByRole('button',{name:'Sign out of this screen',exact:true}).click({noWaitAfter:true});
  await pendingNavigation;
  await page.waitForTimeout(500);
  expect(seen.some(frame=>frame.choices)).toBe(false);
  expect(seen.some(frame=>frame.loading&&!frame.privateView)).toBe(true);
 }finally{release();}
 await expect(page).toHaveURL(/\/$/);
 await expect(page.locator('.login-letters')).toHaveAttribute('aria-label',/^Sign-in code [A-Z]{6}$/);
});

test('failed logout leaves the authenticated screen usable',async({page,diagnostics})=>{
 await register(page);const session=await createSession(page,'Logout failure'),display=await createDisplay(page,session,'Screen');
 await publishPrepared(page,session,[display.id],{version:1,template:'fact',data:{text:'Still signed in'}});
 await page.goto('/view/'+session+'/'+display.id);await expect(page.locator('.viewer-candidate')).toContainText('Still signed in');
 diagnostics.allowHttp(page,'/api/auth/logout',503);
 await page.route('**/api/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Temporary logout failure'}})}));
 await page.getByRole('button',{name:'Display controls',exact:true}).click();
 await page.getByRole('button',{name:'Sign out of this screen',exact:true}).click();
 await expect(page.locator('.viewer-candidate')).toContainText('Still signed in');
 await expect(page.locator('.app-loading')).toHaveCount(0);
 await expect(page.getByText('Temporary logout failure',{exact:true})).toBeVisible();
 await expect(page).toHaveURL(new RegExp('/view/'+session+'/'+display.id+'$'));
});
