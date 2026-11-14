import type { ViewSpec } from './types.js';

/** Split-screen geometry. An even grid of 1-4 rows by 1-4 columns, filled row by
 * row; one top-level pane may itself hold a grid, and that is the only nesting. */
export const SPLIT_LIMITS = { axis: 4, leaves: 16 } as const;
export const SPLIT_DIVIDER_DEFAULT = { gap: 6, borderWidth: 1 } as const;
export type SplitDirection = 'vertical' | 'horizontal';
export interface SplitLeafPane { id: string; view: ViewSpec }
export interface SplitGridPane { id: string; rows?: number; columns?: number; direction?: SplitDirection; panes: SplitLeafPane[] }
export type SplitPane = SplitLeafPane | SplitGridPane;
export interface SplitDivider { gap?: number; borderWidth?: number; borderColor?: string }
export interface SplitScreenData { rows?: number; columns?: number; direction?: SplitDirection; divider?: 'none' | SplitDivider; panes: SplitPane[] }

export const isGridPane = (pane: SplitPane): pane is SplitGridPane => Array.isArray((pane as SplitGridPane).panes);

/** Rows and columns for a pane list. Stated values win and the missing one is
 * derived; with neither, 2 and 3 panes form one lane in `direction`, and 4 and 6
 * keep the two-row arrangement they had before grids were configurable. */
export function splitGrid(count: number, rows?: number, columns?: number, direction: SplitDirection = 'vertical'): { rows: number; columns: number } | undefined {
  const axis = (n: number) => Number.isInteger(n) && n >= 1 && n <= SPLIT_LIMITS.axis;
  if (rows !== undefined && columns !== undefined) return axis(rows) && axis(columns) && rows * columns === count ? { rows, columns } : undefined;
  if (rows !== undefined) return axis(rows) && axis(count / rows) ? { rows, columns: count / rows } : undefined;
  if (columns !== undefined) return axis(columns) && axis(count / columns) ? { rows: count / columns, columns } : undefined;
  if (count === 2 || count === 3) return direction === 'horizontal' ? { rows: count, columns: 1 } : { rows: 1, columns: count };
  if (count === 4) return { rows: 2, columns: 2 };
  if (count === 6) return { rows: 2, columns: 3 };
  return undefined;
}

/** Every rendered pane, in reading order, with the JSON Pointer of its view. */
export function splitLeaves(data: { panes?: unknown }): { id: string; view: ViewSpec; path: string }[] {
  const out: { id: string; view: ViewSpec; path: string }[] = [];
  if (!Array.isArray(data.panes)) return out;
  (data.panes as SplitPane[]).forEach((pane, i) => {
    if (!pane || typeof pane !== 'object') return;
    if (isGridPane(pane)) pane.panes.forEach((inner, j) => { if (inner && typeof inner === 'object' && inner.view) out.push({ id: inner.id, view: inner.view, path: `/data/panes/${i}/panes/${j}/view` }); });
    else if (pane.view) out.push({ id: pane.id, view: pane.view, path: `/data/panes/${i}/view` });
  });
  return out;
}

/** Rebuild the same structure with each pane view replaced. */
export async function mapSplitViews<T extends { panes?: unknown }>(data: T, change: (view: ViewSpec) => ViewSpec | Promise<ViewSpec>): Promise<T> {
  const panes: SplitPane[] = [];
  for (const pane of data.panes as SplitPane[]) {
    if (isGridPane(pane)) { const inner: SplitLeafPane[] = []; for (const leaf of pane.panes) inner.push({ ...leaf, view: await change(leaf.view) }); panes.push({ ...pane, panes: inner }); }
    else panes.push({ ...pane, view: await change(pane.view) });
  }
  return { ...data, panes };
}
export function mapSplitViewsSync<T extends { panes?: unknown }>(data: T, change: (view: ViewSpec) => ViewSpec): T {
  return { ...data, panes: (data.panes as SplitPane[]).map(pane => isGridPane(pane) ? { ...pane, panes: pane.panes.map(leaf => ({ ...leaf, view: change(leaf.view) })) } : { ...pane, view: change(pane.view) }) };
}

/** Resolved divider in CSS pixels; undefined colour means the theme's muted line. */
export function splitDivider(divider: SplitScreenData['divider']): { gap: number; borderWidth: number; borderColor?: string } {
  if (divider === 'none') return { gap: 0, borderWidth: 0 };
  return { gap: divider?.gap ?? SPLIT_DIVIDER_DEFAULT.gap, borderWidth: divider?.borderWidth ?? SPLIT_DIVIDER_DEFAULT.borderWidth, ...(divider?.borderColor ? { borderColor: divider.borderColor } : {}) };
}
