import type { Request } from 'express';
import { browserContext, type RequestContext } from '../shared/recognition.js';
import { isPublicMonitoringAddress } from './monitoring.js';

export async function requestContext(req:Request):Promise<RequestContext>{
  const context=browserContext(req.get('user-agent')??'',req.get('accept-language')),ip=(req.ip??req.socket.remoteAddress??'').replace(/^::ffff:/,'');
  if(!isPublicMonitoringAddress(ip))return context;
  try {
    // Local database only. The address never leaves the host or enters records.
    const geo=await import('geoip-lite'),result=geo.default.lookup(ip);
    if(result?.country)context.location={country:result.country,...(result.region?{region:result.region}:{}),...(result.city?{city:result.city}:{}),...(Array.isArray(result.ll)&&result.ll.length===2&&result.ll.every(Number.isFinite)?{lat:result.ll[0],lng:result.ll[1]}:{}),...(typeof result.area==='number'&&result.area>0?{accuracyKm:result.area}:{}),source:'GeoIP',approximate:true};
  }catch{/* Missing data is honestly unavailable, never inferred from language. */}
  return context;
}
