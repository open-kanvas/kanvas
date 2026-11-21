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

describe("presentation coverage 1", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("presentation contracts",()=>{
  it('defaults audience chrome off and keeps private presenter controls visible',()=>{
    const view=validateView({version:1,template:'presentation',data:{slides:[samples.fact,samples.fact],index:0}});
    const props={editable:true,revision:1,onRespond:async()=>undefined};
    expect(renderToStaticMarkup(<Renderer view={view} {...props}/>)).not.toContain('presentation-controls');
    const notes=validateView({...view,data:{...view.data,presenterPreview:true}});const html=renderToStaticMarkup(<Renderer view={notes} {...props}/>);expect(html).toContain('Private preview');expect(html).toContain('Go live');expect(html).toContain('presentation-controls');
  });});
});
