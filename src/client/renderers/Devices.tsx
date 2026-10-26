import { useRegional } from './Regional';
import { regionalDateTime, type RegionalPreferences } from '../../shared/regional';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { RendererProps } from './Renderer';
import { browserKind, deviceKind, type BrowserKind, type DeviceKind, type DevicesViewData } from '../../shared/devices-view';
import './devices.css';

type DeviceItem = DevicesViewData['devices'][number];
type WindowItem = DeviceItem['windows'][number];
interface SessionStyle { label: string; color?: string }
const SESSION_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#a78bfa', '#2dd4bf', '#facc15', '#f87171'];
const BROWSER_COLORS: Record<BrowserKind, string | undefined> = { chrome: '#4285f4', safari: '#1a9fe0', firefox: '#ff7139', edge: '#0c9fd8', opera: '#ff1b2d', other: undefined };
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const absoluteFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Glyph({ className, color, children }: { className: string; color?: string; children: ReactNode }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={color ? { color } : undefined}>{children}</svg>;
}
export function DeviceGlyph({ kind }: { kind: DeviceKind }) {
  const c = 'devices-glyph';
  switch (kind) {
    case 'phone': return <Glyph className={c}><rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M10.5 18.5h3"/></Glyph>;
    case 'tablet': return <Glyph className={c}><rect x="4" y="3" width="16" height="18" rx="2.2"/><path d="M11 18h2"/></Glyph>;
    case 'laptop': return <Glyph className={c}><rect x="4.5" y="5" width="15" height="10" rx="1.3"/><path d="M2.5 18.5h19"/></Glyph>;
    case 'tv': return <Glyph className={c}><rect x="2.5" y="4.5" width="19" height="12" rx="1.5"/><path d="M8.5 20.5 10 16.5M15.5 20.5 14 16.5"/></Glyph>;
    case 'desktop': return <Glyph className={c}><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></Glyph>;
    default: return <Glyph className={c}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/></Glyph>;
  }
}
/** Simplified, generic browser glyphs (not the vendors' logos). */
export function BrowserGlyph({ kind }: { kind: BrowserKind }) {
  const c = 'devices-browser', color = BROWSER_COLORS[kind];
  switch (kind) {
    case 'chrome': return <Glyph className={c} color={color}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.3" fill="currentColor" stroke="none"/><path d="M12 8.7h8.6M9.2 13.6 4.9 6.2M14.8 13.6 10.5 21"/></Glyph>;
    case 'safari': return <Glyph className={c} color={color}><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2Z" fill="currentColor" stroke="none"/></Glyph>;
    case 'firefox': return <Glyph className={c} color={color}><circle cx="12" cy="12" r="9"/><path d="M7.5 9.5c.6 3.8 3.4 6 6.6 5.4 2.6-.5 3.8-3 3-5.3-.9 1.6-2.3 2.1-3.4 1.7 1.2-1.7.5-4-1.5-5"/></Glyph>;
    case 'edge': return <Glyph className={c} color={color}><circle cx="12" cy="12" r="9"/><path d="M5 13.5c1-3.5 4.4-5.4 7.6-4.9 2.6.4 4.4 2.3 4.4 4.4 0 1.3-1 2.2-2.4 2.2h-6c.4 1.9 2.2 3.3 4.6 3.3 1.4 0 2.6-.4 3.6-1"/></Glyph>;
    case 'opera': return <Glyph className={c} color={color}><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4.6" ry="8"/></Glyph>;
    default: return <Glyph className={c}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.8 2.8 15.2 0 18M12 3c-2.8 2.8-2.8 15.2 0 18"/></Glyph>;
  }
}
function seen(iso: string | undefined, now: number,regional?:RegionalPreferences): { text: string; title: string } | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso); if (!Number.isFinite(time)) return undefined;
  const seconds = Math.round((time - now) / 1000), minutes = Math.round(seconds / 60), hours = Math.round(minutes / 60), days = Math.round(hours / 24);
  const title = regionalDateTime(iso,regional);
  const text = Math.abs(seconds) < 60 ? relativeFormat.format(0, 'second') : Math.abs(minutes) < 60 ? relativeFormat.format(minutes, 'minute') : Math.abs(hours) < 36 ? relativeFormat.format(hours, 'hour') : Math.abs(days) < 45 ? relativeFormat.format(days, 'day') : title;
  return { text, title };
}
/** Sessions shown by several windows share a colour; one-off sessions stay neutral. */
function sessionStyles(devices: DeviceItem[]): Map<string, SessionStyle> {
  const counts = new Map<string, number>(), names = new Map<string, string>();
  for (const device of devices) for (const window of device.windows) if (window.sessionId) { counts.set(window.sessionId, (counts.get(window.sessionId) ?? 0) + 1); if (window.sessionName) names.set(window.sessionId, window.sessionName); }
  let next = 0; const styles = new Map<string, SessionStyle>();
  for (const [id, count] of counts) styles.set(id, { label: names.get(id) ?? `Session ${id.slice(0, 6)}`, ...(count > 1 ? { color: SESSION_COLORS[next++ % SESSION_COLORS.length] } : {}) });
  return styles;
}
const Dot = ({ on }: { on?: boolean }) => <span className={`devices-dot${on ? ' is-on' : ''}`} aria-hidden="true"/>;
function SessionChip({ window, styles }: { window: WindowItem; styles: Map<string, SessionStyle> }) {
  if (!window.sessionId) return <span className="devices-session is-none">No session</span>;
  const style = styles.get(window.sessionId);
  return <span className={`devices-session${style?.color ? ' is-shared' : ''}`} style={style?.color ? { '--session-color': style.color } as CSSProperties : undefined} title={style?.color ? 'Session shown by several windows' : undefined}>{style?.label}{window.displayName && <small>· {window.displayName}</small>}</span>;
}

