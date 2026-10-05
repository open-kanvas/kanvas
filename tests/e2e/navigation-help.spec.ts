import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Page, TestInfo } from '@playwright/test';
import { TEMPLATE_IDS, type ViewSpec, type SessionConfig } from '../../src/shared/types';
import { samples } from '../../src/shared/template-examples';
import { createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionApi, sessionDetail, tab, test, waitForDisplay } from './support';

async function setup(page:Page,info:TestInfo,baseURL:string){
  await register(page);const sessionId=await createSession(page,'Navigation and Help acceptance'),display=await createDisplay(page,sessionId,'Shared source'),viewer=await openViewer(page,sessionId,display.id);
  const issued=await sessionApi<{token:string}>(page,'/api/tokens','POST',{name:'Disposable navigation checks',scopes:['read','publish'],sessionIds:[sessionId]});expect(issued.status).toBe(201);
  const headers={Authorization:`Bearer ${issued.data!.token}`};
  const client=info.project.name.startsWith('phone')?new LegacyClient({name:'navigation-legacy',version:'1'}):new Client({name:'navigation-current',version:'1'});
  if(client instanceof LegacyClient)await client.connect(new LegacyTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));else await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',baseURL),{requestInit:{headers}}));
  const call=async<T=any>(tool:string,operation:string,args:Record<string,unknown>={})=>{const result=await client.callTool(operationRequest({name:tool,arguments:{operation,...args}}));expect(result.isError,`${tool} ${operation} succeeds`).not.toBe(true);return (result.structuredContent as {data:T}).data;};
  const current=()=>waitForDisplay(page,sessionId,display.id,d=>d.revision>0&&d.appliedRevision===d.revision);
  const show=async(view:ViewSpec)=>{await publishPrepared(page,sessionId,[display.id],view);return current();};
  const nav=async(navigation:unknown,viewerId?:string)=>{const d=await current();return call('kanvas_control','navigation.control',{sessionId,displayId:display.id,requestId:randomUUID(),expectedRevision:d.revision,navigation,...(viewerId?{viewerId}:{})});};
  const configure=async(config:Partial<SessionConfig>)=>{const detail=await sessionDetail(page,sessionId);const response=await sessionApi(page,`/api/sessions/${sessionId}/config`,'PATCH',{expectedRevision:detail.session.configRevision,config});expect(response.status).toBe(200);};
  return {sessionId,display,viewer,client,call,current,show,nav,configure};
}
async function photo(viewer:Page,info:TestInfo,name:string){await mkdir(info.outputPath('visuals'),{recursive:true});await viewer.screenshot({path:`${info.outputPath('visuals')}/${info.project.name}-${name}.png`,animations:'disabled'});}
async function expectListMarkersInside(viewer:Page){
  const positions=await viewer.locator('.plain-list-scroll').evaluate(root=>{
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!,edge=root.getBoundingClientRect().left;
    return [...root.querySelectorAll<HTMLLIElement>('ol>li')].map(item=>{
      context.font=getComputedStyle(item).font;
      return {value:item.value,left:item.getBoundingClientRect().left-context.measureText(`${item.value}. `).width,edge};
    });
  });
  for(const marker of positions)expect(marker.left,`The complete ${marker.value}. marker fits within the scroll surface`).toBeGreaterThanOrEqual(marker.edge);
}
const table:ViewSpec={version:1,template:'table',data:{columns:['Item','Exact amount'],pageSize:10,rows:Array.from({length:51},(_,i)=>({Item:`Item ${i+1}`,'Exact amount':`12345678901234567890.${String(i).padStart(4,'0')}`}))}};

