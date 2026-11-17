import { afterEach } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startHarness } from './harness.js';
import { success } from './harness.js';
import type { Harness } from './harness.js';
import type { Browser } from './harness.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { samples } from '../../src/shared/template-examples.js';
import { projectTasks } from '../../src/shared/task-list.js';
import { STREAM_BURST } from '../../src/server/monitor-streams.js';
import { STREAM_EVENT_BYTES } from '../../src/server/monitor-streams.js';
import { STREAM_MAX_EVENTS } from '../../src/server/monitor-streams.js';
import { sanitizeSvg } from '../../src/server/pickers.js';
import { iconifyBase } from '../../src/server/pickers.js';
import { readCapped } from '../../src/server/pickers.js';
import { PICKER_CACHE_BYTES } from '../../src/server/pickers.js';
import { PICKER_ICON_BYTES } from '../../src/server/pickers.js';
import { PICKER_FONT_BYTES } from '../../src/server/pickers.js';
import { precachePickers } from '../../scripts/picker-precache.js';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FONT_FAMILIES } from '../../src/shared/pickers.js';
import { ICON_SETS } from '../../src/shared/pickers.js';
import { iconUrl } from '../../src/shared/pickers.js';
import { iconId } from '../../src/shared/pickers.js';
import { fontUrl } from '../../src/shared/pickers.js';
import { colourTokens } from '../../src/shared/colour.js';
import { contrastGrade } from '../../src/shared/colour.js';
import { contrastRatio } from '../../src/shared/colour.js';
import { harmonies } from '../../src/shared/colour.js';
import { hexToOklch } from '../../src/shared/colour.js';
import { namedColours } from '../../src/shared/colour.js';
import { NAMED_GROUPS } from '../../src/shared/colour.js';
import { oklchToHex } from '../../src/shared/colour.js';
import { resolveColour } from '../../src/shared/colour.js';
import { roleSteps } from '../../src/shared/colour.js';
import { seedTheme } from '../../src/shared/colour.js';
import { shadeGrid } from '../../src/shared/colour.js';
import { variations } from '../../src/shared/colour.js';
import { CSS_NAMED } from '../../src/shared/colour-palettes.js';
import { OPEN_COLOR } from '../../src/shared/colour-palettes.js';
import { RADIX_DARK } from '../../src/shared/colour-palettes.js';
import { RADIX_LIGHT } from '../../src/shared/colour-palettes.js';
import { TAILWIND } from '../../src/shared/colour-palettes.js';
import { jsonPathLine } from '../../src/shared/connection-views.js';
import { prettyJson } from '../../src/shared/connection-views.js';
import { jsonDataSchema } from '../../src/shared/connection-views.js';
import { HUMAN_INVITATION } from '../../src/shared/philosophy.js';
import { safeError } from '../../src/server/mcp/results.js';
import { recordHttpOperation } from '../../src/server/raw-events.js';
import { denied } from './harness.js';
import { fact } from './harness.js';
import { z } from 'zod';
import { viewSchema } from '../../src/shared/view-schemas.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';
import { NOT_A_SLIDE } from '../../src/shared/view-schemas.js';
import { compactSchemaReferences } from '../../src/shared/json-schema.js';
import { MAX_TOOL_RESULT_BYTES } from '../../src/server/mcp/results.js';
import { publishInputSchema } from '../../src/shared/publish-input.js';
import { splitGrid } from '../../src/shared/split-screen.js';
import { splitLeaves } from '../../src/shared/split-screen.js';
import { splitDivider } from '../../src/shared/split-screen.js';
import { SPLIT_LIMITS } from '../../src/shared/split-screen.js';
import { redactStreamAddress } from '../../src/shared/monitor-stream-view.js';
import { streamRows } from '../../src/shared/monitor-stream-view.js';
import { formatDuration } from '../../src/shared/monitor-stream-view.js';
import type { StreamViewEvent } from '../../src/shared/monitor-stream-view.js';
import { boundStreamIds } from '../../src/server/monitor-streams.js';
import { STREAM_WAIT_MS } from '../../src/server/monitor-streams.js';
import { pointingSummary } from '../../src/shared/pointing.js';
import { POINTER_FADE_MS } from '../../src/shared/pointing.js';
import { POINTER_PIN_MS } from '../../src/shared/pointing.js';
import { POINTING_QUEUE } from '../../src/shared/pointing.js';
import { POINTING_BLOCK_EVENTS } from '../../src/shared/pointing.js';
import { applyResponsePolicy } from '../../src/server/mcp/response-policy.js';
import { ContactLedger } from '../../src/server/mcp/response-policy.js';
import { BOARD_DISCLOSURE } from '../../src/shared/message-board.js';
import { BOARD_LIMITS } from '../../src/shared/message-board.js';
import { parseIconId } from '../../src/shared/pickers.js';
import { isPickerIconUrl } from '../../src/shared/pickers.js';
import { iconPickerDataSchema } from '../../src/shared/pickers.js';
import { fontPickerDataSchema } from '../../src/shared/pickers.js';
import { taskCustomColumns } from '../../src/shared/task-list.js';
import { isBuiltinTaskColumn } from '../../src/shared/task-list.js';
import { navigate } from '../../src/shared/navigation.js';
import { initialNavigation } from '../../src/shared/navigation.js';
import { textScale } from '../../src/shared/reading.js';
import { configPatchSchema } from '../../src/shared/preferences.js';
import { sharingLevel } from '../../src/server/account-overview.js';
import { HELP_PAGES as HELP } from '../../src/shared/help.js';
import { HELP_TOPICS } from '../../src/shared/help.js';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import type { ViewSpec } from '../../src/shared/types.js';

