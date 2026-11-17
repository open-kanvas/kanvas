import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { SOURCE_RECORD_TEMPLATES } from '../../src/shared/source-guidance';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalTime } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { flowchartDataSchema } from '../../src/shared/diagrams';
import { fitFlowchart } from '../../src/shared/diagrams';
import { profileInstructions } from '../../src/server/mcp/profile-guidance';
import { profileDescription } from '../../src/server/mcp/profile-guidance';
import { profileGuide } from '../../src/server/mcp/profile-guidance';
import { guideFor } from '../../src/server/mcp/guide';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import type { TemplateId } from '../../src/shared/types';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { regionGeometry } from '../../src/client/renderers/AdvancedCharts';
import { itineraryMap } from '../../src/client/renderers/Itinerary';
import { extendedSchemas } from '../../src/shared/extended-templates';
import { selectRows } from '../../src/shared/selection';
import { selectionSchema } from '../../src/shared/selection';
import { cellEmphasis } from '../../src/shared/emphasis';
import { pointEmphasis } from '../../src/shared/emphasis';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { safePopupStyle } from '../../src/client/renderers/map-popup';

describe("navigation coverage 1", () => {

describe("navigation contracts",()=>{
  it('fits nine decision-process nodes inside phone, laptop and landscape viewports with readable labels',()=>{
    const data=flowchartDataSchema.parse({layout:'top-down',nodes:Array.from({length:9},(_,i)=>({id:String(i),label:i%3===1?'Approved?':`Booking step ${i+1}`,shape:i%3===1?'decision':'box'})),edges:Array.from({length:8},(_,i)=>({from:String(i),to:String(i+1)}))});
    for(const [w,h] of [[342,748],[1120,540],[1760,860]]){const layout=fitFlowchart(data,w,h);expect(layout.width*layout.scale).toBeLessThanOrEqual(w);expect(layout.height*layout.scale).toBeLessThanOrEqual(h);expect(18*layout.scale).toBeGreaterThanOrEqual(12);expect(layout.nodes).toHaveLength(9);expect(layout.edges).toHaveLength(8);}
  });});
});

describe("navigation coverage 2", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('renders headerless positional rows without losing cells and supports repeated validation',()=>{
  const v=view('table',{rows:[['A','B','C'],['D','E','F']]});expect(v.data.columns).toEqual(['0','1','2']);expect(v.data.showHeaders).toBe(false);expect(validateView(v)).toEqual(v);
  const html=renderToStaticMarkup(<Renderer view={v}/>);expect(html).not.toContain('<thead>');for(const s of ['A','B','C','D','E','F'])expect(html).toContain('>'+s+'</td>');
  expect(()=>view('table',{rows:[['A'],['B','C']]})).toThrow();expect(()=>view('table',{rows:[{A:1}]})).toThrow();
 });});
});

describe("navigation coverage 3", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("navigation contracts",()=>{
 it('provides compact preview tiles without altering CSS viewport dimensions',()=>{const html=render('device-preview',{html:'<h1>Hello</h1>',description:'Example',gridSize:'compact',viewports:['iphone','laptop']});expect(html).toContain('device-preview-compact');expect(html).toContain('width:390px');expect(html).toContain('width:1366px');});});
});
