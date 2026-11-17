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
import { samples } from '../../src/shared/template-examples';
import { geographyCodes } from '../../src/shared/geography/codes';
import { DIAGRAM_MAX_FILL } from '../../src/client/renderers/Diagrams';
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

describe("settings coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("settings contracts", () => {
  it('re-applies an open display theme whenever the effective configuration changes', () => {
    expect(sameConfig({ theme: 'dark', style: 'ocean', accent: '#38bdf8' }, { accent: '#38bdf8', style: 'ocean', theme: 'dark' })).toBe(true);
    expect(sameConfig({ theme: 'dark', style: 'ocean' }, { theme: 'light', style: 'ocean' })).toBe(false);
  });});
});

describe("settings coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('theme tokens for custom HTML have safe defaults',()=>{
  const css=themeTokenCss(null);for(const token of ['--kanvas-bg','--kanvas-fg','--kanvas-muted','--kanvas-accent','--kanvas-line','--kanvas-panel','--kanvas-font'])expect(css).toContain(`${token}:`);
  expect(css).not.toMatch(/[<>]/);
 });});
});

describe("settings coverage 3", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("settings contracts",()=>{
 it('guides roster constraint elicitation and consent-based preference memory',()=>{expect(TEMPLATE_DISPLAY_GUIDANCE.roster.detail).toContain('Before the first draft');expect(TEMPLATE_DISPLAY_GUIDANCE.roster.detail).toContain('confirm them');expect(TEMPLATE_DISPLAY_GUIDANCE.roster.detail).toContain('not private shift data');});});
});
