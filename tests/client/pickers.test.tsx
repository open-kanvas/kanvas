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

describe("pickers coverage 1", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('pickers address only the Kanvas server and print the exact names',()=>{
  const icons=renderToStaticMarkup(<IconPicker data={data('icon-picker')}/>);
  expect(icons).toContain('/api/picker/icons/lucide/outline/settings.svg');expect(icons).toContain('lucide:settings');expect(icons).toContain('heroicons:cog-6-tooth');expect(icons).not.toMatch(/https?:\/\//);
  const variants=renderToStaticMarkup(<IconPicker data={{mode:'variants',icons:[{set:'phosphor',name:'gear'}]}}/>);expect((variants.match(/picker-number/g)??[]).length).toBe(6);expect(variants).toContain('phosphor:gear/bold');
  const fonts=renderToStaticMarkup(<FontPicker data={data('font-picker')}/>);
  // Inter and Playfair Display publish a variable file: one face covers the whole weight range. JetBrains Mono too.
  expect(fonts).toContain('font-weight:100 900;font-style:normal;font-display:swap;src:url(/api/picker/fonts/inter/variable.woff2)');expect(fonts).not.toContain('/api/picker/fonts/inter/400.woff2');expect(fonts).toContain('Inter 400');expect(fonts).toContain('Playfair Display 700');expect(fonts).not.toMatch(/https?:\/\//);
  const weights=renderToStaticMarkup(<FontPicker data={validateView({template:'font-picker',data:{mode:'weights',fonts:[{family:'lato'}]}} as never).data as never}/>);expect((weights.match(/data-font-weight=/g)??[]).length).toBe(5);
  // Lato has no variable edition: one file per weight. A variable family shows its whole range from one file.
  expect(weights).toContain('font-weight:300;font-style:normal;font-display:swap;src:url(/api/picker/fonts/lato/300.woff2)');
  const range=renderToStaticMarkup(<FontPicker data={validateView({template:'font-picker',data:{mode:'weights',fonts:[{family:'merriweather'}]}} as never).data as never}/>);expect((range.match(/data-font-weight=/g)??[]).length).toBe(7);expect((range.match(/@font-face/g)??[]).length).toBe(1);expect(range).toContain('font-weight:300 900');
 });
 it('e011b35b: a catalogue icon names its collection, is drawn from the Kanvas server and prints its exact Iconify name',()=>{
  const catalogue=validateView({template:'icon-picker',data:{mode:'sets',concept:'settings',icons:[{set:'lucide',name:'settings'},{set:'iconify',name:'mdi:cog-outline'}]}} as never).data as never;
  const markup=renderToStaticMarkup(<IconPicker data={catalogue}/>);
  expect(markup).toContain('/api/picker/icons/iconify/mdi/cog-outline.svg');expect(markup).toContain('data-icon-id="mdi:cog-outline"');expect(markup).toContain('>mdi:cog-outline</code>');expect(markup).toContain('Iconify mdi');expect(markup).not.toMatch(/https?:\/\//);
  const one=renderToStaticMarkup(<IconPicker data={{mode:'variants',icons:[{set:'iconify',name:'mdi:cog'}]}}/>);expect((one.match(/picker-number/g)??[]).length).toBe(1);
  for(const bad of [{set:'iconify',name:'cog'},{set:'iconify',name:'mdi:cog',variant:'bold'},{set:'lucide',name:'mdi:cog'},{set:'iconify',name:'https://evil.example/cog'},{set:'iconify',name:'mdi:../x'},{set:'iconify',name:'a:b:c'},{set:'iconify',collection:'mdi',name:'cog'}])expect(()=>validateView({template:'icon-picker',data:{icons:[bad]}} as never),JSON.stringify(bad)).toThrow();
 });});
});
