import { describe, expect, it } from 'vitest';
import { treemapLayout } from '../../src/client/renderers/AdvancedCharts';
import { CATEGORICAL_PALETTE, categoricalColor, seriesColor } from '../../src/client/renderers/chart-palette';

describe('categorical chart colours (reported regression)', () => {
  it('keeps the accent for one series and muted categorical colours for several', () => {
    expect(seriesColor(0, 1)).toBe('var(--accent)');
    expect(seriesColor(0, 3)).toBe(CATEGORICAL_PALETTE[0]); expect(seriesColor(2, 3)).toBe(CATEGORICAL_PALETTE[2]);
    expect(new Set(CATEGORICAL_PALETTE).size).toBe(8);
    expect(CATEGORICAL_PALETTE.some(color => color.includes('--accent'))).toBe(false);
    expect(categoricalColor(9)).toBe(CATEGORICAL_PALETTE[1]); expect(categoricalColor(-1)).toBe(CATEGORICAL_PALETTE[7]);
  });
  it('colours the children of a single treemap root distinctly, and top-level roots as before', () => {
    const single = treemapLayout([{ id: 'root', label: 'Company' }, { id: 'eng', parent: 'root', value: 5 }, { id: 'sales', parent: 'root', value: 3 }, { id: 'ops', parent: 'root', value: 2 }, { id: 'eng-web', parent: 'eng', value: 5 }], 800, 400);
    const groups = new Map(single.map(box => [box.node.id, box.group]));
    expect(new Set(['eng', 'sales', 'ops'].map(id => groups.get(id))).size).toBe(3);
    expect(groups.get('eng-web')).toBe(groups.get('eng'));
    const roots = treemapLayout([{ id: 'a', value: 2 }, { id: 'b', value: 1 }, { id: 'a1', parent: 'a', value: 2 }], 800, 400);
    expect(roots.find(box => box.node.id === 'a1')?.group).toBe(roots.find(box => box.node.id === 'a')?.group);
    expect(roots.find(box => box.node.id === 'b')?.group).not.toBe(roots.find(box => box.node.id === 'a')?.group);
  });
});
