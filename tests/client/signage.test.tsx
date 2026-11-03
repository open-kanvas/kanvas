import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {signCatalog,signageDataSchema,SIGN_DIRECTIONS,SIGNAGE_PROVENANCE} from '../../src/shared/signage';
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
