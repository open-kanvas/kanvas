import { authEmail } from '../../src/server/auth-email';
import type { ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, sessionApi, test, waitForDisplay } from './support';

test('settings show visible options, focused dimensions and responsive sections',async({page},info)=>{
 await register(page);const sessionId=await createSession(page,'Synthetic settings acceptance'),display=await createDisplay(page,sessionId,'Settings');const viewer=await openViewer(page,sessionId,display.id);
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'settings',data:{dimension:'all'}});
 await waitForDisplay(page,sessionId,display.id,d=>d.appliedRevision===d.revision&&d.revision>0);
 const form=viewer.locator('.viewer-candidate .surface-settings');await expect(form).toBeVisible();await expect(form.getByRole('radio',{name:'This session',exact:true})).toBeVisible();
 await expect(form.getByRole('radio',{name:'Neutral',exact:true})).toBeVisible();await expect(form.getByRole('radio',{name:'Lime',exact:true})).toBeVisible();
 expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await viewer.screenshot({path:info.outputPath('settings-all.png'),animations:'disabled'});
 const before=(await sessionDetail(page,sessionId)).displays.find(d=>d.id===display.id)!.revision;
 await publishPrepared(page,sessionId,[display.id],{version:1,template:'settings',data:{dimension:'timeFormat'}});
 await waitForDisplay(page,sessionId,display.id,d=>d.appliedRevision===d.revision&&d.revision>before);
 await expect(form.getByRole('radio',{name:'24-hour · 14:30',exact:true})).toBeVisible();await expect(form.getByRole('radio',{name:'Lime',exact:true})).toHaveCount(0);
 await form.getByRole('radio',{name:'24-hour · 14:30',exact:true}).check();await expect.poll(async()=>(await sessionDetail(page,sessionId)).session.config.timeFormat).toBe('24h');
 await viewer.screenshot({path:info.outputPath('settings-time-focused.png'),animations:'disabled'});
 await page.goto('/console');await expect(page.locator('.workspace')).toBeVisible();const menu=page.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar-overview').click();await expect(page.locator('.sessions-home-row').filter({hasText:'Synthetic settings acceptance'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await page.screenshot({path:info.outputPath('console-refresh.png'),animations:'disabled'});
});

test('branded auth email is readable at desktop and phone widths',async({page},info)=>{const content=authEmail('http://127.0.0.1:8799/synthetic-sign-in',true);await page.setContent(content.html);await expect(page.getByRole('img',{name:'Kanvas',exact:true})).toBeVisible();expect(await page.getByRole('img',{name:'Kanvas',exact:true}).evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBe(400);await expect(page.getByRole('heading',{name:'Welcome to KANVAS'})).toBeVisible();await expect(page.getByRole('link',{name:'Create your account'})).toHaveAttribute('href','http://127.0.0.1:8799/synthetic-sign-in');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('auth-email-signup.png'),animations:'disabled'});});
