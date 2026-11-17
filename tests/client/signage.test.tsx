import { describe } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { vi } from 'vitest';
import { afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { signCatalog } from '../../src/shared/signage';
import { signageDataSchema } from '../../src/shared/signage';
import { SIGN_DIRECTIONS } from '../../src/shared/signage';
import { SIGNAGE_PROVENANCE } from '../../src/shared/signage';
import { wifiSignSchema } from '../../src/shared/signage';
import { wifiPayload } from '../../src/shared/signage';
import { SignageRenderer } from '../../src/client/renderers/Signage';
import { SignArrow } from '../../src/client/renderers/Signage';
import { SIGN_ART } from '../../src/shared/sign-art';
import { validateView } from '../../src/shared/view-schemas';
import { checklistFocus } from '../../src/client/renderers/checklist-layout';
import { checklistScrollDelta } from '../../src/client/renderers/checklist-layout';
import { pieceTone } from '../../src/shared/game';
import { gameDataSchema } from '../../src/shared/game';
import { signArrowSide } from '../../src/client/renderers/Signage';
import { SIGN_ARROW_STRAIGHT } from '../../src/client/renderers/Signage';
import { SIGN_ARROW_TURN } from '../../src/client/renderers/Signage';
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

describe("signage coverage 1", () => {

afterEach(()=>vi.unstubAllEnvs());
describe('signage library foundations',()=>{
 it('renders every catalog entry using a reviewed licensed asset and strict schema',()=>{
  expect(signCatalog.length).toBeGreaterThanOrEqual(70);expect(new Set(signCatalog.map(x=>x.id)).size).toBe(signCatalog.length);
  expect(SIGNAGE_PROVENANCE.standards).toContain('Not certified');
  for(const s of signCatalog){
   expect(SIGN_ART[s.id]).toMatch(/^\/signage\/.+\.svg$/);
   const view=validateView({version:1,template:'signage',data:{items:[{id:'one',type:s.id}]}});
   const html=renderToStaticMarkup(<SignageRenderer view={view}/>);
   expect(html).toContain('data-sign-id="one"');expect(html).toContain(s.title.replaceAll('&','&amp;'));
  }
 });
 it('provides all13 arrows and bounded same-screen groups',()=>{
  expect(SIGN_DIRECTIONS).toHaveLength(13);
  for(const direction of SIGN_DIRECTIONS)expect(renderToStaticMarkup(<SignArrow direction={direction}/>)).toContain('aria-label="'+direction+'"');
  for(const data of [{items:[]},{items:Array.from({length:7},(_,i)=>({id:'i'+i,type:'exit'}))},{items:[{id:'a',type:'exit'},{id:'a',type:'exit'}]},{items:[{id:'a',type:'unknown'}]},{items:[{id:'a',type:'exit',direction:'north'}]},{items:[{id:'a',type:'no-smoking',direction:'left'}]}])expect(signageDataSchema.safeParse(data).success).toBe(false);
 });
 it('supports language-neutral groups, region overrides, escaping and independent disable',()=>{
  const view=validateView({version:1,template:'signage',data:{text:'none',items:[{id:'a',type:'restroom',label:'<script>bad</script>',caption:'Not shown'},{id:'b',type:'information',region:'no'}]}});
  const html=renderToStaticMarkup(<SignageRenderer view={view}/>);
  expect(html).not.toContain('<h2>');expect(html).not.toContain('<p>');expect(html).not.toContain('<script>');expect(html).toContain('data-region="no"');
  vi.stubEnv('VITE_KANVAS_SIGNAGE','false');expect(renderToStaticMarkup(<SignageRenderer view={view}/>)).toContain('viewing is disabled');
 });
});

describe('dynamic signage data',()=>{
 it('encodes exact supplied Wi-Fi with escaping and does not silently ignore credentials',()=>{
  const w=wifiSignSchema.parse({ssid:'Guest;room',password:'a:b,c\\d"e'});
  expect(wifiPayload(w)).toContain('S:Guest\\;room;');expect(wifiPayload(w)).toContain('P:a\\:b\\,c\\\\d\\"e;');
  expect(wifiSignSchema.safeParse({ssid:'Guest'}).success).toBe(false);
  expect(wifiSignSchema.safeParse({ssid:'Open',security:'nopass',password:'hidden'}).success).toBe(false);
 });
 it('validates bounded directory/map/destination identities and appropriate sign families',()=>{
  const entries=[{id:'a',name:'Dentist',floor:'2',room:'204',direction:'right'}];
  expect(signageDataSchema.safeParse({items:[{id:'d',type:'building-directory',directory:{layout:'building',entries}}]}).success).toBe(true);
  for(const item of [{id:'d',type:'exit',directory:{entries}},{id:'d',type:'building-directory',directory:{entries:[...entries,...entries]}},{id:'d',type:'building-directory',directory:{layout:'single-floor',entries}},{id:'m',type:'you-are-here',map:{youAreHere:{x:50,y:50},areas:[{id:'r',label:'Room',x:90,y:0,width:20,height:10}]}},{id:'p',type:'parking-free',value:-1},{id:'p',type:'parking-free',value:1.5}])expect(signageDataSchema.safeParse({items:[item]}).success).toBe(false);
 });
 it('renders building/by-floor/single-floor names without fabricating availability',()=>{
  for(const layout of ['building','by-floor','single-floor']){
   const view=validateView({version:1,template:'signage',data:{items:[{id:'d',type:'building-directory',directory:{layout,floor:'2',entries:[{id:'a',name:'Dentist',floor:'2',room:'204'},{id:'b',name:'Studio',floor:'3'}]}}]}});
   const html=renderToStaticMarkup(<SignageRenderer view={view}/>);
   expect(html).toContain('Dentist');expect(html).toContain('204');
   expect(html.includes('Studio')).toBe(layout!=='single-floor');
  }
 });
 it('retains supplied queue/count/status/booking fields and suppresses prose in visual-only variants',()=>{
  const view=validateView({version:1,template:'signage',data:{items:[{id:'room',type:'meeting-room',status:'occupied',value:'Room A',details:[{label:'Next booking',value:'14:30'}]}]}});
  const html=renderToStaticMarkup(<SignageRenderer view={view}/>);
  expect(html).toContain('occupied');expect(html).toContain('14:30');
  const silent=renderToStaticMarkup(<SignageRenderer view={{...view,data:{...view.data,text:'none'}}}/>);
  expect(silent).not.toContain('14:30');expect(silent).not.toContain('Room A');
 });
});
it('accepts public logos but rejects unsupported protected media and unsafe URLs',()=>{
 const data=(image:string)=>({items:[{id:'x',type:'for-sale',image}]});
 expect(signageDataSchema.safeParse(data('https://example.com/logo.png')).success).toBe(true);
 for(const url of ['/api/assets/secret','/api/media/secret','https://example.com/api/assets/secret','https://example.com/api/media/secret','javascript:alert(1)','//example.com/logo.png'])expect(signageDataSchema.safeParse(data(url)).success,url).toBe(false);
});
});

describe("signage coverage 2", () => {


const items=Array.from({length:19},(_,i)=>({id:`t${i+1}`,text:`Item ${i+1}`,checked:false}));
describe('template fixes',()=>{
 it('c079dde2: one filled arrow shape for every direction, placed on the side it points to',()=>{
  for(const direction of SIGN_DIRECTIONS){const markup=renderToStaticMarkup(<SignArrow direction={direction}/>);expect(markup,direction).toContain('<polygon');expect(markup).not.toContain('<path');expect(markup).toContain(direction.startsWith('turn-')?SIGN_ARROW_TURN:SIGN_ARROW_STRAIGHT);}
  expect(signArrowSide('left')).toBe('left');expect(signArrowSide('up-left')).toBe('left');expect(signArrowSide('turn-left-down')).toBe('left');expect(signArrowSide('right')).toBe('right');expect(signArrowSide('down-right')).toBe('right');expect(signArrowSide('up')).toBe('top');expect(signArrowSide('ahead')).toBe('top');expect(signArrowSide('down')).toBe('bottom');
 });});
});
