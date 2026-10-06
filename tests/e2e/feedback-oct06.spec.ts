import { randomUUID } from 'node:crypto';
import { createDisplay, createSession, expect, isolatedContext, openViewer, publishPrepared, register, sessionApi, test, waitForDisplay } from './support';
for(const isPublic of [false,true])test(`${isPublic?'Public':'Signed-in'} in-place document edit retains a visible paragraph; a new same-template submit resets`,async({page,browser,baseURL,diagnostics},info)=>{
 await register(page);const sessionId=await createSession(page,'Retained reading'),display=await createDisplay(page,sessionId,'Reader'),ownerViewer=await openViewer(page,sessionId,display.id);
 const anonymous=isPublic?await isolatedContext(browser,info,baseURL!):undefined;let viewer=ownerViewer;
 const paragraphs=Array.from({length:65},(_,i)=>`Unique paragraph ${i+1}. These exact words provide enough source detail to fill the reading area and verify the current visible anchor across edits.`);
 const view={version:1 as const,template:'document' as const,data:{layout:'reading' as const,text:paragraphs.join('\n\n')}};
 await publishPrepared(page,sessionId,[display.id],view);let current=await waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 if(anonymous){const access=await sessionApi(page,`/api/sessions/${sessionId}/public-access`,'POST',{expectedRevision:0,enabled:true,confirm:true});expect(access.status).toBe(200);viewer=await anonymous.newPage();diagnostics.watch(viewer);await viewer.goto(`/view/${sessionId}/${display.id}`);}
 const reader=viewer.getByRole('region',{name:'Document reader'});await expect(reader).toBeVisible();await reader.evaluate(el=>{el.scrollTop=1200;});await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(500);
 const anchor=await reader.evaluate(el=>{const box=el.getBoundingClientRect();const p=[...el.querySelectorAll('p')].find(x=>x.getBoundingClientRect().top>=box.top&&x.getBoundingClientRect().top<box.bottom)!;return {text:p.textContent,offset:p.getBoundingClientRect().top-box.top};});
 const changed=['New introduction. '.repeat(30),...paragraphs].join('\n\n');
 const edit=await sessionApi(page,`/api/sessions/${sessionId}/displays/${display.id}/view`,'PATCH',{expectedRevision:current.revision,data:{...view.data,text:changed}});expect(edit.status).toBe(200);
 current=await waitForDisplay(page,sessionId,display.id,d=>d.revision>current.revision&&d.appliedRevision===d.revision);
 await expect.poll(()=>reader.evaluate((el,a)=>{const p=[...el.querySelectorAll('p')].find(x=>x.textContent===a.text)!;return Math.abs(p.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset);},anchor)).toBeLessThan(5);
 await publishPrepared(page,sessionId,[display.id],view);await waitForDisplay(page,sessionId,display.id,d=>d.revision>current.revision&&d.appliedRevision===d.revision);await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await anonymous?.close();await ownerViewer.close();
});
