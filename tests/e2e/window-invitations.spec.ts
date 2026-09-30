import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, register, createSession, createDisplay, publishPrepared, sessionDetail, sessionApi, isolatedContext } from './support';

async function business(page:Page,path:string,method='GET',body?:unknown){
  if(!/^\/api\/(?:devices|groups|invitations)(?:\/|$)/.test(path))throw new Error('Only window/group business APIs are permitted in this fixture.');
  return page.evaluate(async({path,method,body})=>{const me=await(await fetch('/api/auth/me')).json();const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Kanvas-CSRF':me.data.csrfToken},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();return {status:r.status,data:data.data,code:data.error?.code};},{path,method,body});
}
async function tracked(page:Page,path:string){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/devices/register'&&r.request().method()==='POST');await page.goto(path);const result=await(await response).json();await expect(page.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');return result.data as {id:string;window:{id:string;version:number}};}

test('one physical browser has independent reload-stable windows, cloned tabs and painted delivery receipts',async({page,diagnostics})=>{
  await register(page);const s=await createSession(page,'Window-specific content'),first=await createDisplay(page,s,'Window one'),second=await createDisplay(page,s,'Window two'),target=await createDisplay(page,s,'Target');
  for(const [d,text] of [[first,'First window stays independent'],[second,'Second window stays independent'],[target,'Requested window target']] as const)await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text}});
  const a=await page.context().newPage(),b=await page.context().newPage(),ad=await tracked(a,`/view/${s}/${first.id}`),bd=await tracked(b,`/view/${s}/${second.id}`);expect(ad.id).toBe(bd.id);expect(ad.window.id).not.toBe(bd.window.id);
  await expect.poll(async()=> (await business(page,'/api/devices')).data.devices.find((d:any)=>d.id===ad.id).windows.filter((w:any)=>w.connected).length).toBe(2);
  const cloned=a.waitForEvent('popup');await a.evaluate(path=>{window.open(path,'kanvas-test-clone');},`/view/${s}/${first.id}`);const clone=await cloned;diagnostics.watch(clone);await expect(clone.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect.poll(async()=> (await business(page,'/api/devices')).data.devices.find((d:any)=>d.id===ad.id).windows.filter((w:any)=>w.connected).length).toBe(3);
  const list=() => business(page,'/api/devices').then(r=>r.data.devices.find((d:any)=>d.id===ad.id));
  let current=await list();expect(new Set(current.windows.map((w:any)=>w.id)).size).toBe(3);
  const command=await business(page,`/api/devices/${ad.id}/windows/${ad.window.id}/present`,'POST',{sessionId:s,displayId:target.id,expectedVersion:current.windows.find((w:any)=>w.id===ad.window.id).version,requestId:randomUUID()});expect(command.status).toBe(200);
  await expect(a.locator('.viewer-candidate')).toContainText('Requested window target');await expect(b.locator('.viewer-candidate')).toContainText('Second window stays independent');await expect(clone.locator('.viewer-candidate')).toContainText('First window stays independent');
  await expect.poll(async()=> (await list()).windows.find((w:any)=>w.id===ad.window.id)?.command?.status).toBe('applied');
  const reloaded=a.waitForResponse(r=>new URL(r.url()).pathname==='/api/devices/register');await a.reload();expect((await(await reloaded).json()).data.window.id).toBe(ad.window.id);await expect(a.locator('.viewer-candidate')).toContainText('Requested window target');
  current=await list();expect((await business(page,'/api/devices/present','POST',{deviceId:ad.id,sessionId:s,displayId:target.id,expectedVersion:current.version,requestId:randomUUID()})).status).toBe(200);
  for(const receiver of [a,b,clone])await expect(receiver.locator('.viewer-candidate')).toContainText('Requested window target');
  await expect.poll(async()=> (await list()).command.status).toBe('applied');await b.close();await expect.poll(async()=> (await list()).windows.find((w:any)=>w.id===bd.window.id)?.connected).toBe(false);
  const state=await list(),offline=state.windows.find((w:any)=>w.id===bd.window.id);diagnostics.allowHttp(page,`/api/devices/${ad.id}/windows/${bd.window.id}/present`,409);
  expect((await business(page,`/api/devices/${ad.id}/windows/${bd.window.id}/present`,'POST',{sessionId:s,displayId:first.id,expectedVersion:offline.version,requestId:randomUUID()})).code).toBe('WINDOW_OFFLINE');
});

