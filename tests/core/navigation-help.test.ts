import { randomUUID } from 'node:crypto';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { startHarness,success,denied,fact,type Harness,type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import type { NavigationSnapshot } from '../../src/shared/navigation.js';
import type { UpdateRecord } from '../../src/shared/types.js';
import { TEMPLATE_IDS } from '../../src/shared/types.js';
import { HELP_TOPICS } from '../../src/shared/help.js';

describe('navigation, saved pins and task-focused Help',()=>{
  let h:Harness,owner:Browser,s:string,d:string,p:AuthPrincipal;
  const path=()=>`/api/sessions/${s}/displays/${d}`;
  beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  const call=async (name:string,args:unknown)=>(await h.runtime.service.execute(name,args,p));
  const nav=async(navigation:unknown,extra:Record<string,unknown>={})=>(await call('kanvas_navigation_control',{sessionId:s,displayId:d,expectedRevision:1,requestId:randomUUID(),navigation,...extra})) as Promise<{commandId:string;version:number;state:{page:number;query:string}}>;
  const browserState=async(browser:Browser,tabId:string)=>success(await browser.request<NavigationSnapshot>('GET',`${path()}/navigation?tabId=${tabId}`));
  const browserMove=async(browser:Browser,tabId:string,page:number)=>browser.request<NavigationSnapshot>('POST',`${path()}/navigation`,{tabId,requestId:randomUUID(),expectedRevision:1,navigation:{action:'page',page}});
  const table={version:1 as const,template:'table' as const,data:{columns:['Label','Amount'],rows:Array.from({length:51},(_,i)=>({Label:`Row ${i+1}`,Amount:'9007199254740993.001'})),pageSize:10}};
  it('pages and searches the exact collection without changing history, source, responses or display revision; retries and late receipts are bounded',async()=>{
    await owner.submit(s,[d],table);const before=await owner.detail(s),history=await call('kanvas_display_history',{sessionId:s,displayId:d});
    const args={requestId:randomUUID()},first=await nav({action:'page',page:6},args);expect(first.state.page).toBe(5);expect((await nav({action:'page',page:6},args)).commandId).toBe(first.commandId);
    await expect(nav({action:'page',page:5},args)).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    await expect(nav({action:'page',page:7})).rejects.toMatchObject({code:'NAVIGATION_UNAVAILABLE'});
    const searched=await nav({action:'search',query:'Row 51'});expect(searched.state).toMatchObject({page:0,query:'Row 51'});
    const state=await browserState(owner,'navigation-tab');expect(state.capabilities).toMatchObject({matchingItems:1,pageCount:1});
    success(await owner.request('POST',`${path()}/navigation/ack`,{tabId:'navigation-tab',revision:1,commandId:searched.commandId,status:'applied',matches:1}));
    const after=await owner.detail(s);expect(after.displays[0].view).toEqual(before.displays[0].view);expect(after.displays[0].revision).toBe(1);expect(after.interactions).toEqual(before.interactions);expect(await call('kanvas_display_history',{sessionId:s,displayId:d})).toEqual(history);
    await owner.submit(s,[d],fact('New exact view'));
    expect(success(await owner.request<{ignored:boolean}>('POST',`${path()}/navigation/ack`,{tabId:'navigation-tab',revision:1,commandId:searched.commandId,status:'applied'})).ignored).toBe(true);
    await expect(nav({action:'reset'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    expect((await browserState(owner,'navigation-tab')).state).toMatchObject({page:0,query:''});
  });
  it('enforces independent, shared and presenter navigation separately from content-edit permissions',async()=>{
    await owner.submit(s,[d],table);const viewer=await h.account();success(await owner.request('POST',`/api/sessions/${s}/members`,{username:viewer.user!.username,role:'viewer'}));
    const observe=async(browser:Browser,tabId:string)=>success(await browser.request<{viewerId:string}>('POST',`${path()}/observe`,{tabId,sequence:1,revision:1,renderedRevision:1,status:'ready',visible:true,text:'Rows',width:800,height:600,context:null}));
    const leader=await observe(owner,'leader-tab');await observe(viewer,'other-tab');
    success(await browserMove(owner,'leader-tab',3));expect((await browserState(viewer,'other-tab')).state.page).toBe(0);
    success(await owner.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:0,config:{syncMode:'shared'}}));
    success(await browserMove(viewer,'other-tab',4));expect((await browserState(owner,'leader-tab')).state.page).toBe(3);
    denied(await viewer.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:1,config:{syncMode:'presenter',presenterViewerId:leader.viewerId}}));
    success(await owner.request('PATCH',`/api/sessions/${s}/config`,{expectedRevision:1,config:{syncMode:'presenter',presenterViewerId:leader.viewerId}}));
    denied(await browserMove(viewer,'other-tab',1));success(await browserMove(owner,'leader-tab',2));expect((await browserState(viewer,'other-tab')).state.page).toBe(1);
    denied(await viewer.request('POST',`${path()}/edit`,{expectedRevision:1,data:table.data}),[403,404]);
    await expect(h.runtime.service.execute('kanvas_navigation_control',{sessionId:s,displayId:d,expectedRevision:1,requestId:randomUUID(),navigation:{action:'page',page:3}},{userId:viewer.user!.id})).rejects.toMatchObject({code:'NOT_FOUND'});
    success(await owner.request('DELETE',`/api/sessions/${s}/members/${viewer.user!.id}`));denied(await viewer.request('GET',`${path()}/navigation?tabId=other-tab`));
  });
  it('rejects unauthenticated navigation and unsupported cross-origin content actions while allowing page selection',async()=>{
    await owner.submit(s,[d],{version:1,template:'iframe',data:{pages:[{url:'https://example.com/'},{url:'https://example.org/'}],index:0}});
    expect((await nav({action:'page',direction:'next'})).state.page).toBe(1);
    for(const action of [{action:'search',query:'secret'},{action:'scroll',y:1},{action:'highlight',text:'remote'},{action:'focus',text:'remote',zoom:2}])await expect(nav(action)).rejects.toMatchObject({code:'NAVIGATION_UNAVAILABLE'});
    denied(await h.browser().request('POST',`${path()}/navigation`,{tabId:'fake',requestId:randomUUID(),expectedRevision:1,navigation:{action:'page',page:1}}),[401]);
  });
  it('recalls an exact labelled pin after linear history has pruned the original, with hold, revision, scope and retry checks',async()=>{
    await owner.submit(s,[d],fact('Pinned source\n9007199254740993.001'));
    const args={sessionId:s,displayId:d,requestId:randomUUID(),label:'Exact reference'};
    const pin=await call('kanvas_pin_save',args) as {id:string};expect(await call('kanvas_pin_save',args)).toEqual(pin);
    await expect(call('kanvas_pin_save',{...args,label:'Different'})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    for(let i=0;i<62;i++)await owner.submit(s,[d],fact(`Later ${i}`));
    await expect(call('kanvas_display_navigate',{sessionId:s,displayIds:[d],requestId:randomUUID(),revision:1,expectedRevisions:{[d]:63}})).rejects.toMatchObject({code:'HISTORY_BOUNDARY'});
    const recall={sessionId:s,displayId:d,requestId:randomUUID(),pinId:pin.id,expectedRevision:63};
    const update=await call('kanvas_pin_recall',recall) as UpdateRecord;expect((await call('kanvas_pin_recall',recall) as UpdateRecord).id).toBe(update.id);
    expect((await owner.detail(s)).displays[0]).toMatchObject({revision:64,view:{data:{text:'Pinned source\n9007199254740993.001'}}});
    await expect(call('kanvas_pin_recall',{...recall,requestId:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    await call('kanvas_display_update',{sessionId:s,displayId:d,expectedRevision:64,held:true});
    await expect(call('kanvas_pin_recall',{...recall,requestId:randomUUID(),expectedRevision:(await owner.detail(s)).displays[0].revision})).rejects.toMatchObject({code:'DISPLAY_HELD'});
    const other=(await owner.display(s)).id;await expect(call('kanvas_pin_recall',{...recall,displayId:other,expectedRevision:0,requestId:randomUUID()})).rejects.toMatchObject({code:'NOT_FOUND'});
    await call('kanvas_pin_remove',{sessionId:s,displayId:d,pinId:pin.id});expect(await call('kanvas_pins_read',{sessionId:s,displayId:d})).toEqual([]);expect((await owner.detail(s)).displays[0].view?.data.text).toContain('Pinned source');
  },20000);
  it('serves focused Help without side effects, has no static demo operations, plus complete public HTML/Markdown/schema navigation',async()=>{
    await owner.submit(s,[d],fact('Keep this view'));const before=await owner.detail(s);
    expect(await call('kanvas_help',{topic:'navigation',sessionId:s,displayId:d,question:'How do I go to a specific page?'})).toMatchObject({name:'Kanvas Help',topic:'navigation',published:false});
    const after=await owner.detail(s);expect(after.session).toEqual(before.session);expect(after.displays[0].view).toEqual(before.displays[0].view);expect(after.displays[0].revision).toBe(before.displays[0].revision);expect(after.updates.map(x=>[x.id,x.status])).toEqual(before.updates.map(x=>[x.id,x.status]));expect((await h.runtime.store.list('demo'))).toEqual([]);
    const index=await (await owner.raw('/docs/index.json')).json();expect(index.topics).toHaveLength(HELP_TOPICS.length);expect(index.tools).toHaveLength(12);expect(index.templates.map((x:{template:string})=>x.template)).toEqual([...TEMPLATE_IDS]);expect(JSON.stringify(index)).not.toMatch(/coordination|sqlite|reportId|token/i);
    for(const route of ['/docs/','/docs/navigation','/docs/navigation.md','/docs/reading.md','/docs/task-updates.md','/docs/invitations.md','/docs/reference.md','/docs/account-start.md','/docs/install-and-cast.md','/docs/work-views.md','/docs/selection.md','/docs/images.md','/docs/shared-pointing.md','/docs/feedback.md','/docs/templates/iframe.json','/docs/operations/kanvas_control.json']){const response=await h.browser().raw(route);expect(response.status,route).toBe(200);expect(await response.text()).not.toContain('Keep this view');}
    for(const route of ['/docs/templates/web.json','/docs/coordination','/docs/../../memory/2026-09-16.md'])expect((await h.browser().raw(route)).status).toBe(404);
  });
});
