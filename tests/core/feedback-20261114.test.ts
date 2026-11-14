import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,success,denied,fact,type Harness,type Browser} from './harness.js';
import {z} from 'zod';
import {validateView,viewSchema,templateViewSchema,NOT_A_SLIDE} from '../../src/shared/view-schemas.js';
import {compactSchemaReferences} from '../../src/shared/json-schema.js';
import {MAX_TOOL_RESULT_BYTES} from '../../src/server/mcp/results.js';
import {publishInputSchema} from '../../src/shared/publish-input.js';
import {samples} from '../../src/shared/template-examples.js';
import {splitGrid,splitLeaves,splitDivider,SPLIT_LIMITS} from '../../src/shared/split-screen.js';
import {redactStreamAddress,streamRows,formatDuration,type StreamViewEvent} from '../../src/shared/monitor-stream-view.js';
import {boundStreamIds,STREAM_WAIT_MS} from '../../src/server/monitor-streams.js';
import {pointingSummary,POINTER_FADE_MS,POINTER_PIN_MS,POINTING_QUEUE,POINTING_BLOCK_EVENTS} from '../../src/shared/pointing.js';
import {applyResponsePolicy,ContactLedger} from '../../src/server/mcp/response-policy.js';
import {BOARD_DISCLOSURE,BOARD_LIMITS} from '../../src/shared/message-board.js';
import {parseIconId,isPickerIconUrl,iconUrl,iconPickerDataSchema,fontPickerDataSchema} from '../../src/shared/pickers.js';
import {projectTasks,taskCustomColumns,isBuiltinTaskColumn} from '../../src/shared/task-list.js';
import {navigate,initialNavigation} from '../../src/shared/navigation.js';
import {textScale} from '../../src/shared/reading.js';
import {configPatchSchema} from '../../src/shared/preferences.js';
import {sharingLevel} from '../../src/server/account-overview.js';
import {HELP_PAGES as HELP,HELP_TOPICS} from '../../src/shared/help.js';
import {TEMPLATE_DISPLAY_GUIDANCE} from '../../src/shared/display-guidance.js';
const displayGuidance=(template:string)=>(TEMPLATE_DISPLAY_GUIDANCE as Record<string,unknown>)[template];
import {TEMPLATE_IDS,type ViewSpec} from '../../src/shared/types.js';

const pane=(id:string,text=id)=>({id,view:{version:1,template:'fact',data:{text}}});
const split=(data:Record<string,unknown>)=>({version:1,template:'split-screen',data});

describe('5134662f / 3f65409f: the source footer and its fields are gone',()=>{
 it('rejects source and showSource on every view, with no compatibility path',()=>{
  expect(()=>validateView({version:1,template:'fact',data:{text:'x'},source:{title:'Somewhere'}})).toThrow();
  expect(()=>validateView({version:1,template:'fact',data:{text:'x'},showSource:true})).toThrow();
  expect(()=>validateView({version:1,template:'presentation',data:{slides:[{version:1,template:'fact',data:{text:'x'},source:{title:'s'}}]}})).toThrow();
  expect(()=>validateView(split({panes:[pane('a'),{id:'b',view:{version:1,template:'fact',data:{text:'x'},showSource:true}}]}))).toThrow();
  expect(publishInputSchema.safeParse({requestId:'r',data:'x',source:{title:'s'}}).success).toBe(false);
  expect(publishInputSchema.safeParse({requestId:'r',view:{version:1,template:'fact',data:{text:'x'},showSource:true}}).success).toBe(false);
  expect(()=>validateView({version:1,template:'image-gallery',data:{images:[{url:'https://example.com/a.png',showSource:true,source:{title:'s'}}]}})).toThrow();
 });
 it('no example, schema or guidance still mentions the fields',()=>{
  for(const [template,view] of Object.entries(samples)){expect(Object.hasOwn(view as object,'source'),template).toBe(false);expect(Object.hasOwn(view as object,'showSource'),template).toBe(false);expect(validateView(view).template,template).toBe(template);}
  expect(JSON.stringify(viewSchema.description)).not.toMatch(/showSource|\bsource and\b/);
  for(const template of TEMPLATE_IDS)expect(JSON.stringify(displayGuidance(template)??''),template).not.toMatch(/showSource/);
  expect(JSON.stringify(HELP)).not.toMatch(/showSource/);
 });
});

