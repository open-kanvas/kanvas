import { FormattedTime } from './Regional';
import { useSelection } from './Selection';
import { api, displayPath } from '../api';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { IframeData, ListData } from '../../shared/browsing-templates';
import { useNavigation } from './Navigation';
import { useMediaResource } from './readiness';
import './browsing.css';

export function ListRenderer({data}:{data:ListData}){
  const selection=useSelection(),scroll=useRef<HTMLDivElement>(null),[bounds,setBounds]=useState({width:800,height:600});
  useEffect(()=>{
    const element=scroll.current;if(!element)return;let active=true;
    const resize=()=>{if(!active||!element.isConnected)return;const width=element.clientWidth,height=element.clientHeight;setBounds(previous=>previous.width===width&&previous.height===height?previous:{width,height});};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();return()=>{active=false;observer.disconnect();};
  },[]);
  const navigation=useNavigation(),[localPage,setLocalPage]=useState(0),query=navigation?.state.query.trim().toLocaleLowerCase()??'';
  const items=data.items.map((item,index)=>({item,index})).filter(({item})=>!query||(typeof item==='string'?item:`${item.text} ${item.detail??''}`).toLocaleLowerCase().includes(query));
  const size=data.pageSize??1000,pages=Math.max(1,Math.ceil(items.length/size)),page=Math.min(pages-1,navigation?.state.page??localPage),Tag=data.ordered?'ol':'ul';
  const visible=items.slice(page*size,(page+1)*size);
  const lengths=visible.map(({item})=>typeof item==='string'?item.length:item.text.length+(item.detail?.length??0)).sort((a,b)=>a-b);
  const length=lengths[Math.floor(lengths.length*.9)]??20;
  // Include marker, gap and text width. Long names should wrap within fewer
  // columns, not force narrow columns simply because there are many items.
  const preferred=Math.max(290,Math.min(620,Math.sqrt(length)*55));
  const columns=Math.max(1,Math.min(5,Math.floor((bounds.width+32)/(preferred+32))));
  const columnWidth=(bounds.width-48-(columns-1)*32)/columns;
  const font=Math.max(20,Math.min(40,columnWidth/Math.max(12,Math.min(28,length))/.56,(bounds.height-24)/Math.max(1,Math.ceil(visible.length/columns))/2.2));
  const markerStyle={'--list-columns':columns,'--list-font':`${font}px`,'--list-marker-width':`${String((data.start??1)+data.items.length-1).length+2}ch`} as CSSProperties;
  const change=(page:number)=>navigation?navigation.send({action:'page',page:page+1}):setLocalPage(page);
  return <div className="plain-list-surface"><div ref={scroll} className="plain-list-scroll" data-navigation-scroll tabIndex={0} role="region" aria-label="Scrollable list"><Tag className="plain-list" style={markerStyle} start={data.ordered?(data.start??1)+page*size:undefined}>{items.slice(page*size,(page+1)*size).map(({item,index})=><li key={index} className={selection.highlights.includes(index)?'agent-highlight':undefined} value={data.ordered?(data.start??1)+(selection.indices?.[index]??index):undefined}>{typeof item==='string'?item:<><span>{item.text}</span>{item.detail&&<p>{item.detail}</p>}</>}</li>)}</Tag>{!items.length&&<p>No matching items.</p>}</div>{pages>1&&<nav className="browsing-pages" aria-label="List pagination"><button disabled={page===0||navigation?.canNavigate===false} onClick={()=>change(page-1)}>← Previous</button><span>Page {page+1} of {pages}</span><button disabled={page===pages-1||navigation?.canNavigate===false} onClick={()=>change(page+1)}>Next →</button></nav>}</div>;
}
interface WebsitePreview {status:'interactive'|'static'|'unavailable'|'pending';reason?:string;imageUrl?:string;capturedAt?:string;title?:string;description?:string;previewImage?:string}
function WebsitePage({page,index,preview,sessionId,displayId,revision,fallback}:{page:IframeData['pages'][number];index:number;preview:boolean;sessionId?:string;displayId?:string;revision?:number;fallback:boolean}){
  const stage=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1);
  useEffect(()=>{
    const element=stage.current;if(!element)return;let active=true;
    const resize=()=>{if(active&&element.isConnected)setScale(Math.min(element.clientWidth/390,element.clientHeight/844));};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();return()=>{active=false;observer.disconnect();};
  },[]);
  const [status,setStatus]=useState('Loading frame…'),[capture,setCapture]=useState<WebsitePreview|null>(null),loaded=useRef(false);
  useEffect(()=>{
    loaded.current=false;setStatus('Loading frame…');setCapture(null);const controller=new AbortController();
    const timer=setTimeout(()=>{if(!loaded.current)setStatus('The website may block embedding or still be loading. Open the original to check.');},12000);
    let retry:ReturnType<typeof setTimeout>|undefined,tries=0;
    const check=async()=>{if(controller.signal.aborted)return;try{const result=await api<WebsitePreview>(`${displayPath(sessionId!,displayId!)}/website-preview`,{method:'POST',body:{expectedRevision:revision,page:index},signal:controller.signal});if(controller.signal.aborted)return;setCapture(result);if(result.status==='pending'){if(++tries<24)retry=setTimeout(()=>void check(),2500);else setCapture({status:'unavailable',reason:'Preview timed out. Open the original website or retry this view.'});}}catch{if(!controller.signal.aborted)setCapture({status:'unavailable',reason:'Preview unavailable. Open the original website or retry this view.'});}};
    if(!preview&&fallback&&sessionId&&displayId&&revision!==undefined)void check();
    return()=>{clearTimeout(timer);if(retry)clearTimeout(retry);controller.abort();};
  },[page.url,preview,sessionId,displayId,revision,index,fallback]);
  return <section className={`iframe-cell viewport-${page.viewport??'desktop'}`} aria-label={page.title??`Website ${index+1}`}><div ref={stage} className="iframe-stage">{!preview&&fallback&&sessionId&&displayId&&revision!==undefined&&(!capture||capture.status==='pending')&&<div className="website-loading" role="status"><span className="spinner" aria-hidden="true"/>Loading preview…</div>}{preview?<p>Web view: {page.title??page.url}</p>:capture?.status==='unavailable'?<div className="website-link-card" role="status"><strong>{capture.title??page.title??new URL(page.url).hostname}</strong>{capture.previewImage&&<img src={capture.previewImage} alt="Website preview" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>}{capture.description&&<p>{capture.description}</p>}<p>{capture.reason??'This site could not be embedded or captured.'}</p><a href={page.url} target="_blank" rel="noopener noreferrer">Open {new URL(page.url).hostname} ↗</a></div>:capture?.status==='static'&&capture.imageUrl?<figure className="iframe-static"><img src={capture.imageUrl} alt={`Static screenshot of ${page.title??new URL(page.url).hostname}`} onError={()=>{setCapture({status:'unavailable'});setStatus('Static preview expired. Open the original website or refresh this view.');}}/><figcaption>Static screenshot · {<FormattedTime value={capture.capturedAt!}/>} · not interactive · <a href={page.url} target="_blank" rel="noopener noreferrer">Original ↗</a></figcaption></figure>:<div className="iframe-viewport" style={page.viewport==='mobile'?{width:390,height:844,transform:`translate(-50%, -50%) scale(${scale})`}:undefined}><iframe key={page.url} src={page.url} title={page.title??`Website ${index+1}`} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" onLoad={()=>{loaded.current=true;setStatus('Frame loaded. Remote content remains unverified.');}} onError={()=>{loaded.current=true;setStatus('The frame could not load. Open the original website to check.');}}/></div>}</div>{capture?.status==='interactive'&&<div className="iframe-status"><a href={page.url} target="_blank" rel="noopener noreferrer">Open {page.title??new URL(page.url).hostname} ↗</a> · <button onClick={()=>setCapture({status:'unavailable',reason:'Embedded content is unverified. Open the original page if this site does not display here.'})}>Show link card</button></div>}{capture?.status==='unavailable'?<p className="iframe-status" role="status">{capture.reason??status} <a href={page.url} target="_blank" rel="noopener noreferrer">Open original ↗</a></p>:<span className="sr-only" role="status">{capture?.reason??status}</span>}</section>;
}
export function IframeRenderer({data,preview=false,sessionId,displayId,revision,sourcePageIndices,navigationEnabled=true}:{data:IframeData;sourcePageIndices?:number[];navigationEnabled?:boolean;preview?:boolean;sessionId?:string;displayId?:string;revision?:number}){
  const navigation=useNavigation(),resource=useMediaResource(),layout=data.layout??'grid';
  const index=Math.max(0,Math.min(data.pages.length-1,navigationEnabled&&navigation?.hasPosition?navigation.state.page:data.index??0));
  // The local frame is acknowledged; cross-origin contents remain unverified.
  useEffect(()=>resource.ready(),[data.pages,resource.ready]);
  const cells=layout==='grid'?data.pages.map((page,index)=>({page,index})):[{page:data.pages[index],index}],columns=Math.ceil(Math.sqrt(cells.length)),rows=Math.ceil(cells.length/columns);
  return <div className="iframe-surface"><div className={`iframe-pages iframe-${layout}`} style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${rows},minmax(0,1fr))`}}>{cells.map(({page,index})=><WebsitePage key={`${index}:${page.url}`} page={page} index={sourcePageIndices?.[index]??index} preview={preview} sessionId={sessionId} displayId={displayId} revision={revision} fallback={data.screenshotFallback!==false}/>)}</div></div>;
}
