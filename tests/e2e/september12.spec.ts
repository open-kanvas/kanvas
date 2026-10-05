import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { publicReference } from '../../src/server/mcp/operations';
import { mkdir } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { Page } from '@playwright/test';
import type { DisplayRecord, ViewSpec } from '../../src/shared/types';
import { extendedExamples } from '../../src/shared/extended-templates';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, test, waitForDisplay } from './support';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function connect(page:Page,baseURL:string,sessionId?:string){
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable September acceptance',scopes:['read','publish'],...(sessionId?{sessionIds:[sessionId]}:{})});
  expect(issued.status).toBe(201);const client=new Client({name:'september-acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}}));return client;
}
async function call<T=unknown>(client:Client,name:string,args:Record<string,unknown>):Promise<T>{const ref=publicReference(name);if(!ref)throw new Error('Missing public mapping');const result=await client.callTool(operationRequest({name:ref.tool,arguments:{operation:ref.operation,...args}}));expect(result.isError,`${name} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;}
async function setup(page:Page){await register(page);const sessionId=await createSession(page,'September display lab'),display=await createDisplay(page,sessionId,'Receiving screen');return {sessionId,display};}
async function painted(page:Page,sessionId:string,displayId:string,template:string){return waitForDisplay(page,sessionId,displayId,d=>d.view?.template===template&&d.appliedRevision===d.revision&&d.revision>0);}

test('new display-only layouts paint exact source data on both screen sizes',async({page},info)=>{
  test.setTimeout(180000);const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  const templates=['timeline','itinerary','product','weather','profile','kpi','quote','recipe','menu','leaderboard','status'] as const;
  await mkdir(info.outputPath('visuals'),{recursive:true});
  for(const template of templates){
    const data=structuredClone(extendedExamples[template]);
    if(template==='kpi')data.items=[{label:'Exact source',value:'9007199254740993.123456789',delta:'+0.00001',trend:'up'},...(data.items as unknown[])];
    await publishPrepared(page,sessionId,[display.id],{version:1,template,title:`Source ${template}`,data});await painted(page,sessionId,display.id,template);
    await expect(viewer.locator(`.template-${template}`)).toBeVisible();
    const expectedText:Record<string,string>={product:'Studio headphones',menu:'Flat white',recipe:'Heat the water.',status:'All systems operational',itinerary:'Waterfront walk',weather:'18°'};if(expectedText[template])await expect(viewer.getByText(expectedText[template],{exact:true}).first()).toBeVisible();
    if(template==='kpi')await expect(viewer.locator('.kpi-content')).toContainText('9007199254740993.123456789');
    if(template==='leaderboard')expect(await viewer.locator('.leaderboard-content h2').allTextContents()).toEqual(['North','South']);
    const geometry=await viewer.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width+2);
    await viewer.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${template}.png`});
  }
});

test('weather atmosphere changes with supplied conditions without fetching forecasts',async({page})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();const external:string[]=[];
  viewer.on('request',request=>{if(!request.url().startsWith(new URL(page.url()).origin))external.push(new URL(request.url()).host);});
  for(const condition of ['clear','partly-cloudy','cloudy','rain','snow','storm','fog']){
    const period=condition==='clear'?'sunset':'night';await publishPrepared(page,sessionId,[display.id],{version:1,template:'weather',data:{place:'Supplied location',temperature:'12.00°',condition,period,forecast:[{time:'18:00',temperature:'11.5°',condition}]}});await painted(page,sessionId,display.id,'weather');
    await expect(viewer.locator(`.weather-${condition}.weather-period-${period}`)).toBeVisible();await expect(viewer.locator('.weather-temperature')).toHaveText('12.00°');
  }
  expect(external).toEqual([]);
});

