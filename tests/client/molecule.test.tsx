import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MoleculeRenderer} from '../../src/client/renderers/Molecule';
import {moleculeLibrary,moleculeDataSchema,moleculeStructureSchema,resolveMolecule,moleculeFrame,moleculeDrawingStructure} from '../../src/shared/molecules';
import {validateView,templateViewSchema} from '../../src/shared/view-schemas';
import {z} from 'zod';
afterEach(()=>vi.unstubAllEnvs());
describe('molecule bounded data and renderer',()=>{
 it('prepares all 25 immutable seed IDs with inspectable provenance and finite frames',()=>{
  expect(Object.keys(moleculeLibrary)).toHaveLength(25);
  for(const [libraryId,s] of Object.entries(moleculeLibrary)){
   expect(moleculeStructureSchema.safeParse(s).success).toBe(true);
   const view=validateView({version:1,template:'molecule',data:{libraryId}});
   expect(resolveMolecule(view.data as any)).toBe(s);
   expect(s.provenance.accuracy).toContain('not independently chemically validated');
   expect(moleculeFrame(s,{zoom:1}).every(Number.isFinite)).toBe(true);
   const html=renderToStaticMarkup(<MoleculeRenderer view={view}/>);
   expect(html.match(/data-atom-id=/g)?.length).toBe(s.atoms.length);
  }
  expect(JSON.stringify(z.toJSONSchema(templateViewSchema('molecule'),{io:'input'}))).toContain('ethanol-v1');
 });
 it('rejects ambiguous identity, dangling IDs, invalid coordinates, duplicates and unsupported stereo',()=>{
  const s=structuredClone(moleculeLibrary['ethanol-v1']);
  for(const data of [{},{libraryId:'unknown'},{libraryId:'ethanol-v1',structure:s},{libraryId:'ethanol-v1',highlightAtoms:['missing']},{libraryId:'ethanol-v1',highlightBonds:['missing']},{libraryId:'ethanol-v1',viewport:{focusAtoms:['missing']}},{structure:{...s,atoms:[...s.atoms,s.atoms[0]]}},{structure:{...s,bonds:[{id:'bad',from:'a0',to:'missing',order:1}]}},{structure:{...s,atoms:s.atoms.map(a=>({...a,x:Infinity}))}},{structure:{...s,stereochemistry:'R'}}]) expect(moleculeDataSchema.safeParse(data).success).toBe(false);
 });
 it('renders externally supplied charges, double/triple bonds, escaped labels and explicit highlights',()=>{
  const structure={name:'<script>Supplied</script>',provenance:{source:'External user record',identity:'test ion only',license:'User supplied',accuracy:'Schematic fixture'},atoms:[{id:'n',element:'N',charge:1,x:0,y:0},{id:'c',element:'C',x:100,y:0},{id:'o',element:'O',charge:-1,x:200,y:0}],bonds:[{id:'triple',from:'n',to:'c',order:3},{id:'double',from:'c',to:'o',order:2}]};
  const view=validateView({version:1,template:'molecule',data:{structure,highlightAtoms:['o'],highlightBonds:['double']}});
  const html=renderToStaticMarkup(<MoleculeRenderer view={view}/>);
  expect(html.match(/<line/g)).toHaveLength(5);expect(html).toContain('data-atom-id="o" class="is-highlighted"');expect(html).not.toContain('<script>');
 });
 it('uniformly scales tiny supplied coordinates without altering stored geometry',()=>{
  const s=structuredClone(moleculeLibrary['ethanol-v1']);s.atoms=s.atoms.map(a=>({...a,x:a.x/100,y:a.y/100}));
  const before=JSON.stringify(s),draw=moleculeDrawingStructure(s);
  expect(draw.atoms[1].x-draw.atoms[0].x).toBeGreaterThan(60);
  expect((draw.atoms[1].y-draw.atoms[0].y)/(draw.atoms[1].x-draw.atoms[0].x)).toBeCloseTo(35/80);
  expect(JSON.stringify(s)).toBe(before);
 });
 it('frames explicit group and disables rendering without mutating data',()=>{
  const s=moleculeLibrary['ethanol-v1'],wide=moleculeFrame(s,{zoom:1}),focus=moleculeFrame(s,{zoom:1,focusAtoms:['a2','a3']});
  expect(focus[2]).toBeLessThan(wide[2]);
  const view=validateView({version:1,template:'molecule',data:{libraryId:'ethanol-v1'}}),before=JSON.stringify(view);
  vi.stubEnv('VITE_KANVAS_MOLECULES','false');
  expect(renderToStaticMarkup(<MoleculeRenderer view={view}/>)).toContain('viewing is disabled');
  expect(JSON.stringify(view)).toBe(before);
 });
});
