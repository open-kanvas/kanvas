import {type ReactNode} from 'react';
import {TOOL_CALL_LINES,type ToolCallDetailsData} from '../../shared/tool-call-details';
import {JsonExplorer} from './JsonExplorer';
import {FormattedTime} from './Regional';
import {JsonRaw} from './JsonRaw';
import './tool-call-details.css';

const duration=(ms:number)=>ms<1000?`${ms} ms`:ms<60_000?`${(ms/1000).toFixed(ms<10_000?2:1)} s`:`${Math.floor(ms/60_000)} min ${Math.round(ms%60_000/1000)} s`;

export function ToolCallDetails({data}:{data:ToolCallDetailsData}){
 const limit=data.expanded?undefined:TOOL_CALL_LINES,tree=data.view==='tree';
 const pane=(title:string,which:'request'|'response',content:ReactNode)=><section className="tool-call-pane" data-pane={which} aria-label={title}><h3>{title}{data.highlight?.pane===which&&data.highlight.note&&<small className="tool-call-note">{data.highlight.note}</small>}</h3>{content}</section>;
 const json=(source:string,which:'request'|'response')=>tree?<JsonExplorer data={{json:source,expandedDepth:3}}/>:<JsonRaw source={source} maxLines={limit} highlightPath={data.highlight?.pane===which?data.highlight.path:undefined} label={`${which} JSON`}/>;
 const text=data.responseText,textLines=text?.split('\n')??[];
 return <div className={`tool-call-details status-${data.status}`}>
  <header className="tool-call-header"><div><h2>{data.tool}</h2>{data.integration&&<span className="tool-call-integration">{data.integration}</span>}</div>
   <dl><div><dt>Status</dt><dd className="tool-call-status">{data.status==='success'?'Success':data.status==='error'?'Error':'Running'}</dd></div>{data.durationMs!==undefined&&<div><dt>Duration</dt><dd>{duration(data.durationMs)}</dd></div>}{data.timestamp&&<div><dt>Time</dt><dd><FormattedTime value={data.timestamp}/></dd></div>}</dl></header>
  {data.error&&<p className="tool-call-error" role="alert">{data.error.code&&<strong>{data.error.code}</strong>}<span>{data.error.message}</span></p>}
  <div className="tool-call-panes">
   {pane('Request','request',json(data.request,'request'))}
   {pane('Response','response',data.response?json(data.response,'response'):text!==undefined?<div className="json-raw tool-call-text" data-navigation-scroll tabIndex={0}><pre>{limit&&textLines.length>limit?textLines.slice(0,limit).join('\n'):text}</pre>{limit&&textLines.length>limit&&<p className="json-raw-more">{textLines.length-limit} more lines stored.</p>}</div>:<p className="tool-call-empty">{data.status==='running'?'Waiting for the response…':'No response content.'}</p>)}
  </div>
 </div>;
}
