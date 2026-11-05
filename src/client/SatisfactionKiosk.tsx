import {useEffect} from 'react';
import {useAuth,useSession} from './hooks';
import {api,displayPath,requestId} from './api';
import {Renderer} from './renderers/Renderer';
import type {ViewSpec} from '../shared/types';
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
 useEffect(()=>{const block=(e:KeyboardEvent)=>{if(['Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','?','f'].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey)e.preventDefault();};window.addEventListener('keydown',block,true);return()=>window.removeEventListener('keydown',block,true);},[]);

 if(!ready||!display?.view)return <KioskUnavailable/>;
 let view=display.view;
 while(view.template==='presentation')view=(view.data.slides as ViewSpec[])[Number(view.data.index??0)];
 const config=state.detail?.session.config,theme=config?.theme==='light'?'light':config?.theme==='system'&&!matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark';
 return <main className={`satisfaction-kiosk viewer-shell theme-${theme}`} data-kiosk="true" onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if((e.target as Element).closest('a'))e.preventDefault();}}><Renderer view={{...view,showControls:false,showSource:false}} config={config} sessionId={sessionId} displayId={displayId} revision={display.revision} serverNow={display.serverNow} responseState={display.responseState} actionable={(!auth.viewOnly||auth.interactive)&&!auth.captureOnly} onReady={()=>{void api(displayPath(sessionId,displayId)+'/applied',{method:'POST',body:{revision:display.revision}}).catch(()=>{});}} onRespond={value=>api(displayPath(sessionId,displayId)+'/respond',{method:'POST',body:{revision:display.revision,requestId:requestId(),value}})}/></main>;
}
