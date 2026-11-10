import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {hash} from './auth.js';
import {AppError} from './store.js';
import type {Definition} from './mcp/canonical.js';

/** Where agents stumble, as daily counters. Shapes only, never content: an
 * operation or template name, a schema field path with array positions
 * removed, a problem class, the MCP client name and version, a UTC day. No
 * payloads, values, prompts, session or account identifiers are stored. Short
 * retention; service administrators read it. Not an observability product. */
export const FRICTION_RETENTION_DAYS=90;
export const FRICTION_KINDS=['validation','retries','discovery','resolve','weight','fallback'] as const;
export type FrictionKind=typeof FRICTION_KINDS[number];
const RETRY_WINDOW_MS=120_000,FLUSH_MS=20_000,MAX_PENDING=4000,MAX_TRACKED=5000;
interface Counter {id:string;day:string;kind:FrictionKind;subject:string;detail:string;client:string;count:number;sum:number;max:number}
export const frictionReadSchema=z.strictObject({
 kind:z.enum(FRICTION_KINDS),
 days:z.number().int().min(1).max(FRICTION_RETENTION_DAYS).default(7),
 client:z.string().max(240).optional(),
 limit:z.number().int().min(1).max(100).default(20),
});
export const frictionTools:Definition[]=[
 {name:'kanvas_friction_read',schema:frictionReadSchema,readOnly:true,description:'Service administrators only. Daily aggregates of where agents stumble: schema misses by field path, retries, discovery calls, resolve outcomes and response weight per template or operation and client. Shapes only.'},
];
const label=(value:unknown,max=120)=>String(value??'').replace(/[^A-Za-z0-9 ._:/()\[\]-]/g,'').slice(0,max);
/** items[3].start -> items[].start. Only schema field names reach an issue path. */
export const fieldShape=(path:string)=>label(path.replace(/\[\d+\]/g,'[]').replace(/<record-key>/g,'*'),160);
export function problemClass(problem:string,issue:{expected?:string;received?:string;maximum?:number;allowedFields?:unknown}={}):string{
 if(/^Unsupported field|Unsupported singular field/.test(problem))return 'unsupported-field';
 if(/^Required /.test(problem)||issue.received==='missing')return 'missing-required';
 if(/^Expected (?:ISO|an? |text matching|absolute|email|UUID)/.test(problem))return 'format';
 if(/^Expected /.test(problem))return 'wrong-type';
 if(/Choose one of|must be one of/.test(problem))return 'enum-mismatch';
 if(/^Maximum /.test(problem)||issue.maximum!==undefined)return 'too-big';
 if(/below the supported minimum/.test(problem))return 'too-small';
 if(/Unknown template name/.test(problem))return 'unknown-template';
 return 'other';
}
export interface FrictionCall {
 operation?:string;template?:string;client?:{name?:string;version?:string};connection:string;ok:boolean;
 issues?:readonly {path:string;problem:string;expected?:string;received?:string;maximum?:number}[];
 status?:string;responseBytes?:number;discovery?:string;resolveStatus?:string;
}
export class Friction{
 private pending=new Map<string,Counter>();
 private failures=new Map<string,{count:number;at:number}>();
 private discoveries=new Map<string,number>();
 private published=new Set<string>();
 private timer?:ReturnType<typeof setInterval>;
 private flushing?:Promise<void>;
 private lastPrune=0;
 constructor(private service:KanvasService){}
 start(){this.timer??=setInterval(()=>void this.flush().catch(()=>{}),FLUSH_MS);this.timer.unref();}
 async close(){if(this.timer)clearInterval(this.timer);this.timer=undefined;await this.flush().catch(()=>{});}
 private add(kind:FrictionKind,subject:string,detail:string,client:string,value=0){
  const day=new Date().toISOString().slice(0,10),id=hash(`${day}\0${kind}\0${subject}\0${detail}\0${client}`).slice(0,40);
  const counter=this.pending.get(id)??{id,day,kind,subject:label(subject),detail:label(detail,160),client:label(client,240),count:0,sum:0,max:0};
  counter.count++;counter.sum+=value;counter.max=Math.max(counter.max,value);
  // Telemetry never grows without bound and never blocks a call.
  if(this.pending.size<MAX_PENDING||this.pending.has(id))this.pending.set(id,counter);
 }
 /** Named outcome from inside the service (no client detail available). */
 count(_p:AuthPrincipal,event:'needs-template'|'fact-fallback',_details:Record<string,never>){this.add('fallback',event,'','unknown');}
 /** One finished MCP call. Everything recorded is a name, a class or a number. */
 record(call:FrictionCall){
  try{
   const client=`${label(call.client?.name||'unknown',160)} ${label(call.client?.version||'',60)}`.trim(),subject=call.template?`template:${label(call.template,64)}`:`operation:${label(call.operation??'discover',100)}`;
   if(call.responseBytes!==undefined&&call.operation)this.add('weight',`operation:${label(call.operation,100)}`,`bytes<=${2**Math.max(8,Math.ceil(Math.log2(Math.max(1,call.responseBytes))))}`,client,call.responseBytes);
   if(call.resolveStatus)this.add('resolve','resolve',label(call.resolveStatus,40),client);
   const connection=hash(call.connection).slice(0,24);
   if(call.discovery){const key=connection;this.discoveries.set(key,(this.discoveries.get(key)??0)+1);if(this.discoveries.size>MAX_TRACKED)this.discoveries.delete(this.discoveries.keys().next().value!);return;}
   if(!call.operation)return;
   const family=`${connection}:${subject}`,now=Date.now();
   if(!call.ok){
    for(const issue of (call.issues??[]).slice(0,20))this.add('validation',subject,`${fieldShape(issue.path)} :: ${problemClass(issue.problem,issue)}`,client);
    if(!call.issues?.length&&call.status)this.add('validation',subject,`(call) :: ${label(call.status,40)}`,client);
    const prior=this.failures.get(family);this.failures.set(family,{count:prior&&now-prior.at<RETRY_WINDOW_MS?prior.count+1:1,at:now});
    if(this.failures.size>MAX_TRACKED)this.failures.delete(this.failures.keys().next().value!);
    return;
   }
   if(call.operation==='kanvas_submit'&&call.template){
    const prior=this.failures.get(family),attempts=1+(prior&&now-prior.at<RETRY_WINDOW_MS?prior.count:0);this.failures.delete(family);
    this.add('retries',subject,`attempts:${Math.min(attempts,10)}`,client,attempts);
    if(!this.published.has(family)){this.published.add(family);if(this.published.size>MAX_TRACKED)this.published.delete(this.published.values().next().value!);this.add('discovery',subject,`discover-calls:${Math.min(this.discoveries.get(connection)??0,20)}`,client,this.discoveries.get(connection)??0);}
    this.discoveries.delete(connection);
   }
  }catch{/* Counting never affects the call. */}
 }
 async flush():Promise<void>{
  if(this.flushing)return this.flushing;
  const batch=[...this.pending.values()];this.pending.clear();
  if(!batch.length&&Date.now()-this.lastPrune<3_600_000)return;
  this.flushing=(async()=>{
   try{
    await this.service.store.atomic(async()=>{
     for(const counter of batch){
      const saved=await this.service.store.get<Counter>('friction-day',counter.id);
      await this.service.store.put('friction-day',saved?{...saved,count:saved.count+counter.count,sum:saved.sum+counter.sum,max:Math.max(saved.max,counter.max)}:counter);
     }
     if(Date.now()-this.lastPrune>=3_600_000){
      this.lastPrune=Date.now();const cutoff=new Date(Date.now()-FRICTION_RETENTION_DAYS*86_400_000).toISOString().slice(0,10);
      // Only these aggregate rows are pruned. Audit and raw events are untouched.
      for(const old of await this.service.store.list<Counter>('friction-day'))if(old.day<cutoff)await this.service.store.delete('friction-day',old.id);
     }
    });
   }catch{for(const counter of batch)if(this.pending.size<MAX_PENDING&&!this.pending.has(counter.id))this.pending.set(counter.id,counter);}
   finally{this.flushing=undefined;}
  })();
  return this.flushing;
 }
 async read(p:AuthPrincipal,raw:unknown){
  const a=frictionReadSchema.parse(raw);
  if(!await this.service.accounts.isServiceAdmin(p))throw new AppError('FORBIDDEN','Agent-friction aggregates are available to service administrators only.',403);
  await this.flush();
  const from=new Date(Date.now()-(a.days-1)*86_400_000).toISOString().slice(0,10);
  const rows=(await this.service.store.list<Counter>('friction-day')).filter(row=>row.kind===a.kind&&row.day>=from&&(!a.client||row.client===a.client));
  const grouped=new Map<string,{subject:string;detail:string;count:number;sum:number;max:number;clients:Map<string,number>}>();
  for(const row of rows){
   const key=a.kind==='validation'||a.kind==='resolve'||a.kind==='fallback'?`${row.subject}\0${row.detail}`:row.subject;
   const entry=grouped.get(key)??{subject:row.subject,detail:a.kind==='validation'||a.kind==='resolve'||a.kind==='fallback'?row.detail:'',count:0,sum:0,max:0,clients:new Map<string,number>()};
   entry.count+=row.count;entry.sum+=row.sum;entry.max=Math.max(entry.max,row.max);entry.clients.set(row.client,(entry.clients.get(row.client)??0)+row.count);grouped.set(key,entry);
  }
  /** Percentile from the coarse histogram stored in detail (attempts:n, discover-calls:n, bytes<=n). */
  const percentile=(subject:string,share:number)=>{
   const buckets=new Map<number,number>();for(const row of rows.filter(r=>r.subject===subject)){const value=Number(/(\d+)$/.exec(row.detail)?.[1]);if(Number.isFinite(value))buckets.set(value,(buckets.get(value)??0)+row.count);}
   const total=[...buckets.values()].reduce((x,y)=>x+y,0);let seen=0;
   for(const [value,count] of [...buckets].sort((x,y)=>x[0]-y[0])){seen+=count;if(seen>=total*share)return value;}
   return 0;
  };
  const entries=[...grouped.values()].map(entry=>{
   const base={subject:entry.subject,count:entry.count,clients:Object.fromEntries([...entry.clients].sort((x,y)=>y[1]-x[1]).slice(0,6))};
   if(a.kind==='validation'){const [fieldPath,problem]=entry.detail.split(' :: ');return {...base,fieldPath,problem};}
   if(a.kind==='resolve'||a.kind==='fallback')return {...base,outcome:entry.detail||entry.subject};
   if(a.kind==='weight')return {...base,p50Bytes:percentile(entry.subject,.5),p95Bytes:percentile(entry.subject,.95),maxBytes:entry.max,meanBytes:Math.round(entry.sum/Math.max(1,entry.count))};
   return {...base,median:percentile(entry.subject,.5),p95:percentile(entry.subject,.95),max:entry.max,mean:Math.round(entry.sum/Math.max(1,entry.count)*100)/100};
  });
  const rank=(entry:Record<string,unknown>)=>a.kind==='weight'?Number(entry.p95Bytes):a.kind==='retries'||a.kind==='discovery'?Number(entry.median)*1e6+Number(entry.count):Number(entry.count);
  entries.sort((x,y)=>rank(y)-rank(x));
  return {kind:a.kind,from,days:a.days,...(a.client?{client:a.client}:{}),total:entries.length,entries:entries.slice(0,a.limit),retentionDays:FRICTION_RETENTION_DAYS,
   note:'Daily aggregates of shapes only: operation or template, schema field path, problem class and MCP client. No content, values, session or account identifiers. Weight percentiles are bucket upper bounds (powers of two).'};
 }
}
