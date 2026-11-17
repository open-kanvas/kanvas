import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { publishPrepared } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import { Store } from '../../src/server/store';
import { testDatabase } from '../postgres';

test.describe("discovery coverage 1", () => {

async function navigation(page:any,s:string,d:string,revision:number,action:unknown){const tabId=await page.evaluate(()=>sessionStorage.getItem('kanvas-viewer-tab'));return sessionApi(page,`/api/sessions/${s}/displays/${d}/navigation`,'POST',{tabId:tabId??'feedback26',requestId:crypto.randomUUID(),expectedRevision:revision,navigation:action});}

test('live registry catalogs fit without controls and device metadata stays readable',async({page})=>{
 await register(page);const s=await createSession(page,'Registry and devices'),d=await createDisplay(page,s,'Catalog');
 const result=await sessionApi<any>(page,`/api/sessions/${s}/catalog`,'POST',{displayIds:[d.id],requestId:crypto.randomUUID(),catalog:'operations'});expect(result.status).toBe(200);
 await page.goto(`/view/${s}/${d.id}`);
 // 187 established public operations plus active-share read and share revoke.
 const labels=page.locator('.viewer-candidate .catalog-list span');await expect(labels).toHaveCount(189);
 const catalogView=(await sessionDetail(page,s)).displays.find(x=>x.id===d.id)!.view!;
 expect(catalogView.template).toBe('catalog-list');expect(catalogView.data.items).toHaveLength(189);
 expect(catalogView.data.items).toEqual(expect.arrayContaining(['window.viewport','guidance.suggestions.list','guidance.suggestions.save','guidance.suggestions.delete','guidance.suggestions.import','satisfaction.read','device.lock','device.unlock','display.lockdown','shares.read','share.revoke']));
 await expect(labels).toHaveText(catalogView.data.items as string[]);
 const bounds=await page.locator('.viewer-candidate .catalog-list').evaluate(root=>{const r=root.getBoundingClientRect();return [...root.querySelectorAll('span')].every(el=>{const b=el.getBoundingClientRect();return b.right<=r.right+1&&b.bottom<=r.bottom+1;});});expect(bounds).toBe(true);await expect(page.locator('.catalog-list button,.catalog-list a,.catalog-list input')).toHaveCount(0);
 const devices=Array.from({length:10},(_,i)=>({name:`Office laptop Chrome number ${i+1}`,device:'Windows computer',browser:'Chrome',location:'Office',role:'Dashboard',tags:['work'],connected:true,windows:[{name:'Main',connected:true,sessionId:'shared',sessionName:'Planning'}]}));
 await publishPrepared(page,s,[d.id],{version:1,template:'devices',data:{devices}});await expect(page.locator('.viewer-candidate .devices-card')).toHaveCount(10);
 expect(await page.locator('.viewer-candidate .devices-card h2').evaluateAll(headings=>headings.every(h=>h.scrollWidth<=h.clientWidth+1))).toBe(true);await expect(page.locator('.viewer-candidate .devices-key')).toContainText('Matching colors');await expect(page.locator('.viewer-candidate .devices-metadata').first()).toHaveText('Office · Dashboard');
});
});
