import type { ViewSpec } from './types.js';

/** Presentation metadata remains stored; none of these flags changes the payload. */
export interface LiveSurfaceFlags {
  showTitle?: boolean;
  showCaption?: boolean;
  showControls?: boolean;
}
export interface LiveSurfaceOptions {
  showTitle: boolean;
  showCaption: boolean;
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
    showControls: (view.showControls ?? container?.showControls) === true,
  };
}

export type LiveSurfaceMode = 'focus' | 'reading' | 'media' | 'interactive';
export interface LiveSurfaceLayout { mode: LiveSurfaceMode; fullBleed: boolean }

const mediaTemplates = new Set<string>(['colour','icon-picker','font-picker','welcome','split-screen','traffic-demo','satisfaction','signage','molecule','menu','menu-board','todays-special','opening-hours','back-at','closed-sign','hiring','sale-poster','health-notice','custom-sign','image-gallery','website','iframe', 'image', 'map', 'whiteboard', 'video', 'html', 'weather', 'presentation', 'now-playing']);
const readingTemplates = new Set<string>(['monitor-stream','message-board','task-list','tool-call-details','agents','database-schema','keyboard-shortcuts','standings','tool-call-log','email','inbox','chat','cards','bookmarks','tool-inventory','tool-detail','developer','operations','code-workspace','list', 'table', 'comparison', 'code', 'transcription', 'translation', 'schedule', 'timeline', 'itinerary', 'menu', 'leaderboard', 'notifications', 'drafting']);
const interactiveTemplates = new Set<string>(['json', 'session-topology', 'form', 'poll', 'qa', 'overview', 'settings', 'procedure', 'join']);

/** How the session text size reaches a view.
 * content: reference views (lists, tables, logs, documents, pickers) scale all of their content and lay it out again
 * in the same area, scrolling where they already scroll.
 * viewport: views composed to fill the screen are laid out for a proportionally smaller (or larger) screen, so text
 * set in fixed sizes changes while content sized to the screen keeps filling it instead of being cut off. */
export function textSizeMode(view: ViewSpec): 'content' | 'viewport' {
  if (['colour','icon-picker','font-picker'].includes(view.template)) return 'content';
  const mode = liveSurfaceLayout(view).mode;
  return mode === 'reading' || mode === 'interactive' ? 'content' : 'viewport';
}

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

