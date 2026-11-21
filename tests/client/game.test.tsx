import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameRenderer } from '../../src/client/renderers/Game';
import { GAME_PRESETS } from '../../src/shared/game';
import { gameExample } from '../../src/shared/game';
import { gameDataSchema } from '../../src/shared/game';
import { gamePresets } from '../../src/shared/game';
import { validateView } from '../../src/shared/view-schemas';
import { checklistFocus } from '../../src/client/renderers/checklist-layout';
import { checklistScrollDelta } from '../../src/client/renderers/checklist-layout';
import { pieceTone } from '../../src/shared/game';
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

describe("game coverage 1", () => {

describe('shared supplied-state game catalog',()=>{
 it.each(GAME_PRESETS)('validates and renders %s without rules/inference',preset=>{
  const data=gameExample(preset);expect(validateView({version:1,template:'game-board',data}).data).toEqual(data);
  const html=renderToStaticMarkup(<GameRenderer data={data}/>);expect(html).toContain(gamePresets[preset].label);expect(html).not.toContain('<button');
 });
 it('supports an explicitly supplied full 19 by 19 Go position',()=>{
  const pieces=Object.fromEntries(Array.from({length:361},(_,i)=>[`stone${i+1}`,{cell:`r${Math.floor(i/19)+1}c${i%19+1}`,symbol:'disc',color:i%2?'white':'black'}]));const data=gameDataSchema.parse({preset:'go',pieces});expect(Object.keys(data.pieces)).toHaveLength(361);expect(renderToStaticMarkup(<GameRenderer data={data}/>).match(/data-game-piece=/g)).toHaveLength(361);
 });
 it('rejects invalid cells, dangling zones, secret backs and recipient payloads',()=>{
  for(const data of [{preset:'chess',pieces:{knight:{cell:'r9c1',symbol:'knight'}}},{preset:'poker',cards:{a:{face:'up',zone:'missing',order:0,rank:'A',suit:'spades'}}},{preset:'poker',zones:{hand:{label:'Hand'}},cards:{a:{face:'back',zone:'hand',order:0,rank:'A',suit:'spades'}}},{preset:'poker',visibility:'private'},{preset:'poker',recipients:{alice:{cards:['AS']}}},{preset:'sudoku',cells:{r0c1:{value:'1'}}},{preset:'chess',pieces:{a:{cell:'r01c1',symbol:'king'}}}])expect(gameDataSchema.safeParse(data).success).toBe(false);
 });
 it('renders unknown backs without retained card identity; escapes supplied text',()=>{
  const data=gameExample('poker');data.zones.seat1.label='<script>alert(1)</script>';
  const html=renderToStaticMarkup(<GameRenderer data={data}/>);expect(html).toContain('Unknown card');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 });
});
});

describe("game coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('955403f7: in chess the side that moves first is White and sits on ranks 1 and 2 at the bottom',()=>{
  expect(pieceTone('chess',{side:'first',symbol:'king'})).toBe('white');expect(pieceTone('chess',{side:'second',symbol:'king'})).toBe('black');
  expect(pieceTone('go',{side:'first',symbol:'stone'})).toBe('black');expect(pieceTone('checkers',{side:'second',symbol:'man'})).toBe('white');
  expect(pieceTone('chess',{side:'first',color:'black',symbol:'king'})).toBe('black');expect(pieceTone('chess',{color:'#ff0000',symbol:'king'})).toBe('custom');
  const board=gameDataSchema.parse({preset:'chess',pieces:{wk:{cell:'E1',symbol:'king',side:'first'},bk:{cell:'E8',symbol:'king',side:'second'}}});
  expect(board.pieces.wk).toMatchObject({cell:'r8c5',coordinate:'E1'});expect(board.pieces.bk).toMatchObject({cell:'r1c5',coordinate:'E8'});
 });});
});
