import { z } from 'zod';

export const numberLocaleSchema = z.string().max(80).refine(value => {
  if (!value) return true;
  try { return Intl.NumberFormat.supportedLocalesOf([value]).length === 1; } catch { return false; }
}, 'Use a supported locale such as nb-NO, en-US or de-DE; empty preserves source formatting.');
export const timeZoneSchema = z.string().max(100).refine(value => { if (!value) return true; try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Use an IANA time zone; empty uses the viewing device zone.');
export const regionalFields = {
  timeZone: timeZoneSchema.optional(),
  numberLocale: numberLocaleSchema.optional(),
  unitSystem: z.enum(['source', 'metric', 'imperial']).optional(),
  timeFormat: z.enum(['locale','12h','24h']).optional(),
  dateFormat: z.enum(['source', 'dmy', 'mdy', 'iso']).optional(),
};
export const viewFormatSchema=z.object(regionalFields).strict();
export interface RegionalPreferences { timeFormat?: 'locale'|'12h'|'24h'; language?: string; timeZone?: string; numberLocale?: string; unitSystem?: 'source'|'metric'|'imperial'; dateFormat?: 'source'|'dmy'|'mdy'|'iso' }

/** A string may encode significant decimal places, a currency or an identifier.
 * Only native numbers are formatted; source text is never parsed as a number. */
export function regionalNumber(value: string | number, preferences?: RegionalPreferences): string {
  if (typeof value === 'string' || !preferences?.numberLocale) return String(value);
  return new Intl.NumberFormat(preferences.numberLocale, { maximumSignificantDigits: 21 }).format(value);
}

/** Convert only unambiguous temperatures with a supplied unit. The view data is
 * retained unchanged. Unqualified “18°” is not enough to infer Celsius. */
export function regionalTemperature(value: string | undefined, preferences?: RegionalPreferences, suppliedUnit?: 'celsius'|'fahrenheit'): string | undefined {
  if (!value || !preferences?.unitSystem || preferences.unitSystem === 'source') return value;
  const match = value.match(/^\s*([+-]?\d+(?:[.,]\d+)?)\s*°?\s*([CF])?\s*$/i);
  if (!match) return value;
  const source = match[2]?.toUpperCase() ?? (suppliedUnit === 'celsius' ? 'C' : suppliedUnit === 'fahrenheit' ? 'F' : undefined);
  if (!source) return value;
  const target = preferences.unitSystem === 'metric' ? 'C' : 'F';
  const input = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(input)) return value;
  const converted = source === target ? input : target === 'C' ? (input - 32) * 5 / 9 : input * 9 / 5 + 32;
  const rounded = Math.round((converted + Number.EPSILON) * 10) / 10;
  return `${regionalNumber(rounded, preferences)} °${target}`;
}

/** Explicit date-only input keeps its calendar day. Zoned timestamps use the
 * explicit display timezone, falling back to the viewing device zone. */
export function regionalDate(value: string | number | Date, preferences?: RegionalPreferences, timeZone = preferences?.timeZone || undefined, fallback?: string | (()=>string)): string {
  const original=()=>typeof fallback==='function'?fallback():fallback??String(value);
  if ((!preferences?.dateFormat || preferences.dateFormat === 'source') && fallback !== undefined && original() !== String(value)) return original();
  if(typeof value==='string'&&!/^\d{4}-\d\d-\d\d(?:$|T.*(?:Z|[+-]\d\d:\d\d)$)/i.test(value))return original();
  const input = typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (!Number.isFinite(input.getTime())) return original();
  const dateOnly = typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value);
  const parts = new Intl.DateTimeFormat('en', { timeZone: dateOnly ? 'UTC' : timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(input);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const [y, m, d] = [get('year'), get('month'), get('day')];
  if (!preferences?.dateFormat || preferences.dateFormat === 'source') return new Intl.DateTimeFormat(regionalLocale(preferences), {timeZone:dateOnly?'UTC':timeZone, year:'numeric', month:'short', day:'numeric'}).format(input);
  return preferences.dateFormat === 'iso' ? `${y}-${m}-${d}` : preferences.dateFormat === 'dmy' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

/** Preserve the full instant when formatting a date-bearing timestamp. Ambiguous
 * prose, offsets such as 00:04.250, and already formatted source strings stay literal. */
export function regionalLocale(preferences?:RegionalPreferences):string|undefined {
  for(const locale of [preferences?.numberLocale,preferences?.language]){if(!locale)continue;try{if(Intl.DateTimeFormat.supportedLocalesOf([locale]).length)return locale;}catch{}}
  return 'en-GB';
}
export function regionalTime(value:string|number|Date,preferences?:RegionalPreferences,timeZone=preferences?.timeZone || undefined,seconds=false):string {
  const input=new Date(value);if(!Number.isFinite(input.getTime()))return String(value);
  return new Intl.DateTimeFormat(regionalLocale(preferences),{timeZone,hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{}),...(preferences?.timeFormat==='12h'?{hourCycle:'h12' as const}:preferences?.timeFormat==='24h'?{hourCycle:'h23' as const}:{})}).format(input);
}
export function regionalClock(minutes:number,preferences?:RegionalPreferences):string{return regionalTime(Date.UTC(2000,0,1,Math.floor(minutes/60),minutes%60),preferences,'UTC');}
export function regionalDateTime(value: string, preferences?: RegionalPreferences, timeZone = preferences?.timeZone || undefined, fallback?: string | (()=>string)): string {
  const original = () => typeof fallback === 'function' ? fallback() : fallback ?? value;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return regionalDate(value, preferences, timeZone);
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value) || !Number.isFinite(Date.parse(value))) return original();
  return `${regionalDate(value, preferences, timeZone)} · ${regionalTime(value,preferences,timeZone)} ${timeZone || new Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}