test('browser inspection reports changed receiving DOM and explicit per-viewer context, not stored source',async({page,baseURL,context})=>{
  const {sessionId,display}=await setup(page),client=await connect(page,baseURL!,sessionId);const viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Authoritative stored source'}});await painted(page,sessionId,display.id,'fact');
    await viewer.locator('.fact-text').evaluate(el=>{el.textContent='Actual browser DOM, deliberately different';});
    const inspect=await call<{source:string;observations:{description:string;context:unknown;fresh:boolean}[]}>(client,'kanvas_display_inspect',{sessionId,displayId:display.id});
    expect(inspect.source).toBe('receiving-browser-dom');expect(inspect.observations.some(x=>x.description.includes('Actual browser DOM, deliberately different')&&x.fresh)).toBe(true);expect(inspect.observations.every(x=>x.context===null)).toBe(true);
    const stored=await call<DisplayRecord>(client,'kanvas_display_current',{sessionId,displayId:display.id});expect(stored.view?.data.text).toBe('Authoritative stored source');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options',exact:true}).click();await viewer.getByLabel('Share timezone and language with the session agent').check();
    await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:59.91,longitude:10.75});await viewer.getByRole('button',{name:'Share my location',exact:true}).click();
    await expect.poll(async()=>{const data=await call<{context?:{location?:{latitude:number}}}[]>(client,'kanvas_viewers_read',{sessionId});return data.some(x=>x.context?.location?.latitude===59.91);}).toBe(true);
    const second=await openViewer(page,sessionId,display.id);await second.bringToFront();
    await expect.poll(async()=>{const data=await call<{context:unknown}[]>(client,'kanvas_viewers_read',{sessionId});return data.length===2&&data.filter(x=>x.context).length===1;}).toBe(true);
    await viewer.getByLabel('Share timezone and language with the session agent').uncheck();
    await expect.poll(async()=>{const data=await call<{context:unknown}[]>(client,'kanvas_viewers_read',{sessionId});return data.every(x=>!x.context);}).toBe(true);
  }finally{await client.close();}
});

test('notifications stack and dismiss without replacing content or history',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId);await viewer.bringToFront();
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Keep the actual view'}});const before=await painted(page,sessionId,display.id,'fact');
    const history=await call(client,'kanvas_display_history',{sessionId,displayId:display.id});
    await call(client,'kanvas_toast',{sessionId,displayIds:[display.id],text:'Task completed',severity:'success',sticky:true});await call(client,'kanvas_toast',{sessionId,displayIds:[display.id],text:'A second notice',severity:'warning',durationMs:10000});
    await expect(viewer.locator('.viewer-toast')).toHaveCount(2);await viewer.locator('.viewer-toast').filter({hasText:'Task completed'}).getByRole('button',{name:'Dismiss notification'}).click();await expect(viewer.locator('.viewer-toast')).toHaveCount(1);
    expect((await sessionDetail(page,sessionId)).displays.find(item => item.id === display.id)!.revision).toBe(before.revision);expect(await call(client,'kanvas_display_history',{sessionId,displayId:display.id})).toEqual(history);await expect(viewer.locator('.fact-text')).toHaveText('Keep the actual view');
  }finally{await client.close();}
});

test('annotations return source-image coordinates and actual chart identities through the interaction inbox',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId);await viewer.bringToFront();
  try{
    const asset=await sessionApi<{url:string}>(page,`/api/sessions/${sessionId}/assets`,'POST',{name:'Annotation source.png',mimeType:'image/png',base64:PNG.toString('base64')});expect(asset.status).toBe(201);
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'image',data:{images:[{url:asset.data!.url,alt:'Source coordinate image'}]}});await painted(page,sessionId,display.id,'image');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByLabel('Annotation note').fill('Inspect this pixel region');await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();
    const b=await viewer.getByRole('img',{name:'Source coordinate image'}).boundingBox();expect(Boolean(b)).toBe(true);await viewer.mouse.click(b!.x+b!.width/2,b!.y+b!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{actionId:string;value:Record<string,unknown>}[]}>(client,'kanvas_interactions_read',{sessionId});return inbox.interactions.some(x=>x.actionId==='viewer.annotation'&&(x.value.target as {type:string}).type==='image');}).toBe(true);
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'chart',data:{kind:'line',series:[{name:'Revenue',points:[{x:'March',y:42},{x:'April',y:55}]}]}});await painted(page,sessionId,display.id,'chart');
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();
    const mark=viewer.locator('[data-chart-series="Revenue"][data-chart-x="March"]').first(),r=await mark.boundingBox();expect(Boolean(r)).toBe(true);await viewer.mouse.click(r!.x+r!.width/2,r!.y+r!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{value:{target?:{type:string;series?:string;x?:string}}}[]}>(client,'kanvas_interactions_read',{sessionId});return inbox.interactions.some(x=>x.value.target?.type==='chart'&&x.value.target.series==='Revenue'&&x.value.target.x==='March');}).toBe(true);
  }finally{await client.close();}
});

