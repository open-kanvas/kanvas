import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {DisplayRecord,ViewSpec} from '../shared/types.js';
import {checklistDataSchema} from '../shared/view-schemas.js';
import {AppError,id,now,required} from './store.js';
import {InputError} from './input-errors.js';
import {hash} from './auth.js';
import type {Definition} from './mcp/canonical.js';

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),revision=z.number().int().nonnegative();
const target={sessionId:identifier,checklistId:identifier};
const itemShape=checklistDataSchema.shape.items.element.shape;
/** One entry of a by-ID update. Only id is required for an item that exists. */
const itemChange=z.strictObject({
 id:identifier,
 text:itemShape.text.optional(),
 checked:z.boolean().optional(),
 detail:itemShape.detail.unwrap().nullable().optional(),
 index:z.number().int().min(0).max(99).optional(),
});
export const CHECKLIST_RETAINED_REVISIONS=10;
export const checklistReadSchema=z.strictObject({sessionId:identifier,checklistId:identifier.optional(),revision:revision.optional(),offset:z.number().int().min(0).max(1000).default(0),limit:z.number().int().min(1).max(100).default(100)});
export const checklistUpdateSchema=z.strictObject({...target,expectedRevision:revision.optional(),requestId:identifier,
 items:z.array(itemChange).max(100).optional().describe('By id: only the fields sent change; a new id needs text.'),
 removeIds:z.array(identifier).max(100).optional().describe('Ids to delete; omission never deletes.'),
 mode:z.enum(['patch','replace']).default('patch'),
 allowRemove:z.boolean().optional(),
 highlightId:identifier.nullable().optional(),
 restoreRevision:revision.optional(),
 title:z.string().max(500).optional()});
