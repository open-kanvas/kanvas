import type {ChartData} from './chart-contract.js';
export function stackChart(data:ChartData){
 const categories=[...new Set(data.series.flatMap(s=>s.points.map(p=>p.x)))];
 const totals=new Map(categories.map(x=>[x,data.series.reduce((n,s)=>n+s.points.filter(p=>p.x===x&&typeof p.y==='number').reduce((sum,p)=>sum+(p.y as number),0),0)]));
 const positive=new Map<string|number,number>(),negative=new Map<string|number,number>();
 const series=data.series.map(s=>s.points.map(point=>{const raw=typeof point.y==='number'?point.y:null,total=totals.get(point.x)??0,value=raw===null?null:data.stacking==='percent'?(total?raw/total*100:0):raw,stacked=data.stacking==='stacked'||data.stacking==='percent',positions=value!==null&&value<0?negative:positive,start=stacked?positions.get(point.x)??0:0,end=start+(value??0);if(stacked&&value!==null)positions.set(point.x,end);return {point,value,start,end,total};}));
 return {categories,series,totals};
}
