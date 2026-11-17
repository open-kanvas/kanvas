import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { treemapLayout } from '../../src/client/renderers/AdvancedCharts';
import { CATEGORICAL_PALETTE } from '../../src/client/renderers/chart-palette';
import { categoricalColor } from '../../src/client/renderers/chart-palette';
import { seriesColor } from '../../src/client/renderers/chart-palette';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { templateNames } from '../../src/shared/template-examples';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { calendarDataSchema } from '../../src/shared/planner';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { networkDataSchema } from '../../src/shared/diagrams';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalClock } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { regionGeometry } from '../../src/client/renderers/AdvancedCharts';
import { itineraryMap } from '../../src/client/renderers/Itinerary';
import {templateSchemas} from '../../src/shared/template-data';
import { selectRows } from '../../src/shared/selection';
import { selectionSchema } from '../../src/shared/selection';
import { cellEmphasis } from '../../src/shared/emphasis';
import { pointEmphasis } from '../../src/shared/emphasis';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { safePopupStyle } from '../../src/client/renderers/map-popup';

describe("application contracts coverage 1", () => {


describe('categorical chart colours (reported regression)', () => {
  it('keeps the accent for one series and muted categorical colours for several', () => {
    expect(seriesColor(0, 1)).toBe('var(--accent)');
    expect(seriesColor(0, 3)).toBe(CATEGORICAL_PALETTE[0]); expect(seriesColor(2, 3)).toBe(CATEGORICAL_PALETTE[2]);
    expect(new Set(CATEGORICAL_PALETTE).size).toBe(8);
    expect(CATEGORICAL_PALETTE.some(color => color.includes('--accent'))).toBe(false);
    expect(categoricalColor(9)).toBe(CATEGORICAL_PALETTE[1]); expect(categoricalColor(-1)).toBe(CATEGORICAL_PALETTE[7]);
  });});
});

describe("application contracts coverage 2", () => {

const base={anchorDate:'2026-09-01',timeZone:'UTC',view:'month',items:[{id:'roma',title:'Roma',allDay:true,start:'2026-09-20',end:'2026-09-27'}]};
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
describe("application contracts contracts",()=>{
  it('uses readable ISO instants with locale clocks, preserves prose, and supports submission overrides without mutating data',()=>{
    expect(regionalDateTime('2026-09-27T14:26:04Z')).not.toContain('T14:26');expect(regionalClock(14*60+26,{numberLocale:'en-US',timeFormat:'12h'})).toMatch(/02:26 PM/);
    expect(regionalClock(14*60+26,{timeFormat:'24h'})).toBe('14:26');expect(regionalDateTime('Yesterday')).toBe('Yesterday');expect(regionalDateTime('00:04.250')).toBe('00:04.250');
    const view=validateView({version:1,template:'inbox',format:{dateFormat:'dmy',timeFormat:'12h',numberLocale:'en-US'},data:{items:[{id:'m',from:'Pinterest',subject:'Hello',timestamp:'2026-09-27T14:26:04Z'}]}}),before=structuredClone(view);
    const html=renderToStaticMarkup(<Renderer view={view} config={{...DEFAULT_CONFIG,timeFormat:'24h'}}/>);expect(html).toContain('27/09/2026');expect(html).toContain('02:26 PM');expect(view).toEqual(before);
    const schema=JSON.stringify(z.toJSONSchema(templateViewSchema('inbox')));expect(schema).toContain('full/raw From headers');
  });});
});

