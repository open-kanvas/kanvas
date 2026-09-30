import { useRegional } from './Regional';
import { regionalDate, regionalDateTime, regionalTime } from '../../shared/regional';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { CountdownData, ScheduleData } from '../../shared/view-schemas';
import { countdownParts, formatCountdown, isTimerTimestamp, timerDisplaySeconds, timerNextTickDelay, timerPausedSeconds, timerPhase } from '../../shared/timer';
import './timer.css';
import './schedule.css';
export { countdownRemainingSeconds, formatCountdown } from '../../shared/timer';

/** Calendar arithmetic uses date-only UTC values; event instants use the supplied IANA zone. */
export function scheduleDays(date: string, view: 'day' | 'three-day' | 'week' | 'month') {
  const first = new Date(`${date}T00:00:00Z`);
  if (view === 'month') first.setUTCDate(1);
  if (view === 'week') first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  return Array.from({ length: view === 'month' ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate() : view === 'week' ? 7 : view === 'three-day' ? 3 : 1 }, (_, index) => new Date(first.getTime() + index * 86_400_000).toISOString().slice(0, 10));
}
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
function zoneDateFormatter(timeZone: string) {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); zoneFormatters.set(timeZone, formatter); }
  return formatter;
}
export function dateInTimeZone(value: string | number, timeZone: string) {
  const parts = zoneDateFormatter(timeZone).formatToParts(new Date(value));
  const part = (name: string) => parts.find(value => value.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function eventsOnDate(events: ScheduleData['events'], date: string, timeZone: string) {
  return events.filter(event => dateInTimeZone(event.start, timeZone) <= date && dateInTimeZone(Date.parse(event.end) - 1, timeZone) >= date)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
type ScheduleEvent = ScheduleData['events'][number];
const DAY_MS = 86_400_000;
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);
const addDays = (date: string, days: number) => new Date(utcDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const weekdayIndex = (date: string) => (utcDate(date).getUTCDay() + 6) % 7;
const chipStyle = (event: ScheduleEvent) => ({ '--chip-color': event.color ?? 'var(--accent)' }) as CSSProperties;

/** Monday-first week rows covering the month of `date`; null pads adjacent months. */
export function monthWeeks(date: string): (string | null)[][] {
  const days = scheduleDays(date, 'month');
  const cells: (string | null)[] = [...Array<null>(weekdayIndex(days[0])).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}
/** First day of each month in a multi-month view: `count` months from the
 * month of `date`, or the twelve months of its calendar year. */
export function scheduleMonths(date: string, view: 'months' | 'year', count = 6): string[] {
  const start = utcDate(date), total = view === 'year' ? 12 : Math.min(12, Math.max(1, Math.trunc(count)));
  const month = view === 'year' ? 0 : start.getUTCMonth();
  return Array.from({ length: total }, (_, index) => new Date(Date.UTC(start.getUTCFullYear(), month + index, 1)).toISOString().slice(0, 10));
}
export function weekdayNames(style: 'short' | 'long'): string[] {
  const format = new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2024, 0, 1 + index))));
}
/** All-day events are date-based: use their supplied dates, end exclusive at midnight. */
function allDayRange(event: ScheduleEvent): [string, string] {
  const first = event.start.slice(0, 10), end = event.end.slice(0, 10);
  const last = event.end.length === 10 || /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(event.end) ? addDays(end, -1) : end;
  return [first, last < first ? first : last];
}
/** Index events by covered date once. With `startDayOnly`, a timed event
 * shorter than a day appears only on its start date, so an overnight shift does
 * not bleed into the next day. */