test('table browsing is independent, shared or presenter-led without editing the source or history',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!),other=await openViewer(page,s.sessionId,s.display.id),pager=(p:Page)=>p.getByRole('navigation',{name:'Table pagination'});
  try{
    const original=await s.show(table);await expect(pager(s.viewer)).toContainText('1–10 of 51');await expect(pager(other)).toContainText('1–10 of 51');
    await pager(s.viewer).getByRole('button',{name:'Next'}).click();await expect(pager(s.viewer)).toContainText('11–20 of 51');await expect(pager(other)).toContainText('1–10 of 51');
    await s.nav({action:'page',page:6});await expect(s.viewer.locator('tbody')).toContainText('Item 51');await expect(other.locator('tbody')).toContainText('Item 51');
    await expect.poll(async()=>{const result=await s.call('kanvas_inspect','navigation.read',{sessionId:s.sessionId,displayId:s.display.id});return result.viewers.filter((v:any)=>v.status==='applied').length;}).toBe(2);
    await s.configure({syncMode:'shared'});await expect(s.viewer.locator('.browsing-root')).toHaveAttribute('data-navigation-mode','shared');await pager(other).getByRole('button',{name:'Previous'}).click();await expect(pager(s.viewer)).toContainText('41–50 of 51');await expect(pager(other)).toContainText('41–50 of 51');
    const presenter=await s.viewer.locator('.browsing-root').getAttribute('data-navigation-viewer');expect(presenter).toBeTruthy();
    await s.configure({syncMode:'presenter',presenterViewerId:presenter!});await expect(pager(other).getByRole('button',{name:'Previous'})).toBeDisabled();await pager(s.viewer).getByRole('button',{name:'Previous'}).click();await expect(pager(other)).toContainText('31–40 of 51');
    await s.configure({syncMode:'independent',presenterViewerId:''});await expect(pager(other).getByRole('button',{name:'Previous'})).toBeEnabled();await pager(other).getByRole('button',{name:'Previous'}).click();await expect(pager(other)).toContainText('21–30 of 51');await expect(pager(s.viewer)).toContainText('31–40 of 51');
    await s.nav({action:'search',query:'Item 51'});await expect(s.viewer.locator('tbody tr')).toHaveCount(1);await expect(other.locator('tbody')).toContainText('12345678901234567890.0050');
    const after=await s.current();expect(after.revision).toBe(original.revision);expect(after.view).toEqual(original.view);await photo(s.viewer,info,'table-search');
  }finally{await s.client.close();await other.close();}
});

test('agent scroll, section focus, highlighting and pins use real browser acknowledgements',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    const text='Opening section\n\n'+Array.from({length:35},(_,i)=>`Paragraph ${i+1}. The original exact value is 123.4500. Keep the full supplied prose readable.`).join('\n\n')+'\n\nFinal section\n\nThe final supplied statement.';
    const start=text.indexOf('Final section'),original=await s.show({version:1,template:'document',data:{text,layout:'reading',headings:[{start:0,end:15,level:2},{start,end:start+13,level:2}]}}),reader=s.viewer.getByRole('region',{name:'Document reader'});
    const pin=await s.call('kanvas_control','pin.save',{sessionId:s.sessionId,displayId:s.display.id,requestId:randomUUID(),label:'Original document'});
    await s.nav({action:'scroll',y:1});await expect(s.viewer.getByText('The final supplied statement.',{exact:true})).toBeInViewport();
    await s.nav({action:'search',query:'Paragraph 20'});await expect.poll(()=>s.viewer.evaluate(()=>((CSS as any).highlights?.get('kanvas-search')?.size??0))).toBeGreaterThan(0);
    await s.nav({action:'focus',text:'Final section',zoom:1});await expect(s.viewer.getByRole('heading',{name:'Final section'})).toBeInViewport();
    await s.nav({action:'highlight',text:'The final supplied statement.'});await expect.poll(()=>s.viewer.evaluate(()=>((CSS as any).highlights?.get('kanvas-highlight')?.size??0))).toBeGreaterThan(0);await expect(s.viewer.getByRole('heading',{name:'Final section'})).toBeInViewport();
    await s.nav({action:'focus',region:{x:0,y:.75,width:1,height:.25},zoom:2});await expect(s.viewer.locator('.render-surface')).toHaveCSS('transform',/matrix\(2,/);await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);await s.nav({action:'reset'});await expect(s.viewer.locator('.render-surface')).toHaveCSS('transform','none');
    expect((await s.current()).revision).toBe(original.revision);
    await s.show({version:1,template:'fact',data:{text:'A separate later view'}});const before=await s.current();
    const receipt=await s.call('kanvas_control','pin.recall',{sessionId:s.sessionId,displayId:s.display.id,pinId:pin.id,requestId:'recall-original',expectedRevision:before.revision});await s.current();await expect(s.viewer.locator('.document-article')).toContainText('The final supplied statement.');
    const restored=await s.current();expect(restored.revision).toBe(before.revision+1);expect(restored.view?.data.text).toBe(text);
    const retry=await s.call('kanvas_control','pin.recall',{sessionId:s.sessionId,displayId:s.display.id,pinId:pin.id,requestId:'recall-original',expectedRevision:before.revision});expect(retry.id).toBe(receipt.id);expect((await s.current()).revision).toBe(restored.revision);await photo(s.viewer,info,'document-recalled');
  }finally{await s.client.close();}
});

