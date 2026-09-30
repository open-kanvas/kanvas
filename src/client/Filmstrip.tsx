import { useCallback,useEffect,useRef,useState } from 'react';
import type { DisplayRecord,SessionConfig,ViewSpec } from '../shared/types';
import { api,displayPath,errorMessage } from './api';
import { useAuth } from './hooks';
import './filmstrip.css';

export interface Frame {id:string;displayId:string;displayName:string;revision:number;title?:string;template?:string;createdAt:string;current:boolean}
export interface FrameContent extends Frame {view:ViewSpec;config:SessionConfig}
export function useFilmstrip(sessionId:string,displayId:string,display:DisplayRecord|undefined,enabled:boolean){
  const [frames,setFrames]=useState<Frame[]>([]),[liveId,setLiveId]=useState<string>(),[selected,setSelected]=useState<FrameContent|null>(null),[overview,setOverview]=useState(false),[initialPage,setInitialPage]=useState(0),[error,setError]=useState('');const sequence=useRef(0);
  const base=`${displayPath(sessionId,displayId)}/filmstrip`;
  const reload=useCallback(async()=>{const result=await api<{frames:Frame[];liveFrameId?:string}>(base);setFrames(result.frames);setLiveId(result.liveFrameId);return result;},[base]);
  useEffect(()=>{if(!enabled){sequence.current++;setSelected(null);setOverview(false);return;}let alive=true;void api<{frames:Frame[];liveFrameId?:string}>(base).then(r=>{if(alive){setFrames(r.frames);setLiveId(r.liveFrameId);}}).catch(()=>{});return()=>{alive=false;};},[enabled,base,display?.revision]);
  const choose=useCallback(async(frame:Frame,lastPage=false)=>{const call=++sequence.current;setError('');try{const value=await api<FrameContent>(`${base}/${frame.id}`);if(call!==sequence.current)return;setInitialPage(lastPage?-1:0);setSelected(value);setOverview(false);}catch(e){if(call===sequence.current)setError(errorMessage(e));}},[base]);
  const position=frames.findIndex(f=>f.id===(selected?.id??liveId));
  const go=(index:number,lastPage=false)=>{if(index>=0&&index<frames.length)void choose(frames[index],lastPage);};
  const step=(direction:-1|1)=>go(position<0?(direction<0?frames.length-1:0):position+direction,direction<0);
  const live=()=>{sequence.current++;setSelected(null);setOverview(false);setError('');};
  return {frames,selected,overview,setOverview,initialPage,error,position,live,choose,base,reload,positional:{step,home:()=>go(0),end:()=>go(frames.length-1),overview:()=>{void reload().catch(e=>setError(errorMessage(e)));setOverview(true);}},active:Boolean(selected||overview)};
}
export function FilmstripOverview({strip}:{strip:ReturnType<typeof useFilmstrip>}){
  const auth=useAuth(),[error,setError]=useState('');
  const [page,setPage]=useState(Math.max(0,Math.floor(strip.position/12)));
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();strip.setOverview(false);}if(event.key==='Home'){event.preventDefault();setPage(0);}if(event.key==='End'){event.preventDefault();setPage(Math.max(0,Math.ceil(strip.frames.length/12)-1));}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[strip.frames.length]);
  return <section className="filmstrip-overview" aria-label="Session filmstrip"><header><h1>Session overview</h1><button onClick={()=>strip.setOverview(false)}>Close overview</button><button onClick={strip.live}>Return to live display</button></header>
    <div className="filmstrip-grid filmstrip-list">{strip.frames.slice(page*12,page*12+12).map((frame,index)=><button key={frame.id} className="filmstrip-card" aria-label={`Open ${frame.title??frame.template} at position ${page*12+index+1}`} onClick={()=>void strip.choose(frame)}><strong>{page*12+index+1}. {frame.title??frame.template}</strong><span>{frame.displayName}</span></button>)}</div>
    {!strip.frames.length&&<p>No retained content yet.</p>}<nav aria-label="Overview pages"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous views</button><span>{strip.frames.length?`${page*12+1}–${Math.min(strip.frames.length,page*12+12)} of ${strip.frames.length}`:'0'}</span><button disabled={(page+1)*12>=strip.frames.length} onClick={()=>setPage(page+1)}>Next views</button></nav>{!auth.viewOnly&&<footer className="overview-account-actions"><a href="/">Home</a><button onClick={()=>void auth.logout().catch(e=>setError(errorMessage(e)))}>Sign out of this browser</button></footer>}{error&&<p role="alert">{error}</p>}
  </section>;
}
