import { describe, expect, it } from 'vitest';
import { checklistColumns, type ChecklistMeasurements } from '../../src/client/renderers/checklist-layout';

const items = Array.from({ length: 40 }, (_, i) => ({ text: `Item ${i + 1}` }));
const measured: ChecklistMeasurements = { width: 1250, labelWidths: items.map(() => 110), fontSize: 30, checkboxWidth: 37, itemGap: 30, columnGap: 28, minimumColumnWidth: 192 };
describe('content-aware checklist layout', () => {
  it('packs forty short labels into at least four columns without squeezing their contents', () => {
    const columns = checklistColumns(items, measured);
    expect(columns).toBeGreaterThanOrEqual(4);
    expect((measured.width - (columns - 1) * measured.columnGap) / columns).toBeGreaterThanOrEqual(110 + 37 + 30);
  });
  it('keeps phones single-column but lets prose and details use readable desktop columns', () => {
    expect(checklistColumns(items, { ...measured, width: 390 })).toBe(1);
    expect(checklistColumns(items, { ...measured, labelWidths: items.map((_, i) => i === 39 ? 550 : 110) })).toBe(1);
    expect(checklistColumns(items.map((item, i) => i === 39 ? { ...item, detail: 'Keep this supplied detail.' } : item), measured)).toBe(2);
    expect(checklistColumns([{ text: 'First\nSecond' }, ...items.slice(1)], measured)).toBe(2);
  });
  it('uses measured glyph widths and allows one column for larger font settings', () => {
    expect(checklistColumns(items, { ...measured, labelWidths: items.map(() => 390) })).toBe(2);
    expect(checklistColumns(items, { ...measured, width: 500, labelWidths: items.map(() => 300), fontSize: 60 })).toBe(1);
  });
  it('handles empty/single lists and unavailable measurements conservatively', () => {
    expect(checklistColumns([], measured)).toBe(1);
    expect(checklistColumns(items.slice(0, 1), measured)).toBe(1);
    expect(checklistColumns(items, { ...measured, labelWidths: [] })).toBe(1);
    expect(checklistColumns(items, { ...measured, labelWidths: items.map(() => NaN) })).toBe(1);
  });
});
