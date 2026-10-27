import {useLayoutEffect,useRef,useState} from 'react';
import type {RendererProps} from './Renderer';
/** Deterministic maximum-readable-font column fit, using actual receiver dimensions. */
export function CatalogList({view}:RendererProps){
 const items=view.data.items as string[],ref=useRef<HTMLDivElement>(null),[fit,setFit]=useState({columns:1,rows:items.length,font:12});
 useLayoutEffect(()=>{const root=ref.current;if(!root)return;const update=()=>{const w=root.clientWidth-16,h=root.clientHeight-16;let best={columns:1,rows:items.length,font:1};for(let columns=1;columns<=Math.min(24,Math.max(1,items.length));columns++){const rows=Math.ceil(items.length/columns),longest=Math.max(1,...items.map(x=>[...x].length));const font=Math.min(40,h/(rows*1.35),((w-16*(columns-1))/columns)/(longest*.62));if(font>best.font)best={columns,rows,font};}setFit(best);};const observer=new ResizeObserver(update);observer.observe(root);update();return()=>observer.disconnect();},[items]);
 return <div ref={ref} className="catalog-list" style={{width:'100%',height:'100%',minHeight:0,padding:8,boxSizing:'border-box',overflow:'hidden'}}><div style={{display:'grid',gridAutoFlow:'column',gridTemplateRows:`repeat(${fit.rows},1.35em)`,gridTemplateColumns:`repeat(${fit.columns},minmax(0,1fr))`,columnGap:16,fontFamily:'monospace',fontSize:fit.font}}>{items.map((item,i)=><span key={i} style={{whiteSpace:'nowrap'}}>{item}</span>)}</div></div>;
}
