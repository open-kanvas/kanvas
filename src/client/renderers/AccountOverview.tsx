import { FormattedTime } from './Regional';
import { useEffect,useState } from 'react';
import { api,errorMessage,viewerPath } from '../api';
import { useAuth } from '../hooks';
import { useMediaResource } from './readiness';
import type { RendererProps } from './Renderer';

type SessionChoice={id:string;name:string;updatedAt:string;displays:{id:string;name:string;viewerUrl:string}[]};
type Start={sessions:SessionChoice[];total:number;nextOffset?:number;canCreate:boolean;adminUrl:string};
export function AccountOverview(props:RendererProps){
  const auth=useAuth();
  const [page,setPage]=useState(0),[data,setData]=useState<Start>(),[selected,setSelected]=useState<string>(),[error,setError]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false);
  const media=useMediaResource(props.preview?'ready':'pending');
  useEffect(()=>{if(props.preview)return;let active=true;const load=async()=>{try{const value=await api<Start>(`/api/start?offset=${page}`);if(active){setData(value);setError('');media.ready();}}catch(e){if(active){setError(errorMessage(e));media.fail();}}};void load();const timer=setInterval(()=>void load(),5000);return()=>{active=false;clearInterval(timer);};},[page,props.preview]);
  const create=async()=>{if(!name.trim()||busy)return;setBusy(true);try{const session=await api<{id:string}>('/api/sessions',{method:'POST',body:{name:name.trim()}}),display=await api<{id:string}>(`/api/sessions/${session.id}/displays`,{method:'POST',body:{name:'Display',width:window.innerWidth,height:window.innerHeight,pixelRatio:devicePixelRatio}});location.assign(viewerPath(session.id,display.id));}catch(e){setError(errorMessage(e));setBusy(false);}};
  return <section className="account-overview work-scroll" data-navigation-scroll aria-label="Your sessions" tabIndex={0}>
    {error&&<p role="alert">{error}</p>}
    {!data?.sessions.length&&<p>{props.preview?'Your recent sessions appear here when you open Home.':'No sessions yet. Create your first one below.'}</p>}
    <div className="account-session-list compact-session-list">{data?.sessions.map(s=><article key={s.id}>
      <button className="session-choice" onClick={()=>{if(s.displays.length===1)location.assign(viewerPath(s.id,s.displays[0].id));else setSelected(selected===s.id?undefined:s.id);}} aria-expanded={s.displays.length!==1?selected===s.id:undefined}><strong>{s.name}</strong><time dateTime={s.updatedAt}>{<FormattedTime value={s.updatedAt}/>}</time><span>{s.displays.length} {s.displays.length===1?'display':'displays'} →</span></button>
      {selected===s.id&&<nav aria-label={`Displays in ${s.name}`}>{s.displays.length?s.displays.map(d=><a key={d.id} href={viewerPath(s.id,d.id)}>{d.name} →</a>):<a href={`${data.adminUrl}?session=${s.id}`}>Set up a display</a>}</nav>}
    </article>)}</div>
    {data&&data.total>10&&<nav aria-label="Session pages"><button disabled={!page} onClick={()=>setPage(Math.max(0,page-10))}>Newer sessions</button><button disabled={data.nextOffset===undefined} onClick={()=>setPage(data.nextOffset!)}>Older sessions</button></nav>}
    {data?.canCreate&&<form onSubmit={e=>{e.preventDefault();void create();}}><label>New session name<input value={name} onChange={e=>setName(e.target.value)} maxLength={160} required/></label><button disabled={!name.trim()||busy}>{busy?'Creating…':'Create new session'}</button></form>}
    {data&&<footer><button onClick={()=>void auth.logout().catch(e=>setError(errorMessage(e)))}>Sign out of this browser</button><a href="/docs/" target="_blank" rel="noopener noreferrer">Kanvas Help</a><a href={data.adminUrl} target="_blank" rel="noopener noreferrer">Administration</a></footer>}
  </section>;
}
