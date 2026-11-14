import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import type { GalleryData } from '../../shared/image-gallery';
import { MediaImage } from './Image';
import { useNavigation } from './Navigation';
import { safeUrl } from '../api';
import './gallery.css';
/** Prefer complete rows, then choose a comfortable landscape image frame. */
export function galleryColumns(count:number,width:number,height:number){
  if(count===4)return 2;
  if(count===6)return width>=height?3:2;
  let best=Infinity,chosen=1;
  for(let c=1;c<=Math.min(8,count);c++){
    const rows=Math.ceil(count/c),ratio=(width/c)/(height/rows),empty=rows*c-count;
    const score=Math.abs(Math.log(Math.max(.05,ratio)/(4/3)))+empty/count*3;
    if(score<best){best=score;chosen=c;}
  }
  return chosen;
}
export function ImageGallery({data}:{data:GalleryData}){
  const nav=useNavigation(),[local,setLocal]=useState(0),[focused,setFocused]=useState<number|null>(null),[size,setSize]=useState({width:1000,height:600}),root=useRef<HTMLDivElement>(null);
  const touch=useRef<{x:number;y:number;at:number}|undefined>(undefined),back=useRef<HTMLButtonElement>(null),frames=useRef<(HTMLDivElement|null)[]>([]),restore=useRef<number|null>(null);
  const identity=JSON.stringify(data.images.map(i=>i.url)),index=Math.max(0,Math.min(data.images.length-1,nav?.state.page??local));
  useEffect(()=>{setFocused(null);setLocal(0);},[identity]);
  useLayoutEffect(()=>{const el=root.current;if(!el)return;const measure=()=>setSize(previous=>previous.width===el.clientWidth&&previous.height===el.clientHeight?previous:{width:el.clientWidth,height:el.clientHeight});const ro=new ResizeObserver(measure);ro.observe(el);measure();return()=>ro.disconnect();},[]);
  useEffect(()=>{if(focused!==null)back.current?.focus({preventScroll:true});else if(restore.current!==null){frames.current[restore.current]?.focus({preventScroll:true});restore.current=null;}},[focused]);
  const columns=data.mode==='carousel'||focused!==null?1:data.columns??galleryColumns(data.images.length,size.width,Math.max(1,size.height));
  const move=(direction:'next'|'previous')=>{if(nav?.canNavigate===false)return;if(direction==='next'?index>=data.images.length-1:index<=0)return;if(nav)nav.send({action:'page',direction});else setLocal(x=>x+(direction==='next'?1:-1));};
  const close=()=>{restore.current=focused;setFocused(null);};
  return <div ref={root} className={`multi-image-gallery ${data.mode} ${focused!==null?'gallery-expanded':''}`} onKeyDown={e=>{
    if(focused!==null&&e.key==='Escape'){e.stopPropagation();e.preventDefault();close();return;}
    if(nav||data.mode!=='carousel'||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.stopPropagation();e.preventDefault();move(e.key==='ArrowRight'?'next':'previous');
  }} onTouchStart={e=>{if(!nav&&data.mode==='carousel'&&e.touches.length===1)touch.current={x:e.touches[0].clientX,y:e.touches[0].clientY,at:Date.now()};}} onTouchEnd={e=>{
    const from=touch.current;touch.current=undefined;if(!from||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-from.x,dy=e.changedTouches[0].clientY-from.y;
    if(Date.now()-from.at<900&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.8){e.stopPropagation();move(dx<0?'next':'previous');}
  }} onTouchCancel={()=>{touch.current=undefined;}}>
    {focused!==null&&<button ref={back} className="gallery-back" onClick={close} aria-label="Back to image grid">← All images</button>}
    <div className="gallery-frames" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${data.mode==='carousel'||focused!==null?1:Math.ceil(data.images.length/columns)},minmax(0,1fr))`}}>{data.images.map((entry,i)=>{
      const enlarge=data.mode!=='carousel'&&focused===null;
      return <figure key={`${i}:${entry.url}`} hidden={focused!==null?focused!==i:data.mode==='carousel'&&i!==index} data-image-index={i}>
        {entry.showTitle&&entry.title&&<h2>{entry.title}</h2>}
        <div ref={node=>{frames.current[i]=node;}} className="gallery-image-frame" data-image-index={i} role={enlarge?'button':undefined} tabIndex={enlarge?0:undefined} aria-label={enlarge?`Enlarge ${entry.alt||entry.title||`image ${i+1}`}`:undefined} onClick={()=>{if(enlarge)setFocused(i);}} onKeyDown={e=>{if(enlarge&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();setFocused(i);}}}><MediaImage entry={entry}/></div>
        {entry.showCaption&&entry.caption&&<figcaption><p>{entry.caption}</p></figcaption>}
      </figure>;
    })}</div>
    {data.mode==='carousel'&&data.images.length>1&&<nav aria-label="Image navigation"><button disabled={index===0||nav?.canNavigate===false} onClick={()=>move('previous')} aria-label="Previous image">←</button><span>{index+1} / {data.images.length}</span><button disabled={index===data.images.length-1||nav?.canNavigate===false} onClick={()=>move('next')} aria-label="Next image">→</button></nav>}
  </div>;
}
