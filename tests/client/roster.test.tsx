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
import { chartDataSchema } from '../../src/shared/view-schemas';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { regionGeometry } from '../../src/client/renderers/AdvancedCharts';
import { itineraryMap } from '../../src/client/renderers/Itinerary';
import { extendedSchemas } from '../../src/shared/extended-templates';
import { selectRows } from '../../src/shared/selection';
import { selectionSchema } from '../../src/shared/selection';
import { cellEmphasis } from '../../src/shared/emphasis';
import { pointEmphasis } from '../../src/shared/emphasis';

describe("roster coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("roster contracts", () => {

  it('renders rosters with tri-segment days and free-text codes, and compares coverage without solving', () => {
    const out = html({ version: 1, template: 'roster', data: roster });
    expect(out).toContain('roster-calendar'); expect(out).toContain('>W14<'); expect(out).toContain('Supplied nurse'); expect(out).toContain('seg-night is-on');
    const parsed = rosterDataSchema.parse(roster), totals = rosterTotals(parsed);
    expect(Object.fromEntries(totals.counts)).toEqual({ day: 1, night: 1, leave: 1 }); expect(totals.free).toBe(11);
    expect(rosterMonths(roster.start, roster.end)[0].weeks).toHaveLength(2);
    expect(rosterDataSchema.safeParse({ ...roster, end: '2027-12-31' }).success).toBe(false);
    expect(rosterDataSchema.safeParse({ ...roster, assignments: [{ date: '2026-11-02', shift: 'missing' }] }).success).toBe(false);
    const coverage = rosterDataSchema.parse({ mode: 'coverage', start: '2026-11-02', end: '2026-11-03', shifts: [{ id: 'day', label: 'Day', code: 'D', segment: 'morning' }],
      roles: [{ id: 'doc', label: 'Doctor' }, { id: 'nurse', label: 'Nurse' }], requirements: [{ shift: 'day', roles: [{ role: 'doc', min: 1 }, { role: 'nurse', min: 2, max: 3 }], totalMin: 3 }],
      staffing: [{ date: '2026-11-02', shift: 'day', role: 'doc', name: 'A' }, { date: '2026-11-02', shift: 'day', role: 'nurse', count: 2 }, { date: '2026-11-03', shift: 'day', role: 'nurse', count: 4 }] });
    const slots = coverageSlots(coverage);
    expect(slots.get('2026-11-02')?.[0]).toMatchObject({ status: 'met', actual: 3, required: 3 });
    expect(slots.get('2026-11-03')?.[0]).toMatchObject({ status: 'under', roles: [{ role: 'doc', status: 'under' }, { role: 'nurse', status: 'over' }] });
    expect(html({ version: 1, template: 'roster', data: coverage })).toContain('roster-cov is-under');
  });});
});

describe("roster coverage 2", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('roster day counts tally by configured shift identity without replacing per-person totals',()=>{const v=view('roster',{start:'2026-10-01',end:'2026-10-01',people:[{id:'a',name:'A'},{id:'b',name:'B'}],shifts:[{id:'d',label:'Day'},{id:'v',label:'Vacation'}],assignments:[{date:'2026-10-01',person:'a',shift:'d'},{date:'2026-10-01',person:'b',shift:'d'}],showDayCounts:true});const html=renderToStaticMarkup(<Renderer view={v}/>);expect(html).toContain('2026-10-01: Day 2');expect(html).toContain('2026-10-01: Vacation 0');expect(html).toContain('Shifts');});});
});
