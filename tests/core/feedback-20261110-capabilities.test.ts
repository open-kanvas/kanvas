import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {samples} from '../../src/shared/template-examples.js';
import {projectTasks} from '../../src/shared/task-list.js';
import {STREAM_BURST,STREAM_EVENT_BYTES,STREAM_MAX_EVENTS} from '../../src/server/monitor-streams.js';
import {sanitizeSvg,iconifyBase,readCapped,PICKER_CACHE_BYTES,PICKER_ICON_BYTES,PICKER_FONT_BYTES} from '../../src/server/pickers.js';
import {precachePickers} from '../../scripts/picker-precache.js';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FONT_FAMILIES,ICON_SETS,iconUrl,iconId,fontUrl} from '../../src/shared/pickers.js';
import {colourTokens,contrastGrade,contrastRatio,harmonies,hexToOklch,namedColours,NAMED_GROUPS,oklchToHex,resolveColour,roleSteps,seedTheme,shadeGrid,variations} from '../../src/shared/colour.js';
import {CSS_NAMED,OPEN_COLOR,RADIX_DARK,RADIX_LIGHT,TAILWIND} from '../../src/shared/colour-palettes.js';
import {jsonPathLine,prettyJson,jsonDataSchema} from '../../src/shared/connection-views.js';
import {HUMAN_INVITATION} from '../../src/shared/philosophy.js';
import {safeError} from '../../src/server/mcp/results.js';
import {recordHttpOperation} from '../../src/server/raw-events.js';

