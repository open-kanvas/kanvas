import type { Provenance, ViewSpec } from './types.js';
import { isSafeUrl } from './urls.js';

/** Presentation metadata remains stored; none of these flags changes the payload. */
export interface LiveSurfaceFlags {
  showTitle?: boolean;
  showCaption?: boolean;
  showSource?: boolean;
  showControls?: boolean;
}
export interface LiveSurfaceOptions {
  showTitle: boolean;
  showCaption: boolean;
  showSource: boolean;
  showControls: boolean;
}
type SurfaceView = ViewSpec & LiveSurfaceFlags;

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Utilities are opt-in, not permissions. Intrinsic response/navigation controls
 * must still perform their own permission checks and must not use this as a gate.
 * Deck flags apply to slides unless overridden; a deck heading is never repeated
 * as a heading on every slide. */
export function liveSurfaceOptions(view: SurfaceView, container?: SurfaceView): LiveSurfaceOptions {
  return {
    showTitle: view.showTitle === true && nonempty(view.title),
    showCaption: (view.showCaption ?? container?.showCaption) === true,
    showSource: (view.showSource ?? container?.showSource) === true,
    showControls: (view.showControls ?? container?.showControls) === true,
  };
}

export type LiveSurfaceMode = 'focus' | 'reading' | 'media' | 'interactive';
export interface LiveSurfaceLayout { mode: LiveSurfaceMode; fullBleed: boolean }

const mediaTemplates = new Set<string>(['split-screen','traffic-demo','satisfaction','signage','molecule','menu','menu-board','todays-special','opening-hours','back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign','image-gallery','website','iframe', 'image', 'map', 'whiteboard', 'video', 'html', 'weather', 'presentation', 'now-playing']);
const readingTemplates = new Set<string>(['database-schema','keyboard-shortcuts','standings','tool-call-log','email','inbox','chat','cards','bookmarks','tool-inventory','tool-detail','developer','operations','code-workspace','list', 'table', 'comparison', 'code', 'transcription', 'translation', 'schedule', 'timeline', 'itinerary', 'menu', 'leaderboard', 'notifications', 'drafting']);
const interactiveTemplates = new Set<string>(['json', 'session-topology', 'form', 'poll', 'qa', 'overview', 'settings', 'procedure', 'join']);

/** A reading surface is not a failed fit. Exact long data gets a bounded, readable
 * scroll region; it is never truncated or globally scaled down to fake a fit. */
export function liveSurfaceLayout(view: ViewSpec): LiveSurfaceLayout {
  if (mediaTemplates.has(view.template)) return { mode: 'media', fullBleed: true };
  if (view.template === 'product' && ['comparison','multi-vendor'].includes(String(view.data.layout))) return {mode:'reading',fullBleed:false};
  if (view.template === 'document') {
    const text = typeof view.data.text === 'string' ? view.data.text : '';
    const reading = view.data.layout === 'reading' || view.data.layout !== 'excerpt' && (text.length > 900 || text.split(/\n\s*\n/).length >= 3 || Array.isArray(view.data.headings) && view.data.headings.length > 0);
    return { mode: reading ? 'reading' : 'focus', fullBleed: false };
  }
  if (view.template === 'recipe') return { mode: view.data.mode === 'steps' ? 'interactive' : 'reading', fullBleed: false };
  if (readingTemplates.has(view.template)) return { mode: 'reading', fullBleed: false };
  if (interactiveTemplates.has(view.template)) return { mode: 'interactive', fullBleed: false };
  return { mode: 'focus', fullBleed: false };
}

export interface ViewInformationContent {
  titles: string[];
  sources: Provenance[];
  captions: { label: string; text: string }[];
}

/** Useful information only: an empty source object never creates an info widget. */
export function viewInformationContent(view: ViewSpec, container?: ViewSpec): ViewInformationContent {
  const lineage: ViewSpec[] = [view];
  if (container && container !== view) lineage.push(container);
  // The deliberate display menu can pass the deck itself. Include only the
  // currently shown slide, never metadata from hidden/future slides.
  let current = view;
  const visited = new Set<ViewSpec>(lineage);
  while (current.template === 'presentation' && Array.isArray(current.data.slides) && current.data.slides.length) {
    const requested = typeof current.data.index === 'number' && Number.isFinite(current.data.index) ? Math.trunc(current.data.index) : 0;
    const index = Math.min(Math.max(requested, 0), current.data.slides.length - 1);
    const slide = current.data.slides[index] as ViewSpec | undefined;
    if (!slide || typeof slide !== 'object' || !slide.data || visited.has(slide)) break;
    visited.add(slide);
    lineage.unshift(slide);
    current = slide;
  }
  const titles = [...new Set(lineage.map(item => item.title).filter(nonempty))];
  const sources: Provenance[] = [];
  const seenSources = new Set<string>();
  for (const item of lineage) {
    const source = item.source;
    if (!source || !(nonempty(source.title) || nonempty(source.locator) || nonempty(source.timestamp) || nonempty(source.url) && isSafeUrl(source.url))) continue;
    const key = JSON.stringify([source.title, source.url, source.locator, source.timestamp]);
    if (!seenSources.has(key)) { sources.push(source); seenSources.add(key); }
  }
  const images = Array.isArray(current.data.images) ? current.data.images : [];
  const captions = images.flatMap((entry: unknown, index: number) => {
    const caption = entry && typeof entry === 'object' && 'caption' in entry ? entry.caption : undefined;
    return nonempty(caption) ? [{ label: images.length > 1 ? `Image ${index + 1}` : 'Caption', text: caption }] : [];
  });
  return { titles, sources, captions };
}

export function hasViewInformation(view: ViewSpec, container?: ViewSpec): boolean {
  const information = viewInformationContent(view, container);
  return information.titles.length > 0 || information.sources.length > 0 || information.captions.length > 0;
}
