import {useEffect,useMemo,useRef,useState} from 'react';
import type {RendererProps} from './Renderer';
import {api,displayPath} from '../api';
import {selectRows} from '../../shared/selection';
import {formatDuration,monitorStreamDataSchema,streamRows,type StreamRow,type StreamViewEvent,type StreamViewStatus} from '../../shared/monitor-stream-view';
import './monitor-stream.css';

interface StreamSnapshot { status: StreamViewStatus; events: StreamViewEvent[]; lastSeq: number; firstSeq: number; serverNow: string }

const clock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour12: false }); };

const STATE_LABEL: Record<StreamViewStatus['state'], string> = { active: 'Live', expired: 'Expired', revoked: 'Revoked', ended: 'Ended' };

const ROW_LABEL: Record<StreamRow['status'], string> = { event: '', running: 'running', completed: 'done', failed: 'failed', unknown: 'no result' };

/** A screen bound to a monitor stream. It asks the server and waits; the answer
 * comes back the moment an event arrives, so rows appear without the agent. */
export function MonitorStreamView(props: RendererProps) {
  const data = useMemo(() => monitorStreamDataSchema.parse(props.view.data), [props.view.data]);
  const [events, setEvents] = useState<StreamViewEvent[]>([]), [status, setStatus] = useState<StreamViewStatus>(), [problem, setProblem] = useState(''), [, tick] = useState(0);
  const path = props.publicStreamPath ?? (props.sessionId && props.displayId ? `${displayPath(props.sessionId, props.displayId)}/monitor-stream` : undefined);
  useEffect(() => {
    setEvents([]); setStatus(undefined); setProblem('');
    if (props.preview || !path) return;
    let live = true, after = 0, failures = 0, timer: ReturnType<typeof setTimeout> | undefined; const controller = new AbortController();
    const load = async (wait: boolean) => {
      if (!live) return;
      const asked = Date.now();
      try {
        const next = await api<StreamSnapshot>(`${path}?streamId=${encodeURIComponent(data.streamId)}&afterSeq=${after}&limit=${data.limit}${wait ? '&wait=1' : ''}`, { signal: controller.signal });
        if (!live) return; failures = 0; setProblem(''); setStatus(next.status);
        if (next.status.state === 'revoked' || next.status.state === 'ended') setEvents([]);
        else if (next.events.length) { after = next.events.at(-1)!.seq; setEvents(prior => [...prior, ...next.events].filter(e => e.seq >= next.firstSeq || next.status.state !== 'active').slice(-data.limit)); }
        else if (next.status.state === 'active') setEvents(prior => prior.filter(e => e.seq >= next.firstSeq));
        // An ended stream is checked again slowly: nothing more can arrive on it.
        // The server holds the request until something happens. When it answers at once with nothing
        // (its waiting places are taken) the screen asks again at a calm pace instead of spinning.
        const immediate = wait && !next.events.length && Date.now() - asked < 1000;
        timer = setTimeout(() => void load(true), next.status.state !== 'active' ? 30_000 : immediate ? 1500 : 0);
      } catch { if (!live) return; failures++; if (failures > 2) setProblem('Reconnecting to the stream…'); timer = setTimeout(() => void load(false), Math.min(15_000, 1000 * 2 ** Math.min(failures, 4))); }
    };
    void load(false);
    const second = setInterval(() => tick(v => v + 1), 1000);
    return () => { live = false; controller.abort(); clearTimeout(timer); clearInterval(second); };
  }, [path, data.streamId, data.limit, props.preview]);
  const active = status?.state === 'active';
  const rows = useMemo(() => { const all = streamRows(events, active); return props.view.selection ? selectRows(all, props.view.selection).map(x => ({ ...(x.value as StreamRow), highlighted: x.highlighted })) : all.map(row => ({ ...row, highlighted: false })); }, [events, active, props.view.selection]);
  const sources = useMemo(() => [...new Set(streamRows(events, active).map(r => r.source).filter(Boolean))].sort(), [events, active]);
  const ready = useRef(false); useEffect(() => { if (!ready.current && (status || props.preview || !path)) { ready.current = true; props.onReady?.(); } });
  const ended = status && !active;
  const expiresIn = active && status?.expiresAt ? Math.max(0, Date.parse(status.expiresAt) - Date.now()) : 0;
  return <div className={`monitor-stream state-${status?.state ?? 'loading'}`} data-stream-state={status?.state ?? 'loading'}>
    <header className="monitor-stream-head">
      <div className="monitor-stream-title"><span className={`monitor-stream-state state-${status?.state ?? 'loading'}`}>{status ? STATE_LABEL[status.state] : props.preview ? 'Preview' : 'Connecting'}</span><h2>{data.title ?? status?.name ?? 'Monitor stream'}</h2></div>
      {status && <dl className="monitor-stream-counters">
        <div><dt>Received</dt><dd data-counter="received">{status.received}</dd></div>
        <div><dt>Buffered</dt><dd data-counter="buffered">{status.buffered}</dd></div>
        <div className={status.dropped ? 'is-warn' : ''}><dt>Dropped</dt><dd data-counter="dropped">{status.dropped}</dd></div>
        <div className={status.rejected ? 'is-warn' : ''}><dt>Rejected</dt><dd data-counter="rejected">{status.rejected}</dd></div>
        {status.lastEventAt && <div><dt>Last event</dt><dd>{clock(status.lastEventAt)}</dd></div>}
        {active && status.expiresAt && <div className={expiresIn < 5 * 60_000 ? 'is-warn' : ''}><dt>Expires</dt><dd>{clock(status.expiresAt)}</dd></div>}
      </dl>}
    </header>
    {data.note && <p className="monitor-stream-note">{data.note}</p>}
    {ended && <p className="monitor-stream-ended" role="status">{status.state === 'expired' ? `This stream expired${status.endedAt ? ` at ${clock(status.endedAt)}` : ''}. No more events will arrive${events.length ? '; the rows below are the last ones received and stay until this screen reloads' : ''}.` : status.state === 'revoked' ? `This stream was revoked${status.endedAt ? ` at ${clock(status.endedAt)}` : ''}. Its events were deleted and no more will arrive.` : 'This stream has ended or is no longer available. No events will arrive.'}</p>}
    {problem && <p className="monitor-stream-problem" role="status">{problem}</p>}
    {sources.length > 1 && <ul className="monitor-stream-sources" aria-label="Sources">{sources.map(source => <li key={source} style={{ borderColor: sourceColour(source) }}>{source}</li>)}</ul>}
    <div className="monitor-stream-rows" data-navigation-scroll>
      {!rows.length && !ended && <p className="content-empty">{props.preview ? 'Events appear here as they arrive.' : status ? (events.length ? 'No event matches the current filter.' : 'Waiting for the first event.') : 'Connecting…'}</p>}
      <ol>{rows.map(row => <li key={row.key} className={`stream-row status-${row.status}${row.highlighted ? ' is-highlighted' : ''}`} data-row-status={row.status} style={{ borderLeftColor: sourceColour(row.source) }}>
        <time dateTime={row.at} title={`Received ${clock(row.receivedAt)}`}>{clock(row.at)}{row.lagSeconds !== undefined && <small> {row.lagSeconds > 0 ? `received +${row.lagSeconds}s` : `clock ${-row.lagSeconds}s ahead`}</small>}</time>
        {row.source && <span className="stream-source">{row.source}</span>}
        <span className="stream-what"><strong>{row.tool || row.event || 'event'}</strong>{row.tool && row.event && <em> {row.event}</em>}{row.target && <code>{row.target}</code>}{row.note && <span className="stream-note">{row.note}</span>}</span>
        <span className="stream-outcome">{row.durationMs !== undefined && <b>{formatDuration(row.durationMs)}</b>}{ROW_LABEL[row.status] && <i>{row.status === 'running' ? `running ${formatDuration(Math.max(0, Date.now() - Date.parse(row.at)))}` : ROW_LABEL[row.status]}</i>}</span>
      </li>)}</ol>
    </div>
  </div>;
}

const SOURCE_COLOURS = ['#4c9be8', '#e0723c', '#56b881', '#b77ce0', '#d8b23c', '#e06c9a', '#4cc2c4', '#9aa7b8'];

function sourceColour(source: string) { let h = 0; for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0; return source ? SOURCE_COLOURS[h % SOURCE_COLOURS.length] : 'var(--line)'; }
