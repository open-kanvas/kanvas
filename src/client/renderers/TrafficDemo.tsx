import {useEffect,useState} from 'react';
import {trafficDemoSchema,trafficDemoPhase} from '../../shared/traffic-demo';
import type {RendererProps} from './Renderer';
import './traffic-demo.css';
export function TrafficDemoRenderer({view}:RendererProps){
 const data=trafficDemoSchema.parse(view.data),[now,setNow]=useState(Date.now());
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(id);},[]);
 if(import.meta.env.VITE_KANVAS_TRAFFIC_DEMO==='false')return <div>Traffic demonstration is disabled.</div>;
 const phase=trafficDemoPhase(data,now),sides=data.perspective==='both'?['a','b']:[data.perspective];
 return <section className="traffic-demo"><header>DEMONSTRATION ONLY — NOT FOR ROAD USE</header><div className="traffic-demo-sides">{sides.map(side=><div className="traffic-demo-side" key={side} data-side={side} data-green={phase.green===side}><h2>Side {side.toUpperCase()}</h2><div className="traffic-demo-light"><i aria-label="Red" className={phase.green!==side?'red on':'red'}/><i aria-label="Green" className={phase.green===side?'green on':'green'}/></div><strong>{phase.green===side?'GREEN':'RED'}</strong><output aria-label="Seconds to simulated phase change">{phase.remaining===null?'—':phase.remaining+' s'}</output></div>)}</div><footer>Pair {data.pairId} · {data.mode} · Independent browser-clock simulation; no verified delivery or hardware control.</footer></section>;
}
