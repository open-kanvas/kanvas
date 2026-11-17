import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { treemapLayout } from '../../src/client/renderers/AdvancedCharts';
import { CATEGORICAL_PALETTE } from '../../src/client/renderers/chart-palette';
import { categoricalColor } from '../../src/client/renderers/chart-palette';
import { seriesColor } from '../../src/client/renderers/chart-palette';
import { renderToStaticMarkup } from 'react-dom/server';
import { checklistFocus } from '../../src/client/renderers/checklist-layout';
import { checklistScrollDelta } from '../../src/client/renderers/checklist-layout';
import { pieceTone } from '../../src/shared/game';
import { gameDataSchema } from '../../src/shared/game';
import { SignArrow } from '../../src/client/renderers/Signage';
import { signArrowSide } from '../../src/client/renderers/Signage';
import { SIGN_ARROW_STRAIGHT } from '../../src/client/renderers/Signage';
import { SIGN_ARROW_TURN } from '../../src/client/renderers/Signage';
import { SIGN_DIRECTIONS } from '../../src/shared/signage';
import { choroplethPlotHeight } from '../../src/client/renderers/AdvancedCharts';
import { WEATHER_FIT_STEPS } from '../../src/client/renderers/Weather';
import {WEATHER_DESCRIPTION_MAX} from '../../src/shared/weather-schema';
import { validateView } from '../../src/shared/view-schemas';
import { ToastIcon } from '../../src/client/toast-icons';
import { TOAST_TYPES } from '../../src/shared/viewer-experience';
import { toastsToShow } from '../../src/shared/viewer-experience';
import type { ToastRecord } from '../../src/shared/viewer-experience';
import { statusColor } from '../../src/shared/task-list';
import {Agents} from '../../src/client/renderers/ConnectedAgents';
import {Colour} from '../../src/client/renderers/ColourPicker';
import {FontPicker} from '../../src/client/renderers/FontPicker';
import {IconPicker} from '../../src/client/renderers/IconPicker';
import {JsonRaw} from '../../src/client/renderers/JsonRaw';
import {JsonView} from '../../src/client/renderers/Json';
import {TaskList} from '../../src/client/renderers/TaskList';
import {ToolCallDetails} from '../../src/client/renderers/ToolCallDetails';
import {Welcome} from '../../src/client/renderers/Welcome';
import {themeTokenCss} from '../../src/client/renderers/CustomHtml';
import { samples } from '../../src/shared/template-examples';
import { geographyCodes } from '../../src/shared/geography/codes';
import { DIAGRAM_MAX_FILL } from '../../src/client/renderers/Diagrams';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
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
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { safePopupStyle } from '../../src/client/renderers/map-popup';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';

describe("map coverage 1", () => {


describe('categorical chart colours (reported regression)', () => {
  it('colours the children of a single treemap root distinctly, and top-level roots as before', () => {
    const single = treemapLayout([{ id: 'root', label: 'Company' }, { id: 'eng', parent: 'root', value: 5 }, { id: 'sales', parent: 'root', value: 3 }, { id: 'ops', parent: 'root', value: 2 }, { id: 'eng-web', parent: 'eng', value: 5 }], 800, 400);
    const groups = new Map(single.map(box => [box.node.id, box.group]));
    expect(new Set(['eng', 'sales', 'ops'].map(id => groups.get(id))).size).toBe(3);
    expect(groups.get('eng-web')).toBe(groups.get('eng'));
    const roots = treemapLayout([{ id: 'a', value: 2 }, { id: 'b', value: 1 }, { id: 'a1', parent: 'a', value: 2 }], 800, 400);
    expect(roots.find(box => box.node.id === 'a1')?.group).toBe(roots.find(box => box.node.id === 'a')?.group);
    expect(roots.find(box => box.node.id === 'b')?.group).not.toBe(roots.find(box => box.node.id === 'a')?.group);
  });});
});