test('maps use browser identification, occupy the screen edge, and bind marks geographically',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!,sessionId),refs:string[]=[];await viewer.bringToFront();
  await viewer.route('https://tile.openstreetmap.org/**',route=>{refs.push(route.request().headers().referer??'');return route.fulfill({contentType:'image/png',body:PNG});});
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'map',data:{center:{lat:59.91,lng:10.75},zoom:12,markers:[{lat:59.91,lng:10.75,label:'Supplied marker'}]}});await painted(page,sessionId,display.id,'map');
    expect(refs.length).toBeGreaterThan(0);expect(refs.every(x=>x===new URL(baseURL!).origin+'/')).toBe(true);
    const box=await viewer.locator('.map-surface').boundingBox(),size=viewer.viewportSize()!;expect(box!.x).toBeLessThanOrEqual(1);expect(box!.width).toBeGreaterThanOrEqual(size.width-2);
    await viewer.getByRole('button',{name:'Display controls',exact:true}).click();await viewer.getByRole('button',{name:'Screen options'}).click();await viewer.getByLabel('Annotate this view').check();await viewer.getByRole('button',{name:'Close screen options',exact:true}).click();await viewer.mouse.click(box!.x+box!.width/2,box!.y+box!.height/2);
    await expect.poll(async()=>{const inbox=await call<{interactions:{value:{target?:{type:string;locations?:{lat:number;lng:number}[]}}}[]}>(client,'kanvas_interactions_read',{sessionId});const target=inbox.interactions.find(x=>x.value.target?.type==='map')?.value.target;return Boolean(target?.locations?.some(x=>Math.abs(x.lat-59.91)<.02&&Math.abs(x.lng-10.75)<.02));}).toBe(true);
  }finally{await client.close();}
});

test('overview navigates retained views across displays and settings promote only explicit account defaults',async({page,baseURL})=>{
  const {sessionId,display}=await setup(page),other=await createDisplay(page,sessionId,'Other display'),viewer=await openViewer(page,sessionId,display.id),client=await connect(page,baseURL!);await viewer.bringToFront();
  try{
    await publishPrepared(page,sessionId,[other.id],{version:1,template:'fact',title:'Earlier retained view',data:{text:'First retained value'}});await waitForDisplay(page,sessionId,other.id,d=>d.revision===1);
    await publishPrepared(page,sessionId,[other.id],{version:1,template:'fact',title:'Latest retained view',data:{text:'Second retained value'}});await waitForDisplay(page,sessionId,other.id,d=>d.revision===2);
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'overview',data:{displayIds:[other.id],order:'oldest'}});await painted(page,sessionId,display.id,'overview');await viewer.getByRole('button',{name:/Show Earlier retained view/}).click();
    await waitForDisplay(page,sessionId,other.id,d=>d.revision>2&&d.view?.data.text==='First retained value');
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'settings',data:{description:'Choose a palette and save your defaults'}});await painted(page,sessionId,display.id,'settings');
    await viewer.getByRole('radio',{name:'All new sessions',exact:true}).check();await viewer.getByRole('radio',{name:'Iris',exact:true}).check();await expect(viewer.getByText('Saved for all new sessions. This session is unchanged.',{exact:true})).toBeVisible();await viewer.getByRole('radio',{name:'Light',exact:true}).check();await expect(viewer.getByText('Saved for all new sessions. This session is unchanged.',{exact:true})).toBeVisible();
    const next=await call<{config:{style:string;theme:string}}>(client,'kanvas_session_create',{name:'Inherits chosen defaults'});expect(next.config).toMatchObject({style:'iris',theme:'light'});expect((await sessionDetail(page,sessionId)).displays.find(item => item.id === display.id)!.view?.template).toBe('settings');
  }finally{await client.close();}
});

