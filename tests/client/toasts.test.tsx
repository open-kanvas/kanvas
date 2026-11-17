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
import {WEATHER_DESCRIPTION_MAX} from '../../src/shared/weather-schema';
import { validateView } from '../../src/shared/view-schemas';
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

describe("toasts coverage 1", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('1559c2fd: an answer computed before a dismissal was saved cannot bring the notification back on this window',()=>{
  const toast=(id:string,extra:Partial<ToastRecord>={}):ToastRecord=>({id,sessionId:'s',displayId:'d',text:id,severity:'info',sticky:true,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),...extra});
  const stale=[toast('a'),toast('b'),toast('c',{groupId:'g'}),toast('old',{expiresAt:new Date(Date.now()-1).toISOString()})];
  expect(toastsToShow(stale,new Set()).map(t=>t.id)).toEqual(['a','b','c']);
  expect(toastsToShow(stale,new Set(['b'])).map(t=>t.id)).toEqual(['a','c']);
  expect(toastsToShow(stale,new Set(['b','g'])).map(t=>t.id)).toEqual(['a']);
 });});
});
