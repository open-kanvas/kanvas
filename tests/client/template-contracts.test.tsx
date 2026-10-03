import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import type { TemplateId } from '../../src/shared/types';
import { templateViewSchema, validateView } from '../../src/shared/view-schemas';
import { Renderer } from '../../src/client/renderers/Renderer';
import { boardLabelColor, wrapBoardText } from '../../src/client/renderers/Whiteboard';
import { countdownRemainingSeconds, dateInTimeZone, eventsOnDate, formatCountdown, scheduleDays } from '../../src/client/renderers/Time';

const view = (template: TemplateId, data: Record<string, unknown>) => validateView({ version: 1, template, data });
const poll = { question: 'Choose a focus', options: [{ id: 'a', label: 'Clarity' }, { id: 'b', label: 'Depth' }] };
const form = { fields: [{ id: 'name', type: 'text', label: 'Your name', required: true }, { id: 'score', type: 'range', label: 'Score', min: 0, max: 10, step: 1 }, { id: 'topic', type: 'choice', label: 'Topic', options: [{ id: 'a', label: 'Clarity' }, { id: 'b', label: 'Depth' }] }] };

describe('reported visual and source-trust regressions', () => {
  it('renders labels on filled whiteboard shapes with readable contrast', () => {
    const input = view('whiteboard', { elements: ['First idea', 'Second idea', 'Third idea'].map((text, index) => ({ id: `note-${index}`, type: 'rect', x: index * 240 + 50, y: 100, width: 200, height: 140, text, fill: '#ffff00', color: '#ffff00' })) });
    const html = renderToStaticMarkup(<Renderer view={input} />);
    for (const text of ['First idea', 'Second idea', 'Third idea']) expect(html).toContain(text);
    expect(html.match(/class="board-shape-text"/g)).toHaveLength(3);
    expect(html.match(/fill="#000000"/g)).toHaveLength(3);
    expect(boardLabelColor('#000000', '#000000')).toBe('#ffffff');
    expect(boardLabelColor('#25332b', '#ffff00')).toBe('#25332b');
  });

  it('preserves repeated whitespace and Unicode when wrapping a board label', () => {
    const text = 'Exact  spaces, 🧭 navigation and 9007199254740993.0000';
    expect(wrapBoardText(text, 12).join('')).toBe(text);
    expect(wrapBoardText('First\n\nThird', 10)).toEqual(['First', '', 'Third']);
  });

  it('includes actual code on first render without a deferred code-module placeholder', () => {
    const input = view('code', { kind: 'code', language: 'typescript', code: 'const original = "<img src=x onerror=alert(1)>";\nconsole.log(original);' });
    const html = renderToStaticMarkup(<Renderer view={input} />);
    expect(html).toContain('code-content');
    expect(html).toContain('original');
    expect(html).toContain('Line 2');
    expect(html).not.toContain('Loading view');
    expect(html).not.toContain('<img');
  });

  it('unmistakably distinguishes supplied web prose and capture dates from fetched evidence', () => {
    const html = renderToStaticMarkup(<Renderer view={view('web', { url: 'https://example.com/page', title: 'The actual page?', text: 'A plausible description.' })} />);
    expect(html).toContain('Supplied summary · not a fetched excerpt');
    expect(html).not.toContain('Source excerpt');
    const snapshot = renderToStaticMarkup(<Renderer view={{ ...view('web', { url: 'https://example.com/page', snapshotUrl: 'https://example.com/supplied.png', retrievedAt: '2026-09-09T12:00:00Z' }), showCaption: true }} />);
    expect(snapshot).toContain('Supplied capture time: 2026-09-09T12:00:00Z · unverified');
    expect(snapshot).toContain('Supplied snapshot · not independently verified');
  });
});

