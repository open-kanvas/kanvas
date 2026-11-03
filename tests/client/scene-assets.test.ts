import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SCENE_ASSETS,sceneAsset} from '../../src/shared/scene-assets';
import {scene3dSchema,focusedScene} from '../../src/shared/scene3d';
const data=()=>({objects:{car:{label:'Sedan',size:[1.8,1.5,4.2],assetId:'kenney-sedan'}}});
describe('prepared asset boundary and provenance',()=>{
 it('includes eight real self-contained models with exact hashes, source-node inventories and CC0 notices',()=>{
  const manifest=JSON.parse(readFileSync('public/scene-assets/manifest.json','utf8'));expect(SCENE_ASSETS).toHaveLength(8);
  for(const asset of SCENE_ASSETS){
   const entry=manifest.find((m:{id:string})=>m.id===asset.id),bytes=readFileSync('public/scene-assets/'+asset.file);
   expect(bytes.length).toBe(asset.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.preparedSHA256);
   const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());expect(doc.buffers.every((b:{uri?:string})=>!b.uri)).toBe(true);expect(doc.images.every((i:{uri?:string;bufferView?:number})=>!i.uri&&typeof i.bufferView==='number')).toBe(true);
   expect(doc.nodes.filter((n:{mesh?:number})=>n.mesh!==undefined).map((n:{name:string})=>n.name)).toEqual(asset.parts);
   expect(entry.triangles).toBeGreaterThan(20);expect(entry.triangles).toBeLessThan(10000);
   expect(readFileSync('public/scene-assets/'+entry.licenseFile,'utf8')).toContain('commercial purposes');expect(entry.license).toBe('CC0-1.0');
  }
 });
 it('rejects unknown assets, invented subparts, arbitrary URLs and unbounded instance counts',()=>{
  for(const o of [{assetId:'diesel-engine'},{assetId:'kenney-sedan',parts:{turbocharger:{highlight:true}}},{assetId:'kenney-sedan',url:'https://evil/a.glb'}])expect(scene3dSchema.safeParse({objects:{car:{label:'a',size:[1,1,1],...o}}}).success).toBe(false);
  expect(scene3dSchema.safeParse({objects:Object.fromEntries(Array.from({length:9},(_,i)=>['a'+i,data().objects.car]))}).success).toBe(false);
 });
 it('focuses verified parts without changing stored camera, metric geometry or unrelated part state',()=>{
  const raw=data(),scene=scene3dSchema.parse(raw);scene.objects.car.parts={'wheel-front-left':{highlight:true},body:{visible:false}};scene.camera.focus={objectId:'car',part:'wheel-front-left'};
  const snapshot=JSON.stringify(scene),effective=focusedScene(scene);expect(effective.camera.target).not.toEqual(scene.camera.target);expect(effective.camera.span).toBeLessThan(scene.camera.span);expect(JSON.stringify(scene)).toBe(snapshot);expect(effective.objects).toBe(scene.objects);
  expect(sceneAsset('kenney-sedan')?.parts).toHaveLength(5);
 });
});
