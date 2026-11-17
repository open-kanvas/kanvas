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

describe("colour picker coverage 1", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('colour modes render labelled swatches with exact values and no controls',()=>{
  const view=(input:Record<string,unknown>)=>renderToStaticMarkup(<Colour data={validateView({template:'colour',data:input} as never).data as never}/>);
  const options=view({mode:'options',options:[{value:'tailwind:amber-400'},{value:'#4f46e5'}],selected:['B']});
  expect(options).toContain('data-colour="#fbbf24"');expect(options).toContain('data-colour-label="A"');expect(options).toMatch(/is-selected[^>]*data-colour="#4f46e5"/);
  expect((view({mode:'shades',palette:'tailwind'}).match(/role="cell"/g)??[]).length).toBe(242);
  expect(view({mode:'contrast',backgrounds:['#ffffff'],texts:['#000000']})).toContain('21.00:1');expect(view({mode:'contrast',backgrounds:['#ffffff'],texts:['#000000']})).toContain('AAA');
  for(const input of [{mode:'variations',base:'#0090ff'},{mode:'harmony',base:'#0090ff'},{mode:'roles',scale:'radix:blue'},{mode:'theme',seed:'#6750a4'},{mode:'named',group:'blues'}]){const markup=view(input);expect(markup,input.mode as string).toContain(`data-colour-mode="${input.mode}"`);expect(markup).toContain(`colour-mode-${input.mode}`);expect(markup).not.toContain('<button');expect(markup).not.toContain('<input');}
 });
 it('ebebd25c: a grid of the agent\'s own families prints a speakable label in every cell; a built-in palette keeps labels on the axes unless asked',()=>{
  const view=(input:Record<string,unknown>)=>renderToStaticMarkup(<Colour data={validateView({template:'colour',data:input} as never).data as never}/>);
  const own=view({mode:'shades',custom:[{name:'Brand',shades:[{value:'#fde68a',label:'light'},{value:'#f59e0b',label:'base'},{value:'#78350f',label:'deep'}]},{name:'Ink',shades:[{value:'#e5e7eb'},{value:'#6b7280'},{value:'#111827'}]}]});
  expect(own).toContain('data-cell-labels="shade"');expect(own).toMatch(/data-colour-label="Brand base"[^>]*aria-label="Brand base #f59e0b"[^>]*><b>base<\/b><\/i>/);expect(own).toMatch(/data-colour-label="Ink 3"[^>]*><b>3<\/b><\/i>/);expect(own).toContain('--chars:5');expect((own.match(/role="cell"[^>]*><b>/g)??[]).length).toBe(6);
  const hex=view({mode:'shades',hex:true,custom:[{name:'Brand',shades:[{value:'#fde68a'},{value:'#f59e0b'}]}]});expect(hex).toMatch(/<b>2<\/b><code>#f59e0b<\/code>/);expect(hex).toContain('--chars:7');
  const builtIn=view({mode:'shades',palette:'tailwind',families:['amber']});expect(builtIn).toContain('data-cell-labels="none"');expect(builtIn).not.toMatch(/role="cell"[^>]*><b>/);expect(builtIn).toMatch(/aria-label="amber 400 #fbbf24"/);
  expect(view({mode:'shades',palette:'tailwind',families:['amber'],hex:true})).toMatch(/data-colour-label="amber 400"[^>]*><b>400<\/b><code>#fbbf24<\/code>/);
  expect(()=>validateView({template:'colour',data:{mode:'options',options:[{value:'#000000'},{value:'#ffffff'}],hex:true}} as never)).toThrow();
 });});
});