describe("application contracts coverage 3", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('keeps meaningful headers and explicit hideHeaders separate from data keys',()=>{const v=view('table',{columns:['A'],showHeaders:false,rows:[{A:'Exact'}]});expect(renderToStaticMarkup(<Renderer view={v}/>)).not.toContain('<thead>');expect(v.data.rows).toEqual([{A:'Exact'}]);});
 it('uses numeric default for numeric highlight predicates including zero; preserves decimal precision',()=>{
  const rows=[{Revenue:0},{Revenue:320000},{Revenue:-1},{Revenue:'9007199254740993.0001'}];const selected=selectRows(rows,selectionSchema.parse({highlight:[{field:'Revenue',op:'gte',value:0}]}));expect(selected.map(r=>r.highlighted)).toEqual([true,true,false,true]);expect(selected.map(r=>r.value)).toEqual(rows);
  expect(selectRows([{x:10},{x:2}],selectionSchema.parse({highlight:[{field:'x',op:'lt',value:3}]})).map(r=>r.highlighted)).toEqual([false,true]);
 });
 it('keeps single-cell/column emphasis on original rows after sorting',()=>{const v=view('table',{columns:['Day','Revenue'],rows:[{Day:'A',Revenue:10},{Day:'B',Revenue:20}],emphasis:[{row:1,column:'Revenue'}]});v.selection=selectionSchema.parse({sort:[{field:'Day',direction:'desc'}]});const html=renderToStaticMarkup(<Renderer view={v}/>);expect(html.match(/data-emphasis="true"/g)).toHaveLength(1);expect(html).toContain('data-source-row="1"');expect(cellEmphasis([{column:'Revenue'}],50,'Revenue')).toBeTruthy();});
 it('keeps legacy product comparison identical to multi-vendor',()=>{const data={name:'Same product',offers:[{vendor:'Seller',price:'NOK 9'}]};expect(renderToStaticMarkup(<Renderer view={view('product',{...data,layout:'comparison'})}/>)).toBe(renderToStaticMarkup(<Renderer view={view('product',{...data,layout:'multi-vendor'})}/>));});
 it('resolves actual ISO2/ISO3 and state geometry without requiring caller polygons',()=>{for(const code of ['NO','NOR','US-CA']){const data=chartDataSchema.parse({kind:'choropleth',regions:[{id:code,countryCode:code,value:7}]});expect(regionGeometry(data.regions![0]).coordinates.length).toBeGreaterThan(0);expect(choroplethPaths(data,600,400)[0].path).toMatch(/^M/);}expect(regionGeometry(chartDataSchema.parse({kind:'choropleth',regions:[{id:'NO',countryCode:'NO',value:7}]}).regions![0])).toEqual(regionGeometry(chartDataSchema.parse({kind:'choropleth',regions:[{id:'NOR',countryCode:'NOR',value:7}]}).regions![0]));expect(()=>chartDataSchema.parse({kind:'choropleth',regions:[{id:'XX',countryCode:'XX',value:1}]})).not.toThrow();expect(()=>chartDataSchema.parse({kind:'choropleth',regions:[{id:'NO',countryCode:'NO',value:1},{id:'NOR',countryCode:'NOR',value:2}]})).toThrow();});});
});

describe("application contracts coverage 4", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("application contracts contracts",()=>{
 it('allows bounded passive CSS, not URL/exfiltration/global escape syntax',()=>{for(const [p,value] of [['color','#123456'],['display','flex'],['gap','8px'],['font-size','1.5em']])expect(safePopupStyle(p,value)).toBe(true);for(const [p,value] of [['background-color','url(https://evil.test)'],['color','var(--secret)'],['position','fixed'],['width','99999px'],['background','image-set(x)'],['color','red!important'],['color','\\72 ed']])expect(safePopupStyle(p,value)).toBe(false);});
 it('accepts diff gotoLine before/after with exact range validation',()=>{const view=v('code',{kind:'diff',before:'old\nremoved',after:'new',startLine:20});expect(navigationCapabilities(view).gotoLine).toBe(true);expect(navigate(view,initialNavigation(),{action:'gotoLine',line:21,side:'before'}).line).toBe(21);expect(()=>navigate(view,initialNavigation(),{action:'gotoLine',line:21,side:'after'})).toThrow();});});
});
