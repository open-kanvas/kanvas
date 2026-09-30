import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DRAFTING_LIMITS, draftPassages, isDraftTextBoundary, validDraftRange, type DraftActor, type DraftingData, type DraftingSelection, type DraftRange } from '../../shared/drafting';
import { errorMessage } from '../api';
import type { RendererProps } from './Renderer';
import './drafting.css';

/** Minimal text-node edits preserve native selections in unchanged source.
 * In particular, appendData/replaceData at the end does not replace a node. */
export function draftTextEdit(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  if (!isDraftTextBoundary(before, start) || !isDraftTextBoundary(after, start)) start--;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (!isDraftTextBoundary(before, oldEnd) || !isDraftTextBoundary(after, newEnd)) { oldEnd++; newEnd++; }
  return { start, deleteCount: oldEnd - start, insert: after.slice(start, newEnd) };
}

export function draftAtEnd(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
}

/** Source text only: inline suggestion replacements and reasons are marked
 * data-draft-extra and never count towards draft offsets. */
function sourceWalker(root: HTMLElement) {
  return root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('[data-draft-extra]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
}
export function draftSourceText(root: HTMLElement): string {
  const walker = sourceWalker(root);
  let text = '', node: Node | null;
  while ((node = walker.nextNode())) text += node.textContent ?? '';
  return text;
}
/** Draft offset of a DOM boundary point, counting source text only. */
export function draftSourceOffset(root: HTMLElement, container: Node, offset: number): number {
  const boundary = root.ownerDocument.createRange();
  boundary.setStart(container, offset); boundary.collapse(true);
  const walker = sourceWalker(root);
  let total = 0, node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (node === container) return total + Math.min(offset, length);
    if (boundary.comparePoint(node, length) <= 0) total += length; else break;
  }
  return total;
}

export function draftRangeInDom(root: HTMLElement, span: DraftRange): Range | undefined {
  const walker = sourceWalker(root);
  const range = root.ownerDocument.createRange();
  let position = 0, started = false, node: Node | null;
  while ((node = walker.nextNode())) {
    const end = position + (node.textContent?.length ?? 0);
    if (!started && span.start >= position && span.start < end) { range.setStart(node, span.start - position); started = true; }
    if (started && span.end <= end) { range.setEnd(node, span.end - position); return range; }
    position = end;
  }
}

export function draftSelectionFromDom(root: HTMLElement, selection: Selection | null): DraftRange | undefined {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  const start = draftSourceOffset(root, range.startContainer, range.startOffset), end = draftSourceOffset(root, range.endContainer, range.endOffset);
  return validDraftRange(draftSourceText(root), { start, end }) ? { start, end } : undefined;
}

function SourcePassage({ text, span, interactive, onReview, onPause }: {
  text: string; span: DraftRange; interactive: boolean; onReview: () => void; onPause: () => void;
}) {
  const element = useRef<HTMLSpanElement>(null), initial = useRef(text);
  useLayoutEffect(() => {
    const node = element.current?.firstChild;
    if (node?.nodeType !== Node.TEXT_NODE) return;
    const before = node.textContent ?? '';
    if (before !== text) {
      const edit = draftTextEdit(before, text);
      (node as Text).replaceData(edit.start, edit.deleteCount, edit.insert);
    }
  }, [text]);
  return <span ref={element} className="drafting-passage" data-draft-start={span.start} data-draft-end={span.end}
    role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
    onFocus={onPause} onClick={interactive ? onReview : undefined}
    onKeyDown={interactive ? event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); event.stopPropagation(); onReview(); } } : undefined}
  >{initial.current}</span>;
}

export interface DraftMark { id: string; start: number; end: number; replacement: string; reason?: string; author?: DraftActor; last: boolean }
/** Suggestions overlapping one passage, clipped to it. The replacement and
 * reason follow the part of a suggestion that ends in this passage. */
export function draftMarks(span: DraftRange, suggestions: readonly { id: string; start: number; end: number; replacement: string; reason?: string; author?: DraftActor }[]): DraftMark[] {
  return suggestions.filter(item => item.start < span.end && item.end > span.start).sort((a, b) => a.start - b.start)
    .map(item => ({ id: item.id, start: Math.max(item.start, span.start), end: Math.min(item.end, span.end), replacement: item.replacement, ...(item.author ? { author: item.author } : {}), ...(item.reason ? { reason: item.reason } : {}), last: item.end <= span.end }));
}

