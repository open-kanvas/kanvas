import {useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {projectTasks,statusColor,taskCustomColumns,type TaskListData} from '../../shared/task-list';
import './task-list.css';
import {api,displayPath,errorMessage} from '../api';
import type {TaskItem} from '../../shared/task-list';

const duration=(ms:number)=>ms<1000?`${ms} ms`:ms<60_000?`${(ms/1000).toFixed(ms<10_000?2:1)} s`:`${Math.floor(ms/60_000)} min ${Math.round(ms%60_000/1000)} s`;

const DETAIL_SHOWN=1400;

export function TaskList({data,sessionId,displayId}:{data:TaskListData;sessionId?:string;displayId?:string}){
 const initialExpanded=()=>Object.fromEntries((data.expanded??(data.highlight?[data.highlight]:[])).map(key=>[key,true]));
 const [expanded,setExpanded]=useState<Record<string,boolean>>(initialExpanded),[details,setDetails]=useState<Record<string,TaskItem>>({}),[error,setError]=useState('');
 useEffect(()=>{setDetails({});setExpanded(initialExpanded());},[data.taskListId]);
 // Keep locally expanded detail live across agent deltas without losing its open state.
 useEffect(()=>{let cancelled=false;setDetails({});
  if(sessionId&&displayId)for(const item of data.items){
   const key=String(item.id??item.number),open=expanded[key]??false;
   if(open&&item.id&&item.hasDetail&&!item.detail&&!item.subtasks)void api<TaskItem>(displayPath(sessionId,displayId)+'/task-items/'+encodeURIComponent(item.id))
    .then(full=>{if(!cancelled)setDetails(old=>({...old,[key]:full}));}).catch(e=>{if(!cancelled)setError(errorMessage(e));});
  }
  return()=>{cancelled=true;};
 },[data.items,data.taskListRevision,expanded,sessionId,displayId]);
 // Agent commands replace local disclosure overrides; unrelated row updates preserve them.
 useEffect(()=>{setExpanded(initialExpanded());},[data.highlight,data.highlightSubtask,data.expansionRevision]);
 const toggle=(item:TaskItem)=>{const key=String(item.id??item.number),open=expanded[key]??false;setExpanded(old=>({...old,[key]:!open}));setError('');};
 const projected=useMemo(()=>projectTasks(data.items,{sort:data.sort,filter:data.filter,doneLast:data.doneLast}),[data.items,data.sort,data.filter,data.doneLast]);
 // Items ticked since the previous render get a short in-place check-off; the first render animates nothing.
 const doneBefore=useRef<Set<string>|undefined>(undefined),justDone=useMemo(()=>{const now=new Set(data.items.filter(item=>item.checked).map(item=>String(item.id??item.number))),fresh=new Set(doneBefore.current?[...now].filter(key=>!doneBefore.current!.has(key)):[]);doneBefore.current=now;return fresh;},[data.items]);
 const body=useRef<HTMLTableSectionElement>(null),positions=useRef(new Map<string,number>()),lastHighlight=useRef<string|undefined>(undefined);
 // When the list asks for doneLast (or is re-sorted), a moved item visibly travels to its new place.
 useLayoutEffect(()=>{const root=body.current;if(!root)return;const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,next=new Map<string,number>();
  for(const row of root.querySelectorAll<HTMLElement>('tr[data-task-id]')){const key=row.dataset.taskId!,top=row.offsetTop;next.set(key,top);const before=positions.current.get(key);
   if(!reduced&&before!==undefined&&Math.abs(before-top)>1&&typeof row.animate==='function')row.animate([{transform:`translateY(${before-top}px)`},{transform:'none'}],{duration:Math.min(900,350+Math.abs(before-top)/2),easing:'cubic-bezier(.2,.7,.2,1)'});}
  positions.current=next;
 },[projected]);
 useEffect(()=>{if(data.highlight===lastHighlight.current)return;lastHighlight.current=data.highlight;if(!data.highlight)return;
  body.current?.querySelector<HTMLElement>(`tr[data-task-id="${CSS.escape(data.highlight)}"]`)?.scrollIntoView({block:'center',behavior:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 },[data.highlight]);
 const open=data.items.filter(item=>!item.checked).length,done=data.items.length-open,columns=taskCustomColumns(data.columns,data.items);
 const anyStatus=data.items.some(item=>item.status),anyTags=data.items.some(item=>item.tags?.length);
 return <div className="task-list" data-task-list={data.taskListId}>{error&&<p role="alert">{error}</p>}
  <p className="task-list-counts"><span><b>{open}</b> open</span><span><b>{done}</b> done</span>{projected.hidden>0&&<span className="task-list-hidden">{projected.hidden} hidden by filter</span>}</p>
  <div className="task-list-scroll" data-navigation-scroll tabIndex={0}><table><thead><tr>{data.showNumber!==false&&<th className="task-number" scope="col">#</th>}{data.showReference&&<th scope="col">Reference</th>}<th scope="col" className="task-check" aria-label="Done"/><th scope="col">Item</th>{anyStatus&&<th scope="col">Status</th>}{anyTags&&<th scope="col">Tags</th>}{columns.map(column=><th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
   <tbody ref={body}>{projected.items.map(item=>{const current=item.id===data.highlight,key=String(item.id??item.number),isOpen=expanded[key]??false,full=details[key]??item,colour=statusColor(data.statusPalette,item.status,data.colors);
    return <tr key={item.id??item.number} data-task-id={item.id} data-task-number={item.number} className={`${item.checked?'is-done':''}${current?' is-current':''}${justDone.has(String(item.id??item.number))?' just-done':''}`.trim()} aria-current={current?'true':undefined}>
     {data.showNumber!==false&&<td className="task-number">{item.number}</td>}{data.showReference&&<td className="task-reference">{item.reference}</td>}
     <td className="task-check"><span className="task-box" role="img" aria-label={item.checked?'Done':'Open'}>{item.checked?'✓':''}</span></td>
     <td className="task-item">{item.hasDetail||item.detail||item.subtasks?.length?<button className="task-detail-toggle" aria-expanded={isOpen} onClick={()=>void toggle(item)}><strong>{item.title}</strong><span aria-hidden="true">{isOpen?'−':'+'}</span></button>:<strong>{item.title}</strong>}
      {item.subtaskProgress&&<small className="task-subtask-progress">{item.subtaskProgress.done}/{item.subtaskProgress.total} done</small>}{item.summary&&<p className="task-summary">{item.summary}</p>}
      {isOpen&&full.detail&&<div className="task-detail">{full.detail}</div>}
      {isOpen&&full.source&&<p className="task-source">{full.source}</p>}
      {isOpen&&full.subtasks?.length? <ul className="task-subtasks">{full.subtasks.map(sub=><li key={sub.id} data-subtask-id={sub.id} aria-current={current&&sub.id===data.highlightSubtask?'true':undefined}>
       <span className="task-box" role="img" aria-label={sub.checked?'Done':'Open'}>{sub.checked?'✓':''}</span><div className="task-subtask-content"><div className="task-subtask-heading"><strong>{sub.title}</strong>{sub.status&&<span className="task-pill">{sub.status}</span>}</div>{sub.description&&<p>{sub.description}</p>}{sub.detail&&<p className="task-detail">{sub.detail}</p>}</div>
      </li>)}</ul>:null}</td>
     {anyStatus&&<td className="task-status">{item.status&&<span className="task-pill" style={colour?{'--pill':colour} as CSSProperties:undefined}>{item.status}</span>}</td>}
     {anyTags&&<td className="task-tags">{(item.tags??[]).map(tag=><span key={tag} className="task-tag">{tag}</span>)}</td>}
     {columns.map(column=><td key={column.key} className="task-field">{item.fields?.[column.key]??''}</td>)}
    </tr>;})}</tbody></table></div>
 </div>;
}
