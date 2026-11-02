import {useId} from 'react';
import type {VennData} from '../../shared/statistical-visuals';
import {vennRegionIds} from '../../shared/statistical-visuals';
import {seriesColor} from './chart-palette';
export function VennRenderer({data}:{data:VennData}){
 const prefix=useId().replaceAll(':','');
 if(import.meta.env.VITE_KANVAS_STATISTICS_ENABLED==='false')return <p role="status">Statistical visuals are disabled on this installation.</p>;
 const short=(v:string|number)=>String(v).length>18?String(v).slice(0,17)+'…':String(v);
 const three=data.sets.length===3,centers=three?[[245,205],[395,205],[320,330]]:[[245,260],[395,260]],r=145;
 const positions:Record<string,number[]>=three?{outside:[60,465],A:[205,170],B:[435,170],AB:[320,155],C:[320,420],AC:[240,310],BC:[400,310],ABC:[320,255]}:{outside:[60,465],A:[180,260],B:[460,260],AB:[320,260]};
 return <div style={{width:'100%',height:'100%',overflow:'auto'}}><svg viewBox="0 0 640 520" style={{width:'100%',height:'100%',minHeight:280}} role="img" aria-label="Supplied set regions; areas are not proportional to values">
 <defs>{centers.map(([cx,cy],i)=><clipPath key={i} id={prefix+'clip'+i}><circle cx={cx} cy={cy} r={r}/></clipPath>)}{vennRegionIds.filter(k=>three||!k.includes('C')).map(key=><mask key={key} id={prefix+key}><rect width="640" height="520" fill="white"/>{centers.map(([cx,cy],i)=>!key.includes('ABC'[i])&&<circle key={i} cx={cx} cy={cy} r={r} fill="black"/>)}</mask>)}</defs>
 <rect x="8" y="8" width="624" height="504" rx="18" fill="var(--surface,#17212e)" stroke="var(--muted,#8390a0)"/>
 {data.universeLabel&&<text x="24" y="38" fill="var(--text,#eee)" fontSize="20">{data.universeLabel}</text>}
 {Object.keys(positions).map(key=>{
  const highlighted=data.emphasis.includes(key as typeof vennRegionIds[number]),region=data.regions[key as typeof vennRegionIds[number]],indexes=centers.flatMap((_,i)=>key.includes('ABC'[i])?[i]:[]);
  let shape=<rect width="640" height="520" fill={highlighted?'#ffd166':key==='outside'?'transparent':seriesColor(indexes[0]??0,3)} fillOpacity={highlighted?.72:.22} mask={'url(#'+prefix+key+')'}/>;
  for(const i of indexes)shape=<g clipPath={'url(#'+prefix+'clip'+i+')'}>{shape}</g>;
  const [x,y]=positions[key];return <g key={key} data-venn-region={key} data-emphasized={highlighted}><title>{(region?.label??key)+': '+(region?.value??'')+(region?.members?.length?' · '+region.members.join(', '):'')}</title>{shape}<text x={x} y={y} textAnchor="middle" fill="var(--text,#eee)" fontSize="22" fontWeight={highlighted?800:500} paintOrder="stroke" stroke="var(--surface,#17212e)" strokeWidth="3">{short(region?.value??region?.label??region?.members?.join(', ')??'')}</text></g>;
 })}
 {centers.map(([cx,cy],i)=><g key={i}><circle cx={cx} cy={cy} r={r} fill="none" stroke={data.sets[i].color??seriesColor(i,3)} strokeWidth="3"/><text x={i===0?cx-100:i===1?cx+100:cx} y={i===2?490:three?65:100} textAnchor="middle" fill="var(--text,#eee)" fontSize="24"><title>{data.sets[i].label}</title>{short(data.sets[i].label)}</text></g>)}
 </svg></div>;
}
