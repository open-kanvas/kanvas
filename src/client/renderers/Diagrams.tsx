import { useNavigation } from './Navigation';
import { useId,useLayoutEffect,useRef,useState } from 'react';
import { architectureDataSchema, diagramLayout, fitFlowchart, diagramLines, flowchartDataSchema, networkDataSchema, orgChartDataSchema, sportsLineupDataSchema } from '../../shared/diagrams';
import type { RendererProps } from './Renderer';
import './diagrams.css';
const lines=diagramLines;

const diagramSymbols:Record<string,string>={
 service:'M3 3h18v6H3zM3 15h18v6H3zM6 6h.1M6 18h.1',
 database:'M3 5c0-4 18-4 18 0s-18 4-18 0v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0',
 api:'M3 7h18m-5-4 5 4-5 4M21 17H3m5-4-5 4 5 4',
 queue:'M2 7h4v10H2zM10 7h4v10h-4zM18 7h4v10h-4z',
 cache:'m14 2-10 12h7l-1 8 10-13h-7z',
 external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
 client:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 8 0 0 1 16 0v2',
 'load-balancer':'M12 2v9M12 11H4v10M12 11h8v10m-19-3 3 3 3-3m10 0 3 3 3-3',
 engineering:'m8 5-6 7 6 7m8-14 6 7-6 7m-5 2 2-18',
 sales:'M3 19 10 12l4 3 7-12m-7 0h7v7',
 support:'M3 13V9a9 9 0 0 1 18 0v4M3 11H1v8h5v-8zm18 0h2v8h-5v-8zM18 19v3h-6',
 team:'M8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M1 20v-3a7 7 0 0 1 14 0v3M16 3a3 3 0 0 1 0 6M17 11a6 6 0 0 1 6 6v3',
};
function DiagramSymbol({name}:{name:string}){return <svg className="diagram-symbol" x="-108" y="-12" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label={name}><title>{name}</title><path d={diagramSymbols[name==='person'?'client':name]??diagramSymbols.service}/></svg>;}