describe('dedicated transcript and translation fidelity', () => {
  it('retains exact speaker, timestamp, spacing and source text', () => {
    const text = 'We said:  “Keep this.”\nIncluding the next line & <not markup>.';
    const input = view('transcription', { status: 'live', segments: [{ id: 'line', speaker: 'Speaker 01', timestamp: '00:00:01.000001', text }] });
    expect(input.data).toMatchObject({ segments: [{ timestamp: '00:00:01.000001', text }] });
    const html = renderToStaticMarkup(<Renderer view={input} />);
    expect(html).toContain('Speaker 01');
    expect(html).toContain('00:00:01.000001');
    expect(html).toContain('We said:  “Keep this.”\nIncluding the next line &amp; &lt;not markup&gt;.');
    expect(html).not.toContain('Supplied text');
  });

  it('keeps both languages and the original even if generic fact original-retention is disabled', () => {
    const sourceText = 'Hei.  Dette er originalen.\nIkke skriv den om.', targetText = 'Hello.  This is the original.\nDo not rewrite it.';
    const input = view('translation', { sourceText, targetText, sourceLanguage: 'nb', targetLanguage: 'en' });
    const html = renderToStaticMarkup(<Renderer view={input} config={{ theme: 'dark', accent: '#b9ed87' }} />);
    expect(html).toContain(sourceText);
    expect(html).toContain(targetText);
    expect(html).toContain('lang="nb"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('aria-label="Original text"');
  });

  it('rejects absent translation source/language and duplicate transcript IDs', () => {
    expect(() => view('translation', { targetText: 'Hello', targetLanguage: 'en' })).toThrow();
    expect(() => view('transcription', { segments: [{ id: 'same', text: 'One' }, { id: 'same', text: 'Two' }] })).toThrow();
  });
});

describe('intrinsic participation contracts', () => {
  it('uses real fields with browser labels, IDs and limits', () => {
    const html = renderToStaticMarkup(<Renderer view={view('form', form)} actionable onRespond={async () => {}} />);
    expect(html).toContain('type="text"');
    expect(html).toContain('type="range"');
    expect(html).toContain('<select');
    expect(html).toContain('name="name"');
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('required=""');
    expect(html).toContain('Submit response');
  });

  it('never leaks hidden poll tallies, even if an inconsistent projection contains them', () => {
    const html = renderToStaticMarkup(<Renderer view={view('poll', { ...poll, revealResults: true })} responseState={{ poll: { revealed: false, totalVotes: 424242, counts: { a: 424241, b: 1 } } }} />);
    expect(html).not.toContain('42424');
    expect(html).not.toContain('poll-count');
    expect(html).not.toContain('poll-bar');
    expect(html).toContain('Results are hidden');
    const noProjection = renderToStaticMarkup(<Renderer view={view('poll', { ...poll, revealResults: true })} />);
    expect(noProjection).not.toContain('0 participants');
    expect(noProjection).toContain('Results are hidden');
  });

  it('renders only server-projected revealed vote counts', () => {
    const html = renderToStaticMarkup(<Renderer view={view('poll', poll)} responseState={{ poll: { revealed: true, totalVotes: 4, counts: { a: 3, b: 1 } } }} />);
    expect(html).toContain('3 votes');
    expect(html).toContain('1 vote');
    expect(html).toContain('4 participants have');
    expect(html).toContain('width:75%');
  });

  it('never accepts client-authored aggregates in poll or Q&A content', () => {
    expect(() => view('poll', { ...poll, counts: { a: 50 } })).toThrow();
    expect(() => view('poll', { ...poll, options: [{ id: 'a', label: 'One', votes: 50 }, { id: 'b', label: 'Two' }] })).toThrow();
    expect(() => view('qa', { prompt: 'Questions?', entries: [{ id: 'injected', text: 'Fake audience' }] })).toThrow();
  });

  it('withholds hidden Q&A text and displays exact revealed submissions as inert text', () => {
    const input = view('qa', { prompt: 'Questions?' }), secret = '<script>hidden audience text</script>';
    const hidden = renderToStaticMarkup(<Renderer view={input} responseState={{ qa: { revealed: false, entries: [{ id: '1', text: secret }] } }} />);
    expect(hidden).not.toContain('hidden audience text');
    const visible = renderToStaticMarkup(<Renderer view={input} responseState={{ qa: { revealed: true, entries: [{ id: '1', text: secret }] } }} />);
    expect(visible).toContain('&lt;script&gt;hidden audience text&lt;/script&gt;');
    expect(visible).not.toContain('<script>');
  });

  it('rejects ambiguous, unbounded or reserved form definitions', () => {
    expect(() => view('form', { fields: Array.from({ length: 41 }, (_, i) => ({ id: `field-${i}`, type: 'text', label: 'Name' })) })).toThrow();
    expect(() => view('form', { fields: [{ id: 'constructor', type: 'text', label: 'Name' }] })).toThrow();
    expect(() => view('form', { fields: [{ id: 'r', type: 'range', label: 'Rating', min: 5, max: 1 }] })).toThrow();
    expect(() => view('form', { fields: [{ id: 'a', type: 'choice', label: 'Choice', options: [{ id: 'same', label: 'One' }, { id: 'same', label: 'Two' }] }] })).toThrow();
    expect(() => view('form', { fields: [{ id: 'a', type: 'text', label: 'A', maxLength: 10_001 }] })).toThrow();
    expect(() => view('poll', { ...poll, maxChoices: 3 })).toThrow();
  });

  it('provides discoverable strict JSON schemas for all seven new families', () => {
    for (const template of ['transcription', 'translation', 'form', 'schedule', 'poll', 'countdown', 'qa'] as const) {
      const schema = z.toJSONSchema(templateViewSchema(template));
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties?.data).toBeDefined();
    }
  });
});

