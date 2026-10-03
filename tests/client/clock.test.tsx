import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { clockDataSchema, clockDayDifference, clockDayLabel, clockEpochMilliseconds, createClockAnchor, formatClock, isClockTimeZone, wakeClockAnchor, type ClockData } from '../../src/shared/clock';
import { ClockRenderer, fitClockFont } from '../../src/client/renderers/Clock';
import { Renderer } from '../../src/client/renderers/Renderer';
import { templateViewSchema, validateView } from '../../src/shared/view-schemas';

const data = (extra: Partial<ClockData> = {}) => clockDataSchema.parse(extra);
const read = (instant: string, timeZone = 'UTC', options: Partial<ClockData> = {}, locale = 'en-GB') => formatClock(Date.parse(instant), data({ showSeconds: true, ...options }), timeZone, locale);
const part = (reading: ReturnType<typeof formatClock>, type: string) => reading.parts.find(value => value.type === type)?.value;

describe('clock content and IANA validation', () => {
  it('defaults to one minimal browser-local clock and exposes its strict schema', () => {
    expect(data()).toEqual({ hourFormat: '24h', showSeconds: false, showDate: false, zones: [] });
    const schema = z.toJSONSchema(templateViewSchema('clock'), { io: 'input' });
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(schema.properties?.data).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('accepts real regions/aliases and rejects offsets, invalid zones, target timestamps and too many clocks', () => {
    for (const zone of ['Europe/Oslo', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Chatham', 'UTC', 'Etc/GMT+5']) expect(isClockTimeZone(zone)).toBe(true);
    for (const zone of ['Not/AZone', '+05:30', '-0400', 'Europe/Oslo ', '<script>UTC</script>', 'https://example.com/time']) expect(isClockTimeZone(zone)).toBe(false);
    for (const input of [
      { timeZone: 'Not/AZone' }, { endsAt: '2026-09-14T00:00:00Z' }, { time: '12:34' }, { hourFormat: 'auto' },
      { zones: [{ timeZone: 'UTC' }] }, { label: ' ' },
      { zones: [{ timeZone: 'UTC', label: 'A' }, { timeZone: 'Asia/Tokyo', label: 'B' }, { timeZone: 'Europe/Oslo', label: 'C' }] },
      { timeZone: 'America/New_York', zones: [{ timeZone: 'US/Eastern', label: 'Same zone' }] },
      { zones: [{ timeZone: 'UTC', label: 'A' }, { timeZone: 'Etc/UTC', label: 'Duplicate' }] },
    ]) expect(clockDataSchema.safeParse(input).success).toBe(false);
  });

  it('preserves exact meaningful labels and explicit zone names', () => {
    const supplied = { timeZone: 'Europe/Oslo', label: 'Arendal  ·  hjemme', zones: [{ timeZone: 'America/New_York', label: 'New York office' }, { timeZone: 'Asia/Tokyo', label: '東京' }] };
    expect(data(supplied)).toMatchObject(supplied);
  });
});

describe('actual clock time, dates and daylight saving', () => {
  it('uses 00 at 24-hour midnight and 12 AM/PM in 12-hour mode', () => {
    expect(read('2026-09-14T00:00:00Z').time).toBe('00:00:00');
    const midnight = read('2026-09-14T00:00:00Z', 'UTC', { hourFormat: '12h' }, 'en-US');
    const noon = read('2026-09-14T12:00:00Z', 'UTC', { hourFormat: '12h' }, 'en-US');
    expect(part(midnight, 'hour')).toBe('12'); expect(part(midnight, 'dayPeriod')).toBe('AM');
    expect(part(noon, 'hour')).toBe('12'); expect(part(noon, 'dayPeriod')).toBe('PM');
    expect(read('2026-09-14T12:34:56Z', 'UTC', { showSeconds: false }).time).toBe('12:34');
  });

  it('skips the spring DST hour and correctly repeats the autumn hour in each supplied zone', () => {
    expect(read('2026-03-29T00:59:59Z', 'Europe/Oslo').time).toBe('01:59:59');
    expect(read('2026-03-29T01:00:00Z', 'Europe/Oslo').time).toBe('03:00:00');
    expect(read('2026-10-25T00:30:00Z', 'Europe/Oslo').time).toBe('02:30:00');
    expect(read('2026-10-25T01:30:00Z', 'Europe/Oslo').time).toBe('02:30:00');
    expect(read('2026-03-08T06:59:59Z', 'America/New_York').time).toBe('01:59:59');
    expect(read('2026-03-08T07:00:00Z', 'America/New_York').time).toBe('03:00:00');
  });

  it('retains quarter-hour offsets, leap days and cross-year dates without browser-zone arithmetic', () => {
    expect(read('2026-06-01T12:34:56Z', 'Asia/Kathmandu')).toMatchObject({ time: '18:19:56', isoDate: '2026-06-01' });
    expect(read('2026-06-01T12:34:56Z', 'Pacific/Chatham')).toMatchObject({ time: '01:19:56', isoDate: '2026-06-02' });
    expect(read('2024-02-29T23:30:00Z', 'UTC').isoDate).toBe('2024-02-29');
    expect(read('2024-02-29T23:30:00Z', 'Asia/Tokyo').isoDate).toBe('2024-03-01');
    const reference = read('2026-12-31T12:30:00Z'), next = read('2026-12-31T12:30:00Z', 'Pacific/Kiritimati');
    expect(next.isoDate).toBe('2027-01-01'); expect(clockDayDifference(reference, next)).toBe(1); expect(clockDayLabel(1, 'en')).toBe('tomorrow');
  });

  it('uses browser-local timezone by default and preserves localized time-part order', () => {
    const instant = Date.parse('2026-09-14T12:34:56Z'), local = formatClock(instant, data());
    expect(local.timeZone).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(local.time).toBe(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(item => item.value).join(''));
    const chinese = read('2026-09-14T00:34:56Z', 'UTC', { hourFormat: '12h' }, 'zh-CN');
    expect(chinese.parts.map(item => item.value).join('')).toBe(chinese.time);
    expect(chinese.parts[0].type).toBe('dayPeriod'); expect(chinese.parts[0].secondary).toBe(true);
    const arabic = read('2026-09-14T12:34:56Z', 'UTC', {}, 'ar-EG');
    expect(arabic.time).toMatch(/[٠-٩]/); expect(arabic.isoDate).toBe('2026-09-14');
    expect(() => formatClock(instant, data(), 'Not/AZone')).toThrow();
    expect(() => formatClock(instant, data(), 'UTC', 'not a locale')).not.toThrow();
  });
});

describe('server snapshot anchoring and wake-safe elapsed time', () => {
  it('applies the server offset and advances from absolute monotonic elapsed time, not callbacks', () => {
    const server = Date.parse('2026-09-14T12:00:00Z'), anchor = createClockAnchor(new Date(server).toISOString(), server + 7 * 3_600_000, 100)!;
    expect(clockEpochMilliseconds(anchor, server + 7 * 3_600_000, 100)).toBe(server);
    expect(clockEpochMilliseconds(anchor, server - 3_600_000, 95_100)).toBe(server + 95_000);
    expect(clockEpochMilliseconds(anchor, server + 10 * 86_400_000, 95_100)).toBe(server + 95_000);
    expect(clockEpochMilliseconds(undefined, server, 100)).toBe(server);
    for (const value of [undefined, '2026-09-14T12:00:00', 'Not a time']) expect(createClockAnchor(value, server, 100)).toBeUndefined();
  });

  it('recovers device sleep when the monotonic timer pauses and accepts a newer authoritative snapshot', () => {
    const server = Date.parse('2026-09-14T12:00:00Z'), client = server + 120_000;
    const anchor = createClockAnchor(new Date(server).toISOString(), client, 50)!;
    const awake = wakeClockAnchor(anchor, client + 3_600_000, 75)!;
    expect(clockEpochMilliseconds(awake, client + 3_601_000, 1075)).toBe(server + 3_601_000);
    const ordinary = wakeClockAnchor(anchor, client + 5000, 5050)!;
    expect(clockEpochMilliseconds(ordinary, client + 6000, 6050)).toBe(server + 6000);
    const newer = createClockAnchor('2026-09-14T13:00:02Z', client + 3_600_000, 75)!;
    expect(clockEpochMilliseconds(newer, client + 3_600_000, 75)).toBe(Date.parse('2026-09-14T13:00:02Z'));
  });
});

describe('glanceable clock renderer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime('2026-09-14T12:34:56Z'); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows only the live time by default, with no clock controls or metadata title', () => {
    const view = validateView({ version: 1, template: 'clock', title: 'Unnecessary clock heading', data: {} });
    const html = renderToStaticMarkup(<Renderer view={view} />);
    expect(html).toContain('template-clock'); expect(html).toContain('clock-solo'); expect(html).toContain('data-clock-source="browser"');
    expect(html).not.toContain('class="view-heading"'); expect(html).toContain('aria-label="Unnecessary clock heading"');
    expect(html).not.toContain('clock-label'); expect(html).not.toContain('clock-date');
    expect(html).not.toMatch(/<button|<input|<iframe|<img|Syncing|Waiting for server/);
    expect(html).toContain('aria-live="off"');
  });

  it('preserves supplied zone labels as inert text and gives all clocks exactly one server-derived instant', () => {
    const view = validateView({ version: 1, template: 'clock', data: { timeZone: 'UTC', label: '<b>Reference</b>', showSeconds: true, showDate: true, zones: [{ timeZone: 'Asia/Tokyo', label: '東京' }, { timeZone: 'America/New_York', label: 'New York' }] } });
    const html = renderToStaticMarkup(<ClockRenderer view={view} serverNow="2026-12-31T23:59:58Z" />);
    expect(html).toContain('&lt;b&gt;Reference&lt;/b&gt;'); expect(html).not.toContain('<b>Reference</b>');
    expect(html).toContain('東京'); expect(html).toContain('New York');
    expect(html.match(/class="clock-time/g)).toHaveLength(3);
    const instants = [...html.matchAll(/dateTime="(2026-12-31T23:59:58\.[0-9]+Z)"/g)].map(match => match[1]);
    expect(instants).toHaveLength(3); expect(new Set(instants).size).toBe(1);
    expect(html).toContain('dateTime="2027-01-01"'); expect(html).toContain('data-clock-source="server"');
    expect(html).not.toMatch(/<button|fetch|Pause|Resume/);
  });

  it('keeps the actual zone day difference visible when dates are omitted', () => {
    const view = validateView({ version: 1, template: 'clock', data: { timeZone: 'UTC', zones: [{ timeZone: 'Pacific/Kiritimati', label: 'Kiritimati' }] } });
    const html = renderToStaticMarkup(<ClockRenderer view={view} serverNow="2026-12-31T12:30:00Z" />);
    expect(html).toContain('clock-day-difference'); expect(html).toContain('tomorrow'); expect(html).not.toContain('class="clock-date"');
  });

  it('falls back safely for descriptive config language without treating it as the clock zone', () => {
    const view = validateView({ version: 1, template: 'clock', data: { timeZone: 'UTC' } });
    const html = renderToStaticMarkup(<ClockRenderer view={view} serverNow="2026-09-14T12:34:56Z" config={{ theme: 'dark', accent: '#b9ed87', numberLocale: 'en-GB' }} />);
    expect(html).toContain('data-time-zone="UTC"'); expect(html).toContain('aria-label="12:34 · UTC"');
  });

  it('fits both clock formats and seconds to constrained portrait and desktop areas', () => {
    const measure = (text: string) => Array.from(text).reduce((sum, character) => sum + (/\d/.test(character) ? .64 : character === ':' ? .3 : .6), 0);
    for (const [width, height] of [[350, 720], [403, 699], [1340, 760], [350, 130]]) {
      for (const options of [{ showSeconds: false }, { showSeconds: true }, { showSeconds: true, hourFormat: '12h' as const }]) {
        const reading = read('2026-09-14T12:34:56Z', 'UTC', options), font = fitClockFont(width, height, reading.parts, measure);
        const units = reading.parts.reduce((sum, part) => sum + measure(part.value) * (part.secondary ? .28 : 1), 0);
        expect(font).toBeGreaterThan(40); expect(font * units).toBeLessThanOrEqual(width); expect(font * 1.15).toBeLessThanOrEqual(height);
      }
    }
  });
});
