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

describe("events coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("events contracts", () => {

  it('builds Monday-first month rows, multi-month ranges and non-bleeding overnight events', () => {
    const weeks = monthWeeks('2026-02-10');
    expect(weeks).toHaveLength(5); expect(weeks[0][5]).toBeNull(); expect(weeks[0][6]).toBe('2026-02-01'); expect(weeks[4]).toEqual(['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', null]);
    expect(scheduleMonths('2026-03-15', 'months', 6)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']);
    expect(scheduleMonths('2026-03-15', 'year')).toHaveLength(12); expect(scheduleMonths('2026-03-15', 'year')[0]).toBe('2026-01-01');
    const events = [{ id: 'night', title: 'Night', allDay: false, start: '2026-03-02T22:00:00Z', end: '2026-03-03T06:00:00Z' }, { id: 'trip', title: 'Trip', allDay: true, start: '2026-03-05T00:00:00Z', end: '2026-03-07T00:00:00Z' }];
    const compact = scheduleIndex(events, 'UTC', true, '2026-03-01', '2026-03-31');
    expect(compact.get('2026-03-02')?.map(e => e.id)).toEqual(['night']); expect(compact.get('2026-03-03')).toBeUndefined();
    expect(compact.get('2026-03-05')?.map(e => e.id)).toEqual(['trip']); expect(compact.get('2026-03-06')?.map(e => e.id)).toEqual(['trip']); expect(compact.get('2026-03-07')).toBeUndefined();
    expect(scheduleIndex(events, 'UTC', false, '2026-03-01', '2026-03-31').get('2026-03-03')?.map(e => e.id)).toEqual(['night']);
  });});
});

describe("events coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('tool call details shows request beside response, status, duration and a prominent error',()=>{
  const ok=renderToStaticMarkup(<ToolCallDetails data={data('tool-call-details')}/>);
  expect(ok).toContain('kanvas.checklist.update');expect(ok).toContain('data-pane="request"');expect(ok).toContain('data-pane="response"');expect(ok).toContain('42 ms');expect(ok).toContain('Success');
  const failed=renderToStaticMarkup(<ToolCallDetails data={validateView({template:'tool-call-details',data:{tool:'t',status:'error',request:'{"a":1}',responseText:'boom',error:{code:'E_BAD',message:'It failed.'},highlight:{pane:'request',path:'$.a',note:'wrong'}}} as never).data as never}/>);
  expect(failed).toContain('role="alert"');expect(failed).toContain('E_BAD');expect(failed).toContain('It failed.');expect(failed).toContain('is-marked');expect(failed).toContain('wrong');expect(failed).toContain('boom');
 });});
});
