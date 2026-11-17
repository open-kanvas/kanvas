import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { openViewer } from './support';
import { publishPrepared } from './support';
import { waitForDisplay } from './support';
import { sessionApi } from './support';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SEAT_LAYOUTS } from '../../src/shared/venue';
import { SIGN_TYPES } from '../../src/shared/venue';
import type { Page } from '@playwright/test';
import type { TestInfo } from '@playwright/test';

test.describe("kanban coverage 1", () => {

async function setup(page:Page,baseURL:string){
 await register(page);const sessionId=await createSession(page,'October 17 acceptance'),display=await createDisplay(page,sessionId,'Feature screen'),viewer=await openViewer(page,sessionId,display.id);
 const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable feature test',scopes:['read','publish']});
 const client=new Client({name:'feedback-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));
 const call=async(operationId:string,args:Record<string,unknown>={})=>{const r=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(r.isError,JSON.stringify(r.structuredContent)).not.toBe(true);return (r.structuredContent as any).data;};
 const update=(operationId:string,args:Record<string,unknown>)=>call(operationId,{sessionId,displayId:display.id,...args});
 const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
 const show=async(template:any,data:Record<string,unknown>)=>{await publishPrepared(page,sessionId,[display.id],{version:1,template,data});return current();};
 return {sessionId,display,viewer,client,call,update,current,show};
}
async function photo(v:Page,info:TestInfo,name:string){await v.locator('.viewer-candidate .render-surface').first().screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});expect(await v.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}
test('kanban live card movement and vocabulary relationships',async({page,baseURL},info)=>{
 const a=await setup(page,baseURL!);try{
 await a.show('kanban',{columns:[{id:'todo',name:'To Do',cards:[{id:'login',title:'Fix login bug',description:'Keep the session after refresh',assignee:'Alex',tags:['Customer issue'],dueDate:'Monday'}]},{id:'doing',name:'In Progress',wipLimit:2},{id:'done',name:'Done'}]});
 await a.update('kanvas.kanban.update',{action:'move-card',cardId:'login',columnId:'doing'});await a.current();await expect(a.viewer.locator('.kanban-board>section').nth(1)).toContainText('Fix login bug');await photo(a.viewer,info,'kanban');
 await a.show('vocabulary',{highlight:'Display'});await expect(a.viewer.locator('.vocab-displays>section')).toHaveCount(2);await expect(a.viewer.locator('.vocab-devices span')).toHaveCount(3);await expect(a.viewer.locator('.vocab-terms .highlight')).toContainText('named place');await photo(a.viewer,info,'vocabulary');
 }finally{await a.client.close();}
});
});