describe('a3523838 / 4e78197e: split screen grids, one nested level, sixteen panes, dividers',()=>{
 const ids=(n:number,prefix='p')=>Array.from({length:n},(_,i)=>pane(`${prefix}${i}`));
 it('accepts every even grid from 1x2 to 4x4 and maps omitted rows/columns as before',()=>{
  for(let rows=1;rows<=4;rows++)for(let columns=1;columns<=4;columns++){if(rows*columns<2)continue;expect(validateView(split({rows,columns,panes:ids(rows*columns)})).template,`${rows}x${columns}`).toBe('split-screen');}
  expect(splitGrid(3)).toEqual({rows:1,columns:3});expect(splitGrid(3,undefined,undefined,'horizontal')).toEqual({rows:3,columns:1});
  expect(splitGrid(2)).toEqual({rows:1,columns:2});expect(splitGrid(2,undefined,undefined,'horizontal')).toEqual({rows:2,columns:1});
  expect(splitGrid(4)).toEqual({rows:2,columns:2});expect(splitGrid(6)).toEqual({rows:2,columns:3});
  expect(splitGrid(4,1)).toEqual({rows:1,columns:4});expect(splitGrid(4,undefined,1)).toEqual({rows:4,columns:1});expect(splitGrid(8,2)).toEqual({rows:2,columns:4});
  expect(splitGrid(5)).toBeUndefined();expect(splitGrid(6,4)).toBeUndefined();expect(splitGrid(10,2,5)).toBeUndefined();
  // Three panes were refused in 0.37 although the schema allowed them.
  expect(validateView(split({panes:ids(3)})).template).toBe('split-screen');
  expect(()=>validateView(split({panes:ids(5)}))).toThrow(/rows x columns/);
  expect(()=>validateView(split({rows:2,columns:2,panes:ids(3)}))).toThrow();
  expect(()=>validateView(split({rows:5,columns:1,panes:ids(5)}))).toThrow();
 });
 it('nests one grid inside a top-level pane and no deeper, with unique ids and a cap of sixteen',()=>{
  const fiveA=split({columns:2,panes:[pane('left'),{id:'right',rows:4,columns:1,panes:ids(4,'r')}]});
  expect(splitLeaves(validateView(fiveA).data).map(p=>p.id)).toEqual(['left','r0','r1','r2','r3']);
  expect(splitLeaves(validateView(fiveA).data).map(p=>p.path)).toEqual(['/data/panes/0/view','/data/panes/1/panes/0/view','/data/panes/1/panes/1/view','/data/panes/1/panes/2/view','/data/panes/1/panes/3/view']);
  expect(splitLeaves(validateView(split({columns:2,panes:[pane('left'),{id:'right',rows:2,columns:2,panes:ids(4,'r')}]})).data)).toHaveLength(5);
  expect(splitLeaves(validateView(split({columns:3,panes:[pane('a'),{id:'mid',rows:2,columns:2,panes:ids(4,'m')},pane('c')]})).data)).toHaveLength(6);
  // A nested pane cannot be split again.
  expect(()=>validateView(split({columns:2,panes:[pane('left'),{id:'right',rows:2,columns:1,panes:[pane('x'),{id:'deep',rows:2,columns:1,panes:ids(2,'d')}]}]}))).toThrow();
  expect(()=>validateView(split({columns:2,panes:[pane('left'),{id:'right',view:split({panes:ids(2,'n')})}]}))).toThrow();
  expect(()=>validateView(split({columns:2,panes:[pane('same'),{id:'right',rows:2,columns:1,panes:[pane('same'),pane('other')]}]}))).toThrow(/unique/);
  expect(SPLIT_LIMITS.leaves).toBe(16);
  expect(splitLeaves(validateView(split({rows:4,columns:4,panes:ids(16)})).data)).toHaveLength(16);
  // 2x2 with every pane holding 2x2 is exactly sixteen; one more pane anywhere is refused.
  expect(splitLeaves(validateView(split({rows:2,columns:2,panes:[0,1,2,3].map(i=>({id:`g${i}`,rows:2,columns:2,panes:ids(4,`g${i}p`)}))})).data)).toHaveLength(16);
  expect(()=>validateView(split({rows:2,columns:2,panes:[...[0,1,2].map(i=>({id:`g${i}`,rows:2,columns:2,panes:ids(4,`g${i}p`)})),{id:'g3',rows:2,columns:3,panes:ids(6,'g3p')}]}))).toThrow(/At most 16/);
 });
 it('keeps the default divider and takes none, gap, border width and colour',()=>{
  expect(splitDivider(undefined)).toEqual({gap:6,borderWidth:1});expect(splitDivider('none')).toEqual({gap:0,borderWidth:0});
  expect(splitDivider({gap:20,borderColor:'#ff8800'})).toEqual({gap:20,borderWidth:1,borderColor:'#ff8800'});
  expect(validateView(split({divider:'none',panes:ids(2)})).data.divider).toBe('none');
  expect(validateView(split({divider:{gap:0,borderWidth:4,borderColor:'#112233'},panes:ids(2)})).data.divider).toEqual({gap:0,borderWidth:4,borderColor:'#112233'});
  expect(()=>validateView(split({divider:{gap:999},panes:ids(2)}))).toThrow();expect(()=>validateView(split({divider:{borderColor:'red'},panes:ids(2)}))).toThrow();
  expect(()=>validateView(split({divider:{style:'dashed'},panes:ids(2)}))).toThrow();
  expect(validateView(split({panes:ids(2)})).data.divider).toBeUndefined();
 });
 it('patches one nested pane by path without touching the others, on a real session',async()=>{
  const h=await startHarness();
  try{
   const o=await h.account(),s=(await o.session()).id,d=(await o.display(s)).id,p={userId:o.user!.id};
   const published=await o.submit(s,[d],split({columns:2,divider:{gap:0},panes:[pane('left','Left'),{id:'right',rows:2,columns:1,panes:[pane('top','Top'),pane('bottom','Bottom')]}]}) as ViewSpec);
   expect(published.update.status).toBe('prepared');
   const revision=published.detail.displays[0].revision;
   await h.runtime.service.execute('kanvas_view_patch',{sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:revision,operations:[{op:'set',path:'/data/panes/1/panes/1/view/data/text',value:'Changed'}]},p);
   const view=(await o.detail(s)).displays[0].view!;
   expect(splitLeaves(view.data).map(x=>[x.id,x.view.data.text])).toEqual([['left','Left'],['top','Top'],['bottom','Changed']]);
   // Pane identity, count and grid shape are not patchable.
   await expect(h.runtime.service.execute('kanvas_view_patch',{sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:revision+1,operations:[{op:'set',path:'/data/panes/1/rows',value:1}]},p)).rejects.toMatchObject({code:'PATCH_UNSUPPORTED'});
   await expect(h.runtime.service.execute('kanvas_view_patch',{sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:revision+1,operations:[{op:'remove',path:'/data/panes/1/panes/1'}]},p)).rejects.toMatchObject({code:'PATCH_UNSUPPORTED'});
   await h.runtime.service.execute('kanvas_view_patch',{sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:revision+1,operations:[{op:'set',path:'/data/divider',value:'none'}]},p);
   expect((await o.detail(s)).displays[0].view!.data.divider).toBe('none');
  }finally{await h.close();}
 });
});

