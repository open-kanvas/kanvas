import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import type { RendererProps } from '../../src/client/renderers/Renderer';
import { layoutDay } from '../../src/client/renderers/Planner';
import { plannerBlocks } from '../../src/client/renderers/Planner';
import { samples } from '../../src/shared/template-examples';
import { validateView } from '../../src/shared/view-schemas';
import { plannerDataSchema } from '../../src/shared/planner';
import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { templateNames } from '../../src/shared/template-examples';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { calendarDataSchema } from '../../src/shared/planner';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { networkDataSchema } from '../../src/shared/diagrams';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalClock } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';

describe("planner coverage 1", () => {


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
});

describe("planner coverage 2", () => {

const base={anchorDate:'2026-09-01',timeZone:'UTC',view:'month',items:[{id:'roma',title:'Roma',allDay:true,start:'2026-09-20',end:'2026-09-27'}]};
const render=(template:string,data:unknown)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
describe("planner contracts",()=>{
  it('shares continuous, exclusive-end month bars in calendar, planner and schedule, splitting only at week boundaries',()=>{
    for(const template of ['calendar','planner']){const html=render(template,base);expect(html.match(/data-event-id="roma"/g)).toHaveLength(2);expect(html.match(/data-item-id="roma"/g)).toHaveLength(2);expect(html).toContain('grid-column:1 / 7');}
    const html=render('schedule',{date:'2026-09-01',view:'month',timeZone:'UTC',events:base.items.map(i=>({...i,start:i.start+'T00:00:00Z',end:i.end+'T00:00:00Z'}))});expect(html.match(/data-event-id="roma"/g)).toHaveLength(2);
  });});
});

it('month entries cover timed multi-day intervals in the planner timezone with an exclusive midnight end',()=>{
 const render=(start:string,end:string)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template:'planner',data:{view:'month',anchorDate:'2026-11-01',timeZone:'Europe/Oslo',items:[{id:'conf',title:'Conference',start,end}]}})}/>);
 const html=render('2026-11-17T09:00+01:00','2026-11-19T17:00+01:00');
 expect(html.match(/data-item-id="conf"/g)).toHaveLength(3);expect(html.match(/>↳ continued</g)).toHaveLength(2);
 expect(render('2026-11-17T09:00+01:00','2026-11-19T00:00+01:00').match(/data-item-id="conf"/g)).toHaveLength(2);
 expect(render('2026-10-31T23:30Z','2026-11-02T00:00+01:00').match(/data-item-id="conf"/g)).toHaveLength(1);
});
