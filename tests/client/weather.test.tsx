import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
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
import { ChartRenderer } from '../../src/client/renderers/Chart';
import { layoutXAxisTicks } from '../../src/client/renderers/Chart';
import { scheduleDays } from '../../src/client/renderers/Time';
import { scheduleWeekSpans } from '../../src/client/renderers/Time';
import { monthWeeks } from '../../src/client/renderers/Time';
import { plannerDataSchema } from '../../src/shared/planner';
import { TOUR_GUIDANCE } from '../../src/shared/help';
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
import { WEATHER_DESCRIPTION_MAX } from '../../src/shared/extended-templates';
import { ToastIcon } from '../../src/client/toast-icons';
import { TOAST_TYPES } from '../../src/shared/viewer-experience';
import { toastsToShow } from '../../src/shared/viewer-experience';
import type { ToastRecord } from '../../src/shared/viewer-experience';
import { statusColor } from '../../src/shared/task-list';
import { Agents } from '../../src/client/renderers/Nov10';
import { Colour } from '../../src/client/renderers/Nov10';
import { FontPicker } from '../../src/client/renderers/Nov10';
import { IconPicker } from '../../src/client/renderers/Nov10';
import { JsonRaw } from '../../src/client/renderers/Nov10';
import { JsonView } from '../../src/client/renderers/Nov10';
import { TaskList } from '../../src/client/renderers/Nov10';
import { ToolCallDetails } from '../../src/client/renderers/Nov10';
import { Welcome } from '../../src/client/renderers/Nov10';
import { themeTokenCss } from '../../src/client/renderers/Nov10';
import { geographyCodes } from '../../src/shared/geography/codes';
import { DIAGRAM_MAX_FILL } from '../../src/client/renderers/Diagrams';

describe("weather coverage 1", () => {

const base={anchorDate:'2026-09-01',timeZone:'UTC',view:'month',items:[{id:'roma',title:'Roma',allDay:true,start:'2026-09-20',end:'2026-09-27'}]};
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
describe("weather contracts",()=>{
  it('groups supplied weather per day, stacks sun/temperature/rain, and accepts optional wind and solar markers',()=>{
    const weather=[{time:'2026-09-01T09:00:00Z',condition:'sun',temperature:17,precipitationChance:5,wind:{speed:4,unit:'m/s',direction:'NW'},sunrise:'2026-09-01T05:13:00Z',sunset:'2026-09-01T19:45:00Z'}];
    for(const view of ['day','three-day','week']){const html=render('calendar',{...base,view,weather});expect(html).toContain('Supplied forecast for 2026-09-01');expect(html).toContain('weather-icon is-sun');expect(html).toContain('weather-wind');expect(html).toContain('aria-label="sunrise"');expect(html).toContain('aria-label="sunset"');}
    expect(calendarDataSchema.safeParse({...base,weather:[{...weather[0],wind:{speed:-1}}]}).success).toBe(false);
    expect(render('calendar',base)).not.toContain('weather-point');
  });});
});

describe("weather coverage 2", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("weather contracts",()=>{
  it('only renders supplied weather in short grids and validates bounded hourly entries',()=>{
    expect(render('planner',{...base,view:'day'})).not.toContain('class="planner-weather"');
    for(const view of ['day','three-day','week'])expect(render('planner',{...base,view,weather})).toContain('80%');
    for(const view of ['month'])expect(render('planner',{...base,view,weather})).not.toContain('class="planner-weather"');
    expect(plannerDataSchema.safeParse({...base,weather:[{...weather[0],precipitationChance:101}]}).success).toBe(false);
  });});
});

describe("weather coverage 3", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('aca837d4: weather descriptions are short enough to design for; the text block shrinks in steps',()=>{
  expect(WEATHER_DESCRIPTION_MAX).toBe(400);expect([...WEATHER_FIT_STEPS]).toEqual([1,.9,.8,.7,.6]);
  expect(()=>validateView({template:'weather',data:{condition:'cloudy',description:'x'.repeat(401)}} as never)).toThrow();
  expect(validateView({template:'weather',data:{condition:'cloudy',description:'x'.repeat(400),details:Array.from({length:8},(_,i)=>({label:`L${i}`,value:'v'}))}} as never).data.details).toHaveLength(8);
 });});
});