describe('5dc1b2f7 / 6e97c8aa: a display bound to a monitor stream',()=>{
 let h:Harness,o:Browser,s:string,d:string,p:{userId:string};
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
 });
});

describe('b0be5612: pointing is on by default, fades, pins on intent and reaches the agent with its next response',()=>{
 let h:Harness,a:Browser,s:string,d:string,p:{userId:string},path:string;
 beforeEach(async()=>{h=await startHarness();a=await h.account();s=(await a.session()).id;d=(await a.display(s,'Main screen')).id;p={userId:a.user!.id};path=`/api/sessions/${s}/displays/${d}/pointing`;await a.submit(s,[d],fact('Point at this word.'));});
 afterEach(async()=>{await h?.close();});
 const tap={revision:1,anchor:{kind:'text',key:'12345678',occurrence:0,start:9,end:13},point:{x:.4,y:.5},target:{role:'paragraph',label:'this',context:'Point at this word.'}};
 it('needs no activation: a tap leaves a mark that expires in seconds; a deliberate gesture pins it',async()=>{
  const initial=success(await a.request<any>('GET',path));
  expect(initial).toMatchObject({enabled:true,tools:false,canPoint:true,eligibilityReason:'eligible',pointers:[]});expect(initial.serverNow).toEqual(expect.any(Number));
  const tapped=success(await a.request<any>('PUT',path,tap));
  expect(tapped.pointers).toHaveLength(1);expect(tapped.pointers[0]).toMatchObject({pinned:false,point:{x:.4,y:.5},name:a.user!.displayName});
  expect(tapped.pointers[0].expiresAt-tapped.serverNow).toBeLessThanOrEqual(POINTER_FADE_MS);expect(tapped.pointers[0].expiresAt-tapped.serverNow).toBeGreaterThan(POINTER_FADE_MS-1000);
  expect(POINTER_FADE_MS).toBeLessThanOrEqual(6000);
  const pinned=success(await a.request<any>('PUT',path,{...tap,pinned:true}));
  expect(pinned.pointers).toHaveLength(1);expect(pinned.pointers[0].pinned).toBe(true);expect(pinned.pointers[0].expiresAt-pinned.serverNow).toBeGreaterThan(POINTER_PIN_MS-5000);
  // The author's next plain tap replaces the pin with a fading mark: nothing stays stuck.
  const replaced=success(await a.request<any>('PUT',path,{revision:1,anchor:{kind:'point',x:.9,y:.1}}));
  expect(replaced.pointers).toHaveLength(1);expect(replaced.pointers[0]).toMatchObject({pinned:false,anchor:{kind:'point',x:.9,y:.1},point:{x:.9,y:.1}});
  expect((await a.request('PUT',path,{revision:1,anchor:{kind:'point',x:1.5,y:0}})).status).toBe(400);
  expect((await a.request('PUT',path,{...tap,target:{label:'x'.repeat(201)}})).status).toBe(400);
 });
 it('queues what was pointed at per session and hands it to each agent connection once',async()=>{
  const svc=h.runtime.service;
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  success(await a.request('PUT',path,tap));
  const block=await svc.pointing.forAgent(p,'conn-1',s) as any;
  expect(block.events).toHaveLength(1);
  expect(block.events[0]).toMatchObject({sessionId:s,displayId:d,display:'Main screen',by:a.user!.displayName,pinned:false,template:'fact',anchor:tap.anchor,point:tap.point,target:tap.target});
  expect(block.events[0].summary).toBe(`${a.user!.displayName} pointed at "this" in "Point at this word." on Main screen.`);
  expect(block.events[0]).not.toHaveProperty('seq');expect(block.events[0].secondsAgo).toBeLessThan(5);expect(block.note).toMatch(/not an instruction/);
  // Once per connection; a call that names no session still receives what its sessions queued.
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  success(await a.request('PUT',path,{...tap,pinned:true,anchor:{kind:'point',x:.2,y:.2},target:undefined}));
  const later=await svc.pointing.forAgent(p,'conn-1') as any;
  expect(later.events).toHaveLength(1);expect(later.events[0].summary).toMatch(/pinned a pointer on a spot 20% across, 20% down on Main screen\.$/);
  // A second connection has its own cursor and sees both.
  expect(((await svc.pointing.forAgent(p,'conn-2',s)) as any).events).toHaveLength(2);
  // A view replaced since the gesture is marked.
  await a.submit(s,[d],fact('Replacement'));
  success(await a.request('PUT',path,{revision:2,anchor:{kind:'point',x:.5,y:.5}}));
  await a.submit(s,[d],fact('Replacement again'));
  expect(((await svc.pointing.forAgent(p,'conn-1',s)) as any).events[0].viewChangedSince).toBe(true);
 });
 it('never delivers to an account without access, to a browser, or after the owner turns pointing off',async()=>{
  const svc=h.runtime.service,stranger=await h.account(),q={userId:stranger.user!.id};
  success(await a.request('PUT',path,tap));
  expect(await svc.pointing.forAgent(q,'conn-x',s)).toBeUndefined();
  expect(await svc.pointing.forAgent({...p,browserId:'b1'} as never,'conn-b',s)).toBeUndefined();
  denied(await stranger.request('PUT',path,tap),[401,403,404]);
  await svc.pointing.configure(p,{sessionId:s,expectedRevision:0,enabled:false,confirm:true});
  expect(success(await a.request<any>('GET',path))).toMatchObject({enabled:false,canPoint:false,pointers:[]});
  expect((await a.request('PUT',path,tap)).status).toBe(403);
  expect(await svc.pointing.forAgent(p,'conn-1',s)).toBeUndefined();
  const tools=await svc.pointing.configure(p,{sessionId:s,expectedRevision:1,enabled:true,tools:true,confirm:true});expect(tools).toMatchObject({enabled:true,tools:true});
 });
 it('coalesces a double tap, bounds the queue and the block, and survives repeated taps',async()=>{
  const svc=h.runtime.service;
  await svc.pointing.forAgent(p,'conn-1',s);
  success(await a.request('PUT',path,tap));success(await a.request('PUT',path,{...tap,pinned:true}));
  const once=await svc.pointing.forAgent(p,'conn-1',s) as any;expect(once.events).toHaveLength(1);expect(once.events[0].pinned).toBe(true);
  for(let i=0;i<POINTING_QUEUE+5;i++)success(await a.request('PUT',path,{revision:1,anchor:{kind:'point',x:i/100,y:.5}}));
  const many=await svc.pointing.forAgent(p,'conn-1',s) as any;
  expect(many.events).toHaveLength(POINTING_BLOCK_EVENTS);expect(many.earlierOmitted).toBe(POINTING_QUEUE-POINTING_BLOCK_EVENTS);
 });
 it('rides on the response policy only when present, never on an error',()=>{
  const ledger=new ContactLedger(),state=ledger.observe('u:c');
  const pointing={note:'n',events:[{summary:'x'}]};
  expect(applyResponsePolicy({data:{ok:true}},{state,context:{pointing},guidance:undefined,isError:false}).structured).toMatchObject({pointing});
  expect(applyResponsePolicy({data:{ok:true}},{state:ledger.observe('u:c'),context:{},guidance:undefined,isError:false}).structured).not.toHaveProperty('pointing');
  expect(applyResponsePolicy({error:{code:'X'}},{state:ledger.observe('u:c'),context:{pointing},guidance:undefined,isError:true}).structured).not.toHaveProperty('pointing');
  expect(pointingSummary('Ada','TV',{kind:'chart',series:'Revenue',x:'Q3',y:'84'})).toBe('Ada pointed at the chart mark Revenue at Q3 (84) on TV.');
  expect(pointingSummary('Ada','TV',{kind:'cell',row:2,column:'Owner'},{label:'Sam'})).toBe('Ada pointed at the cell in row 3, column "Owner" ("Sam") on TV.');
  expect(pointingSummary('Ada','TV',{kind:'point',x:.5,y:.25},{role:'chart mark',label:'Pie: 30%',pane:'left'})).toBe('Ada pointed at the chart mark "Pie: 30%" in pane left on TV.');
 });
});

