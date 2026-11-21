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
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { safePopupStyle } from '../../src/client/renderers/map-popup';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';

describe("split screen coverage 1", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("split screen contracts",()=>{
  it('splits connected multi-day bars at week boundaries and separates overlapping lanes',()=>{
    const events=[{id:'trip',title:'Trip',allDay:true,start:'2026-09-24T00:00:00Z',end:'2026-10-01T00:00:00Z'},{id:'break',title:'Break',allDay:true,start:'2026-09-25T00:00:00Z',end:'2026-09-30T00:00:00Z'}];
    const weeks=monthWeeks('2026-09-01');const spans=weeks.flatMap(w=>scheduleWeekSpans(w,events));
    expect(spans.filter(s=>s.event.id==='trip')).toHaveLength(2);expect(spans[0]).toMatchObject({start:3,end:7,lane:0,continuesAfter:true});expect(spans[1].lane).toBe(1);expect(spans[2].continuesBefore).toBe(true);
    const html=renderToStaticMarkup(<Renderer view={validateView({version:1,template:'schedule',data:{date:'2026-09-01',view:'month',timeZone:'UTC',events}})}/>);expect(html.match(/data-event-id="trip"/g)).toHaveLength(2);
  });});
});

describe("split screen coverage 2", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("split screen contracts",()=>{
 it('supports two or three independent source panels and rejects unknown target panels',()=>{const view=v('code',{kind:'split',panels:[{id:'caller',path:'caller.ts',code:'invoke();'},{id:'definition',path:'definition.ts',code:'function invoke() {}',startLine:80}]});expect(navigationCapabilities(view).codePanels).toEqual(['caller','definition']);expect(navigate(view,initialNavigation(),{action:'gotoLine',panelId:'definition',line:80}).panelId).toBe('definition');expect(()=>navigate(view,initialNavigation(),{action:'gotoLine',panelId:'unknown',line:80})).toThrow();expect(renderToStaticMarkup(<Renderer view={view}/>)).toContain('function invoke()');expect(()=>v('code',{kind:'split',panels:[{id:'a',code:'a'}]})).toThrow();});});
});