test('late within-view input cannot navigate a replacement view or leave a stale error on it',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!),path=`/api/sessions/${s.sessionId}/displays/${s.display.id}/navigation`;
  let release=()=>{},arrive=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;}),arrived=new Promise<void>(resolve=>{arrive=resolve;});
  const revisions:number[]=[];
  try{
    const original=await s.show(table);
    await s.viewer.route(`**${path}`,async route=>{
      if(route.request().method()!=='POST')return route.continue();
      revisions.push(route.request().postDataJSON().expectedRevision);
      if(revisions.length===1){arrive();await gate;}
      await route.continue();
    });
    await s.viewer.getByRole('navigation',{name:'Table pagination'}).getByRole('button',{name:'Next'}).click();await arrived;
    const replacement=await s.show({version:1,template:'fact',data:{text:'A newer supplied view must stay unchanged.'}});
    const response=s.viewer.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='POST');release();
    const rejected=await response;expect(rejected.status()).toBe(409);expect((await rejected.json()).error.code).toBe('REVISION_CONFLICT');
    const cue=await s.nav({action:'reset'});
    await expect.poll(async()=>{const state=await s.call('kanvas_inspect','navigation.read',{sessionId:s.sessionId,displayId:s.display.id});return state.commandId===cue.commandId&&state.viewers.some((v:any)=>v.status==='applied');}).toBe(true);
    await expect(s.viewer.locator('.fact-text')).toHaveText('A newer supplied view must stay unchanged.');await expect(s.viewer.getByLabel('Dismiss navigation error')).toHaveCount(0);
    const current=await s.current();expect(current.revision).toBe(replacement.revision);expect(current.view).toEqual(replacement.view);expect(revisions).toEqual([original.revision]);
  }finally{release();await s.client.close();}
});

