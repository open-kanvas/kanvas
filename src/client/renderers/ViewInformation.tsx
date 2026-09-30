import { FormattedTime } from './Regional';
import { useRef } from 'react';
import type { ViewSpec } from '../../shared/types';
import { liveSurfaceOptions, viewInformationContent } from '../../shared/live-surface';
import { safeUrl, sourceLabel } from '../api';

/** No resting source widget. A caller may deliberately opt in on the surface,
 * or mount this inside an already-open display menu with placement="menu". */
export function ViewInformation({ view, container, preview, placement = 'surface' }: { view: ViewSpec; container?: ViewSpec; preview?: boolean; placement?: 'surface' | 'menu' }) {
  const element = useRef<HTMLDetailsElement>(null);
  const { titles, sources, captions } = viewInformationContent(view, container);
  if (preview || !titles.length && !sources.length && !captions.length) return null;
  if (placement === 'surface' && !liveSurfaceOptions(view, container).showSource) return null;
  const close = () => { if (element.current) { element.current.open = false; element.current.querySelector('summary')?.focus(); } };
  return <details ref={element} className={`view-information${placement === 'menu' ? ' view-information-menu' : ''}`} onKeyDown={event => { if (event.key === 'Escape' && element.current?.open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <summary aria-label="About this view"><span>{placement === 'menu' ? 'About this view' : sources.length ? 'Source & info' : 'About this view'}</span></summary>
    <div className="view-information-panel" role="region" aria-label="View information"><button type="button" className="information-close" onClick={close} aria-label="Close view information">×</button>
      <h2>{titles[0] ?? 'About this view'}</h2>
      {titles.slice(1).map(title => <p key={title}>Presentation: {title}</p>)}
      {captions.map((caption, index) => <div key={index} className="information-caption"><h3>{caption.label}</h3><p>{caption.text}</p></div>)}
      {sources.map((source, index) => { const url = safeUrl(source.url, true); return <div key={index} className="information-source">{source.title?.trim() && !url && <p>{source.title}</p>}{url && <a href={url} target="_blank" rel="noopener noreferrer">{source.title?.trim() ? source.title : sourceLabel(url)} ↗</a>}{source.locator?.trim() && <p>{source.locator}</p>}{source.timestamp?.trim() && <p>Source time: <time dateTime={source.timestamp} >{<FormattedTime value={source.timestamp}/>} </time></p>}</div>; })}
    </div>
  </details>;
}