describe('e2ba79e1 task list: saved state, narrow operations, stable numbers',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string},listId:string;
 const detail='Original section of the release email. '.repeat(40);
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};
  const published=await o.submit(s,[d],{version:1,template:'task-list',title:'Release',data:{statusPalette:'testing',columns:[{key:'owner',label:'Owner'}],items:[{title:'Sign in',status:'passed',tags:['auth'],detail,source:'Release email, section 1'},{title:'Tick one item',status:'testing',tags:['checklist'],fields:{owner:'Ada'}},{title:'Dismiss a toast',status:'untested',tags:['toast']},{title:'Reopen the app',status:'untested',tags:['auth']}]}} as never);
  expect(published.update.status).toBe('prepared');listId=String(published.detail.displays[0].view!.data.taskListId);});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={})=>h.runtime.service.execute(name,args,p) as Promise<any>;
 const update=(args:Record<string,unknown>)=>call('kanvas_tasklist_update',{sessionId:s,taskListId:listId,requestId:randomUUID(),...args});
 const shown=async()=>(await o.detail(s)).displays.find(x=>x.id===d)!.view!.data as {items:{id:string;number:number;title:string;checked:boolean;detail?:string;hasDetail?:boolean}[];highlight?:string};
 it('numbers are assigned once and stay with the item; the display carries detail only for the highlighted item',async()=>{
  const view=await shown();expect(view.items.map(item=>item.number)).toEqual([1,2,3,4]);expect(view.items[0]).toMatchObject({id:'t1',hasDetail:true});expect(view.items[0].detail).toBeUndefined();
  const marked=await update({highlight:1});expect(marked.highlight).toEqual({id:'t1',number:1});
  expect((await shown()).items[0].detail).toBe(detail);
  // The agent reads one item back in full instead of re-fetching the source.
  const one=await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId,item:1});expect(one.item).toMatchObject({number:1,title:'Sign in',detail,source:'Release email, section 1'});
  expect((await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId,item:'t2'})).item.fields).toEqual({owner:'Ada'});
 });
 it('single-item operations touch only what they name and report it; nothing is deleted by omission',async()=>{
  const result=await update({expectedRevision:0,check:[2],items:[{item:3,status:'passed',tags:['toast','done']}],add:[{title:'New finding',status:'untested'}]});
  expect(result).toMatchObject({revision:1,changes:{added:[5],changed:[3],checked:[2],removed:[],unchecked:[]},counts:{total:5,open:4,done:1}});
  const rows=(await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId})).items;
  expect(rows.map((r:{number:number})=>r.number)).toEqual([1,3,4,5,2]);expect(rows.at(-1)).toMatchObject({number:2,checked:true});
  expect(rows.find((r:{number:number})=>r.number===1)).toMatchObject({title:'Sign in',status:'passed',hasDetail:true});
  const removed=await update({remove:[4]});expect(removed.changes.removed).toEqual([4]);
  const added=await update({add:[{title:'After a removal'}]});expect(added.changes.added).toEqual([6]);
  let missing:unknown;try{await update({check:[99]});}catch(error){missing=error;}expect(safeError(missing).issues?.[0]).toMatchObject({path:'check[0]'});
  let stale:unknown;try{await update({expectedRevision:0,check:[1]});}catch(error){stale=error;}expect(safeError(stale)).toMatchObject({code:'REVISION_CONFLICT',currentRevision:3});
  const same={sessionId:s,taskListId:listId,requestId:'retry-1',check:[1]};const first=await call('kanvas_tasklist_update',same);expect((await call('kanvas_tasklist_update',same)).revision).toBe(first.revision);
 });
 it('sort and filter run on stored data, deterministically, on the server and for the display',async()=>{
  await update({filter:{status:['UNTESTED']},sort:{by:'title',direction:'desc'}});
  const filtered=await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId});
  expect(filtered.items.map((r:{title:string})=>r.title)).toEqual(['Reopen the app','Dismiss a toast']);expect(filtered.counts).toMatchObject({total:4,matching:2,hiddenByFilter:2});
  const view=await shown();expect(projectTasks(view.items as never,view as never).items.map(item=>item.title)).toEqual(['Reopen the app','Dismiss a toast']);
  expect((await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId,tags:['auth'],sort:{by:'number',direction:'asc'}})).items.map((r:{number:number})=>r.number)).toEqual([1,4]);
  await update({filter:null,sort:null});expect((await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId})).items).toHaveLength(4);
  expect(projectTasks([{title:'b',checked:true,number:1},{title:'a',checked:false,number:2}] as never,{doneLast:true}).items.map(item=>item.number)).toEqual([2,1]);
 });
 it('own columns filter like status and tags: column=value, alternatives within a column, every column must match; own status colours are validated',async()=>{
  await update({items:[{item:3,fields:{owner:'Bo'}},{item:4,fields:{owner:'ada'}}]});
  await update({filter:{fields:['owner=ADA']}});
  expect((await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId})).items.map((r:{number:number})=>r.number)).toEqual([2,4]);
  await update({filter:{fields:['owner=Ada','owner = Bo'],status:['untested']}});
  const filtered=await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId});expect(filtered.items.map((r:{number:number})=>r.number)).toEqual([3,4]);expect(filtered.counts).toMatchObject({matching:2,hiddenByFilter:2});
  const view=await shown() as never as {items:never[];filter:never};expect(projectTasks(view.items,view).items.map((item:{number:number})=>item.number)).toEqual([3,4]);
  let bad:unknown;try{await update({filter:{fields:['owner']}});}catch(error){bad=error;}expect(bad).toBeTruthy();
  await update({filter:null});expect((await call('kanvas_tasklist_read',{sessionId:s,taskListId:listId})).items).toHaveLength(4);
  const list=(colors:Record<string,string>)=>validateView({template:'task-list',data:{colors,items:[{title:'One',status:'waiting'}]}} as never);
  expect((list({waiting:'#d9a441',Shipped:'#4caf7d'}).data as {colors:unknown}).colors).toEqual({waiting:'#d9a441',Shipped:'#4caf7d'});
  for(const wrong of [{waiting:'orange'},{'':'#000000'},{['x'.repeat(41)]:'#000000'},Object.fromEntries(Array.from({length:17},(_,i)=>[`s${i}`,'#000000']))])expect(()=>list(wrong),JSON.stringify(wrong).slice(0,60)).toThrow();
 });
 it('survives clearing the display, re-shows on another display, and stays inside its session',async()=>{
  await o.submit(s,[d],{version:1,template:'fact',data:{text:'Something else'}} as never);
  const second=(await o.display(s,'Second')).id;
  const result=await call('kanvas_tasklist_show',{sessionId:s,taskListId:listId,displayId:second,requestId:randomUUID()});expect(result.status).toBe('prepared');
  expect((await o.detail(s)).displays.find(x=>x.id===second)!.view!.data.taskListId).toBe(listId);
  await update({check:[1]});
  expect(((await o.detail(s)).displays.find(x=>x.id===second)!.view!.data.items as {number:number;checked:boolean}[]).find(item=>item.number===1)!.checked).toBe(true);
  expect((await o.detail(s)).displays.find(x=>x.id===d)!.view!.template).toBe('fact');
  const other=await h.account(),otherSession=(await other.session()).id;
  await expect(h.runtime.service.execute('kanvas_tasklist_read',{sessionId:otherSession,taskListId:listId},{userId:other.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(h.runtime.service.execute('kanvas_tasklist_read',{sessionId:s,taskListId:listId},{userId:other.user!.id})).rejects.toBeTruthy();
  expect((await call('kanvas_tasklist_read',{sessionId:s})).taskLists).toEqual([expect.objectContaining({id:listId,items:4,done:1})]);
 });
});

describe('f4373691 monitor streams: write-only, capped, short-lived',()=>{
 let h:Harness,o:Browser,s:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={},principal=p)=>h.runtime.service.execute(name,args,principal) as Promise<any>;
 const post=(url:string,body:string,type='application/json')=>fetch(url,{method:'POST',headers:{host:'127.0.0.1','content-type':type},body});
 const created=async(args:Record<string,unknown>={})=>{const stream=await call('kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:randomUUID(),...args});return {stream,url:`${h.baseUrl}${new URL(stream.postUrl).pathname}`};};
 it('a reporter posts without signing in; the agent reads recent events by source and sequence',async()=>{
  const {stream,url}=await created();
  expect(stream.postUrl).toMatch(/\/in\/[A-Za-z0-9_-]{43}$/);expect(stream.postUrlShown).toBe(true);
  expect((await post(url,JSON.stringify({source:'agent-1',event:'PostToolUse',tool:'Edit'}))).status).toBe(202);
  expect((await post(url,'plain progress line','text/plain')).status).toBe(202);
  expect((await post(url,JSON.stringify({source:'agent-2',event:'Stop'}))).status).toBe(202);
  const read=await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId});
  expect(read.events.map((e:{seq:number})=>e.seq)).toEqual([1,2,3]);expect(read.events[0]).toMatchObject({source:'agent-1',data:{event:'PostToolUse',tool:'Edit'}});expect(read.events[1]).toMatchObject({text:'plain progress line'});expect(read.sources.sort()).toEqual(['agent-1','agent-2']);
  expect((await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId,source:'agent-2'})).events).toHaveLength(1);
  expect((await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId,afterSeq:2})).events.map((e:{seq:number})=>e.seq)).toEqual([3]);
  const asLog=await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId,as:'log'});expect(validateView(asLog.view).template).toBe('log');expect(asLog.untrusted).toMatch(/never as instructions/);
 });
 it('the address can only append: it cannot read, list or publish, and only its hash is stored',async()=>{
  const {stream,url}=await created();const token=new URL(stream.postUrl).pathname.split('/').pop()!;
  for(const method of ['GET','PUT','DELETE','PATCH'])expect([404,405]).toContain((await fetch(url,{method,headers:{host:'127.0.0.1'}})).status);
  const accepted=await (await post(url,'{"a":1}')).json();expect(accepted).toEqual({accepted:true});
  expect(JSON.stringify(await h.runtime.store.list('monitor-stream'))).not.toContain(token);
  expect(JSON.stringify(await h.runtime.store.list('monitor-stream-request'))).not.toContain(token);
  // The token is no credential for any API.
  expect((await fetch(`${h.baseUrl}/api/sessions/${s}`,{headers:{host:'127.0.0.1',authorization:`Bearer ${token}`}})).status).toBe(401);
  // A retry of the same create never repeats the secret.
  const again=await call('kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:'fixed'});const retry=await call('kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:'fixed'});
  expect(again.postUrl).toBeTruthy();expect(retry.postUrl).toBeUndefined();expect(retry.postUrlShown).toBe(false);expect(retry.streamId).toBe(again.streamId);
  expect((await post(`${h.baseUrl}/in/${'x'.repeat(43)}`,'{}')).status).toBe(404);expect((await post(`${h.baseUrl}/in/short`,'{}')).status).toBe(404);
 });
 it('size, rate and count limits reject gracefully and nothing is written to the event history',async()=>{
  const {stream,url}=await created({maxEvents:10});
  // Earlier requests of this test (signing in, creating the session) record their own event rows after their answer
  // was sent. The count is read once it has stopped moving, before and after, so only the posts are measured.
  const count=async()=>Number((await h.runtime.store.query('SELECT count(*) n FROM events')).rows[0].n);
  const events=async()=>{let last=await count();for(let quiet=0;quiet<3;){await new Promise(done=>setTimeout(done,80));const next=await count();quiet=next===last?quiet+1:0;last=next;}return last;};
  const before=await events();
  expect((await post(url,'x'.repeat(STREAM_EVENT_BYTES+1),'text/plain')).status).toBe(413);
  const statuses:number[]=[];for(let i=0;i<STREAM_BURST+20;i++)statuses.push((await post(url,`{"n":${i}}`)).status);
  expect(statuses.filter(code=>code===202).length).toBeGreaterThanOrEqual(STREAM_BURST-2);expect(statuses).toContain(429);
  const limited=await post(url,'{}');if(limited.status===429)expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  const read=await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId,limit:200});
  expect(read.buffered).toBe(10);expect(read.events).toHaveLength(10);expect(read.dropped).toBeGreaterThan(0);expect(read.rejected).toBeGreaterThan(0);expect(STREAM_MAX_EVENTS).toBe(500);
  expect(await events()).toBe(before);
  expect(recordHttpOperation('page',202,'POST /in/:token')).toBe(false);expect(recordHttpOperation('page',429,'POST /in/:token')).toBe(false);expect(recordHttpOperation('api',200,'POST /api/sessions/:id/assets')).toBe(true);
 });
 it('all streams together stay inside one process-wide bound: beyond it a post is refused, nothing grows, and ending a stream gives the room back',async()=>{
  const {stream,url}=await created(),streams=h.runtime.service.monitorStreams;
  expect((await post(url,'x'.repeat(1000))).status).toBe(202);expect(streams.bufferedBytes).toBe(1000);
  streams.totalLimit=1500;
  const refused=await post(url,'y'.repeat(1000));expect(refused.status).toBe(503);expect(refused.headers.get('retry-after')).toBe('30');expect(await refused.json()).toMatchObject({accepted:false});expect(streams.bufferedBytes).toBe(1000);
  expect((await post(url,'z'.repeat(400))).status).toBe(202);expect(streams.bufferedBytes).toBe(1400);
  await call('kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.streamId});expect(streams.bufferedBytes).toBe(0);
 });
 it('revocation and expiry stop the address and delete the buffered events; other accounts cannot read',async()=>{
  const {stream,url}=await created();await post(url,'{"a":1}');
  const other=await h.account();
  await expect(call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId},{userId:other.user!.id})).rejects.toBeTruthy();
  const otherSession=(await other.session()).id;
  await expect(call('kanvas_monitor_stream_read',{sessionId:otherSession,streamId:stream.streamId},{userId:other.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(call('kanvas_monitor_stream_revoke',{sessionId:otherSession,streamId:stream.streamId},{userId:other.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(await call('kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.streamId})).toMatchObject({revoked:true});
  expect([404,410]).toContain((await post(url,'{"a":2}')).status);
  expect((await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId})).events).toEqual([]);
  const short=await created({ttlMinutes:1});await post(short.url,'{"a":1}');
  const saved=(await h.runtime.store.get<{id:string;expiresAt:number}>('monitor-stream',short.stream.streamId))!;
  // Expire it: both the stored record and the in-memory route entry.
  await h.runtime.store.put('monitor-stream',{...saved,expiresAt:Date.now()-1});
  (h.runtime.service.monitorStreams as unknown as {byToken:Map<string,{expiresAt:number}>}).byToken.forEach(entry=>{entry.expiresAt=Date.now()-1;});
  expect((await post(short.url,'{"a":2}')).status).toBe(410);
  await (h.runtime.service.monitorStreams as unknown as {sweep():Promise<void>}).sweep();
  expect(await h.runtime.store.get('monitor-stream',short.stream.streamId)).toBeUndefined();
  expect((h.runtime.service.monitorStreams as unknown as {buffers:Map<string,unknown>}).buffers.has(short.stream.streamId)).toBe(false);
 });
});

describe('e011b35b pickers: allowlisted sources, sanitised, bounded, proxy can be off',()=>{
 let h:Harness,o:Browser,p:{userId:string};
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg>';
 const woff2=Buffer.concat([Buffer.from('wOF2','latin1'),Buffer.alloc(64)]);
 beforeEach(async()=>{h=await startHarness();o=await h.account();p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const respond=(body:string|Buffer,type:string)=>new Response(body as never,{status:200,headers:{'content-type':type}});
 it('SVG is refused when it could run, load or reference anything',()=>{
  expect(sanitizeSvg(`<!-- @license x -->\n${svg}`)).toBe(svg);
  for(const bad of ['<svg><script>alert(1)</script></svg>','<svg onload="x()"><path d=""/></svg>','<svg><a href="https://e.example"><path d=""/></a></svg>','<svg><image href="https://e.example/x.png"/></svg>','<svg><use href="#a"/></svg>','<svg><style>@import url(x)</style></svg>','<svg><path style="fill:url(https://e.example)" d=""/></svg>','<svg><foreignObject><p>x</p></foreignObject></svg>','<html></html>','<svg><path d=""/>'])expect(sanitizeSvg(bad),bad).toBeUndefined();
 });
 it('every outbound address is built from the allowlist; invalid names never leave the server',async()=>{
  const pickers=h.runtime.service.pickers,requested:string[]=[];
  pickers.fetcher=async url=>{requested.push(url);return url.endsWith('package.json')?respond(JSON.stringify({license:'OFL-1.1'}),'application/json'):url.endsWith('.woff2')?respond(woff2,'font/woff2'):respond(svg,'image/svg+xml');};
  expect((await pickers.icon('lucide','outline','settings'))?.type).toMatch(/^image\/svg\+xml/);
  expect(requested).toEqual([`https://cdn.jsdelivr.net/npm/lucide-static@${ICON_SETS.lucide.version}/icons/settings.svg`]);
  await pickers.icon('lucide','outline','settings');expect(requested).toHaveLength(1);
  for(const [set,variant,name] of [['evil','outline','x'],['lucide','outline','../../etc/passwd'],['lucide','outline','a/b'],['lucide','nope','settings'],['lucide','outline','http:example.com'],['lucide','outline','x'.repeat(80)],['lucide','outline','A%2e%2e']])expect(await pickers.icon(set,variant,name)).toBeUndefined();
  expect(requested).toHaveLength(1);
  expect((await pickers.font('inter',400))?.type).toBe('font/woff2');
  expect(requested.slice(1)).toEqual(['https://cdn.jsdelivr.net/npm/@fontsource/inter@5/package.json','https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-400-normal.woff2']);
  for(const [family,weight] of [['../x',400],['inter',450],['Inter',400],['a.b',400]] as const)expect(await pickers.font(family,weight)).toBeUndefined();
  expect(requested).toHaveLength(3);expect(requested.every(url=>url.startsWith('https://cdn.jsdelivr.net/npm/'))).toBe(true);
  expect(iconUrl({set:'lucide',name:'settings'})).toBe('/api/picker/icons/lucide/outline/settings.svg');expect(iconId({set:'phosphor',name:'gear',variant:'bold'})).toBe('phosphor:gear/bold');expect(fontUrl('lato',700)).toBe('/api/picker/fonts/lato/700.woff2');expect(fontUrl('inter',700)).toBe('/api/picker/fonts/inter/variable.woff2');
 });
 it('unsafe, oversized or mislabelled responses are not served; a closed licence is refused; the cache is bounded',async()=>{
  const pickers=h.runtime.service.pickers;
  pickers.fetcher=async()=>respond('<svg><script>1</script></svg>','image/svg+xml');expect(await pickers.icon('tabler','outline','settings')).toBeUndefined();
  pickers.fetcher=async()=>respond('x'.repeat(200_000),'image/svg+xml');expect(await pickers.icon('tabler','outline','alarm')).toBeUndefined();
  pickers.fetcher=async url=>url.endsWith('package.json')?respond(JSON.stringify({license:'Proprietary'}),'application/json'):respond(woff2,'font/woff2');expect(await pickers.font('secret-sans',400)).toBeUndefined();expect((await h.runtime.service.execute('kanvas_fonts_list',{family:'secret-sans'},p) as {available:boolean}).available).toBe(false);
  pickers.fetcher=async url=>url.endsWith('package.json')?respond(JSON.stringify({license:'OFL-1.1'}),'application/json'):respond('<html>not a font</html>','text/html');expect(await pickers.font('lato',400)).toBeUndefined();
  pickers.fetcher=async()=>{throw new Error('network down');};expect(await pickers.icon('lucide','outline','wifi')).toBeUndefined();
  expect(PICKER_CACHE_BYTES).toBeLessThanOrEqual(64*1024*1024);
 });
 it('the size limit is enforced while the body arrives: an oversized chunked answer with no length is cancelled early and the rest is never read',async()=>{
  // Parent review 2026-11-11: the limit used to be checked after the whole body had been buffered.
  const chunked=(chunks:number,chunkBytes:number,headers:Record<string,string>={},first?:Uint8Array)=>{
   const state={pulled:0,cancelled:false};
   const body=new ReadableStream<Uint8Array>({pull(controller){if(state.pulled>=chunks){controller.close();return;}const chunk=state.pulled===0&&first?first:new Uint8Array(chunkBytes).fill(120);state.pulled++;controller.enqueue(chunk);},cancel(){state.cancelled=true;}},{highWaterMark:0});
   return {state,response:new Response(body,{status:200,headers})};
  };
  // 1000 chunks of 16 KiB (16 MB) against the 64 KiB icon limit, no Content-Length.
  const big=chunked(1000,16*1024);expect(big.response.headers.get('content-length')).toBeNull();
  expect(await readCapped(big.response,PICKER_ICON_BYTES)).toBeUndefined();
  expect(big.state.cancelled).toBe(true);expect(big.state.pulled).toBeLessThanOrEqual(6);
  // A declared length that is untrue does not help either.
  const lying=chunked(1000,16*1024,{'content-length':'100'});expect(await readCapped(lying.response,PICKER_ICON_BYTES)).toBeUndefined();expect(lying.state.cancelled).toBe(true);expect(lying.state.pulled).toBeLessThanOrEqual(6);
  // A declared length above the limit is refused without reading anything.
  const declared=chunked(10,1024,{'content-length':String(PICKER_ICON_BYTES+1)});expect(await readCapped(declared.response,PICKER_ICON_BYTES)).toBeUndefined();expect(declared.state.pulled).toBe(0);expect(declared.state.cancelled).toBe(true);
  // Under the limit, chunked and without a length, the exact bytes come back; exactly at the limit is still allowed.
  const small=chunked(3,1000);const read=await readCapped(small.response,PICKER_ICON_BYTES);expect(read?.length).toBe(3000);expect(read!.every(byte=>byte===120)).toBe(true);expect(small.state.cancelled).toBe(false);
  expect((await readCapped(chunked(4,16*1024).response,PICKER_ICON_BYTES))?.length).toBe(PICKER_ICON_BYTES);expect(await readCapped(chunked(5,16*1024).response,PICKER_ICON_BYTES)).toBeUndefined();
  // Through the server's own fetch path: icon, font and catalogue requests all stop early, and a small chunked icon is served.
  const pickers=h.runtime.service.pickers as unknown as {iconify?:string;fetcher:(url:string,signal:AbortSignal)=>Promise<Response>;icon:(set:string,variant:string,name:string)=>Promise<{bytes:number}|undefined>;font:(family:string,weight:number)=>Promise<unknown>};
  let last=chunked(0,0);
  pickers.fetcher=async url=>{if(url.endsWith('package.json'))return respond(JSON.stringify({license:'OFL-1.1'}),'application/json');last=chunked(1000,16*1024);return last.response;};
  expect(await pickers.icon('lucide','outline','huge')).toBeUndefined();expect(last.state.cancelled).toBe(true);expect(last.state.pulled).toBeLessThanOrEqual(6);
  expect(await pickers.font('lato',400)).toBeUndefined();expect(last.state.cancelled).toBe(true);expect(last.state.pulled).toBeLessThanOrEqual(Math.ceil(PICKER_FONT_BYTES/(16*1024))+2);
  const encoded=new TextEncoder().encode(svg);pickers.fetcher=async()=>{last=chunked(1,encoded.length,{},encoded);return last.response;};
  expect((await pickers.icon('lucide','outline','small-chunked'))?.bytes).toBe(svg.length);expect(last.state.cancelled).toBe(false);
  // Redirects are still refused and the deadline still applies while a body trickles in.
  pickers.fetcher=async()=>Object.defineProperty(respond(svg,'image/svg+xml'),'redirected',{value:true});expect(await pickers.icon('lucide','outline','redirected')).toBeUndefined();
  pickers.fetcher=async(_url,signal)=>new Response(new ReadableStream<Uint8Array>({start(controller){signal.addEventListener('abort',()=>controller.error(new Error('aborted')));}}),{status:200});
  const controller=new AbortController();const stalled=readCapped(await pickers.fetcher('x',controller.signal),PICKER_ICON_BYTES);controller.abort();await expect(stalled).rejects.toBeTruthy();
 });
 it('with the proxy switched off nothing is fetched and the answer says why',async()=>{
  const pickers=h.runtime.service.pickers as unknown as {proxy:boolean;fetcher:(url:string)=>Promise<Response>};let fetched=0;
  pickers.proxy=false;pickers.fetcher=async()=>{fetched++;return respond(svg,'image/svg+xml');};
  expect(await h.runtime.service.pickers.icon('lucide','outline','settings')).toBeUndefined();
  const result=await h.runtime.service.execute('kanvas_icons_search',{query:'settings'},p) as {icons:unknown[];unavailableSets:string[];unavailableReason:string};
  expect(result.icons).toEqual([]);expect(result.unavailableSets).toHaveLength(5);expect(result.unavailableReason).toMatch(/disabled/);expect(fetched).toBe(0);
 });
 it('search returns exact set:name ids and a ready view; assets need a signed-in browser',async()=>{
  const pickers=h.runtime.service.pickers;
  pickers.fetcher=async url=>url.includes('data.jsdelivr.com')?respond(JSON.stringify({files:url.includes('lucide-static')?[{name:'/icons/settings.svg'},{name:'/icons/settings-2.svg'},{name:'/icons/sun.svg'}]:url.includes('heroicons')?[{name:'/24/outline/cog-6-tooth.svg'},{name:'/24/solid/cog-6-tooth.svg'}]:url.includes('tabler')?[{name:'/icons/outline/settings.svg'},{name:'/icons/filled/settings.svg'}]:[]}),'application/json'):url.endsWith('tags.json')?respond(JSON.stringify({sun:['brightness','weather']}),'application/json'):respond(svg,'image/svg+xml');
  const result=await h.runtime.service.execute('kanvas_icons_search',{query:'settings',limit:6},p) as {icons:{id:string;variants:string[];licence:string;image:string}[];view:{template:string}};
  expect(result.icons.map(icon=>icon.id).sort()).toEqual(['lucide:settings','lucide:settings-2','tabler:settings']);expect(result.icons.find(icon=>icon.id==='tabler:settings')).toMatchObject({variants:['outline','filled'],licence:'MIT',image:'/api/picker/icons/tabler/outline/settings.svg'});
  expect(validateView(result.view as never).template).toBe('icon-picker');
  expect((await h.runtime.service.execute('kanvas_icons_search',{query:'weather',sets:['lucide']},p) as {icons:{id:string}[]}).icons.map(icon=>icon.id)).toEqual(['lucide:sun']);
  const anonymous=await h.browser().raw('/api/picker/icons/lucide/outline/settings.svg');expect(anonymous.status).toBe(401);
  const served=await o.raw('/api/picker/icons/lucide/outline/settings.svg');expect(served.status).toBe(200);expect(served.headers.get('content-type')).toMatch(/^image\/svg\+xml/);expect(served.headers.get('x-content-type-options')).toBe('nosniff');expect(served.headers.get('content-security-policy')).toMatch(/default-src 'none'/);
  expect((await o.raw('/api/picker/icons/lucide/outline/..%2f..%2fsecret.svg')).status).toBe(404);
  const fonts=await h.runtime.service.execute('kanvas_fonts_list',{category:'mono'},p) as {families:{id:string;variable:boolean;weightRange?:number[]}[];view:unknown};expect(fonts.families.map(f=>f.id)).toEqual(['jetbrains-mono','fira-code','ibm-plex-mono','source-code-pro']);expect(validateView(fonts.view as never).template).toBe('font-picker');
  expect(fonts.families.map(f=>f.variable)).toEqual([true,true,false,true]);expect(fonts.families[0].weightRange).toEqual([100,800]);
 });
 it('variable fonts: one file per curated variable family from its own package; static families and unknown ids never get one',async()=>{
  const pickers=h.runtime.service.pickers,requested:string[]=[];
  pickers.fetcher=async url=>{requested.push(url);return url.endsWith('package.json')?respond(JSON.stringify({license:'OFL-1.1'}),'application/json'):respond(woff2,'font/woff2');};
  expect((await pickers.font('inter','variable'))?.type).toBe('font/woff2');
  expect(requested).toEqual(['https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5/package.json','https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5/files/inter-latin-wght-normal.woff2']);
  for(const family of ['lato','poppins','not-curated','../x'])expect(await pickers.font(family,'variable'),family).toBeUndefined();
  expect(requested).toHaveLength(2);
  expect((await o.raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(200);expect((await o.raw('/api/picker/fonts/lato/variable.woff2')).status).toBe(404);expect((await o.raw('/api/picker/fonts/inter/variable.ttf')).status).toBe(404);expect((await h.browser().raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(401);
  // 21 of the 28 curated families publish a variable edition; each range is whole hundreds inside 100 to 900.
  const variable=Object.values(FONT_FAMILIES).filter(font=>font.variable);expect(variable).toHaveLength(21);expect(Object.keys(FONT_FAMILIES)).toHaveLength(28);
  for(const font of variable){expect(font.variable![0]).toBeGreaterThanOrEqual(100);expect(font.variable![1]).toBeLessThanOrEqual(900);expect(font.weights).toEqual(Array.from({length:(font.variable![1]-font.variable![0])/100+1},(_,i)=>font.variable![0]+i*100));}
 });
 it('the wider catalogue exists only where the operator configured an Iconify API; only permissive single-colour collections are listed or served',async()=>{
  const pickers=h.runtime.service.pickers as unknown as {iconify?:string;fetcher:(url:string)=>Promise<Response>},requested:string[]=[];
  const none=await h.runtime.service.execute('kanvas_icons_search',{query:'settings',sets:['iconify']},p) as {icons:unknown[];unavailableSets:string[];unavailableReason:string};
  expect(none.icons).toEqual([]);expect(none.unavailableSets).toEqual(['iconify']);expect(none.unavailableReason).toMatch(/No Iconify API is configured/);
  expect((await o.raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(404);
  pickers.iconify='https://icons.internal.example';
  const collections={mdi:{name:'Material Design Icons',total:7447,license:{spdx:'Apache-2.0'},palette:false},carbon:{name:'Carbon',total:2000,license:{spdx:'Apache-2.0'}},'fa6-solid':{name:'Font Awesome',total:1400,license:{spdx:'CC-BY-4.0'}},noto:{name:'Noto Emoji',total:3000,license:{spdx:'Apache-2.0'},palette:true},'gpl-set':{name:'Copyleft',total:10,license:{spdx:'GPL-3.0'}},lucide:{name:'Lucide',total:1600,license:{spdx:'ISC'}},unknown:{name:'No licence',total:5}};
  pickers.fetcher=async url=>{requested.push(url);return url.endsWith('/collections')?respond(JSON.stringify(collections),'application/json'):url.includes('/search?')?respond(JSON.stringify({icons:['mdi:cog','fa6-solid:gear','noto:gear','mdi:cog-outline','gpl-set:cog','lucide:settings','unknown:cog','mdi:../../x','carbon:settings','mdi:a:b'],total:10}),'application/json'):respond(svg,'image/svg+xml');};
  const result=await h.runtime.service.execute('kanvas_icons_search',{query:'settings',sets:['iconify'],limit:10},p) as {icons:{id:string;set:string;name:string;collection:string;licence:string;image:string}[];sets:Record<string,{collections:Record<string,{licence:string}>}>;view:{template:string;data:{icons:unknown[]}}};
  expect(result.icons.map(icon=>icon.id)).toEqual(['mdi:cog','mdi:cog-outline','carbon:settings']);expect(result.icons[0]).toMatchObject({set:'iconify',name:'mdi:cog',collection:'mdi',licence:'Apache-2.0',image:'/api/picker/icons/iconify/mdi/cog.svg'});
  expect(Object.keys(result.sets.iconify.collections)).toEqual(['mdi','carbon']);expect(validateView(result.view as never).template).toBe('icon-picker');expect(result.view.data.icons[0]).toEqual({set:'iconify',name:'mdi:cog'});
  expect(requested).toEqual(['https://icons.internal.example/collections','https://icons.internal.example/search?query=settings&limit=64']);
  const narrowed=await h.runtime.service.execute('kanvas_icons_search',{query:'carbon,fa6-solid: two words'},p) as {icons:{id:string}[]};expect(narrowed.icons.map(icon=>icon.id)).toEqual(['carbon:settings']);expect(requested.at(-1)).toBe('https://icons.internal.example/search?query=two%20words&limit=64&prefixes=carbon');
  const before=requested.length;
  expect((await o.raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(200);expect(requested.slice(before)).toEqual(['https://icons.internal.example/mdi/cog.svg']);
  for(const refused of ['fa6-solid/gear','noto/gear','gpl-set/cog','lucide/settings','unknown/cog','nope/cog','mdi/..%2f..%2fx'])expect((await o.raw(`/api/picker/icons/iconify/${refused}.svg`)).status,refused).toBe(404);
  expect(requested.slice(before)).toHaveLength(1);expect((await h.browser().raw('/api/picker/icons/iconify/mdi/cog.svg')).status).toBe(401);
  pickers.fetcher=async url=>url.endsWith('.svg')?respond('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a"/></defs><path fill="url(#a)" d="M0 0"/></svg>','image/svg+xml'):respond(JSON.stringify(collections),'application/json');
  expect((await o.raw('/api/picker/icons/iconify/mdi/gradient.svg')).status).toBe(404);
  for(const [value,expected] of [['https://icons.example/',  'https://icons.example'],['http://127.0.0.1:3000/iconify/','http://127.0.0.1:3000/iconify'],['ftp://icons.example',undefined],['https://user:pw@icons.example',undefined],['https://icons.example/?x=1',undefined],['not a url',undefined],['',undefined],[undefined,undefined]] as const)expect(iconifyBase(value),String(value)).toBe(expected);
 });
 it('offline: a directory filled by the pre-cache script serves fonts, icons and search with the proxy off and no request leaves the server',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'kanvas-picker-precache-')),fetched:string[]=[];
  try{
   const report=await precachePickers({directory,icons:['lucide'],concurrency:4,fetcher:async url=>{fetched.push(url);
    if(url.includes('data.jsdelivr.com'))return respond(JSON.stringify({files:[{name:'/icons/settings.svg'},{name:'/icons/sun.svg'},{name:'/icons/unsafe.svg'},{name:'/package.json'}]}),'application/json');
    if(url.endsWith('tags.json'))return respond(JSON.stringify({sun:['weather']}),'application/json');
    if(url.endsWith('package.json'))return respond(JSON.stringify({license:url.includes('/lobster@')?'Proprietary':'OFL-1.1'}),'application/json');
    if(url.endsWith('.woff2'))return url.includes('pacifico')?respond('<html>missing</html>','text/html'):respond(woff2,'font/woff2');
    return url.endsWith('unsafe.svg')?respond('<svg><script>1</script></svg>','image/svg+xml'):respond(svg,'image/svg+xml');}});
   expect(fetched.every(url=>url.startsWith('https://cdn.jsdelivr.net/npm/')||url.startsWith('https://data.jsdelivr.com/v1/packages/npm/'))).toBe(true);
   expect(report.icons.lucide).toMatchObject({files:2,skipped:1});expect(report.fonts.families).toBe(26);expect(report.fonts.skipped.join('|')).toMatch(/lobster: no open licence declared/);expect(report.fonts.skipped.join('|')).toMatch(/pacifico 400/);
   expect(JSON.parse(await readFile(join(directory,'icons/lucide/index.json'),'utf8'))).toEqual(['icons/settings.svg','icons/sun.svg']);
   expect(await readdir(join(directory,'fonts/inter'))).toEqual(['LICENCE.txt','inter-latin-wght-normal.woff2']);expect((await readdir(join(directory,'fonts/lato'))).sort()).toEqual(['LICENCE.txt','lato-latin-100-normal.woff2','lato-latin-300-normal.woff2','lato-latin-400-normal.woff2','lato-latin-700-normal.woff2','lato-latin-900-normal.woff2']);
   const pickers=h.runtime.service.pickers as unknown as {proxy:boolean;precache?:string;fetcher:(url:string)=>Promise<Response>};let outbound=0;
   pickers.proxy=false;pickers.precache=directory;pickers.fetcher=async()=>{outbound++;return respond(svg,'image/svg+xml');};
   expect((await o.raw('/api/picker/icons/lucide/outline/settings.svg')).status).toBe(200);expect((await o.raw('/api/picker/icons/lucide/outline/unsafe.svg')).status).toBe(404);expect((await o.raw('/api/picker/icons/tabler/outline/settings.svg')).status).toBe(404);
   expect((await o.raw('/api/picker/fonts/inter/variable.woff2')).status).toBe(200);expect((await o.raw('/api/picker/fonts/lato/700.woff2')).status).toBe(200);expect((await o.raw('/api/picker/fonts/lobster/400.woff2')).status).toBe(404);
   const search=await h.runtime.service.execute('kanvas_icons_search',{query:'weather'},p) as {icons:{id:string}[];unavailableSets:string[];unavailableReason:string};
   expect(search.icons.map(icon=>icon.id)).toEqual(['lucide:sun']);expect(search.unavailableSets.sort()).toEqual(['heroicons','material','phosphor','tabler']);expect(search.unavailableReason).toMatch(/disabled/);
   expect((await h.runtime.service.execute('kanvas_fonts_list',{family:'inter'},p) as {available:boolean;licence:string;variable:boolean}).available).toBe(true);
   expect(outbound).toBe(0);
  }finally{await rm(directory,{recursive:true,force:true});}
 });
});

describe('ebebd25c colour: published values and computed colours',()=>{
 it('palette data is the published data and references resolve exactly',()=>{
  expect(Object.keys(TAILWIND)).toHaveLength(22);expect(Object.values(TAILWIND).every(shades=>shades.length===11)).toBe(true);
  expect(resolveColour('tailwind:amber-400')).toBe('#fbbf24');expect(resolveColour('tailwind:slate-950')).toBe('#020617');expect(resolveColour('radix:blue-9')).toBe('#0090ff');expect(RADIX_LIGHT.blue[0]).not.toBe(RADIX_DARK.blue[0]);
  expect(resolveColour('open-color:blue-6')).toBe('#228be6');expect(Object.keys(OPEN_COLOR)).toHaveLength(13);expect(Object.keys(CSS_NAMED)).toHaveLength(148);expect(resolveColour('RebeccaPurple')).toBe('#663399');expect(resolveColour('#ABCDEF')).toBe('#abcdef');
  for(const bad of ['tailwind:amber-450','nope','#12345','radix:unknown-9','url(x)'])expect(resolveColour(bad),bad).toBeUndefined();
 });
 it('contrast, harmony, variations and tonal scales are computed, not recalled',()=>{
  expect(contrastRatio('#000000','#ffffff')).toBeCloseTo(21,5);expect(contrastRatio('#ffffff','#ffffff')).toBeCloseTo(1,5);expect(contrastRatio('#777777','#ffffff')).toBeCloseTo(4.48,1);
  expect(contrastGrade(7.1)).toBe('AAA');expect(contrastGrade(4.5)).toBe('AA');expect(contrastGrade(3.2)).toBe('large only');expect(contrastGrade(2.9)).toBe('fail');
  for(const hex of ['#fbbf24','#0090ff','#663399','#000000','#ffffff','#7f7f7f'])expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  const base='#0090ff',groups=harmonies(base);expect(groups.map(g=>g.name)).toEqual(['Complementary','Analogous','Triadic','Split complementary','Tetradic']);
  const complement=hexToOklch(groups[0].swatches[1].hex).h,hue=hexToOklch(base).h;expect(Math.abs(((complement-hue+540)%360)-180)).toBeGreaterThan(150);
  const around=variations(base);expect(around.map(s=>s.label)).toEqual(['lighter','darker','warmer','original','cooler','muted','vivid']);expect(hexToOklch(around[0].hex).l).toBeGreaterThan(hexToOklch(base).l);expect(hexToOklch(around[1].hex).l).toBeLessThan(hexToOklch(base).l);expect(hexToOklch(around[5].hex).c).toBeLessThan(hexToOklch(base).c);
  const theme=seedTheme(base);expect(Object.keys(theme.palettes)).toEqual(['primary','secondary','tertiary','neutral','error']);expect(theme.palettes.primary[0].hex).toBe('#000000');expect(theme.palettes.primary.at(-1)!.hex).toBe('#ffffff');
  const tones=theme.palettes.primary.map(t=>hexToOklch(t.hex).l);expect([...tones].sort((a,b)=>a-b)).toEqual(tones);expect(contrastRatio(theme.light.primary,theme.light.onPrimary)).toBeGreaterThan(4.5);
  expect(seedTheme(base)).toEqual(theme);
 });
 it('every mode validates, labels are speakable, and the token list returns exact values',()=>{
  const view=(data:Record<string,unknown>)=>validateView({template:'colour',data} as never).data as never;
  expect(colourTokens(view({mode:'options',options:[{value:'tailwind:amber-400'},{value:'#4f46e5',label:'indigo'}]}))).toEqual([{name:'A',hex:'#fbbf24'},{name:'indigo',hex:'#4f46e5'}]);
  const grid=shadeGrid(view({mode:'shades',palette:'tailwind',families:['amber','sky']}));expect(grid.columns).toHaveLength(11);expect(grid.rows.map(r=>r.name)).toEqual(['amber','sky']);expect(grid.rows[0].cells[4]).toEqual({label:'amber 400',shade:'400',hex:'#fbbf24'});expect(grid.cellLabels).toBe('none');expect(shadeGrid(view({mode:'shades',palette:'tailwind',families:['amber'],hex:true})).cellLabels).toBe('hex');
  expect(shadeGrid(view({mode:'shades',palette:'tailwind'})).rows).toHaveLength(22);
  expect(roleSteps(view({mode:'roles',scale:'radix:blue'})).map(s=>s.role)[8]).toBe('Solid background');
  expect(NAMED_GROUPS.flatMap(group=>namedColours(group)).length).toBe(148);expect(namedColours('blues').some(c=>c.name==='royalblue')).toBe(true);expect(namedColours('greys').some(c=>c.name==='gray')).toBe(true);
  for(const data of [{mode:'variations',base:'royalblue'},{mode:'harmony',base:'tailwind:rose-500'},{mode:'contrast',backgrounds:['#ffffff','#111111'],texts:['#111111','tailwind:sky-600']},{mode:'theme',seed:'#6750a4'},{mode:'named',group:'greens'},{mode:'shades',custom:[{name:'brand',shades:[{label:'light',value:'#eeeeff'},{label:'dark',value:'#111133'}]}]},{mode:'roles',steps:Array(12).fill('#123456')}])expect(colourTokens(view(data)).length,data.mode).toBeGreaterThan(1);
  for(const bad of [{mode:'options',options:[{value:'#fff'}]},{mode:'shades'},{mode:'shades',palette:'tailwind',families:['nope']},{mode:'roles',scale:'radix:nope'},{mode:'contrast',backgrounds:[],texts:['#000000']},{mode:'variations',base:'tailwind:amber-401'}])expect(()=>view(bad),JSON.stringify(bad)).toThrow();
 });
});

describe('06ee64d1 JSON raw view and tool call details; other new templates',()=>{
 it('raw is the default; pretty printing changes only whitespace and keeps exact tokens',()=>{
  expect(jsonDataSchema.parse({json:'{}'}).view).toBe('raw');expect(jsonDataSchema.parse({json:'{}',view:'tree'}).view).toBe('tree');
  const source='{"exact":9007199254740993,"price":1.10,"text":"a, b: {c} [d] \\" e","list":[1,{"k":null},[]],"empty":{},"t":true}';
  const pretty=prettyJson(source);
  expect(pretty.replace(/\s+/g,'')).toBe(source.replace(/\s+/g,''));expect(pretty).toContain('9007199254740993');expect(pretty).toContain('1.10');
  expect(pretty.split('\n')).toEqual(['{','  "exact": 9007199254740993,','  "price": 1.10,','  "text": "a, b: {c} [d] \\" e",','  "list": [','    1,','    {','      "k": null','    },','    []','  ],','  "empty": {},','  "t": true','}']);
  expect(jsonPathLine(pretty,'$')).toBe(1);expect(jsonPathLine(pretty,'$.price')).toBe(3);expect(jsonPathLine(pretty,'$.list')).toBe(5);expect(jsonPathLine(pretty,'$.list[0]')).toBe(6);expect(jsonPathLine(pretty,'$.list[1].k')).toBe(8);expect(jsonPathLine(pretty,'$.list[2]')).toBe(10);expect(jsonPathLine(pretty,'$.t')).toBe(13);expect(jsonPathLine(pretty,'$.missing')).toBeUndefined();
  expect(jsonPathLine(prettyJson('[{"a":1},{"a":2}]'),'$[1].a')).toBe(6);
 });
 it('tool call details holds request and response, an error, a highlighted field and stored long content',()=>{
  const data=validateView(samples['tool-call-details']).data;expect(data).toMatchObject({view:'raw',status:'success',expanded:false});
  const failed=validateView({template:'tool-call-details',data:{tool:'kanvas.planner.edit',status:'error',request:'{"items":[{"start":"09:00"}]}',responseText:'Invalid arguments',error:{code:'INVALID_ARGUMENT',message:'items[0].start: Expected ISO 8601 date-time.'},highlight:{pane:'request',path:'$.items[0].start',note:'this argument was wrong'},view:'tree'}} as never).data;
  expect(failed.error).toMatchObject({code:'INVALID_ARGUMENT'});
  const long='{"rows":['+Array.from({length:3000},(_,i)=>i).join(',')+']}';expect((validateView({template:'tool-call-details',data:{tool:'t',request:'{}',response:long}} as never).data.response as string).length).toBe(long.length);
  for(const bad of [{tool:'t',request:'not json'},{tool:'t',request:'{}',response:'{}',responseText:'both'},{tool:'t',request:'{}',highlight:{pane:'request',path:'items[0]'}},{tool:'t',request:'{}',status:'weird'}])expect(()=>validateView({template:'tool-call-details',data:bad} as never),JSON.stringify(bad)).toThrow();
 });
 it('welcome carries the founder\'s invitation by default; every new sample validates',()=>{
  expect(validateView({template:'welcome',data:{}} as never).data).toEqual({line:HUMAN_INVITATION.line,examples:[...HUMAN_INVITATION.examples]});
  expect(HUMAN_INVITATION.line).toBe('Your agent can show things here while you talk.');expect(HUMAN_INVITATION.examples).toHaveLength(3);
  for(const template of ['task-list','colour','icon-picker','font-picker','tool-call-details','agents','welcome'] as const)expect(validateView(samples[template]).template).toBe(template);
  expect(()=>validateView({template:'icon-picker',data:{icons:[{set:'lucide',name:'https://evil.example/x.svg'}]}} as never)).toThrow();
  expect(()=>validateView({template:'font-picker',data:{mode:'samples',fonts:[{family:'https://evil.example',weight:400}]}} as never)).toThrow();
  expect(()=>validateView({template:'font-picker',data:{mode:'pairings',fonts:[{family:'inter'}]}} as never)).toThrow();expect(()=>validateView({template:'font-picker',data:{mode:'samples'}} as never)).toThrow();
 });
});
