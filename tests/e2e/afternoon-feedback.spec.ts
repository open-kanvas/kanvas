import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {Page,TestInfo} from '@playwright/test';
import type {ViewSpec} from '../../src/shared/types';
import {createDisplay,createSession,expect,isolatedContext,openViewer,publishPrepared,register,sessionApi,sessionDetail,tab,test,viewerPath,waitForDisplay} from './support';

async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const sessionId=await createSession(page,'Afternoon release acceptance'),display=await createDisplay(page,sessionId,'Receiving screen'),viewer=await openViewer(page,sessionId,display.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable release client',scopes:['read','publish']});expect(issued.status).toBe(201);
  const options={requestInit:{headers:{Authorization:`Bearer ${issued.data!.token}`}}},client=info.project.name.startsWith('phone')?new LegacyClient({name:'afternoon-legacy',version:'1'}):new Client({name:'afternoon-modern',version:'1'});
  if(client instanceof Client)await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),options));else await client.connect(new LegacyTransport(new URL('/mcp',baseURL),options));
  const call=async<T=any>(tool:string,operation:string,args:Record<string,unknown>={})=>{const result=await client.callTool({name:tool,arguments:{operation,...args}});expect(result.isError,`${tool} ${operation} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
  const show=async(view:ViewSpec)=>{await publishPrepared(page,sessionId,[display.id],view);return current();};
  const nav=async(navigation:unknown)=>{const d=await current();return call('kanvas_control','navigation.control',{sessionId,displayId:display.id,requestId:randomUUID(),expectedRevision:d.revision,navigation});};
  return {sessionId,display,viewer,client,call,current,show,nav};
}
async function photo(page:Page,info:TestInfo,name:string){const directory=info.outputPath('visuals');await mkdir(directory,{recursive:true});await page.screenshot({path:`${directory}/${info.project.name}-${name}.png`,animations:'disabled'});}

test('reading controls change actual typography and pacing, pause in place, and carry independent defaults to a new session',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    const text=Array.from({length:70},(_,i)=>`Paragraph ${i+1}. Keep these exact source words and the decimal 9007199254740993.001 intact. This paragraph has enough readable context to check real scroll geometry.`).join('\n\n');
    const original=await s.show({version:1,template:'document',title:'A readable source',data:{layout:'reading',text}}),reader=s.viewer.getByRole('region',{name:'Document reader'}),controls=s.viewer.getByRole('navigation',{name:'Reading controls'});
    await expect(reader).toHaveAttribute('data-reading-playing','false');await expect(controls.getByLabel('Reading speed',{exact:true})).toHaveText('220 wpm');
    const font=()=>s.viewer.locator('.document-article').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));const initialFont=await font();
    await controls.getByRole('button',{name:'Larger reading text'}).click();await expect(controls.getByLabel('Reading font size')).toHaveText('24px');await expect.poll(font).toBeGreaterThan(initialFont);await expect(controls.getByLabel('Reading zoom')).toHaveText('100%');
    await controls.getByRole('button',{name:'Zoom reading in'}).click();await expect(controls.getByLabel('Reading zoom')).toHaveText('110%');await expect(controls.getByLabel('Reading font size')).toHaveText('24px');
    await controls.getByRole('button',{name:'Read slower'}).click();await expect(controls.getByLabel('Reading speed',{exact:true})).toHaveText('190 wpm');
    await s.viewer.bringToFront();await controls.getByRole('button',{name:'Start reading'}).click();await expect(reader).toHaveAttribute('data-reading-playing','true');await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);
    const observed=await s.call('kanvas_inspect','viewers.read',{sessionId:s.sessionId,displayId:s.display.id});expect(observed.some((v:any)=>v.connected)).toBe(true);
    await controls.getByRole('button',{name:'Pause reading'}).click();await expect(reader).toHaveAttribute('data-reading-playing','false');
    const held=await reader.evaluate(el=>el.scrollTop);await expect.poll(async()=>Math.abs(await reader.evaluate(el=>new Promise<number>(resolve=>setTimeout(()=>resolve(el.scrollTop),400)))-held)).toBeLessThan(3);
    await controls.getByRole('button',{name:'Save personal reading defaults'}).click();await expect(controls).toContainText('Reading defaults saved.');
    const pref=await s.call('kanvas_inspect','preferences.get');expect(pref.config).toMatchObject({readingFontSize:24,readingWpm:190,readingZoom:1.1});expect((await s.current()).view).toEqual(original.view);expect((await s.current()).revision).toBe(original.revision);
    await s.nav({action:'reading',command:'start',wpm:320,saveDefaults:false});await expect(reader).toHaveAttribute('data-reading-wpm','320');await s.nav({action:'reading',command:'pause'});
    await s.show({version:1,template:'document',title:'Next reading',data:{layout:'reading',text}});await expect(reader).toHaveAttribute('data-reading-playing','false');await expect(controls.getByLabel('Reading speed',{exact:true})).toHaveText('190 wpm');await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeLessThan(2);
    const next=await createSession(page,'Independent new reading defaults');expect((await sessionDetail(page,next)).session.config).toMatchObject({readingFontSize:24,readingWpm:190,readingZoom:1.1});await photo(s.viewer,info,'reading');
  }finally{await s.client.close();}
});

test('progress appends preserve events and proportional spines; log inspection retains exact lines and surrounding context',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    await s.show({version:1,template:'progress',data:{task:'Verify the release',events:[{id:'one',title:'Read exact source',timestamp:'2026-09-16T14:00:00Z',description:'Original decimal 9007199254740993.001'}]}});
    for(const [i,seconds] of [10,40].entries()){const d=await s.current();await s.call('kanvas_publish','progress.append',{sessionId:s.sessionId,displayId:s.display.id,requestId:`append-${i}`,expectedRevision:d.revision,event:{id:`event-${i}`,title:i?'Public browser checked':'Database checked',timestamp:`2026-09-16T14:00:${seconds}Z`,status:'completed'},...(i?{status:'completed'}:{})});await s.current();}
    await expect(s.viewer.locator('.spine-card')).toHaveCount(3);await expect(s.viewer.locator('.spine-line')).toHaveCount(1);
    expect(await s.viewer.locator('[data-time-position]').evaluateAll(els=>els.map(el=>Number(el.getAttribute('data-time-position'))))).toEqual([0,.25,1]);
    const cards=await s.viewer.locator('.spine-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};}));expect(cards[1].left).toBeGreaterThan(cards[0].right);expect(cards[2].left).toBeGreaterThan(cards[1].right);await photo(s.viewer,info,'progress');
    await s.show({version:1,template:'timeline',data:{orientation:'vertical',events:[{id:'start',title:'Start',start:'2026-09-01'},{id:'span',title:'A real duration',start:'2026-09-02',end:'2026-09-04'},{id:'last',title:'Finish',start:'2026-09-05'}]}});await expect(s.viewer.locator('.spine-vertical .spine-line')).toHaveCount(1);await expect(s.viewer.locator('.spine-duration')).toHaveCount(1);await photo(s.viewer,info,'timeline');
    const raw='  opening line\n\tERROR original 9007199254740993.001\n  after the error\nnext page\n';
    const original=await s.show({version:1,template:'log',data:{source:'Exact application log',raw,startLine:101,pageSize:3}});await expect(s.viewer.locator('.log-line pre')).toHaveText(['  opening line','\tERROR original 9007199254740993.001','  after the error'],{useInnerText:false});
    await s.nav({action:'search',query:'ERROR'});await expect(s.viewer.locator('.log-line')).toHaveCount(3);await s.viewer.getByRole('button',{name:'Inspect log line 102'}).click();
    await expect.poll(async()=>{const result=await s.call('kanvas_inspect','interactions.read',{sessionId:s.sessionId});return JSON.stringify(result);}).toContain('9007199254740993.001');
    expect((await s.current()).view).toEqual(original.view);await photo(s.viewer,info,'log');await s.viewer.getByRole('navigation',{name:'Log pagination'}).getByRole('button',{name:'Next'}).click();await expect(s.viewer.getByRole('button',{name:'Inspect log line 104'})).toBeVisible();
  }finally{await s.client.close();}
});

test('overview displays responsive retained previews and website grid offers labelled static fallback without claiming remote verification',async({page,baseURL,context},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    for(let i=1;i<=4;i++)await s.show({version:1,template:'fact',title:`Retained view ${i}`,data:{text:`Exact content ${i}`}});
    await s.show({version:1,template:'overview',data:{showPreviews:true,showMetadata:true}});await expect(s.viewer.locator('.retained-overview-grid>article')).toHaveCount(4);
    const geometry=await s.viewer.locator('.retained-overview-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,rows:getComputedStyle(el).gridTemplateRows.split(' ').length,height:el.getBoundingClientRect().height,viewport:innerHeight}));expect(geometry.columns).toBeGreaterThanOrEqual(1);expect(geometry.rows).toBe(Math.ceil(4/geometry.columns));expect(geometry.height).toBeGreaterThan(geometry.viewport*.6);
    await expect(s.viewer.locator('.overview-card-caption')).toHaveCount(4);await expect(s.viewer.getByRole('checkbox',{name:'Show overview metadata'})).toHaveCount(0);await s.show({version:1,template:'overview',data:{showPreviews:true,showMetadata:false}});await expect(s.viewer.locator('.overview-card-caption>span,.overview-card-caption>time')).toHaveCount(0);await expect(s.viewer.locator('.retained-preview')).toHaveCount(4);await photo(s.viewer,info,'overview');
    await context.route('https://example.com/grid-fixture/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><h1>Public grid page ${new URL(route.request().url()).pathname.split('/').at(-1)}</h1>`}));
    // Browser UX fixture. Enforced-policy detection and an actual isolated
    // Chromium capture are tested separately in core/website-preview.test.ts.
    await context.route('**/website-preview',route=>route.fulfill({json:{data:route.request().postDataJSON().page===2?{status:'static',imageUrl:'/test-static-preview.svg',capturedAt:'2026-09-16T14:00:00Z',remoteContentVerified:false,reason:'The publisher blocks framing; showing an anonymous static screenshot.'}:{status:'interactive',remoteContentVerified:false}}}));
    await context.route('**/test-static-preview.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><rect width="720" height="480" fill="#123"/><text x="30" y="80" fill="white" font-size="28">Static public page fixture</text></svg>'}));
    const original=await s.show({version:1,template:'iframe',data:{layout:'grid',pages:Array.from({length:4},(_,i)=>({title:`Website ${i+1}`,url:`https://example.com/grid-fixture/${i+1}`}))}});await expect(s.viewer.locator('.iframe-cell')).toHaveCount(4);await expect(s.viewer.locator('.iframe-grid')).toBeVisible();await expect(s.viewer.locator('.iframe-static')).toContainText('not interactive');await expect(s.viewer.locator('.iframe-static img')).toBeVisible();expect(original.remoteContent?.verified).toBe(false);await photo(s.viewer,info,'website-grid');
    await expect(s.viewer.getByRole('navigation',{name:'Website navigation'})).toHaveCount(0);const paged=await s.show({...original.view!,data:{...original.view!.data,layout:'paged'}});await expect(s.viewer.locator('.iframe-cell')).toHaveCount(1);await s.nav({action:'page',page:2});await expect(s.viewer.frameLocator('.iframe-stage iframe').getByRole('heading',{name:'Public grid page 2'})).toBeVisible();expect((await s.current()).view).toEqual(paged.view);
  }finally{await s.client.close();}
});

