import { useRegional } from './Regional';
import { regionalClock, regionalDateTime, type RegionalPreferences } from '../../shared/regional';
import { useMemo, useState, useLayoutEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import type { RendererProps } from './Renderer';
import { monthWeeks, scheduleDays, scheduleWeekSpans } from './Time';
import { categoricalColor } from './chart-palette';
import { errorMessage } from '../api';
import { calendarDataSchema, plannerConflicts, plannerDataSchema, plannerLocalTime, proposalImpact, proposalWarnings, type PlannerData, type PlannerItem, type PlannerProposal } from '../../shared/planner';
import './planner.css';

/** Weather labels share a finite day column. Pack nearby marks without growing
 * the timeline; preserve all values and keep solar marks inside the final hour. */
function WeatherStrip({day,children}:{day:string;children:ReactNode}){
  const root=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const el=root.current;if(!el)return;
    const arrange=()=>{const marks=[...el.children] as HTMLElement[];if(!marks.length||!el.clientHeight)return;
      marks.sort((a,b)=>Number(a.dataset.position)-Number(b.dataset.position));
      marks.forEach(mark=>{mark.style.transform='';});
      const heights=marks.map(mark=>mark.offsetHeight),total=heights.reduce((a,b)=>a+b+2,0),scale=Math.min(1,el.clientHeight/total);
      let end=0;const tops=marks.map((mark,i)=>{const top=Math.max(end,Number(mark.dataset.position)*el.clientHeight);end=top+heights[i]*scale+2*scale;return top;});
      end=el.clientHeight;for(let i=marks.length-1;i>=0;i--){tops[i]=Math.min(tops[i],end-heights[i]*scale);end=tops[i]-2*scale;}
      marks.forEach((mark,i)=>{mark.style.top=`${Math.max(0,tops[i])}px`;mark.style.transform=`scale(${scale})`;mark.style.transformOrigin='top center';});
    };arrange();const observer=new ResizeObserver(arrange);observer.observe(el);return()=>observer.disconnect();
  },[children]);
  return <div ref={root} className="planner-weather" aria-label={`Supplied forecast for ${day}`}>{children}</div>;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayLabel = (date: string) => `${WEEKDAYS[weekday(date)]} ${Number(date.slice(8))}`;

type BlockState = 'current' | 'struck' | 'proposed';
export interface PlannerBlock { key: string; item: PlannerItem; state: BlockState; proposal?: PlannerProposal; conflict: boolean }

/** Items plus proposal placements: an item with a pending move or remove is
 * struck through; a move or add also appears at its proposed placement. */
export function plannerBlocks(data: PlannerData): PlannerBlock[] {
  const conflicted = new Set(plannerConflicts(data.items).flatMap(conflict => conflict.withItemId ? [conflict.itemId, conflict.withItemId] : [conflict.itemId]));
  const targeted = new Map(data.proposals.filter(proposal => proposal.action !== 'add').map(proposal => [proposal.itemId, proposal] as const));
  const blocks = data.items.map((item): PlannerBlock => ({ key: item.id, item, state: targeted.has(item.id) ? 'struck' : 'current', proposal: targeted.get(item.id), conflict: conflicted.has(item.id) }));
  for (const proposal of data.proposals) {
    if (proposal.action === 'remove') continue;
    const { after } = proposalImpact(data.items, proposal);
    if (after) blocks.push({ key: `proposal:${proposal.id}`, item: after, state: 'proposed', proposal, conflict: false });
  }
  return blocks;
}

/** Side-by-side lanes for blocks that overlap within one day column. */
export function layoutDay<T extends { start: number; end: number }>(entries: readonly T[]): (T & { lane: number; lanes: number })[] {
  const placed: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [], ends: number[] = [], clusterEnd = Number.NEGATIVE_INFINITY;
  const close = () => { for (const entry of cluster) entry.lanes = ends.length; placed.push(...cluster); cluster = []; ends = []; };
  for (const entry of [...entries].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (entry.start >= clusterEnd) close();
    let lane = ends.findIndex(end => end <= entry.start);
    if (lane < 0) { lane = ends.length; ends.push(entry.end); } else ends[lane] = entry.end;
    cluster.push({ ...entry, lane, lanes: 1 });
    clusterEnd = cluster.length === 1 ? entry.end : Math.max(clusterEnd, entry.end);
  }
  close();
  return placed;
}

