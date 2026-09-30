import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer, type RendererProps } from '../../src/client/renderers/Renderer';
import { layoutDay, plannerBlocks } from '../../src/client/renderers/Planner';
import { samples } from '../../src/shared/template-examples';
import { validateView } from '../../src/shared/view-schemas';
import { plannerDataSchema } from '../../src/shared/planner';

const sample = samples.planner as unknown as { version: 1; template: 'planner'; data: Record<string, unknown> };
const html = (data: Record<string, unknown>, extra: Partial<RendererProps> = {}) => renderToStaticMarkup(<Renderer view={validateView({ ...sample, data: { ...sample.data, ...data } })} {...extra} />);
const decide = { actionable: true, onRespond: async () => undefined };

describe('schedule planner renderer (reported regression)', () => {
  it('packs overlapping blocks into side-by-side lanes', () => {
    expect(layoutDay([{ start: 60, end: 180 }, { start: 120, end: 240 }, { start: 300, end: 360 }]).map(entry => [entry.start, entry.lane, entry.lanes])).toEqual([[60, 0, 2], [120, 1, 2], [300, 0, 1]]);
  });

  it('strikes current placements, shows proposed ones with reasons, flags conflicts and offers decisions only when actionable', () => {
    const blocks = plannerBlocks(plannerDataSchema.parse(sample.data));
    expect(blocks.filter(block => block.state === 'struck').map(block => block.item.id)).toEqual(['dentist', 'boat']);
    expect(blocks.filter(block => block.state === 'proposed').map(block => block.proposal?.id)).toEqual(['move-boat', 'move-dentist']);
    expect(blocks.filter(block => block.conflict).map(block => block.item.id)).toEqual(['review', 'dentist']);
    const out = html({}, decide);
    expect(out).toContain('Draft plan'); expect(out).toContain('is-struck'); expect(out).toContain('is-proposed'); expect(out).toContain('is-conflict');
    expect(out).toContain('Friday afternoon is open'); expect(out).toContain('>Accept<'); expect(out).toContain('Ask for another option');
    expect(html({})).not.toContain('>Accept<');
  });

  it('shows a month grid and a committed plan without decisions', () => {
    expect(html({ view: 'month' })).toContain('planner-month');
    const committed = html({ status: 'committed', proposals: [], committedAt: '2026-11-01T10:00:00Z' }, decide);
    expect(committed).toContain('Committed plan'); expect(committed).not.toContain('>Accept<'); expect(committed).not.toContain('Nothing is final');
  });
});
