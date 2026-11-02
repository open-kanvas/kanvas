import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {vennSchema,vennExample} from '../../src/shared/statistical-visuals';
import {chartDataSchema} from '../../src/shared/chart-contract';
import {VennRenderer} from '../../src/client/renderers/Venn';
import {DistributionChart,clippedCurve} from '../../src/client/renderers/DistributionChart';
const source={kind:'line',series:[{name:'Density',points:[{x:0,y:0},{x:1,y:1},{x:3,y:0}]}],distribution:{ranges:[{id:'tail',series:'Density',from:.5,to:2,label:'Supplied interval'}],bands:[{id:'bounds',series:'Density',points:[{x:0,low:0,high:.1},{x:3,low:0,high:.2}]}]}};
describe('supplied statistical visuals',()=>{
 it('renders exact disjoint two/three-set cells and outside complement without inventing values',()=>{
  const html=renderToStaticMarkup(<VennRenderer data={vennSchema.parse(vennExample)}/>);
  expect(html).toContain('data-venn-region="AB" data-emphasized="true"');expect(html).not.toContain('data-venn-region="ABC"');
  expect(renderToStaticMarkup(<VennRenderer data={vennSchema.parse({...vennExample,sets:[{label:'A'},{label:'B'},{label:'C'}],emphasis:['outside','ABC']})}/>)).toContain('data-venn-region="ABC" data-emphasized="true"');
  expect(vennSchema.safeParse({...vennExample,emphasis:['C']}).success).toBe(false);
  expect(renderToStaticMarkup(<VennRenderer data={vennSchema.parse({...vennExample,regions:{AB:{members:['Ada','Lin']}}})}/>)).toContain('Ada, Lin</text>');
 });
 it('clips nonuniform numeric coordinates without calculating probabilities',()=>{
  expect(clippedCurve([{x:0,y:0},{x:1,y:1},{x:3,y:0}],.5,2)).toEqual([{x:.5,y:.5},{x:1,y:1},{x:2,y:.5}]);
  const data=chartDataSchema.parse(source),html=renderToStaticMarkup(<DistributionChart data={data}/>);
  expect(html).toContain('data-band-id="bounds"');expect(html).toContain('data-range-id="tail"');expect(html).toContain('Supplied interval');
 });
 it('rejects absent series, extrapolation, reversed bands and categorical/unsorted curves',()=>{
  for(const distribution of [{ranges:[{id:'bad',series:'Missing',from:0,to:1}]},{ranges:[{id:'bad',series:'Density',from:-1,to:1}]},{bands:[{id:'bad',series:'Density',points:[{x:0,low:2,high:1},{x:1,low:0,high:1}]}]}])expect(chartDataSchema.safeParse({...source,distribution}).success).toBe(false);
  expect(chartDataSchema.safeParse({...source,series:[{name:'Density',points:[{x:'A',y:1},{x:'B',y:2}]}]}).success).toBe(false);
 });
});