describe('calendar and countdown time semantics', () => {
  const events = [{ id: 'dst', title: 'DST-crossing event', start: '2026-10-24T23:30:00+02:00', end: '2026-10-25T02:30:00+01:00', allDay: false }, { id: 'midnight', title: 'Ends at midnight', start: '2026-10-25T23:00:00+01:00', end: '2026-10-26T00:00:00+01:00', allDay: false }];
  it('uses the supplied timezone, keeps overnight events and treats midnight end as exclusive', () => {
    expect(dateInTimeZone('2026-10-24T22:30:00Z', 'Europe/Oslo')).toBe('2026-10-25');
    expect(eventsOnDate(events, '2026-10-24', 'Europe/Oslo').map(event => event.id)).toEqual(['dst']);
    expect(eventsOnDate(events, '2026-10-25', 'Europe/Oslo').map(event => event.id)).toEqual(['dst', 'midnight']);
    expect(eventsOnDate(events, '2026-10-26', 'Europe/Oslo')).toEqual([]);
    expect(scheduleDays('2027-01-01', 'week')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('requires an explicit timezone/offset and chronological events', () => {
    expect(() => view('schedule', { date: '2026-02-31', timeZone: 'UTC', events: [] })).toThrow();
    expect(() => view('schedule', { date: '2026-09-09', timeZone: 'Not/AZone', events: [] })).toThrow();
    expect(() => view('schedule', { date: '2026-09-09', timeZone: 'UTC', events: [{ id: 'x', title: 'Ambiguous time', start: '2026-09-09T10:00:00', end: '2026-09-09T11:00:00' }] })).toThrow();
    expect(() => view('schedule', { date: '2026-09-09', timeZone: 'UTC', events: [{ id: 'x', title: 'Reversed', start: '2026-09-09T11:00:00Z', end: '2026-09-09T10:00:00Z' }] })).toThrow();
  });

  it('does not pretend a browser wall clock is a synchronized server countdown', () => {
    const input = view('countdown', { endsAt: '2026-09-09T16:00:00Z' });
    const unsynchronized = renderToStaticMarkup(<Renderer view={input} />);
    expect(unsynchronized).toContain('Syncing time…');
    expect(unsynchronized).toContain('Waiting for server time');
    expect(unsynchronized).not.toContain('Server-synced');
    const synchronized = renderToStaticMarkup(<Renderer view={input} serverNow="2026-09-09T15:59:50Z" />);
    expect(synchronized).toContain('00:00:10');
    expect(countdownRemainingSeconds({ endsAt: '2026-09-09T16:00:00Z' }, Date.parse('2026-09-09T16:01:00Z'))).toBe(0);
    expect(countdownRemainingSeconds({ endsAt: '2026-09-09T16:00:00Z', pausedRemainingSeconds: 123 }, 99e12)).toBe(123);
    expect(formatCountdown(90061)).toBe('1d 01:01:01');
  });
});
