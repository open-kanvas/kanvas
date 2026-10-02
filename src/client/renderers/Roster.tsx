import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { RendererProps } from './Renderer';
import { coverageSlots, isoWeekday, rosterDays, rosterMonths, rosterTotals, segmentRank, shiftCode, ROSTER_SEGMENTS, type CoverageSlot, type RosterData, type RosterSegment, type RosterShift } from '../../shared/roster';
import './roster.css';

type Assignment = RosterData['assignments'][number];
type IconKind = 'sun' | 'sunset' | 'moon';
const DEFAULT_COLORS: Record<RosterSegment | 'whole', string> = { morning: '#38bdf8', evening: '#fb923c', night: '#4338ca', whole: '#94a3b8' };
const DEFAULT_ICONS: Record<RosterSegment, IconKind> = { morning: 'sun', evening: 'sunset', night: 'moon' };
const STATUS_TEXT = { met: 'requirement met', under: 'under-staffed', over: 'over-staffed' } as const;
const STATUS_GLYPH = { met: '✓', under: '↓', over: '↑' } as const;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const longDate = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', year: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' });
const weekdayNarrow = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'narrow' });
const WEEKDAYS = Array.from({ length: 7 }, (_, index) => weekdayShort.format(new Date(Date.UTC(2024, 0, 1 + index))));

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function luminance(hex: string) {
  const channel = (offset: number) => { const value = parseInt(hex.slice(offset, offset + 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
/** Gradient and readable ink for a shift colour; the default night keeps deep indigo with a cream moon. */
export function shiftStyle(shift: RosterShift): CSSProperties {
  const base = shift.color ?? DEFAULT_COLORS[shift.segment ?? 'whole'], night = !shift.color && shift.segment === 'night', light = luminance(base);
  const ink = night ? '#fef3c7' : (light + 0.05) / 0.059 >= 1.05 / (light + 0.05) ? '#0f172a' : '#ffffff';
  return { '--shift-color': base, '--shift-deep': night ? '#312e81' : `color-mix(in srgb, ${base} 82%, #000)`, '--shift-ink': ink } as CSSProperties;
}

function ShiftIcon({ kind }: { kind: IconKind }) {
  if (kind === 'sun') return <svg className="roster-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="9" r="4" fill="currentColor"/><path d="M10 1.8v2M10 14.2v2M2.8 9h2M15.2 9h2M4.9 3.9l1.4 1.4M13.7 12.7l1.4 1.4M4.9 14.1l1.4-1.4M13.7 5.3l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/><path d="M11.5 21.5h8.3a3 3 0 0 0 .3-6 4.2 4.2 0 0 0-7.9 1.1 2.5 2.5 0 0 0-.7 4.9Z" fill="currentColor" opacity=".8"/></svg>;
  if (kind === 'sunset') return <svg className="roster-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17a7 7 0 0 1 14 0Z" fill="currentColor"/><path d="M2 20h20M12 4v3M4.6 9.1l2.1 2.1M19.4 9.1l-2.1 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/></svg>;
  return <svg className="roster-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3.5a8.5 8.5 0 1 0 6 13.8A7 7 0 0 1 14.5 3.5Z" fill="currentColor"/><path d="M19 2.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6ZM21.6 8.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4Z" fill="currentColor"/></svg>;
}

function DayCell({ date, entries, shifts, today, compact = false }: { date: string; entries: Assignment[]; shifts: Map<string, RosterShift>; today: string; compact?: boolean }) {
  const ordered = [...entries].sort((a, b) => segmentRank(shifts.get(a.shift)?.segment) - segmentRank(shifts.get(b.shift)?.segment));
  const described = ordered.map(entry => { const shift = shifts.get(entry.shift)!; return `${shift.label} (${entry.code ?? shiftCode(shift)})${entry.note ? `: ${entry.note}` : ''}`; });
  const label = `${longDate.format(utc(date))}: ${described.length ? described.join(', ') : 'free'}`;
  const whole = ordered.find(entry => !shifts.get(entry.shift)?.segment);
  const wholeShift = whole && shifts.get(whole.shift);
  return <div className={`roster-cell${isoWeekday(date) >= 6 ? ' is-weekend' : ''}${date === today ? ' is-today' : ''}${entries.length ? '' : ' is-free'}`} role="gridcell" aria-label={label} title={label}>
    {!compact && <time className="roster-date" dateTime={date}>{Number(date.slice(8))}</time>}
    {whole && wholeShift ? <span className="roster-whole is-on" style={shiftStyle(wholeShift)}><b>{whole.code ?? shiftCode(wholeShift)}</b></span>
      : <span className="roster-segs">{ROSTER_SEGMENTS.map(segment => {
        const entry = ordered.find(item => shifts.get(item.shift)?.segment === segment), shift = entry && shifts.get(entry.shift);
        const icon = shift?.icon === 'none' ? undefined : shift?.icon ?? DEFAULT_ICONS[segment];
        return <span key={segment} className={`roster-seg seg-${segment}${shift ? ' is-on' : ''}`} style={shift ? shiftStyle(shift) : undefined}>
          {icon && <ShiftIcon kind={icon}/>}{entry && shift && <b>{entry.code ?? shiftCode(shift)}</b>}
        </span>;
      })}</span>}
  </div>;
}

/** Months as row groups (vertical month label), Monday-first weekday columns, weekend shading. */
function Calendar({ start, end, cell }: { start: string; end: string; cell: (date: string) => ReactNode }) {
  const months = rosterMonths(start, end);
  const rows = months.reduce((total, month) => total + month.weeks.length, 0);
  let row = 2;
  return <div className="roster-calendar" role="grid" style={{ '--roster-rows': rows } as CSSProperties}>
    <span className="roster-corner" style={{ gridRow: 1, gridColumn: 1 }}/>
    {WEEKDAYS.map((name, index) => <span key={name} role="columnheader" className={`roster-weekday${index >= 5 ? ' is-weekend' : ''}`} style={{ gridRow: 1, gridColumn: index + 2 }}>{name}</span>)}
    {months.map(month => {
      const first = row; row += month.weeks.length;
      return <Fragment key={month.month}>
        <span className="roster-month" role="rowheader" style={{ gridRow: `${first} / span ${month.weeks.length}`, gridColumn: 1 }}><span>{monthLabel.format(utc(month.month))}</span></span>
        {month.weeks.map((week, weekIndex) => week.map((date, dayIndex) => <div key={`${month.month}-${weekIndex}-${dayIndex}`} className="roster-slot" style={{ gridRow: first + weekIndex, gridColumn: dayIndex + 2 }}>
          {date ? cell(date) : <span className={`roster-cell is-outside${dayIndex >= 5 ? ' is-weekend' : ''}`} aria-hidden="true"/>}
        </div>))}
      </Fragment>;
    })}
  </div>;
}

function TeamGrid({ data, days, shifts, today }: { data: RosterData; days: string[]; shifts: Map<string, RosterShift>; today: string }) {
  const people = data.people ?? [], cells = new Map<string, Assignment[]>(), perPerson = new Map<string, number>(), dayCounts=new Map<string,number>();
  for (const entry of data.assignments) {
    const key = `${entry.person}\u0000${entry.date}`, list = cells.get(key);
    if (list) list.push(entry); else cells.set(key, [entry]);
    dayCounts.set(`${entry.date}:${entry.shift}`,(dayCounts.get(`${entry.date}:${entry.shift}`)??0)+1);
    perPerson.set(entry.person ?? '', (perPerson.get(entry.person ?? '') ?? 0) + 1);
  }
  const months: { key: string; start: number; count: number }[] = [];
  days.forEach((date, index) => { const last = months[months.length - 1]; if (last?.key === date.slice(0, 7)) last.count++; else months.push({ key: date.slice(0, 7), start: index, count: 1 }); });
  return <div className="roster-team" role="grid" style={{ '--roster-days': days.length, '--roster-people': people.length } as CSSProperties}>
    <span className="roster-corner" style={{ gridRow: '1 / span 2', gridColumn: 1 }}/>
    {months.map(month => <span key={month.key} className="roster-team-month" style={{ gridRow: 1, gridColumn: `${month.start + 2} / span ${month.count}` }}>{monthLabel.format(utc(`${month.key}-01`))}</span>)}
    {days.map((date, index) => <span key={date} role="columnheader" className={`roster-team-day${isoWeekday(date) >= 6 ? ' is-weekend' : ''}`} style={{ gridRow: 2, gridColumn: index + 2 }}><b>{Number(date.slice(8))}</b><small>{weekdayNarrow.format(utc(date))}</small></span>)}
    <span className="roster-team-total" style={{ gridRow: '1 / span 2', gridColumn: days.length + 2 }}>Shifts</span>
    {people.map((person, row) => <Fragment key={person.id}>
      <span className="roster-person" role="rowheader" style={{ gridRow: row + 3, gridColumn: 1 }}>{person.name}</span>
      {days.map((date, index) => <div key={date} className="roster-slot" style={{ gridRow: row + 3, gridColumn: index + 2 }}><DayCell date={date} entries={cells.get(`${person.id}\u0000${date}`) ?? []} shifts={shifts} today={today} compact/></div>)}
      <span className="roster-team-total" style={{ gridRow: row + 3, gridColumn: days.length + 2 }}>{perPerson.get(person.id) ?? 0}</span>
    </Fragment>)}
    {data.showDayCounts && data.shifts.map((shift,si)=><Fragment key={shift.id}><span className="roster-person roster-day-count" role="rowheader" style={{gridRow:people.length+3+si,gridColumn:1}}>{shift.label}</span>{days.map((date,i)=><span key={date} className="roster-day-count" role="gridcell" aria-label={`${date}: ${shift.label} ${dayCounts.get(`${date}:${shift.id}`)??0}`} style={{gridRow:people.length+3+si,gridColumn:i+2}}>{dayCounts.get(`${date}:${shift.id}`)??0}</span>)}</Fragment>)}
  </div>;
}

function ShiftLegend({ shifts, counts, free }: { shifts: RosterShift[]; counts?: Map<string, number>; free?: number }) {
  return <ul className="roster-legend">
    {shifts.map(shift => <li key={shift.id}><span className="roster-chip" style={shiftStyle(shift)}>{shiftCode(shift)}</span><span>{shift.label}</span>{counts && <b>{counts.get(shift.id) ?? 0}</b>}</li>)}
    {free !== undefined && <li><span className="roster-chip is-free" aria-hidden="true"/><span>Free days</span><b>{free}</b></li>}
  </ul>;
}

const range = (role: { min: number; max?: number }) => role.max !== undefined && role.max !== role.min ? `${role.min}–${role.max}` : String(role.min);
function describeSlot(slot: CoverageSlot) {
  const roles = slot.roles.map(role => `${role.label} ${role.actual}/${range(role)}`).join(', ');
  return `${slot.shift.label}: ${slot.actual}/${slot.required}${slot.totalMax !== undefined ? ` (max ${slot.totalMax})` : ''}, ${STATUS_TEXT[slot.status]}${roles ? ` (${roles})` : ''}`;
}
function missingText(slot: CoverageSlot) {
  const parts = slot.roles.filter(role => role.status === 'under').map(role => `${role.min - role.actual} ${role.label}`);
  if (slot.actual < slot.required) parts.push(`${slot.required - slot.actual} in total`);
  return parts.join(', ');
}
function CoverageCell({ date, slots, today, detail }: { date: string; slots: CoverageSlot[]; today: string; detail: boolean }) {
  const label = `${longDate.format(utc(date))}: ${slots.length ? slots.map(describeSlot).join('; ') : 'no requirements'}`;
  return <div className={`roster-cell roster-coverage${isoWeekday(date) >= 6 ? ' is-weekend' : ''}${date === today ? ' is-today' : ''}`} role="gridcell" aria-label={label} title={label}>
    <time className="roster-date" dateTime={date}>{Number(date.slice(8))}</time>
    <span className="roster-segs">{slots.map(slot => <span key={slot.shift.id} className={`roster-cov is-${slot.status}`}>
      <b>{shiftCode(slot.shift)}</b><span className="roster-cov-count"><i aria-hidden="true">{STATUS_GLYPH[slot.status]}</i>{slot.actual}/{slot.required}</span>
      {detail && slot.roles.length > 0 && <span className="roster-cov-roles">{slot.roles.map(role => <span key={role.role} className={`is-${role.status}`}>{role.label} {role.actual}/{range(role)}</span>)}</span>}
    </span>)}</span>
  </div>;
}

/** Shift roster (individual or team) and organiser coverage views. */
export function RosterRenderer({ view }: RendererProps) {
  const data = view.data as unknown as RosterData;
  const shifts = new Map(data.shifts.map(shift => [shift.id, shift]));
  const today = localToday(), showTotals = data.showTotals !== false, appearance = data.appearance ?? 'session';
  const days = rosterDays(data.start, data.end);
  const period = `${shortDate.format(utc(data.start))} – ${shortDate.format(utc(data.end))}`;
  if (data.mode === 'coverage') {
    const slots = coverageSlots(data), all = [...slots.values()].flat(), gaps = all.filter(slot => slot.status === 'under');
    return <div className="roster-content roster-mode-coverage" data-appearance={appearance}>
      <header className="roster-caption"><span>{period}</span><span className="roster-cov-summary">{(['met', 'under', 'over'] as const).map(status => <span key={status} className={`roster-cov-key is-${status}`}>{STATUS_GLYPH[status]} {all.filter(slot => slot.status === status).length} {status}</span>)}</span></header>
      <Calendar start={data.start} end={data.end} cell={date => <CoverageCell date={date} slots={slots.get(date) ?? []} today={today} detail={days.length <= 14}/>}/>
      {gaps.length > 0 && <ol className="roster-gaps" aria-label="Under-staffed shifts">
        {gaps.slice(0, 8).map(slot => <li key={`${slot.date}-${slot.shift.id}`}><time dateTime={slot.date}>{shortDate.format(utc(slot.date))}</time> · {slot.shift.label}: {missingText(slot)} short</li>)}
        {gaps.length > 8 && <li className="roster-gaps-more">+{gaps.length - 8} more under-staffed shifts</li>}
      </ol>}
    </div>;
  }
  if (data.people) {
    return <div className="roster-content roster-mode-team" data-appearance={appearance}>
      <header className="roster-caption"><span>{period}</span></header>
      <TeamGrid data={data} days={days} shifts={shifts} today={today}/>
      <ShiftLegend shifts={data.shifts} counts={showTotals ? rosterTotals(data).counts : undefined}/>
    </div>;
  }
  const byDate = new Map<string, Assignment[]>();
  for (const entry of data.assignments) { const list = byDate.get(entry.date); if (list) list.push(entry); else byDate.set(entry.date, [entry]); }
  const totals = showTotals ? rosterTotals(data) : undefined;
  return <div className="roster-content roster-mode-individual" data-appearance={appearance}>
    <header className="roster-caption">{data.person && <strong>{data.person}</strong>}<span>{period}</span></header>
    <Calendar start={data.start} end={data.end} cell={date => <DayCell date={date} entries={byDate.get(date) ?? []} shifts={shifts} today={today}/>}/>
    <ShiftLegend shifts={data.shifts} counts={totals?.counts} free={totals?.free}/>
  </div>;
}
