import { useNavigation } from './Navigation';
import { cellEmphasis, type Emphasis } from '../../shared/emphasis';
import { useRegional } from './Regional';
import { checklistFocus, checklistScrollDelta, useChecklistColumns } from './checklist-layout';
import './checklist.css';
import { regionalNumber, regionalDate, regionalDateTime } from '../../shared/regional';
import { useReading, ReadingControls } from './Reading';
import { useEffect, useLayoutEffect, useState, useRef, type CSSProperties, type ReactNode } from 'react';
import { api, displayPath, errorMessage, safeUrl, sourceLabel } from '../api';
import { useMediaResource } from './readiness';
import { Icon } from '../icons';
import { summaryText, type DatasetSummary, type Scalar } from './Chart';
import { isAllowedEmbedUrl } from '../../shared/view-schemas';

export function FactRenderer({ data, retainOriginal = true, showControls = false }: { data: { text: string; subtitle?: string; items?: string[]; original?: string; language?: string; sourceLanguage?: string }; retainOriginal?: boolean; showControls?: boolean }) {
  return <div className={`fact-content ${data.original && retainOriginal ? 'translated' : ''}`}>
    {data.original && retainOriginal && <div className="translation-original" lang={data.sourceLanguage}><span className="content-eyebrow">{data.sourceLanguage ?? 'Original'}</span><p>{data.original}</p></div>}
    <div className="fact-primary" lang={data.language}>{data.language && data.original && <span className="content-eyebrow">{data.language}</span>}<p className={`fact-text ${data.text.length > 200 ? 'fact-long' : data.text.length < 60 ? 'fact-short' : ''}`}>{data.text}</p>{data.subtitle && <p className="fact-subtitle">{data.subtitle}</p>}{!!data.items?.length && (showControls ? <details className="supplementary-details fact-details"><summary>Supporting details · {data.items.length}</summary><ul className="fact-items">{data.items.map((item, i) => <li key={i}>{item}</li>)}</ul></details> : <ul className="fact-items">{data.items.map((item, i) => <li key={i}>{item}</li>)}</ul>)}</div>
  </div>;
}
export function NumberRenderer({ data, showSource = false }: { showSource?: boolean; data: { value: string | number; label?: string; unit?: string; comparison?: string; summary?: DatasetSummary } }) {
  const regional=useRegional();
  const value=regional.numberLocale?regionalNumber(data.value,regional):typeof data.value==='number'?new Intl.NumberFormat(undefined,{maximumSignificantDigits:21}).format(data.value):data.value;
  return <div className="number-content">{data.label && <p className="number-label">{data.label}</p>}<div className="number-value" style={{ '--value-length': Math.max(3, value.length) } as React.CSSProperties}><span>{value}</span>{data.unit && <span className="number-unit">{data.unit}</span>}</div>{data.comparison && <p className="number-comparison">{data.comparison}</p>}{showSource && data.summary && <p className="content-summary">{summaryText(data.summary)}</p>}</div>;
}

// Keep existing Content imports compatible for documents, profiles and image callers.
import { MediaImage, type ImageEntry } from './Image';
export { MediaImage, ImageRenderer } from './Image';
export type { ImageEntry } from './Image';

