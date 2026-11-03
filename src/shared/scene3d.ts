import {SCENE_ASSETS,sceneAsset,type SceneAssetId} from './scene-assets.js';
import {z} from 'zod';

// Deliberately bounded geometry: metres, right handed, +Y up, Euler XYZ degrees.
const scalar=z.number().finite().min(-10000).max(10000);
const vec=z.tuple([scalar,scalar,scalar]);
const positive=z.tuple([z.number().min(.001).max(1000),z.number().min(.001).max(1000),z.number().min(.001).max(1000)]);
const key=z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
export const sceneObjectSchema=z.object({
 assetId:z.enum(SCENE_ASSETS.map(a=>a.id) as [SceneAssetId,...SceneAssetId[]]).optional().describe('Prepared public CC0 model; no URL or private uploads. Verified parts: '+SCENE_ASSETS.map(a=>a.id+' = '+a.parts.join(', ')).join('; ')),
 parts:z.record(z.string().min(1).max(64),z.object({visible:z.boolean().optional(),highlight:z.boolean().optional()}).strict()).default({}),
 label:z.string().min(1).max(100),shape:z.enum(['box','cylinder','sphere']).default('box'),
 position:vec.default([0,0,0]),rotation:vec.default([0,0,0]),size:positive,
 scale:z.tuple([z.number().min(.01).max(10),z.number().min(.01).max(10),z.number().min(.01).max(10)]).default([1,1,1]),
 color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6f9ac4'),visible:z.boolean().default(true),highlight:z.boolean().default(false),
}).strict().superRefine((o,c)=>{for(const part of Object.keys(o.parts))if(!o.assetId||!(sceneAsset(o.assetId)!.parts as readonly string[]).includes(part))c.addIssue({code:'custom',path:['parts',part],message:'Only catalog-verified named parts of this asset may be addressed'});});
export const scene3dSchema=z.object({
 units:z.literal('m').default('m'),
 objects:z.record(key,sceneObjectSchema).refine(v=>Object.keys(v).length<=80,'At most 80 objects'),
 camera:z.object({focus:z.object({objectId:key,part:z.string().min(1).max(64).optional()}).strict().optional(),mode:z.enum(['perspective','overhead']).default('perspective'),position:vec.default([8,7,9]),target:vec.default([0,0,0]),fov:z.number().min(15).max(100).default(50),span:z.number().min(.1).max(20000).default(12)}).strict().default({mode:'perspective',position:[8,7,9],target:[0,0,0],fov:50,span:12}),
 dimensions:z.boolean().default(true),labels:z.boolean().default(true),
}).strict().superRefine((v,c)=>{
 if(Object.values(v.objects).filter(o=>o.assetId).length>8)c.addIssue({code:'custom',path:['objects'],message:'At most 8 prepared asset instances'});
 const focus=v.camera.focus;if(focus){const o=v.objects[focus.objectId];if(!o||!o.visible||focus.part&&(!o.assetId||!(sceneAsset(o.assetId)!.parts as readonly string[]).includes(focus.part)))c.addIssue({code:'custom',path:['camera','focus'],message:'Focus must name a visible object and an optional catalog-verified part'});}
 const delta=v.camera.position.map((n,i)=>n-v.camera.target[i]);
 if(Math.hypot(...delta)<.01)c.addIssue({code:'custom',path:['camera','position'],message:'Camera position and target must differ by at least .01 m'});
});
export type Scene3D=z.infer<typeof scene3dSchema>;
export type SceneObject=z.infer<typeof sceneObjectSchema>;
export type Vec3=[number,number,number];
export type Face={id:string;index:number;points:Vec3[];color:string;highlight:boolean};
const add=(a:Vec3,b:Vec3):Vec3=>a.map((n,i)=>n+b[i]) as Vec3;
export const subtract=(a:Vec3,b:Vec3):Vec3=>a.map((n,i)=>n-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:Vec3):Vec3=>v.map(n=>n/Math.hypot(...v)) as Vec3;
export function transformPoint(p:Vec3,o:SceneObject):Vec3{
 let [x,y,z]=p.map((n,i)=>n*o.size[i]*o.scale[i]);
 const [a,b,c]=o.rotation.map(n=>n*Math.PI/180);
 [y,z]=[y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];
 [x,z]=[x*Math.cos(b)+z*Math.sin(b),-x*Math.sin(b)+z*Math.cos(b)];
 [x,y]=[x*Math.cos(c)-y*Math.sin(c),x*Math.sin(c)+y*Math.cos(c)];
 return add([x,y,z],o.position);
}
/** 6/18/128 convex planar faces; no external resources or executable geometry. */
export function sceneFaces(scene:Scene3D):Face[]{
 const faces:Face[]=[];
 for(const [id,o] of Object.entries(scene.objects)){
  if(!o.visible)continue;
  let polygons:Vec3[][]=[];
  if(o.shape==='box'){
   const p:Vec3[]=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
   polygons=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].map(f=>f.map(i=>p[i]));
  }else if(o.shape==='cylinder'){
   const ring=(y:number):Vec3[]=>Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8)/2,y,Math.sin(i*Math.PI/8)/2]);
   const a=ring(-.5),b=ring(.5);polygons=[a,b,...a.map((p,i)=>[p,a[(i+1)%16],b[(i+1)%16],b[i]])];
  }else{
   const p=(a:number,b:number):Vec3=>[Math.sin(a)*Math.cos(b)/2,Math.cos(a)/2,Math.sin(a)*Math.sin(b)/2];
   for(let a=0;a<8;a++)for(let b=0;b<16;b++)polygons.push([p(a*Math.PI/8,b*Math.PI/8),p((a+1)*Math.PI/8,b*Math.PI/8),p((a+1)*Math.PI/8,(b+1)*Math.PI/8),p(a*Math.PI/8,(b+1)*Math.PI/8)]);
  }
  polygons.forEach((points,index)=>faces.push({id,index,points:points.map(p=>transformPoint(p,o)),color:o.color,highlight:o.highlight}));
 }
 return faces;
}
export function cameraCoordinates(scene:Scene3D,p:Vec3):Vec3{
 const c=scene.camera;
 if(c.mode==='overhead')return [p[0]-c.target[0],-(p[2]-c.target[2]),100000-p[1]];
 const forward=unit(subtract(c.target,c.position));
 const right=unit(cross(forward,Math.abs(forward[1])>.999?[0,0,1]:[0,1,0]));
 const up=cross(right,forward),relative=subtract(p,c.position);
 return [dot(relative,right),dot(relative,up),dot(relative,forward)];
}
export const SCENE_NEAR=.02;
/** Clip in camera space BEFORE perspective division, including crossing faces. */
export function clipNear(points:Vec3[]):Vec3[]{
 const result:Vec3[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],inside=a[2]>=SCENE_NEAR,next=b[2]>=SCENE_NEAR;
  if(inside)result.push(a);
  if(inside!==next){const t=(SCENE_NEAR-a[2])/(b[2]-a[2]);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),SCENE_NEAR]);}
 }
 return result;
}
export function project(scene:Scene3D,p:Vec3):[number,number]{
 const scale=scene.camera.mode==='overhead'?800/scene.camera.span:400/Math.tan(scene.camera.fov*Math.PI/360)/p[2];
 return [500+p[0]*scale,350-p[1]*scale];
}
export function projectedFaces(scene:Scene3D){
 return sceneFaces(scene).map(f=>({...f,camera:f.points.map(p=>cameraCoordinates(scene,p))})).map(f=>({...f,camera:clipNear(f.camera)})).filter(f=>f.camera.length>=3).map(f=>({...f,depth:f.camera.reduce((s,p)=>s+p[2],0)/f.camera.length,screen:f.camera.map(p=>project(scene,p))})).sort((a,b)=>b.depth-a.depth);
}
const object=(label:string,size:Vec3,position:Vec3,color:string,shape:SceneObject['shape']='box')=>({label,size,position,color,shape});
export const sceneReferences={
 room:{camera:{position:[7,6,8],target:[0,.5,0],span:7},objects:{floor:object('5 × 4 m floor',[5,.08,4],[0,-.04,0],'#d8c7a9'),sofa:object('Sofa',[2,.8,.9],[-1,.4,-1.4],'#74988b'),table:object('Coffee table',[1.2,.45,.6],[0,.225,0],'#ab7d50'),C1:object('Chair C1',[.7,.8,.7],[1.5,.4,.5],'#d09d6e'),C2:object('Chair C2',[.7,.8,.7],[1.5,.4,-.5],'#d09d6e')}},
 soccer:{camera:{position:[60,70,85],target:[0,0,0],span:130},objects:{field:object('105 × 68 m field',[105,.1,68],[0,-.05,0],'#47825c'),P1:object('Player 1',[1,1.8,1],[-10,.9,4],'#4d8bea','cylinder'),P2:object('Player 2',[1,1.8,1],[12,.9,-8],'#ed6960','cylinder'),ball:object('Ball',[.22,.22,.22],[0,.11,0],'#ffffff','sphere')}},
 harbor:{camera:{position:[30,30,40],target:[0,0,0],span:50},objects:{water:object('40 × 30 m water',[40,.1,30],[0,-.1,0],'#5398af'),dock:object('Dock',[3,.5,20],[-8,.25,0],'#a38562'),boat:object('Schematic boat',[3,1,8],[-3,.5,2],'#e8e2cf'),mast:object('Mast',[.15,6,.15],[-3,4,2],'#ced9e1','cylinder')}},
} as const;

/** Resolve a named focus using offline-verified part bounds, without changing stored camera or geometry. */
export function focusedScene(scene:Scene3D):Scene3D{
 const focus=scene.camera.focus;if(!focus)return scene;
 const o=scene.objects[focus.objectId],asset=o.assetId?sceneAsset(o.assetId):undefined;
 const bounds=focus.part&&asset?(asset.partBounds as Record<string,{center:readonly number[];size:readonly number[]}>)[focus.part]:undefined;
 const target=transformPoint((bounds?.center??[0,0,0]) as Vec3,o),size=(bounds?.size??[1,1,1]).map((n,i)=>n*o.size[i]*o.scale[i]);
 const radius=Math.max(.05,Math.hypot(...size)/2),direction=unit(subtract(scene.camera.position,scene.camera.target)),distance=radius/Math.sin(scene.camera.fov*Math.PI/360)*1.3;
 return {...scene,camera:{...scene.camera,target,position:add(target,direction.map(n=>n*distance) as Vec3),span:radius*3.5}};
}
