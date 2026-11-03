import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {signCatalog,signageDataSchema,SIGN_DIRECTIONS,SIGNAGE_PROVENANCE,wifiSignSchema,wifiPayload} from '../../src/shared/signage';
import {SignageRenderer,SignArrow} from '../../src/client/renderers/Signage';
import {SIGN_GLYPHS} from '../../src/client/renderers/signage-glyphs';
import {validateView} from '../../src/shared/view-schemas';
afterEach(()=>vi.unstubAllEnvs());
describe('signage library foundations',()=>{
 it('renders every catalog entry using a maintained original glyph and strict schema',()=>{
  expect(signCatalog.length).toBeGreaterThanOrEqual(70);expect(new Set(signCatalog.map(x=>x.id)).size).toBe(signCatalog.length);
  expect(SIGNAGE_PROVENANCE.standards).toContain('Not certified');
  for(const s of signCatalog){
   expect(SIGN_GLYPHS).toContain(s.glyph);
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
  const view=validateView({version:1,template:'signage',data:{text:'none',items:[{id:'a',type:'restroom',label:'<script>bad</script>',caption:'Not shown'},{id:'b',type:'exit',region:'no'}]}});
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
