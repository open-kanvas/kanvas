import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateView } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
import { monthWeeks, scheduleIndex, scheduleMonths } from '../../src/client/renderers/Time';
import { draftMarks } from '../../src/client/renderers/Drafting';
import { sameConfig } from '../../src/client/hooks';
import { coverageSlots, rosterDataSchema, rosterMonths, rosterTotals } from '../../src/shared/roster';
import { browserKind, deviceKind } from '../../src/shared/devices-view';

const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe('September 26 viewer and template feedback', () => {
  it('re-applies an open display theme whenever the effective configuration changes', () => {
    expect(sameConfig({ theme: 'dark', style: 'ocean', accent: '#38bdf8' }, { accent: '#38bdf8', style: 'ocean', theme: 'dark' })).toBe(true);
    expect(sameConfig({ theme: 'dark', style: 'ocean' }, { theme: 'light', style: 'ocean' })).toBe(false);
  });

  it('builds Monday-first month rows, multi-month ranges and non-bleeding overnight events', () => {
    const weeks = monthWeeks('2026-02-10');
    expect(weeks).toHaveLength(5); expect(weeks[0][5]).toBeNull(); expect(weeks[0][6]).toBe('2026-02-01'); expect(weeks[4]).toEqual(['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', null]);
    expect(scheduleMonths('2026-03-15', 'months', 6)).toEqual(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01']);
    expect(scheduleMonths('2026-03-15', 'year')).toHaveLength(12); expect(scheduleMonths('2026-03-15', 'year')[0]).toBe('2026-01-01');
    const events = [{ id: 'night', title: 'Night', allDay: false, start: '2026-03-02T22:00:00Z', end: '2026-03-03T06:00:00Z' }, { id: 'trip', title: 'Trip', allDay: true, start: '2026-03-05T00:00:00Z', end: '2026-03-07T00:00:00Z' }];
    const compact = scheduleIndex(events, 'UTC', true, '2026-03-01', '2026-03-31');
    expect(compact.get('2026-03-02')?.map(e => e.id)).toEqual(['night']); expect(compact.get('2026-03-03')).toBeUndefined();
    expect(compact.get('2026-03-05')?.map(e => e.id)).toEqual(['trip']); expect(compact.get('2026-03-06')?.map(e => e.id)).toEqual(['trip']); expect(compact.get('2026-03-07')).toBeUndefined();
    expect(scheduleIndex(events, 'UTC', false, '2026-03-01', '2026-03-31').get('2026-03-03')?.map(e => e.id)).toEqual(['night']);
  });

  it('renders month grids with weekday headers and no header band unless the title is shown', () => {
    const data = { date: '2026-03-10', view: 'month', events: [{ id: 'a', title: 'Team sync', start: '2026-03-10T09:00:00Z', end: '2026-03-10T10:00:00Z' }] };
    const month = html(schedule(data));
    expect(month).toContain('schedule-month-grid'); expect(month).toContain('role="columnheader"'); expect(month).toContain('Team sync');
    expect(month).not.toContain('Month schedule'); expect(month).not.toContain('schedule-heading');
    expect(html(schedule(data, { title: 'March', showTitle: true }))).toContain('schedule-heading');
    const week = html(schedule({ date: '2026-03-10', view: 'week', eventStyle: 'compact', events: [{ id: 'b', title: 'Holiday', allDay: true, start: '2026-03-10T00:00:00Z', end: '2026-03-11T00:00:00Z' }] }));
    expect(week).toContain('schedule-event-compact'); expect(week).not.toContain('All day');
    const year = html(schedule({ date: '2026-05-01', view: 'year', legend: [{ label: 'Day shift', color: '#38bdf8' }], events: [{ id: 'c', title: 'Day shift', allDay: true, color: '#38bdf8', start: '2026-05-04T00:00:00Z', end: '2026-05-05T00:00:00Z' }] }));
    expect(year).toContain('schedule-year'); expect(year.match(/role="rowheader"/g)).toHaveLength(12); expect(year).toContain('schedule-legend');
  });

  it('shows image stories as a news list and keeps visible text on text-only cards', () => {
    const news = html({ version: 1, template: 'story-cards', data: { items: [{ headline: 'Harbour opens', summary: 'Summary one', image: { url: 'https://example.com/a.jpg', alt: 'Harbour' } }, { headline: 'Library', summary: 'Summary two' }] } });
    expect(news).toContain('story-news'); expect(news).toContain('has-image'); expect(news).toContain('Summary one'); expect(news).toContain('Summary two');
    const text = html({ version: 1, template: 'story-cards', data: { items: [{ headline: 'Only text', summary: 'No images' }] } });
    expect(text).toContain('story-text'); expect(text).not.toContain('story-news'); expect(text).toContain('No images');
  });

  it('renders rosters with tri-segment days and free-text codes, and compares coverage without solving', () => {
    const out = html({ version: 1, template: 'roster', data: roster });
    expect(out).toContain('roster-calendar'); expect(out).toContain('>W14<'); expect(out).toContain('Supplied nurse'); expect(out).toContain('seg-night is-on');
    const parsed = rosterDataSchema.parse(roster), totals = rosterTotals(parsed);
    expect(Object.fromEntries(totals.counts)).toEqual({ day: 1, night: 1, leave: 1 }); expect(totals.free).toBe(11);
    expect(rosterMonths(roster.start, roster.end)[0].weeks).toHaveLength(2);
    expect(rosterDataSchema.safeParse({ ...roster, end: '2027-12-31' }).success).toBe(false);
    expect(rosterDataSchema.safeParse({ ...roster, assignments: [{ date: '2026-11-02', shift: 'missing' }] }).success).toBe(false);
    const coverage = rosterDataSchema.parse({ mode: 'coverage', start: '2026-11-02', end: '2026-11-03', shifts: [{ id: 'day', label: 'Day', code: 'D', segment: 'morning' }],
      roles: [{ id: 'doc', label: 'Doctor' }, { id: 'nurse', label: 'Nurse' }], requirements: [{ shift: 'day', roles: [{ role: 'doc', min: 1 }, { role: 'nurse', min: 2, max: 3 }], totalMin: 3 }],
      staffing: [{ date: '2026-11-02', shift: 'day', role: 'doc', name: 'A' }, { date: '2026-11-02', shift: 'day', role: 'nurse', count: 2 }, { date: '2026-11-03', shift: 'day', role: 'nurse', count: 4 }] });
    const slots = coverageSlots(coverage);
    expect(slots.get('2026-11-02')?.[0]).toMatchObject({ status: 'met', actual: 3, required: 3 });
    expect(slots.get('2026-11-03')?.[0]).toMatchObject({ status: 'under', roles: [{ role: 'doc', status: 'under' }, { role: 'nurse', status: 'over' }] });
    expect(html({ version: 1, template: 'roster', data: coverage })).toContain('roster-cov is-under');
  });

  it('shows devices with type, browser, online state and shared-session colours', () => {
    expect(deviceKind({ device: 'iPhone' })).toBe('phone'); expect(deviceKind({ device: 'TV' })).toBe('tv'); expect(deviceKind({ device: 'Mac', name: 'MacBook Air' })).toBe('laptop'); expect(browserKind('Microsoft Edge')).toBe('edge');
    const out = html({ version: 1, template: 'devices', data: { devices: [{ name: 'Office laptop', device: 'Mac', browser: 'Safari', connected: true, windows: [{ name: 'Main', connected: true, sessionId: 's1', sessionName: 'Planning' }, { name: 'Second', connected: false, sessionId: 's1', sessionName: 'Planning' }] }] } });
    expect(out).toContain('Office laptop'); expect(out).toContain('Online'); expect(out).toContain('is-shared'); expect(out).toContain('Planning');
  });

  it('clips inline drafting suggestions to passages and keeps live web embeds pending until checked', () => {
    expect(draftMarks({ start: 0, end: 10 }, [{ id: 'a', start: 8, end: 14, replacement: 'X' }])).toEqual([{ id: 'a', start: 8, end: 10, replacement: 'X', last: false }]);
    expect(draftMarks({ start: 10, end: 20 }, [{ id: 'a', start: 8, end: 14, replacement: 'X', reason: 'Why' }])).toEqual([{ id: 'a', start: 10, end: 14, replacement: 'X', reason: 'Why', last: true }]);
    const web = html({ version: 1, template: 'web', data: { url: 'https://example.com/page', embed: true, text: 'Supplied summary' } });
    expect(web).not.toContain('<iframe'); expect(web).toContain('Checking whether this website allows live embedding');
  });
});
