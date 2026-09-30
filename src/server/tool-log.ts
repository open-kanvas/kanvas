import { z } from 'zod';
import { toolCallSchema,toolLogDataSchema,type ToolCall } from '../shared/event-views.js';
import { hash,type AuthPrincipal } from './auth.js';
import type { KanvasService } from './domain.js';
import { displayedLeaf } from './engagement.js';
import type { ToolInvocation } from './mcp/types.js';
import { AppError } from './store.js';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
export const toolLogAppendSchema=z.object({sessionId:id,channel:id.default('main'),requestId:id,events:z.array(toolCallSchema).min(1).max(100)}).strict();
export const toolLogReadSchema=z.object({sessionId:id.optional(),channel:id.default('main'),limit:z.number().int().min(1).max(200).default(100),before:id.optional()}).strict();
interface StoredCall {id:string;sessionId:string;channel:string;event:ToolCall}
export class ToolLog {
  constructor(readonly service:KanvasService){}
  async capture(p:AuthPrincipal,invocation:ToolInvocation){
    return this.service.store.atomic(async () => {
    (await this.service.fullAccount(p));
    let sessionId=invocation.sessionId;
    if(sessionId){try{(await this.service.access(p,sessionId));}catch{(await this.service.accounts.account(p));sessionId=undefined;}}else (await this.service.accounts.account(p));
    const ownerKey=sessionId??`account:${p.userId}`;
    const count=Number((await this.service.store.db.prepare("SELECT count(*) AS n FROM documents WHERE kind='tool-log-event' AND session_id=?").get(ownerKey))!.n);
    if(count>=100000)return;
    const {sessionId:_requestedSession,...metadata}=invocation;
    const event:ToolCall={...metadata,...(sessionId?{sessionId}:{}),integration:'KANVAS',source:'automatic'};
    (await this.service.store.put('tool-log-event',{id:hash(`${ownerKey}:main:${event.id}`),sessionId:ownerKey,channel:'main',event}));

    });
  }
  async append(p:AuthPrincipal,raw:unknown){
    return this.service.store.atomic(async () => {
    const a=toolLogAppendSchema.parse(raw);(await this.service.fullAccount(p,'publish'));(await this.service.access(p,a.sessionId,'editor'));
    const key=hash(`${p.tokenId??p.userId}:${a.sessionId}:${a.requestId}`),digest=hash(JSON.stringify(a)),previous=(await this.service.store.get<{digest:string;result:unknown}>('tool-log-receipt',key));
    if(previous){if(previous.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','This request ID was used for different calls.',409);return previous.result;}
    const count=Number((await this.service.store.db.prepare("SELECT count(*) AS n FROM documents WHERE kind='tool-log-event' AND session_id=?").get(a.sessionId))!.n);
    if(count+a.events.length>100000)throw new AppError('LIMIT_REACHED','This session has reached 100000 retained calls. Export/read its history and start another session; existing calls are not deleted.',429);
    if(a.events.some(e=>e.source==='automatic'))throw new AppError('INVALID_ARGUMENT','Automatic call attribution is server-owned.');
    const records=a.events.map(event=>({id:hash(`${a.sessionId}:${a.channel}:${event.id}`),sessionId:a.sessionId,channel:a.channel,event}));
    for(const record of records){const old=(await this.service.store.get<StoredCall>('tool-log-event',record.id));if(old&&JSON.stringify(old.event)!==JSON.stringify(record.event))throw new AppError('EVENT_ID_CONFLICT','A supplied call ID already has different content. Use a distinct ID for each event.',409);}
    if(new Set(records.map(x=>x.id)).size!==records.length)throw new AppError('EVENT_ID_CONFLICT','Call IDs must be unique within a batch.');
    const result={accepted:true,channel:a.channel,eventIds:a.events.map(x=>x.id),persistent:true};
    (await this.service.store.transaction(async ()=>{for(const record of records)if(!(await this.service.store.get('tool-log-event',record.id)))(await this.service.store.put('tool-log-event',record));(await this.service.store.put('tool-log-receipt',{id:key,sessionId:a.sessionId,digest,result}));}));
    this.service.emit({type:'display',sessionId:a.sessionId});return result;

    });
  }
  private async records(sessionId:string,channel:string,limit:number,before?:string){
    let rowid=Number.MAX_SAFE_INTEGER;
    if(before){const cursor=(await this.service.store.db.prepare("SELECT rowid,value FROM documents WHERE kind='tool-log-event' AND id=? AND session_id=?").get(before,sessionId));if(!cursor||JSON.parse(String(cursor.value)).channel!==channel)throw new AppError('INVALID_CURSOR','That call cursor is unavailable.');rowid=Number(cursor.rowid);}
    const rows=(await this.service.store.db.prepare("SELECT id,value FROM documents WHERE kind='tool-log-event' AND session_id=? AND (value::jsonb->>'channel')=? AND rowid<? ORDER BY rowid DESC LIMIT ?").all(sessionId,channel,rowid,limit+1));
    const retained=Number((await this.service.store.db.prepare("SELECT count(*) AS n FROM documents WHERE kind='tool-log-event' AND session_id=?").get(sessionId))!.n);
    const page=rows.slice(0,limit);return {events:page.map(x=>(JSON.parse(String(x.value)) as StoredCall).event),...(rows.length>limit?{nextCursor:String(page.at(-1)!.id)}:{}),order:'newest-first',persistent:true,recording:{capacity:100000,retained,automatic:retained<100000?'active':'capacity-reached'}};
  }
  async read(p:AuthPrincipal,raw:unknown){const a=toolLogReadSchema.parse(raw);(await this.service.fullAccount(p));if(a.sessionId)(await this.service.access(p,a.sessionId));else (await this.service.accounts.account(p));return (await this.records(a.sessionId??`account:${p.userId}`,a.channel,a.limit,a.before));}
  async forDisplay(p:AuthPrincipal,sessionId:string,displayId:string){const d=(await this.service.display(p,sessionId,displayId)),v=displayedLeaf(d.view);if(v?.template!=='tool-call-log')throw new AppError('INVALID_VIEW','This display is not a tool-call log.',409);const a=toolLogDataSchema.parse(v.data);return (await this.records(sessionId,a.channel,a.limit));}
  async publicView(sessionId:string,channel:string,limit:number){return (await this.records(sessionId,channel,limit));}
}
