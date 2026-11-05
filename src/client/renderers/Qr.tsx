import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {MediaImage} from './Image';
import './qr.css';
/** Reuses the same local QR encoder as Wi-Fi signage; payload never leaves the app. */
export function QrRenderer({data,onReady,onError}:{onReady?:()=>void;onError?:()=>void;data:{content:string;title?:string;text?:string;image?:{url:string;alt:string}}}){
 const [result,setResult]=useState<{content:string;url?:string;failed?:boolean}>();
 useEffect(()=>{let active=true;void QRCode.toDataURL(data.content,{margin:4,width:1024,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}}).then(url=>{if(active)setResult({content:data.content,url});}).catch(()=>{if(active)setResult({content:data.content,failed:true});});return()=>{active=false;};},[data.content]);
 const current=result?.content===data.content?result:undefined;
 return <section className="qr-display" aria-label="QR display"><div className="qr-code">{current?.url?<img src={current.url} alt="Scan the supplied QR content" onLoad={()=>onReady?.()} onError={()=>onError?.()}/>:<p role="status">{current?.failed?'This content could not be encoded. Shorten the supplied text.':'Preparing QR code…'}</p>}</div>{(data.title||data.text||data.image)&&<div className="qr-copy">{data.image&&<div className="qr-logo"><MediaImage entry={data.image}/></div>}{data.title&&<h2>{data.title}</h2>}{data.text&&<p>{data.text}</p>}</div>}</section>;
}
