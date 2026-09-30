import { useState } from 'react';
import { ErrorNotice, Field } from './components/ui';
import { errorMessage } from './api';
import './profile-image-input.css';

export interface ProfileImage {mimeType:'image/png'|'image/jpeg'|'image/webp';base64:string}
/** Resize locally, then upload only on the enclosing form's explicit save. */
export function ProfileImageInput({label='Profile photo (optional)',onChange,disabled=false}:{label?:string;onChange:(value:ProfileImage)=>void;disabled?:boolean}){
  const [error,setError]=useState(''),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false);
  return <div className="profile-image-input"><Field label={label} hint="PNG, JPEG or WebP. Your photo is optional and visible to people sharing your sessions or groups.">
    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||busy} onChange={e=>{
      const file=e.target.files?.[0];if(!file)return;setError('');setBusy(true);
      void (async()=>{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPEG or WebP smaller than 10 MB.');
        const bitmap=await createImageBitmap(file);
        try{
          const ratio=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
          const context=canvas.getContext('2d');if(!context)throw new Error('This browser could not prepare the photo.');
          context.drawImage(bitmap,0,0,canvas.width,canvas.height);
          const encoded=canvas.toDataURL('image/webp',.85),base64=encoded.split(',')[1];
          if(!encoded.startsWith('data:image/webp;')||!base64||base64.length>350000)throw new Error('This photo is too large after resizing. Choose a smaller image.');
          onChange({mimeType:'image/webp',base64});setPreview(encoded);
        }finally{bitmap.close();}
      })().catch(err=>setError(errorMessage(err))).finally(()=>setBusy(false));
    }}/></Field>{preview&&<img className="profile-image-preview" src={preview} alt="Selected photo preview"/>}
    {busy&&<p role="status">Preparing photo…</p>}<ErrorNotice message={error}/>
  </div>;
}
