import {useId,useEffect,useRef,useState} from 'react';
import type {ChartData} from '../../shared/chart-contract';
import {seriesColor} from './chart-palette';
/** Linear clipping follows the supplied polyline; no fitted density or integrated probability. */
export function clippedCurve(points:{x:number;y:number}[],from:number,to:number){
 const at=(x:number)=>{const i=points.findIndex(p=>p.x>=x);if(i<=0)return {x,y:points[0].y};const a=points[i-1],b=points[i];return {x,y:a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)};};
 return [at(from),...points.filter(p=>p.x>from&&p.x<to),at(to)];
}
export function DistributionChart({data}:{data:ChartData}){
 const prefix=useId().replaceAll(':',''),root=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:900,height:550});
 useEffect(()=>{const el=root.current;if(!el)return;const resize=()=>setSize({width:Math.max(280,el.clientWidth),height:Math.max(260,el.clientHeight)});const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();},[]);
 if(import.meta.env.VITE_KANVAS_STATISTICS_ENABLED==='false')return <p role="status">Statistical visuals are disabled on this installation.</p>;
 const overlay=data.distribution!,all=data.series.flatMap(s=>s.points.map(p=>({x:Number(p.x),y:Number(p.y)}))),W=size.width,H=size.height,left=W<500?45:75,right=24,top=45,bottom=60,pw=W-left-right,ph=H-top-bottom;
 const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minY=Math.min(0,...all.map(p=>p.y),...overlay.bands.flatMap(b=>b.points.map(p=>p.low))),maxY=Math.max(0,...all.map(p=>p.y),...overlay.bands.flatMap(b=>b.points.map(p=>p.high)));
 const x=(v:number)=>left+(v-minX)/(maxX-minX)*pw,y=(v:number)=>top+ph-(v-minY)/(maxY-minY||1)*ph,xy=(p:{x:number;y:number})=>x(p.x)+','+y(p.y),ink=(name:string)=>{const i=data.series.findIndex(s=>s.name===name);return data.series[i].color??seriesColor(i,data.series.length);},fmt=(n:number)=>new Intl.NumberFormat(undefined,{maximumSignificantDigits:3}).format(n);
 return <div className="chart-content legacy-chart distribution-chart" data-chart-kind="distribution" style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
 {data.legend!==false&&<div className="chart-legend" style={{fontSize:"calc(clamp(14px,2vw,22px)*var(--chart-text-scale,1))",minHeight:28}}>{data.series.map(s=><span key={s.name}><i style={{background:ink(s.name)}}/>{s.name}</span>)}</div>}
 <div ref={root} className="legacy-chart-plot" style={{minHeight:260}}><svg width={W} height={H} viewBox={'0 0 '+W+' '+H} role="img" aria-label="Supplied distribution curves and intervals" style={{fontSize:(W<500?12:17)*(data.textScale??1)}}>
 <defs><clipPath id={prefix+'plot'}><rect x={left} y={top} width={pw} height={ph}/></clipPath></defs>
 {Array.from({length:5},(_,i)=>{const vx=minX+(maxX-minX)*i/4,vy=minY+(maxY-minY)*i/4;return <g key={i} className="chart-axis"><line x1={left} x2={W-right} y1={y(vy)} y2={y(vy)}/><text x={left-6} y={y(vy)+4} textAnchor="end">{fmt(vy)}</text><text x={x(vx)} y={H-bottom+22} textAnchor="middle">{fmt(vx)}</text></g>;})}
 <g clipPath={'url(#'+prefix+'plot)'}>
 {overlay.bands.map(b=><path key={b.id} data-band-id={b.id} d={'M'+b.points.map(p=>xy({x:p.x,y:p.high})).join(' L')+' L'+[...b.points].reverse().map(p=>xy({x:p.x,y:p.low})).join(' L')+' Z'} fill={b.color??ink(b.series)} fillOpacity=".18" stroke={b.color??ink(b.series)} strokeDasharray="4 4"><title>{(b.label??b.id)+' · supplied bounds'}</title></path>)}
 {overlay.ranges.map(r=>{const s=data.series.find(s=>s.name===r.series)!,points=clippedCurve(s.points.map(p=>({x:Number(p.x),y:Number(p.y)})),r.from,r.to);return <g key={r.id} data-range-id={r.id}><title>{(r.label??r.id)+': '+r.from+' to '+r.to}</title><path d={'M'+xy({x:r.from,y:0})+' L'+points.map(xy).join(' L')+' L'+xy({x:r.to,y:0})+' Z'} fill={r.color??ink(r.series)} fillOpacity=".36"/>{[r.from,r.to].map(v=><line key={v} x1={x(v)} x2={x(v)} y1={top} y2={top+ph} stroke={r.color??ink(r.series)} strokeDasharray="6 4"/>)}</g>;})}
 {data.series.map(s=><path key={s.name} data-distribution-series={s.name} d={'M'+s.points.map(p=>xy({x:Number(p.x),y:Number(p.y)})).join(' L')} stroke={ink(s.name)} strokeWidth={s.lineWidth??3} strokeDasharray={s.dashed?'8 5':undefined} fill="none"><title>{s.name}</title></path>)}
 </g>
 {overlay.ranges.filter(r=>r.label).map((r,i)=><text key={r.id} x={x((r.from+r.to)/2)} y={top+18+(i%3)*20} textAnchor="middle" fill="var(--text,#eee)">{r.label}</text>)}
 <text x={left} y="24" fill="var(--muted,#aaa)">{[data.yLabel,data.unit].filter(Boolean).join(' · ')}</text><text x={W/2} y={H-8} textAnchor="middle" fill="var(--muted,#aaa)">{data.xLabel}</text>
 </svg></div></div>;
}
