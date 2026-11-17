import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
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
import { WEATHER_DESCRIPTION_MAX } from '../../src/shared/extended-templates';
import { validateView } from '../../src/shared/view-schemas';
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

describe("task list coverage 1", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('e2ba79e1: a list may bring its own status colours; they win over a ready-made palette and any value stays allowed',()=>{
  expect(statusColor('testing','Passed')).toBe('#4caf7d');expect(statusColor(undefined,'waiting')).toBeUndefined();
  expect(statusColor(undefined,'Waiting',{waiting:'#d9a441'})).toBe('#d9a441');expect(statusColor('testing','passed',{PASSED:'#112233'})).toBe('#112233');expect(statusColor('testing','unknown value',{waiting:'#d9a441'})).toBeUndefined();
  const list=(colors:Record<string,string>)=>validateView({template:'task-list',data:{colors,items:[{title:'One',status:'waiting'}]}} as never);
  expect(renderToStaticMarkup(<TaskList data={{...list({waiting:'#d9a441'}).data,items:[{number:1,title:'One',status:'waiting',checked:false}]} as never}/>)).toContain('#d9a441');
  expect(()=>list({waiting:'orange'})).toThrow();expect(()=>list(Object.fromEntries(Array.from({length:17},(_,i)=>[`s${i}`,'#000000'])))).toThrow();
 });});
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('task list shows numbers, pills, muted done rows in their written place (0.38.0) and the highlighted item expanded',()=>{
  const markup=renderToStaticMarkup(<TaskList data={data('task-list')}/>);
  expect(markup.indexOf('data-task-number="1"')).toBeLessThan(markup.indexOf('data-task-number="2"'));const sunk=renderToStaticMarkup(<TaskList data={{...(data('task-list') as Record<string,unknown>),doneLast:true} as never}/>);expect(sunk.indexOf('data-task-number="2"')).toBeLessThan(sunk.indexOf('data-task-number="1"'));expect(markup).toMatch(/data-task-number="1" class="is-done"/);
  expect(markup).toMatch(/data-task-number="2" class="is-current" aria-current="true"/);expect(markup).toContain('task-detail');expect(markup).toContain('class="task-pill"');expect(markup).toContain('<b>2</b> open');expect(markup).toContain('<b>1</b> done');
  expect(markup).not.toContain('<button');expect(markup).not.toContain('<input');
 });});
});