describe("map coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('b2640923: the map gives way so the scale and notes fit a short screen; HK and MO are mapped',()=>{
  // 0.38.0 (8bfdf7b0, f430f4e8): no 640 px ceiling and no credit line to reserve room for.
  expect(choroplethPlotHeight(900)).toBe(866);expect(choroplethPlotHeight(2000)).toBe(1966);expect(choroplethPlotHeight(300)).toBe(266);expect(choroplethPlotHeight(300,{warning:true,dots:true})).toBe(208);expect(choroplethPlotHeight(100)).toBe(110);
  for(const available of [260,300,395,480,540])expect(choroplethPlotHeight(available,{warning:true,dots:true})+34+34+24).toBeLessThanOrEqual(Math.max(available,202));
  expect(geographyCodes.HK).toBe('HKG');expect(geographyCodes.MO).toBe('MAC');
 });});
});

describe("map coverage 3", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('itinerary uses explicit coordinates, day order and transport legs; images stay optional',()=>{const input={layout:'map',days:[{date:'2026-10-01',items:[{title:'Oslo',coordinates:{lat:59.9,lng:10.7},image:{url:'https://example.com/image.png',alt:'Scenic'}},{title:'Bergen',coordinates:{lat:60.4,lng:5.3},category:'flight'}]},{date:'2026-10-02',items:[{title:'Bergen hotel',coordinates:{lat:60.4,lng:5.3},category:'hotel'}]}]};const data=templateSchemas.itinerary.parse(input),map=itineraryMap(data,null);expect(map.markers).toHaveLength(3);expect(map.routes).toHaveLength(2);expect(map.routes![0].dashed).toBe(true);expect(itineraryMap(data,1).markers).toHaveLength(1);expect(()=>templateSchemas.itinerary.parse({layout:'map',days:[{date:'2026-10-01',items:[{title:'Unknown place'}]}]})).toThrow();const html=renderToStaticMarkup(<Renderer view={view('itinerary',data)}/>);expect(html).toContain('alt="Scenic"');expect(html).toContain('itinerary-anchor');expect(html).toContain('Whole trip');});});
});

describe("map coverage 4", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("map contracts",()=>{
 it('maps small territories to real point locations and keeps unsupported codes nonfatal',()=>{const data=chartDataSchema.parse({kind:'choropleth',regions:[{id:'sg',countryCode:'SG',value:2},{id:'mt',countryCode:'MLT',value:3},{id:'unknown',countryCode:'XX',value:99},{id:'unknown2',countryCode:'ZZ',value:5},{id:'no',countryCode:'NO',value:4}]});expect(choroplethPaths(data,600,400).map(p=>p.id)).toEqual(['sg','mt','no']);expect(choroplethPaths(data,600,400)[0].path).toContain('a5,5');const html=render('chart',data);expect(html).toContain('Not mapped (unsupported codes)');expect(html).toContain('unknown (XX)');expect(html).not.toContain('data-chart-region="unknown"');expect(html).not.toContain('NaN');});
 it('does not crash if all geography codes are unsupported',()=>{const html=render('chart',{kind:'choropleth',regions:[{id:'unknown',countryCode:'XX',value:2}]});expect(html).toContain('Not mapped');expect(html).not.toContain('NaN');});
 it('inline maps use supplied pins and explicit geographic caveat without network images',()=>{const html=render('itinerary',{days:[{date:'2026-10-03',items:[{title:'Rail connection',inlineMap:{points:[{lat:38.71,lng:-9.14,label:'Station A'},{lat:38.80,lng:-9.38,label:'Station B'}]}}]}]});expect(html).toContain('itinerary-inline-map');expect(html).toContain('Station A');expect(html).toContain('straight connection, not a route');expect(html).not.toContain('<iframe');expect(html).not.toContain('<img');});
 it('selectDay is one-based, all resets, and only available on map itineraries',()=>{const data={layout:'map',days:[{date:'2026-10-03',items:[{title:'A',coordinates:{lat:1,lng:2}}]},{date:'2026-10-04',items:[{title:'B',coordinates:{lat:3,lng:4}}]}]},view=v('itinerary',data);expect(navigationCapabilities(view).selectDay).toBe(true);expect(navigate(view,initialNavigation(),navigationActionSchema.parse({action:'selectDay',day:2})).day).toBe(2);expect(navigate(view,initialNavigation(),{action:'selectDay',day:'all'}).day).toBe('all');expect(()=>navigate(view,initialNavigation(),{action:'selectDay',day:3})).toThrow();expect(()=>navigate(v('itinerary',{...data,layout:'list'}),initialNavigation(),{action:'selectDay',day:1})).toThrow();});});
});
