import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createApp} from '../../src/server/app';
import {testDatabase} from '../postgres';
import {test,expect,register,createSession,createDisplay,openViewer,publishPrepared,waitForDisplay,sessionDetail,sessionApi} from './support';

test('settings save clicks and agent updates live without changing existing sessions for account defaults',async({page},info)=>{
 await register(page);const s=await createSession(page,'Live settings'),d=await createDisplay(page,s,'Settings'),viewer=await openViewer(page,s,d.id);
 await publishPrepared(page,s,[d.id],{version:1,template:'settings',data:{dimension:'all'}});
 await waitForDisplay(page,s,d.id,x=>x.appliedRevision===x.revision&&x.revision>0);
 const form=viewer.locator('.viewer-candidate .surface-settings');
 await expect(form.getByRole('button',{name:'Apply settings'})).toHaveCount(0);
 await expect(form.getByText('Current settings.',{exact:true})).toHaveCount(0);
 await expect(form.getByRole('radio',{name:'22 px (default)',exact:true})).toBeChecked();
 await form.getByRole('radio',{name:'28 px',exact:true}).check();
 await expect.poll(async()=>(await sessionDetail(page,s)).session.config.readingFontSize).toBe(28);
 await expect(form.getByRole('radio',{name:'22 px (default)',exact:true})).toBeVisible();
 await form.getByRole('radio',{name:'22 px (default)',exact:true}).check();
 await expect.poll(async()=>(await sessionDetail(page,s)).session.config.readingFontSize).toBe(22);
 await expect(form.locator('.option-color-swatch')).toHaveCount(8);
 await form.getByRole('radio',{name:'Lime',exact:true}).check();
 await expect.poll(async()=>(await sessionDetail(page,s)).session.config.style).toBe('lime');
 await expect(form.getByRole('radio',{name:'Lime',exact:true})).toBeChecked();
 const before=(await sessionDetail(page,s)).session;
 const changed=await sessionApi(page,'/api/sessions/'+s+'/config','PATCH',{expectedRevision:before.configRevision,config:{style:'iris'}});expect(changed.status).toBe(200);
 await expect(form.getByRole('radio',{name:'Iris',exact:true})).toBeChecked();
 await form.getByRole('combobox',{name:'Apply to'}).selectOption('account');
 const update=await sessionApi(page,'/api/sessions/'+s+'/displays/'+d.id+'/settings','POST',{scope:'account',expectedRevision:0,config:{dateFormat:'iso'}});expect(update.status).toBe(200);
 await expect(form.getByRole('radio',{name:'Year-month-day (ISO)',exact:true})).toBeChecked();
 expect((await sessionDetail(page,s)).session.config.dateFormat).toBeUndefined();
 const newer=await createSession(page,'Uses account defaults');expect((await sessionDetail(page,newer)).session.config.dateFormat).toBe('iso');
 await form.getByRole('combobox',{name:'Apply to'}).selectOption('session');
 await expect(form.getByRole('radio',{name:'As supplied (default)',exact:true}).last()).toBeChecked();
 expect((await sessionApi(page,'/api/sessions/'+s+'/displays/'+d.id+'/settings','POST',{scope:'account',expectedRevision:1,config:{dateFormat:'dmy'}})).status).toBe(200);
 await expect(form.getByRole('status')).toContainText('All new sessions updated: dateFormat: dmy. This session is unchanged.');
 expect((await sessionDetail(page,s)).session.config.dateFormat).toBeUndefined();
 expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await viewer.screenshot({path:info.outputPath('live-settings.png'),animations:'disabled'});
 await publishPrepared(page,s,[d.id],{version:1,template:'settings',data:{dimension:'readingZoom'}});
 await expect(form.getByText('Zoom presets and the exact factor change the same setting. 1 = 100% (default).',{exact:true})).toBeVisible();
 await expect(form.getByRole('button',{name:'Apply settings'})).toHaveCount(0);
});

test('sign-in approval code, checkbox and text occupy separate readable regions',async({page})=>{
 const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();if(!addr||typeof addr==='string')throw Error('Listener');
 const base='http://127.0.0.1:'+addr.port,mail:string[]=[],runtime=await createApp({database:testDatabase(),publicUrl:base,allowRegistration:true,signinMailer:async(_email,link)=>{mail.push(link);}});server.on('request',runtime.app);
 try{
  await page.goto(base+'/start');await page.getByLabel('Email address',{exact:true}).fill('synthetic-'+randomUUID()+'@example.com');await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();await expect.poll(()=>mail.length).toBe(1);
  await page.goto(mail[0]);const code=page.locator('.email-match-code'),label=page.locator('.email-code-confirm'),checkbox=label.locator('input'),text=label.locator('span');
  await expect(code).toBeVisible();await expect(text).toBeVisible();await expect(page.getByRole('button',{name:'Approve requesting device',exact:true})).toBeDisabled();
  const c=await code.boundingBox(),l=await label.boundingBox(),b=await checkbox.boundingBox(),t=await text.boundingBox();
  expect(l!.y).toBeGreaterThan(c!.y+c!.height+5);expect(t!.x).toBeGreaterThan(b!.x+b!.width+5);expect(b!.width).toBeGreaterThanOrEqual(18);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await checkbox.check();await expect(page.getByRole('button',{name:'Approve requesting device',exact:true})).toBeEnabled();
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await runtime.close();}
});