function palette(data: PlannerData) {
  const named = new Map<string, string>();
  for (const category of data.categories ?? []) if (category.color) { named.set(category.id, category.color); named.set(category.label, category.color); }
  const order = [...new Set(data.items.map(item => item.category).filter((value): value is string => Boolean(value)))];
  return (item: PlannerItem) => item.color ?? (item.category ? named.get(item.category) ?? categoricalColor(order.includes(item.category) ? order.indexOf(item.category) : order.length) : 'var(--accent)');
}

function when(item: PlannerItem, timeZone: string, regional?:RegionalPreferences): string {
  const clock=(minutes:number)=>regionalClock(minutes,regional);
  if (item.allDay) {
    const last = shiftDay(item.end, -1);
    return last === item.start ? `${dayLabel(item.start)} · all day` : `${dayLabel(item.start)} – ${dayLabel(last)}`;
  }
  const start = plannerLocalTime(item.start, timeZone), end = plannerLocalTime(item.end, timeZone);
  return `${dayLabel(start.date)} · ${clock(start.minutes)}–${end.date === start.date ? clock(end.minutes) : `${dayLabel(end.date)} ${clock(end.minutes)}`}`;
}

function BlockView({ block, color, style, time, compact = false }: { block: PlannerBlock; color: string; style?: CSSProperties; time?: string; compact?: boolean }) {
  const badge = block.state === 'struck' ? (block.proposal?.action === 'remove' ? 'Remove?' : 'Moving') : block.state === 'proposed' ? (block.proposal?.action === 'add' ? 'New' : 'Proposed') : undefined;
  return <div className={`planner-block is-${block.state}${block.conflict ? ' is-conflict' : ''}${compact ? ' is-compact' : ''}`} style={{ ...style, '--planner-color': color } as CSSProperties}
    data-item-id={block.item.id} data-proposal-id={block.proposal?.id} title={[block.item.title, time, block.state === 'proposed' ? block.proposal?.reason : undefined].filter(Boolean).join(' · ')}>
    <strong>{block.conflict && <span className="planner-warn" aria-label="Conflict">⚠ </span>}{block.item.title}</strong>
    {time && <span className="planner-time">{time}</span>}
    {badge && !compact && <span className="planner-badge">{badge}</span>}
    {block.state === 'proposed' && !compact && block.proposal && <span className="planner-reason">{block.proposal.reason}</span>}
  </div>;
}

