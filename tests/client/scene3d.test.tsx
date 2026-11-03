import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Scene3DRenderer} from '../../src/client/renderers/Scene3D';
import {validateView} from '../../src/shared/view-schemas';
import {scene3dSchema,sceneReferences,transformPoint,clipNear,projectedFaces,cameraCoordinates,SCENE_NEAR} from '../../src/shared/scene3d';

describe('bounded metric scene engine',()=>{
 it.each(Object.keys(sceneReferences) as (keyof typeof sceneReferences)[])('uses one engine for %s',name=>{
  const view=validateView({version:1,template:'scene3d',data:sceneReferences[name]});
  const s=scene3dSchema.parse(view.data),before=JSON.stringify(s.objects);
  for(const mode of ['perspective','overhead'] as const){s.camera.mode=mode;const faces=projectedFaces(s);expect(faces.length).toBeGreaterThan(0);expect(faces.every(f=>f.screen.flat().every(Number.isFinite))).toBe(true);expect(faces.every((f,i)=>i===0||faces[i-1].depth>=f.depth)).toBe(true);}
  expect(JSON.stringify(s.objects)).toBe(before);
  const html=renderToStaticMarkup(<Scene3DRenderer view={{...view,data:s}}/>);expect(html).toContain('Object measurements and IDs');expect(html).toContain('m X extent');expect(html).not.toMatch(/NaN|Infinity/);
 });
 it('applies metric scale then XYZ rotation then translation',()=>{
  const s=scene3dSchema.parse(sceneReferences.room),o=s.objects.C1;o.size=[2,4,6];o.scale=[2,1,.5];o.rotation=[0,90,0];o.position=[1,2,3];
  const p=transformPoint([.5,.5,.5],o);expect(p[0]).toBeCloseTo(2.5);expect(p[1]).toBeCloseTo(4);expect(p[2]).toBeCloseTo(1);
 });
 it('clips crossing faces before projection and excludes wholly behind-camera faces',()=>{
  expect(clipNear([[0,0,-1],[1,0,-1],[1,1,-1]])).toEqual([]);
  const clipped=clipNear([[0,0,-1],[1,0,1],[0,1,1]]);expect(clipped).toHaveLength(4);expect(clipped.every(p=>p[2]>=SCENE_NEAR-1e-10)).toBe(true);
  const s=scene3dSchema.parse(sceneReferences.room);s.camera.position=[0,5,0];s.camera.target=[0,0,0];expect(cameraCoordinates(s,[1,0,1]).every(Number.isFinite)).toBe(true);
 });
 it('rejects unsafe keys, invalid size/camera and external geometry inputs',()=>{
  for(const data of [{objects:{'bad/key':{label:'x',size:[1,1,1]}}},{objects:{a:{label:'a',size:[0,1,1]}}},{objects:{},camera:{position:[0,0,0],target:[0,0,0]}},{objects:{a:{label:'a',size:[1,1,1],url:'https://evil.test/a.glb'}}}])expect(scene3dSchema.safeParse(data).success).toBe(false);
 });
 it('disables rendering without erasing data',()=>{
  vi.stubEnv('VITE_KANVAS_SCENE3D','false');try{expect(renderToStaticMarkup(<Scene3DRenderer view={{version:1,template:'scene3d',data:sceneReferences.room}}/>)).toContain('Saved scene data is retained');}finally{vi.unstubAllEnvs();}
 });
});
