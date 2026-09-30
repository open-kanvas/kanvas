import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { ChartRenderer, layoutXAxisTicks } from '../../src/client/renderers/Chart';
import { scheduleDays, scheduleWeekSpans, monthWeeks } from '../../src/client/renderers/Time';
import { validateView } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { calendarDataSchema, plannerDataSchema } from '../../src/shared/planner';
import { TOUR_GUIDANCE } from '../../src/shared/help';

const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe('September 27 feedback regressions',()=>{
  it('keeps 30 source points and rotates dense ticks without a category key or data table, even with controls',()=>{
    const points=Array.from({length:30},(_,i)=>({x:`2026-09-${String(i+1).padStart(2,'0')}`,y:i}));
    for(const kind of ['line','bar'] as const){const html=renderToStaticMarkup(<ChartRenderer data={{kind,series:[{name:'Days',points}]}} showControls/>);expect(html).not.toContain('<table');expect(html).not.toContain('legacy-category-key');expect(html).not.toContain('>Data</button>');expect(html).toContain('rotate(-45');expect(html.match(/data-chart-series=/g)).toHaveLength(30);}
    const layout=layoutXAxisTicks(points.map(p=>p.x),points.map((_,i)=>140+i*22),140,800,s=>s.length*8);
    expect(layout.ticks.length).toBeGreaterThan(2);expect(layout.ticks.every(t=>t.rotation===-45&&t.lines.length===1)).toBe(true);
    for(const t of layout.ticks)expect(t.x).toBe(140+t.index*22);
  });
  it('shows edge titles inline and three consecutive days across a month/year boundary',()=>{
    const html=render('planner',{...base,view:'day'});expect(html).toContain('is-compact');expect(html).toContain('Early run');expect(html).toContain('Late call');
    expect(render('calendar',{...base,view:'day',items:[{id:'night',title:'Overnight',start:'2026-09-26T23:00:00Z',end:'2026-09-27T01:00:00Z'}]})).toContain('Overnight');
    expect(scheduleDays('2026-12-31','three-day')).toEqual(['2026-12-31','2027-01-01','2027-01-02']);
    expect(render('planner',{...base,view:'three-day'}).match(/class="planner-column/g)).toHaveLength(3);
  });
  it('only renders supplied weather in short grids and validates bounded hourly entries',()=>{
    expect(render('planner',{...base,view:'day'})).not.toContain('class="planner-weather"');
    for(const view of ['day','three-day','week'])expect(render('planner',{...base,view,weather})).toContain('80%');
    for(const view of ['month'])expect(render('planner',{...base,view,weather})).not.toContain('class="planner-weather"');
    expect(plannerDataSchema.safeParse({...base,weather:[{...weather[0],precipitationChance:101}]}).success).toBe(false);
  });
  it('wires a strict read-only calendar with no planning workflow and rejects planning fields',()=>{
    expect(validateView(samples.calendar).template).toBe('calendar');
    for(const view of ['day','three-day','week','month']){const html=render('calendar',{...base,view,weather});expect(html).toContain('calendar-readonly');expect(html).not.toMatch(/Draft plan|Committed plan|Conflicts|Proposed changes|Nothing is final/);}
    for(const extra of [{status:'draft'},{proposals:[]},{committedAt:'2026-09-27T00:00:00Z'}])expect(calendarDataSchema.safeParse({...base,...extra}).success).toBe(false);
    expect(calendarDataSchema.safeParse({...base,items:[{...base.items[0],constraints:{fixed:true}}]}).success).toBe(false);
  });
  it('splits connected multi-day bars at week boundaries and separates overlapping lanes',()=>{
    const events=[{id:'trip',title:'Trip',allDay:true,start:'2026-09-24T00:00:00Z',end:'2026-10-01T00:00:00Z'},{id:'break',title:'Break',allDay:true,start:'2026-09-25T00:00:00Z',end:'2026-09-30T00:00:00Z'}];
    const weeks=monthWeeks('2026-09-01');const spans=weeks.flatMap(w=>scheduleWeekSpans(w,events));
    expect(spans.filter(s=>s.event.id==='trip')).toHaveLength(2);expect(spans[0]).toMatchObject({start:3,end:7,lane:0,continuesAfter:true});expect(spans[1].lane).toBe(1);expect(spans[2].continuesBefore).toBe(true);
    const html=renderToStaticMarkup(<Renderer view={validateView({version:1,template:'schedule',data:{date:'2026-09-01',view:'month',timeZone:'UTC',events}})}/>);expect(html.match(/data-event-id="trip"/g)).toHaveLength(2);
  });
  it('defaults audience chrome off and keeps private presenter controls visible',()=>{
    const view=validateView({version:1,template:'presentation',data:{slides:[samples.fact,samples.fact],index:0}});
    const props={editable:true,revision:1,onRespond:async()=>undefined};
    expect(renderToStaticMarkup(<Renderer view={view} {...props}/>)).not.toContain('presentation-controls');
    const notes=validateView({...view,data:{...view.data,presenterPreview:true}});const html=renderToStaticMarkup(<Renderer view={notes} {...props}/>);expect(html).toContain('Private preview');expect(html).toContain('Go live');expect(html).toContain('presentation-controls');
  });
  it('shows attribution only for collaborative or explicitly enabled drafts',()=>{
    const actor={id:'alice',name:'Alice'},data={text:'Hello team',suggestions:[{id:'s1',start:0,end:5,replacement:'Hi',author:actor}],activity:[{actor,action:'accept',suggestionId:'old',revision:2,at:'2026-09-27T13:00:00Z'}]};
    const html=(extra:object)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template:'drafting',data:{...data,...extra}})}/>);
    expect(html({})).not.toContain('Suggested by');expect(html({collaborative:true})).toContain('Suggested by Alice');expect(html({attribution:'show'})).toContain('Accepted old');expect(html({collaborative:true,attribution:'hide'})).not.toContain('Recent changes');
  });
  it('provides a live context-aware tour with sources, integrations and supplied-content guidance',()=>{
    const text=JSON.stringify(TOUR_GUIDANCE);for(const term of ['memory/profile','database','email/chat','supplied content','fixed'])expect(text).toContain(term);
  });
});