describe("monitor stream coverage 1", () => {


describe('f4373691 monitor streams: write-only, capped, short-lived',()=>{
 let h!:Harness,o:Browser,s:string,p:{userId:string};
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
 });});
});

describe("monitor stream coverage 2", () => {

const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe('5dc1b2f7 / 6e97c8aa: a display bound to a monitor stream',()=>{
 let h!:Harness,o:Browser,s:string,d:string,p:{userId:string};
 beforeEach(async()=>{h=await startHarness();o=await h.account();s=(await o.session()).id;d=(await o.display(s)).id;p={userId:o.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>={},principal:{userId:string}=p)=>h.runtime.service.execute(name,args,principal) as Promise<any>;
 const post=(url:string,body:string,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{host:'127.0.0.1','content-type':'application/json',...headers},body});
 const created=async(args:Record<string,unknown>={})=>{const stream=await call('kanvas_monitor_stream_create',{sessionId:s,name:'Build agents',requestId:randomUUID(),...args});return {stream,url:`${h.baseUrl}${new URL(stream.postUrl).pathname}`,token:new URL(stream.postUrl).pathname.split('/').pop()!};};
 const bind=(streamId:string,extra:Record<string,unknown>={})=>o.submit(s,[d],{version:1,template:'monitor-stream',data:{streamId,...extra}} as ViewSpec);
 const live=(query='')=>o.request<any>('GET',`/api/sessions/${s}/displays/${d}/monitor-stream${query}`);

 it('pairs a start with its end, reports a missing end as unknown and a failure as failed',()=>{
  const at=(seconds:number)=>new Date(Date.UTC(2026,10,12,2,10,seconds)).toISOString();
  const events:StreamViewEvent[]=[
   {seq:1,receivedAt:at(0),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'PreToolUse',tool:'Bash',target:'sleep 10',timestamp:at(0)}},
   {seq:2,receivedAt:at(10),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'PostToolUse',tool:'Bash',target:'sleep 10',timestamp:at(10)}},
   {seq:3,receivedAt:at(11),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'PreToolUse',tool:'Bash',target:'pytest',callId:'c3'}},
   {seq:4,receivedAt:at(12),source:'cc-orders-agent-2',data:{source:'cc-orders-agent-2',event:'PreToolUse',tool:'Edit',target:'orders.py',callId:'c4'}},
   {seq:5,receivedAt:at(13),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'PreToolUse',tool:'Read',target:'README.md',callId:'c5'}},
   {seq:6,receivedAt:at(14),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'PostToolUseFailure',tool:'Read',target:'README.md',callId:'c5',note:'not found'}},
   {seq:7,receivedAt:at(40),source:'cc-orders-agent',data:{source:'cc-orders-agent',event:'Stop',timestamp:at(15)}},
   {seq:8,receivedAt:at(41),text:'plain progress line'},
  ];
  const rows=streamRows(events,true),by=(key:string)=>rows.find(r=>r.key===key)!;
  expect(rows.map(r=>r.key)).toEqual(['e8','e7','e5','e4','e3','e1']);
  expect(by('e1')).toMatchObject({status:'completed',durationMs:10_000,tool:'Bash',target:'sleep 10',source:'cc-orders-agent'});
  expect(by('e3')).toMatchObject({status:'unknown',tool:'Bash',target:'pytest'});expect(by('e3').durationMs).toBeUndefined();
  // The other agent's start is the last thing it reported on a live stream: still running.
  expect(by('e4')).toMatchObject({status:'running',source:'cc-orders-agent-2'});
  expect(by('e5')).toMatchObject({status:'failed',note:'not found',durationMs:1000});
  expect(by('e7')).toMatchObject({status:'event',event:'Stop',lagSeconds:25});expect(by('e7').at).toBe(at(15));
  expect(by('e8')).toMatchObject({status:'event',note:'plain progress line',source:''});
  // Once the stream has ended nothing is still running.
  expect(streamRows(events,false).find(r=>r.key==='e4')!.status).toBe('unknown');
  expect(formatDuration(10_000)).toBe('10 s');expect(formatDuration(420)).toBe('420 ms');expect(formatDuration(95_000)).toBe('1 min 35 s');
 });
 it('redacts a stream address inside event content on arrival and never stores it',async()=>{
  const {stream,url,token}=await created();
  expect(redactStreamAddress(`curl -s https://dev.kanvas.host/in/${token} -d x`)).toBe('curl -s https://dev.kanvas.host/in/[redacted] -d x');
  expect(redactStreamAddress({a:[`/in/${token}`],[`/in/${token}`]:1})).toEqual({a:['/in/[redacted]'],'/in/[redacted]':1});
  expect((await post(url,JSON.stringify({source:'cc',event:'PreToolUse',tool:'Bash',command:`curl -X POST https://dev.kanvas.host/in/${token} --data-binary @-`,nested:{deep:[`see /in/${token}`]}}))).status).toBe(202);
  expect((await post(url,`plain text carrying /in/${token}`,{'content-type':'text/plain'})).status).toBe(202);
  const read=await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId});
  expect(JSON.stringify(read)).not.toContain(token);expect(JSON.stringify(read.events)).toContain('/in/[redacted]');expect(read.events).toHaveLength(2);
  await bind(stream.streamId);
  const shown=success(await live());expect(JSON.stringify(shown)).not.toContain(token);expect(shown.events).toHaveLength(2);
 });
 it('serves a bound display only: counters, incremental reads, and nothing for a display that shows something else',async()=>{
  const {stream,url}=await created();
  expect((await live()).status).toBe(409);
  await o.submit(s,[d],fact('Not a stream'));
  expect((await live()).status).toBe(409);
  expect((await bind(stream.streamId,{title:'Agents',note:'Nightly build'})).update.status).toBe('prepared');
  for(const event of ['one','two','three'])expect((await post(url,JSON.stringify({source:'a',event}))).status).toBe(202);
  const first=success(await live());
  expect(first.status).toMatchObject({streamId:stream.streamId,state:'active',received:3,buffered:3,dropped:0,rejected:0,sources:['a'],name:'Build agents'});
  expect(first.status.expiresAt).toBe(stream.expiresAt);expect(first.status.lastEventAt).toEqual(expect.any(String));
  expect(first.events.map((e:any)=>e.seq)).toEqual([1,2,3]);expect(first.events[0]).not.toHaveProperty('bytes');
  expect(success(await live('?afterSeq=2')).events.map((e:any)=>e.seq)).toEqual([3]);
  expect(success(await live('?afterSeq=3')).events).toEqual([]);
  // The stream id in the request must be the one on screen.
  const other=await created({name:'Other'});
  expect((await live(`?streamId=${other.stream.streamId}`)).status).toBe(409);
  expect(boundStreamIds({version:1,template:'split-screen',data:{panes:[{id:'a',view:{version:1,template:'monitor-stream',data:{streamId:'x1'}}},{id:'b',rows:2,panes:[{id:'c',view:{version:1,template:'fact',data:{text:'t'}}},{id:'e',view:{version:1,template:'monitor-stream',data:{streamId:'x2'}}}]}]}} as ViewSpec)).toEqual(['x1','x2']);
 });
 it('wakes a waiting display the moment an event arrives, with bounded waiting',async()=>{
  const {stream,url}=await created();await bind(stream.streamId);
  const started=Date.now(),waiting=o.request<any>('GET',`/api/sessions/${s}/displays/${d}/monitor-stream?afterSeq=0&wait=1`);
  await new Promise(resolve=>setTimeout(resolve,250));
  expect((await post(url,JSON.stringify({source:'a',event:'Stop'}))).status).toBe(202);
  const woke=success(await waiting);
  expect(woke.events.map((e:any)=>e.seq)).toEqual([1]);expect(Date.now()-started).toBeLessThan(3000);expect(STREAM_WAIT_MS).toBeLessThanOrEqual(25_000);
 });
 it('says revoked or expired on the display instead of freezing, and keeps no events',async()=>{
  const {stream,url}=await created();await bind(stream.streamId);
  expect((await post(url,JSON.stringify({source:'a',event:'one'}))).status).toBe(202);
  const waiting=o.request<any>('GET',`/api/sessions/${s}/displays/${d}/monitor-stream?afterSeq=1&wait=1`);
  await new Promise(resolve=>setTimeout(resolve,150));
  await call('kanvas_monitor_stream_revoke',{sessionId:s,streamId:stream.streamId});
  const ended=success(await waiting);
  expect(ended.status).toMatchObject({state:'revoked',received:1,buffered:0});expect(ended.status.endedAt).toEqual(expect.any(String));expect(ended.events).toEqual([]);
  expect((await post(url,'late')).status).toBe(410);
  // Expiry: the stored deadline passes.
  const second=await created({name:'Short'});await bind(second.stream.streamId);
  expect((await post(second.url,JSON.stringify({source:'a',event:'one'}))).status).toBe(202);
  const stored=await h.runtime.service.store.get<any>('monitor-stream',second.stream.streamId);
  await h.runtime.service.store.put('monitor-stream',{...stored,expiresAt:Date.now()-1000});
  const expired=success(await live());
  expect(expired.status).toMatchObject({state:'expired',buffered:0,received:1});expect(expired.events).toEqual([]);
 });
 it('refuses to bind a stream of another session or an invented id, and keeps other accounts out',async()=>{
  const {stream}=await created();
  const otherSession=(await o.session('Other')).id,otherDisplay=(await o.display(otherSession)).id;
  const publish=(session:string,display:string,streamId:string)=>o.request<any>('POST',`/api/sessions/${session}/submit`,{requestId:randomUUID(),displayIds:[display],view:{version:1,template:'monitor-stream',data:{streamId}}});
  const wrong=await publish(otherSession,otherDisplay,stream.streamId);
  expect(wrong.status).toBe(404);expect(wrong.error?.message).toMatch(/unavailable in this session/);
  expect((await publish(s,d,'does-not-exist')).status).toBe(404);
  expect((await o.detail(otherSession)).displays[0].view).toBeNull();
  await bind(stream.streamId);
  const stranger=await h.account();
  denied(await stranger.request('GET',`/api/sessions/${s}/displays/${d}/monitor-stream`),[401,403,404]);
  // Public reading exists only while the session is public.
  const anonymous=h.browser();
  expect((await anonymous.request('GET',`/api/public/sessions/${s}/displays/${d}/monitor-stream`)).status).toBe(404);
  await call('kanvas_session_public_access',{sessionId:s,enabled:true,confirm:true,expectedRevision:(await call('kanvas_session_state',{sessionId:s}).catch(()=>({})))?.publicAccess?.revision??0}).catch(async()=>{await call('kanvas_session_public_access',{sessionId:s,enabled:true,confirm:true});});
  const open=await anonymous.request<any>('GET',`/api/public/sessions/${s}/displays/${d}/monitor-stream`);
  if(open.status===200)expect(open.data!.status.streamId).toBe(stream.streamId);
 });
 it('accepts the reporter whatever HTTP client it is: the application has no user-agent filter',async()=>{
  const {stream,url}=await created();
  for(const agent of ['Python-urllib/3.12','python-requests/2.32.3','node','Go-http-client/1.1','curl/8.5.0','']){
   const response=await post(url,JSON.stringify({source:'ua',agent}),{'user-agent':agent});
   expect(response.status,agent||'(empty)').toBe(202);expect(response.headers.get('x-kanvas-stream')).toBe('1');
  }
  // Every documented refusal comes from the stream endpoint itself and says so.
  const unknown=await post(`${h.baseUrl}/in/${'A'.repeat(43)}`,'{}');expect(unknown.status).toBe(404);expect(unknown.headers.get('x-kanvas-stream')).toBe('1');
  const large=await post(url,'x'.repeat(5000));expect(large.status).toBe(413);expect(large.headers.get('x-kanvas-stream')).toBe('1');
  expect((await call('kanvas_monitor_stream_read',{sessionId:s,streamId:stream.streamId})).received).toBe(6);
 });});
});
