import { useLayoutEffect, useRef, useState } from 'react';
import { DEVICE_VIEWPORTS, devicePreviewDataSchema, staticPreviewDocument } from '../../shared/device-preview';
import type { RendererProps } from './Renderer';
import './device-preview.css';
export function DevicePreview({view,onReady}:RendererProps){
 const loaded=useRef(new Set<number>()),root=useRef<HTMLDivElement>(null),[width,setWidth]=useState(600),[selected,setSelected]=useState<number|null>(null);
 useLayoutEffect(()=>{const el=root.current;if(!el)return;const resize=()=>setWidth(el.clientWidth);const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[]);
 const parsed=devicePreviewDataSchema.safeParse(view.data);if(!parsed.success)return <p>Invalid viewport preview.</p>;const data=parsed.data,doc=staticPreviewDocument(data.html,data.css);
 const frames=data.viewports.map(v=>typeof v==='string'?DEVICE_VIEWPORTS[v]:v);
 const tile=Math.max(200,Math.min(340,width-32)),columns=Math.max(1,Math.floor(width/(tile+20))),slot=(width-20*(columns-1))/columns;
 return <div ref={root} className="device-preview" data-navigation-scroll><p className="device-preview-note">CSS viewport preview · same browser engine · not an email-client simulation</p>{selected!==null&&<button onClick={()=>setSelected(null)}>← All viewports</button>}<div className={selected===null?'device-preview-grid':'device-preview-full'} style={selected===null?{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}:undefined}>{frames.map((frame,index)=>{if(selected!==null&&selected!==index)return null;const scale=selected===index?1:Math.min(1,(slot-8)/frame.width,500/frame.height);return <section className="device-preview-card" key={index}><header><strong>{frame.name}</strong><span>{frame.width} × {frame.height} CSS px · {Math.round(scale*100)}%</span>{selected===null&&<button onClick={()=>setSelected(index)}>Actual size</button>}</header><div className="device-preview-frame" style={{width:frame.width*scale,height:frame.height*scale}}><iframe title={`${frame.name} · ${frame.width}×${frame.height}`} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} onLoad={()=>{loaded.current.add(index);if(loaded.current.size>=frames.length)onReady?.();}} style={{width:frame.width,height:frame.height,transform:`scale(${scale})`}}/></div></section>;})}</div></div>;
}
