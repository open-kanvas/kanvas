import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startHarness,success,type Harness,type Browser} from './harness.js';
import {validateView} from '../../src/shared/view-schemas.js';
import {workExamples} from '../../src/shared/work-examples.js';
import {selectionSchema,projectSelection} from '../../src/shared/selection.js';
import type {ViewSpec,UpdateRecord} from '../../src/shared/types.js';

describe('September 17 source-driven work views',()=>{
  let h:Harness,b:Browser,s:string,d:string;const interpret=vi.fn(async()=>{throw new Error('Unexpected source preparation for prepared content');});
  beforeEach(async()=>{interpret.mockClear();h=await startHarness({interpreter:{interpret}});b=await h.account();s=(await b.session()).id;d=(await b.display(s)).id;});
  afterEach(async()=>{delete process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT;await h?.close();});
  const call=async (name:string,args:unknown,owner=b)=>(await h.runtime.service.execute(name,args,{userId:owner.user!.id}));
  it.each(Object.entries(workExamples))('publishes the %s contract without reinterpreting content or losing source',async(_name,example)=>{
    const view=validateView(example),{update,detail}=await b.submit(s,[d],view);
    expect(update.status).toBe('prepared');expect(interpret).not.toHaveBeenCalled();expect(detail.displays[0].view).toEqual(view);
  });
  it('filters exact decimals stably and restores source order, with CAS, hold, access and retry enforcement',async()=>{
    const rows=[{ID:'a',Cost:'9007199254740993.002'},{ID:'b',Cost:'9007199254740993.001'},{ID:'c',Cost:'9007199254740993.001'},{ID:'d',Cost:'not supplied'}];
    await b.submit(s,[d],{version:1,template:'table',data:{columns:['ID','Cost'],rows}});
    const selection=selectionSchema.parse({where:[{field:'Cost',op:'gte',value:'9007199254740993.001',type:'number'}],sort:[{field:'Cost',type:'number'}],highlight:[{field:'ID',op:'eq',value:'c'}]});
    const args={sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:1,selection};
    const update=await call('kanvas_selection_set',args) as UpdateRecord;expect((await call('kanvas_selection_set',args) as UpdateRecord).id).toBe(update.id);
    await expect(call('kanvas_selection_set',{...args,selection:null})).rejects.toMatchObject({code:'REQUEST_ID_CONFLICT'});
    await expect(call('kanvas_selection_set',{...args,requestId:randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    const current=(await b.detail(s)).displays[0].view!;expect(current.data.rows).toEqual(rows);
    const projected=projectSelection(current);expect((projected.view.data.rows as any[]).map(x=>x.ID)).toEqual(['b','c','a']);expect(projected.highlights).toEqual([1]);expect(projected.indices).toEqual([1,2,0]);
    const stranger=await h.account();await expect(call('kanvas_selection_set',{...args,requestId:randomUUID(),expectedRevision:2},stranger)).rejects.toMatchObject({code:'NOT_FOUND'});
    await call('kanvas_selection_set',{...args,requestId:randomUUID(),expectedRevision:2,selection:null});expect((await b.detail(s)).displays[0].view!.data.rows).toEqual(rows);
    await call('kanvas_display_update',{sessionId:s,displayId:d,held:true,expectedRevision:3});
    await expect(call('kanvas_selection_set',{...args,requestId:randomUUID(),expectedRevision:(await b.detail(s)).displays[0].revision})).rejects.toMatchObject({code:'DISPLAY_HELD'});
  });
  it('retains raw log line identities and rejects unsupported nested selections with an actionable field path',()=>{
    const view=validateView({version:1,template:'log',data:{raw:' first\r\n\tERROR 1.2300\r\nlast',startLine:91},selection:{where:[{field:'message',op:'contains',value:'ERROR'}]}});
    const copy=structuredClone(view),projected=projectSelection(view);expect(projected.view.data.entries).toMatchObject([{line:92,message:'\tERROR 1.2300\r'}]);expect(view).toEqual(copy);
    expect(()=>validateView({version:1,template:'presentation',data:{slides:[{version:1,template:'fact',data:{text:'Exact'},selection:{}}]}})).toThrow(/selection/);
    expect(()=>selectionSchema.parse({sort:[{field:'__proto__.x'}]})).toThrow();
  });
  it('appends source messages once, rejects duplicate IDs/stale retries and does not send anything externally',async()=>{
    const first={id:'m1',sender:'Source author',timestamp:'17/09 11:00 UTC',text:'  Exact 1.2300\nsecond line'};
    await b.submit(s,[d],{version:1,template:'chat',data:{channel:'Supplied thread',messages:[first]}});
    const args={sessionId:s,displayId:d,requestId:randomUUID(),expectedRevision:1,messages:[{id:'m2',sender:'Other',text:'9007199254740993.001'}]};
    const events:string[]=[];const stop=h.runtime.service.onEvent(e=>events.push(e.type));
    const a=await call('kanvas_chat_append',args) as UpdateRecord;expect((await call('kanvas_chat_append',args) as UpdateRecord).id).toBe(a.id);stop();expect(events).toContain('display');
    await expect(call('kanvas_chat_append',{...args,requestId:randomUUID(),expectedRevision:2})).rejects.toBeDefined();
    const display=(await b.detail(s)).displays[0];expect(display.revision).toBe(2);expect(display.view!.data.messages).toEqual([first,args.messages[0]]);
  });
  it('offers recent ten and older sessions read-only, and renames only with owner/config-revision authority',async()=>{
    process.env.KANVAS_MAX_SESSIONS_PER_ACCOUNT='100';
    for(let i=0;i<11;i++)await b.session(`Source session ${i}`);
    const records=()=>h.runtime.store.query('SELECT kind,id,session_id,value FROM documents ORDER BY rowid');const before=(await records()).rows;
    const page=await call('kanvas_start_read',{}) as any,older=await call('kanvas_start_read',{offset:10}) as any;
    expect(page.sessions).toHaveLength(10);expect(page.total).toBe(12);expect(page.nextOffset).toBe(10);expect(older.sessions).toHaveLength(2);expect(page.canCreate).toBe(true);
    expect((await records()).rows).toEqual(before);
    const original=(await b.detail(s)).session,editor=await h.account();success(await b.request('POST',`/api/sessions/${s}/members`,{username:editor.user!.username,role:'editor'}));
    await expect(call('kanvas_session_rename',{sessionId:s,expectedRevision:original.configRevision,name:'Not authorized'},editor)).rejects.toMatchObject({code:'NOT_FOUND'});
    const renamed=await call('kanvas_session_rename',{sessionId:s,expectedRevision:original.configRevision,name:'Chosen display session'}) as any;
    expect(renamed.name).toBe('Chosen display session');expect(renamed.config).toEqual(original.config);expect(renamed.configRevision).toBe(original.configRevision+1);
    await expect(call('kanvas_session_rename',{sessionId:s,expectedRevision:original.configRevision,name:'Stale'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
    expect((await b.detail(s)).displays[0].id).toBe(d);
  });
});
