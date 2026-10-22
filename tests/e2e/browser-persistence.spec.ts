import {Store} from '../../src/server/store';
import {hash} from '../../src/server/auth';
import {testDatabase} from '../postgres';
import {createDisplay,createSession,expect,publishPrepared,register,sessionApi,test} from './support';

test('one actual login shares console, viewer and account controls with a persistent host-only cookie',async({page,context})=>{
 await register(page);const cookie=(await context.cookies()).find(c=>c.name==='kanvas')!;expect(cookie.expires-Date.now()/1000).toBeGreaterThan(89*86400);expect(cookie.httpOnly).toBe(true);expect(cookie.path).toBe('/');
 const s=await createSession(page,'Login continuity'),d=await createDisplay(page,s,'Same browser viewer');await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'One sign-in across Kanvas'}});
 await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.viewer-shell')).toBeVisible();await expect(page.getByText('One sign-in across Kanvas',{exact:true})).toBeVisible();
 await page.goto('/console?account=sessions');await expect(page.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:/This browser/})).toBeVisible();expect((await context.cookies()).find(c=>c.name==='kanvas')!.value).toBe(cookie.value);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`/home/deploy/kanvas-auth-persistence-20261021-evidence/${test.info().project.name}-sessions.png`});
 await page.reload();await expect(page.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
});

test('sensitive browser revocation requests reauthentication without logging out or replaying',async({page,context,diagnostics})=>{
 await register(page);await page.goto('/console?account=sessions');await expect(page.getByRole('heading',{name:'Signed-in browsers',exact:true})).toBeVisible();
 const cookie=(await context.cookies()).find(c=>c.name==='kanvas')!;const fixtures=new Store(testDatabase(process.env.KANVAS_E2E_RUN_ID));
 try{await fixtures.ready;const b=await fixtures.get<any>('browser',hash(cookie.value));b.authenticatedAt=Date.now()-16*60000;await fixtures.put('browser',b);}finally{await fixtures.close();}
 diagnostics.allowHttp(page,'/api/auth/sessions/revoke',403);
 await page.getByRole('button',{name:'Sign out all browsers'}).click();await page.getByRole('button',{name:'Confirm sign out',exact:true}).click();
 await expect(page.getByRole('dialog',{name:"Confirm it's you"})).toBeVisible();await expect(page.getByRole('dialog',{name:"Confirm it's you"})).toContainText('the action has not been applied');expect(await page.evaluate(async()=>(await fetch('/api/auth/me')).status)).toBe(200);
 await page.screenshot({path:`/home/deploy/kanvas-auth-persistence-20261021-evidence/${test.info().project.name}-reauth.png`});
 await page.getByRole('button',{name:'Keep working without changing access'}).click();await page.getByRole('dialog',{name:'Sign out all browsers?'}).getByRole('button',{name:'Close dialog'}).click();
 expect(await page.evaluate(async()=>((await(await fetch('/api/auth/sessions')).json()).data.browsers).length)).toBe(1);
 // The workspace may have a session read in flight when its cookie is revoked.
 // Permit only that known fixture's 401 after the deliberate self-revocation.
 const ownSessions=(await sessionApi<{id:string}[]>(page,'/api/sessions')).data!;
 for(const session of ownSessions)diagnostics.allowHttp(page,'/api/sessions/'+session.id,401);
 await page.getByRole('button',{name:'Sign out this browser',exact:true}).click();await page.getByRole('button',{name:'Confirm sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome to KANVAS.'})).toBeVisible();
});
