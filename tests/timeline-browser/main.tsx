import {extendedSchemas} from '../../src/shared/extended-templates';
import React from 'react';
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TimelineRenderer} from '../../src/client/renderers/Timeline';
const events=['Concept','First prototype','User testing','Iteration','Public beta','Launch'].map((title,i)=>({id:`event-${i}`,title,start:`2026-${['01','02','03','06','09','12'][i]}-01`,...(i===2?{end:'2026-04-15'}:{}),description:'A supplied description of this product stage.'}));
events[1]={...events[1],visual:{kind:'image',url:'https://example.com/prototype.png',alt:'Supplied prototype'}} as typeof events[number];
events[2]={...events[2],visual:{kind:'image',url:'https://example.com/testing.png',alt:'Supplied testing'}} as typeof events[number];
events[3]={...events[3],visual:{kind:'chart',data:{kind:'bar',series:[{name:'Supplied values',points:[{x:'Prototype',y:2},{x:'Testing',y:4}]}]}}} as typeof events[number];
events[4]={...events[4],visual:{kind:'flowchart',data:{nodes:[{id:'a',label:'Prototype'},{id:'b',label:'Beta'}],edges:[{from:'a',to:'b'}]}}} as typeof events[number];
const dense=new URLSearchParams(location.search).has('dense');
function Fixture(){
 const [activeEventId,select]=useState<string>();
 (window as unknown as {selectTimeline:(id?:string)=>void}).selectTimeline=select;
 return <TimelineRenderer data={extendedSchemas.timeline.parse({activeEventId,orientation:new URLSearchParams(location.search).has('vertical')?'vertical':'horizontal',events:dense?Array.from({length:40},(_,i)=>({...events[i%6],id:`dense-${i}`})):events})}/>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
