import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { KanvasService } from './domain.js';
import { hash, type AuthPrincipal } from './auth.js';
import { AppError, id, now, required } from './store.js';
import type { DisplayRecord, SessionRecord } from '../shared/types.js';
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const archiveListSchema=z.object({sessionId:identifier.optional()}).strict();
export const archiveSchema=z.object({action:z.enum(['archive','restore','request-delete','confirm-delete']).default('archive'),resource:z.enum(['session','display','view']),sessionId:identifier,targetId:identifier.optional(),confirmationSessionId:identifier.optional(),confirmationDisplayId:identifier.optional(),challengeId:identifier.optional(),words:z.string().max(160).optional()}).strict();
interface Target {id:string;sessionId?:string;name?:string;view?:unknown;revision?:number;displayId?:string;archivedAt?:string}
interface Challenge {id:string;sessionId:string;ownerId:string;resource:'session'|'display'|'view';targetId:string;hash:string;expiresAt:number;toastId:string;confirmationSessionId:string;attempts?:number}
const words='Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu'.split(' ');
const normalize=(value:string)=>value.toLowerCase().trim().replace(/[^a-z]+/g,' ').replace(/\bx ray\b/g,'xray').replace(/\bjuliet\b/g,'juliett').trim();
/** Archive is reversible and retained indefinitely. Only explicit owner approval can purge. */
export class Archive {
 constructor(readonly service:KanvasService){}
 private kind(resource:string){return resource==='view'?'display-history':resource;}
 private async owner(p:AuthPrincipal,sessionId:string){
   await this.service.fullAccount(p,'publish');await this.service.auth.assertCurrent(p,'publish',sessionId);
   const session=required(await this.service.store.get<SessionRecord>('session',sessionId,true));
   if(session.ownerId!==p.userId)throw new AppError('NOT_FOUND','Only the session owner can manage its archive.',404);return session;
 }
 async list(p:AuthPrincipal,raw:unknown){
   const a=archiveListSchema.parse(raw);await this.service.fullAccount(p);
   const sessions=(await this.service.store.list<SessionRecord&{archivedAt?:string}>('session',undefined,true)).filter(s=>s.ownerId===p.userId&&(!a.sessionId||s.id===a.sessionId));
   const items=[];
   for(const session of sessions){try{await this.service.auth.assertCurrent(p,'read',session.id);}catch{continue;}
     if(session.archivedAt)items.push({resource:'session',sessionId:session.id,targetId:session.id,name:session.name,archivedAt:session.archivedAt});
     for(const resource of ['display','view'] as const)for(const target of await this.service.store.list<Target>(this.kind(resource),session.id,true))if(target.archivedAt)items.push({resource,sessionId:session.id,targetId:target.id,name:target.name,revision:target.revision,archivedAt:target.archivedAt});
   }
   return {items,retention:'Archived items are kept indefinitely and still count toward free limits. Restore explicitly; permanent deletion requires a fresh 60-second visual confirmation.'};
 }
 async manage(p:AuthPrincipal,raw:unknown){return this.service.store.atomic(async()=>{
   const a=archiveSchema.parse(raw),store=this.service.store;
   await this.owner(p,a.sessionId);
   if(a.resource==='session'&&a.targetId&&a.targetId!==a.sessionId)throw new AppError('INVALID_TARGET','For a session, targetId must match sessionId.');
   const targetId=a.resource==='session'?a.sessionId:required(a.targetId,'Choose a display or retained view ID.'),kind=this.kind(a.resource);
   const target=required(await store.get<Target>(kind,targetId,true));
   if(a.resource!=='session'&&target.sessionId!==a.sessionId)throw new AppError('NOT_FOUND','The target is not in this session.',404);
   if(a.action==='request-delete'){
     const confirmationSessionId=a.confirmationSessionId??a.sessionId;
     await this.service.access(p,confirmationSessionId,'owner');
     const displays=await store.list<DisplayRecord>('display',confirmationSessionId);
     const confirmationDisplayId=a.confirmationDisplayId??(displays.length===1?displays[0].id:undefined);
     if(!confirmationDisplayId)throw new AppError('CONFIRMATION_DISPLAY_REQUIRED','Choose the current display on which to show the deletion warning.');
     await this.service.display(p,confirmationSessionId,confirmationDisplayId,'owner');
     for(const old of await store.list<Challenge>('delete-challenge',a.sessionId))if(old.ownerId===p.userId){await store.delete('delete-challenge',old.id);await store.delete('toast',old.toastId);}
     const code=Array.from({length:3},()=>words[randomInt(words.length)]).join(' '),challengeId=id(),toastId=id(),expiresAt=Date.now()+60000;
     const people=await store.db.prepare('SELECT user_id FROM members WHERE session_id=? AND user_id<>?').all(a.sessionId,p.userId);
     const grants=await store.list<{role:string|null;groupId:string}>('session-group-grant',a.sessionId);
     const groups=[];for(const grant of grants.filter(g=>g.role)){const g=await store.get<{name:string}>('group',grant.groupId);if(g)groups.push(g.name);}
     const shared=people.length||groups.length?` Deleted for everyone, including ${people.length} other member(s)${groups.length?` and groups: ${groups.join(', ')}`:''}.`:'';
     const warning=`PERMANENT DELETE · ${a.resource}: ${target.name??target.revision??target.id}. This cannot be undone.${shared} To authorize deletion, read these words to your agent within 60 seconds: ${code}. Otherwise do nothing; the request expires.`;
     await store.put('toast',{id:toastId,sessionId:confirmationSessionId,displayId:confirmationDisplayId,ownerId:p.userId,confirmation:true,text:warning,severity:'warning',sticky:false,createdAt:now(),expiresAt:new Date(expiresAt).toISOString()});
     const challenge:Challenge={id:challengeId,sessionId:a.sessionId,ownerId:p.userId,resource:a.resource,targetId,hash:hash(normalize(code)),expiresAt,toastId,confirmationSessionId};await store.put('delete-challenge',challenge);
     return {challengeId,expiresAt:new Date(expiresAt).toISOString(),warning:'A non-recoverable deletion warning was sent to the selected current screen; this is not a browser acknowledgement. Ask the user to read the three words back. Never infer approval or retrieve the words yourself.',confirmationSessionId,confirmationDisplayId};
   }
   if(a.action==='confirm-delete'){
     const challenge=required(a.challengeId?await store.get<Challenge>('delete-challenge',a.challengeId):undefined,'Start a fresh permanent-delete request.');
     if(challenge.ownerId!==p.userId||challenge.sessionId!==a.sessionId||challenge.targetId!==targetId||challenge.resource!==a.resource)throw new AppError('NOT_FOUND','The confirmation does not authorize this target.',404);
     if(Date.now()>=challenge.expiresAt)throw new AppError('CONFIRMATION_EXPIRED','The one-minute approval window expired. Nothing was deleted.',410);
     const supplied=hash(normalize(a.words??''));if(!timingSafeEqual(Buffer.from(challenge.hash),Buffer.from(supplied))){challenge.attempts=(challenge.attempts??0)+1;if(challenge.attempts>=3){await store.delete('delete-challenge',challenge.id);await store.delete('toast',challenge.toastId);}else await store.put('delete-challenge',challenge);return {deleted:false,code:'CONFIRMATION_MISMATCH',message:challenge.attempts>=3?'Three incorrect attempts. Start a new request. Nothing was deleted.':'The words did not match. Nothing was deleted.'};}
     await store.delete('delete-challenge',challenge.id);await store.delete('toast',challenge.toastId);
     await this.remove(p,a.resource,a.sessionId,target);
     await this.service.accounts.audit('archive.permanently-deleted',{actorId:p.userId,sessionId:a.sessionId,details:{resource:a.resource,targetId}});
     this.service.emit({type:a.resource==='session'?'ended':'display',sessionId:a.sessionId,...(a.resource==='display'?{displayId:targetId}:{})});
     return {deleted:true,resource:a.resource,targetId,recoverable:false};
   }
   if(a.action==='archive'){
     if(!target.archivedAt){
       if(a.resource==='view')await this.detachView(p,a.sessionId,target);
       target.archivedAt=now();await store.put(kind,target);
     }
   }else{
     delete target.archivedAt;await store.put(kind,target);
     if(a.resource==='view'){
       const timeline=await store.get<{id:string;sessionId:string;entries:string[];cursor:number}>('display-timeline',target.displayId!,true);
       if(timeline&&!timeline.entries.includes(target.id)){timeline.entries.push(target.id);await store.put('display-timeline',timeline);}
     }
   }
   this.service.emit({type:a.resource==='session'&&a.action==='archive'?'ended':'display',sessionId:a.sessionId,...(a.resource==='display'?{displayId:targetId}:{})});
   await this.service.accounts.audit(`archive.${a.action}`,{actorId:p.userId,sessionId:a.sessionId,details:{resource:a.resource,targetId}});
   return {resource:a.resource,targetId,archived:a.action==='archive',recoverable:true};
 });}
 private async detachView(p:AuthPrincipal,sessionId:string,target:Target){
   const store=this.service.store,display=await store.get<DisplayRecord>('display',target.displayId!,true);
   if(display&&display.revision===target.revision&&display.view)await this.service.clear(p,sessionId,[display.id],id());
   const timeline=await store.get<{id:string;sessionId:string;entries:string[];cursor:number}>('display-timeline',target.displayId!,true);
   if(timeline){const current=timeline.entries[timeline.cursor];timeline.entries=timeline.entries.filter(key=>key!==target.id);timeline.cursor=Math.max(0,timeline.entries.indexOf(current));await store.put('display-timeline',timeline);}
 }
 private async remove(p:AuthPrincipal,resource:string,sessionId:string,target:Target){
   const store=this.service.store;
   if(resource==='session'){
     for(const asset of await store.list<{id:string}>('asset',sessionId,true))await store.db.prepare('DELETE FROM assets WHERE id=?').run(asset.id);
     await store.db.prepare('DELETE FROM members WHERE session_id=?').run(sessionId);await store.db.prepare('DELETE FROM requests WHERE session_id=?').run(sessionId);
     await store.db.prepare('DELETE FROM documents WHERE session_id=?').run(sessionId);await store.delete('session',sessionId);
   }else if(resource==='display'){
     for(const row of await store.query<{kind:string;id:string;value:string}>('SELECT kind,id,value FROM documents WHERE session_id=$1',[sessionId]).then(r=>r.rows)){
       const value=JSON.parse(row.value);if(value.displayId===target.id||['display','display-timeline'].includes(row.kind)&&row.id===target.id)await store.delete(row.kind,row.id);
     }
   }else{if(!target.archivedAt)await this.detachView(p,sessionId,target);await store.delete('display-history',target.id);}
 }
}
