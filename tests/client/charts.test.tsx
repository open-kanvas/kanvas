import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { ChartRenderer } from '../../src/client/renderers/Chart';
import { layoutXAxisTicks } from '../../src/client/renderers/Chart';
import { scheduleDays } from '../../src/client/renderers/Time';
import { scheduleWeekSpans } from '../../src/client/renderers/Time';
import { monthWeeks } from '../../src/client/renderers/Time';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { calendarDataSchema } from '../../src/shared/planner';
import { plannerDataSchema } from '../../src/shared/planner';
import { TOUR_GUIDANCE } from '../../src/shared/help';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { regionGeometry } from '../../src/client/renderers/AdvancedCharts';
import { itineraryMap } from '../../src/client/renderers/Itinerary';
import {templateSchemas} from '../../src/shared/template-data';
import { selectRows } from '../../src/shared/selection';
import { selectionSchema } from '../../src/shared/selection';
import { cellEmphasis } from '../../src/shared/emphasis';
import { pointEmphasis } from '../../src/shared/emphasis';

describe("charts coverage 1", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("charts contracts",()=>{
  it('keeps 30 source points and rotates dense ticks without a category key or data table, even with controls',()=>{
    const points=Array.from({length:30},(_,i)=>({x:`2026-09-${String(i+1).padStart(2,'0')}`,y:i}));
    for(const kind of ['line','bar'] as const){const html=renderToStaticMarkup(<ChartRenderer data={{kind,series:[{name:'Days',points}]}} showControls/>);expect(html).not.toContain('<table');expect(html).not.toContain('legacy-category-key');expect(html).not.toContain('>Data</button>');expect(html).toContain('rotate(-45');expect(html.match(/data-chart-series=/g)).toHaveLength(30);}
    const layout=layoutXAxisTicks(points.map(p=>p.x),points.map((_,i)=>140+i*22),140,800,s=>s.length*8);
    expect(layout.ticks.length).toBeGreaterThan(2);expect(layout.ticks.every(t=>t.rotation===-45&&t.lines.length===1)).toBe(true);
    for(const t of layout.ticks)expect(t.x).toBe(140+t.index*22);
  });});
});

describe("charts coverage 2", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('supports chart point emphasis and supplied reference target without changing observations',()=>{const data=chartDataSchema.parse({kind:'bar',series:[{name:'Bookings',points:[{x:'Sat',y:32}]}],emphasis:[{series:'Bookings',point:0}],referenceLines:[{value:40,label:'Target'}]});expect(pointEmphasis(data.emphasis,'Bookings',0)).toBeTruthy();const html=renderToStaticMarkup(<Renderer view={view('chart',data)}/>);expect(html).toContain('data-emphasis="true"');expect(html).toContain('Target');expect(data.series[0].points[0].y).toBe(32);});});
});
