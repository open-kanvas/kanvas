import type {RendererProps} from './Renderer';
import {scene3dSchema,projectedFaces,cameraCoordinates,project,SCENE_NEAR,sceneFaces,type Vec3} from '../../shared/scene3d';
import './scene3d.css';

export function Scene3DRenderer({view}:RendererProps){
 // Rendering kill switch leaves authoritative saved scenes/history untouched.
 if(import.meta.env.VITE_KANVAS_SCENE3D==='false')return <p role="status">Spatial scene rendering is disabled on this installation. Saved scene data is retained.</p>;
 const scene=scene3dSchema.parse(view.data),faces=projectedFaces(scene),vertices=sceneFaces(scene).flatMap(f=>f.points);
 const fmt=(n:number)=>Number(n.toFixed(3)).toString();
 const point=(p:Vec3)=>project(scene,cameraCoordinates(scene,p));
 const minX=Math.min(...vertices.map(p=>p[0])),maxX=Math.max(...vertices.map(p=>p[0])),minZ=Math.min(...vertices.map(p=>p[2])),maxZ=Math.max(...vertices.map(p=>p[2]));
 const ruler=(a:Vec3,b:Vec3,label:string)=>{const p=point(a),q=point(b);return <g className="scene-ruler"><path d={`M${p}L${q}`} /><circle cx={p[0]} cy={p[1]} r="3"/><circle cx={q[0]} cy={q[1]} r="3"/><text x={(p[0]+q[0])/2} y={(p[1]+q[1])/2-10}>{label}</text></g>;};
 return <section className="scene3d" aria-label="Metric spatial scene">
  <div className="scene3d-caption">{scene.camera.mode==='overhead'?'Dimensioned overhead · X/Z plan':'Perspective · schematic 3D'} · metres</div>
  <svg viewBox="0 0 1000 700" role="img" aria-label={`${view.title??'Spatial scene'} — ${scene.camera.mode}; ${Object.values(scene.objects).filter(o=>o.visible).length} visible objects`}>
   {faces.map(f=><polygon key={`${f.id}:${f.index}`} data-scene-object={f.id} points={f.screen.map(p=>p.join(',')).join(' ')} fill={f.color} stroke={f.highlight?'#ffcc33':'#203344'} strokeWidth={f.highlight?3:.7} fillOpacity={1}/>)}
   {scene.labels&&Object.entries(scene.objects).filter(([,o])=>o.visible).map(([id,o])=>{const camera=cameraCoordinates(scene,o.position);if(camera[2]<SCENE_NEAR)return null;const [x,y]=project(scene,camera);return <text key={id} className="scene-label" x={x} y={y}>{o.label}{scene.dimensions&&scene.camera.mode==='overhead'?` · ${o.size.map((n,i)=>fmt(n*o.scale[i])).join(' × ')} m`:''}</text>;})}
   {scene.dimensions&&scene.camera.mode==='overhead'&&vertices.length>0&&<>{ruler([minX,0,maxZ+scene.camera.span*.04],[maxX,0,maxZ+scene.camera.span*.04],`${fmt(maxX-minX)} m X extent`)}{ruler([minX-scene.camera.span*.04,0,minZ],[minX-scene.camera.span*.04,0,maxZ],`${fmt(maxZ-minZ)} m Z extent`)}</>}
  </svg>
  <details><summary>Object measurements and IDs</summary><ul>{Object.entries(scene.objects).map(([id,o])=><li key={id}><b>{id}: {o.label}</b> — {o.visible?'visible':'hidden'}; position [{o.position.join(', ')}] m; size {o.size.map((n,i)=>fmt(n*o.scale[i])).join(' × ')} m; rotation [{o.rotation.join(', ')}]°</li>)}</ul></details>
 </section>;
}