describe('d25aaee4: the public message board',()=>{
 let h:Harness,a:Browser,b:Browser,pa:{userId:string},pb:{userId:string};
 beforeEach(async()=>{h=await startHarness();a=await h.account();b=await h.account();pa={userId:a.user!.id};pb={userId:b.user!.id};});
 afterEach(async()=>{await h?.close();});
 const call=(name:string,args:Record<string,unknown>,principal:Record<string,unknown>)=>h.runtime.service.execute(name,args,principal as never) as Promise<any>;
 const post=(principal:Record<string,unknown>,text:string,extra:Record<string,unknown>={})=>call('kanvas_board_post',{requestId:randomUUID(),text,...extra},principal);
 const consent=(name:string)=>({acknowledgePublic:true,publicName:name});
 it('posts nothing until the person has accepted the public disclosure and chosen a name',async()=>{
  const first=await post(pa,'Is there a way to keep a checklist beside a chart?',{tags:['question']});
  expect(first).toMatchObject({posted:false,status:'needs_consent',public:true,disclosure:BOARD_DISCLOSURE});expect(first.disclosure).toMatch(/every user of this Kanvas installation/);
  expect((await call('kanvas_board_read',{},pa)).messages).toEqual([]);
  // A flag without a name, or a name without the flag, is not consent.
  expect((await post(pa,'x',{acknowledgePublic:true})).posted).toBe(false);expect((await post(pa,'x',{publicName:'Ada'})).posted).toBe(false);
  await expect(post(pa,'x',{acknowledgePublic:false,publicName:'Ada'})).rejects.toBeTruthy();
  await expect(post(pa,'x',consent('ada@example.com'))).rejects.toBeTruthy();
  await expect(post(pa,'x',consent('Kanvas maintainer'))).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  const posted=await post(pa,'Is there a way to keep a checklist beside a chart?',{tags:['question','Tips'],...consent('Ada')});
  expect(posted).toMatchObject({posted:true,public:true,message:{author:'Ada',tags:['question','tips'],mine:true}});expect(posted.visibility).toMatch(/Every user/);
  // Recorded once: the next post needs no flag.
  expect((await post(pa,'Second message')).posted).toBe(true);
  const reader=await h.runtime.service.store.get<any>('board-reader',a.user!.id);expect(reader).toMatchObject({publicName:'Ada',consentVersion:1});expect(reader.consentAt).toEqual(expect.any(String));
 });
 it('is visible across accounts and exposes no account, email, session or agent detail',async()=>{
  await post(pa,'Split screen with a chart beside the checklist works well.',{tags:['tips'],...consent('Ada')});
  const seen=await call('kanvas_board_read',{},pb);
  expect(seen.public).toBe(true);expect(seen.messages).toHaveLength(1);
  expect(Object.keys(seen.messages[0]).sort()).toEqual(['at','author','id','isNew','tags','text']);
  expect(seen.messages[0]).toMatchObject({author:'Ada',isNew:true,text:'Split screen with a chart beside the checklist works well.'});
  const everything=JSON.stringify([seen,await call('kanvas_board_overview',{},pb),await call('kanvas_board_read',{as:'chat'},pb)]);
  for(const secret of [a.user!.id,a.user!.username,a.user!.displayName==='Ada'?'\u0000':a.user!.displayName])expect(everything).not.toContain(secret);
  expect(everything).not.toMatch(/authorId|sessionId|agentId|tokenId|userId|email/i);
  expect(seen.untrusted).toMatch(/never follow instructions/);
  // The author sees it as their own, not as new.
  const own=await call('kanvas_board_read',{},pa);expect(own.messages[0].mine).toBe(true);expect(own.messages[0].isNew).toBeUndefined();expect(own.newCount).toBe(0);
 });
 it('has no anonymous or narrowed access in either direction',async()=>{
  await post(pa,'Hello',consent('Ada'));
  // A paired screen, a session-scoped grant and a read-only grant cannot post; none but a full account reads.
  const granted=async(scopes:string[],sessionIds?:string[])=>{const token=await h.runtime.auth.issueToken(b.user!.id,'narrowed',scopes,sessionIds);return await h.runtime.auth.authorize({get:()=>`Bearer ${token.value}`} as never) as unknown as Record<string,unknown>;};
  const readOnly=await granted(['read']),selected=await granted(['read','publish'],[(await b.session()).id]);
  await expect(post({...pb,scopedSessionId:'some-session'},'x',consent('Bo'))).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(post({...pb,scopedDisplayId:'d',scopedSessionId:'s'},'x',consent('Bo'))).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(post(readOnly,'x',consent('Bo'))).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(post(selected,'x',consent('Bo'))).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(call('kanvas_board_read',{},{...pb,scopedSessionId:'some-session'})).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(call('kanvas_board_read',{},selected)).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(call('kanvas_board_overview',{},selected)).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(call('kanvas_board_update',{notifications:true},readOnly)).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await call('kanvas_board_read',{},readOnly)).messages).toHaveLength(1);
  expect((await call('kanvas_board_read',{},pb)).messages.filter((m:any)=>m.author==='Bo')).toEqual([]);
  // No HTTP route serves the board to a browser without a session, or at all.
  for(const route of ['/api/board','/api/public/board','/board'])expect([401,403,404]).toContain((await h.browser().raw(route)).status);
 });
 it('limits rate, refuses duplicates and repeats an identical request without posting twice',async()=>{
  const requestId=randomUUID();
  const one=await call('kanvas_board_post',{requestId,text:'Same request',...consent('Ada')},pa),again=await call('kanvas_board_post',{requestId,text:'Same request'},pa);
  expect(again).toMatchObject({posted:true,repeated:true});expect(again.message.id).toBe(one.message.id);
  await expect(call('kanvas_board_post',{requestId,text:'Different text'},pa)).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
  await expect(post(pa,'Same request')).rejects.toMatchObject({code:'DUPLICATE'});
  for(let i=1;i<BOARD_LIMITS.perHour;i++)expect((await post(pa,`Message ${i}`)).posted).toBe(true);
  await expect(post(pa,'One too many')).rejects.toMatchObject({code:'RATE_LIMITED',status:429});
  expect((await call('kanvas_board_read',{limit:50},pb)).messages).toHaveLength(BOARD_LIMITS.perHour);
  await expect(post(pa,'x'.repeat(BOARD_LIMITS.text+1))).rejects.toBeTruthy();
  await expect(post(pa,'tags',{tags:['a','b','c','d','e','f']})).rejects.toBeTruthy();
  await expect(post(pa,'tags',{tags:['Not A Tag!']})).rejects.toBeTruthy();
 });
 it('pages newest first, filters by tag, and returns only what is new since last seen',async()=>{
  await post(pa,'Tip one',{tags:['tips'],...consent('Ada')});await post(pa,'Question one',{tags:['question']});await post(pa,'Tip two',{tags:['tips']});await post(pa,'No tag');
  const page=await call('kanvas_board_read',{limit:3},pb);
  expect(page.messages.map((m:any)=>m.text)).toEqual(['No tag','Tip two','Question one']);expect(page.nextCursor).toEqual(expect.any(String));expect(page.newCount).toBe(4);
  const older=await call('kanvas_board_read',{limit:3,before:page.nextCursor},pb);expect(older.messages.map((m:any)=>m.text)).toEqual(['Tip one']);expect(older.nextCursor).toBeUndefined();
  await expect(call('kanvas_board_read',{before:'nope'},pb)).rejects.toMatchObject({code:'INVALID_CURSOR'});
  expect((await call('kanvas_board_read',{tag:'tips'},pb)).messages.map((m:any)=>m.text)).toEqual(['Tip two','Tip one']);
  // Reading alone marks nothing; markSeen is explicit.
  expect((await call('kanvas_board_read',{newOnly:true},pb)).messages).toHaveLength(4);
  const marked=await call('kanvas_board_read',{newOnly:true,markSeen:true},pb);expect(marked.messages).toHaveLength(4);expect(marked.newCount).toBe(0);expect(marked.markedSeenAt).toEqual(expect.any(String));
  expect((await call('kanvas_board_read',{newOnly:true},pb)).messages).toEqual([]);
  await post(pa,'Fresh',{tags:['tips']});
  const fresh=await call('kanvas_board_read',{newOnly:true},pb);expect(fresh.messages.map((m:any)=>m.text)).toEqual(['Fresh']);expect(fresh.lastSeenAt).toEqual(expect.any(String));
  // Read state is per account.
  expect((await call('kanvas_board_read',{mine:true},pa)).messages).toHaveLength(5);expect((await call('kanvas_board_read',{mine:true},pb)).messages).toEqual([]);
  const overview=await call('kanvas_board_overview',{},pb);
  expect(overview).toMatchObject({public:true,total:5,newCount:1,untagged:1,you:{consented:false,notifications:false}});
  expect(overview.tags).toEqual([{tag:'tips',count:3,newCount:1},{tag:'question',count:1,newCount:0}]);
  expect(validateView(overview.view).template).toBe('message-board');expect(overview.view.data.latest[0]).toMatchObject({author:'Ada',text:'Fresh',isNew:true});
  const chat=await call('kanvas_board_read',{tag:'tips',as:'chat'},pb);expect(validateView(chat.view).template).toBe('chat');expect(chat.view.data.messages.map((m:any)=>m.sender)).toEqual(['Ada','Ada','Ada']);
 });
 it('mentions new messages only to an account that opted in, once per number, at the start of a conversation or session',async()=>{
  await post(pa,'Hello',consent('Ada'));await post(pa,'Hello again');
  const board=h.runtime.service.board;
  expect(await board.notice(pb as never)).toBeUndefined();
  expect(await call('kanvas_board_update',{notifications:true},pb)).toMatchObject({updated:true,notifications:true});
  const notice=await board.notice(pb as never);expect(notice).toMatchObject({newMessages:2});expect(notice!.note).toMatch(/^2 new messages on the public message board since you last looked\./);
  expect(await board.notice(pa as never)).toBeUndefined();
  expect((await h.runtime.service.responseContext(pb as never,{},'c1')).messageBoard).toMatchObject({newMessages:2});
  const ledger=new ContactLedger(),first=ledger.observe('u:c');
  expect(applyResponsePolicy({data:{}},{state:first,context:{messageBoard:notice},guidance:undefined,isError:false}).structured).toMatchObject({messageBoard:{newMessages:2}});
  // Not on the following calls of the same conversation, and not repeated for the same number on session create.
  expect(applyResponsePolicy({data:{}},{state:ledger.observe('u:c'),context:{messageBoard:notice},guidance:undefined,isError:false}).structured).not.toHaveProperty('messageBoard');
  expect(applyResponsePolicy({data:{}},{state:ledger.observe('u:c'),context:{messageBoard:notice},guidance:undefined,isError:false,operation:'kanvas_session_create'}).structured).not.toHaveProperty('messageBoard');
  expect(applyResponsePolicy({data:{}},{state:ledger.observe('u:c'),context:{messageBoard:{newMessages:3,note:'3'}},guidance:undefined,isError:false,operation:'kanvas_session_create'}).structured).toMatchObject({messageBoard:{newMessages:3}});
  await call('kanvas_board_update',{markSeen:true},pb);expect(await board.notice(pb as never)).toBeUndefined();
  await call('kanvas_board_update',{notifications:false},pb);await post(pa,'Third');expect(await board.notice(pb as never)).toBeUndefined();
 });
 it('lets an author remove their own message and nobody else, except a service administrator',async()=>{
  const mine=await post(pa,'Remove me',consent('Ada'));
  await expect(call('kanvas_board_update',{removeMessageId:mine.message.id},pb)).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(await call('kanvas_board_update',{removeMessageId:mine.message.id},pa)).toMatchObject({updated:true,removed:mine.message.id});
  expect((await call('kanvas_board_read',{},pb)).messages).toEqual([]);expect((await call('kanvas_board_overview',{},pb)).total).toBe(0);
  const stored=await h.runtime.service.store.get<any>('board-message',mine.message.id);expect(stored).toMatchObject({text:'',removedBy:'author'});
  // A service administrator may remove anyone's message; the record says who did.
  const theirs=await post(pb,'Off topic',consent('Bo'));
  const admins=h.runtime.service.accounts as unknown as {serviceAdmins:Set<string>};admins.serviceAdmins.add(a.user!.id);
  expect(await call('kanvas_board_update',{removeMessageId:theirs.message.id},pa)).toMatchObject({removed:theirs.message.id});
  expect(await h.runtime.service.store.get<any>('board-message',theirs.message.id)).toMatchObject({text:'',removedBy:'maintainer'});
  expect((await post(pa,'From the maintainer')).message.maintainer).toBe(true);
  expect((await call('kanvas_board_read',{},pb)).messages[0]).toMatchObject({author:'Ada',maintainer:true});
 });
});

