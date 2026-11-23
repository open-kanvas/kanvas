import {afterEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {startHarness,type Harness} from './harness';
let h:Harness;afterEach(async()=>{await h?.close();});
it('subtask deltas preserve permanent parent numbers and stable subtask ids while display references remain metadata',async()=>{
 h=await startHarness();const owner=await h.account(),sessionId=(await owner.session()).id,displayId=(await owner.display(sessionId)).id,p={userId:owner.user!.id};
 const submitted=await owner.submit(sessionId,[displayId],{version:1,template:'task-list',theme:'light',data:{showNumber:false,showReference:true,items:[{title:'Charts',reference:'G-24',subtasks:[{title:'Bars',checked:false},{id:'line',title:'Lines',checked:false}]}]}});
 const listId=String(submitted.detail.displays[0].view!.data.taskListId),tasks=h.runtime.service.taskLists;
 const before=await tasks.read(p,{sessionId,taskListId:listId,item:1}) as any;
 const first=before.item.subtasks[0].id;expect(first).toEqual(expect.any(String));
 const update=(value:Record<string,unknown>)=>tasks.update(p,{sessionId,taskListId:listId,requestId:randomUUID(),...value});
 await update({subtasks:[{item:1,check:[first],items:[{id:'line',status:'doing',description:'Exact series'}],add:[{id:'pie',title:'Pie',checked:false}],highlight:'line'}],items:[{item:1,reference:'JIRA-42'}]});
 const after=await tasks.read(p,{sessionId,taskListId:listId,item:1}) as any;
 expect(after.item).toMatchObject({id:before.item.id,number:1,reference:'JIRA-42',subtasks:[{id:first,checked:true},{id:'line',status:'doing'},{id:'pie'}]});
 const visible=(await owner.detail(sessionId)).displays[0].view!;
 expect(visible.theme).toBe('light');expect(visible.data).toMatchObject({showNumber:false,showReference:true,highlightSubtask:'line'});
 await update({subtasks:[{item:1,uncheck:[first],remove:['pie'],highlight:null}],showNumber:true,showReference:false});
 expect((await tasks.read(p,{sessionId,taskListId:listId,item:1}) as any).item.subtasks).toHaveLength(2);
 const other=await h.account();await expect(tasks.displayItem({userId:other.user!.id},sessionId,displayId,before.item.id)).rejects.toMatchObject({code:'NOT_FOUND'});
 await expect(update({subtasks:[{item:1,check:['missing']}]})).rejects.toThrow();
});

it('bounds nested task detail and cumulative delta size without partially saving an oversized update',async()=>{
 h=await startHarness();const owner=await h.account(),sessionId=(await owner.session()).id,displayId=(await owner.display(sessionId)).id,p={userId:owner.user!.id};
 const published=await owner.submit(sessionId,[displayId],{version:1,template:'task-list',data:{items:Array.from({length:40},(_,i)=>({title:'Group '+i}))}});
 const taskListId=String(published.detail.displays[0].view!.data.taskListId),tasks=h.runtime.service.taskLists;
 const groups=(prefix:string,count=4)=>Array.from({length:40},(_,i)=>({item:i+1,add:Array.from({length:count},(_,j)=>({id:prefix+j,title:'Child '+j,detail:'x'.repeat(8000)}))}));
 await tasks.update(p,{sessionId,taskListId,requestId:randomUUID(),subtasks:groups('a')});
 await expect(tasks.update(p,{sessionId,taskListId,requestId:randomUUID(),subtasks:groups('b')})).rejects.toThrow('2 MiB');
 await expect(tasks.update(p,{sessionId,taskListId,requestId:randomUUID(),subtasks:[groups('c',5)[0]]})).rejects.toThrow('64 KiB');
 expect((await tasks.read(p,{sessionId,taskListId,item:1}) as any).item.subtasks).toHaveLength(4);
});

it('agent expansion addresses stable ids or numbers, collapses on highlight changes, and applies without republishing',async()=>{
 h=await startHarness();const owner=await h.account(),sessionId=(await owner.session()).id,displayId=(await owner.display(sessionId)).id,p={userId:owner.user!.id};
 const published=await owner.submit(sessionId,[displayId],{version:1,template:'task-list',data:{highlight:'one',items:[{id:'one',title:'One',detail:'First detail'},{id:'two',title:'Two',subtasks:[{id:'child',title:'Child',checked:false}]}]}});
 const taskListId=String(published.detail.displays[0].view!.data.taskListId),tasks=h.runtime.service.taskLists;
 const update=(value:Record<string,unknown>,requestId=randomUUID())=>tasks.update(p,{sessionId,taskListId,requestId,...value});
 const visible=async()=>((await owner.detail(sessionId)).displays[0].view!.data as any);
 await update({expand:[2]});expect((await visible()).expanded).toEqual(['one','two']);expect((await visible()).items[1].subtasks[0].id).toBe('child');
 await update({highlight:2});expect((await visible()).expanded).toEqual(['two']);expect((await visible()).items[0].detail).toBeUndefined();
 await update({collapse:['two']});expect((await visible()).expanded).toEqual([]);
 await update({expand:['one','two'],collapseAll:true});expect((await visible()).expanded).toEqual(['one','two']);
 const once=await update({collapseAll:true},'close-all');expect((await visible()).expanded).toEqual([]);
 expect(await update({collapseAll:true},'close-all')).toEqual(once);
 const revision=(await visible()).taskListRevision;
 await expect(update({expand:['absent']})).rejects.toThrow();expect((await visible()).taskListRevision).toBe(revision);
 await update({subtasks:[{item:2,highlight:'child'}]});expect((await visible()).expanded).toEqual(['two']);
 await update({highlight:null});expect((await visible()).expanded).toEqual([]);
 const rows=(await tasks.read(p,{sessionId,taskListId}) as any).items;expect(rows.map((x:any)=>[x.id,x.number])).toEqual([['one',1],['two',2]]);
 const other=await h.account();await expect(tasks.update({userId:other.user!.id},{sessionId,taskListId,requestId:randomUUID(),expand:[1]})).rejects.toThrow();
});

it('keeps subtask state independent and guides mistaken top-level checks without leaking other lists',async()=>{
 h=await startHarness();const owner=await h.account(),sessionId=(await owner.session()).id,displayId=(await owner.display(sessionId)).id,p={userId:owner.user!.id};
 const published=await owner.submit(sessionId,[displayId],{version:1,template:'task-list',data:{items:[{id:'parent',title:'Private parent title',subtasks:[{id:'child',title:'Private child title',checked:false}]}]}});
 const taskListId=String(published.detail.displays[0].view!.data.taskListId),tasks=h.runtime.service.taskLists;
 const update=(value:Record<string,unknown>)=>tasks.update(p,{sessionId,taskListId,requestId:randomUUID(),...value});
 await update({check:['parent']});
 expect((await tasks.read(p,{sessionId,taskListId,item:1}) as any).item).toMatchObject({checked:true,subtasks:[{checked:false}]});
 expect((await tasks.read(p,{sessionId,taskListId}) as any).items[0].subtaskProgress).toEqual({done:0,total:1});
 for(const action of ['check','uncheck']){
  const error=await update({[action]:['child']}).catch(e=>e);
  expect(error).toMatchObject({code:'INVALID_ARGUMENT',issues:[{path:action+'[0]',problem:'This id is a subtask of item 1, not a top-level item.',hint:'Use subtasks:[{item:1,'+action+':['+JSON.stringify('child')+']}].'}]});
  expect(JSON.stringify(error)).not.toContain('Private');
 }
 await update({subtasks:[{item:1,check:['child']}]});
 expect((await tasks.read(p,{sessionId,taskListId}) as any).items[0].subtaskProgress).toEqual({done:1,total:1});
 await update({uncheck:['parent']});expect((await tasks.read(p,{sessionId,taskListId,item:1}) as any).item.subtasks[0].checked).toBe(true);
 const unknown=await update({check:['absent']}).catch(e=>e);expect(unknown.issues[0].hint).toBeUndefined();
 const other=await h.account(),otherSession=(await other.session()).id;
 for(const [principal,session] of [[{userId:other.user!.id},sessionId],[p,otherSession],[p,(await owner.session()).id]] as const){
  const error=await tasks.update(principal,{sessionId:session,taskListId,requestId:randomUUID(),check:['child']}).catch(e=>e);
  expect(error.code).toBe('NOT_FOUND');expect(JSON.stringify(error)).not.toContain('subtask');expect(JSON.stringify(error)).not.toContain('Private');
 }
 // A top-level id wins; duplicate child ids must not choose an arbitrary parent.
 await update({add:[{id:'child',title:'Top-level child'},{title:'Another parent',subtasks:[{id:'duplicate',title:'A'}]}],subtasks:[{item:1,add:[{id:'duplicate',title:'B'}]}]});
 await update({check:['child']});expect((await tasks.read(p,{sessionId,taskListId,item:'child'}) as any).item.checked).toBe(true);
 const ambiguous=await update({check:['duplicate']}).catch(e=>e);expect(ambiguous.issues[0].hint).toContain('item:<parent number or id>');
});
