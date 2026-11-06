import {afterPaint} from './after-paint';
import {renderedView,paintedView} from './delivery-timing';
import {viewerTabId} from './window-identity';
import {useEffect,useState} from 'react';
import {useAuth,useSession} from './hooks';
import {api,displayPath,sessionPath,requestId} from './api';
import {Renderer} from './renderers/Renderer';
import type {ViewSpec,InteractionRecord} from '../shared/types';
import type {ViewerRoute} from './Auth';
import './renderers/satisfaction.css';
export function KioskUnavailable(){return <main className="satisfaction-kiosk"><div className="kiosk-unavailable" role="status">Kiosk unavailable</div></main>;}
/** No Viewer/Filmstrip/Navigation controls are mounted. This is app chrome restriction, not OS lockdown. */
export function SatisfactionKiosk({sessionId,displayId}:ViewerRoute){
 const state=useSession(sessionId,displayId);return <GeneralKiosk sessionId={sessionId} displayId={displayId} state={state}/>;
}
export function GeneralKiosk({sessionId,displayId,state}:ViewerRoute&{state:ReturnType<typeof useSession>}){
 const auth=useAuth(),display=state.detail?.displays.find(d=>d.id===displayId);
 const ready=state.connection==='live'&&Boolean(display?.view);
 const [renderedRevision,setRenderedRevision]=useState<number>();
 useEffect(()=>{
  if(!ready||!display||renderedRevision!==display.revision||auth.captureOnly)return;
  return afterPaint(()=>{
   void api(displayPath(sessionId,displayId)+'/applied',{method:'POST',body:{revision:display.revision}}).catch(()=>{});
   const timing=paintedView(sessionId,displayId,display.revision);
   if(timing?.visible)void api(displayPath(sessionId,displayId)+'/paint-timing',{method:'POST',body:{...timing,revision:display.revision,tabId:viewerTabId(),connection:state.connection}}).catch(()=>{});
   window.dispatchEvent(new CustomEvent('kanvas:painted',{detail:{sessionId,displayId,renderedRevision:display.revision}}));
  });
 },[ready,display?.revision,renderedRevision,auth.captureOnly,sessionId,displayId]);
 useEffect(()=>{const block=(e:KeyboardEvent)=>{if(e.target instanceof Element&&e.target.closest('input,textarea,select,button,[contenteditable=true],[role=slider],[role=radio]'))return;if(['Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','?','f'].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey)e.preventDefault();};window.addEventListener('keydown',block,true);return()=>window.removeEventListener('keydown',block,true);},[]);

 if(!ready||!display?.view)return <KioskUnavailable/>;
 let view=display.view;
 while(view.template==='presentation')view=(view.data.slides as ViewSpec[])[Number(view.data.index??0)];
 const config=state.detail?.session.config,theme=config?.theme==='light'?'light':config?.theme==='system'&&!matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark';
 return <main className={`satisfaction-kiosk viewer-shell theme-${theme}`} data-kiosk="true" onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(e.target instanceof Element&&e.target.closest('a'))e.preventDefault();}}><Renderer view={{...view,showControls:false,showSource:false}} config={config} sessionId={sessionId} displayId={displayId} revision={display.revision} serverNow={display.serverNow} responseState={display.responseState} actionable={(!auth.viewOnly||auth.interactive)&&!auth.captureOnly} renderIdentity={display.revision} onReady={()=>{renderedView(sessionId,displayId,display.revision);setRenderedRevision(display.revision);}} onError={code=>{setRenderedRevision(undefined);if(!auth.captureOnly)void api(displayPath(sessionId,displayId)+'/delivery',{method:'POST',body:{revision:display.revision,status:'failed',code:code??'VIEW_RENDER_FAILED'}}).catch(()=>{});}} videoCommand={!auth.captureOnly?display.videoCommand:undefined} onVideoCommandResult={async(commandId,result)=>{await api(displayPath(sessionId,displayId)+'/video-commands/'+encodeURIComponent(commandId)+'/result',{method:'POST',body:result});await state.reload();}} feedback={state.detail?.interactions} onAction={async(item,value)=>{const result=await api<InteractionRecord>(sessionPath(sessionId)+'/interactions',{method:'POST',body:{displayId,revision:display.revision,actionId:item.id,value,requestId:requestId()}});await state.reload();return result.id;}} onRespond={(value,expectedRevision)=>api(displayPath(sessionId,displayId)+'/respond',{method:'POST',body:{revision:expectedRevision??display.revision,requestId:requestId(),value}})}/></main>;
}
