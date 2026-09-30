import { z } from 'zod';

/** Keep the supplied name; Intl validates IANA regions and aliases, not offsets. */
export function isClockTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}

const timeZone = z.string().min(1).max(100).refine(isClockTimeZone, 'Expected a valid IANA time zone, such as Europe/Oslo or UTC');
const label = z.string().min(1).max(120).refine(value => Boolean(value.trim()), 'Supply a meaningful clock label');
export const clockDataSchema = z.object({
  timeZone: timeZone.optional().describe('Primary IANA zone. Omit for the receiving browser’s local time zone.'),
  label: label.optional().describe('Optional meaningful primary label. Preserved exactly; a generic clock title is unnecessary.'),
  hourFormat: z.enum(['12h', '24h']).default('24h').describe('12-hour with the local AM/PM marker, or 00–23 hours.'),
  showSeconds: z.boolean().default(false),
  showDate: z.boolean().default(false).describe('Show each clock’s actual calendar date in its own zone.'),
  zones: z.array(z.object({ timeZone, label }).strict()).max(2).default([])
    .describe('Up to two clearly labelled additional clocks; at most three clocks including the primary.'),
}).strict().superRefine((data, ctx) => {
  const known = new Set<string>();
  const key = (zone: string) => new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  if (data.timeZone && isClockTimeZone(data.timeZone)) known.add(key(data.timeZone));
  data.zones.forEach((zone, index) => {
    if (!isClockTimeZone(zone.timeZone)) return;
    const canonical = key(zone.timeZone);
    if (known.has(canonical)) ctx.addIssue({ code: 'custom', path: ['zones', index, 'timeZone'], message: 'Choose distinct clock zones, including IANA aliases' });
    known.add(canonical);
  });
});
export type ClockData = z.infer<typeof clockDataSchema>;

export interface ClockAnchor { source: string; serverMs: number; clientMs: number; monotonicMs: number }

/** Only a timestamp with an explicit zone can establish a server clock anchor. */
export function createClockAnchor(serverNow: string | undefined, clientMs: number, monotonicMs: number): ClockAnchor | undefined {
  if (!serverNow || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(serverNow)) return;
  const serverMs = Date.parse(serverNow);
  if (!Number.isFinite(serverMs) || !Number.isFinite(clientMs) || !Number.isFinite(monotonicMs)) return;
  return { source: serverNow, serverMs, clientMs, monotonicMs };
}

/** No local tick counter: delayed callbacks always read the current instant. */
export function clockEpochMilliseconds(anchor: ClockAnchor | undefined, clientMs: number, monotonicMs: number): number {
  return anchor ? anchor.serverMs + Math.max(0, monotonicMs - anchor.monotonicMs) : clientMs;
}

/** Some browsers pause performance.now during device sleep. On an actual
 * visibility/pageshow wake, retain the received server-to-device offset while
 * recovering that missing elapsed wall time. Ordinary ticks ignore clock edits.
 * A newer server snapshot always replaces this provisional local anchor. */
export function wakeClockAnchor(anchor: ClockAnchor | undefined, clientMs: number, monotonicMs: number): ClockAnchor | undefined {
  if (!anchor) return;
  const monotonicElapsed = Math.max(0, monotonicMs - anchor.monotonicMs), wallElapsed = clientMs - anchor.clientMs;
  const elapsed = wallElapsed - monotonicElapsed > 1500 ? wallElapsed : monotonicElapsed;
  return { ...anchor, serverMs: anchor.serverMs + elapsed, clientMs, monotonicMs };
}

export interface ClockPart { type: Intl.DateTimeFormatPartTypes; value: string; secondary: boolean }
export interface ClockReading { parts: ClockPart[]; time: string; date: string; isoDate: string; timeZone: string }

function clockLocale(locale?: string): string | undefined {
  if (!locale) return;
  try { return Intl.getCanonicalLocales(locale)[0]; } catch { return; }
}

/** All clocks receive one instant; Intl supplies DST, day boundaries and labels. */
export function formatClock(instant: number, data: Pick<ClockData, 'hourFormat' | 'showSeconds'>, timeZone?: string, locale?: string): ClockReading {
  const language = clockLocale(locale), date = new Date(instant);
  const timeFormatter = new Intl.DateTimeFormat(language, {
    timeZone, hour: '2-digit', minute: '2-digit', ...(data.showSeconds ? { second: '2-digit' } : {}),
    hourCycle: data.hourFormat === '12h' ? 'h12' : 'h23',
  });
  const raw = timeFormatter.formatToParts(date);
  const parts = raw.map((part, index) => ({ ...part, secondary: part.type === 'dayPeriod' || part.type === 'literal' && (raw[index - 1]?.type === 'dayPeriod' || raw[index + 1]?.type === 'dayPeriod') }));
  const iso = new Intl.DateTimeFormat('en', { timeZone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => iso.find(item => item.type === type)!.value;
  return {
    parts, time: raw.map(item => item.value).join(''),
    date: new Intl.DateTimeFormat(language, { timeZone, calendar: 'gregory', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(date),
    isoDate: `${part('year')}-${part('month')}-${part('day')}`,
    timeZone: timeFormatter.resolvedOptions().timeZone,
  };
}

export function clockDayDifference(primary: ClockReading, comparison: ClockReading): number {
  return Math.round((Date.parse(`${comparison.isoDate}T00:00:00Z`) - Date.parse(`${primary.isoDate}T00:00:00Z`)) / 86_400_000);
}

export function clockDayLabel(difference: number, locale?: string): string {
  return new Intl.RelativeTimeFormat(clockLocale(locale), { numeric: 'auto' }).format(difference, 'day');
}
