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
