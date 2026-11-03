import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sceneAsset,type SceneAssetId} from '../../shared/scene-assets';
import type {Scene3D,SceneObject} from '../../shared/scene3d';

// Only shipped public CC0 assets. No user-supplied URL, private-media ID or live provider request.
const cache=new Map<SceneAssetId,Promise<THREE.Group>>();
function prepared(id:SceneAssetId){
 let pending=cache.get(id);if(pending)return pending;
 pending=(async()=>{
  const asset=sceneAsset(id)!;const response=await fetch(`/scene-assets/${asset.file}`,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Prepared model unavailable');
  const data=await response.arrayBuffer();if(data.byteLength!==asset.bytes)throw new Error('Prepared model size mismatch');
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw new Error('External model resources are not allowed');return url;});
  const gltf=await new GLTFLoader(manager).parseAsync(data,'');
  const root=gltf.scene;root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  // Normalize the actual full model to a centred unit box; outer metric size is authoritative.
  const normal=new THREE.Group();normal.scale.set(1/size.x,1/size.y,1/size.z);root.position.sub(center);normal.add(root);return normal;
 })();cache.set(id,pending);pending.catch(()=>cache.delete(id));return pending;
}
type Entry={group:THREE.Group;signature:string;materials:THREE.Material[];primitive?:THREE.BufferGeometry};
function instance(source:THREE.Group):Entry{
 const group=new THREE.Group(),materials:THREE.Material[]=[];group.add(source.clone(true));
 group.traverse(node=>{if(node instanceof THREE.Mesh){const clone=(m:THREE.Material)=>{const copy=m.clone();materials.push(copy);return copy;};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);}});
 return {group,signature:'',materials};
}
function primitive(shape:SceneObject['shape']):Entry{
 const geometry=shape==='box'?new THREE.BoxGeometry(1,1,1):shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,24):new THREE.SphereGeometry(.5,24,16);
 const material=new THREE.MeshStandardMaterial(),group=new THREE.Group();group.add(new THREE.Mesh(geometry,material));return {group,signature:shape,materials:[material],primitive:geometry};
}
function release(entry:Entry){entry.group.removeFromParent();entry.materials.forEach(m=>m.dispose());entry.primitive?.dispose();}
function apply(entry:Entry,o:SceneObject){
 const {group}=entry;group.visible=o.visible;group.position.fromArray(o.position);group.scale.set(...o.size.map((n,i)=>n*o.scale[i]) as [number,number,number]);
 // Three Euler XYZ intrinsic order differs from the contract's extrinsic X then Y then Z.
 group.rotation.set(...o.rotation.map(n=>n*Math.PI/180) as [number,number,number],'ZYX');
 group.traverse(node=>{if(!(node instanceof THREE.Mesh))return;let part:THREE.Object3D|null=node;const names=o.assetId?sceneAsset(o.assetId)!.parts as readonly string[]:[];
  while(part&&!names.includes(part.name))part=part.parent;
  const state=part?o.parts[part.name]:undefined;
  for(const material of Array.isArray(node.material)?node.material:[node.material]){
   material.visible=state?.visible!==false;
   if(material instanceof THREE.MeshStandardMaterial){if(!o.assetId)material.color.set(o.color);material.emissive.set(state?.highlight||o.highlight?'#aa6600':'#000000');material.emissiveIntensity=1;}
  }
 });
}
export default function SceneAssets({scene,onReady,onError}:{scene:Scene3D;onReady?:()=>void;onError?:()=>void}){
 const callbacks=useRef({onReady,onError});callbacks.current={onReady,onError};
 const host=useRef<HTMLDivElement>(null),runtime=useRef<{update:(s:Scene3D)=>void}|undefined>(undefined);const [status,setStatus]=useState('Loading prepared models…');
 useEffect(()=>{
  const element=host.current!;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setStatus('3D graphics unavailable on this device. Object data is retained.');callbacks.current.onError?.();return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x152332,0);renderer.domElement.setAttribute('aria-label','Prepared 3D models');element.appendChild(renderer.domElement);
  const world=new THREE.Scene();world.add(new THREE.HemisphereLight(0xffffff,0x607080,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(5,10,7);world.add(light);
  let camera:THREE.Camera=new THREE.PerspectiveCamera(),disposed=false,generation=0,loaded=false,acknowledged=-1;const entries=new Map<string,Entry>();
  const draw=()=>{if(disposed)return;const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);renderer.render(world,camera);renderer.domElement.dataset.renderedTriangles=String(renderer.info.render.triangles);if(loaded&&acknowledged!==generation){acknowledged=generation;callbacks.current.onReady?.();}};
  const observer=new ResizeObserver(draw);observer.observe(element);
  const update=(s:Scene3D)=>{
   const ticket=++generation;loaded=false;setStatus('Loading prepared models…');
   if(s.camera.mode==='overhead'){
    const span=s.camera.span;const c=new THREE.OrthographicCamera(-span*500/800,span*500/800,span*350/800,-span*350/800,.02,200000);c.position.set(s.camera.target[0],100000,s.camera.target[2]);c.up.set(0,0,-1);c.lookAt(s.camera.target[0],0,s.camera.target[2]);camera=c;
   }else{
    // Match the shared 1000×700 projection's 400/tan(fov/2) focal distance.
    const fov=2*Math.atan(Math.tan(s.camera.fov*Math.PI/360)*350/400)*180/Math.PI,c=new THREE.PerspectiveCamera(fov,1000/700,.02,200000);c.position.fromArray(s.camera.position);const d=new THREE.Vector3().fromArray(s.camera.target).sub(c.position).normalize();if(Math.abs(d.y)>.999)c.up.set(0,0,1);c.lookAt(new THREE.Vector3().fromArray(s.camera.target));camera=c;
   }
   for(const [id,entry] of entries)if(!s.objects[id]){release(entry);entries.delete(id);}
   const jobs=Object.entries(s.objects).map(async([id,o])=>{
    const signature=o.assetId??o.shape;let entry=entries.get(id);
    if(entry?.signature!==signature){if(entry){release(entry);entries.delete(id);}const source=o.assetId?await prepared(o.assetId):undefined;if(disposed||ticket!==generation)return;entry=source?instance(source):primitive(o.shape);entry.signature=signature;entries.set(id,entry);world.add(entry.group);}
    apply(entry!,o);
   });
   draw();Promise.all(jobs).then(()=>{if(disposed||ticket!==generation)return;loaded=true;draw();setStatus('Ready');},()=>{if(!disposed&&ticket===generation){setStatus('Prepared model failed to load. Object data is retained.');callbacks.current.onError?.();}});
  };
  runtime.current={update};update(scene);
  const lost=(event:Event)=>{event.preventDefault();callbacks.current.onError?.();setStatus('3D graphics context lost. Reload to restore the model; saved data is retained.');};renderer.domElement.addEventListener('webglcontextlost',lost);
  return()=>{disposed=true;observer.disconnect();runtime.current=undefined;for(const entry of entries.values())release(entry);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
 },[]);
 useEffect(()=>runtime.current?.update(scene),[scene]);
 return <><div className="scene3d-webgl" ref={host} data-asset-status={status}/>{status!=='Ready'&&<p className="scene3d-load-status" role="status">{status}</p>}</>;
}
