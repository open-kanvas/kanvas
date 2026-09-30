import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Renderer, type RendererProps } from './Renderer';
import { api, displayPath, errorMessage } from '../api';
import { useMediaResource } from './readiness';
import { templateNames } from '../../shared/template-examples';
import type { SessionConfig, ViewSpec } from '../../shared/types';
import type { DisplayGridData } from '../../shared/display-grid';
import './display-grid.css';

interface Tile { displayId: string; name: string; revision: number; width: number; height: number; online: boolean; view: ViewSpec | null; template: string | null; title?: string; note?: string }
interface Grid { tiles: Tile[]; config: SessionConfig; total: number }

const viewLabel = (tile: Tile) => tile.title || (tile.template ? (templateNames as Record<string, string>)[tile.template] ?? tile.template : 'Nothing shown');

/** Scaled, non-interactive miniature of one display's current view. */
function Miniature({ tile, config }: { tile: Tile; config: SessionConfig }) {
  const frame = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = frame.current; if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element); measure();
    return () => observer?.disconnect();
  }, []);
  const sourceWidth = Math.max(320, tile.width || 1280), sourceHeight = Math.max(240, tile.height || 720);
  const scale = size.width && size.height ? Math.min(size.width / sourceWidth, size.height / sourceHeight) : 0;
  return <div ref={frame} className="display-grid-frame" aria-hidden="true" inert>
    {tile.view && scale > 0
      ? <div className="display-grid-canvas" style={{ width: sourceWidth, height: sourceHeight, left: (size.width - sourceWidth * scale) / 2, top: (size.height - sourceHeight * scale) / 2, transform: `scale(${scale})` }}><Renderer view={tile.view} config={config} preview editable={false} actionable={false}/></div>
      : <p className="display-grid-empty">{tile.note ?? (tile.view ? '' : 'Nothing shown')}</p>}
  </div>;
}

/** What every display in this session shows right now (not history, not connections). */
export function DisplayGridRenderer(props: RendererProps) {
  const data = props.view.data as unknown as DisplayGridData;
  const [grid, setGrid] = useState<Grid | null>(null), [error, setError] = useState<string | null>(null);
  const media = useMediaResource(props.preview ? 'ready' : 'pending');
  const last = useRef('');
  useEffect(() => {
    if (props.preview || !props.sessionId || !props.displayId) return;
    const path = `${displayPath(props.sessionId, props.displayId)}/grid`;
    let disposed = false, loaded = false, busy = false, again = false, timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      if (busy) { again = true; return; }
      busy = true;
      try {
        const next = await api<Grid>(path), serial = JSON.stringify(next);
        if (disposed) return;
        loaded = true; setError(null);
        if (serial !== last.current) { last.current = serial; setGrid(next); }
      } catch (failure) { if (!disposed) { setError(errorMessage(failure)); if (!loaded) media.fail(); } }
      finally { busy = false; if (again && !disposed) { again = false; void load(); } }
    };
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => void load(), 300); };
    const onChange = (event: Event) => { const detail = (event as CustomEvent<{ sessionId?: string; type?: string }>).detail; if (detail?.sessionId === props.sessionId && detail.type !== 'identify') soon(); };
    void load();
    const interval = setInterval(() => void load(), 5000);
    window.addEventListener('kanvas:session-change', onChange);
    return () => { disposed = true; clearTimeout(timer); clearInterval(interval); window.removeEventListener('kanvas:session-change', onChange); };
  }, [props.sessionId, props.displayId, props.revision, props.preview]);
  useEffect(() => { if (grid) media.ready(); }, [grid, media.ready]);
  if (props.preview) return <div className="display-grid-content"><p className="display-grid-placeholder">Live miniatures of each display in this session appear here.</p></div>;
  const tiles = grid?.tiles ?? [];
  const columns = data.columns ?? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(tiles.length || 1))));
  const rows = Math.max(1, Math.ceil((tiles.length || 1) / columns));
  return <div className="display-grid-content" style={{ '--grid-columns': columns, '--grid-rows': rows } as CSSProperties}>
    {!tiles.length
      ? <p className="display-grid-placeholder">{grid ? 'No other displays in this session yet.' : error ?? 'Loading displays…'}</p>
      : <div className="display-grid-tiles" role="list">{tiles.map(tile => <article key={tile.displayId} role="listitem" className={`display-grid-tile ${tile.online ? 'is-online' : 'is-offline'}`} aria-label={`${tile.name}: ${viewLabel(tile)}, ${tile.online ? 'online' : 'offline'}`}>
        <Miniature tile={tile} config={grid!.config}/>
        {data.showNames !== false && <footer><span className="display-grid-status" aria-hidden="true"/><strong>{tile.name}</strong><span>{viewLabel(tile)}</span></footer>}
      </article>)}</div>}
  </div>;
}