/** Which of the account's devices and browser windows are online, and where they point. */
export function DevicesRenderer({ view }: RendererProps) {
  const regional=useRegional();
  const data = view.data as unknown as DevicesViewData;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const showOffline = data.showOffline !== false;
  const devices = data.devices.filter(device => showOffline || device.connected).map(device => ({ ...device, windows: (device.windows ?? []).filter(window => showOffline || window.connected) }));
  const styles = sessionStyles(devices);
  const windows = devices.reduce((total, device) => total + device.windows.length, 0), online = devices.filter(device => device.connected).length;
  const summary = <p className="devices-summary"><span><b>{devices.length}</b> {devices.length === 1 ? 'device' : 'devices'}</span><span><b>{online}</b> online</span><span><b>{windows}</b> {windows === 1 ? 'window' : 'windows'}</span>{styles.size > 0 && <span><b>{styles.size}</b> {styles.size === 1 ? 'session' : 'sessions'}</span>}</p>;
  if (data.groupBy === 'session') {
    const groups = new Map<string, { label: string; color?: string; rows: { device: typeof devices[number]; window: WindowItem }[] }>();
    for (const device of devices) for (const window of device.windows) {
      const key = window.sessionId ?? '', style = key ? styles.get(key) : undefined;
      const group = groups.get(key) ?? { label: style?.label ?? 'No session', ...(style?.color ? { color: style.color } : {}), rows: [] };
      group.rows.push({ device, window }); groups.set(key, group);
    }
    const ordered = [...groups.entries()].sort(([a], [b]) => Number(a === '') - Number(b === ''));
    return <div className="devices-content devices-by-session" data-navigation-scroll>{summary}{[...styles.values()].some(s=>s.color)&&<p className="devices-key">Matching colors connect windows showing the same session.</p>}
      <div className="devices-groups">{ordered.map(([key, group]) => <section key={key || 'none'} className="devices-group" style={group.color ? { '--session-color': group.color } as CSSProperties : undefined}>
        <h2><i aria-hidden="true"/>{group.label}<small>{group.rows.length} {group.rows.length === 1 ? 'window' : 'windows'}</small></h2>
        <ul>{group.rows.map(({ device, window }, index) => { const at = window.lastSeenAt ?? device.lastSeenAt, last = seen(at, now,regional); return <li key={`${device.id ?? device.name}-${window.id ?? index}`} className="devices-group-row">
          <Dot on={window.connected}/><span className="devices-kind is-small"><DeviceGlyph kind={deviceKind(device)}/><BrowserGlyph kind={browserKind(device.browser)}/></span>
          <span className="devices-row-name"><strong>{device.name}</strong>{window.name && <small>{window.name}</small>}{window.displayName && <small>· {window.displayName}</small>}</span>
          {window.connected ? <span className="devices-row-state">Online</span> : last ? <time dateTime={at} title={last.title}>{last.text}</time> : <span className="devices-row-state">Offline</span>}
        </li>; })}</ul>
      </section>)}</div>
    </div>;
  }
  return <div className="devices-content" data-navigation-scroll>{summary}{[...styles.values()].some(s=>s.color)&&<p className="devices-key">Matching colors connect windows showing the same session.</p>}
    <div className="devices-cards">{devices.map((device, index) => { const last = seen(device.lastSeenAt, now,regional); return <article key={device.id ?? `${device.name}-${index}`} className={`devices-card ${device.connected ? 'is-online' : 'is-offline'}`} aria-label={`${device.name}, ${device.connected ? 'online' : 'offline'}`}>
      <header>
        <span className="devices-kind"><DeviceGlyph kind={deviceKind(device)}/><BrowserGlyph kind={browserKind(device.browser)}/></span>
        <div><h2>{device.name}</h2>{(device.device || device.browser) && <p>{[device.device, device.browser].filter(Boolean).join(' · ')}</p>}</div>
        <span className="devices-state"><Dot on={device.connected}/>{device.connected ? 'Online' : last ? <time dateTime={device.lastSeenAt} title={last.title}>{last.text}</time> : 'Offline'}</span>
      </header>
      {(device.location||device.role) && <p className="devices-metadata">{[device.location,device.role].filter(Boolean).join(" · ")}</p>}
      {!!device.tags?.length && <p className="devices-tags">{device.tags.map(tag=><span key={tag}>{tag}</span>)}</p>}
      {device.defaultSessionId && <p className="devices-metadata">Default session: {styles.get(device.defaultSessionId)?.label??device.defaultSessionId}</p>}
      {device.windows.length ? <ul className="devices-windows">{device.windows.map((window, windowIndex) => { const windowSeen = seen(window.lastSeenAt, now,regional); return <li key={window.id ?? windowIndex} className="devices-window">
        <Dot on={window.connected}/><span className="devices-window-name">{window.name || 'Browser window'}</span>
        {window.connected ? <span className="devices-row-state">Online</span> : windowSeen ? <time dateTime={window.lastSeenAt} title={windowSeen.title}>{windowSeen.text}</time> : <span className="devices-row-state">Offline</span>}
        <SessionChip window={window} styles={styles}/>
      </li>; })}</ul> : <p className="devices-empty">No browser windows recorded.</p>}
    </article>; })}</div>
  </div>;
}
