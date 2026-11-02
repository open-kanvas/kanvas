import React from 'react';
import {createRoot} from 'react-dom/client';
import {TimelineRenderer} from '../../src/client/renderers/Timeline';
const events=['Concept','First prototype','User testing','Iteration','Public beta','Launch'].map((title,i)=>({id:`event-${i}`,title,start:`2026-${['01','02','03','06','09','12'][i]}-01`,...(i===2?{end:'2026-04-15'}:{}),description:'A supplied description of this product stage.'}));
const dense=new URLSearchParams(location.search).has('dense');
createRoot(document.getElementById('root')!).render(<TimelineRenderer data={{orientation:new URLSearchParams(location.search).has('vertical')?'vertical':'horizontal',events:dense?Array.from({length:40},(_,i)=>({...events[i%6],id:`dense-${i}`})):events}}/>);
