import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {ViewSpec} from '../shared/types.js';
import {checklistDataSchema} from '../shared/view-schemas.js';
import {AppError,id,now,required} from './store.js';
import {hash} from './auth.js';
import type {Definition} from './mcp/canonical.js';

const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),revision=z.number().int().nonnegative();
const target={sessionId:identifier,checklistId:identifier};
export const checklistReadSchema=z.strictObject({sessionId:identifier,checklistId:identifier.optional(),offset:z.number().int().min(0).max(1000).default(0),limit:z.number().int().min(1).max(100).default(100)});
export const checklistUpdateSchema=z.strictObject({...target,expectedRevision:revision,requestId:identifier,items:checklistDataSchema.shape.items,title:z.string().max(500).optional()});
export const checklistShowSchema=z.strictObject({...target,displayId:identifier,expectedRevision:revision,requestId:identifier});
export const checklistTools:Definition[]=[
 {name:'kanvas_checklist_read',readOnly:true,schema:checklistReadSchema,description:'Persistent SESSION checklists survive replacing or clearing displays. Omit checklistId to list IDs/titles; include it to retrieve exact saved items/checked state, revision and ready view. Large records return bounded item windows; follow nextOffset with offset, or show the complete stored document directly. Legacy retained checklist snapshots are listed with legacy_ IDs; show saves the selected snapshot as an independent document. No cross-session reads.'},
 {name:'kanvas_checklist_update',schema:checklistUpdateSchema,idempotent:true,description:'Update saved checklist items/title independently of any currently displayed content. expectedRevision is the checklist document revision from read, not a display revision. Exact requestId retries are safe. Does not overwrite a screen; show the saved checklist on the intended display afterward.'},
 {name:'kanvas_checklist_show',schema:checklistShowSchema,idempotent:true,description:'Bring a saved checklist back on ANY display in the SAME session without resupplying its items. Uses latest document state; expectedRevision is the destination display revision. Honors hold/access and requestId retries. Other displays remain unchanged.'},
];
interface Checklist {id:string;sessionId:string;revision:number;view:ViewSpec;createdAt:string;updatedAt:string}
/** Independent durable documents. No browser state or agent memory is the source of truth. */
export class Checklists {
 constructor(private service:KanvasService){}
 private get store(){return this.service.store;}
 /** Called inside the same publication transaction as the display/history write. */
 async capture(sessionId:string,input:ViewSpec):Promise<ViewSpec>{
  const view=structuredClone(input);
  if(view.template==='presentation'){
   const slides:ViewSpec[]=[];for(const slide of view.data.slides as ViewSpec[])slides.push(await this.capture(sessionId,slide));view.data.slides=slides;return view;
  }
  if(view.template==='flashcards')return this.service.flashcards.capture(sessionId,view);
  if(view.template!=='checklist')return view;
  const data=checklistDataSchema.parse(view.data),key=data.checklistId??id();
  const previous=await this.store.get<Checklist>('checklist',key);
  if(data.checklistId&&(!previous||previous.sessionId!==sessionId))throw new AppError('NOT_FOUND','This checklist is unavailable in this session.',404);
  if(previous){
   // Re-showing the current state never increments its document revision.
   const old={...previous.view,data:{items:previous.view.data.items}},next={...view,data:{items:data.items}};
   if(JSON.stringify(old)===JSON.stringify(next))return structuredClone(previous.view);
   this.service.assertRevision(data.checklistRevision,previous.revision);
  }else if((await this.store.list<Checklist>('checklist',sessionId)).length>=100)throw new AppError('LIMIT_REACHED','This session supports up to 100 independent checklists.',429);
  const version=previous?previous.revision+1:0;
  view.data={...data,checklistId:key,checklistRevision:version};
  const stamp=now();await this.store.put('checklist',{id:key,sessionId,revision:version,view,createdAt:previous?.createdAt??stamp,updatedAt:stamp});
  return view;
 }
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
   const record=await this.get(a.sessionId,a.checklistId),items=record.view.data.items as unknown[];
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
  return this.store.atomic(async()=>this.store.transaction(async()=>{
   await this.service.access(p,a.sessionId,'editor');
   const key=hash(`${p.userId}:${p.tokenId??''}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a));
   const prior=await this.store.get<{digest:string;result:Checklist}>('checklist-request',key);
   if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This request ID refers to a different checklist update.',409);return prior.result;}
   const record=await this.get(a.sessionId,a.checklistId);this.service.assertRevision(a.expectedRevision,record.revision);
   const view=await this.capture(a.sessionId,{...record.view,...(a.title!==undefined?{title:a.title}:{}),data:{...record.view.data,items:a.items}});
   const result=required(await this.store.get<Checklist>('checklist',String(view.data.checklistId)));
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
