import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { test } from './support';
import { expect } from './support';
import { register } from './support';
import { createSession } from './support';
import { createDisplay } from './support';
import { publishPrepared } from './support';
import { sessionApi } from './support';
import { sessionDetail } from './support';
import type { Page } from '@playwright/test';

test.describe("help coverage 1", () => {

const evidence=()=>test.info().outputPath("screenshots");
async function clientFor(page:Page){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable November acceptance',scopes:['read','publish']});const client=new Client({name:'november-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',page.url()),{requestInit:{headers:{Authorization:'Bearer '+issued.data!.token}}}));return {client,call:async(operationId:string,args:Record<string,unknown>)=>{const result=await client.callTool({name:'kanvas_call',arguments:{operationId,arguments:args}});expect(result.isError).not.toBe(true);return (result.structuredContent as any).data;}};}
async function setup(page:Page){await register(page);const s=await createSession(page,'November acceptance'),d=await createDisplay(page,s,'Target');return {s,d};}
test('all13 hotkeys in a single reference and compact menu fits phone',async({page})=>{
 const {s,d}=await setup(page),mcp=await clientFor(page);try{const help=await mcp.call('kanvas.help.visual',{topic:'keyboard-shortcuts'});expect(help.pageCount).toBe(1);expect(help.view.template).toBe('keyboard-shortcuts');await mcp.call('kanvas.help.show',{sessionId:s,displayIds:[d.id],topic:'keyboard-shortcuts',requestId:randomUUID()});await page.goto(`/view/${s}/${d.id}`);await expect(page.locator('.keyboard-reference kbd')).toHaveCount(13);await expect(page.locator('.keyboard-reference')).toContainText('Presenter-following');expect(await page.locator('.keyboard-reference').evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.screenshot({path:`${evidence()}/${test.info().project.name}-hotkeys.png`});await page.getByRole('button',{name:'Display controls',exact:true}).click();await expect(page.locator('.viewer-menu')).toBeVisible();await expect(page.locator('.viewer-menu')).not.toContainText('Keyboard shortcuts');await expect(page.locator('.viewer-menu')).not.toContainText('Opt in on this device');expect(await page.locator('.viewer-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);for(const close of await page.locator('.viewer-toast button').all())await close.click();await page.screenshot({path:`${evidence()}/${test.info().project.name}-menu.png`});}finally{await mcp.client.close();}
});
});
