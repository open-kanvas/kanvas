import {memo,useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Renderer,type RendererProps} from './Renderer';
import type {ViewSpec} from '../../shared/types';
import './split-screen.css';
type Pane={id:string;view:ViewSpec};
/** Same-origin empty document creates a real CSS viewport. No supplied HTML or scripts. */
const PaneViewport=memo(function PaneViewport({pane,config,serverNow,preview,onReady,onError,sessionId,displayId}:{pane:Pane;config:RendererProps['config'];serverNow?:string;preview?:boolean;onReady:(id:string,signature:string)=>void;onError:()=>void;sessionId?:string;displayId?:string}){
 const frame=useRef<HTMLIFrameElement>(null),[body,setBody]=useState<HTMLElement>();
 useEffect(()=>{const doc=frame.current?.contentDocument;if(!doc)return;
  doc.documentElement.style.cssText='height:100%;width:100%';doc.body.style.cssText='margin:0;height:100%;width:100%;overflow:hidden';
  const sync=()=>{doc.head.querySelectorAll('[data-pane-style]').forEach(n=>n.remove());for(const node of document.head.querySelectorAll('style,link[rel="stylesheet"]')){const copy=node.cloneNode(true) as HTMLElement;copy.dataset.paneStyle='';doc.head.append(copy);}doc.documentElement.className=document.documentElement.className;doc.body.className=document.body.className;};
  sync();const observer=new MutationObserver(sync);observer.observe(document.head,{childList:true});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});observer.observe(document.body,{attributes:true,attributeFilter:['class']});setBody(doc.body);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const doc=frame.current?.contentDocument,element=frame.current;if(!doc||!element)return;const style=getComputedStyle(element);for(const name of Array.from(style))if(name.startsWith('--'))doc.documentElement.style.setProperty(name,style.getPropertyValue(name));doc.documentElement.style.colorScheme=style.colorScheme;},[body,config]);
 return <iframe ref={frame} title={`Pane ${pane.id}`} className="split-pane" src="about:blank">{body&&createPortal(<Renderer view={pane.view} sessionId={sessionId} displayId={displayId} onReady={()=>onReady(pane.id,JSON.stringify(pane.view))} onError={onError} config={config} serverNow={serverNow} preview={preview} editable={false} actionable={false}/>,body)}</iframe>;
},(a,b)=>a.config===b.config&&a.preview===b.preview&&JSON.stringify(a.pane)===JSON.stringify(b.pane));
export function SplitScreen(props:RendererProps){
 const ready=useRef(new Map<string,string>()),latest=useRef(props);latest.current=props;
 const readyPane=useCallback((id:string,signature:string)=>{ready.current.set(id,signature);const panes=latest.current.view.data.panes as Pane[];if(panes.every(p=>ready.current.get(p.id)===JSON.stringify(p.view)))latest.current.onReady?.();},[]);
 useEffect(()=>{const panes=props.view.data.panes as Pane[];if(!panes.every(p=>ready.current.get(p.id)===JSON.stringify(p.view)))return;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>latest.current.onReady?.());});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};},[props.revision,props.view]);
 const failPane=useCallback(()=>latest.current.onError?.(),[]);
 const data=props.view.data as {panes:Pane[];direction:'vertical'|'horizontal'},[selected,setSelected]=useState(data.panes[0].id);
 useEffect(()=>{if(!data.panes.some(p=>p.id===selected))setSelected(data.panes[0].id);},[data.panes,selected]);
 return <div className="split-screen" data-count={data.panes.length} data-direction={data.direction}><nav aria-label="Choose pane">{data.panes.map(p=><button key={p.id} aria-pressed={p.id===selected} onClick={()=>setSelected(p.id)}>{p.id}</button>)}</nav><div className="split-grid">{data.panes.map(p=><section key={p.id} data-selected={p.id===selected}><PaneViewport pane={p} config={props.config} serverNow={props.serverNow} preview={props.preview} sessionId={props.sessionId} displayId={props.displayId} onReady={readyPane} onError={failPane}/></section>)}</div></div>;
}
