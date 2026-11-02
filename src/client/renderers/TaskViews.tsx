import { FormattedTime } from './Regional';
import { useSelection } from './Selection';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { RendererProps } from './Renderer';
import { logEntries, type LogData, type ProgressData } from '../../shared/task-views';
import type { ExtendedData } from '../../shared/extended-templates';
import { useNavigation } from './Navigation';
import { errorMessage } from '../api';
import './task-views.css';

interface SpineEvent {id:string;title:string;description?:string;timestamp:string;end?:string;status?:string;lane?:string;url?:string}
/** The time axis is proportional; connectors lead to non-overlapping cards.
 * Equal timestamps share a point rather than inventing elapsed time. */
function Spine({events,orientation='horizontal',label,discrete=false,alternating=false}:{events:SpineEvent[];orientation?:'horizontal'|'vertical';label:string;discrete?:boolean;alternating?:boolean}){
  const root=useRef<HTMLDivElement>(null),[geometry,setGeometry]=useState<{width:number;height:number;centers:number[];edges:number[];axis:number}>();
  useEffect(()=>{const el=root.current;if(!el)return;const measure=()=>{if(!el.isConnected)return;const box=el.getBoundingClientRect(),cards=[...el.querySelectorAll<HTMLElement>('.spine-card')].map(card=>card.getBoundingClientRect()),horizontal=orientation==='horizontal';
    const width=Math.ceil(Math.max(el.clientWidth,...cards.map(r=>r.right-box.left))),height=Math.ceil(Math.max(el.clientHeight,...cards.map(r=>r.bottom-box.top)));
    const axis=alternating?(horizontal?Math.max(0,...cards.filter((_,i)=>i%2===0).map(r=>r.bottom-box.top))+32:width/2):22;
    const next={width,height,axis,edges:cards.map((r,i)=>horizontal?(alternating&&i%2===0?r.bottom:r.top)-box.top:(alternating&&i%2===0?r.right:r.left)-box.left),centers:cards.map(r=>horizontal?r.left-box.left+r.width/2:r.top-box.top+r.height/2)};setGeometry(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };measure();const observer=new ResizeObserver(measure);observer.observe(el);for(const card of el.querySelectorAll('.spine-card'))observer.observe(card);return()=>observer.disconnect();},[orientation,alternating,JSON.stringify(events)]);
  const times=events.map(e=>Date.parse(e.timestamp)),last=events.map(e=>Date.parse(e.end??e.timestamp)),minimum=Math.min(...times),maximum=Math.max(...last),span=maximum-minimum;
  const horizontal=orientation==='horizontal',length=geometry?(horizontal?geometry.width:geometry.height):0,point=(time:number)=>32+(span?(time-minimum)/span:0.5)*Math.max(0,length-64);
  return <div className={`spine-scroll spine-${orientation} ${discrete?'spine-progress':''} ${alternating?'spine-alternating':''}`} data-navigation-scroll tabIndex={0} role="region" aria-label={label}><div className="spine-content" ref={root} style={{'--event-count':events.length} as CSSProperties}>
    {geometry&&<svg className="spine-axis" width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true"><line className="spine-line" x1={horizontal?16:geometry.axis} y1={horizontal?geometry.axis:16} x2={horizontal?geometry.width-16:geometry.axis} y2={horizontal?geometry.axis:geometry.height-16}/>{events.map((event,i)=>{const at=discrete?geometry.centers[i]:point(times[i]),to=geometry.centers[i]??at,end=point(last[i]),edge=geometry.edges[i]??64;return <g key={event.id} data-event-id={event.id} data-time-position={span?(times[i]-minimum)/span:0.5}>
      {event.end&&<line className="spine-duration" x1={horizontal?at:geometry.axis} y1={horizontal?geometry.axis:at} x2={horizontal?end:geometry.axis} y2={horizontal?geometry.axis:end}/>}
      <line className="spine-connector" x1={horizontal?at:geometry.axis} y1={horizontal?geometry.axis:at} x2={horizontal?to:edge} y2={horizontal?edge:to}/><circle className={`spine-point ${event.status??''}`} cx={horizontal?at:geometry.axis} cy={horizontal?geometry.axis:at} r="6"/></g>;})}</svg>}
    {events.map((event,i)=><article key={event.id} className={`spine-card ${event.status??''}`} data-progress-id={event.id} style={alternating?(horizontal?{gridColumn:`${i+1} / span 2`,gridRow:i%2+1}:{gridColumn:i%2===0?1:3,gridRow:`${i+1} / span 2`}):undefined}><div className="spine-meta"><time>{<FormattedTime value={event.timestamp}/>} {event.end?` — ${event.end}`:''}</time>{event.status&&<span>{event.status}</span>}</div>{event.lane&&<small>{event.lane}</small>}<h3>{event.url?<a href={event.url} target="_blank" rel="noopener noreferrer">{event.title}</a>:event.title}</h3>{event.description&&<p>{event.description}</p>}</article>)}
  </div></div>;
}
export function ProgressRenderer({data}:{data:ProgressData}){
  const root=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
  useEffect(()=>{const el=root.current;if(!el)return;const observer=new ResizeObserver(()=>setWidth(el.clientWidth));observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect();},[]);
  const alternating=data.layout==='alternating'||data.layout!=='single'&&data.events.length>=6&&(data.orientation!=='vertical'||width>=600);
  return <div ref={root} className="progress-surface" data-progress-layout={alternating?'alternating':'single'}><header><h2>{data.task}</h2><span role="status">{data.status}</span></header>{data.events.length?<Spine events={data.events} orientation={data.orientation} label="Task progress" discrete alternating={alternating}/>:<p>Waiting for the first update.</p>}</div>;
}
export { TimelineRenderer } from './Timeline';
export function LogRenderer(props:RendererProps){
  const selection=useSelection();
  const data=props.view.data as LogData,navigation=useNavigation(),[localPage,setPage]=useState(0),[selected,setSelected]=useState<number>(),[error,setError]=useState('');
  const entries=logEntries(data),size=data.pageSize??100,pages=Math.max(1,Math.ceil(entries.length/size)),page=Math.min(pages-1,navigation?.state.page??localPage);
  const change=(page:number)=>navigation?navigation.send({action:'page',page:page+1}):setPage(page);
  return <div className="log-surface"><header>{data.source&&<strong>{data.source}</strong>}<span>{entries.length} lines · {entries.filter(e=>e.flagged).length} flagged</span></header><div className="log-scroll" data-navigation-scroll tabIndex={0} role="region" aria-label="Log lines"><ol className="log-lines">{entries.slice(page*size,(page+1)*size).map((entry,i)=><li key={entry.line} className={`log-line level-${entry.level} ${entry.flagged?'flagged':''} ${selection.highlights.includes(page*size+i)?'agent-highlight':''} ${selected===entry.line?'selected':''}`} data-log-line={entry.line}>
    <button aria-label={`Inspect log line ${entry.line}`} disabled={!props.actionable||props.preview||!props.onRespond} onClick={()=>{setSelected(entry.line);setError('');void props.onRespond!({kind:'log.inspect',line:entry.line}).catch(e=>setError(errorMessage(e)));}}>{entry.line}</button><div><div className="log-meta">{entry.timestamp&&<time>{<FormattedTime value={entry.timestamp}/>} </time>}<span className="log-level">{entry.level}</span>{entry.flagged&&<b aria-label="Flagged">⚑</b>}</div><pre>{entry.message}</pre>{entry.annotation&&<p className="log-annotation">{entry.annotation}</p>}</div></li>)}</ol></div>{pages>1&&<nav className="browsing-pages" aria-label="Log pagination"><button disabled={page===0||navigation?.canNavigate===false} onClick={()=>change(page-1)}>← Previous</button><span>Page {page+1} of {pages}</span><button disabled={page===pages-1||navigation?.canNavigate===false} onClick={()=>change(page+1)}>Next →</button></nav>}{selected&&<span role="status">Selected line {selected}</span>}{error&&<p role="alert">{error}</p>}</div>;
}
