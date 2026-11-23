import type { Request } from 'express';
import { browserContext, type RequestContext } from '../shared/recognition.js';
import { lookupLocation } from './geoip.js';
import { isPublicMonitoringAddress } from './monitoring.js';

export async function requestContext(req:Request):Promise<RequestContext>{
  const context=browserContext(req.get('user-agent')??'',req.get('accept-language')),ip=(req.ip??req.socket.remoteAddress??'').replace(/^::ffff:/,'');
  if(!isPublicMonitoringAddress(ip))return context;
  try {
    // Local database only. The address never leaves the host or enters records.
    const result = await lookupLocation(ip);
    if (result?.country?.iso_code) {
      const region = result.subdivisions?.[0]?.iso_code, city = result.city?.names?.en;
      const lat = result.location?.latitude, lng = result.location?.longitude, accuracyKm = result.location?.accuracy_radius;
      context.location = { country: result.country.iso_code, ...(region ? { region } : {}), ...(city ? { city } : {}),
        ...(typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
        ...(typeof accuracyKm === 'number' && accuracyKm > 0 ? { accuracyKm } : {}), source: 'GeoIP', approximate: true };
    }
  }catch{/* Missing data is honestly unavailable, never inferred from language. */}
  return context;
}