/** Passage with inline suggestions: struck-through original, then the proposed replacement and its reason. */
function MarkedPassage({ text, span, marks, interactive, onReview, onPause, onSuggestion }: {
  text: string; span: DraftRange; marks: DraftMark[]; interactive: boolean; onReview: () => void; onPause: () => void; onSuggestion: (id: string) => void;
}) {
  const parts: ReactNode[] = [];
  let cursor = span.start;
  for (const mark of marks) {
    if (mark.start > cursor) parts.push(text.slice(cursor - span.start, mark.start - span.start));
    parts.push(<span key={`${mark.id}:${mark.start}`} className="drafting-suggestion" data-suggestion-id={mark.id} title={mark.last && mark.reason ? mark.reason : undefined}>
      <del className="drafting-del">{text.slice(mark.start - span.start, mark.end - span.start)}</del>
      {mark.last && mark.replacement ? <ins className="drafting-ins" data-draft-extra="">{mark.replacement}</ins> : null}
      {mark.last && mark.author && <small className="drafting-author" data-draft-extra="">Suggested by {mark.author.name}</small>}
      {mark.last && mark.reason ? <small className="drafting-reason-inline" data-draft-extra="">{mark.reason}</small> : null}
    </span>);
    cursor = mark.end;
  }
  if (cursor < span.end) parts.push(text.slice(cursor - span.start));
  const activate = (target: EventTarget | null) => {
    const mark = target instanceof Element ? target.closest('[data-suggestion-id]') : null;
    const selection = mark?.ownerDocument.getSelection();
    if (mark && (!selection || selection.isCollapsed)) onSuggestion(mark.getAttribute('data-suggestion-id') ?? '');
    else onReview();
  };
  return <span className="drafting-passage is-marked" data-draft-start={span.start} data-draft-end={span.end}
    role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
    onFocus={onPause} onClick={interactive ? event => activate(event.target) : undefined}
    onKeyDown={interactive ? event => { if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) { event.preventDefault(); event.stopPropagation(); onReview(); } } : undefined}
  >{parts}</span>;
}

interface SelectedPassage extends DraftRange { text: string; revision?: number }

