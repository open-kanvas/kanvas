import type {ChartData} from './chart-contract.js';
/** Stack membership is axis + kind + explicit group. Lines never accumulate. */
export function stackChart(data:ChartData){
 const categories=[...new Set(data.series.flatMap(s=>s.points.map(p=>p.x)))];
 const groups=data.series.map((s,i)=>JSON.stringify([s.axis??'primary',s.kind??data.kind,(s.kind??data.kind)==='line'?`series:${i}`:s.stackGroup??(data.stacking==='stacked'||data.stacking==='percent'?'default':`series:${i}`)]));
 const stacked=data.series.map(s=>(s.kind??data.kind)!=='line'&&Boolean(s.stackGroup||data.stacking==='stacked'||data.stacking==='percent'));
 const groupTotals=new Map<string,Map<string|number,number>>();
 data.series.forEach((s,i)=>{const totals=groupTotals.get(groups[i])??new Map<string|number,number>();for(const p of s.points)if(typeof p.y==='number')totals.set(p.x,(totals.get(p.x)??0)+p.y);groupTotals.set(groups[i],totals);});
 const positive=new Map<string,number>(),negative=new Map<string,number>();
 const series=data.series.map((s,i)=>s.points.map(point=>{const raw=typeof point.y==='number'?point.y:null,total=groupTotals.get(groups[i])?.get(point.x)??0,value=raw===null?null:stacked[i]&&data.stacking==='percent'?(total?raw/total*100:0):raw,positions=value!==null&&value<0?negative:positive,key=JSON.stringify([groups[i],point.x]),start=stacked[i]?positions.get(key)??0:0,end=start+(value??0);if(stacked[i]&&value!==null)positions.set(key,end);return {point,value,start,end,total};}));
 const barGroups=[...new Set(groups.filter((_,i)=>(data.series[i].kind??data.kind)==='bar'))];
 const totals=new Map(categories.map(x=>[x,data.series.reduce((n,s)=>n+s.points.filter(p=>p.x===x&&typeof p.y==='number').reduce((sum,p)=>sum+(p.y as number),0),0)]));
 return {categories,series,totals,groups,groupTotals,barGroups,stacked};
}
