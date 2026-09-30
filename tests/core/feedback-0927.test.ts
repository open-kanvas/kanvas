import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, success, type Harness, type Browser } from './harness.js';
import type { AuthPrincipal } from '../../src/server/auth.js';
import { guideFor } from '../../src/server/mcp/guide.js';
import { templateViewSchema } from '../../src/shared/view-schemas.js';

describe('September 27 collaboration and viewport state',()=>{
  let h:Harness, owner:Browser, s:string,d:string,p:AuthPrincipal;
  beforeEach(async()=>{h=await startHarness();owner=await h.account();s=(await owner.session()).id;d=(await owner.display(s)).id;p={userId:owner.user!.id};});
  afterEach(async()=>{await h?.close();});
  // Tool outputs are heterogeneous envelopes; assertions below narrow the relevant fields.
  const call=async(name:string,args:unknown,actor=p):Promise<any>=>h.runtime.service.execute(name,args,actor);
  const target=()=>({sessionId:s,displayId:d});
  it('records actual suggestion/editor/reviewer identities, preserves attribution on re-anchor and retries exactly',async()=>{
    const editor=await h.account();success(await owner.request('POST',`/api/sessions/${s}/members`,{username:editor.user!.username,role:'editor'}));
    await owner.submit(s,[d],{version:1,template:'drafting',data:{text:'Hello team'}});
    const args={...target(),expectedRevision:1,requestId:'suggest',suggestions:[{id:'greeting',find:'Hello',replacement:'Hi'}]};
    await call('kanvas_draft_suggest',args);
    let read=await call('kanvas_draft_read',target());expect(read.suggestions[0].author).toEqual({id:owner.user!.id,name:owner.user!.displayName});expect(read.collaborative).toBe(true);
    await call('kanvas_draft_edit',{...target(),expectedRevision:2,requestId:'edit',edits:[{op:'append',text:'!'}]},{userId:editor.user!.id});
    read=await call('kanvas_draft_read',target());expect(read.suggestions[0].author.id).toBe(owner.user!.id);expect(read.activity.at(-1)).toMatchObject({action:'edit',actor:{id:editor.user!.id}});
    await call('kanvas_draft_review',{...target(),expectedRevision:3,requestId:'review',accept:['greeting']},{userId:editor.user!.id});
    read=await call('kanvas_draft_read',target());expect(read.text).toBe('Hi team!');expect(read.activity.at(-1)).toMatchObject({action:'accept',suggestionId:'greeting',actor:{id:editor.user!.id},revision:4});
    await call('kanvas_draft_suggest',args);expect((await call('kanvas_draft_read',target())).activity).toEqual(read.activity);
    await expect(call('kanvas_draft_suggest',{...target(),expectedRevision:4,requestId:'spoof',suggestions:[{find:'Hi',replacement:'Hello',author:{id:'other',name:'Other'}}]})).rejects.toThrow();
  });
  it('distinguishes logical page count from measured overflow and expires stale/old-position measurements',async()=>{
    const path=`/api/sessions/${s}/displays/${d}`;
    await owner.submit(s,[d],{version:1,template:'table',data:{columns:['Name'],rows:Array.from({length:10},(_,i)=>({Name:`Row ${i}`})),pageSize:12}});
    success(await owner.request('POST',`${path}/observe`,{tabId:'screen',sequence:1,revision:1,renderedRevision:1,status:'ready',visible:true,text:'Rows',width:800,height:400,context:null}));
    let read=await call('kanvas_navigation_read',target());expect(read.capabilities).toMatchObject({pageCount:1,matchingItems:10});expect(read.viewers[0].viewport).toBeNull();
    const measurement={tabId:'screen',revision:1,version:0,width:800,height:300,maxX:0,maxY:240};
    success(await owner.request('POST',`${path}/navigation/viewport`,measurement));
    read=await call('kanvas_navigation_read',target());expect(read.viewers[0].viewport).toMatchObject({contentOverflowsViewport:true,maxY:240});
    const command=await call('kanvas_navigation_control',{...target(),expectedRevision:1,requestId:'bottom',navigation:{action:'scroll',y:1}});expect(command.state.scroll.y).toBe(1);
    expect((await call('kanvas_navigation_read',target())).viewers[0].viewport).toBeNull();
    expect(success(await owner.request('POST',`${path}/navigation/viewport`,measurement))).toMatchObject({ignored:true});
    success(await owner.request('POST',`${path}/navigation/viewport`,{...measurement,version:command.version,maxY:0}));
    expect((await call('kanvas_navigation_read',target())).viewers[0].viewport.contentOverflowsViewport).toBe(false);
    const records=await h.runtime.store.list<any>('navigation-viewport',s);await h.runtime.store.put('navigation-viewport',{...records[0],at:'2026-01-01T00:00:00Z'});
    expect((await call('kanvas_navigation_read',target())).viewers[0].viewport).toBeNull();
    const stranger=await h.account();expect((await stranger.request('POST',`${path}/navigation/viewport`,measurement)).status).toBeGreaterThanOrEqual(400);
  });
  it('publishes calendar without planning operations, serves tour and discovers the presenter option',async()=>{
    await owner.submit(s,[d],{version:1,template:'calendar',data:{view:'three-day',anchorDate:'2026-09-27',timeZone:'UTC',items:[]}});
    await expect(call('kanvas_planner_read',target())).rejects.toMatchObject({code:'INVALID_VIEW'});
    const before=(await owner.detail(s)).displays[0];expect(guideFor('tour')).toMatchObject({topic:'tour'});
    expect(await call('kanvas_help',{topic:'tour',sessionId:s})).toMatchObject({published:false,topic:'tour'});
    expect((await owner.detail(s)).displays[0].revision).toBe(before.revision);
    expect(templateViewSchema('presentation').safeParse({version:1,template:'presentation',data:{slides:[{version:1,template:'fact',data:{text:'Note'}}],presenterPreview:true}}).success).toBe(true);
  });
});