export function scheduleIndex(events: readonly ScheduleEvent[], timeZone: string, startDayOnly: boolean, rangeStart: string, rangeEnd: string): Map<string, ScheduleEvent[]> {
  const index = new Map<string, ScheduleEvent[]>();
  for (const event of [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    let first: string, last: string;
    if (event.allDay) [first, last] = allDayRange(event);
    else {
      first = dateInTimeZone(event.start, timeZone);
      last = startDayOnly && Date.parse(event.end) - Date.parse(event.start) < DAY_MS ? first : dateInTimeZone(Date.parse(event.end) - 1, timeZone);
    }
    for (let day = first < rangeStart ? rangeStart : first; day <= last && day <= rangeEnd; day = addDays(day, 1)) {
      const list = index.get(day);
      if (list) list.push(event); else index.set(day, [event]);
    }
  }
  return index;
}
const indexedCount = (index: Map<string, ScheduleEvent[]>) => new Set([...index.values()].flat().map(event => event.id)).size;
/** A supplied legend wins; otherwise derive one from distinct colour/title pairs. */
export function scheduleLegend(data: ScheduleData, index: Map<string, ScheduleEvent[]>): { label: string; color: string }[] {
  if (data.legend?.length) return data.legend;
  const entries = new Map<string, { label: string; color: string }>();
  for (const event of [...index.values()].flat()) entries.set(`${event.color ?? ''}\u0000${event.title}`, { label: event.title, color: event.color ?? 'var(--accent)' });
  return entries.size <= 12 ? [...entries.values()] : [];
}
function outsideNote(data: ScheduleData, shown: number, unit: string) {
  return shown < data.events.length ? <p className="content-summary">{data.events.length - shown} supplied events outside this {unit}.</p> : null;
}
const timedZone = (data: ScheduleData) => data.eventStyle !== 'compact' && data.events.some(event => !event.allDay) ? data.timeZone : undefined;
function ScheduleHeading({ label, timeZone }: { label: string; timeZone?: string }) {
  return <div className="schedule-heading"><span>{label}</span>{timeZone && <span>{timeZone}</span>}</div>;
}

/** Day, week, month and multi-month schedules. The header band renders only
 * with showTitle, so a dedicated display can give its full height to the grid. */
export function ScheduleRenderer({ data, showTitle = false }: { data: ScheduleData; showTitle?: boolean }) {
  const view = data.view ?? 'day';
  if (view === 'months' || view === 'year') return <ScheduleMonths data={data} view={view} showTitle={showTitle}/>;
  if (view === 'month') return <ScheduleMonth data={data} showTitle={showTitle}/>;
  return <ScheduleAgenda data={data} view={view} showTitle={showTitle}/>;
}

function ScheduleAgenda({ data, view, showTitle }: { data: ScheduleData; view: 'day' | 'week'; showTitle: boolean }) {
  const regional = useRegional();
  const compact = data.eventStyle === 'compact';
  const days = scheduleDays(data.date, view);
  const index = scheduleIndex(data.events, data.timeZone, compact, days[0], days[days.length - 1]);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const longDate = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormatter = new Intl.DateTimeFormat(undefined, { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const label = view === 'day' ? longDate.format(utcDate(days[0])) : `${dateFormatter.format(utcDate(days[0]))} – ${dateFormatter.format(utcDate(days[days.length - 1]))}`;
  return <div className={`schedule-content schedule-${view}${compact ? ' schedule-compact' : ''}`}>
    {showTitle && <ScheduleHeading label={label} timeZone={timedZone(data)}/>}
    <div className="schedule-days">{days.map(day => { const events = index.get(day) ?? []; return <section key={day} className="schedule-day" aria-label={day}>
      <h2><time dateTime={day}>{regionalDate(day, regional, 'UTC', () => dateFormatter.format(utcDate(day)))}</time></h2>
      {events.map(event => compact
        ? <article key={event.id} className="schedule-event schedule-event-compact" style={{ ...chipStyle(event), ...(event.color ? { borderInlineStartColor: event.color } : {}) }}><h3>{event.title}</h3></article>
        : <article key={event.id} className="schedule-event" style={event.color ? { borderInlineStartColor: event.color } : undefined}>
          <div className="schedule-event-time">{event.allDay ? 'All day' : <><time dateTime={event.start}>{dateInTimeZone(event.start, data.timeZone) < day ? 'Continued' : regionalTime(event.start,regional,data.timeZone)}</time><span>–</span><time dateTime={event.end}>{dateInTimeZone(Date.parse(event.end) - 1, data.timeZone) > day ? 'continues' : regionalTime(event.end,regional,data.timeZone)}</time></>}</div>
          <h3>{event.title}</h3>{event.location && <p className="schedule-location">{event.location}</p>}{event.description && <p>{event.description}</p>}
        </article>)}
      {!events.length && <p className="schedule-empty">No events</p>}
    </section>; })}</div>
    {outsideNote(data, indexedCount(index), view)}
  </div>;
}

/** Hide chips that do not fit a cell and show "+N more" instead of growing the grid. */
function fitMonthCells(grid: HTMLElement | null) {
  if (!grid) return;
  for (const cell of grid.querySelectorAll<HTMLElement>('.schedule-cell[data-day]')) {
    const list = cell.querySelector<HTMLElement>('.schedule-cell-events'), more = cell.querySelector<HTMLElement>('.schedule-more');
    if (!list || !more) continue;
    const items = [...list.children] as HTMLElement[], hiddenSpans = Number(more.dataset.hiddenSpans ?? 0);
    for (const item of items) item.removeAttribute('data-overflow');
    more.removeAttribute('data-count'); more.textContent = '';
    if (!items.length || list.scrollHeight <= list.clientHeight + 1) { if(hiddenSpans){more.setAttribute('data-count',String(hiddenSpans));more.textContent=`+${hiddenSpans} more`;} continue; }
    more.setAttribute('data-count', String(items.length)); more.textContent = `+${items.length} more`;
    let hidden = 0;
    for (const item of items) if (hidden || item.offsetTop + item.offsetHeight > list.clientHeight + 1) { item.setAttribute('data-overflow', ''); hidden++; }
    if (hidden || hiddenSpans) { more.setAttribute('data-count', String(hidden + hiddenSpans)); more.textContent = `+${hidden + hiddenSpans} more`; }
    else { more.removeAttribute('data-count'); more.textContent = ''; }
  }
}

/** Connected all-day bars, split only at week/month boundaries; lanes never overlap. */
export function scheduleWeekSpans(week: (string | null)[], events: readonly ScheduleEvent[]) {
  const occupied: number[] = [];
  return events.filter(event => event.allDay && allDayRange(event)[0] !== allDayRange(event)[1])
    .map(event => { const [first, last] = allDayRange(event); const columns = week.flatMap((day, i) => day && day >= first && day <= last ? [i] : []); return { event, first, last, columns }; })
    .filter(entry => entry.columns.length).sort((a, b) => a.first.localeCompare(b.first) || b.columns.length - a.columns.length || a.event.id.localeCompare(b.event.id))
    .map(({ event, first, last, columns }) => {
      const start = columns[0], end = columns[columns.length - 1] + 1;
      let lane = occupied.findIndex(mask => columns.every(column => !(mask & (1 << column))));
      if (lane < 0) { lane = occupied.length; occupied.push(0); }
      for (const column of columns) occupied[lane] |= 1 << column;
      return { event, start, end, lane, continuesBefore: first < week[start]!, continuesAfter: last > week[end - 1]! };
    });
}

function ScheduleMonth({ data, showTitle }: { data: ScheduleData; showTitle: boolean }) {
  const regional=useRegional();
  const compact = data.eventStyle === 'compact';
  const weeks = monthWeeks(data.date);
  const days = weeks.flat().filter((day): day is string => day !== null);
  const index = scheduleIndex(data.events, data.timeZone, true, days[0], days[days.length - 1]);
  const time = new Intl.DateTimeFormat(undefined, { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' });
  const dayName = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  const label = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(utcDate(days[0]));
  const today = dateInTimeZone(Date.now(), data.timeZone);
  const longNames = weekdayNames('long'), shortNames = weekdayNames('short');
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { fitMonthCells(grid.current); });
  useEffect(() => {
    const node = grid.current; if (!node) return;
    let frame = 0;
    const refit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitMonthCells(node)); };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refit);
    observer?.observe(node);
    void document.fonts?.ready.then(refit, () => {});
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, []);
  return <div className={`schedule-content schedule-month${compact ? ' schedule-compact' : ''}`}>
    {showTitle && <ScheduleHeading label={label} timeZone={timedZone(data)}/>}
    <div ref={grid} className="schedule-month-grid" role="grid" aria-label={label} style={{ '--schedule-weeks': weeks.length } as CSSProperties}>
      <div className="schedule-weekdays" role="row">{longNames.map((name, i) => <span key={name} role="columnheader"><span className="schedule-weekday-long">{name}</span><span className="schedule-weekday-short" aria-hidden="true">{shortNames[i]}</span></span>)}</div>
      {weeks.map((week, row) => { const allSpans = scheduleWeekSpans(week, data.events), spans = allSpans.filter(span => span.lane < 3), spanIds = new Set(allSpans.map(span => span.event.id)); const lanes = Math.max(0, ...spans.map(span => span.lane + 1)); return <div key={row} className="schedule-week-row" role="row" style={{ '--span-lanes': lanes } as CSSProperties}>{week.map((day, column) => {
        if (!day) return <div key={`pad-${column}`} style={{gridColumn:column+1}} className={`schedule-cell is-outside${column >= 5 ? ' is-weekend' : ''}`} role="gridcell" aria-hidden="true"/>;
        const events = index.get(day) ?? [];
        return <div key={day} style={{gridColumn:column+1}} data-day={day} role="gridcell" className={`schedule-cell${column >= 5 ? ' is-weekend' : ''}${day === today ? ' is-today' : ''}`} aria-label={`${dayName.format(utcDate(day))}${events.length ? `: ${events.map(event => event.title).join(', ')}` : ''}`}>
          <time className="schedule-date" dateTime={day}>{Number(day.slice(8))}</time>
          <ol className="schedule-cell-events">{events.filter(event => !spanIds.has(event.id)).map(event => <li key={event.id} className={`schedule-chip${event.allDay ? ' is-all-day' : ''}`} style={chipStyle(event)} title={event.title}>
            {!compact && !event.allDay && dateInTimeZone(event.start, data.timeZone) === day && <time dateTime={event.start}>{regionalTime(event.start,regional,data.timeZone)}</time>}<span>{event.title}</span>
          </li>)}</ol>
          <span className="schedule-more" data-hidden-spans={allSpans.filter(span => span.lane >= 3 && span.start <= column && column < span.end).length} aria-hidden="true"/>
        </div>;
      })}{spans.map(span => <div key={span.event.id} className={`schedule-chip schedule-span is-all-day${span.continuesBefore ? ' continues-before' : ''}${span.continuesAfter ? ' continues-after' : ''}`} data-event-id={span.event.id} style={{ ...chipStyle(span.event), gridColumn: `${span.start + 1} / ${span.end + 1}`, '--span-lane': span.lane } as CSSProperties} title={`${span.event.title} · ${span.event.start} – ${span.event.end}`}><span>{span.event.title}</span></div>)}</div>; })}
    </div>
    {outsideNote(data, indexedCount(index), 'month')}
  </div>;
}

/** Long-range overview: months as rows, day-of-month columns, colour swatches. */
function ScheduleMonths({ data, view, showTitle }: { data: ScheduleData; view: 'months' | 'year'; showTitle: boolean }) {
  const months = scheduleMonths(data.date, view, data.months ?? 6);
  const monthDays = months.map(month => scheduleDays(month, 'month'));
  const lastMonth = monthDays[monthDays.length - 1];
  const index = scheduleIndex(data.events, data.timeZone, true, months[0], lastMonth[lastMonth.length - 1]);
  const legend = scheduleLegend(data, index);
  const monthName = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', year: 'numeric' });
  const dayName = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const label = view === 'year' ? String(utcDate(months[0]).getUTCFullYear()) : months.length === 1 ? monthName.format(utcDate(months[0])) : `${monthName.format(utcDate(months[0]))} – ${monthName.format(utcDate(months[months.length - 1]))}`;
  return <div className="schedule-content schedule-months" style={{ '--schedule-rows': months.length } as CSSProperties}>
    {showTitle && <ScheduleHeading label={label}/>}
    <div className="schedule-year" role="table" aria-label={label}>
      <div className="schedule-year-row schedule-year-head" role="row"><span role="columnheader" className="schedule-year-corner"/>{Array.from({ length: 31 }, (_, i) => <span key={i} role="columnheader">{i + 1}</span>)}</div>
      {months.map((month, row) => <div key={month} className="schedule-year-row" role="row">
        <span role="rowheader" className="schedule-year-month">{monthName.format(utcDate(month))}</span>
        {Array.from({ length: 31 }, (_, column) => {
          const day = monthDays[row][column];
          if (!day) return <span key={column} role="cell" className="schedule-swatch is-void" aria-hidden="true"/>;
          const events = index.get(day) ?? [], name = `${dayName.format(utcDate(day))}${events.length ? `: ${events.map(event => event.title).join(', ')}` : ''}`;
          return <span key={day} role="cell" className={`schedule-swatch${weekdayIndex(day) >= 5 ? ' is-weekend' : ''}${events.length ? '' : ' is-empty'}`} title={name} aria-label={name}>{events.slice(0, 3).map(event => <i key={event.id} style={{ background: event.color ?? 'var(--accent)' }}/>)}</span>;
        })}
      </div>)}
    </div>
    {legend.length > 0 && <ul className="schedule-legend">{legend.map(item => <li key={`${item.color}\u0000${item.label}`}><i style={{ background: item.color }}/>{item.label}</li>)}</ul>}
    {outsideNote(data, indexedCount(index), view === 'year' ? 'year' : 'period')}
  </div>;
}

function countdownUnits(seconds: number | undefined) {
  const parts = countdownParts(seconds ?? 0);
  return [
    ...(parts.days ? [{ name: 'days', value: String(parts.days), separator: 'd ' }] : []),
    { name: 'hours', value: seconds === undefined ? '—' : String(parts.hours).padStart(2, '0'), separator: ':' },
    { name: 'minutes', value: seconds === undefined ? '—' : String(parts.minutes).padStart(2, '0'), separator: ':' },
    { name: 'seconds', value: seconds === undefined ? '—' : String(parts.seconds).padStart(2, '0'), separator: '' },
  ];
}

/** Fit the actual free timer area, not a guessed fraction of the viewport.
 * Glyph widths are measured from the receiving browser's font at 1px.
 */
export function fitCountdown(seconds: number | undefined, width: number, height: number, digitWidth = .64, separatorWidth = .3) {
  const units = countdownUnits(seconds), w = Math.max(1, width), h = Math.max(1, height);
  const portrait = h > w * 1.05;
  const hiddenHours = portrait && seconds !== undefined && units[0].name === 'hours' && units[0].value === '00';
  const visibleCount = units.length - (hiddenHours ? 1 : 0);
  const layout = portrait ? units.length === 4 ? 'grid' : 'stack' : 'row';
  const rows = layout === 'grid' ? 2 : layout === 'stack' ? visibleCount : 1;
  const columns = layout === 'grid' ? 2 : 1;
  const gap = layout === 'row' ? 0 : Math.min(20, w * .03, h * .025);
  const unitLabelSize = Math.min(26, Math.max(10, w * .04), h / rows * .14, w / (layout === 'row' ? units.length * 7.5 : columns * 7.5));
  const captionHeight = unitLabelSize * 1.65;
  const cellWidth = (w - gap * (columns - 1)) / columns;
  const cellHeight = (h - gap * (rows - 1)) / rows;
  const textWidth = units.reduce((total, unit) => total + unit.value.length * digitWidth + unit.separator.length * separatorWidth, 0);
  const rowFont = Math.max(1, Math.min(w / textWidth, h - captionHeight) * .96);
  const fontSizes = units.map(unit => hiddenHours && unit.name === 'hours' ? 0 : layout === 'row' ? rowFont : Math.max(1, Math.min(cellWidth / (unit.value.length * digitWidth), cellHeight - captionHeight) * .96));
  return { layout, rows, hiddenHours, fontSizes, unitLabelSize, gap };
}

export function CountdownRenderer({ data, serverNow, preview, showControls = false }: { data: CountdownData; serverNow?: string; preview?: boolean; showCaption?: boolean; showControls?: boolean }) {
  const regional=useRegional();
  const anchor = useRef<{ source: string; serverMs: number; monotonicMs: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<ReturnType<typeof fitCountdown>>();
  const [, tick] = useState(0);
  // Wall-clock adjustments on the receiving device must not move the timer.
  if (!serverNow || !isTimerTimestamp(serverNow)) anchor.current = null;
  else if (serverNow !== anchor.current?.source) anchor.current = { source: serverNow, serverMs: Date.parse(serverNow), monotonicMs: performance.now() };
  useEffect(() => {
    const clock = anchor.current;
    if (timerPausedSeconds(data) !== undefined || !clock) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timeout);
      tick(value => value + 1);
      const nowMs = clock.serverMs + performance.now() - clock.monotonicMs;
      // Recompute from the synchronized instant after throttling/suspension;
      // never decrement a local seconds counter or lose fractional seconds.
      const delay = timerNextTickDelay(data, nowMs);
      if (delay !== undefined) timeout = setTimeout(update, delay);
    };
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pageshow', update);
    return () => { clearTimeout(timeout); document.removeEventListener('visibilitychange', update); window.removeEventListener('pageshow', update); };
  }, [data.direction, data.endsAt, data.startedAt, data.pausedRemainingSeconds, data.pausedElapsedSeconds, serverNow]);
  const up = data.direction === 'up', pausedValue = timerPausedSeconds(data), paused = pausedValue !== undefined, clock = anchor.current;
  const clockMs = clock ? clock.serverMs + performance.now() - clock.monotonicMs : undefined;
  const phase = paused ? 'paused' : clockMs === undefined ? undefined : timerPhase(data, clockMs);
  const value = paused || clockMs !== undefined ? timerDisplaySeconds(data, clockMs ?? 0) : undefined;
  const instant = up ? data.startedAt : data.endsAt;
  const invalid = typeof instant !== 'string' || !isTimerTimestamp(instant) || value !== undefined && !Number.isFinite(value);
  // A future start is not elapsed time and is never converted into a countdown.
  const seconds = invalid || phase === 'scheduled' ? undefined : value;
  const units = countdownUnits(seconds), canonical = seconds === undefined ? '—:—:—' : formatCountdown(seconds);
  const shape = `${units.map(unit => unit.value.length).join(',')}:${seconds !== undefined && seconds < 3600}`;
  useLayoutEffect(() => {
    const target = frame.current;
    if (!target) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const { width, height } = target.getBoundingClientRect();
      const context = document.createElement('canvas').getContext('2d');
      if (context) context.font = `500 100px ${getComputedStyle(target).fontFamily}`;
      const glyphs = seconds === undefined ? '—' : '0123456789';
      const digit = context ? Math.max(...Array.from(glyphs, glyph => context.measureText(glyph).width)) / 100 : .64;
      const separator = context ? Math.max(...Array.from(':d ', glyph => context.measureText(glyph).width)) / 100 : .64;
      const next = fitCountdown(seconds, width, height, digit, separator);
      setFit(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(target);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { active = false; observer?.disconnect(); window.removeEventListener('resize', measure); };
    // Tabular glyph widths change only with unit count/digit count or layout.
  }, [shape]);
  const complete = !up && phase === 'complete' && !invalid;
  const invalidMessage = up ? 'Invalid count-up start time' : 'Invalid countdown time';
  const status = invalid ? invalidMessage : paused ? !up && seconds === 0 ? 'Paused · no time remaining' : 'Paused' : complete ? data.completeText ?? 'Time is up' : !clock ? preview ? up ? 'Count-up preview' : 'Countdown preview' : 'Syncing time…' : phase === 'scheduled' ? 'Not started yet' : up ? 'Elapsed time' : undefined;
  const style = { '--countdown-characters': canonical.length, '--countdown-rows': fit?.rows ?? 1, ...(fit ? { '--countdown-font': `${fit.fontSizes.find(size => size > 0) ?? 1}px`, '--countdown-unit-size': `${fit.unitLabelSize}px`, '--countdown-gap': `${fit.gap}px` } : {}) } as CSSProperties;
  return <div className={`countdown-content ${complete ? 'countdown-complete' : ''}`} data-direction={up ? 'up' : 'down'} data-phase={invalid ? 'invalid' : phase ?? 'syncing'}>
    {data.label && <p className="countdown-label">{data.label}</p>}
    <div className="countdown-clock" ref={frame}>
      <div className="countdown-digits" data-layout={fit?.layout ?? 'row'} data-duration={canonical} data-seconds={seconds} role="timer" aria-live="off" aria-label={invalid ? invalidMessage : phase === 'scheduled' ? 'Count-up has not started yet' : seconds === undefined ? 'Waiting for server time' : `${seconds} seconds ${up ? 'elapsed' : 'remaining'}${paused ? ', paused' : ''}`} style={style}>
        {units.map((unit, index) => <span className={`countdown-pair ${fit?.hiddenHours && unit.name === 'hours' ? 'countdown-leading-zero' : ''}`} key={unit.name} aria-hidden="true">
          <span className="countdown-unit" data-unit={unit.name}><span className="countdown-value" style={fit ? { fontSize: fit.fontSizes[index] } : undefined}>{unit.value}</span></span><span className="countdown-separator">{unit.separator}</span>
        </span>)}
      </div>
    </div>
    {status ? <p className="countdown-status" role="status">{status}</p> : <span className="sr-only">Server-synced countdown</span>}
    {showControls && <details className="supplementary-details countdown-detail"><summary>{paused ? 'Timer details' : up ? 'Start time' : 'End time'}</summary>{paused ? <p>Paused with {pausedValue} seconds {up ? 'elapsed. The timing anchor will be adjusted on resume.' : 'remaining. The stored end time will be recalculated on resume.'}</p> : up ? <p>{phase === 'scheduled' ? 'Starts' : 'Started'} <time dateTime={data.startedAt}>{regionalDateTime(data.startedAt!,regional)}</time></p> : <p>Ends <time dateTime={data.endsAt}>{regionalDateTime(data.endsAt!,regional)}</time></p>}</details>}
  </div>;
}
