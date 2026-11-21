import {useEffect,useRef,useState} from 'react';
import {api,displayPath,errorMessage,requestId} from './api';
import {VIEWER_UPLOAD_TYPES,VIEWER_UPLOAD_MAX_BYTES,VIEWER_UPLOAD_MAX_COUNT} from '../shared/file-upload';
import './session-uploads.css';
export interface UploadedFile{assetId:string;name:string;mimeType:string;size:number}
export async function uploadFiles(files:File[],target:{sessionId:string;displayId:string;revision:number;fieldId?:string},limits:{accept:readonly string[];maxSize:number;maxCount:number},progress:(completed:number,total:number)=>void):Promise<UploadedFile[]>{
 if(!files.length||files.length>limits.maxCount)throw new Error('Choose up to '+limits.maxCount+' files.');
 for(const file of files)if(!limits.accept.includes(file.type)||!file.size||file.size>limits.maxSize)throw new Error(file.name+': unsupported type, empty file or size exceeds '+Math.floor(limits.maxSize/1024/1024)+' MiB.');
 const uploaded:UploadedFile[]=[];progress(0,files.length);
 for(const file of files){
  const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read selected file.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
  uploaded.push(await api<UploadedFile>(displayPath(target.sessionId,target.displayId)+'/uploads',{method:'POST',body:{requestId:requestId(),revision:target.revision,...(target.fieldId?{fieldId:target.fieldId}:{}),name:file.name,mimeType:file.type,base64}}));
  progress(uploaded.length,files.length);
 }
 return uploaded;
}
export function FileField({id,required,disabled,target,limits,onChange,onBusy}:{id:string;required?:boolean;disabled?:boolean;target?:{sessionId:string;displayId:string;revision:number;fieldId:string};limits:{accept:string[];maxSize:number;maxCount:number};onChange:(ids:string[])=>void;onBusy?:(busy:boolean)=>void}){
 const [files,setFiles]=useState<UploadedFile[]>([]),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div className="file-field"><input id={id} type="file" accept={limits.accept.join(',')} multiple={limits.maxCount>1} required={required&&!files.length} disabled={disabled||busy||!target} onChange={async e=>{
  const selected=Array.from(e.target.files??[]);onChange([]);setFiles([]);setError('');if(!target||!selected.length)return;
  setBusy(true);onBusy?.(true);try{const result=await uploadFiles(selected,target,limits,(n,t)=>setStatus('Uploading '+n+' / '+t));setFiles(result);onChange(result.map(f=>f.assetId));setStatus(result.length+' uploaded');}catch(e){setError(errorMessage(e));setStatus('');}finally{setBusy(false);onBusy?.(false);}
 }}/><small>Up to {limits.maxCount} files · {Math.floor(limits.maxSize/1024/1024)} MiB each</small>{files.map(f=><p key={f.assetId}>{f.name}</p>)}{status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}</div>;
}
export function ViewerDropUpload({sessionId,displayId,revision,enabled}:{sessionId:string;displayId:string;revision:number;enabled:boolean}){
 const [dragging,setDragging]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),busy=useRef(false);
 useEffect(()=>{if(!enabled)return;let depth=0;
  const files=(e:DragEvent)=>Array.from(e.dataTransfer?.types??[]).includes('Files');
  const enter=(e:DragEvent)=>{if(files(e)){e.preventDefault();depth++;setDragging(true);}};
  const over=(e:DragEvent)=>{if(files(e)){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';}};
  const leave=(e:DragEvent)=>{if(files(e)&&--depth<=0){depth=0;setDragging(false);}};
  const drop=async(e:DragEvent)=>{if(!files(e))return;e.preventDefault();depth=0;setDragging(false);if(busy.current)return;busy.current=true;setError('');
   try{const result=await uploadFiles(Array.from(e.dataTransfer?.files??[]),{sessionId,displayId,revision},{accept:VIEWER_UPLOAD_TYPES,maxSize:VIEWER_UPLOAD_MAX_BYTES,maxCount:VIEWER_UPLOAD_MAX_COUNT},(n,t)=>setStatus('Uploading '+n+' / '+t));setStatus(result.length+' files sent to the session');}catch(e){setError(errorMessage(e));setStatus('');}finally{busy.current=false;}};
  window.addEventListener('dragenter',enter);window.addEventListener('dragover',over);window.addEventListener('dragleave',leave);window.addEventListener('drop',drop);
  return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragover',over);window.removeEventListener('dragleave',leave);window.removeEventListener('drop',drop);};
 },[enabled,sessionId,displayId,revision]);
 if(!enabled)return null;
 return <>{dragging&&<div className="viewer-drop-zone">Drop files to share with this session<small>Images, PDF or video · up to 5 files, 10 MiB each</small></div>}{(status||error)&&<div className="viewer-upload-status" role={error?'alert':'status'}>{error||status}<button aria-label="Dismiss upload status" onClick={()=>{setStatus('');setError('');}}>×</button></div>}</>;
}
