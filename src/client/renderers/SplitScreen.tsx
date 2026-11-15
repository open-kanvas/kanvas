import {memo,useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Renderer,type RendererProps} from './Renderer';
import type {ViewSpec} from '../../shared/types';
import type {CSSProperties} from 'react';
import {isGridPane,splitDivider,splitGrid,splitLeaves,type SplitScreenData,type SplitPane} from '../../shared/split-screen';
import './split-screen.css';
type Pane={id:string;view:ViewSpec};
function controlPreview(view:ViewSpec){const active=view.template==='presentation'?(view.data.slides as ViewSpec[])[Number(view.data.index??0)]:view;return Boolean(active&&['display-grid','session-topology','overview'].includes(active.template));}
/** Same-origin empty document creates a real CSS viewport. No supplied HTML or scripts. */
const PaneViewport=memo(function PaneViewport({pane,config,serverNow,preview,onReady,onError,sessionId,displayId,revision}:{pane:Pane;config:RendererProps['config'];serverNow?:string;preview?:boolean;onReady:(id:string,signature:string)=>void;onError:()=>void;sessionId?:string;displayId?:string;revision?:number}){
 const frame=useRef<HTMLIFrameElement>(null),[body,setBody]=useState<HTMLElement>();
 useEffect(()=>{const doc=frame.current?.contentDocument;if(!doc)return;
  doc.documentElement.style.cssText='height:100%;width:100%';doc.body.style.cssText='margin:0;height:100%;width:100%;overflow:hidden';
  const sync=()=>{doc.head.querySelectorAll('[data-pane-style]').forEach(n=>n.remove());for(const node of document.head.querySelectorAll('style,link[rel="stylesheet"]')){const copy=node.cloneNode(true) as HTMLElement;copy.dataset.paneStyle='';doc.head.append(copy);}doc.documentElement.className=document.documentElement.className;doc.body.className=document.body.className+' '+(doc.body.className.match(/theme-[a-z]+/g)?.join(' ')??'');};
  sync();const observer=new MutationObserver(sync);observer.observe(document.head,{childList:true});observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});observer.observe(document.body,{attributes:true,attributeFilter:['class']});setBody(doc.body);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const doc=frame.current?.contentDocument,element=frame.current;if(!doc||!element)return;const host=element.closest('.viewer-shell');const sync=()=>{const style=getComputedStyle(element);for(const name of Array.from(style))if(name.startsWith('--'))doc.documentElement.style.setProperty(name,style.getPropertyValue(name));doc.documentElement.style.colorScheme=style.colorScheme;doc.body.style.color=`var(--text, ${style.color})`;doc.body.style.fontFamily=style.fontFamily;doc.body.style.fontSize=style.fontSize;doc.body.style.lineHeight=style.lineHeight;doc.body.className=document.body.className+' '+(host?.className.match(/theme-[a-z]+/g)?.join(' ')??'');};sync();const observer=new MutationObserver(sync);if(host)observer.observe(host,{attributes:true,attributeFilter:['class','style']});return()=>observer.disconnect();},[body,config]);
 return <iframe ref={frame} title={`Pane ${pane.id}`} className="split-pane" src="about:blank">{body&&createPortal(<Renderer view={pane.view} revision={revision} sessionId={sessionId} displayId={displayId} onReady={()=>onReady(pane.id,JSON.stringify(pane.view))} onError={onError} config={config} serverNow={serverNow} preview={preview||controlPreview(pane.view)} editable={false} actionable={false}/>,body)}</iframe>;
},(a,b)=>a.config===b.config&&a.preview===b.preview&&JSON.stringify(a.pane)===JSON.stringify(b.pane));
export function SplitScreen(props:RendererProps){
 const ready=useRef(new Map<string,string>()),latest=useRef(props);latest.current=props;
 const leaves=()=>splitLeaves(latest.current.view.data);
 const readyPane=useCallback((id:string,signature:string)=>{ready.current.set(id,signature);if(leaves().every(p=>ready.current.get(p.id)===JSON.stringify(p.view)))latest.current.onReady?.();},[]);
 useEffect(()=>{if(!leaves().every(p=>ready.current.get(p.id)===JSON.stringify(p.view)))return;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>latest.current.onReady?.());});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};},[props.revision,props.view]);
 const failPane=useCallback(()=>latest.current.onError?.(),[]);
 const data=props.view.data as unknown as SplitScreenData,divider=splitDivider(data.divider);
 const gridStyle=(count:number,rows?:number,columns?:number,direction?:SplitScreenData['direction']):CSSProperties=>{const grid=splitGrid(count,rows,columns,direction)??{rows:1,columns:count};return {gridTemplateColumns:`repeat(${grid.columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${grid.rows},minmax(0,1fr))`};};
 const viewport=(p:Pane)=><PaneViewport pane={p} config={props.config} serverNow={props.serverNow} preview={props.preview} sessionId={props.sessionId} displayId={props.displayId} revision={props.revision} onReady={readyPane} onError={failPane}/>;
 const pane=(p:SplitPane)=>isGridPane(p)?<section key={p.id} className="split-nested" data-pane-id={p.id}><div className="split-grid" data-pane-count={p.panes.length} style={gridStyle(p.panes.length,p.rows,p.columns,p.direction)}>{p.panes.map(inner=><section key={inner.id} className="split-leaf" data-pane-id={inner.id}>{viewport(inner)}</section>)}</div></section>:<section key={p.id} className="split-leaf" data-pane-id={p.id}>{viewport(p)}</section>;
 // The authored grid is what every screen shows, phones included: no tab fallback.
 return <div className="split-screen" data-count={splitLeaves(data).length} data-divider={divider.gap===0&&divider.borderWidth===0?'none':'lines'} style={{'--split-gap':`${divider.gap}px`,'--split-border-width':`${divider.borderWidth}px`,...(divider.borderColor?{'--split-border-color':divider.borderColor}:{})} as CSSProperties}><div className="split-grid" style={gridStyle(data.panes.length,data.rows,data.columns,data.direction)}>{data.panes.map(pane)}</div></div>;
}
