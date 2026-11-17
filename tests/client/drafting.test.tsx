import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { draftingDataSchema } from '../../src/shared/drafting';
import { isDraftTextBoundary } from '../../src/shared/drafting';
import { validateView } from '../../src/shared/view-schemas';
import { DraftingRenderer } from '../../src/client/renderers/Drafting';
import { draftAtEnd } from '../../src/client/renderers/Drafting';
import { draftTextEdit } from '../../src/client/renderers/Drafting';
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
import { ChartRenderer } from '../../src/client/renderers/Chart';
import { layoutXAxisTicks } from '../../src/client/renderers/Chart';
import { scheduleDays } from '../../src/client/renderers/Time';
import { scheduleWeekSpans } from '../../src/client/renderers/Time';
import { samples } from '../../src/shared/template-examples';
import { calendarDataSchema } from '../../src/shared/planner';
import { plannerDataSchema } from '../../src/shared/planner';
import { TOUR_GUIDANCE } from '../../src/shared/help';

describe("drafting coverage 1", () => {


describe('drafting reading and review surface', () => {
  it('renders exact draft text, purpose and supplied status with no recording or external-send controls', () => {
    const text = 'Keep  these spaces, 👋 Unicode & <script>inert</script>.\n\nA second passage.';
    const view = validateView({ version: 1, template: 'drafting', data: { text, purpose: 'Email draft', status: 'reviewing' } });
    const html = renderToStaticMarkup(<Renderer view={view} actionable revision={7} onRespond={async () => {}} />);
    expect(html).toContain('template-drafting'); expect(html).toContain('drafting-source');
    expect(html).toContain('Keep  these spaces, 👋 Unicode &amp; &lt;script&gt;inert&lt;/script&gt;.\n\n');
    expect(html).toContain('A second passage.'); expect(html).toContain('Email draft'); expect(html).toContain('Reviewing');
    expect(html).toContain('role="button"'); expect(html).toContain('aria-live="off"');
    expect(html).not.toMatch(/<script>|<textarea|contentEditable|Start recording|Listening|Send email|Accept suggestion|Reject suggestion/);
  });

  it('shows suggestions inline (struck-through original, escaped replacement, reason) without changing the source', () => {
    const text = 'Keep the original sentence.';
    const view = validateView({ version: 1, template: 'drafting', data: { text, status: 'reviewing', suggestions: [{ id: 'word', start: 9, end: 17, replacement: '<img src=x onerror=bad()>', reason: 'Review this wording' }], focus: { start: 9, end: 17, label: 'Look at this word' } } });
    const html = renderToStaticMarkup(<DraftingRenderer view={view} actionable revision={2} onRespond={async () => {}} />);
    expect(html).toContain('Keep the '); expect(html).toContain('<del class="drafting-del">original</del>'); expect(html).toContain(' sentence.');
    expect(html).toContain('data-suggestion-id="word"'); expect(html).toContain('<ins class="drafting-ins" data-draft-extra="">&lt;img src=x onerror=bad()&gt;</ins>');
    expect(html).toContain('Review this wording'); expect(html).toContain('1 suggested edit'); expect(html).toContain('Look at this word');
    expect(html).not.toContain('<img'); expect(html).not.toContain('drafting-suggestions'); expect(html).not.toContain('Review this passage');
    expect(view.data.text).toBe(text);
  });

  it('does not expose feedback controls to view-only or preview surfaces', () => {
    const view = validateView({ version: 1, template: 'drafting', data: { text: 'A note.', suggestions: [{ id: 'edit', start: 0, end: 1, replacement: 'The' }] } });
    for (const props of [{ actionable: false }, { actionable: true, preview: true }]) {
      const html = renderToStaticMarkup(<DraftingRenderer {...props} view={view} revision={1} onRespond={async () => {}} />);
      expect(html).not.toContain('role="button"'); expect(html).not.toContain('Review this passage'); expect(html).not.toContain('Review selected text');
      expect(html).toContain('View only.');
    }
    expect(renderToStaticMarkup(<DraftingRenderer view={{ version: 1, template: 'drafting', data: draftingDataSchema.parse({ text: '' }) }} />)).toContain('Your draft will appear here.');
  });

  it('uses character-safe minimal edits that retain unchanged native text nodes', () => {
    for (const [before, after] of [
      ['Original 👋 source.', 'Original 👋 source. New  text.'],
      ['Keep 😃 this ending', 'Keep 😄 this ending'],
      ['A source sentence', 'A revised source sentence'],
      ['A source sentence', 'A sentence'],
      ['👋', ''], ['', '👋'], ['Same source', 'Same source'],
      ['𐀀 tail', '𐐀 tail'], ['prefix 👋', 'prefix 💬'],
    ]) {
      const edit = draftTextEdit(before, after);
      expect(before.slice(0, edit.start) + edit.insert + before.slice(edit.start + edit.deleteCount)).toBe(after);
      expect(isDraftTextBoundary(before, edit.start)).toBe(true);
      expect(isDraftTextBoundary(before, edit.start + edit.deleteCount)).toBe(true);
    }
    expect(draftTextEdit('Keep 👋 this.', 'Keep 👋 this. Appended')).toEqual({ start: 'Keep 👋 this.'.length, deleteCount: 0, insert: ' Appended' });
  });

  it('recognizes the end of the actual scroll region, including short text and browser rounding', () => {
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 1100 })).toBe(true);
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 1099.5 })).toBe(true);
    expect(draftAtEnd({ scrollHeight: 1600, clientHeight: 500, scrollTop: 600 })).toBe(false);
    expect(draftAtEnd({ scrollHeight: 500, clientHeight: 500, scrollTop: 0 })).toBe(true);
  });
});
});