test('new browser gets a pending recognition label and owner-agent approval, not access from a short URL',async({page,browser,baseURL,diagnostics})=>{
  const {sessionId,display}=await setup(page),client=await connect(page,baseURL!,sessionId),guestContext=await browser.newContext({baseURL}),guest=await guestContext.newPage();diagnostics.watch(guest);
  try{
    await publishPrepared(page,sessionId,[display.id],{version:1,template:'fact',data:{text:'Only after approval'}});
    const address=await call<{url:string}>(client,'kanvas_address_get',{sessionId,displayId:display.id});await guest.goto(address.url);await guest.getByRole('button',{name:'Pair this screen'}).click();await expect(guest.locator('.pairing-request strong')).toBeVisible();await expect(guest.getByText('Only after approval')).toHaveCount(0);
    const pairs=await call<{id:string;label:string;status:string}[]>(client,'kanvas_pairings_read',{sessionId}),pending=pairs.find(x=>x.status==='pending')!;expect(Boolean(pending)).toBe(true);expect(await guest.locator('.pairing-request strong').textContent()).toBe(pending.label);
    await call(client,'kanvas_pairing_decide',{sessionId,pairingId:pending.id,approve:true,confirm:true});await expect(guest.locator('.fact-text')).toHaveText('Only after approval');await guest.getByRole('button',{name:'Display controls',exact:true}).click();await guest.getByRole('button',{name:'Screen options'}).click();await expect(guest.getByLabel('Annotate this view')).toHaveCount(0);
  }finally{await guestContext.close();await client.close();}
});

test('month calendar retains every day and custom HTML stays in an opaque static sandbox',async({page})=>{
  const {sessionId,display}=await setup(page),viewer=await openViewer(page,sessionId,display.id);await viewer.bringToFront();
  await publishPrepared(page,sessionId,[display.id],{version:1,template:'schedule',data:{view:'month',date:'2026-09-01',timeZone:'Europe/Oslo',events:[{id:'month-test',title:'Last day source',start:'2026-09-30T10:00:00+02:00',end:'2026-09-30T11:00:00+02:00'}]}});await painted(page,sessionId,display.id,'schedule');await expect(viewer.locator('.schedule-month-grid .schedule-cell[data-day]')).toHaveCount(30);await expect(viewer.getByText('Last day source')).toHaveCount(1);
  await publishPrepared(page,sessionId,[display.id],{version:1,template:'html',data:{description:'A static custom diagram',html:'<article><h1>Static diagram</h1><p>Supplied words stay visible.</p></article>',css:'article{padding:24px;border:4px solid white}'}});await painted(page,sessionId,display.id,'html');await expect(viewer.frameLocator('.custom-visual').getByRole('heading',{name:'Static diagram'})).toBeVisible();await expect(viewer.locator('.custom-visual')).toHaveAttribute('sandbox','');
  const frame=viewer.frames().find(x=>x.parentFrame());expect(Boolean(frame)).toBe(true);expect(await frame!.evaluate(()=>{try{void parent.document.body;return false;}catch{return true;}})).toBe(true);
});

test('email entry is primary when configured and confirmation never consumes a link merely by opening it',async({page})=>{
  let requests=0,consumes=0,inspections=0,statusReads=0;await page.route('**/api/auth/email/inspect',route=>{inspections++;return route.fulfill({json:{data:{email:'synthetic@example.com'}}});});await page.route('**/api/auth/options',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:{emailSignin:true,allowRegistration:false}})}));
  await page.route('**/api/auth/email/request',route=>{requests++;return route.fulfill({json:{data:{device:'Synthetic browser',code:'Synthetic fixture — not a sign-in code',expiresAt:Date.now()+600000}}});});
  // This isolated UI test mocks creation, so it must also mock the matching
  // status read instead of racing the real server's correctly expired result.
  await page.route('**/api/auth/email/status',route=>{statusReads++;return route.fulfill({json:{data:{status:'pending'}}});});
  await page.goto('/');await page.getByLabel('Email address',{exact:true}).fill('synthetic@example.com');await page.getByRole('button',{name:'Email a sign-in link'}).click();await expect.poll(()=>statusReads).toBeGreaterThan(0);await expect(page.getByRole('status')).toContainText('If this address is eligible');expect(requests).toBe(1);
  const synthetic='x'.repeat(43);await page.route('**/api/auth/email/consume',route=>{consumes++;return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{returnTo:'/'}})});});
  await page.goto(`/#email-signin=${synthetic}`);await expect(page.getByRole('button',{name:'Confirm sign-in'})).toBeVisible();expect(new URL(page.url()).hash).toBe('');expect(consumes).toBe(0);await expect.poll(()=>inspections).toBe(1);await page.getByRole('button',{name:'Confirm sign-in'}).click();await expect.poll(()=>consumes).toBe(1);await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();
});