test('lists and four-vendor comparisons retain exact attributes and full URLs at phone width',async({page,baseURL},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    await s.show({version:1,template:'list',data:{ordered:true,start:3,pageSize:10,items:Array.from({length:25},(_,i)=>({text:`Supplied item ${i+1}`,detail:'Exact note 123.4500'}))}});await expect(s.viewer.locator('.plain-list li')).toHaveCount(10);await expect(s.viewer.getByRole('checkbox')).toHaveCount(0);await s.nav({action:'page',page:3});await expect(s.viewer.locator('.plain-list li').first()).toHaveAttribute('value','23');await expectListMarkersInside(s.viewer);await photo(s.viewer,info,'list');
    await s.show({version:1,template:'list',data:{ordered:true,start:999995,items:Array.from({length:10},(_,i)=>`Supplied entry ${i+1}`)}});await expect(s.viewer.locator('.plain-list li').last()).toHaveAttribute('value','1000004');await expectListMarkersInside(s.viewer);await photo(s.viewer,info,'list-long-numbers');
    await s.show({version:1,template:'list',data:{items:['Original first bullet','Original second bullet']}});await expect(s.viewer.locator('.plain-list-scroll ul>li')).toHaveText(['Original first bullet','Original second bullet']);await expect(s.viewer.getByRole('checkbox')).toHaveCount(0);
    const urls=Array.from({length:4},(_,i)=>`https://example.com/vendor-${i+1}/adidas-samba-original-product-with-a-long-readable-address?size=EU42&currency=${i===1?'EUR':'NOK'}`);
    const original=await s.show({version:1,template:'product',data:{name:'Samba OG — supplied offers',layout:'comparison',attributes:[{key:'sizes',label:'Sizes'},{key:'price',label:'Price'},{key:'available',label:'Available now'},{key:'shippingCost',label:'Shipping'}],offers:urls.map((url,i)=>({vendor:`Vendor ${i+1}`,price:i===1?'EUR 119.00':'NOK 1,499.00',url,...(i===0?{sizes:'EU 42 only',shippingCost:'NOK 49, Norway only',attributes:{available:false}}:i===1?{attributes:{available:true},restrictions:'Sweden delivery only'}:{})}))}});
    const region=s.viewer.getByRole('region',{name:'Vendor comparison'});await expect(region.locator('thead th')).toHaveCount(5);await expect(region.locator('tbody th')).toHaveText(['Price','Availability','Sizes','Shipping','Available now','Shipping','Product page','Restrictions']);await expect(region.getByRole('row').filter({hasText:'Available now'})).toContainText('No');await expect(region).toContainText('Not supplied');
    for(let i=0;i<4;i++){const link=region.getByRole('link',{name:urls[i],exact:true});await expect(link).toHaveAttribute('href',urls[i]);expect(await link.evaluate(el=>getComputedStyle(el).textOverflow)).not.toBe('ellipsis');expect(await link.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);}
    await s.nav({action:'scroll',x:1,y:1});await expect.poll(()=>region.evaluate(el=>el.scrollLeft+el.clientWidth>=el.scrollWidth-2)).toBe(true);await expect(region.locator('thead th').last()).toBeInViewport();expect((await s.current()).view).toEqual(original.view);await photo(s.viewer,info,'comparison');
    await s.show({...samples.product, data:{...samples.product.data,layout:'compact'}});await expect(s.viewer.locator('.product-offers article').first()).toBeVisible();
  }finally{await s.client.close();}
});

test('iframe pages switch without publication and do not confuse a frame event with verified content',async({page,baseURL,context,browser},info)=>{
  const s=await setup(page,info,baseURL!);let loads=0;
  await context.route('https://example.com/kanvas-embed/**',route=>{loads++;return route.fulfill({status:200,contentType:'text/html',headers:{'Content-Security-Policy':'frame-ancestors *'},body:`<!doctype html><title>Supplied website</title><h1>Public page ${new URL(route.request().url()).pathname.split('/').at(-1)}</h1><p>Original website content.</p>`});});
  try{
    // This browser-only fixture exercises interactive paging and enforced frame refusal.
    // Server capture has separate coverage; do not probe these synthetic URLs from the server.
    const original=await s.show({version:1,template:'iframe',data:{layout:'paged',pages:Array.from({length:16},(_,i)=>({url:`https://example.com/kanvas-embed/${i+1}`,title:`Page ${i+1}`})),index:0,screenshotFallback:false}});
    await expect(s.viewer.frameLocator('.iframe-stage iframe').getByRole('heading',{name:'Public page 1'})).toBeVisible();expect(loads).toBe(1);expect(original.remoteContent?.verified).toBe(false);await expect(s.viewer.locator('.iframe-cell [role="status"]')).toContainText('Remote content remains unverified');
    await s.nav({action:'page',page:16});await expect(s.viewer.frameLocator('.iframe-stage iframe').getByRole('heading',{name:'Public page 16'})).toBeVisible();await expect(s.viewer.getByRole('navigation',{name:'Website navigation'})).toHaveCount(0);await s.nav({action:'page',page:15});await expect(s.viewer.frameLocator('.iframe-stage iframe').getByRole('heading',{name:'Public page 15'})).toBeVisible();expect(loads).toBe(3);
    await expect(s.viewer.locator('.iframe-stage iframe')).not.toHaveAttribute('sandbox',/allow-same-origin|allow-top-navigation/);expect((await s.current()).revision).toBe(original.revision);expect((await s.current()).view).toEqual(original.view);await photo(s.viewer,info,'iframe');
    // A separate authenticated receiver deliberately encounters a publisher's real CSP boundary.
    // Record that expected browser refusal explicitly, without relaxing normal diagnostics.
    const location=s.viewer.url();await s.viewer.close();
    const isolated=await browser.newContext({storageState:await context.storageState(),viewport:info.project.use.viewport});
    const blocked=await isolated.newPage(),exceptions:string[]=[],unexpected:string[]=[];let refused=0;
    blocked.on('pageerror',error=>exceptions.push(error.message));blocked.on('console',message=>{if(message.type()!=='error')return;if(/frame-ancestors 'none'/.test(message.text()))refused++;else unexpected.push(message.text());});
    await isolated.route('https://example.com/kanvas-blocked',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"frame-ancestors 'none'"},body:'<!doctype html><h1>Forbidden framed content</h1>'}));
    try{await publishPrepared(page,s.sessionId,[s.display.id],{version:1,template:'iframe',data:{pages:[{url:'https://example.com/kanvas-blocked',title:'Publisher refuses embedding'}],screenshotFallback:false}});
      await blocked.goto(location);await expect(blocked.locator('.viewer-shell')).toBeVisible();const entry=await s.current();
      await expect.poll(()=>refused).toBeGreaterThan(0);await expect(blocked.frameLocator('.iframe-stage iframe').getByText('Forbidden framed content')).not.toBeVisible();
      await expect(blocked.locator('.iframe-stage iframe')).toHaveAttribute('src','https://example.com/kanvas-blocked');await expect(blocked.getByRole('navigation',{name:'Website navigation'})).toHaveCount(0);expect(entry.remoteContent?.verified).toBe(false);expect(exceptions).toEqual([]);expect(unexpected).toEqual([]);
    }finally{await isolated.close();}

  }finally{await s.client.close();}
});