export function DraftingRenderer(props: RendererProps) {
  const data = props.view.data as unknown as DraftingData;
  const source = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const initialFollow = (data.status ?? 'drafting') === 'drafting' && !data.focus;
  const follow = useRef(initialFollow), pointerDown = useRef(false), suppressClick = useRef(false), mounted = useRef(false);
  const [following, setFollowing] = useState(initialFollow);
  const [selected, setSelected] = useState<SelectedPassage | null>(null), [nativeSelection, setNativeSelection] = useState<SelectedPassage | null>(null);
  const native = useRef<SelectedPassage | null>(null), chosen = useRef<SelectedPassage | null>(null);
  const [pending, setPending] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const sequence = useRef(0), lastFocus = useRef('');
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const highlightNames = { focus: `draft-${id}-focus`, selection: `draft-${id}-selection` };
  const actionable = Boolean(props.actionable && !props.preview && props.onRespond && props.revision !== undefined);
  const current = useRef({ data, revision: props.revision }); current.current = { data, revision: props.revision };
  chosen.current = selected;

  const pauseFollowing = () => { follow.current = false; setFollowing(false); };
  const selectedAt = (span: DraftRange): SelectedPassage => ({ ...span, text: data.text.slice(span.start, span.end), revision: props.revision });
  const readSelection = (): SelectedPassage | null => {
    const root = source.current;
    if (!root || draftSourceText(root) !== current.current.data.text) return null;
    const range = draftSelectionFromDom(root, root.ownerDocument.getSelection());
    return range ? { ...range, text: current.current.data.text.slice(range.start, range.end), revision: current.current.revision } : null;
  };
  const share = async (passage: SelectedPassage, via: DraftingSelection['via'], suggestionId?: string) => {
    if (!actionable || !props.onRespond || passage.revision === undefined) return;
    pauseFollowing(); setSelected(passage); setError(''); setNotice(''); setPending(true);
    const operation = ++sequence.current;
    try {
      await props.onRespond({ kind: 'drafting.select', start: passage.start, end: passage.end, text: passage.text, via, ...(suggestionId ? { suggestionId } : {}) }, passage.revision);
      if (operation === sequence.current) setNotice('Passage shared for review');
    } catch (cause) { if (operation === sequence.current) setError(errorMessage(cause)); }
    finally { if (operation === sequence.current) setPending(false); }
  };
  const scrollToSpan = (span: DraftRange) => {
    if (!source.current || !scroller.current) return;
    const range = draftRangeInDom(source.current, span);
    if (!range) return;
    const top = range.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top + scroller.current.scrollTop - 24;
    scroller.current.scrollTop = Math.max(0, top);
  };
  const followLatest = () => {
    source.current?.ownerDocument.getSelection()?.removeAllRanges();
    native.current = null; chosen.current = null; setNativeSelection(null); setSelected(null); setNotice(''); setError('');
    follow.current = true; setFollowing(true);
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  };

  useEffect(() => {
    const root = source.current;
    if (!root) return;
    const change = () => {
      const next = readSelection();
      native.current = next;
      setNativeSelection(previous => previous?.start === next?.start && previous?.end === next?.end && previous?.revision === next?.revision && previous?.text === next?.text ? previous : next);
      if (next) pauseFollowing();
    };
    root.ownerDocument.addEventListener('selectionchange', change);
    const pointerReleased = () => { pointerDown.current = false; };
    root.ownerDocument.addEventListener('pointerup', pointerReleased);
    root.ownerDocument.addEventListener('pointercancel', pointerReleased);
    return () => {
      root.ownerDocument.removeEventListener('selectionchange', change);
      root.ownerDocument.removeEventListener('pointerup', pointerReleased);
      root.ownerDocument.removeEventListener('pointercancel', pointerReleased);
    };
  }, [Boolean(data.text)]);

  useLayoutEffect(() => {
    const root = source.current, scroll = scroller.current;
    if (!root || !scroll) return;
    const registry = globalThis.CSS?.highlights;
    if (registry && typeof Highlight !== 'undefined') {
      const add = (name: string, spans: DraftRange[]) => {
        const ranges = spans.map(span => draftRangeInDom(root, span)).filter((range): range is Range => Boolean(range));
        registry.set(name, new Highlight(...ranges));
      };
      add(highlightNames.focus, data.focus ? [data.focus] : []);
      add(highlightNames.selection, selected && data.text.slice(selected.start, selected.end) === selected.text ? [selected] : []);
    }
    const activeSelection = root.ownerDocument.getSelection();
    const selecting = pointerDown.current || Boolean(activeSelection && !activeSelection.isCollapsed && root.contains(activeSelection.anchorNode));
    const focusKey = data.focus ? `${data.focus.start}:${data.focus.end}:${data.text.slice(data.focus.start, data.focus.end)}` : '';
    if (data.focus && focusKey !== lastFocus.current && !selecting && !chosen.current && (!mounted.current || follow.current)) {
      scrollToSpan(data.focus); pauseFollowing();
    } else if (follow.current && !selecting && !chosen.current && !props.preview) scroll.scrollTop = scroll.scrollHeight;
    lastFocus.current = focusKey; mounted.current = true;
  }, [data.text, data.focus, data.suggestions, selected, props.revision, props.preview]);

  useEffect(() => () => {
    const registry = globalThis.CSS?.highlights;
    for (const name of Object.values(highlightNames)) registry?.delete(name);
    sequence.current++;
  }, [id]);

  const selectedChanged = selected && props.revision !== selected.revision;
  const attributed = data.attribution === 'show' || data.attribution !== 'hide' && data.collaborative;
  const suggestions = (data.suggestions ?? []).map(item => attributed ? item : { ...item, author: undefined });
  return <section className={`drafting-content drafting-${data.status ?? 'drafting'}`} aria-label="Draft" data-following={following}>
    <style>{`::highlight(${highlightNames.focus}){background:#fde68a;color:#17231b}::highlight(${highlightNames.selection}){background:#b9ed87;color:#17231b}`}</style>
    <header className="drafting-header">
      <span className="drafting-status" role="status">{data.status === 'ready' ? 'Ready' : data.status === 'reviewing' ? 'Reviewing' : 'Drafting'}</span>
      {data.purpose && <span className="drafting-purpose">{data.purpose}</span>}
      {!!suggestions.length && <span className="drafting-suggestion-count">{suggestions.length === 1 ? '1 suggested edit' : `${suggestions.length} suggested edits`}</span>}
      {!props.preview && !following && data.text && <button onClick={followLatest}>Follow latest <span aria-hidden="true">↓</span></button>}
    </header>
    {attributed && !!data.activity?.length && <details className="drafting-activity"><summary>Recent changes</summary><ul>{data.activity.slice(-10).map((item, index) => <li key={index}>{({edit:'Edited',suggest:'Suggested',accept:'Accepted',reject:'Rejected'})[item.action]}{item.suggestionId ? ` ${item.suggestionId}` : ''} by {item.actor.name} · revision {item.revision}</li>)}</ul></details>}
    {data.focus && !props.preview && <button className="drafting-focus-link" onClick={() => { pauseFollowing(); scrollToSpan(data.focus!); }}>{data.focus.label || 'Go to highlighted passage'}</button>}
    <div className="drafting-scroll" data-navigation-scroll ref={scroller} onScroll={() => {
      if (!scroller.current) return;
      const atEnd = draftAtEnd(scroller.current);
      if (!atEnd) pauseFollowing();
      else if (!native.current && !chosen.current && !pointerDown.current) { follow.current = true; setFollowing(true); }
    }}>
      {data.text ? <div className="drafting-source" ref={source} dir="auto" aria-label="Draft text" aria-live="off"
        onPointerDown={() => { pointerDown.current = true; }}
        onPointerCancel={() => { pointerDown.current = false; }}
        onPointerUp={() => {
          pointerDown.current = false;
          const passage = readSelection();
          const selection = source.current?.ownerDocument.getSelection();
          suppressClick.current = Boolean(selection && !selection.isCollapsed);
          setTimeout(() => { suppressClick.current = false; }, 0);
          if (passage) void share(passage, 'selection');
          else if (actionable && suppressClick.current) { pauseFollowing(); setError('Select a passage of up to 4,000 characters within the draft.'); }
        }}
        onKeyUp={event => { if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { const passage = readSelection(); if (passage) void share(passage, 'selection'); } }}
      >{draftPassages(data.text).map(span => {
        const review = () => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          const range = readSelection();
          const selection = source.current?.ownerDocument.getSelection();
          if (range) void share(range, 'selection');
          else if (selection && !selection.isCollapsed) { pauseFollowing(); setError('Select a passage of up to 4,000 characters within the draft.'); }
          else void share(selectedAt(span), 'passage');
        };
        const marks = draftMarks(span, suggestions);
        return marks.length
          ? <MarkedPassage key={`${span.start}:marked`} span={span} text={data.text.slice(span.start, span.end)} marks={marks} interactive={actionable} onPause={pauseFollowing} onReview={review} onSuggestion={suggestionId => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            const item = suggestions.find(entry => entry.id === suggestionId);
            if (item) void share(selectedAt(item), 'suggestion', item.id);
          }}/>
          : <SourcePassage key={span.start} span={span} text={data.text.slice(span.start, span.end)} interactive={actionable} onPause={pauseFollowing} onReview={review}/>;
      })}</div> : <p className="drafting-empty">Your draft will appear here.</p>}
    </div>
    {!props.preview && nativeSelection && actionable && <button className="drafting-selection-control" disabled={pending} onMouseDown={event => event.preventDefault()} onClick={() => void share(nativeSelection, 'selection')}>Review selected text</button>}
    {!props.preview && (selected || pending || error || notice) && <footer className="drafting-feedback">
      {selected && <details><summary>{selectedChanged ? 'Draft updated · selected passage' : 'Selected passage'}</summary><blockquote>{selected.text}</blockquote></details>}
      {(pending || notice) && <p role="status">{pending ? 'Sharing passage…' : notice}</p>}
      {error && <p role="alert">{error}</p>}
    </footer>}
    <span className="sr-only">{actionable ? `Select text or activate a passage to share it for review. Selections may contain up to ${DRAFTING_LIMITS.span.toLocaleString('en-US')} characters.` : 'Draft text. View only.'}{suggestions.length ? ' Suggested edits appear inline: struck-through original text followed by the proposed replacement.' : ''}</span>
  </section>;
}