export function DiagramRenderer({view}:RendererProps){
  const navigation=useNavigation(),zoom=navigation?.state.focus?.zoom??1;
  const root=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:660,height:400});
  useLayoutEffect(()=>{const el=root.current;if(!el)return;const resize=()=>setSize({width:el.clientWidth,height:el.clientHeight});resize();const observer=new ResizeObserver(resize);observer.observe(el);return()=>observer.disconnect();},[]);
  const marker=useId().replace(/:/g,''),schema=view.template==='architecture'?architectureDataSchema:view.template==='org-chart'?orgChartDataSchema:view.template==='network'?networkDataSchema:flowchartDataSchema,parsed=schema.safeParse(view.data);
  if(!parsed.success)return <p>This diagram could not be shown.</p>;
  const natural=diagramLayout(parsed.data,view.template==='org-chart',Infinity);
  const fit=view.template==='flowchart'?fitFlowchart(parsed.data,size.width,size.height):{...natural,scale:Math.min(1,Math.max(1,size.width)/natural.width,Math.max(1,size.height)/natural.height)};
  const layout=fit,focusing=Boolean(navigation?.state.focus),scale=focusing?Math.max(1,fit.scale*zoom):fit.scale;
  return <div ref={root} className={`diagram-scroll${!focusing?' diagram-fit':''}`} data-navigation-scroll tabIndex={0} role="region" aria-label={`${view.template} diagram`}><svg className="relationship-diagram" viewBox={`0 0 ${layout.width} ${layout.height}`} style={{width:layout.width*scale,height:layout.height*scale}} role="img" aria-label={view.title??`${view.template}: ${layout.nodes.map(n=>n.label).join(', ')}`}><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="var(--muted)"/></marker></defs>
    {layout.edges.map((edge,i)=>{const a=layout.nodes.find(n=>n.id===edge.from)!,b=layout.nodes.find(n=>n.id===edge.to)!;if(!a||!b)return null;
      const dx=b.x-a.x,dy=b.y-a.y,sa=1/Math.max(Math.abs(dx)/116,Math.abs(dy)/(a.height/2),1),sb=1/Math.max(Math.abs(dx)/116,Math.abs(dy)/(b.height/2),1);
      const sx=a.x+dx*sa,sy=a.y+dy*sa,ex=b.x-dx*sb,ey=b.y-dy*sb;
      const routed=layout.narrow&&(dy<=0||Math.abs(dy)>layout.step+1),right=i%2===0,rail=right?layout.width-14:14,side=right?116:-116;
      const path=a===b?`M${a.x+100} ${a.y-30} C${a.x+160} ${a.y-100},${a.x+160} ${a.y+100},${a.x+100} ${a.y+30}`:routed?`M${a.x+side} ${a.y} H${rail} V${b.y} H${b.x+side}`:`M${sx} ${sy} L${ex} ${ey}`;
      const tx=routed?rail:(sx+ex)/2,ty=routed?(a.y+b.y)/2:(sy+ey)/2-9;
      return <g key={i} className="diagram-edge"><title>{`${a.label} → ${b.label}${edge.label?`: ${edge.label}`:''}`}</title><path d={path} markerEnd={edge.directed?`url(#${marker})`:undefined}/>{edge.label&&<text x={tx} y={ty} textAnchor="middle" transform={routed?`rotate(-90 ${tx} ${ty})`:undefined}>{edge.label}</text>}</g>;})}
    {layout.nodes.map(node=>{const labels=lines(node.label,node.shape==='decision'?18:24),detail=lines(node.detail??'',node.shape==='decision'?22:29),symbol=node.icon??('type' in node?String(node.type):undefined);return <g key={node.id} data-node-id={node.id} data-navigation-target={node.label+' '+(node.detail??'')} className={`diagram-node shape-${node.shape}`} transform={`translate(${node.x} ${node.y})`}><title>{`${node.label}${node.detail?` — ${node.detail}`:''}`}</title>{node.shape==='decision'?<path d={`M0 ${-node.height/2} L124 0 L0 ${node.height/2} L-124 0Z`} style={{stroke:node.color}}/>:<rect x="-116" y={-node.height/2} width="232" height={node.height} rx={node.shape==='terminal'?55:12} style={{stroke:node.color}}/>}{node.image?<image href={node.image} x="-108" y="-12" width="24" height="24"/>:symbol?<DiagramSymbol name={symbol}/>:null}<text textAnchor="middle" transform={node.image||symbol?"translate(10 0)":undefined} y={-(labels.length*20+detail.length*17)/2+15}>{labels.map((line,i)=><tspan className="diagram-label" x="0" dy={i?20:0} key={i}>{line}</tspan>)}{detail.map((line,i)=><tspan className="diagram-detail" x="0" dy="17" key={`d${i}`}>{line}</tspan>)}</text></g>;})}</svg></div>;
}
export function SportsLineupRenderer({view}:RendererProps){
  const parsed=sportsLineupDataSchema.safeParse(view.data);if(!parsed.success)return <p>This lineup could not be shown.</p>;const data=parsed.data;
  return <div className="lineup-surface" data-navigation-scroll><header><strong>{data.team}</strong>{data.formation&&<span>{data.formation}</span>}</header><svg className="lineup-pitch" viewBox="0 0 600 780" role="img" aria-label={`${data.team} soccer lineup`}><rect className="pitch-grass" x="0" y="0" width="600" height="780" rx="16"/><g className="pitch-lines"><rect x="22" y="22" width="556" height="736"/><path d="M22 390 H578 M140 22 V138 H460 V22 M140 758 V642 H460 V758 M220 22 V68 H380 V22 M220 758 V712 H380 V758"/><circle cx="300" cy="390" r="78"/><circle cx="300" cy="390" r="4"/></g>{data.players.map(player=><g key={player.id} data-player-id={player.id} transform={`translate(${80+player.x*440} ${50+player.y*600})`}><title>{`${player.name}${player.role?` · ${player.role}`:''}`}</title><circle r="22" fill={data.kitColor??'#f7fafc'} stroke="#132b37" strokeWidth="2"/><text className="lineup-number" textAnchor="middle" y="7">{player.number??''}</text>{lines(player.name,17).map((line,i)=><text className="lineup-name" textAnchor="middle" y={43+i*19} key={i}>{line}</text>)}</g>)}</svg>{!!data.bench?.length&&<p className="lineup-bench"><strong>Bench</strong> {data.bench.join(' · ')}</p>}</div>;
}
