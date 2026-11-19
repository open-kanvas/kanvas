import {lookup} from 'node:dns/promises';
import {isPublicMonitoringAddress,pinnedMonitoringRequest} from './monitoring.js';
/** Only the built-in public OSM raster basemap is eligible, never arbitrary configured tile hosts.
 * Each response is bounded, DNS-pinned, anonymous and redirect-free. */
export function isCaptureTileUrl(raw:string):boolean{
 try{const u=new URL(raw);if(u.origin!=='https://tile.openstreetmap.org'||u.username||u.password||u.search||u.hash)return false;
 const match=/^\/(\d{1,2})\/(\d+)\/(\d+)\.png$/.exec(u.pathname);if(!match)return false;
 const [z,x,y]=match.slice(1).map(Number);return z<=19&&x<2**z&&y<2**z;
 }catch{return false;}
}
export class CaptureTiles{
 private count=0;private bytes=0;private active=0;private waiters:(()=>void)[]=[];private deadline=Date.now()+20000;
 async fetch(raw:string):Promise<Buffer>{
  if(!isCaptureTileUrl(raw)||++this.count>128)throw new Error('Capture tile budget exceeded');
  // A normal viewport can ask for more than16 tiles at once; queue within the128 request cap.
  if(this.active<16)this.active++;else await new Promise<void>(resolve=>this.waiters.push(resolve));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(6000,this.deadline-Date.now())));
  try{if(Date.now()>=this.deadline)throw new Error('Capture tile deadline exceeded');const url=new URL(raw),addresses=await Promise.race([lookup(url.hostname,{all:true,verbatim:true}),new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Capture tile lookup timed out')),{once:true}))]);
   if(!addresses.length||addresses.some(a=>!isPublicMonitoringAddress(a.address)))throw new Error('Capture tile address is not public');
   const a=addresses[0],r=await pinnedMonitoringRequest({url,address:{address:a.address,family:a.family as 4|6},signal:controller.signal,maxBytes:512*1024,headersOnly:false,accept:'image/png'});
   if(r.statusCode!==200||String(r.headers['content-type']).split(';')[0]!=='image/png'||!r.body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Capture tile response rejected');
   this.bytes+=r.body.length;if(this.bytes>16*1024*1024)throw new Error('Capture tile byte budget exceeded');
   return r.body;
  }finally{clearTimeout(timer);const next=this.waiters.shift();if(next)next();else this.active--;}
 }
}
