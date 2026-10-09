import type { SessionTopology } from '../shared/accounts';
import { lazy,useEffect,useState } from 'react';
import type { SessionConfig,ViewSpec } from '../shared/types';
import type { ToolCall } from '../shared/event-views';
import { api,errorMessage } from './api';
import { useAuth,useMedia } from './hooks';
import { AuthScreen,type ViewerRoute } from './Auth';
import { Renderer } from './renderers/Renderer';
import { BrowsingProvider,type PublicNavigation } from './renderers/Navigation';
import './public-session.css';
const Viewer=lazy(()=>import('./Viewer').then(x=>({default:x.Viewer})));
interface Snapshot {session:{id:string;name:string;config:SessionConfig;publicRevision:number};serverNow:string;displays:{id:string;name:string;revision:number;navigationRoot?:number;view:ViewSpec|null;navigation?:PublicNavigation;toolLog?:{events:ToolCall[]};topology?:SessionTopology;}[]}
export function SessionEntry({sessionId,displayId}:{sessionId:string;displayId?:string}){
  const auth=useAuth(),[entry,setEntry]=useState<{public:boolean;member?:boolean;displayId?:string}>(),[error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();void api<{public:boolean;member?:boolean;displayId?:string}>(`/api/entry/${encodeURIComponent(sessionId)}`,{signal:c.signal}).then(setEntry).catch(e=>{if(!c.signal.aborted)setError(errorMessage(e));});return()=>c.abort();},[sessionId]);
  if(error)return <main className="app-loading"><h1>Session unavailable</h1><p>{error}</p><a href="/">Return home</a></main>;
  if(!entry)return <main className="app-loading"><span className="spinner"/>Opening session…</main>;
  if(entry.public&&!entry.member)return <PublicSession sessionId={sessionId} initialDisplayId={displayId}/>;
  const target=displayId??(auth.viewOnly&&auth.sessionId===sessionId?auth.displayId:undefined)??entry.displayId;
  const viewer:ViewerRoute|undefined=target?{sessionId,displayId:target}:undefined;
  if(!viewer)return <main className="app-loading"><h1>No displays yet</h1><a href="/">Return home</a></main>;
  return auth.user?<Viewer {...viewer}/>:<AuthScreen viewer={viewer}/>;
}
export function PublicSession({sessionId,initialDisplayId}:{sessionId:string;initialDisplayId?:string}){
  const [snapshot,setSnapshot]=useState<Snapshot>(),[selected,setSelected]=useState(initialDisplayId),[error,setError]=useState(''),[online,setOnline]=useState(false);const dark=useMedia('(prefers-color-scheme: dark)');
  useEffect(()=>{
    let live=true,closed=false,inFlight=false,again=false;const abort=new AbortController();
    const load=async()=>{if(inFlight){again=true;return;}if(closed)return;inFlight=true;try{const r=await api<Snapshot>(`/api/public/sessions/${encodeURIComponent(sessionId)}`,{signal:abort.signal});if(live&&!closed){setSnapshot(r);setError('');setOnline(true);}}catch(e){if(live){setSnapshot(undefined);setOnline(false);setError(errorMessage(e));}}finally{inFlight=false;if(again&&live&&!closed){again=false;void load();}}};
    const source=new EventSource(`/api/public/sessions/${encodeURIComponent(sessionId)}/events`);source.onopen=()=>void load();source.addEventListener('change',()=>void load());source.addEventListener('revoked',()=>{closed=true;setSnapshot(undefined);setOnline(false);setError('Public access has ended. Sign in or request screen pairing to continue.');source.close();});source.onerror=()=>{setOnline(false);void load();};void load();
    const reconnect=()=>void load();window.addEventListener('online',reconnect);const off=()=>{setSnapshot(undefined);setOnline(false);setError('Connection lost. Reconnecting to this public session…');};window.addEventListener('offline',off);
    return()=>{live=false;abort.abort();source.close();window.removeEventListener('online',reconnect);window.removeEventListener('offline',off);};
  },[sessionId]);
  const display=snapshot?.displays.find(d=>d.id===selected)??snapshot?.displays[0],config=snapshot?.session.config,theme=config?.theme==='system'?(dark?'dark':'light'):config?.theme??'dark';
  return <main className={`public-session theme-${theme}`}>{error?<section className="content-empty" role="alert"><p>{error}</p><a href={`/session/${sessionId}`}>Reconnect or sign in</a></section>:snapshot?<><div className="public-session-stage" data-revision={display?.revision}>{display?.view?(display.view.template==='overview'?<section className="public-overview"><h2>Session displays</h2>{snapshot.displays.map(d=><button key={d.id} onClick={()=>setSelected(d.id)}>{d.name} · {d.view?.title??d.view?.template??'Empty'}</button>)}</section>:<BrowsingProvider key={`${display.id}:${display.navigationRoot??display.revision}`} view={display.view} sessionId={sessionId} displayId={display.id} revision={display.revision} config={config} enabled local remoteNavigation={display.navigation}><Renderer view={display.view} config={config} revision={display.revision} renderIdentity={display.revision} editable={false} actionable={false} serverNow={snapshot.serverNow} publicToolCalls={display.toolLog?.events} publicTopology={display.topology} /></BrowsingProvider>):<p className="content-empty">Waiting for content.</p>}</div></>:<div className="content-empty"><span className="spinner"/>Opening public session…</div>}</main>;
}
