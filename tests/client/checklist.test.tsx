import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { SOURCE_RECORD_TEMPLATES } from '../../src/shared/source-guidance';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalTime } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { flowchartDataSchema } from '../../src/shared/diagrams';
import { fitFlowchart } from '../../src/shared/diagrams';
import { profileInstructions } from '../../src/server/mcp/profile-guidance';
import { profileDescription } from '../../src/server/mcp/profile-guidance';
import { profileGuide } from '../../src/server/mcp/profile-guidance';
import { guideFor } from '../../src/server/mcp/guide';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import type { TemplateId } from '../../src/shared/types';
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

describe("checklist coverage 1", () => {

describe("checklist contracts",()=>{
  it('exposes checklist item operations and timezone through all public publish profiles',()=>{
    for(const [profile,name,args] of [['domains','kanvas_publish',{operation:'patch'}],['twelve','kanvas_publish',{operation:'patch'}],['legacy','kanvas_view_patch',{}]] as const){expect(resolveToolCall(profile,name,{...args,sessionId:'s',displayId:'d',expectedRevision:1,requestId:'r',operations:[{op:'checklist',action:'update',itemId:'one',value:{checked:true}}]}).error).toBeUndefined();}
  });
  it('emits one-line wind text and an explicit navigable checklist reader',()=>{
    const html=renderToStaticMarkup(<Renderer view={validateView({version:1,template:'calendar',data:{view:'three-day',anchorDate:'2026-09-27',timeZone:'UTC',items:[],weather:[{time:'2026-09-27T09:00:00Z',condition:'sun',temperature:12,wind:{speed:3,unit:'m/s',direction:'NW'}}]}})}/>);expect(html).toContain('weather-wind');expect(html).not.toContain('<br');
    expect(renderToStaticMarkup(<Renderer view={validateView({version:1,template:'checklist',data:{items:[{id:'a',text:'First'}]}})}/>)).toContain('aria-label="Checklist items"');
  });});
});

describe("checklist coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('checklist follows the item an update is about (47f4f4c5, d0e13f12, a38d9e45)',()=>{
 it('the focus is the changed item, not the first open one; no change means no focus',()=>{
  const ticked=items.map(item=>item.id==='t17'?{...item,checked:true}:item);
  expect(checklistFocus(items,ticked)).toBe('t17');expect(checklistFocus(items,items)).toBeUndefined();expect(checklistFocus(items,[...items])).toBeUndefined();
  expect(checklistFocus(items,items.map(item=>item.id==='t9'?{...item,detail:'note'}:item))).toBe('t9');expect(checklistFocus(items,[...items,{id:'new',text:'Added',checked:false}])).toBe('new');
  expect(checklistFocus(items,ticked,undefined,'t3')).toBe('t3');expect(checklistFocus(items,items,'t3','t3')).toBeUndefined();
 });
 it('an item out of view or near an edge is brought to the middle; a comfortable one is left alone',()=>{
  const box={top:100,height:600};
  expect(checklistScrollDelta(box,{top:300,bottom:340})).toBeUndefined();
  expect(checklistScrollDelta(box,{top:900,bottom:940})).toBe(520);expect(checklistScrollDelta(box,{top:-200,bottom:-160})).toBe(-580);
  // Well before the bottom edge: the last quarter of the list already counts as too low.
  expect(checklistScrollDelta(box,{top:580,bottom:620})).toBe(200);expect(checklistScrollDelta(box,{top:110,bottom:150})).toBe(-270);
  // While the reader scrolls by hand, only a completely hidden item is fetched.
  expect(checklistScrollDelta(box,{top:580,bottom:620},true)).toBeUndefined();expect(checklistScrollDelta(box,{top:900,bottom:940},true)).toBe(520);
  expect(checklistScrollDelta(box,{top:50,bottom:900})).toBe(-50);expect(checklistScrollDelta({top:0,height:0},{top:10,bottom:20})).toBeUndefined();
 });});
});
