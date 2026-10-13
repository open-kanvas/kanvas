import { Wordmark } from './icons';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage, viewerPath } from './api';
import { useAuth } from './hooks';
import { viewerTabId } from './window-identity';

type Device={id:string;name:string;home?:{sessionId:string;displayId:string};window?:{id:string;name:string;version:number}};
type Command={id:string;sessionId:string;displayId:string};
const Context=createContext<{device?:Device;error?:string}>({});
export const useDevice=()=>useContext(Context);
function installationId(){try{const saved=localStorage.getItem('kanvas-device-installation');if(saved&&/^[A-Za-z0-9_-]{1,128}$/.test(saved))return saved;const id=crypto.randomUUID();localStorage.setItem('kanvas-device-installation',id);return id;}catch{return crypto.randomUUID();}}
export function DeviceReceiver({children,suspended=false}:{children:ReactNode;suspended?:boolean}){
  const auth=useAuth(),[device,setDevice]=useState<Device>(),[error,setError]=useState<string>(),command=useRef<Command|undefined>(undefined),painted=useRef<{sessionId:string;displayId:string;renderedRevision:number}|undefined>(undefined);
  useEffect(()=>{
    if(suspended||!auth.user||auth.viewOnly||auth.captureOnly||new URLSearchParams(location.search).has('authorize'))return;
    if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
    let stopped=false,stream:EventSource|undefined,timer:ReturnType<typeof setTimeout>|undefined,registered:Device|undefined;
    const report=()=>{const p=painted.current;if(!registered||!p)return;const c=command.current,match=c?.sessionId===p.sessionId&&c.displayId===p.displayId;
      void api<{recorded:boolean;reason?:string}>(`/api/devices/${registered.id}${registered.window?`/windows/${registered.window.id}`:''}/report`,{method:'POST',body:{...p,...(match?{commandId:c.id}:{})}}).then(result=>{if(match&&command.current?.id===c.id&&(result.recorded||result.reason==='STALE_COMMAND'))command.current=undefined;}).catch(()=>{});
    };
    const browsing=()=>{painted.current=undefined;};window.addEventListener('kanvas:browsing',browsing);
    const ready=(event:Event)=>{painted.current=(event as CustomEvent).detail;report();};window.addEventListener('kanvas:painted',ready);
    const receive=(data:{unavailable?:boolean;command?:Command})=>{
      if(data.unavailable){stream?.close();setError('This device connection is unavailable. Sign in again to reconnect.');return;}
      if(data.command){const c=data.command;command.current=c;const path=viewerPath(c.sessionId,c.displayId);if(location.pathname!==path){location.assign(path);return;}window.dispatchEvent(new Event('kanvas:return-live'));report();}else command.current=undefined;
    };
    const commandEvent=(event:Event)=>receive((event as CustomEvent).detail);window.addEventListener('kanvas:window-command',commandEvent);
    const start=async()=>{try{registered=await api<Device>('/api/devices/register',{method:'POST',body:{installationId:installationId(),windowId:viewerTabId(),...(['/', '/console'].includes(location.pathname)?{provisionHome:false}:{})}});if(stopped)return;setDevice(registered);setError(undefined);report();
      // A viewer carries targeted commands on its content stream. Two streams
      // per tab exhaust HTTP/1.1's six-connection origin limit.
      if(registered.window&&/^\/view\//.test(location.pathname)){window.dispatchEvent(new Event('kanvas:device-registered'));return;}
      stream=new EventSource(`/api/devices/${registered.id}${registered.window?`/windows/${registered.window.id}`:''}/events`);stream.onmessage=event=>{try{receive(JSON.parse(event.data));
      }catch{/* A malformed stream event cannot change browser location. */}};
    }catch(e){if(!stopped){setError(errorMessage(e));timer=setTimeout(()=>void start(),8000);}}};void start();
    return()=>{stopped=true;stream?.close();clearTimeout(timer);window.removeEventListener('kanvas:painted',ready);window.removeEventListener('kanvas:browsing',browsing);window.removeEventListener('kanvas:window-command',commandEvent);};
  },[auth.user?.id,auth.viewOnly,auth.captureOnly,suspended]);
  return <Context.Provider value={{device,error}}>{children}</Context.Provider>;
}
export function LiveEntry(){
  const {device,error}=useDevice(),[failure,setFailure]=useState<string>();
  useEffect(()=>{if(!device)return;let alive=true;void api<{sessionId:string;displayId:string}>('/api/entry/open',{method:'POST',body:{deviceId:device.id}}).then(t=>{if(alive)location.replace(viewerPath(t.sessionId,t.displayId));}).catch(e=>{if(alive)setFailure(errorMessage(e));});return()=>{alive=false;};},[device?.id]);
  return <main className="app-loading"><Wordmark/><h1>Opening KANVAS</h1>{failure||error?<><p role="alert">{failure??error}</p><button className="button" onClick={()=>location.reload()}>Try again</button></>:<><span className="spinner"/><p>Connecting this screen…</p></>}</main>;
}