test('regional settings format display values and focused Help stays public and non-publishing',async({page,baseURL,context},info)=>{
  const s=await setup(page,info,baseURL!);
  try{
    await s.show({version:1,template:'number',data:{value:1234.5}});await tab(page,'Settings');await page.getByLabel('Number locale',{exact:true}).fill('nb-NO');await page.getByRole('group',{name:'Weather units',exact:true}).getByRole('radio',{name:'Metric · Celsius',exact:true}).check();await page.getByRole('group',{name:'Date format',exact:true}).getByRole('radio',{name:'Day/month/year',exact:true}).check();await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await expect.poll(async()=>await s.viewer.locator('.number-value').innerText()).toMatch(/1\s234,5/);
    await s.show({version:1,template:'weather',data:{place:'Supplied observations',temperature:'68°F',high:'77°F',low:'50°F',condition:'clear'}});await expect(s.viewer.locator('.weather-temperature')).toContainText('20');await expect(s.viewer.locator('.weather-temperature')).toContainText('°C');expect((await s.current()).view?.data.temperature).toBe('68°F');await photo(s.viewer,info,'weather-regional');
    await s.show(samples.schedule);await expect(s.viewer.locator('h2 time').first()).toHaveText('09/09/2026');
    const before=await s.current(),help=await s.call('kanvas_inspect','help.read',{topic:'navigation',sessionId:s.sessionId,displayId:s.display.id});expect(help.published).toBe(false);expect(help.docs.primary).toBe(`${baseURL}/docs/`);
    const docs=await context.newPage();await docs.goto(help.docs.topic);await expect(docs.getByRole('heading',{name:'Navigate, restore history and autoplay prepared views'})).toBeVisible();await docs.getByRole('link',{name:'Recover from a failed call',exact:true}).click();await expect(docs.getByRole('heading',{name:'Recover from a failed call'})).toBeVisible();
    const md=await docs.request.get(help.docs.markdown);expect(md.ok()).toBe(true);expect(await md.text()).toContain('navigation.control');const index=await (await docs.request.get(help.docs.index)).json();expect(index.templates.map((entry:any)=>entry.template).sort()).toEqual([...TEMPLATE_IDS].sort());expect(index.templates.some((x:any)=>x.template==='web')).toBe(false);expect((await s.current()).revision).toBe(before.revision);await docs.close();
  }finally{await s.client.close();}
});
