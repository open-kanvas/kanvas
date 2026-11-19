import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {hash} from './auth.js';
import {AppError,id,now} from './store.js';
import {viewerUploadSchema} from '../shared/file-upload.js';
import {formDataSchema} from '../shared/view-schemas.js';
import {displayedLeaf} from './engagement.js';
import {validateMedia} from './rendering/media.js';
import type {InteractionRecord} from '../shared/types.js';
export interface ViewerUploadRecord {id:string;sessionId:string;displayId:string;revision:number;fieldId?:string;actor:string;assetId:string;name:string;mimeType:string;size:number;createdAt:string;digest:string}
export class SessionUploads{
 constructor(private readonly s:KanvasService){}
 async upload(p:AuthPrincipal,sessionId:string,displayId:string,raw:unknown){
  const a=viewerUploadSchema.parse(raw);
  if(!p.browserId||p.captureOnly||p.scopedSessionId&&!p.interactive)throw new AppError('FORBIDDEN','This screen cannot upload files.',403);
  return this.s.store.atomic(async()=>{
   const display=await this.s.display(p,sessionId,displayId);
   this.s.assertRevision(a.revision,display.revision);
   const actor=p.participantId??p.userId,key=hash(actor+':'+sessionId+':'+displayId+':'+a.requestId),digest=hash(JSON.stringify(a));
   const prior=await this.s.store.get<ViewerUploadRecord>('viewer-upload',key);
   if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Upload request id already used.',409);return {assetId:prior.assetId,name:prior.name,mimeType:prior.mimeType,size:prior.size};}
   if((await this.s.store.list<InteractionRecord>('interaction',sessionId)).filter(i=>i.status==='pending').length>=1000)throw new AppError('INBOX_FULL','This session has too many pending actions.',429);
   const media=validateMedia(a);
   const leaf=displayedLeaf(display.view);
   if(a.fieldId){
    if(leaf?.template!=='form')throw new AppError('INVALID_RESPONSE','No form on this display.');
    const form=formDataSchema.parse(leaf.data),field=form.fields.find(f=>f.id===a.fieldId);
    if(form.closed||field?.type!=='file')throw new AppError('INVALID_RESPONSE','This file field is unavailable.');
    if(!field.accept.includes(a.mimeType)||media.size>field.maxSize)throw new AppError('INVALID_MEDIA','File does not match this field’s type or size limit.');
   }
   const uploads=await this.s.store.list<ViewerUploadRecord>('viewer-upload',sessionId);
   if(uploads.filter(x=>x.actor===actor&&Date.now()-Date.parse(x.createdAt)<60000).length>=20)throw new AppError('RATE_LIMIT','Please wait before uploading more files.',429);
   if((await this.s.store.list('asset',sessionId)).length>=500)throw new AppError('LIMIT_REACHED','Remove unused session assets before uploading more.',429);
   return this.s.store.transaction(async()=>{
    const asset=await this.s.storeMedia(sessionId,a);
    const record:ViewerUploadRecord={id:key,sessionId,displayId,revision:a.revision,fieldId:a.fieldId,actor,assetId:asset.id,name:asset.name,mimeType:asset.mimeType,size:asset.size,createdAt:now(),digest};
    await this.s.store.put('viewer-upload',record);
    const interaction:InteractionRecord={id:id(),sessionId,displayId,revision:display.revision,actionId:'assets.upload',value:{assetId:asset.id,name:asset.name,mimeType:asset.mimeType,size:asset.size,...(a.fieldId?{fieldId:a.fieldId}:{})},userId:actor,targetAgentId:display.targetAgentId,status:'pending',createdAt:now()};
    await this.s.store.put('interaction',interaction);
    this.s.store.afterCommit(()=>this.s.emit({type:'update',sessionId,displayId}));
    return {assetId:asset.id,name:asset.name,mimeType:asset.mimeType,size:asset.size};
   });
  });
 }
}
