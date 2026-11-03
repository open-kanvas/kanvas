import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page,TestInfo } from '@playwright/test';
import type { DisplayRecord,InteractionRecord,UpdateRecord,ViewSpec } from '../../src/shared/types';
import { createDisplay,createSession,expect,openViewer,publishPrepared,register,sessionApi,sessionDetail,test,waitForDisplay } from './support';

async function setup(page:Page,info:TestInfo){await register(page);const s=await createSession(page,'Evening feedback verification'),d=await createDisplay(page,s,'Test surface'),viewer=await openViewer(page,s,d.id);if(info.project.name.startsWith('phone'))await viewer.setViewportSize({width:443,height:823});await viewer.bringToFront();return {s,d,viewer};}
async function connect(page:Page,baseURL:string,s:string){const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable evening acceptance',scopes:['read','publish'],sessionIds:[s]});expect(issued.status).toBe(201);const client=new Client({name:'evening-acceptance',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function ready(page:Page,s:string,d:string,template?:string){return waitForDisplay(page,s,d,x=>(!template||x.view?.template===template)&&x.revision>0&&x.appliedRevision===x.revision);}
async function photo(viewer:Page,info:TestInfo,label:string){
  // Text exists before a staged candidate becomes the visible painted frame.
  // Capture the settled screen, not that deliberately hidden preparation stage.
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status','ready');
  await expect.poll(()=>viewer.locator('.viewer-shell').evaluate(el=>el.getAttribute('data-revision')===el.getAttribute('data-rendered-revision'))).toBe(true);
  await expect(viewer.locator('.viewer-candidate')).toBeVisible();
  if(label==='procedure')await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toBeInViewport();
  await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${label}.png`,animations:'disabled'});
}

test('long documents start with the supplied content and scroll to the exact last paragraph',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info),text='Opening heading\n\n'+Array.from({length:45},(_,i)=>`Supplied paragraph ${i+1}. The exact value is 123.4500. Clear reading preserves every sentence, rather than shrinking it into a fact card.`).join('\n\n')+'\n\nThe final supplied paragraph.';
  await publishPrepared(page,s,[d.id],{version:1,template:'document',title:'A supplied article',data:{text,layout:'reading',headings:[{start:0,end:15,level:2}]}});await ready(page,s,d.id,'document');
  await expect(viewer.locator('.view-heading')).toHaveCount(0);
  await expect(viewer.locator('.document-article h2')).toHaveText('Opening heading');
  await expect(viewer.locator('.document-article h2')).toBeInViewport({ratio:1});
  await expect(viewer.locator('.document-article>p').first()).toBeInViewport({ratio:1});
  await expect(viewer.locator('.document-article')).toContainText('Supplied paragraph 1.');await photo(viewer,info,'document-top');
  await viewer.getByRole('region',{name:'Document reader'}).evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(viewer.getByText('The final supplied paragraph.',{exact:true})).toBeInViewport();
  expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data.text).toBe(text);expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,'document-bottom');
});

test('settings apply selections immediately and notify the agent',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info);await publishPrepared(page,s,[d.id],{version:1,template:'settings',data:{description:'Choose your appearance'}});await ready(page,s,d.id,'settings');
  await viewer.getByRole('radio',{name:'Iris',exact:true}).check();await expect.poll(async()=>(await sessionDetail(page,s)).session.config.style).toBe('iris');
  await viewer.getByRole('radio',{name:'Light',exact:true}).check();await expect.poll(async()=>(await sessionDetail(page,s)).session.config.theme).toBe('light');
  await expect(viewer.getByRole('radio',{name:'Iris',exact:true})).toBeChecked();await expect(viewer.getByRole('button',{name:'Apply settings',exact:true})).toHaveCount(0);
  await expect(viewer.getByText('Settings saved.',{exact:true})).toBeVisible();await expect(viewer.locator('.viewer-shell')).toHaveClass(/theme-light/);
  const detail=await sessionDetail(page,s);expect(detail.session.config).toMatchObject({style:'iris',theme:'light'});expect(detail.interactions.some(x=>x.actionId==='settings.changed')).toBe(true);await photo(viewer,info,'settings');
});

test('location is announced to the agent and late permission callbacks cannot undo withdrawal',async({page,context},info)=>{
  const {s,d,viewer}=await setup(page,info);await publishPrepared(page,s,[d.id],{version:1,template:'weather',data:{place:'Illustrative location',temperature:'18°',condition:'clear'}});await ready(page,s,d.id,'weather');
  await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options',exact:true}).click();await viewer.getByLabel('Share timezone and language with the session agent').check();
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:58.461234,longitude:8.771234});await viewer.getByRole('button',{name:'Share my location',exact:true}).click();await expect(viewer.getByRole('status').filter({hasText:'Location: granted'})).toBeVisible();
  await expect.poll(async()=>{const detail=await sessionDetail(page,s);return detail.interactions.some(x=>x.actionId==='viewer.context'&&(x.value as {locationAvailable?:boolean}).locationAvailable);}).toBe(true);
  const notices=(await sessionDetail(page,s)).interactions.filter(x=>x.actionId==='viewer.context');expect(JSON.stringify(notices)).not.toMatch(/latitude|longitude|58\.461234|8\.771234/);
  await viewer.getByRole('button',{name:'Stop sharing location',exact:true}).click();
  await viewer.evaluate(()=>{navigator.geolocation.getCurrentPosition=callback=>{(window as unknown as {finishLocation:()=>void}).finishLocation=()=>callback({coords:{latitude:1,longitude:2,accuracy:3},timestamp:Date.now()} as GeolocationPosition);};});
  await viewer.getByRole('button',{name:'Share my location',exact:true}).click();await expect(viewer.getByRole('status').filter({hasText:'Location: requesting'})).toBeVisible();await viewer.getByLabel('Share timezone and language with the session agent').uncheck();await viewer.getByLabel('Share timezone and language with the session agent').check();
  await viewer.evaluate(()=>(window as unknown as {finishLocation:()=>void}).finishLocation());await expect(viewer.getByRole('status').filter({hasText:'Location: not-requested'})).toBeVisible();
});

test('recipe steps stay pre-staged and advance from both the screen and MCP voice-style commands',async({page,baseURL},info)=>{
  const {s,d,viewer}=await setup(page,info),client=await connect(page,baseURL!,s),steps=['Measure the supplied ingredients.','Mix the dry ingredients in a bowl.','Add the liquid slowly.','Whisk until smooth.','Let the batter rest.','Warm the iron.','Cook until golden.','Serve and enjoy.'];
  try{
    await publishPrepared(page,s,[d.id],{version:1,template:'recipe',data:{name:'Illustrative waffle guide',materials:['A bowl','A whisk','Supplied ingredients'],steps}});await ready(page,s,d.id,'recipe');await viewer.getByRole('button',{name:'Start step-by-step',exact:false}).click();
    await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[0]);await ready(page,s,d.id);await viewer.getByRole('button',{name:'Next step',exact:false}).click();await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[1]);
    const current=await ready(page,s,d.id);await call(client,'kanvas_procedure_control',{sessionId:s,displayId:d.id,requestId:randomUUID(),expectedRevision:current.revision,action:'next'});await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[2]);await ready(page,s,d.id);
    await viewer.getByRole('button',{name:'Back',exact:true}).click();await expect(viewer.locator('.viewer-candidate .procedure-instruction')).toHaveText(steps[1]);expect((await sessionDetail(page,s)).displays.find(item => item.id === d.id)!.view?.data.steps).toEqual(steps);await photo(viewer,info,'procedure');
  }finally{await client.close();}
});

test('the overview shows actual retained template miniatures and complete long titles',async({page,baseURL},info)=>{
  const {s,d,viewer}=await setup(page,info),client=await connect(page,baseURL!,s);
  try{
    const source=await call<DisplayRecord>(client,'kanvas_display_register',{sessionId:s,name:'Source history',width:1280,height:800});
    const title='An intentionally long retained view title that remains fully readable on the portrait display';
    await publishPrepared(page,s,[source.id],{version:1,template:'fact',title,data:{text:'The actual retained idea.'}});await waitForDisplay(page,s,source.id,x=>x.revision===1);
    await publishPrepared(page,s,[source.id],{version:1,template:'number',title:'An exact retained number',data:{value:'123456789.0001'}});await waitForDisplay(page,s,source.id,x=>x.revision===2);
    await publishPrepared(page,s,[d.id],{version:1,template:'overview',data:{displayIds:[source.id]}});await ready(page,s,d.id,'overview');await expect(viewer.locator('.retained-preview .fact-text')).toHaveText('The actual retained idea.');await expect(viewer.locator('.overview-card-caption h3').filter({hasText:title})).toHaveText(`1. ${title}`);
    const h=viewer.locator('.overview-card-caption h3').filter({hasText:title});await expect(h.getByLabel('View number',{exact:true})).toHaveText('1.');expect(await h.evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1)).toBe(true);await photo(viewer,info,'overview');
    await viewer.getByRole('button',{name:new RegExp('Show An intentionally long retained')}).click();await waitForDisplay(page,s,source.id,x=>x.revision>2&&x.view?.data.text==='The actual retained idea.');
  }finally{await client.close();}
});

test('menu images load from protected source assets and text stays glanceable without them',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info),asset=await sessionApi<{url:string}>(page,`/api/sessions/${s}/assets`,'POST',{name:'Supplied menu image',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII='});expect(asset.status).toBe(201);
  const data={groups:[{title:'Pizza tonight',items:[{name:'Margherita',price:'159.00 NOK',description:'Tomato, mozzarella and basil.',featured:true,image:{url:asset.data!.url,alt:'Supplied Margherita image'}},{name:'Classic mushroom',price:'179.00 NOK',description:'Mushrooms, herbs and cheese.'}]}]};
  await publishPrepared(page,s,[d.id],{version:1,template:'menu',data});await ready(page,s,d.id,'menu');await expect(viewer.getByRole('img',{name:'Supplied Margherita image'})).toBeVisible();expect(await viewer.locator('.menu-content h3').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);await expect(viewer.locator('.is-featured')).toContainText('159.00 NOK');expect(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await photo(viewer,info,'menu');
});

test('share_create can publish a legible join code while preserving explicit guest approval',async({page,baseURL},info)=>{
  const {s,d,viewer}=await setup(page,info),client=await connect(page,baseURL!,s);
  try{
    const result=await call<{id:string;url:string;update:UpdateRecord}>(client,'kanvas_share_create',{sessionId:s,displayId:d.id,requestId:randomUUID(),expectedRevision:0,showOnDisplay:true,label:'Join our session'});await ready(page,s,d.id,'join');
    await expect(viewer.getByRole('heading',{name:'Join our session',exact:true})).toBeVisible();await expect(viewer.locator('.join-address')).toHaveAttribute('href',new URL(result.url).pathname);await expect(viewer.getByText('Scan or open the address, then ask the owner to approve your screen.',{exact:true})).toBeVisible();
    const code=await viewer.locator('.join-qr img').boundingBox();expect(code!.width).toBeGreaterThan(140);expect(await viewer.locator('.join-qr img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(512);await photo(viewer,info,'join');
  }finally{await client.close();}
});

test('Kanvas Help opens focused public guidance without publishing over the empty display',async({page},info)=>{
  const {s,d,viewer}=await setup(page,info);await expect(viewer.getByRole('link',{name:'Kanvas Help',exact:true})).toBeVisible();
  const popup=viewer.waitForEvent('popup');await viewer.getByRole('link',{name:'Kanvas Help',exact:true}).click();const help=await popup;
  await expect(help.getByRole('heading',{name:'Kanvas Help',exact:true})).toBeVisible();await expect(help.getByRole('link',{name:'Navigate, restore history and autoplay prepared views',exact:true})).toBeVisible();
  expect((await sessionDetail(page,s)).displays.find(x=>x.id===d.id)?.view).toBeNull();await help.close();
});