describe('remaining fixes of the round',()=>{
 it('0448f65b: text size is a session setting for every template; the font picker takes a sample size',()=>{
  expect(configPatchSchema.parse({textSize:150}).textSize).toBe(150);expect(configPatchSchema.safeParse({textSize:20}).success).toBe(false);expect(configPatchSchema.safeParse({textSize:300}).success).toBe(false);
  expect(textScale({textSize:150})).toBe(1.5);expect(textScale({})).toBe(1);expect(textScale(undefined)).toBe(1);expect(textScale({textSize:9999})).toBe(2.5);
  expect(fontPickerDataSchema.parse({fonts:[{family:'inter',weight:400}],sampleSize:18}).sampleSize).toBe(18);
  expect(fontPickerDataSchema.safeParse({fonts:[{family:'inter',weight:400}],sampleSize:4}).success).toBe(false);
 });
 it('363457fe: fit is a state the diagram honours until someone zooms or scrolls again',()=>{
  const view={version:1,template:'architecture',data:{textScale:1.5,nodes:[{id:'a',label:'API'},{id:'b',label:'DB'}],edges:[{from:'a',to:'b'}]}} as ViewSpec;
  const fitted=navigate(view,{...initialNavigation(view),scale:2,scroll:{x:1,y:0}},{action:'fit'});
  expect(fitted).toMatchObject({fit:true,scroll:{x:0,y:0}});expect(fitted.scale).toBeUndefined();
  expect(navigate(view,fitted,{action:'zoom',scale:1.5}).fit).toBeUndefined();expect(navigate(view,fitted,{action:'scroll',x:1}).fit).toBeUndefined();
  expect(navigate(view,fitted,{action:'highlight',text:'API'}).fit).toBe(true);expect(navigate(view,fitted,{action:'reset'}).fit).toBeUndefined();
 });
 it('08d22167 / 1c0ebe3f: tasks keep their written order and built-in columns are not extra columns',()=>{
  const items=[{title:'One',checked:true,number:1},{title:'Two',checked:false,number:2},{title:'Three',checked:true,number:3},{title:'Four',checked:false,number:4,fields:{owner:'Ada'}}];
  expect(projectTasks(items).items.map(i=>i.number)).toEqual([1,2,3,4]);
  expect(projectTasks(items,{doneLast:true}).items.map(i=>i.number)).toEqual([2,4,1,3]);
  expect(projectTasks(items,{sort:{by:'title',direction:'asc'}}).items.map(i=>i.number)).toEqual([4,1,3,2]);
  const columns=[{key:'number',label:'#'},{key:'item',label:'Item'},{key:'Status',label:'Status'},{key:'tags',label:'Tags'},{key:'owner',label:'Owner'},{key:'due',label:'Due'}];
  expect(taskCustomColumns(columns).map(c=>c.key)).toEqual(['owner','due']);
  // An own column nobody has filled takes no room on screen.
  expect(taskCustomColumns(columns,items).map(c=>c.key)).toEqual(['owner']);
  expect(isBuiltinTaskColumn(' Title ')).toBe(true);expect(isBuiltinTaskColumn('owner')).toBe(false);
  expect(displayGuidance('task-list')).toBeTruthy();expect(JSON.stringify(displayGuidance('task-list'))).not.toMatch(/suggested starting point/);
 });
 it('5b62fba5: one icon reference format, the id that icons.search returns',()=>{
  expect(parseIconId('lucide:mail-dot')).toEqual({set:'lucide',name:'mail-dot'});
  expect(parseIconId('heroicons:envelope/solid')).toEqual({set:'heroicons',name:'envelope',variant:'solid'});
  expect(parseIconId('bubbles:send-email-envelope-outline')).toEqual({set:'iconify',name:'bubbles:send-email-envelope-outline'});
  for(const bad of ['mail-dot','lucide:','lucide:Mail','lucide:mail/unknownvariant','https://example.com/a.svg','a:b:c','bubbles:x/solid','../etc:passwd'])expect(parseIconId(bad),bad).toBeUndefined();
  expect(iconUrl(parseIconId('lucide:mail-dot')!)).toBe('/api/picker/icons/lucide/outline/mail-dot.svg');
  expect(isPickerIconUrl('/api/picker/icons/lucide/outline/mail-dot.svg')).toBe(true);
  expect(isPickerIconUrl('https://dev.kanvas.host/api/picker/icons/lucide/outline/mail-dot.svg','https://dev.kanvas.host')).toBe(true);
  expect(isPickerIconUrl('https://evil.example/api/picker/icons/lucide/outline/mail-dot.svg','https://dev.kanvas.host')).toBe(false);
  expect(isPickerIconUrl('https://example.com/logo.png','https://dev.kanvas.host')).toBe(false);
  const picker=iconPickerDataSchema.parse({icons:['lucide:mail-dot',{set:'lucide',name:'mail'}]});expect(picker.icons).toHaveLength(2);
  expect(iconPickerDataSchema.safeParse({icons:['https://example.com/x.svg']}).success).toBe(false);
 });
 it('5b62fba5: a toast takes that id and stores the address this server serves it at',async()=>{
  const h=await startHarness();
  try{
   const o=await h.account(),s=(await o.session()).id,d=(await o.display(s)).id,p={userId:o.user!.id};
   await h.runtime.service.execute('kanvas_toast',{sessionId:s,displayIds:[d],text:'Mail',icon:'lucide:mail-dot'},p);
   await h.runtime.service.execute('kanvas_toast',{sessionId:s,displayIds:[d],text:'Mail',icon:'https://example.com/icon.png'},p);
   const icons=(await h.runtime.service.store.list<any>('toast',s)).map(t=>t.icon).sort();
   expect(icons).toEqual(['/api/picker/icons/lucide/outline/mail-dot.svg','https://example.com/icon.png']);
   await expect(h.runtime.service.execute('kanvas_toast',{sessionId:s,displayIds:[d],text:'Mail',icon:'not an icon'},p)).rejects.toBeTruthy();
  }finally{await h.close();}
 });
 it('22eccdda: a session reports its most exposed sharing level',async()=>{
  const h=await startHarness();
  try{
   const o=await h.account(),other=await h.account(),session=await o.session(),p={userId:o.user!.id},svc=h.runtime.service;
   const level=async()=>sharingLevel(svc,(await svc.store.get<any>('session',session.id))!);
   expect(await level()).toBe('private');
   success(await o.request('POST',`/api/sessions/${session.id}/members`,{username:other.user!.username,role:'viewer'}));
   expect(await level()).toBe('shared');
   const overview=success(await o.request<any>('GET','/api/start'));
   expect(overview.sessions.find((x:any)=>x.id===session.id).sharing).toBe('shared');
   const stored=(await svc.store.get<any>('session',session.id))!;
   await svc.store.put('session',{...stored,publicAccess:{enabled:true,revision:1}});
   expect(await level()).toBe('public');
   await svc.store.put('session',{...stored,publicAccess:{enabled:false,revision:2}});
   await svc.store.put('session-group-grant',{id:`${session.id}:g1`,sessionId:session.id,groupId:'g1',role:'viewer',revision:1,updatedAt:new Date().toISOString()});
   expect(await level()).toBe('team');void p;
  }finally{await h.close();}
 });
 it('contract headroom: the two display-only templates are not slides, and the full presentation contract fits one MCP result',()=>{
  const slide=(template:string,data:Record<string,unknown>)=>({version:1,template:'presentation',data:{slides:[{version:1,template,data}]}});
  expect(()=>validateView(slide('monitor-stream',{streamId:'s1'}))).toThrow();expect(()=>validateView(slide('message-board',{total:0}))).toThrow();
  expect(validateView(slide('fact',{text:'ok'})).template).toBe('presentation');
  expect(validateView(split({panes:[pane('a'),{id:'b',view:{version:1,template:'monitor-stream',data:{streamId:'s1'}}}]})).template).toBe('split-screen');
  expect([...NOT_A_SLIDE].sort()).toEqual(['message-board','monitor-stream']);
  const published=JSON.stringify(z.toJSONSchema(templateViewSchema('presentation'),{io:'input',unrepresentable:'any',reused:'ref'}));
  for(const template of NOT_A_SLIDE)expect(published).not.toContain(`"const":"${template}"`);
  const bytes=Buffer.byteLength(JSON.stringify(compactSchemaReferences(JSON.parse(published))));
  // The transport limit is not raised. At 0.38.0 the compact contract measures about 97.7 KB of 96 KiB (98304).
  expect(bytes).toBeLessThan(MAX_TOOL_RESULT_BYTES);expect(MAX_TOOL_RESULT_BYTES).toBe(98304);
 },60_000);
 it('ee486423: help describes what the server does now',()=>{
  const guidance=JSON.stringify(HELP['agent-guidance']);
  expect(guidance).toMatch(/unchanged:true/);expect(guidance).toMatch(/clientDetails\.guidance/);expect(guidance).not.toMatch(/Every authorized MCP tool response[^.]*carries agentGuidance/);
  expect(JSON.stringify(displayGuidance('split-screen'))).toMatch(/1-4 rows by 1-4 columns/);expect(JSON.stringify(displayGuidance('split-screen'))).not.toMatch(/Two, four or six|selectable panes/);
  expect(HELP_TOPICS).toContain('message-board');expect(JSON.stringify(HELP['message-board'])).toMatch(/PUBLIC/);
  expect(JSON.stringify(HELP['shared-pointing'])).toMatch(/on in every session/i);expect(JSON.stringify(HELP['monitor-streams'])).toMatch(/monitor-stream template/);
  expect(templateViewSchema('monitor-stream')).toBeTruthy();expect(templateViewSchema('message-board')).toBeTruthy();
 });
});
