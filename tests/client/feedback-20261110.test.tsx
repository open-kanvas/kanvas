import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {checklistFocus,checklistScrollDelta} from '../../src/client/renderers/checklist-layout';
import {pieceTone,gameDataSchema} from '../../src/shared/game';
import {SignArrow,signArrowSide,SIGN_ARROW_STRAIGHT,SIGN_ARROW_TURN} from '../../src/client/renderers/Signage';
import {SIGN_DIRECTIONS} from '../../src/shared/signage';
import {choroplethPlotHeight} from '../../src/client/renderers/AdvancedCharts';
import {WEATHER_FIT_STEPS} from '../../src/client/renderers/Weather';
import {WEATHER_DESCRIPTION_MAX} from '../../src/shared/extended-templates';
import {validateView} from '../../src/shared/view-schemas';
import {ToastIcon} from '../../src/client/toast-icons';
import {TOAST_TYPES} from '../../src/shared/viewer-experience';
import {Agents,Colour,FontPicker,IconPicker,JsonRaw,JsonView,TaskList,ToolCallDetails,Welcome,themeTokenCss} from '../../src/client/renderers/Nov10';
import {samples} from '../../src/shared/template-examples';
import {geographyCodes} from '../../src/shared/geography/codes';
import {DIAGRAM_MAX_FILL} from '../../src/client/renderers/Diagrams';

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
 });
});
describe('template fixes',()=>{
 it('955403f7: in chess the side that moves first is White and sits on ranks 1 and 2 at the bottom',()=>{
  expect(pieceTone('chess',{side:'first',symbol:'king'})).toBe('white');expect(pieceTone('chess',{side:'second',symbol:'king'})).toBe('black');
  expect(pieceTone('go',{side:'first',symbol:'stone'})).toBe('black');expect(pieceTone('checkers',{side:'second',symbol:'man'})).toBe('white');
  expect(pieceTone('chess',{side:'first',color:'black',symbol:'king'})).toBe('black');expect(pieceTone('chess',{color:'#ff0000',symbol:'king'})).toBe('custom');
  const board=gameDataSchema.parse({preset:'chess',pieces:{wk:{cell:'E1',symbol:'king',side:'first'},bk:{cell:'E8',symbol:'king',side:'second'}}});
  expect(board.pieces.wk).toMatchObject({cell:'r8c5',coordinate:'E1'});expect(board.pieces.bk).toMatchObject({cell:'r1c5',coordinate:'E8'});
 });
 it('c079dde2: one filled arrow shape for every direction, placed on the side it points to',()=>{
  for(const direction of SIGN_DIRECTIONS){const markup=renderToStaticMarkup(<SignArrow direction={direction}/>);expect(markup,direction).toContain('<polygon');expect(markup).not.toContain('<path');expect(markup).toContain(direction.startsWith('turn-')?SIGN_ARROW_TURN:SIGN_ARROW_STRAIGHT);}
  expect(signArrowSide('left')).toBe('left');expect(signArrowSide('up-left')).toBe('left');expect(signArrowSide('turn-left-down')).toBe('left');expect(signArrowSide('right')).toBe('right');expect(signArrowSide('down-right')).toBe('right');expect(signArrowSide('up')).toBe('top');expect(signArrowSide('ahead')).toBe('top');expect(signArrowSide('down')).toBe('bottom');
 });
 it('b2640923: the map gives way so the scale and notes fit a short screen; HK and MO are mapped',()=>{
  expect(choroplethPlotHeight(900)).toBe(640);expect(choroplethPlotHeight(300)).toBe(240);expect(choroplethPlotHeight(300,{warning:true,dots:true})).toBe(182);expect(choroplethPlotHeight(100)).toBe(110);
  for(const available of [260,300,395,480,540])expect(choroplethPlotHeight(available,{warning:true,dots:true})+26+34+34+24).toBeLessThanOrEqual(Math.max(available,228));
  expect(geographyCodes.HK).toBe('HKG');expect(geographyCodes.MO).toBe('MAC');
 });
 it('aca837d4: weather descriptions are short enough to design for; the text block shrinks in steps',()=>{
  expect(WEATHER_DESCRIPTION_MAX).toBe(400);expect([...WEATHER_FIT_STEPS]).toEqual([1,.9,.8,.7,.6]);
  expect(()=>validateView({template:'weather',data:{condition:'cloudy',description:'x'.repeat(401)}} as never)).toThrow();
  expect(validateView({template:'weather',data:{condition:'cloudy',description:'x'.repeat(400),details:Array.from({length:8},(_,i)=>({label:`L${i}`,value:'v'}))}} as never).data.details).toHaveLength(8);
 });
 it('e6ae1605: nine generic pictograms; diagrams may fill a large screen',()=>{
  for(const type of TOAST_TYPES)expect(renderToStaticMarkup(<ToastIcon type={type}/>)).toContain(`data-toast-icon="${type}"`);
  expect(DIAGRAM_MAX_FILL).toBeGreaterThan(1);
  expect(validateView({template:'architecture',data:{textScale:1.6,nodes:[{id:'a',label:'API',type:'api'}]}} as never).data.textScale).toBe(1.6);
  expect(()=>validateView({template:'architecture',data:{textScale:9,nodes:[{id:'a',label:'API',type:'api'}]}} as never)).toThrow();
 });
});
describe('new template renderers',()=>{
 const data=<T,>(template:keyof typeof samples)=>validateView(samples[template]).data as T;
 it('JSON raw view keeps exact tokens with line numbers; tree stays available',()=>{
  const raw=renderToStaticMarkup(<JsonView data={{json:'{"exact":9007199254740993,"list":[1,2]}'}}/>);
  expect(raw).toContain('data-json-view="raw"');expect(raw).toContain('9007199254740993');expect((raw.match(/data-json-line=/g)??[]).length).toBe(7);
  expect(renderToStaticMarkup(<JsonView data={{json:'{"a":1}',view:'tree'}}/>)).not.toContain('data-json-view="raw"');
  const marked=renderToStaticMarkup(<JsonRaw source={'{"a":{"b":2}}'} highlightPath="$.a.b"/>);expect(marked).toMatch(/class="is-marked" data-json-line="3"/);
  const cut=renderToStaticMarkup(<JsonRaw source={JSON.stringify(Array.from({length:100},(_,i)=>i))} maxLines={10}/>);expect((cut.match(/data-json-line=/g)??[]).length).toBe(10);expect(cut).toContain('92 more lines stored');
 });
 it('tool call details shows request beside response, status, duration and a prominent error',()=>{
  const ok=renderToStaticMarkup(<ToolCallDetails data={data('tool-call-details')}/>);
  expect(ok).toContain('kanvas.checklist.update');expect(ok).toContain('data-pane="request"');expect(ok).toContain('data-pane="response"');expect(ok).toContain('42 ms');expect(ok).toContain('Success');
  const failed=renderToStaticMarkup(<ToolCallDetails data={validateView({template:'tool-call-details',data:{tool:'t',status:'error',request:'{"a":1}',responseText:'boom',error:{code:'E_BAD',message:'It failed.'},highlight:{pane:'request',path:'$.a',note:'wrong'}}} as never).data as never}/>);
  expect(failed).toContain('role="alert"');expect(failed).toContain('E_BAD');expect(failed).toContain('It failed.');expect(failed).toContain('is-marked');expect(failed).toContain('wrong');expect(failed).toContain('boom');
 });
 it('task list shows numbers, pills, muted done rows last and the highlighted item expanded',()=>{
  const markup=renderToStaticMarkup(<TaskList data={data('task-list')}/>);
  expect(markup.indexOf('data-task-number="2"')).toBeLessThan(markup.indexOf('data-task-number="1"'));expect(markup).toMatch(/data-task-number="1" class="is-done"/);
  expect(markup).toMatch(/data-task-number="2" class="is-current" aria-current="true"/);expect(markup).toContain('task-detail');expect(markup).toContain('class="task-pill"');expect(markup).toContain('<b>2</b> open');expect(markup).toContain('<b>1</b> done');
  expect(markup).not.toContain('<button');expect(markup).not.toContain('<input');
 });
 it('colour modes render labelled swatches with exact values and no controls',()=>{
  const view=(input:Record<string,unknown>)=>renderToStaticMarkup(<Colour data={validateView({template:'colour',data:input} as never).data as never}/>);
  const options=view({mode:'options',options:[{value:'tailwind:amber-400'},{value:'#4f46e5'}],selected:['B']});
  expect(options).toContain('data-colour="#fbbf24"');expect(options).toContain('data-colour-label="A"');expect(options).toMatch(/is-selected[^>]*data-colour="#4f46e5"/);
  expect((view({mode:'shades',palette:'tailwind'}).match(/role="cell"/g)??[]).length).toBe(242);
  expect(view({mode:'contrast',backgrounds:['#ffffff'],texts:['#000000']})).toContain('21.00:1');expect(view({mode:'contrast',backgrounds:['#ffffff'],texts:['#000000']})).toContain('AAA');
  for(const input of [{mode:'variations',base:'#0090ff'},{mode:'harmony',base:'#0090ff'},{mode:'roles',scale:'radix:blue'},{mode:'theme',seed:'#6750a4'},{mode:'named',group:'blues'}]){const markup=view(input);expect(markup,input.mode as string).toContain(`data-colour-mode="${input.mode}"`);expect(markup).not.toContain('<button');expect(markup).not.toContain('<input');}
 });
 it('pickers address only the Kanvas server and print the exact names',()=>{
  const icons=renderToStaticMarkup(<IconPicker data={data('icon-picker')}/>);
  expect(icons).toContain('/api/picker/icons/lucide/outline/settings.svg');expect(icons).toContain('lucide:settings');expect(icons).toContain('heroicons:cog-6-tooth');expect(icons).not.toMatch(/https?:\/\//);
  const variants=renderToStaticMarkup(<IconPicker data={{mode:'variants',icons:[{set:'phosphor',name:'gear'}]}}/>);expect((variants.match(/picker-number/g)??[]).length).toBe(6);expect(variants).toContain('phosphor:gear/bold');
  const fonts=renderToStaticMarkup(<FontPicker data={data('font-picker')}/>);
  expect(fonts).toContain('/api/picker/fonts/inter/400.woff2');expect(fonts).toContain('Inter 400');expect(fonts).toContain('Playfair Display 700');expect(fonts).not.toMatch(/https?:\/\//);
  const weights=renderToStaticMarkup(<FontPicker data={validateView({template:'font-picker',data:{mode:'weights',fonts:[{family:'lato'}]}} as never).data as never}/>);expect((weights.match(/data-font-weight=/g)??[]).length).toBe(5);
 });
 it('agents overview is compact; welcome is one line and three things to say',()=>{
  const agents=renderToStaticMarkup(<Agents data={data('agents')} serverNow="2026-11-10T09:01:00+01:00"/>);
  expect(agents).toContain('Claude.ai');expect(agents).toContain('Active now');expect(agents).toContain('<b>12</b> sessions');expect(agents).toContain('Release testing');expect(agents).not.toContain('<button');
  const welcome=renderToStaticMarkup(<Welcome data={{}}/>);expect(welcome).toContain('Your agent can show things here while you talk.');expect((welcome.match(/<li>/g)??[]).length).toBe(3);expect(welcome).not.toContain('<button');
 });
 it('theme tokens for custom HTML have safe defaults',()=>{
  const css=themeTokenCss(null);for(const token of ['--kanvas-bg','--kanvas-fg','--kanvas-muted','--kanvas-accent','--kanvas-line','--kanvas-panel','--kanvas-font'])expect(css).toContain(`${token}:`);
  expect(css).not.toMatch(/[<>]/);
 });
});
