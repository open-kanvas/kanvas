import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { validateView } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
import { monthWeeks } from '../../src/client/renderers/Time';
import { scheduleIndex } from '../../src/client/renderers/Time';
import { scheduleMonths } from '../../src/client/renderers/Time';
import { draftMarks } from '../../src/client/renderers/Drafting';
import { sameConfig } from '../../src/client/hooks';
import { coverageSlots } from '../../src/shared/roster';
import { rosterDataSchema } from '../../src/shared/roster';
import { rosterMonths } from '../../src/shared/roster';
import { rosterTotals } from '../../src/shared/roster';
import { browserKind } from '../../src/shared/devices-view';
import { deviceKind } from '../../src/shared/devices-view';
import { chartDataSchema } from '../../src/shared/view-schemas';
import { choroplethPaths } from '../../src/client/renderers/AdvancedCharts';
import { regionGeometry } from '../../src/client/renderers/AdvancedCharts';
import { itineraryMap } from '../../src/client/renderers/Itinerary';
import { extendedSchemas } from '../../src/shared/extended-templates';
import { selectRows } from '../../src/shared/selection';
import { selectionSchema } from '../../src/shared/selection';
import { cellEmphasis } from '../../src/shared/emphasis';
import { pointEmphasis } from '../../src/shared/emphasis';

describe("media coverage 1", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("media contracts", () => {

  it('shows image stories as a news list and keeps visible text on text-only cards', () => {
    const news = html({ version: 1, template: 'story-cards', data: { items: [{ headline: 'Harbour opens', summary: 'Summary one', image: { url: 'https://example.com/a.jpg', alt: 'Harbour' } }, { headline: 'Library', summary: 'Summary two' }] } });
    expect(news).toContain('story-news'); expect(news).toContain('has-image'); expect(news).toContain('Summary one'); expect(news).toContain('Summary two');
    const text = html({ version: 1, template: 'story-cards', data: { items: [{ headline: 'Only text', summary: 'No images' }] } });
    expect(text).toContain('story-text'); expect(text).not.toContain('story-news'); expect(text).toContain('No images');
  });});
});

describe("media coverage 2", () => {

const view=(template:string,data:unknown)=>validateView({version:1,template,data});
describe('feedback template contracts and source preservation',()=>{
 it('compares ten distinct entities with images, free commentary, highlighted cells and exact values',()=>{const v=view('comparison',{criteria:['Price'],items:Array.from({length:10},(_,i)=>({name:`A very long hotel name ${i}`,values:{Price:'9007199254740993.0001'},...(i===0?{image:{url:'https://example.com/photo.png',alt:'Photo'},highlights:['Price']}:{} )})),commentary:{Price:'No calculated winner'}});const html=renderToStaticMarkup(<Renderer view={v}/>);expect(html).toContain('alt="Photo"');expect(html).toContain('No calculated winner');expect(html).toContain('cell-emphasis');expect(html.match(/9007199254740993.0001/g)).toHaveLength(10);expect(()=>view('comparison',{...v.data,items:[...(v.data.items as unknown[]),{}]})).toThrow();});
 it('accepts safe marker image/color/formatted popup fields but rejects unsafe URL and CSS',()=>{expect(()=>view('map',{markers:[{lat:59,lng:10,color:'#123456',iconUrl:'https://example.com/pin.png',popupHtml:'<b>Stats</b>'}]})).not.toThrow();expect(()=>view('map',{markers:[{lat:59,lng:10,iconUrl:'javascript:alert(1)'}]})).toThrow();expect(()=>view('map',{markers:[{lat:59,lng:10,color:'red;display:none'}]})).toThrow();});});
});
