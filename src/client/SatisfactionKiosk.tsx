import {useEffect} from 'react';
import {useAuth,useSession} from './hooks';
import {api,displayPath,requestId} from './api';
import {SatisfactionRenderer} from './renderers/Satisfaction';
import type {ViewerRoute} from './Auth';
import './renderers/satisfaction.css';
export function KioskUnavailable(){return <main className="satisfaction-kiosk"><div className="kiosk-unavailable" role="status">Kiosk unavailable</div></main>;}
/** No Viewer/Filmstrip/Navigation controls are mounted. This is app chrome restriction, not OS lockdown. */
export function SatisfactionKiosk({sessionId,displayId}:ViewerRoute){
 const auth=useAuth(),state=useSession(sessionId,displayId),display=state.detail?.displays.find(d=>d.id===displayId);
 const ready=state.connection==='live'&&display?.view?.template==='satisfaction';
 useEffect(()=>{const block=(e:KeyboardEvent)=>{if(['Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End','?','f'].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey)e.preventDefault();};window.addEventListener('keydown',block,true);return()=>window.removeEventListener('keydown',block,true);},[]);
 useEffect(()=>{if(!ready||!display)return;const id=requestAnimationFrame(()=>{void api(displayPath(sessionId,displayId)+'/applied',{method:'POST',body:{revision:display.revision}}).catch(()=>{});});return()=>cancelAnimationFrame(id);},[ready,display?.revision,sessionId,displayId]);
 if(!ready||!display?.view)return <KioskUnavailable/>;
 return <main className="satisfaction-kiosk" onContextMenu={e=>e.preventDefault()}><SatisfactionRenderer view={display.view} revision={display.revision} actionable={(!auth.viewOnly||auth.interactive)&&!auth.captureOnly} onRespond={value=>api(displayPath(sessionId,displayId)+'/respond',{method:'POST',body:{revision:display.revision,requestId:requestId(),value}})}/></main>;
}