export const checklistShowSchema=z.strictObject({...target,displayId:identifier,expectedRevision:revision.optional(),requestId:identifier});
export const checklistTools:Definition[]=[
 {name:'kanvas_checklist_read',readOnly:true,schema:checklistReadSchema,description:'Read saved SESSION checklists; they survive replacing or clearing displays. Omit checklistId to list them; include it for exact items and revision; revision reads a kept revision. Large records return item windows (nextOffset).'},
 {name:'kanvas_checklist_update',schema:checklistUpdateSchema,idempotent:true,description:'Change saved checklist items BY ID; items you do not name stay exactly as they are. Tick one: items:[{id,checked:true}]. New id + text adds; removeIds deletes; highlightId marks the current item; restoreRevision reverts. Returns added/changed/removed ids.'},
 {name:'kanvas_checklist_show',schema:checklistShowSchema,idempotent:true,description:'Bring a saved checklist back on ANY display in the SAME session without resupplying its items. Uses latest document state; expectedRevision is the destination display revision. Honors hold/access and requestId retries. Zoom belongs to each receiving device window, not the checklist. Re-showing the same checklist in place preserves local scroll; showing different content resets position.'},
];
interface Checklist {id:string;sessionId:string;revision:number;view:ViewSpec;createdAt:string;updatedAt:string}
interface Retained {id:string;sessionId:string;checklistId:string;revision:number;view:ViewSpec;savedAt:string}
type Item={id:string;text:string;checked?:boolean;detail?:string};
export interface ChecklistUpdateResult {id:string;sessionId:string;revision:number;previousRevision:number;itemCount:number;checkedCount:number;changes:ChecklistChanges;counts:Record<'added'|'changed'|'removed'|'moved'|'untouched',number>;[key:string]:unknown}
export interface ChecklistChanges {added:string[];changed:string[];removed:string[];moved:string[]}
/** Pure by-ID merge. Nothing here can delete an item that was not named in removeIds. */
export function applyChecklistChanges(saved:readonly Item[],changes:readonly z.infer<typeof itemChange>[]=[],removeIds:readonly string[]=[]):{items:Item[];changes:ChecklistChanges;notFound:string[]}{
 const items=saved.map(item=>({...item})),result:ChecklistChanges={added:[],changed:[],removed:[],moved:[]},notFound:string[]=[];
 const named=new Set(changes.map(change=>change.id));
 for(const key of removeIds){
  if(named.has(key))throw new InputError([{path:'removeIds',problem:'An id cannot be both changed in items and deleted in removeIds.'}]);
  const at=items.findIndex(item=>item.id===key);if(at<0){notFound.push(key);continue;}
  items.splice(at,1);result.removed.push(key);
 }
 changes.forEach((change,position)=>{
  const at=items.findIndex(item=>item.id===change.id);
  if(at<0){
   if(change.text===undefined)throw new InputError([{path:`items[${position}].text`,problem:'Required for a new item id. To change an existing item, use its exact saved id (read lists them); only the fields you send are changed.',expected:'string',received:'missing'}]);
   const created:Item={id:change.id,text:change.text,checked:change.checked??false,...(change.detail?{detail:change.detail}:{})};
   items.splice(Math.min(change.index??items.length,items.length),0,created);result.added.push(change.id);return;
  }
  const before=items[at],after:Item={...before};
  if(change.text!==undefined)after.text=change.text;
  if(change.checked!==undefined)after.checked=change.checked;
  if(change.detail===null)delete after.detail;else if(change.detail!==undefined)after.detail=change.detail;
  if(JSON.stringify({...before,checked:Boolean(before.checked)})!==JSON.stringify({...after,checked:Boolean(after.checked)}))result.changed.push(change.id);
  items[at]=after;
  if(change.index!==undefined&&Math.min(change.index,items.length-1)!==at){items.splice(at,1);items.splice(Math.min(change.index,items.length),0,after);result.moved.push(change.id);}
 });
 if(items.length>100)throw new InputError([{path:'items',problem:'A checklist holds at most 100 items after this change.',maximum:100,actual:items.length,unit:'items'}]);
 return {items,changes:result,notFound};
}
function replaceChanges(saved:readonly Item[],next:readonly Item[]):ChecklistChanges{
 const before=new Map(saved.map(item=>[item.id,item])),after=new Set(next.map(item=>item.id)),same=(x:Item,y:Item)=>x.text===y.text&&Boolean(x.checked)===Boolean(y.checked)&&(x.detail??'')===(y.detail??'');
 return {added:next.filter(item=>!before.has(item.id)).map(item=>item.id),changed:next.filter(item=>before.has(item.id)&&!same(before.get(item.id)!,item)).map(item=>item.id),removed:saved.filter(item=>!after.has(item.id)).map(item=>item.id),moved:[]};
}
/** Independent durable documents. No browser state or agent memory is the source of truth. */
export class Checklists {
 constructor(private service:KanvasService){}
 private get store(){return this.service.store;}
 /** Called inside the same publication transaction as the display/history write. */
 async capture(sessionId:string,input:ViewSpec):Promise<ViewSpec>{
  await this.service.mediaLibrary.grantReferences(sessionId,input);
  const view=structuredClone(input);
  if(view.template==='presentation'){
   const slides:ViewSpec[]=[];for(const slide of view.data.slides as ViewSpec[])slides.push(await this.capture(sessionId,slide));view.data.slides=slides;return view;
  }
  if(view.template==='flashcards')return this.service.flashcards.capture(sessionId,view);
  if(view.template==='task-list')return this.service.taskLists.capture(sessionId,view);
  if(view.template!=='checklist')return view;
  const data=checklistDataSchema.parse(view.data),key=data.checklistId??id();
  const previous=await this.store.get<Checklist>('checklist',key);
  if(data.checklistId&&(!previous||previous.sessionId!==sessionId))throw new AppError('NOT_FOUND','This checklist is unavailable in this session.',404);
  if(previous){
   // Re-showing the current state never increments its document revision.
   const old={...previous.view,data:{items:previous.view.data.items,highlight:previous.view.data.highlight}},next={...view,data:{items:data.items,highlight:data.highlight}};
   if(JSON.stringify(old)===JSON.stringify(next))return structuredClone(previous.view);
   this.service.assertRevision(data.checklistRevision,previous.revision);
   await this.retain(previous);
  }else if((await this.store.list<Checklist>('checklist',sessionId)).length>=100)throw new AppError('LIMIT_REACHED','This session supports up to 100 independent checklists.',429);
  const version=previous?previous.revision+1:0;
  view.data={...data,checklistId:key,checklistRevision:version};
  const stamp=now();await this.store.put('checklist',{id:key,sessionId,revision:version,view,createdAt:previous?.createdAt??stamp,updatedAt:stamp});
  return view;
 }
 /** A few earlier revisions stay readable/restorable so a wrong write is a one-step undo. */
 private async retain(previous:Checklist){
  await this.store.put('checklist-revision',{id:`${previous.id}:${previous.revision}`,sessionId:previous.sessionId,checklistId:previous.id,revision:previous.revision,view:previous.view,savedAt:previous.updatedAt} satisfies Retained);
  const kept=(await this.retained(previous.sessionId,previous.id));
  for(const old of kept.slice(0,Math.max(0,kept.length-CHECKLIST_RETAINED_REVISIONS)))await this.store.delete('checklist-revision',old.id);
 }
 private async retained(sessionId:string,checklistId:string){return (await this.store.list<Retained>('checklist-revision',sessionId)).filter(x=>x.checklistId===checklistId).sort((a,b)=>a.revision-b.revision);}
 async latestView(sessionId:string,input:ViewSpec):Promise<ViewSpec>{
  if(input.template!=='checklist'||!input.data.checklistId)return structuredClone(input);
  const record=await this.store.get<Checklist>('checklist',String(input.data.checklistId));
  if(!record||record.sessionId!==sessionId)throw new AppError('NOT_FOUND','This checklist is unavailable.',404);
  return structuredClone(record.view);
 }
 /** History/pin recall is a snapshot, not permission to overwrite a newer document. */
 async restoreSnapshot(sessionId:string,input:ViewSpec):Promise<ViewSpec>{
  const view=structuredClone(input);
  if(view.template==='presentation'){
   const slides:ViewSpec[]=[];for(const slide of view.data.slides as ViewSpec[])slides.push(await this.restoreSnapshot(sessionId,slide));view.data.slides=slides;return view;
  }
  if(view.template==='flashcards'&&view.data.deckId){
   const current=await this.store.get<{sessionId:string;revision:number}>('flashcards',String(view.data.deckId));
   if(!current||current.sessionId!==sessionId||current.revision!==view.data.deckRevision){delete view.data.deckId;delete view.data.deckRevision;}
  }
  if(view.template==='checklist'&&view.data.checklistId){
   const current=await this.store.get<Checklist>('checklist',String(view.data.checklistId));
   if(!current||current.sessionId!==sessionId||current.revision!==view.data.checklistRevision){delete view.data.checklistId;delete view.data.checklistRevision;}
  }
  return this.capture(sessionId,view);
 }
 private async legacy(sessionId:string){
  const entries=await this.store.list<{id:string;view:ViewSpec|null;createdAt:string;displayId:string}>('display-history',sessionId);
  // Last retained version per display/title, not every historical checkbox tick.
  const latest=new Map<string,Checklist>();
  for(const entry of entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
   const view=entry.view;if(view?.template!=='checklist'||view.data.checklistId)continue;
   latest.set(`${entry.displayId}:${view.title??''}`,{id:`legacy_${entry.id}`,sessionId,revision:0,view,createdAt:entry.createdAt,updatedAt:entry.createdAt});
  }
  return [...latest.values()].slice(-100);
 }
 private async get(sessionId:string,key:string){
  const saved=await this.store.get<Checklist>('checklist',key);
  if(saved&&saved.sessionId===sessionId)return saved;
  const legacy=(await this.legacy(sessionId)).find(x=>x.id===key);
  return required(legacy,'This checklist is unavailable in this session.');
 }
 async read(p:AuthPrincipal,raw:unknown){
  const a=checklistReadSchema.parse(raw);await this.service.fullAccount(p);await this.service.access(p,a.sessionId);
  if(a.checklistId){
   const current=await this.get(a.sessionId,a.checklistId),kept=await this.retained(a.sessionId,current.id),retainedRevisions=kept.map(x=>({revision:x.revision,savedAt:x.savedAt,items:(x.view.data.items as unknown[]).length}));
   let record:Checklist&{retainedRevisions?:typeof retainedRevisions;retained?:true;currentRevision?:number}={...current,retainedRevisions};
   if(a.revision!==undefined&&a.revision!==current.revision){
    const old=kept.find(x=>x.revision===a.revision);
    if(!old)throw new AppError('NOT_FOUND',`Revision ${a.revision} of this checklist is not retained. Current revision is ${current.revision}; retained earlier revisions: ${kept.map(x=>x.revision).join(', ')||'none'}.`,404);
    record={id:current.id,sessionId:current.sessionId,revision:old.revision,view:old.view,createdAt:current.createdAt,updatedAt:old.savedAt,retained:true,currentRevision:current.revision};
   }
   const items=record.view.data.items as unknown[];
   if(a.offset===0&&a.limit>=items.length&&Buffer.byteLength(JSON.stringify(record))<44000)return record;
   let page=items.slice(a.offset,a.offset+a.limit);
   while(page.length>1&&Buffer.byteLength(JSON.stringify(page))>40000)page=page.slice(0,Math.ceil(page.length/2));
   return {id:record.id,sessionId:record.sessionId,revision:record.revision,title:record.view.title,items:page,offset:a.offset,total:items.length,...(a.offset+page.length<items.length?{nextOffset:a.offset+page.length}:{}),note:'Item window only, not a replacement view. checklist.show always publishes the full latest stored document.'};
  }
  const all=[...await this.store.list<Checklist>('checklist',a.sessionId),...await this.legacy(a.sessionId)].sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt)).map(c=>({id:c.id,title:c.view.title??'Checklist',revision:c.revision,items:(c.view.data.items as unknown[]).length,checked:(c.view.data.items as {checked?:boolean}[]).filter(i=>i.checked).length,updatedAt:c.updatedAt,...(c.id.startsWith('legacy_')?{legacy:true}:{})}));
  let page=all.slice(a.offset,a.offset+a.limit);while(page.length>1&&Buffer.byteLength(JSON.stringify(page))>40000)page=page.slice(0,Math.ceil(page.length/2));
  return {sessionId:a.sessionId,checklists:page,total:all.length,offset:a.offset,...(a.offset+page.length<all.length?{nextOffset:a.offset+page.length}:{}),note:'Read an ID to retrieve exact items, or show it on a selected display. Persistent records survive replacement, clearing and history pruning.'};
 }
 async update(p:AuthPrincipal,raw:unknown){
  const a=checklistUpdateSchema.parse(raw);
  if(a.restoreRevision!==undefined&&(a.items||a.removeIds))throw new InputError([{path:'restoreRevision',problem:'Restore one retained revision on its own; send item changes in a separate call.'}]);
  if(a.mode==='patch'&&a.allowRemove!==undefined)throw new InputError([{path:'allowRemove',problem:'Only used with mode:"replace". In the default by-ID mode, delete with removeIds.'}]);
  return this.store.atomic(async()=>this.store.transaction(async()=>{
   await this.service.access(p,a.sessionId,'editor');
   const key=hash(`${p.userId}:${p.tokenId??''}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a));
   const prior=await this.store.get<{digest:string;result:ChecklistUpdateResult}>('checklist-request',key);
   if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This request ID refers to a different checklist update.',409);return prior.result;}
   const record=await this.get(a.sessionId,a.checklistId);this.service.assertRevision(a.expectedRevision,record.revision);
   const saved=record.view.data.items as Item[];
   let items:Item[],changes:ChecklistChanges,notFound:string[]=[],title=a.title;
   if(a.restoreRevision!==undefined){
    const old=(await this.retained(a.sessionId,record.id)).find(x=>x.revision===a.restoreRevision);
    if(!old)throw new AppError('NOT_FOUND',`Revision ${a.restoreRevision} of this checklist is not retained. Read the checklist for its retained revisions.`,404);
    items=structuredClone(old.view.data.items as Item[]);title??=old.view.title;
    changes=replaceChanges(saved,items);
   }else if(a.mode==='replace'){
    const next=a.items??[];
    next.forEach((item,position)=>{if(item.text===undefined)throw new InputError([{path:`items[${position}].text`,problem:'mode:"replace" needs every item in full. To change single items, omit mode and send only {id, changed fields}.',expected:'string',received:'missing'}]);});
    items=next.map(item=>({id:item.id,text:item.text!,checked:item.checked??false,...(item.detail?{detail:item.detail}:{})}));
    changes=replaceChanges(saved,items);
    const dropped=[...changes.removed,...(a.removeIds??[])];
    if(changes.removed.length&&a.allowRemove!==true)throw Object.assign(new InputError([{path:'items',problem:`This replace would delete ${changes.removed.length} saved item${changes.removed.length===1?'':'s'} that are missing from items. Nothing was changed. Send only the items that change (default by-ID mode), or repeat with allowRemove:true to delete them.`}]),{wouldRemoveIds:dropped.slice(0,100)});
   }else{
    const merged=applyChecklistChanges(saved,a.items,a.removeIds);items=merged.items;changes=merged.changes;notFound=merged.notFound;
   }
   const previousHighlight=record.view.data.highlight as string|undefined;
   let highlight=a.highlightId===undefined?previousHighlight:a.highlightId??undefined;
   if(a.highlightId&&!items.some(item=>item.id===a.highlightId))throw new InputError([{path:'highlightId',problem:'Must be the id of an item in this checklist. Read the checklist for its item ids.'}]);
   if(highlight&&!items.some(item=>item.id===highlight))highlight=undefined;
   const {highlight:_old,...rest}=record.view.data;
   const view=await this.capture(a.sessionId,{...record.view,...(title!==undefined?{title}:{}),data:{...rest,items,...(highlight?{highlight}:{})}});
   const stored=required(await this.store.get<Checklist>('checklist',String(view.data.checklistId)));
   const unchanged=stored.revision===record.revision;
   if(!unchanged)for(const display of await this.store.list<DisplayRecord>('display',a.sessionId)){
    if(display.view?.template!=='checklist'||display.view.data.checklistId!==a.checklistId)continue;
    display.navigationRoot??=display.revision;display.zoomRoot??=display.revision;
    display.view=structuredClone(view);display.revision++;display.updatedAt=now();
    display.delivery={revision:display.revision,status:'pending',updatedAt:display.updatedAt};
    await this.store.put('display',display);
    this.store.afterCommit(()=>this.service.emit({type:'display',sessionId:a.sessionId,displayId:display.id,revision:display.revision}));
   }
   const final=stored.view.data.items as Item[];
   const result:ChecklistUpdateResult={id:stored.id,sessionId:stored.sessionId,revision:stored.revision,previousRevision:record.revision,title:stored.view.title,
    itemCount:final.length,checkedCount:final.filter(item=>item.checked).length,...(stored.view.data.highlight?{highlightId:stored.view.data.highlight}:{}),
    changes,counts:{added:changes.added.length,changed:changes.changed.length,removed:changes.removed.length,moved:changes.moved.length,untouched:final.length-changes.added.length-changes.changed.length},
    ...(notFound.length?{notFound,notFoundNote:'These removeIds matched no saved item; nothing was deleted for them.'}:{}),
    ...(unchanged?{unchanged:true}:{}),updatedAt:stored.updatedAt,
    note:unchanged?'Nothing differed from the saved checklist; revision unchanged.':`Saved as revision ${stored.revision}. Items not listed in changes are exactly as before. Undo with restoreRevision:${record.revision}.`};
   await this.store.put('checklist-request',{id:key,sessionId:a.sessionId,digest,result});return result;
  }));
 }
 async show(p:AuthPrincipal,raw:unknown){
  const a=checklistShowSchema.parse(raw);
  return this.store.atomic(async()=>this.store.transaction(async()=>{
   await this.service.display(p,a.sessionId,a.displayId,'editor');
   const record=await this.get(a.sessionId,a.checklistId);
   return this.service.showChecklist(p,a,record.view);
  }));
 }
}