describe("drafting coverage 2", () => {


const html = (view: unknown) => renderToStaticMarkup(<Renderer view={validateView(view)} />);
const schedule = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ version: 1, template: 'schedule', ...extra, data: { timeZone: 'UTC', events: [], ...data } });
const roster = { mode: 'individual', start: '2026-11-02', end: '2026-11-15', person: 'Supplied nurse',
  shifts: [{ id: 'day', label: 'Day shift', code: 'D', segment: 'morning' }, { id: 'night', label: 'Night shift', code: 'W14', segment: 'night' }, { id: 'leave', label: 'Vacation', code: 'F' }],
  assignments: [{ date: '2026-11-02', shift: 'day' }, { date: '2026-11-03', shift: 'night' }, { date: '2026-11-04', shift: 'leave' }] };

describe("drafting contracts", () => {

  it('clips inline drafting suggestions to passages and keeps live web embeds pending until checked', () => {
    expect(draftMarks({ start: 0, end: 10 }, [{ id: 'a', start: 8, end: 14, replacement: 'X' }])).toEqual([{ id: 'a', start: 8, end: 10, replacement: 'X', last: false }]);
    expect(draftMarks({ start: 10, end: 20 }, [{ id: 'a', start: 8, end: 14, replacement: 'X', reason: 'Why' }])).toEqual([{ id: 'a', start: 10, end: 14, replacement: 'X', reason: 'Why', last: true }]);
    const web = html({ version: 1, template: 'web', data: { url: 'https://example.com/page', embed: true, text: 'Supplied summary' } });
    expect(web).not.toContain('<iframe'); expect(web).toContain('Checking whether this website allows live embedding');
  });});
});

describe("drafting coverage 3", () => {


const render = (template: 'calendar' | 'planner', data: Record<string, unknown>) => renderToStaticMarkup(<Renderer view={validateView({version:1,template,data})}/>);
const base = {anchorDate:'2026-09-27',timeZone:'UTC',items:[{id:'early',title:'Early run',start:'2026-09-27T05:00:00Z',end:'2026-09-27T05:45:00Z'},{id:'late',title:'Late call',start:'2026-09-27T23:00:00Z',end:'2026-09-27T23:30:00Z'}]};
const weather = [{time:'2026-09-27T13:00:00Z',condition:'rain',temperature:12,unit:'C',precipitationChance:80}];
describe("drafting contracts",()=>{
  it('shows attribution only for collaborative or explicitly enabled drafts',()=>{
    const actor={id:'alice',name:'Alice'},data={text:'Hello team',suggestions:[{id:'s1',start:0,end:5,replacement:'Hi',author:actor}],activity:[{actor,action:'accept',suggestionId:'old',revision:2,at:'2026-09-27T13:00:00Z'}]};
    const html=(extra:object)=>renderToStaticMarkup(<Renderer view={validateView({version:1,template:'drafting',data:{...data,...extra}})}/>);
    expect(html({})).not.toContain('Suggested by');expect(html({collaborative:true})).toContain('Suggested by Alice');expect(html({attribution:'show'})).toContain('Accepted old');expect(html({collaborative:true,attribution:'hide'})).not.toContain('Recent changes');
  });});
});