function TimeGrid({ data, blocks, colorOf }: { data: PlannerData; blocks: PlannerBlock[]; colorOf: (item: PlannerItem) => string }) {
  const regional=useRegional(),clock=(minutes:number)=>regionalClock(minutes,regional);
  const days = scheduleDays(data.anchorDate, data.view === 'month' ? 'week' : data.view), visible = new Set(days);
  const timed = new Map<string, (PlannerBlock & { start: number; end: number; continues: boolean })[]>();
  let from = 7 * 60, to = 21 * 60;
  for (const block of blocks) {
    if (block.item.allDay) continue;
    const start = plannerLocalTime(block.item.start, data.timeZone), end = plannerLocalTime(block.item.end, data.timeZone);
    for (const day of visible) {
      if (day < start.date || day > end.date || day === end.date && end.minutes === 0) continue;
      const begin = day === start.date ? start.minutes : 0;
      const stop = day === end.date ? Math.max(end.minutes, begin + 15) : 1440;
      timed.set(day, [...(timed.get(day) ?? []), { ...block, start: begin, end: stop, continues: end.date > day }]);
      from = Math.min(from, Math.floor(begin / 60) * 60); to = Math.max(to, Math.ceil(stop / 60) * 60);
    }
  }
  for(const entry of data.weather??[]) for(const value of [entry.time,entry.sunrise,entry.sunset]) if(value){const local=plannerLocalTime(value,data.timeZone);if(visible.has(local.date)){from=Math.min(from,Math.floor(local.minutes/60)*60);to=Math.max(to,Math.ceil((local.minutes+1)/60)*60);}}
  to = Math.min(to, 1440);
  const span = to - from, hours = Array.from({ length: span / 60 }, (_, index) => from + index * 60), at = (minutes: number) => `${((minutes - from) / span) * 100}%`;
  const allDay = days.map(day => blocks.filter(block => block.item.allDay && block.item.start <= day && day < block.item.end));
  const columns = { '--planner-days': days.length, '--weather-hours':span/60 } as CSSProperties;
  return <div className={`planner-grid${data.weather?.length?' with-weather':''} view-${data.view}`} data-navigation-scroll role="group" aria-label={data.view === 'day' ? 'Day plan' : data.view === 'three-day' ? 'Three-day plan' : 'Week plan'}>
    <div className="planner-row planner-heads" style={columns}><span className="planner-gutter" />{days.map(day => <div key={day} className={`planner-day-head${weekday(day) > 4 ? ' is-weekend' : ''}`}><span>{WEEKDAYS[weekday(day)]}</span><strong>{Number(day.slice(8))}</strong></div>)}</div>
    {allDay.some(list => list.length > 0) && <div className="planner-row planner-allday-row" style={columns}><span className="planner-gutter">All day</span>
      {days.map((day, index) => <div key={day} className="planner-allday">{(allDay[index] ?? []).map(block => <BlockView key={block.key} block={block} color={colorOf(block.item)} compact />)}</div>)}</div>}
    <div className="planner-row planner-body" style={columns}>
      <div className="planner-gutter planner-hours">{hours.map(hour => <span key={hour} style={{ top: at(hour) }}>{clock(hour)}</span>)}</div>
      {days.map(day => <div key={day} data-day={day} className={`planner-column${weekday(day) > 4 ? ' is-weekend' : ''}${data.weather?.length ? ' has-weather' : ''}`}>
        {Boolean(data.weather?.length) && <WeatherStrip day={day}>
          {(data.weather ?? []).flatMap((entry,index) => {
            const local=plannerLocalTime(entry.time,data.timeZone),marks=[];
            if(local.date===day && local.minutes>=from && local.minutes<to) marks.push(<span className="weather-point" data-position={(local.minutes-from)/span} key={`weather-${index}`} style={{top:`clamp(0px, ${at(local.minutes)}, calc(100% - 72px))`}} title={`${clock(local.minutes)} · ${entry.condition} · ${entry.temperature}°${entry.unit}`}><b className={`weather-icon is-${entry.condition}`} aria-label={entry.condition}>{({sun:'☀', 'partly-cloudy':'⛅', cloudy:'☁', rain:'🌧', snow:'❄', thunderstorm:'⛈'})[entry.condition]}</b><span>{entry.temperature}°</span>{entry.precipitationChance!==undefined&&<small>{entry.precipitationChance}%</small>}{entry.wind&&<small className="weather-wind" title="Wind">{entry.wind.direction} {entry.wind.speed} {entry.wind.unit}</small>}</span>);
            for(const kind of ['sunrise','sunset'] as const){const stamp=entry[kind];if(!stamp || data.weather!.slice(0,index).some(x=>x[kind]===stamp))continue;const time=plannerLocalTime(stamp,data.timeZone);if(time.date===day&&time.minutes>=from&&time.minutes<to)marks.push(<span className="weather-solar" data-position={(time.minutes-from)/span} key={`${kind}-${stamp}`} style={{top:`clamp(0px, ${at(time.minutes)}, calc(100% - 42px))`}} title={`${kind} ${clock(time.minutes)}`}><b aria-label={kind}>{kind==='sunrise'?'🌅':'🌇'}</b><small>{clock(time.minutes)}</small></span>);}
            return marks;
          })}
        </WeatherStrip>}
        {hours.map(hour => <i key={hour} className="planner-hour-line" style={{ top: at(hour) }} />)}
        {layoutDay(timed.get(day) ?? []).map(block => <BlockView key={block.key} block={block} color={colorOf(block.item)} compact={data.view === 'day' || data.view === 'three-day'} time={`${clock(block.start)}–${block.continues ? '…' : clock(block.end)}`}
          style={{ top: `min(${at(block.start)}, calc(100% - 1.6em))`, height: `${((block.end - block.start) / span) * 100}%`, left: `calc((100% - ${data.weather?.length ? 'var(--weather-width)' : '0px'}) * ${block.lane / block.lanes})`, width: `calc((100% - ${data.weather?.length ? 'var(--weather-width)' : '0px'}) / ${block.lanes})` }} />)}
      </div>)}
    </div>
  </div>;
}

