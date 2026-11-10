import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Wordmark} from './icons';
import {diagnostic} from './frontend-diagnostics';
import {privacyBackoffMs,probePrivacyStatus,runPrivacyCycle} from './device-privacy-check';
type State='checking'|'open'|'locked'|'offline';
/** How long an unknown state stays quiet before it is named, and before the
 * person is told plainly that Kanvas cannot be reached. */
const QUIET_MS=1500,FALLBACK_MS=8000;
/** Mounted above authentication/router so no route can reveal cached content.
 * Failure is closed: content is unmounted until an unlocked answer arrives.
 * Verification is hedged and restarts on every resume/online signal so a
 * reopened phone is not left waiting on one dead request. */
export function DevicePrivacyBoundary({children}:{children:ReactNode}){
 const [state,setState]=useState<State>('checking');
 const [waited,setWaited]=useState(0);
 const kick=useRef<()=>void>(()=>{});
 const wasOpen=useRef(false);
 useEffect(()=>{let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,active:AbortController|undefined,failures=0,since=performance.now(),reported=false,visible=false,cycleStarted=-Infinity;
  const refresh=async()=>{
   clearTimeout(timer);active?.abort();const controller=new AbortController();active=controller;cycleStarted=performance.now();
   const result=await runPrivacyCycle({probe:probePrivacyStatus,signal:controller.signal,failFast:visible});
   if(stopped||active!==controller)return;
   if(result.answer==='unknown'){failures++;visible=false;setState('offline');timer=setTimeout(()=>void refresh(),privacyBackoffMs(failures));return;}
   if(result.answer==='open'){
    // Content-free timing: how long this window stayed hidden and how many requests it took.
    if(!reported||failures>0)diagnostic({event:'privacy-verified',elapsedMs:Math.min(3600000,Math.round(performance.now()-since)),attempts:Math.min(100,result.attempts+failures)});
    reported=true;wasOpen.current=true;
   }
   failures=0;since=performance.now();visible=result.answer==='open';setState(result.answer);timer=setTimeout(()=>void refresh(),1000);
  };
  // A browser that says it is offline cannot confirm the lock; hide at once.
  const offline=()=>{failures=Math.max(failures,1);visible=false;setState('offline');};
  // Resume signals arrive in bursts (pageshow, visibilitychange, focus); one fresh cycle answers them all.
  const resume=()=>{if(document.visibilityState!=='hidden'&&performance.now()-cycleStarted>400)void refresh();};
  kick.current=()=>void refresh();
  window.addEventListener('offline',offline);window.addEventListener('online',resume);window.addEventListener('pageshow',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  void refresh();
  return()=>{stopped=true;active?.abort();clearTimeout(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 const hidden=state==='checking'||state==='offline';
 useEffect(()=>{
  if(!hidden){setWaited(0);return;}
  const started=performance.now(),tick=setInterval(()=>setWaited(performance.now()-started),250);
  return()=>clearInterval(tick);
 },[hidden]);
 if(state==='open')return <>{children}</>;
 const stage=state==='locked'?'locked':waited>=FALLBACK_MS?'unreachable':state==='offline'&&(wasOpen.current||waited>=QUIET_MS)?'reconnecting':'opening';
 return <main className="app-loading device-privacy-screen" data-privacy-state={state} data-privacy-stage={stage}><Wordmark/>
  <p role="status">{stage==='locked'?'Kanvas is locked on this device.':stage==='unreachable'?'Kanvas can’t be reached right now.':stage==='reconnecting'?'Reconnecting…':'Opening Kanvas…'}</p>
  {stage==='locked'&&<p>Ask your agent to unlock.</p>}
  {stage==='unreachable'&&<><p>Check this device’s connection. Your content stays hidden until Kanvas confirms this device is unlocked; it will appear by itself as soon as that works.</p><button type="button" className="device-privacy-retry" onClick={()=>kick.current()}>Try again</button></>}
 </main>;
}