export function safeEmbedUrl(value: unknown): string | undefined {
  const safe = safeUrl(value); if (!safe || !isAllowedEmbedUrl(safe)) return;
  return safe;
}
type LiveEmbed = { status: 'idle' | 'preview' | 'checking' | 'interactive' | 'unavailable'; reason?: string };
/** Ask the server whether an https page may be framed; retries while a probe slot is busy. */
function useLiveEmbed(url: string | undefined, sessionId?: string, displayId?: string, revision?: number, preview = false): LiveEmbed {
  const [state, setState] = useState<LiveEmbed>({ status: url ? (preview ? 'preview' : 'checking') : 'idle' });
  useEffect(() => {
    if (!url) { setState({ status: 'idle' }); return; }
    if (preview) { setState({ status: 'preview' }); return; }
    if (!sessionId || !displayId || revision === undefined) { setState({ status: 'unavailable', reason: 'Live embedding is checked when this view is shown on a display.' }); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    setState({ status: 'checking' });
    const check = async () => {
      try {
        const result = await api<{ status: string; reason?: string }>(`${displayPath(sessionId, displayId)}/web-embed`, { method: 'POST', body: { expectedRevision: revision }, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.status === 'pending' && ++attempts < 8) { timer = setTimeout(() => void check(), 1500); return; }
        setState(result.status === 'interactive' ? { status: 'interactive' } : { status: 'unavailable', reason: result.status === 'pending' ? 'Live embedding could not be checked right now, so the supplied preview is shown.' : result.reason ?? 'Live embedding is unavailable for this website, so the supplied preview is shown.' });
      } catch { if (!controller.signal.aborted) setState({ status: 'unavailable', reason: 'Live embedding could not be checked, so the supplied preview is shown.' }); }
    };
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [url, sessionId, displayId, revision, preview]);
  return state;
}

export function WebRenderer({ data, showSource = false, showControls = false, showCaption = false, sessionId, displayId, revision, preview = false }: { showSource?: boolean; showControls?: boolean; showCaption?: boolean; sessionId?: string; displayId?: string; revision?: number; preview?: boolean; data: { url: string; title?: string; text?: string; embed?: boolean; snapshotUrl?: string; retrievedAt?: string } }) {
  const url = safeUrl(data.url, true), publisherEmbed = data.embed ? safeEmbedUrl(data.url) : undefined;
  // Any other https page with embed:true is framed live only when its own headers allow it.
  const liveCandidate = data.embed && !publisherEmbed && url && /^https:\/\//i.test(url) ? url : undefined;
  const live = useLiveEmbed(liveCandidate, sessionId, displayId, revision, preview);
  const liveEmbed = liveCandidate && live.status === 'interactive' ? liveCandidate : undefined;
  const embed = publisherEmbed ?? liveEmbed;
  const host = url ? sourceLabel(url) : 'Source';
  const hasContent = Boolean(embed || data.snapshotUrl || data.text || data.title);
  return <div className={`web-content ${embed ? 'web-embedded' : ''}`}>
    {showSource && <div className="source-identity"><span className="source-domain">{host}</span></div>}
    {(hasContent || liveCandidate) && <p className="web-trust-label">{publisherEmbed ? 'Publisher embed · visible content unverified' : liveEmbed ? 'Live website · the site’s own interactive page; content not verified by Kanvas' : <>{liveCandidate && <strong>{live.status === 'checking' ? 'Checking whether this website allows live embedding…' : live.status === 'preview' ? 'Live website embed · shown live on the display.' : live.reason ?? 'Live embedding is unavailable.'}</strong>}{liveCandidate && (data.snapshotUrl || data.text || data.title) ? ' ' : null}{data.snapshotUrl ? 'Supplied snapshot · not independently verified' : (data.text || data.title) ? 'Supplied summary · not a fetched excerpt' : null}</>}</p>}
    {embed ? <div className="embed-frame">{liveEmbed ? <iframe title={data.title ?? `Live page from ${host}`} src={liveEmbed} sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" /> : <EmbeddedContent title={data.title ?? `Embedded content from ${host}`} url={embed} />}</div> : data.snapshotUrl ? <figure className="web-snapshot"><MediaImage entry={{ url: data.snapshotUrl, alt: data.title ?? `Supplied image of ${host}` }} />{showCaption && data.retrievedAt && <figcaption>Supplied capture time: {data.retrievedAt} · unverified</figcaption>}</figure> : <div className="web-excerpt">{data.title && <h2>{data.title}</h2>}{data.text && <p>{data.text}</p>}</div>}
    {url && (!hasContent || url.startsWith('/api/assets/') || showSource || showControls) && <a className="source-link" href={url} target="_blank" rel="noopener noreferrer">Open original <Icon name="external" size={16} /></a>}
  </div>;
}

function EmbeddedContent({ title, url }: { title: string; url: string }) {
  // A cross-origin frame load event proves only the frame navigation, never its visible content.
  useMediaResource('unverified');
  return <iframe title={title} src={url} sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" />;
}

export function ComparisonRenderer({ data }: { data: { commentary?:Record<string,string>;emphasis?:Emphasis; criteria: string[]; items: { name: string; image?:{url:string;alt:string};highlights?:string[]; values: Record<string, Scalar>; pros?: string[]; cons?: string[] }[] } }) {
  const regional = useRegional();
  return <div className="comparison-content"><div className="comparison-scroll" tabIndex={0} aria-label="Comparison table"><table><thead><tr><th scope="col" className="comparison-label">Compare</th>{data.items.map((item, i) => <th key={i} scope="col">{item.image && <div className="comparison-image"><MediaImage entry={item.image}/></div>}<span className="comparison-name">{item.name}</span></th>)}{data.commentary && <th scope="col" className="comparison-commentary">Takeaway <small>Summary</small></th>}</tr></thead><tbody>{data.criteria.map((criterion, rowIndex) => <tr key={criterion}><th scope="row">{criterion}</th>{data.items.map((item, i) => <td key={i} title={cellEmphasis(data.emphasis,rowIndex,item.name)?.label} style={cellEmphasis(data.emphasis,rowIndex,item.name)?.color?{boxShadow:`inset 0 0 0 2px ${cellEmphasis(data.emphasis,rowIndex,item.name)!.color}`} : undefined} className={item.highlights?.includes(criterion)||cellEmphasis(data.emphasis,rowIndex,item.name)?'cell-emphasis':undefined}>{item.values[criterion] === null || item.values[criterion] === undefined ? <span className="muted">Not supplied</span> : typeof item.values[criterion] === 'boolean' ? item.values[criterion] ? <span className="comparison-yes"><Icon name="check" size={22} />Yes</span> : 'No' : regionalNumber(item.values[criterion] as string | number, regional)}</td>)}{data.commentary && <td className="comparison-commentary">{data.commentary[criterion]}</td>}</tr>)}
    {data.items.some(i => i.pros?.length) && <tr><th scope="row">Strengths</th>{data.items.map((item, i) => <td key={i}><ul className="comparison-pros">{item.pros?.map((pro, j) => <li key={j}>{pro}</li>)}</ul></td>)}{data.commentary && <td/>}</tr>}
    {data.items.some(i => i.cons?.length) && <tr><th scope="row">Trade-offs</th>{data.items.map((item, i) => <td key={i}><ul>{item.cons?.map((con, j) => <li key={j}>{con}</li>)}</ul></td>)}{data.commentary && <td/>}</tr>}</tbody></table></div></div>;
}

export interface ChecklistData { highlight?: string; items: { id: string; text: string; checked?: boolean; detail?: string }[] }
export function ChecklistRenderer({ data, editable, onEdit, revision, actionable, onRespond, showControls = false }: { showControls?: boolean; data: ChecklistData; editable?: boolean; revision?: number; onEdit?: (data: Record<string, unknown>, expectedRevision: number) => Promise<number>; actionable?: boolean; onRespond?: (value: Record<string, unknown>) => Promise<unknown> }) {
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null),navigation=useNavigation();
  const columns = useChecklistColumns(listRef, data.items);
  const previousItems=useRef(data.items),previousHighlight=useRef<string|undefined>(undefined),manualUntil=useRef(0),mounted=useRef(false);
  useEffect(()=>{const root=listRef.current;if(!root)return;const pause=()=>{manualUntil.current=Date.now()+6000;};
    root.addEventListener('wheel',pause,{passive:true});root.addEventListener('touchstart',pause,{passive:true});root.addEventListener('pointerdown',pause);root.addEventListener('keydown',pause);
    return()=>{root.removeEventListener('wheel',pause);root.removeEventListener('touchstart',pause);root.removeEventListener('pointerdown',pause);root.removeEventListener('keydown',pause);};
  },[]);
  // Follow the item an update is about (ticked, edited, added or highlighted),
  // whoever made it: an agent's saved update or a tap. Nothing changed means
  // nothing moves, so the reader keeps their place.
  useLayoutEffect(()=>{const before=previousItems.current,first=!mounted.current;previousItems.current=data.items;mounted.current=true;
    const focus=first?data.highlight:checklistFocus(before,data.items,previousHighlight.current,data.highlight);previousHighlight.current=data.highlight;
    const root=listRef.current;if(!focus||!root||root.closest('.is-preview'))return;
    root.dataset.checklistFocus=focus;
    const instant=first||matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The navigation layer restores its own stored position shortly after a refresh, so the item is
    // brought into view now and checked again once that has settled. The last pass also records the
    // position with the navigation layer, where this window may navigate, so later refreshes keep it.
    const follow=(record:boolean)=>{
      const target=[...root.children].find(child=>(child as HTMLElement).dataset.itemId===focus) as HTMLElement|undefined;
      if(!target||root.scrollHeight<=root.clientHeight+1)return;
      const box=root.getBoundingClientRect(),item=target.getBoundingClientRect();
      const delta=checklistScrollDelta({top:box.top,height:root.clientHeight},{top:item.top,bottom:item.bottom},Date.now()<manualUntil.current);
      if(delta===undefined)return;
      const range=root.scrollHeight-root.clientHeight;
      root.scrollBy({top:delta,behavior:instant?'instant':'smooth'});
      if(record&&navigation?.canNavigate&&range>0)navigation.send({action:'scroll',y:Math.min(1,Math.max(0,(root.scrollTop+(instant?0:delta))/range))});
    };
    follow(false);
    const timers=[setTimeout(()=>follow(false),350),setTimeout(()=>follow(true),1200)];
    return()=>timers.forEach(clearTimeout);
  },[data.items,data.highlight,columns]);
  const canToggle = Boolean(actionable && onRespond || editable && onEdit && revision !== undefined);
  const done = data.items.filter(item => item.checked).length;
  const toggle = async (id: string) => { if (!canToggle || pending) return; const item = data.items.find(item => item.id === id); if (!item) return; setPending(id); setError(null); try { if (actionable && onRespond) await onRespond({ kind: 'checklist.toggle', itemId: id, checked: !item.checked }); else if (onEdit && revision !== undefined) await onEdit({ ...data, items: data.items.map(item => item.id === id ? { ...item, checked: !item.checked } : item) }, revision); } catch (e) { setError(errorMessage(e)); } finally { setPending(null); } };
  return <div className="checklist-content checklist-adaptive"><div className="checklist-summary"><span><b>{done}</b> / {data.items.length}</span><span>{done === data.items.length && done > 0 ? 'All done.' : 'Completed'}</span></div><div className="checklist-progress" role="progressbar" aria-label="Checklist completion" aria-valuenow={done} aria-valuemin={0} aria-valuemax={data.items.length}><i style={{ width: `${data.items.length ? done / data.items.length * 100 : 0}%` }} /></div>
    <ul ref={listRef} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} data-navigation-scroll tabIndex={0} aria-label="Checklist items">{data.items.map(item => <li key={item.id} data-item-id={item.id} className={`${item.checked ? 'checked' : ''}${item.id === data.highlight ? ' is-current' : ''}`.trim()} aria-current={item.id === data.highlight ? 'true' : undefined}><button className="checklist-checkbox" role="checkbox" aria-checked={Boolean(item.checked)} aria-label={item.text} disabled={!canToggle || Boolean(pending)} onClick={() => void toggle(item.id)}>{pending === item.id ? <span className="spinner" /> : item.checked ? <Icon name="check" size={24} /> : null}</button><div><span>{item.text}</span>{item.detail && (showControls ? <details className="supplementary-details"><summary>Details</summary><p>{item.detail}</p></details> : <p className="checklist-detail">{item.detail}</p>)}</div></li>)}</ul>{!canToggle && <p className="participation-hint">View-only checklist</p>}{error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}

export interface DocumentData { text?: string; highlights?: { start: number; end: number; label?: string }[]; headings?: {start:number;end:number;level:2|3|4}[]; layout?: 'auto'|'excerpt'|'reading'; images?: ImageEntry[]; page?: string | number; section?: string; quote?: boolean; context?: string }
export function highlightedText(text: string, highlights: NonNullable<DocumentData['highlights']>): ReactNode[] {
  const boundaries = [...new Set([0, text.length, ...highlights.flatMap(h => [Math.max(0, h.start), Math.min(text.length, h.end)])])].filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => { const end = boundaries[i + 1], active = highlights.filter(h => h.start <= start && h.end >= end); return active.length ? <mark key={start} title={active.map(h => h.label).filter(Boolean).join(' · ') || undefined}>{text.slice(start, end)}</mark> : <span key={start}>{text.slice(start, end)}</span>; });
}
export function DocumentRenderer({ data, preview = false, showCaption = false, showSource = false, showControls = false }: { preview?:boolean; data: DocumentData; showCaption?: boolean; showSource?: boolean; showControls?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const reading = data.layout === 'reading' || data.layout !== 'excerpt' && ((data.text?.length ?? 0) > 900 || (data.text?.split(/\n\s*\n/).length ?? 0) >= 3 || Boolean(data.headings?.length));
  const scroll=useRef<HTMLDivElement>(null),{reading:reader,pixelsPerSecond,pause}=useReading(scroll,reading&&!preview);
  const range = (start:number,end:number) => highlightedText((data.text ?? '').slice(start,end),(data.highlights??[]).filter(h=>h.end>start&&h.start<end).map(h=>({...h,start:Math.max(0,h.start-start),end:Math.min(end-start,h.end-start)})));
  const blocks: ReactNode[] = [];
  if (reading && data.text) {
    const paragraphs = (start:number,end:number) => {
      const part=data.text!.slice(start,end); let cursor=start;
      for (const line of part.split(/(\n[\t ]*\n)/)) { const offset=cursor; cursor+=line.length; if(line.trim())blocks.push(<p key={`p-${offset}`}>{range(offset,cursor)}</p>); }
    };
    let cursor=0;
    for(const heading of [...(data.headings??[])].sort((a,b)=>a.start-b.start)) { paragraphs(cursor,heading.start); const Tag=`h${heading.level}` as 'h2'|'h3'|'h4'; blocks.push(<Tag key={`h-${heading.start}`}>{range(heading.start,heading.end)}</Tag>);cursor=heading.end; }
    paragraphs(cursor,data.text.length);
  }
  return <div className="document-shell"><div ref={scroll} data-navigation-scroll data-reading-wpm={reader.wpm} data-reading-pixels-per-second={pixelsPerSecond} data-reading-playing={reader.playing} onWheel={pause} onTouchStart={pause} style={{'--reading-font-size':`${reader.fontSize}px`,'--reading-zoom':reader.zoom} as CSSProperties} className={`document-content ${reading?'document-reading':''}`} role="region" aria-label={reading?'Document reader':'Document excerpt'} tabIndex={reading?0:undefined}>{showSource && <div className="document-location">{data.quote !== false && <span className="content-eyebrow">{reading ? 'Supplied document' : 'Exact excerpt'}</span>}{showSource && data.page !== undefined && <span>Page {data.page}</span>}{showSource && data.section && <span>{data.section}</span>}</div>}
    {data.text && (reading ? <article className="document-article">{blocks}</article> : data.quote === false ? <p className="document-excerpt">{highlightedText(data.text, data.highlights ?? [])}</p> : <blockquote className="document-excerpt">{highlightedText(data.text, data.highlights ?? [])}</blockquote>)}
    {!!data.images?.length && <div className="document-crops">{data.images.map((entry, i) => <figure key={i}><MediaImage entry={entry} />{showCaption && entry.caption && <figcaption>{entry.caption}</figcaption>}</figure>)}</div>}
    {data.context && <div className="document-context">{showControls && <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Less context' : 'More context'} <Icon name={expanded ? 'minus' : 'plus'} size={16} /></button>}{(!showControls || expanded) && <p>{data.context}</p>}</div>}
  </div></div>;
}

export { VideoRenderer, type VideoData } from './Video';

export interface NotificationsData { items: { id: string; title: string; body?: string; time?: string; urgency?: 'low' | 'normal' | 'high' | 'urgent'; source?: string; read?: boolean }[] }
export function NotificationsRenderer({ data, editable, onEdit, revision, showControls = false }: { showControls?: boolean; data: NotificationsData; editable?: boolean; revision?: number; onEdit?: (data: Record<string, unknown>, expectedRevision: number) => Promise<number> }) {
  const regional = useRegional();
  const [filter, setFilter] = useState<'all' | 'unread'>('all'), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const unread = data.items.filter(n => !n.read).length;
  const toggle = async (id: string) => { if (!editable || !onEdit || busy || revision === undefined) return; setBusy(true); setError(null); try { await onEdit({ ...data, items: data.items.map(n => n.id === id ? { ...n, read: !n.read } : n) }, revision); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const items = data.items.filter(n => !showControls || filter === 'all' || !n.read);
  return <div className="notifications-content">{showControls && <div className="notification-filter"><span>{unread} unread</span><div role="group" aria-label="Notification filter"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button><button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</button></div></div>}<div className="notification-list">{items.map(n => <article key={n.id} className={`notification-item urgency-${n.urgency ?? 'normal'} ${n.read ? 'is-read' : ''}`}><span className="notification-icon"><Icon name="bell" size={23} /></span><div><div className="notification-meta">{n.source && <span>{n.source}</span>}{n.time && <time>{regionalDateTime(n.time,regional)}</time>}{(n.urgency === 'urgent' || n.urgency === 'high') && <b>{n.urgency}</b>}</div><h3>{n.title}</h3>{n.body && <p>{n.body}</p>}</div>{showControls && editable && <button disabled={busy} onClick={() => void toggle(n.id)} className="notification-read" aria-label={`Mark ${n.title} ${n.read ? 'unread' : 'read'}`} title={n.read ? 'Mark unread' : 'Mark read'}><Icon name={n.read ? 'check' : 'circle'} size={20} /></button>}</article>)}</div>{!items.length && <div className="notification-empty"><Icon name="check" size={35} /><p>All caught up.</p></div>}{error && <p className="inline-error" role="alert">{error}</p>}</div>;
}