export function plannerWeekSpans(week:(string|null)[],blocks:PlannerBlock[]) {
  return scheduleWeekSpans(week,blocks.filter(b=>b.item.allDay).map(b=>({...b.item,id:b.key,allDay:true}))).map(span=>({...span,block:blocks.find(b=>b.key===span.event.id)!}));
}
function MonthGrid({ data, blocks, colorOf }: { data: PlannerData; blocks: PlannerBlock[]; colorOf: (item: PlannerItem) => string }) {
  const regional=useRegional(),clock=(minutes:number)=>regionalClock(minutes,regional);
  const weeks=monthWeeks(data.anchorDate);
  return <div className="planner-month" role="group" aria-label="Month plan"><div className="planner-month-head">{WEEKDAYS.map(name=><span key={name}>{name}</span>)}</div>
    <div className="planner-weeks" style={{gridTemplateRows:`repeat(${weeks.length},minmax(0,1fr))`}}>{weeks.map((week,row)=>{
      const spans=plannerWeekSpans(week,blocks),ids=new Set(spans.map(s=>s.block.key)),shown=spans.filter(s=>s.lane<3),lanes=Math.max(0,...shown.map(s=>s.lane+1));
      return <div className="planner-week-row" key={row} style={{'--span-lanes':lanes} as CSSProperties}>{week.map((day,column)=>{
        if(!day)return <div key={column} className="planner-cell is-outside" style={{gridColumn:column+1}}/>;
        const entries=blocks.filter(b=>!ids.has(b.key)&&(b.item.allDay?b.item.start===day:plannerLocalTime(b.item.start,data.timeZone).date===day));
        const hidden=spans.filter(s=>s.lane>=3&&s.start<=column&&column<s.end).length+Math.max(0,entries.length-3);
        return <div key={day} className="planner-cell" data-day={day} style={{gridColumn:column+1}}><span className="planner-cell-date">{Number(day.slice(8))}</span><div className="planner-cell-entries">{entries.slice(0,3).map(block=><BlockView key={block.key} block={block} color={colorOf(block.item)} time={block.item.allDay?undefined:clock(plannerLocalTime(block.item.start,data.timeZone).minutes)} compact/>)}</div>{hidden>0&&<span className="planner-more">+{hidden} more</span>}</div>;
      })}{shown.map(span=><div key={span.block.key} className="planner-span" data-event-id={span.block.item.id} style={{gridColumn:`${span.start+1} / ${span.end+1}`,'--span-lane':span.lane} as CSSProperties}><BlockView block={span.block} color={colorOf(span.block.item)} compact/></div>)}</div>;
    })}</div></div>;
}

function Proposals({ data, actionable, onRespond }: { data: PlannerData; actionable: boolean; onRespond?: RendererProps['onRespond'] }) {
  const regional=useRegional(),clock=(minutes:number)=>regionalClock(minutes,regional);
  const [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  if (!data.proposals.length) return null;
  const decide = async (proposalId: string, decision: 'accept' | 'reject' | 'change') => {
    if (!onRespond || busy) return;
    setBusy(proposalId); setMessage(null);
    try {
      await onRespond({ kind: 'planner.review', proposalId, decision });
      if (decision === 'change') setMessage('Sent. The agent can propose another option.');
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(null); }
  };
  return <section className="planner-proposals" aria-label="Proposed changes"><h3>Proposed changes</h3>
    <ol>{data.proposals.map(proposal => {
      const { before, after } = proposalImpact(data.items, proposal), warnings = proposalWarnings(data, proposal);
      return <li key={proposal.id} className={`planner-proposal is-${proposal.action}`} data-proposal-id={proposal.id}>
        <div className="planner-proposal-head"><span className="planner-badge">{proposal.action === 'move' ? 'Move' : proposal.action === 'add' ? 'Add' : 'Remove'}</span><strong>{(after ?? before)?.title ?? proposal.itemId}</strong></div>
        <div className="planner-proposal-when">{before && <del>{when(before, data.timeZone,regional)}</del>}{after && <ins>{when(after, data.timeZone,regional)}</ins>}</div>
        <p>{proposal.reason}</p>
        {warnings.map(warning => <p key={warning} className="planner-warning">⚠ {warning}</p>)}
        {actionable && onRespond && <div className="planner-actions">
          <button type="button" disabled={Boolean(busy)} onClick={() => void decide(proposal.id, 'accept')}>Accept</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void decide(proposal.id, 'reject')}>Reject</button>
          <button type="button" className="is-quiet" disabled={Boolean(busy)} onClick={() => void decide(proposal.id, 'change')}>Ask for another option</button>
        </div>}
      </li>;
    })}</ol>
    {message && <p className="planner-message" role="status">{message}</p>}
  </section>;
}

