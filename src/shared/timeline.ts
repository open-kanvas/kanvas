import type {TemplateData} from './template-data.js';
export function timelineScale(events: TemplateData<'timeline'>['events']) {
  const sorted = [...events].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const min = Math.min(...events.map(e=>Date.parse(e.start)));
  const max = Math.max(...events.map(e=>Date.parse(e.end??e.start)));
  const span = max-min;
  const position = (date:string) => span ? (Date.parse(date)-min)/span : .5;
  const ticks = Array.from({length:span?5:1},(_,i)=>new Date(min+span*i/4).toISOString());
  return {events:sorted,min,max,span,position,ticks};
}
export function timelineDate(value:string, span:number) {
  const date=new Date(value);
  return span===0 ? date.toISOString().replace('T',' ').replace('.000Z',' UTC') : span<86400000 ? date.toISOString().slice(11,span<60000?23:19)+' UTC' : date.toISOString().slice(0,10);
}
