import { asyncFlatMap } from './async-collections.js';
import type { Express,Request } from 'express';
import type { DisplayRecord,ViewSpec } from '../shared/types.js';
import type { AuthPrincipal } from './auth.js';
import type { KanvasService } from './domain.js';
import { AppError } from './store.js';

/** Positional reading, not history mutation. A viewer never moves the shared
 * history cursor. A paired guest cannot discover past or unrelated content. */
export async function browsingFrames(service:KanvasService,p:AuthPrincipal,sessionId:string,displayId:string,metadataOnly=false){
  (await service.display(p,sessionId,displayId));
  const displays=p.scopedDisplayId?[(await service.display(p,sessionId,displayId))]:(await service.store.list<DisplayRecord>('display',sessionId));
  return (await asyncFlatMap(displays, async d=>(await service.history.frames(d,metadataOnly)).filter(e=>e.view&&e.view.template!=='overview'&&e.view.template!=='settings'&&(!p.scopedDisplayId||e.current)).flatMap(e=>e.view?.template==='presentation'?(e.view.data.slides as ViewSpec[]).map((view,index)=>({...e,id:`${e.id}--slide-${index}`,view,current:e.current&&index===Number(e.view!.data.index??0),slideIndex:index,displayName:d.name,displayRevision:d.revision,width:d.width,height:d.height})): [{...e,slideIndex:0,displayName:d.name,displayRevision:d.revision,width:d.width,height:d.height}]))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.displayId.localeCompare(b.displayId)||a.revision-b.revision||a.slideIndex-b.slideIndex);
}
export function mountSessionBrowsing(app:Express,service:KanvasService,browser:(req:Request)=>Promise<Awaited<AuthPrincipal>>){
  app.get('/api/sessions/:id/displays/:displayId/filmstrip',async (req,res)=>{const p=(await browser(req)),sessionId=String(req.params.id),displayId=String(req.params.displayId),frames=(await browsingFrames(service,p,sessionId,displayId,true));
    res.json({data:{frames:frames.map(({view,interactionEpoch:_epoch,...e})=>({...e,title:view?.title,template:view?.template})),liveFrameId:frames.find(f=>f.displayId===displayId&&f.current)?.id,limit:1000,privateBrowsing:true}});
  });
  app.get('/api/sessions/:id/displays/:displayId/filmstrip/:frameId',async (req,res)=>{const p=(await browser(req)),sessionId=String(req.params.id),displayId=String(req.params.displayId),frame=(await browsingFrames(service,p,sessionId,displayId,true)).find(f=>f.id===req.params.frameId);
    if(!frame)throw new AppError('FRAME_UNAVAILABLE','This retained position is unavailable. Reload the session overview.',404);
    const baseId=frame.id.replace(/--slide-[0-9]+$/,'');const retained=await service.store.get<{view:ViewSpec}>('display-history',baseId);const source=retained?.view??(await service.display(p,sessionId,frame.displayId)).view;const fullView=source?.template==='presentation'?(source.data.slides as ViewSpec[])[frame.slideIndex]:source;if(!fullView)throw new AppError('FRAME_UNAVAILABLE','The retained view is unavailable.',404);
    const {interactionEpoch:_epoch,...visible}=frame;visible.view=fullView;res.json({data:{...visible,config:(await service.access(p,sessionId)).config}});
  });
}
