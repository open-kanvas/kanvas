import {useMemo} from 'react';
import {jsonPathLine,prettyJson} from '../../shared/connection-views';
import {highlightLine} from './Code';
import './json-raw.css';

/** Pretty-printed JSON text: indentation, syntax colours and line numbers.
 * Tokens are the source tokens; only whitespace differs. */
export function JsonRaw({source,highlightPath,maxLines,label}:{source:string;highlightPath?:string;maxLines?:number;label?:string}){
 const pretty=useMemo(()=>{try{return prettyJson(source);}catch{return source;}},[source]);
 const lines=useMemo(()=>pretty.split('\n'),[pretty]),marked=highlightPath?jsonPathLine(pretty,highlightPath):undefined;
 const shown=maxLines&&lines.length>maxLines?lines.slice(0,maxLines):lines;
 return <div className="json-raw" data-navigation-scroll tabIndex={0} role="region" aria-label={label??'JSON text'} data-json-view="raw" data-json-lines={lines.length}>
  <ol>{shown.map((line,index)=><li key={index} className={marked===index+1?'is-marked':undefined} data-json-line={index+1}><code>{highlightLine(line,'json')}</code></li>)}</ol>
  {shown.length<lines.length&&<p className="json-raw-more">{lines.length-shown.length} more lines stored. Ask for the full result to expand it.</p>}
 </div>;
}
