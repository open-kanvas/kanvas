import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateView } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
import { monthWeeks } from '../../src/client/renderers/Time';
import { scheduleIndex } from '../../src/client/renderers/Time';
import { scheduleMonths } from '../../src/client/renderers/Time';
import { draftMarks } from '../../src/client/renderers/Drafting';
import { sameConfig } from '../../src/client/hooks';
import { coverageSlots } from '../../src/shared/roster';
import { rosterDataSchema } from '../../src/shared/roster';
import { rosterMonths } from '../../src/shared/roster';
import { rosterTotals } from '../../src/shared/roster';
import { browserKind } from '../../src/shared/devices-view';
import { deviceKind } from '../../src/shared/devices-view';
import { ChartRenderer } from '../../src/client/renderers/Chart';
import { layoutXAxisTicks } from '../../src/client/renderers/Chart';
import { scheduleDays } from '../../src/client/renderers/Time';
import { scheduleWeekSpans } from '../../src/client/renderers/Time';
import { samples } from '../../src/shared/template-examples';
import { calendarDataSchema } from '../../src/shared/planner';
import { plannerDataSchema } from '../../src/shared/planner';
import { TOUR_GUIDANCE } from '../../src/shared/help';

describe("schedule coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("schedule contracts", () => {

  it('renders month grids with weekday headers and no header band unless the title is shown', () => {
    const data = { date: '2026-03-10', view: 'month', events: [{ id: 'a', title: 'Team sync', start: '2026-03-10T09:00:00Z', end: '2026-03-10T10:00:00Z' }] };
    const month = html(schedule(data));
    expect(month).toContain('schedule-month-grid'); expect(month).toContain('role="columnheader"'); expect(month).toContain('Team sync');
    expect(month).not.toContain('Month schedule'); expect(month).not.toContain('schedule-heading');
    expect(html(schedule(data, { title: 'March', showTitle: true }))).toContain('schedule-heading');
    const week = html(schedule({ date: '2026-03-10', view: 'week', eventStyle: 'compact', events: [{ id: 'b', title: 'Holiday', allDay: true, start: '2026-03-10T00:00:00Z', end: '2026-03-11T00:00:00Z' }] }));
    expect(week).toContain('schedule-event-compact'); expect(week).not.toContain('All day');
    const year = html(schedule({ date: '2026-05-01', view: 'year', legend: [{ label: 'Day shift', color: '#38bdf8' }], events: [{ id: 'c', title: 'Day shift', allDay: true, color: '#38bdf8', start: '2026-05-04T00:00:00Z', end: '2026-05-05T00:00:00Z' }] }));
    expect(year).toContain('schedule-year'); expect(year.match(/role="rowheader"/g)).toHaveLength(12); expect(year).toContain('schedule-legend');
  });});
});

describe("schedule coverage 2", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("schedule contracts",()=>{
  it('shows edge titles inline and three consecutive days across a month/year boundary',()=>{
    const html=render('planner',{...base,view:'day'});expect(html).toContain('is-compact');expect(html).toContain('Early run');expect(html).toContain('Late call');
    expect(render('calendar',{...base,view:'day',items:[{id:'night',title:'Overnight',start:'2026-09-26T23:00:00Z',end:'2026-09-27T01:00:00Z'}]})).toContain('Overnight');
    expect(scheduleDays('2026-12-31','three-day')).toEqual(['2026-12-31','2027-01-01','2027-01-02']);
    expect(render('planner',{...base,view:'three-day'}).match(/class="planner-column/g)).toHaveLength(3);
  });
  it('wires a strict read-only calendar with no planning workflow and rejects planning fields',()=>{
    expect(validateView(samples.calendar).template).toBe('calendar');
    for(const view of ['day','three-day','week','month']){const html=render('calendar',{...base,view,weather});expect(html).toContain('calendar-readonly');expect(html).not.toMatch(/Draft plan|Committed plan|Conflicts|Proposed changes|Nothing is final/);}
    for(const extra of [{status:'draft'},{proposals:[]},{committedAt:'2026-09-27T00:00:00Z'}])expect(calendarDataSchema.safeParse({...base,...extra}).success).toBe(false);
    expect(calendarDataSchema.safeParse({...base,items:[{...base.items[0],constraints:{fixed:true}}]}).success).toBe(false);
  });});
});
