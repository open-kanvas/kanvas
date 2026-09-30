import { asyncMap } from './async-collections.js';
import { z } from 'zod';
import type { Express,Request } from 'express';
import type { AssetRecord,DisplayRecord,SessionConfig,SessionRecord,ViewSpec } from '../shared/types.js';
import { toolLogDataSchema } from '../shared/event-views.js';
import type { AuthPrincipal } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError,now,required } from './store.js';
import { displayedLeaf } from './engagement.js';
export const publicAccessSchema=z.object({sessionId:z.string().min(1).max(128),expectedRevision:z.number().int().nonnegative(),enabled:z.boolean(),confirm:z.literal(true)}).strict();
export async function setPublicAccess(service:KanvasService,p:AuthPrincipal,raw:unknown){
  return service.store.atomic(async () => {
  const a=publicAccessSchema.parse(raw);(await service.fullAccount(p,'publish'));(await service.access(p,a.sessionId,'owner'));
  const session=required((await service.store.get<SessionRecord>('session',a.sessionId)));service.assertRevision(a.expectedRevision,session.publicAccess?.revision??0);
  session.publicAccess={enabled:a.enabled,revision:(session.publicAccess?.revision??0)+1};session.updatedAt=now();(await service.store.put('session',session));
  (await service.accounts.audit('session.public-access',{actorId:p.userId,sessionId:session.id}));service.emit({type:'membership',sessionId:session.id});
  return {sessionId:session.id,...session.publicAccess,url:`${service.publicUrl}/session/${session.id}`,access:a.enabled?'Anonymous read-only access to current session displays. No account or management access.':'Private; anonymous readers revoked.'};

  });
}
export async function publicSession(service:KanvasService,sessionId:string){const s=(await service.store.get<SessionRecord>('session',sessionId));if(!s||s.endedAt||!s.publicAccess?.enabled)throw new AppError('NOT_FOUND','This public session is unavailable.',404);return s;}
function currentView(view:ViewSpec|null):ViewSpec|null{
  // Only what is currently published. No hidden future deck slides, retained
  // history, datasets or reports are exposed. Dynamic content is projected only
  // when its corresponding view is explicitly on the public display.
  const leaf=displayedLeaf(view);return leaf?structuredClone(leaf):null;
}
const assetFields=new Set(['url','snapshotUrl','poster','image','artwork','thumbnail','photo','logo']);
function mapAssets(value:unknown,visit:(assetId:string,url:string)=>string,key=''):unknown{
  if(typeof value==='string'){
    const match=assetFields.has(key)&&/^\/api\/assets\/([A-Za-z0-9_-]{1,128})$/.exec(value);
    return match?visit(match[1],value):value;
  }
  if(Array.isArray(value))return value.map(x=>mapAssets(x,visit,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['values','source','text','html','json'].includes(k)?v:mapAssets(v,visit,k)]));
  return value;
}
function mapViewAssets(view:ViewSpec|null,visit:(assetId:string,url:string)=>string):ViewSpec|null{
  if(!view)return null;
  // A table's raw cells are source values, not URLs to rewrite or share.
  if(view.template==='table')return {...view,data:{...view.data,...(view.data.cellStyles?{cellStyles:mapAssets(view.data.cellStyles,visit)}:{})}};
  return mapAssets(view,visit) as ViewSpec;
}
function assetReferences(view:ViewSpec|null,refs:Set<string>){mapViewAssets(view,(id,url)=>{refs.add(id);return url;});return refs;}
export async function publicSnapshot(service:KanvasService,sessionId:string){
  const session=(await publicSession(service,sessionId)),config:SessionConfig={...session.config};delete config.branding;
  // No account-owned branding images or private profile APIs are exposed.
  return {session:{id:session.id,name:session.name,config,publicRevision:session.publicAccess!.revision},serverNow:now(),displays:(await asyncMap((await service.store.list<DisplayRecord>('display',session.id)), async d=>{
    const leaf=currentView(d.view),view=mapViewAssets(leaf,id=>`/api/public/sessions/${session.id}/assets/${id}`);
    return {id:d.id,name:d.name,revision:d.revision,view,navigation:(await service.navigation.publicPosition(session.id,d.id)),
      ...(leaf?.template==='tool-call-log'?{toolLog:(await service.toolLog.publicView(session.id,toolLogDataSchema.parse(leaf.data).channel,toolLogDataSchema.parse(leaf.data).limit))}:{}),
      ...(leaf?.template==='session-topology'?{topology:(await service.topology.publicDisplay(session.id,d.id))}:{}),
      };
  }))};
}
export async function mountPublicSessions(app:Express,service:KanvasService,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.post('/api/sessions/:id/public-access',async (req,res)=>res.json({data:(await setPublicAccess(service,(await browser(req)),{...req.body,sessionId:String(req.params.id)}))}));
  // A locator alone grants nothing. Return only a destination, never private
  // names, contents or membership. Session short keys reach normal pairing.
  app.get('/api/entry/:id',async (req,res)=>{const s=required((await service.store.get<SessionRecord>('session',String(req.params.id))));if(s.endedAt)throw new AppError('NOT_FOUND','This session is unavailable.',404);const d=(await service.store.list<DisplayRecord>('display',s.id))[0];let member=false;try{(await service.access((await browser(req)),s.id));member=true;}catch{/* Anonymous/public readers have no private authority. */}res.json({data:{public:s.publicAccess?.enabled===true,member,...(d?{displayId:d.id}:{})}});});
  app.get('/api/public/sessions/:id',async (req,res)=>res.json({data:(await publicSnapshot(service,String(req.params.id)))}));
  (await app.get('/api/public/sessions/:id/assets/:assetId',async (req,res)=>{
    const session=(await publicSession(service,String(req.params.id))),assetId=String(req.params.assetId),refs=new Set<string>();for(const d of (await service.store.list<DisplayRecord>('display',session.id)))assetReferences(currentView(d.view),refs);
    const asset=(await service.store.get<AssetRecord>('asset',assetId));if(!asset||asset.sessionId!==session.id||!refs.has(assetId))throw new AppError('NOT_FOUND','This published asset is unavailable.',404);
    const row=required((await service.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(assetId)));if(asset.mimeType==='image/svg+xml')res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.set('Content-Type',asset.mimeType).send(Buffer.from(row.bytes as Uint8Array));
  }));
  const streams=new Set<()=>void>();
  app.get('/api/public/sessions/:id/events',async (req,res)=>{
    const sessionId=String(req.params.id);(await publicSession(service,sessionId));
    if(streams.size>=256)throw new AppError('LIMIT_REACHED','Public viewer capacity is busy. Retry shortly.',429);
    res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write(': connected\n\n');
    let closed=false;const end=()=>{if(closed)return;closed=true;clearInterval(timer);off();streams.delete(end);res.end();};
    const push=async ()=>{try{(await publicSession(service,sessionId));if(!res.write('event: change\ndata: {}\n\n'))end();}catch{res.write('event: revoked\ndata: {}\n\n');end();}};
    const off=service.onEvent(async event=>{if(event.sessionId===sessionId&&event.type!=='identify')(await push());});const timer=setInterval(push,15000);timer.unref();streams.add(end);req.on('close',end);
  });
  return ()=>{for(const close of streams)close();};
}
