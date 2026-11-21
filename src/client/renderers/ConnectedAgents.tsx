import {type AgentsData} from '../../shared/connected-agents';
import './connected-agents.css';

const ago=(iso:string|undefined,now:number)=>{if(!iso)return 'never';const seconds=Math.max(0,Math.round((now-Date.parse(iso))/1000));return seconds<90?'just now':seconds<3600?`${Math.round(seconds/60)} min ago`:seconds<86_400?`${Math.round(seconds/3600)} h ago`:`${Math.round(seconds/86_400)} d ago`;};

export function Agents({data,serverNow}:{data:AgentsData;serverNow?:string}){
 const now=serverNow?Date.parse(serverNow):Date.now();
 return <div className="agents-view work-scroll" data-navigation-scroll tabIndex={0}>{!data.agents.length&&<p>No agents have connected to this account yet.</p>}
  <ul className="agents-list">{data.agents.map(agent=><li key={agent.id} className={`${agent.connectedNow?'is-active':''}${agent.revoked?' is-revoked':''}`.trim()} data-agent-id={agent.id}>
   <i className="agents-dot" role="img" aria-label={agent.revoked?'Access revoked':agent.connectedNow?'Active now':'Not active'}/>
   <div className="agents-name"><strong>{agent.name}</strong>{agent.model&&<span>{agent.model}</span>}</div>
   <div className="agents-seen">{agent.revoked?'Revoked':agent.connectedNow?'Active now':ago(agent.lastSeenAt,now)}</div>
   <div className="agents-sessions"><b>{agent.sessionCount}</b> {agent.sessionCount===1?'session':'sessions'}{agent.lastSession&&<span>{agent.lastSession}</span>}</div>
  </li>)}</ul></div>;
}
