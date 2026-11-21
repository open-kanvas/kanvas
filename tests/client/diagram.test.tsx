import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { templateNames } from '../../src/shared/template-examples';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { calendarDataSchema } from '../../src/shared/planner';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { networkDataSchema } from '../../src/shared/diagrams';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalClock } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
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
import { geographyCodes } from '../../src/shared/geography/codes';
import { DIAGRAM_MAX_FILL } from '../../src/client/renderers/Diagrams';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { navigationCapabilities } from '../../src/shared/navigation';
import { navigate } from '../../src/shared/navigation';
import { initialNavigation } from '../../src/shared/navigation';
import { navigationActionSchema } from '../../src/shared/navigation';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { safePopupStyle } from '../../src/client/renderers/map-popup';

describe("diagram coverage 1", () => {

const base={anchorDate:'2026-09-01',timeZone:'UTC',view:'month',items:[{id:'roma',title:'Roma',allDay:true,start:'2026-09-20',end:'2026-09-27'}]};
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
describe("diagram contracts",()=>{
  it('rejects dangling relationships, hierarchy cycles and partial coordinates; lays out cyclic networks deterministically',()=>{
    expect(orgChartDataSchema.safeParse({nodes:[{id:'a',label:'A',parentId:'b'},{id:'b',label:'B',parentId:'a'}]}).success).toBe(false);
    expect(networkDataSchema.safeParse({nodes:[{id:'a',label:'A'}],edges:[{from:'a',to:'missing'}]}).success).toBe(false);
    expect(networkDataSchema.safeParse({nodes:[{id:'a',label:'A',x:.5}]}).success).toBe(false);
    const data=networkDataSchema.parse({layout:'top-down',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{from:'a',to:'b'},{from:'b',to:'a'}]});const layout=diagramLayout(data);expect(layout).toEqual(diagramLayout(data));expect(layout.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y))).toBe(true);const phone=diagramLayout(data,false,366);expect(phone.width).toBe(366);expect(phone.nodes.every(n=>n.x-116>=0&&n.x+116<=366)).toBe(true);expect(phone.nodes[0].y).not.toBe(phone.nodes[1].y);const long=networkDataSchema.parse({nodes:[{id:'long',label:'A long supplied label '.repeat(3),detail:'Supplied detail '.repeat(10)}]});expect(diagramLayout(long).nodes[0].height).toBeGreaterThan(128);
  });});
});

describe("diagram coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('e6ae1605: nine generic pictograms; diagrams may fill a large screen',()=>{
  for(const type of TOAST_TYPES)expect(renderToStaticMarkup(<ToastIcon type={type}/>)).toContain(`data-toast-icon="${type}"`);
  expect(DIAGRAM_MAX_FILL).toBeGreaterThan(1);
  expect(validateView({template:'architecture',data:{textScale:1.6,nodes:[{id:'a',label:'API',type:'api'}]}} as never).data.textScale).toBe(1.6);
  expect(()=>validateView({template:'architecture',data:{textScale:9,nodes:[{id:'a',label:'API',type:'api'}]}} as never)).toThrow();
 });});
});

describe("diagram coverage 3", () => {

const v=(template:string,data:unknown)=>validateView({version:1,template,data});
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={v(template,data)}/>);
describe("diagram contracts",()=>{
 it('reflows branches after reparenting a leaf regardless of input order',()=>{const nodes=[{id:'root',label:'Root'},{id:'a',label:'A',parentId:'root'},{id:'b',label:'B',parentId:'root'},{id:'a1',label:'A1',parentId:'a'},{id:'a2',label:'A2',parentId:'a'},{id:'b1',label:'B1',parentId:'b'}];const layout=(ns:typeof nodes)=>diagramLayout(orgChartDataSchema.parse({nodes:ns}),true);const before=layout(nodes),after=layout(nodes.map(n=>n.id==='a1'?{...n,parentId:'b'}:n));const x=(l:typeof before,id:string)=>l.nodes.find(n=>n.id===id)!.x;expect(x(after,'a1')).toBeGreaterThan(x(after,'a2'));expect(x(after,'a1')).not.toBe(x(before,'a1'));expect(after.edges).toContainEqual({from:'b',to:'a1',directed:true});expect(x(after,'b')).toBe((x(after,'a1')+x(after,'b1'))/2);});});
});
