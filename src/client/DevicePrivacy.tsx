import {useEffect,useState,type ReactNode} from 'react';
import {Wordmark} from './icons';
/** Mounted above authentication/router so no route can reveal cached content.
 * Failure is closed: disconnected screens hide content until status is known. */
export function DevicePrivacyBoundary({children}:{children:ReactNode}){
 const [state,setState]=useState<'checking'|'open'|'locked'|'offline'>('checking');
 useEffect(()=>{let stopped=false,timer:ReturnType<typeof setTimeout>,active:AbortController|undefined;
  const refresh=async()=>{active?.abort();const controller=new AbortController();active=controller;const timeout=setTimeout(()=>controller.abort(),4000);
   try{const response=await fetch('/api/device-privacy/status',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Status unavailable');const result=await response.json();if(typeof result.data?.locked!=='boolean')throw Error('Invalid status');if(!stopped)setState(result.data.locked?'locked':'open');}
   catch{if(!stopped)setState('offline');}finally{clearTimeout(timeout);if(!stopped)timer=setTimeout(()=>void refresh(),1000);}
  };
  const offline=()=>setState('offline');window.addEventListener('offline',offline);void refresh();
  return()=>{stopped=true;active?.abort();clearTimeout(timer);window.removeEventListener('offline',offline);};
 },[]);
 if(state==='open')return <>{children}</>;
 return <main className="app-loading device-privacy-screen" data-privacy-state={state}><Wordmark/><p role="status">{state==='locked'?'Locked from your AI assistant':state==='offline'?'Reconnecting securely…':'Opening Kanvas…'}</p></main>;
}