test('owner renames a display in management while its source, address and receiving view remain intact',async({page},info)=>{
  await register(page);const s=await createSession(page,'Rename existing display'),d=await createDisplay(page,s,'Original name');await publishPrepared(page,s,[d.id],{version:1,template:'fact',data:{text:'Same exact content 1.2300'}});
  const v=await page.context().newPage();await tracked(v,`/view/${s}/${d.id}`);const originalUrl=v.url(),before=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;
  await page.getByRole('button',{name:'Rename Original name',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Display name',{exact:true}).fill('Renamed meeting screen');await dialog.getByRole('button',{name:'Save display name',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.getByRole('heading',{name:'Renamed meeting screen',exact:true})).toBeVisible();
  const after=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!;expect(after.view).toEqual(before.view);expect(v.url()).toBe(originalUrl);await expect(v.locator('.viewer-candidate')).toContainText('Same exact content 1.2300');await expect(v.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision',String(after.revision));
  await mkdir(info.outputPath('visuals'),{recursive:true});await page.screenshot({path:info.outputPath('visuals')+'/'+info.project.name+'-display-rename.png',animations:'disabled'});
});

test('a group invitation created in management lets a new account join without administrator follow-up',async({page,browser,baseURL,diagnostics},info)=>{
  await register(page);const g=(await business(page,'/api/groups','POST',{kind:'organization',name:'Invited organization',requestId:randomUUID()})).data;
  const s=await createSession(page,'Group-invited access');await createDisplay(page,s,'Team board');expect((await sessionApi(page,`/api/sessions/${s}/group-access`,'POST',{groupId:g.id,role:'viewer',expectedRevision:0})).status).toBe(200);
  await page.goto('/admin?account=groups');await page.getByRole('navigation',{name:'Your groups'}).getByRole('button',{name:/Invited organization/}).click();await page.getByRole('button',{name:'Invite a new member',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Create invitation',exact:true}).click();const text=await dialog.getByLabel('Invitation to share').inputValue();const url=text.match(/https?:\/\/\S+\/welcome\/[A-Za-z0-9_-]+/)?.[0];expect(url).toBeTruthy();
  const peer=await isolatedContext(browser,info,baseURL!);try{const newcomer=await peer.newPage();diagnostics.watch(newcomer);await newcomer.goto(new URL(url!).pathname);await expect(newcomer.getByRole('heading')).toContainText('Invited organization');await expect(newcomer.getByRole('button',{name:'Create an account or sign in',exact:true})).toBeVisible();await register(newcomer);await newcomer.goto(new URL(url!).pathname);
    await expect(newcomer.getByRole('button',{name:'Join Invited organization',exact:true})).toBeVisible();expect((await business(newcomer,'/api/groups')).data.groups).toHaveLength(0);await newcomer.getByRole('button',{name:'Join Invited organization',exact:true}).click();await expect(newcomer.getByRole('status')).toContainText('now a member');expect((await sessionDetail(newcomer,s)).session.role).toBe('viewer');expect((await business(newcomer,'/api/groups')).data.groups[0].role).toBe('member');
    await mkdir(info.outputPath('visuals'),{recursive:true});await newcomer.screenshot({path:info.outputPath('visuals')+'/'+info.project.name+'-group-invitation.png',animations:'disabled'});
  }finally{await peer.close();}
  await page.reload();await page.getByRole('navigation',{name:'Your groups'}).getByRole('button',{name:/Invited organization/}).click();await page.getByRole('button',{name:'Invite a new member',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Create invitation',exact:true}).click();await expect(dialog.getByLabel('Invitation to share')).toBeVisible();await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Revoke invitation',exact:true}).click();await expect(page.locator('.group-invitations')).toContainText('revoked');
});
