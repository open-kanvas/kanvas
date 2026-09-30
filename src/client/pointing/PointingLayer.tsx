import { useEffect,useRef,useState,type RefObject } from 'react';
import type { DisplayRecord } from '../../shared/types';
import type { PointingAnchor,PointingState } from '../../shared/pointing';
import { api,displayPath,errorMessage } from '../api';
import { anchorAt,anchorRects } from './anchors';
import './pointing.css';
const empty:PointingState={enabled:false,revision:0,canPoint:false,pointers:[]};
export function PointingLayer({shell,display,sessionId,ready}:{shell:RefObject<HTMLDivElement|null>;display:DisplayRecord;sessionId:string;ready:boolean}){
  const [state,setState]=useState(empty),[active,setActive]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now()),[,redraw]=useState(0);
  const current=useRef({display,state,active,ready});current.current={display,state,active,ready};
  const endpoint=`${displayPath(sessionId,display.id)}/pointing`;
  const stage=()=>[...(shell.current?.querySelectorAll<HTMLElement>('.viewer-candidate')??[])].find(el=>getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"]'));
  useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>,controller=new AbortController();const load=async()=>{try{const next=await api<PointingState>(endpoint,{signal:controller.signal});if(live){setState(next);if(!next.enabled){setActive(false);setError('');}}}catch{if(live){setState(empty);setActive(false);}}finally{if(live)timer=setTimeout(()=>void load(),current.current.state.enabled?650:2500);}};void load();return()=>{live=false;controller.abort();clearTimeout(timer);};},[endpoint]);
  useEffect(()=>{setActive(false);setError('');},[ready,display.revision]);
  const publish=async(anchor:PointingAnchor|null)=>{const revision=current.current.display.revision;try{const next=await api<PointingState>(endpoint,{method:'PUT',body:{revision,anchor}});if(revision===current.current.display.revision){setState(next);setError('');}}catch(e){if(revision===current.current.display.revision)setError(errorMessage(e));}};
  const send=useRef(publish);send.current=publish;
  useEffect(()=>{
    if(!active||!state.enabled||!ready)return;const root=shell.current;if(!root)return;let initial:PointingAnchor|undefined,started=false;
    const down=(e:PointerEvent)=>{const content=stage();if(!content||!(e.target instanceof Node)||!content.contains(e.target))return;started=true;e.preventDefault();e.stopImmediatePropagation();initial=current.current.display.view?anchorAt(content,current.current.display.view,e.clientX,e.clientY):undefined;root.setPointerCapture?.(e.pointerId);};
    const up=(e:PointerEvent)=>{if(!started)return;started=false;e.preventDefault();e.stopImmediatePropagation();const content=stage(),view=current.current.display.view;if(!content||!view)return;const end=anchorAt(content,view,e.clientX,e.clientY);let anchor=initial??end;if(anchor?.kind==='text'&&end?.kind==='text'&&anchor.key===end.key&&anchor.occurrence===end.occurrence)anchor={...anchor,start:Math.min(anchor.start,end.start),end:Math.max(anchor.end,end.end)};if(anchor&&!(anchor.kind==='text'&&anchor.end-anchor.start>2000))void send.current(anchor);else setError('Choose a word, short text span, data cell, chart mark or image.');};
    const click=(e:MouseEvent)=>{const content=stage();if(content&&e.target instanceof Node&&content.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setActive(false);}};
    root.addEventListener('pointerdown',down,true);root.addEventListener('pointerup',up,true);root.addEventListener('click',click,true);window.addEventListener('keydown',escape,true);
    return()=>{root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('click',click,true);window.removeEventListener('keydown',escape,true);};
  },[active,state.enabled,ready,shell]);
  useEffect(()=>{if(!state.enabled)return;let frame=0;const paint=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>redraw(v=>v+1));};const root=stage(),resize=new ResizeObserver(paint),mutation=new MutationObserver(paint);if(root){resize.observe(root);mutation.observe(root,{subtree:true,childList:true,characterData:true});}window.addEventListener('scroll',paint,true);window.addEventListener('resize',paint);const timer=setInterval(()=>setClock(Date.now()),500);return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();window.removeEventListener('scroll',paint,true);window.removeEventListener('resize',paint);clearInterval(timer);};},[state.enabled,display.revision,ready]);
  if(!state.enabled||!ready||!display.view)return null;
  const root=stage(),markers=state.pointers.filter(p=>p.revision===display.revision&&p.expiresAt>clock).map(p=>({pointer:p,rects:root?anchorRects(root,display.view!,p.anchor):[]}));
  return <><div className="pointing-overlay" aria-hidden="true">{markers.map(({pointer,rects},i)=>rects.length?<div key={pointer.id} data-pointer-id={pointer.id} data-pointer-kind={pointer.anchor.kind}>{rects.map((r,j)=><span key={j} className="semantic-pointer-mark" style={{...r,borderColor:pointer.color,backgroundColor:`${pointer.color}30`}}/>)}<span className="semantic-pointer-name" style={{left:Math.max(2,Math.min(window.innerWidth-150,rects[0].left)),top:Math.max(0,rects[0].top-24-(i%3)*5),backgroundColor:pointer.color}}>{pointer.name}</span></div>:null)}</div>{state.canPoint&&<div className={`pointing-tools ${active?'pointing-active':''}`}><button aria-label={active?'Stop pointing':'Point together'} aria-pressed={active} onClick={()=>{setActive(x=>!x);setError('');}}>{active?'Done pointing':'Point'}</button>{active&&<><button onClick={()=>void publish(null)}>Clear my pointer</button><span>Tap a word or mark · drag a short span</span></>}{error&&<span role="status">{error}</span>}</div>}</>;
}