function Conflicts({ data }: { data: PlannerData }) {
  const conflicts = plannerConflicts(data.items);
  if (!conflicts.length) return null;
  return <section className="planner-conflicts" aria-label="Conflicts"><h3>Conflicts</h3>
    <ul>{conflicts.slice(0, 8).map((conflict, index) => <li key={`${conflict.kind}-${conflict.itemId}-${index}`}>⚠ {conflict.message}</li>)}{conflicts.length > 8 && <li>+{conflicts.length - 8} more</li>}</ul>
  </section>;
}

export function PlannerRenderer({ view, actionable = false, onRespond }: RendererProps) {
  const regional=useRegional(),clock=(minutes:number)=>regionalClock(minutes,regional);
  const parsed = useMemo(() => plannerDataSchema.safeParse(view.data), [view.data]);
  if (!parsed.success) return <div className="planner planner-invalid">This plan could not be shown.</div>;
  const data = parsed.data, blocks = plannerBlocks(data), colorOf = palette(data), conflicts = plannerConflicts(data.items).length, committed = data.status === 'committed';
  const first = data.view === 'week' ? scheduleDays(data.anchorDate, 'week')[0] ?? data.anchorDate : data.anchorDate;
  const period = new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'long', year: 'numeric', ...(data.view === 'month' ? {} : { day: 'numeric' }) }).format(new Date(`${first}T00:00:00Z`));
  const confirmed = committed && data.committedAt ? plannerLocalTime(data.committedAt, data.timeZone) : undefined;
  return <div className={`planner is-${data.status}`}>
    <header className={`planner-banner is-${data.status}`}>
      <span className="planner-status">{committed ? 'Committed plan' : 'Draft plan'}</span>
      <span>{committed ? `Confirmed${confirmed ? ` ${regionalDateTime(data.committedAt!,regional,data.timeZone)}` : ''}` : 'Nothing is final until you confirm.'}</span>
      <span className="planner-counts">{data.proposals.length === 1 ? '1 proposal' : `${data.proposals.length} proposals`} · {conflicts === 1 ? '1 conflict' : `${conflicts} conflicts`}</span>
      <span className="planner-period">{data.view === 'week' ? `Week of ${period}` : period}</span>
    </header>
    <div className="planner-main">
      <div className="planner-calendar">
        {data.view === 'month' ? <MonthGrid data={data} blocks={blocks} colorOf={colorOf} /> : <TimeGrid data={data} blocks={blocks} colorOf={colorOf} />}
        <div className="planner-legend" aria-hidden="true"><span><i className="is-proposed" />Proposed</span><span><i className="is-struck" />Being changed</span><span><i className="is-conflict" />Conflict</span>
          {(data.categories ?? []).map(category => <span key={category.id}><i style={{ background: category.color ?? 'var(--accent)' }} />{category.label}</span>)}</div>
      </div>
      {(data.proposals.length > 0 || conflicts > 0) && <aside className="planner-side"><Proposals data={data} actionable={actionable} onRespond={onRespond} /><Conflicts data={data} /></aside>}
    </div>
  </div>;
}

/** Reuse the calendar grid without manufacturing a planning workflow or conflict warnings. */
export function CalendarRenderer({ view }: RendererProps) {
  const parsed = calendarDataSchema.safeParse(view.data);
  if (!parsed.success) return <div className="planner planner-invalid">This calendar could not be shown.</div>;
  const data: PlannerData = { ...parsed.data, status: 'draft', proposals: [] };
  const blocks: PlannerBlock[] = data.items.map(item => ({ key: item.id, item, state: 'current', conflict: false }));
  const colorOf = palette(data);
  return <div className="planner calendar-readonly"><div className="planner-calendar">
    {data.view === 'month' ? <MonthGrid data={data} blocks={blocks} colorOf={colorOf} /> : <TimeGrid data={data} blocks={blocks} colorOf={colorOf} />}
    {!!data.categories?.length && <div className="planner-legend">{data.categories.map(category => <span key={category.id}><i style={{ background: category.color ?? 'var(--accent)' }} />{category.label}</span>)}</div>}
  </div></div>;
}