test('named requests still need approval while actual signed-in and paired connections drive owner notices and counts',async({page,baseURL,browser},info)=>{
  const s=await setup(page,info,baseURL!),guestContext=await isolatedContext(browser,info,baseURL!),guest=await guestContext.newPage();
  try{
    await s.show({version:1,template:'fact',data:{text:'Private receiving source'}});
    const address=await s.call('kanvas_session','address.get',{sessionId:s.sessionId,displayId:s.display.id});expect(/\/s\/[abcdefghjkmnpqrstuvwxyz23456789]{4}$/.test(address.shortUrl??address.url??address.viewerUrl)).toBe(true);
    const viewers=()=>s.call<any[]>('kanvas_inspect','viewers.read',{sessionId:s.sessionId,displayId:s.display.id});await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(1);
    await guest.goto(viewerPath(s.sessionId,s.display.id));await guest.getByRole('button',{name:'Pair this screen'}).click();await expect(guest.getByRole('button',{name:'Add my name'})).toBeVisible();await guest.getByLabel('Your name (optional)').fill('Invited reading screen');await expect(guest.getByLabel('Your name (optional)')).toHaveValue('Invited reading screen');const nameSaved=guest.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/details'));await guest.getByRole('button',{name:'Add my name'}).click();const named=await nameSaved;expect(named.status()).toBe(200);expect((await named.json()).data.selfName).toBe('Invited reading screen');await expect(guest.getByText('Private receiving source',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('complementary',{name:'Connection notifications'})).toContainText('request');
    await tab(page,'People & access');const request=page.locator('.sharing-requests article').filter({hasText:'Invited reading screen'});await expect(request).toContainText('self-identified');await expect(request).toContainText(/Chrome|Chromium|Safari/);await request.getByRole('button',{name:'Approve view only',exact:true}).click();
    await expect(guest.locator('.viewer-shell')).toBeVisible();await expect(guest.getByText('Private receiving source',{exact:true})).toBeVisible();await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(2);
    await expect(page.getByRole('region',{name:'Active viewers'})).toContainText('2 connected');expect((await viewers()).filter(v=>v.connected).map(v=>v.connectionMethod).sort()).toEqual(['account','paired']);
    await guest.close();await expect.poll(async()=>(await viewers()).filter(v=>v.connected).length).toBe(1);await expect(page.getByRole('complementary',{name:'Connection notifications'})).toContainText('disconnected');
  }finally{await guestContext.close();await s.client.close();}
});
