import { useEffect,useState } from 'react';
import type { DisplayRecord,SessionRecord } from '../../shared/types';
import { api,displayPath,requestId,sessionPath } from '../api';
import { useTask } from '../hooks';
import { Button,ErrorNotice,Field } from '../components/ui';
export function PublicAccessControl({session,reload}:{session:SessionRecord;reload:()=>Promise<unknown>}){
  const task=useTask(),enabled=session.publicAccess?.enabled===true;
  return <section className="public-access-control"><h3>Public session</h3><p>Off by default. When enabled, anyone with this session link can view all current displays without signing in or pairing. They cannot manage the workspace or see private history.</p><Button variant={enabled?'secondary':'primary'} busy={task.busy} onClick={()=>void task.run(async()=>{await api(`${sessionPath(session.id)}/public-access`,{method:'POST',body:{enabled:!enabled,confirm:true,expectedRevision:session.publicAccess?.revision??0}});await reload();})}>{enabled?'Make session private':'Enable public viewing'}</Button>{enabled&&<p><a href={`/session/${session.id}`} target="_blank" rel="noopener noreferrer">Open public session</a></p>}<ErrorNotice message={task.error}/></section>;
}
interface Run {status:'running'|'paused'|'stopped'|'completed';version:number;index?:number;total?:number;intervalSeconds?:number;loop?:boolean;reason?:string}
export function AutoplayControl({sessionId,display,displays,reload}:{sessionId:string;display:DisplayRecord;displays:DisplayRecord[];reload:()=>Promise<unknown>}){
  const [run,setRun]=useState<Run>(),[seconds,setSeconds]=useState('10'),[loop,setLoop]=useState(true),[source,setSource]=useState(display.view?.template==='presentation'?'presentation':'session');const task=useTask();
  const path=`${displayPath(sessionId,display.id)}/autoplay`;
  useEffect(()=>{let live=true;const load=()=>void api<Run>(path).then(r=>{if(live)setRun(r);}).catch(()=>{});load();const timer=setInterval(load,2000);return()=>{live=false;clearInterval(timer);};},[path]);
  const control=(action:'start'|'pause'|'resume'|'stop')=>void task.run(async()=>{
    const current=action==='start'?run:await api<Run>(path);
    const body={requestId:requestId(),action,...(action==='start'?{expectedRevision:display.revision,intervalSeconds:Number(seconds),loop,...(source==='session'?{frames:displays.filter(d=>d.view&&!['overview','settings'].includes(d.view.template)).map(d=>({displayId:d.id}))}:{})}:{expectedVersion:current?.version})};
    setRun(await api<Run>(path,{method:'POST',body}));await reload();
  });
  return <details className="autoplay-settings"><summary>Autoplay / kiosk</summary><p>Play prepared views once or loop continuously. A new publication or display hold stops the run.</p><Field label="Seconds per view"><input type="number" min="2" max="86400" step="any" value={seconds} onChange={e=>setSeconds(e.target.value)}/></Field><Field label="Playlist"><select value={source} onChange={e=>setSource(e.target.value)}><option value="session">Current session displays, in order</option>{display.view?.template==='presentation'&&<option value="presentation">Current presentation</option>}</select></Field><label className="check-label"><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/>Loop continuously</label><div className="form-actions"><Button disabled={task.busy||display.held||!Number.isFinite(Number(seconds))||Number(seconds)<2||Number(seconds)>86400} onClick={()=>control('start')}>Start autoplay</Button>{run?.status==='running'&&<Button variant="secondary" disabled={task.busy} onClick={()=>control('pause')}>Pause autoplay</Button>}{run?.status==='paused'&&<Button variant="secondary" disabled={task.busy} onClick={()=>control('resume')}>Resume autoplay</Button>}{(run?.status==='running'||run?.status==='paused')&&<Button variant="secondary" disabled={task.busy} onClick={()=>control('stop')}>Stop autoplay</Button>}</div><p role="status">{run?.status??'Not started'}{run?.total?` · ${(run.index??0)+1}/${run.total}`:''}{run?.reason?` · ${run.reason}`:''}</p><ErrorNotice message={task.error}/></details>;
}
