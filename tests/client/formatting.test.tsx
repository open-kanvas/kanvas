import { resolveToolCall } from '../../src/server/mcp/catalog';
import { z } from 'zod';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { templateViewSchema } from '../../src/shared/view-schemas';
import { samples } from '../../src/shared/template-examples';
import { templateNames } from '../../src/shared/template-examples';
import { TEMPLATE_DISPLAY_GUIDANCE } from '../../src/shared/display-guidance';
import { calendarDataSchema } from '../../src/shared/planner';
import { diagramLayout } from '../../src/shared/diagrams';
import { orgChartDataSchema } from '../../src/shared/diagrams';
import { networkDataSchema } from '../../src/shared/diagrams';
import { regionalDateTime } from '../../src/shared/regional';
import { regionalClock } from '../../src/shared/regional';
import { DEFAULT_CONFIG } from '../../src/shared/preferences';
import { SOURCE_RECORD_TEMPLATES } from '../../src/shared/source-guidance';
import { regionalTime } from '../../src/shared/regional';
import { flowchartDataSchema } from '../../src/shared/diagrams';
import { fitFlowchart } from '../../src/shared/diagrams';
import { profileInstructions } from '../../src/server/mcp/profile-guidance';
import { profileDescription } from '../../src/server/mcp/profile-guidance';
import { profileGuide } from '../../src/server/mcp/profile-guidance';
import { guideFor } from '../../src/server/mcp/guide';
import type { TemplateId } from '../../src/shared/types';

describe("formatting coverage 1", () => {
    const base = { anchorDate: '2026-09-01', timeZone: 'UTC', view: 'month', items: [{ id: 'roma', title: 'Roma', allDay: true, start: '2026-09-20', end: '2026-09-27' }] };
    const render = (template: string, data: unknown) => renderToStaticMarkup(<Renderer view={validateView({ version: 1, template, data })}/>);
    describe("formatting contracts", () => {
        it('accepts formatting overrides through the public submit operation', () => {
            const result = resolveToolCall('discovery', 'kanvas_call', { operationId: 'kanvas.publish', arguments: { sessionId: 's', displayIds: ['d'], requestId: 'r', view: { version: 1, template: 'inbox', format: { timeFormat: '12h' }, data: { items: [] } } } });
            expect(result.error).toBeUndefined();
        });
    });
});

describe("formatting coverage 2", () => {

describe("formatting contracts",()=>{
  it('formats DST and date boundaries with per-view precedence, keeping source timestamps unchanged',()=>{
    const timestamp='2026-09-27T23:30:00Z';
    expect(regionalDateTime(timestamp,{timeZone:'Europe/Oslo',dateFormat:'iso',timeFormat:'24h'})).toBe('2026-09-28 · 01:30 Europe/Oslo');
    expect(regionalTime('2026-01-27T23:30:00Z',{timeZone:'Europe/Oslo',timeFormat:'24h'})).toBe('00:30');
    const view=validateView({version:1,template:'inbox',format:{timeZone:'America/New_York',timeFormat:'24h'},data:{items:[{id:'m',from:'Sender',subject:'Source',timestamp}]}}),before=structuredClone(view);
    expect(renderToStaticMarkup(<Renderer view={view} config={{...DEFAULT_CONFIG,timeZone:'Europe/Oslo'}}/>)).toContain('19:30 America/New_York');expect(view).toEqual(before);
    const local=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(timestamp));expect(regionalTime(timestamp,{timeFormat:'24h'})).toBe(local);
    expect(regionalDateTime('source prose',{timeZone:'Europe/Oslo'})).toBe('source prose');
  });});
});
