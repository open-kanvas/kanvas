import { useCallback,useEffect,useRef,useState } from 'react';
import type { DisplayRecord,SessionConfig,ViewSpec } from '../shared/types';
import { api,displayPath,errorMessage } from './api';
import { useAuth } from './hooks';
import './filmstrip.css';
import {RetainedPreview} from './renderers/SessionControls';

export interface Frame {width?:number;height?:number;id:string;displayId:string;displayName:string;revision:number;title?:string;template?:string;createdAt:string;current:boolean}
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
  return {sessionId,displayId,frames,selected,overview,setOverview,initialPage,error,position,live,choose,base,reload,positional:{step,home:()=>{void reload().catch(e=>setError(errorMessage(e)));setOverview(true);},end:live,overview:()=>{void reload().catch(e=>setError(errorMessage(e)));setOverview(true);}},active:Boolean(selected||overview)};
}
export function FilmstripOverview({strip}:{strip:ReturnType<typeof useFilmstrip>}){
  const auth=useAuth(),[error,setError]=useState('');
  const [page,setPage]=useState(Math.max(0,Math.floor(strip.position/48)));
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||(event.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable="true"]'))return;if(event.key==='Escape'){event.preventDefault();strip.setOverview(false);}if(event.key==='End'){event.preventDefault();strip.live();}if(event.key==='Home'&&!event.ctrlKey){event.preventDefault();setPage(0);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[strip]);
  return <section className="filmstrip-overview" aria-label="Session filmstrip"><header><h1>Session overview</h1><button onClick={()=>strip.setOverview(false)}>Close overview</button><button onClick={strip.live}>Return to live display</button></header>
    {[...new Set(strip.frames.slice(page*48,page*48+48).map(f=>f.displayId))].map(displayId=><section key={displayId} className="filmstrip-group"><h2>{strip.frames.find(f=>f.displayId===displayId)?.displayName}</h2><div className="filmstrip-grid" data-count={strip.frames.length} data-density={strip.frames.length>24?'dense':strip.frames.length>12?'medium':'normal'}>{strip.frames.slice(page*48,page*48+48).map((frame,index)=>frame.displayId!==displayId?null:<button key={frame.id} className={`filmstrip-card ${frame.current?'current':''}`} aria-label={`Open ${frame.title??frame.template} at position ${page*48+index+1}`} onClick={()=>void strip.choose(frame)}><RetainedPreview previewPath={`${strip.base}/${encodeURIComponent(frame.id)}`} card={{...frame,displayRevision:frame.revision,template:frame.template??'fact',preview:frame.title??frame.template??'View',width:frame.width??960,height:frame.height??540}} props={{sessionId:strip.sessionId,displayId:strip.displayId,view:{version:1,template:'overview',data:{}}}} maxHeight={strip.frames.length>24?100:strip.frames.length>12?140:220}/><strong>{page*48+index+1}. {frame.title??frame.template}</strong><span>{frame.current?'Live on this display':`Revision ${frame.revision}`}</span></button>)}</div></section>)}
    {!strip.frames.length&&<p>No retained content yet.</p>}<nav aria-label="Overview pages"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous views</button><span>{strip.frames.length?`${page*48+1}–${Math.min(strip.frames.length,page*48+48)} of ${strip.frames.length}`:'0'}</span><button disabled={(page+1)*48>=strip.frames.length} onClick={()=>setPage(page+1)}>Next views</button></nav>{!auth.viewOnly&&<footer className="overview-account-actions"><a href="/">Home</a><button onClick={()=>void auth.logout().catch(e=>setError(errorMessage(e)))}>Sign out of this browser</button></footer>}{error&&<p role="alert">{error}</p>}
  </section>;
}
