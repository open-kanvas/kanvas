import { useLayoutEffect, useState, type RefObject } from 'react';

type Item = { text: string; detail?: string };
export interface ChecklistMeasurements {
  width: number;
  labelWidths: number[];
  fontSize: number;
  checkboxWidth: number;
  itemGap: number;
  columnGap: number;
  minimumColumnWidth: number;
}

/** Keep prose full-width. Compact labels use their rendered width, not a
 * character count, so wide glyphs, fonts and zoom cannot silently crowd rows. */
export function checklistColumns(items: readonly Item[], measured: ChecklistMeasurements): number {
  if (items.length < 2) return 1;
  const { width, labelWidths, fontSize, checkboxWidth, itemGap, columnGap, minimumColumnWidth } = measured;
  if (width < 480 || labelWidths.length !== items.length || !labelWidths.every(Number.isFinite)) return 1;
  const widest = Math.max(...labelWidths);
  const prose = items.some(item => Boolean(item.detail) || /[\r\n]/.test(item.text)) || widest > fontSize * 12;
  // Leave a little breathing room beyond the measured label and checkbox.
  const columnWidth = Math.max(minimumColumnWidth, (prose ? Math.min(widest, fontSize * 24) : widest) + checkboxWidth + itemGap + fontSize * .5, prose ? fontSize * (items.some(item=>(item.detail?.length??0)>100||item.text.length>100)?28:20) : 0);
  return Math.max(1, Math.min(items.length, Math.floor((width + columnGap) / (columnWidth + columnGap))));
}

export function useChecklistColumns(ref: RefObject<HTMLUListElement | null>, items: readonly Item[]): number {
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const labels = [...list.querySelectorAll<HTMLElement>(':scope > li > div > span')];
      const first = labels[0], row = first?.parentElement?.parentElement;
      const checkbox = row?.querySelector<HTMLElement>('.checklist-checkbox');
      if (!first || !row || !checkbox || list.closest('.is-preview')) {
        setColumns(1); return;
      }
      // Measure native text shaping off-layout, with the exact computed label
      // styles. Batch insert/read/remove to avoid a layout pass for every item.
      const probes = labels.map(label => {
        const probe = label.cloneNode(true) as HTMLElement;
        probe.setAttribute('aria-hidden', 'true');
        Object.assign(probe.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre', width: 'max-content', maxWidth: 'none', left: '0', top: '0' });
        label.parentElement!.append(probe);
        return probe;
      });
      const labelWidths = probes.map(probe => probe.getBoundingClientRect().width);
      probes.forEach(probe => probe.remove());
      const fontSize = parseFloat(getComputedStyle(first).fontSize);
      setColumns(checklistColumns(items, {
        width: list.clientWidth, labelWidths, fontSize,
        checkboxWidth: checkbox.getBoundingClientRect().width,
        itemGap: parseFloat(getComputedStyle(row).columnGap) || 0,
        columnGap: parseFloat(getComputedStyle(list).columnGap) || 0,
        minimumColumnWidth: 12 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    // Font completion can change text widths without changing the list box.
    document.fonts.addEventListener('loadingdone', measure);
    void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure); };
  }, [ref, items]);
  return columns;
}

type FocusItem = { id: string; text: string; checked?: boolean; detail?: string };
/** Which item an update is "about": a newly chosen highlight first, otherwise
 * the last item that was ticked, unticked, reworded, annotated or added. A
 * re-render that changes nothing has no focus, so the reader's place is kept. */
export function checklistFocus(before: readonly FocusItem[], after: readonly FocusItem[], highlightBefore?: string, highlightAfter?: string): string | undefined {
  if (highlightAfter && highlightAfter !== highlightBefore && after.some(item => item.id === highlightAfter)) return highlightAfter;
  const earlier = new Map(before.map(item => [item.id, item]));
  let focus: string | undefined;
  for (const item of after) {
    const old = earlier.get(item.id);
    if (!old || Boolean(old.checked) !== Boolean(item.checked) || old.text !== item.text || (old.detail ?? '') !== (item.detail ?? '')) focus = item.id;
  }
  return focus;
}
/** Scroll distance that brings the focused item to the middle of the list, or
 * undefined when it already sits comfortably in view and nothing should move.
 * "Comfortably" is deliberately generous: the list starts moving well before
 * the item reaches an edge. While the reader is scrolling by hand only an item
 * that is completely out of sight is fetched. */
export function checklistScrollDelta(box: { top: number; height: number }, item: { top: number; bottom: number }, readerBusy = false): number | undefined {
  if (box.height <= 0) return undefined;
  const bottom = box.top + box.height;
  const hidden = item.bottom <= box.top || item.top >= bottom;
  const comfortable = item.top >= box.top + box.height * .12 && item.bottom <= bottom - box.height * .25;
  if (readerBusy ? !hidden : comfortable) return undefined;
  const itemHeight = item.bottom - item.top;
  // An item taller than the list is shown from its first line.
  const delta = itemHeight >= box.height ? item.top - box.top : (item.top + itemHeight / 2) - (box.top + box.height / 2);
  return Math.abs(delta) < 1 ? undefined : delta;
}
