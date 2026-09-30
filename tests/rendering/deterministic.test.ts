import { describe, expect, it } from 'vitest';
import { createInterpreter } from '../../src/server/rendering/interpreter.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { cases, input, source } from './helpers.js';
import { parseDataset } from '../../src/server/rendering/datasets.js';

const render = (fields: Record<string, unknown>) => createInterpreter().interpret({ ...input(), submission: { requestId:'source',sessionId:'session-1',displayIds:['display-1'],...fields } });
describe('deterministic supplied-content publishing', () => {
  it.each(cases)('preserves supplied $template content through strict validation', async ({template,data}) => {
    const expected=validateView({version:1,template,data,source});
    const result=await render({templateHint:template,data,source});
    expect(result.view).toEqual(expected);
    expect(result.metrics?.path).toBe('source');
    expect(JSON.stringify(result.metrics)).not.toMatch(/model|prompt|provider|tokens|attempts/i);
  });
  it('renders plain text verbatim, including acknowledgements and whitespace',async()=>{
    for(const text of ['Thanks!','  Exact words.\r\nKeep 1.2300.  '])expect((await render({data:text,intent:'Do not replace the source'})).view?.data.text).toBe(text);
  });
  it.each([{intent:'Generate a dashboard'},{data:{name:'Ambiguous'}},{data:{text:'Document',page:1}},{data:{track:'A',artist:'B'}}])('rejects ambiguous or instruction-only input %#',async fields=>{
    await expect(render(fields)).rejects.toMatchObject({code:'PREPARED_VIEW_REQUIRED'});
  });
  it('rejects malformed explicit fact data instead of discarding unknown fields',async()=>{
    await expect(render({templateHint:'fact',data:{text:'Exact source',unknown:'Must not disappear'}})).rejects.toMatchObject({code:'INVALID_SOURCE_CONTENT'});
  });
  it('never translates, generates HTML, locates a place or creates missing source data',async()=>{
    for(const templateHint of ['translation','html','map','chart','transcription','countdown'])await expect(render({templateHint,intent:'Generate the missing content'})).rejects.toBeInstanceOf(Error);
    const data={sourceText:'17 exact bolts.',targetText:'17 nøyaktige bolter.',sourceLanguage:'en',targetLanguage:'nb'};
    expect((await render({templateHint:'translation',data})).view?.data).toEqual(validateView({version:1,template:'translation',data}).data);
  });
  it('uses a lossless table for unhinted rows and explicit bindings for charts',async()=>{
    const rows=[{item:'A',amount:'1.2300'},{item:'B',amount:'9007199254740993'}];
    expect((await render({data:{rows}})).view).toMatchObject({template:'table',data:{rows}});
    const chart=await render({templateHint:'chart',data:{rows:[{year:'2025',amount:'1.2300'},{year:'2026',amount:'2.3400'}]}});
    expect(chart.view?.template).toBe('chart');
    expect((chart.view?.data.series as any[])[0].points[0]).toMatchObject({rawY:'1.2300'});
  });
  it('does not silently replace an explicit dataset template with a chart',async()=>{
    const dataset={...parseDataset({name:'Exact source',rows:[{item:'A',amount:'1.2300'}]}),id:'dataset-1',sessionId:'session-1',createdAt:'2026-09-28T00:00:00Z'};
    for(const fields of [{templateHint:'fact' as const},{templateHint:'fact' as const,data:{binding:{y:['amount']}}},{templateHint:'number' as const}]) {
      const base=input({datasets:[dataset]});
      await expect(createInterpreter().interpret({...base,submission:{...base.submission,data:undefined,datasetId:dataset.id,...fields}})).rejects.toMatchObject({code:'PREPARED_VIEW_REQUIRED'});
    }
  });
  it('honours an explicit number row binding without guessing an aggregate',async()=>{
    const result=await render({templateHint:'number',data:{rows:[{amount:'1.2300'},{amount:'2.3400'}],binding:{y:['amount'],row:1}}});
    expect(result.view).toMatchObject({template:'number',data:{value:'2.3400',binding:{y:['amount'],row:1,aggregation:'none'}}});
  });
  it('preserves literal code and all supplied whiteboard items',async()=>{
    const code='  const exact = "1.2300";\r\n';expect((await render({templateHint:'code',data:code})).view?.data.code).toBe(code);
    const items=['One','Two','Three','Four','Five','Six'];expect(((await render({templateHint:'whiteboard',data:{items}})).view?.data.elements as any[]).map(x=>x.text)).toEqual(items);
  });
  it('retains only identical rendered content, not a guessed lack of interest',async()=>{
    const view=validateView({version:1,template:'fact',data:{text:'Exact'}});
    const base=input({display:{width:1000,height:700,view}});
    expect((await createInterpreter().interpret({...base,submission:{...base.submission,view}})).action).toBe('retain');
    await expect(createInterpreter().interpret({...base,submission:{...base.submission,data:undefined,intent:'Invent a visual'}})).rejects.toMatchObject({code:'PREPARED_VIEW_REQUIRED'});
    expect(base.display.view).toEqual(view);
  });
});
