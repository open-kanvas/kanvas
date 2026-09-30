import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeRenderer } from '../../src/client/renderers/Code';
import { Renderer } from '../../src/client/renderers/Renderer';
import { ViewInformation } from '../../src/client/renderers/ViewInformation';
import WhiteboardRenderer from '../../src/client/renderers/Whiteboard';
import { hasViewInformation, liveSurfaceLayout, liveSurfaceOptions, viewInformationContent, type LiveSurfaceFlags } from '../../src/shared/live-surface';
import { samples } from '../../src/shared/template-examples';
import { type ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';

type SurfaceView = ViewSpec & LiveSurfaceFlags;
const source = { title: 'Exact submitted source', url: 'https://example.com/original', locator: 'Page 12', timestamp: '2026-09-14T10:00:00Z' };
const fact: SurfaceView = { version: 1, template: 'fact', title: 'Stored metadata title', data: { text: 'One useful idea.' }, source };

describe('live surface metadata is opt-in across the catalog', () => {
  it('preserves explicit flags and exact metadata through schema validation', () => {
    const view = validateView({ ...fact, showTitle: false, showCaption: true, showSource: true, showControls: false });
    expect(view).toMatchObject({ title: fact.title, source, showTitle: false, showCaption: true, showSource: true, showControls: false });
    const html = renderToStaticMarkup(<Renderer view={view} />);
    expect(html).not.toContain('class="view-heading"');
    expect(html).toContain('Source &amp; info');
    expect(html).not.toContain('Illustrative data');
    expect(html).toContain('Exact submitted source');
    expect(html).toContain('Page 12');
    expect(html).toContain('2026-09-14T10:00:00Z');
  });

  it('requires a deliberate title flag even for chart, table and reading documents', () => {
    for (const template of ['chart', 'table', 'document'] as const) {
      const view = { ...samples[template], title: 'Exact context', showTitle: true };
      expect(renderToStaticMarkup(<Renderer view={view} />)).toContain('<h1>Exact context</h1>');
      expect(renderToStaticMarkup(<Renderer view={{ ...view, showTitle: false }} />)).not.toContain('<h1>');
    }
    const html = renderToStaticMarkup(<Renderer view={{ version: 1, template: 'number', title: 'Only metadata', data: { value: '9007199254740993.000001', unit: 'NOK' } }} />);
    expect(html).not.toContain('class="number-label"');
    expect(html).toContain('9007199254740993.000001');
    expect(html).toContain('NOK');
  });

  it('does not create empty affordances from blank metadata or invalid source links', () => {
    const empty: SurfaceView = { ...fact, title: '  ', source: { title: '', locator: ' ' }, showTitle: true, showSource: true };
    expect(hasViewInformation(empty)).toBe(false);
    expect(renderToStaticMarkup(<ViewInformation view={empty} />)).toBe('');
    expect(renderToStaticMarkup(<Renderer view={empty} />)).not.toContain('view-heading');
    expect(hasViewInformation({ ...empty, source: { url: 'javascript:alert(1)' } })).toBe(false);
    expect(renderToStaticMarkup(<ViewInformation view={empty} placement="menu" />)).toBe('');
  });

  it('makes stored metadata available in the deliberate display menu, not a hidden default widget', () => {
    expect(renderToStaticMarkup(<ViewInformation view={fact} />)).toBe('');
    const html = renderToStaticMarkup(<ViewInformation view={fact} placement="menu" />);
    expect(html).toContain('view-information-menu');
    expect(html).toContain('Stored metadata title');
    expect(html).toContain('Exact submitted source');
    expect(html).toContain('https://example.com/original');
    expect(renderToStaticMarkup(<ViewInformation view={{ ...fact, showSource: true } as SurfaceView} preview />)).toBe('');
  });

  it('includes exact supplied image captions in deliberate metadata without rewriting the view', () => {
    const view: SurfaceView = { version: 1, template: 'image', data: { images: [{ url: 'https://example.com/photo.jpg', alt: 'An exact photograph', caption: 'A <caption>\nwith its original spacing.' }] } };
    const before = structuredClone(view);
    const html = renderToStaticMarkup(<ViewInformation view={view} placement="menu" />);
    expect(html).toContain('A &lt;caption&gt;\nwith its original spacing.');
    expect(viewInformationContent(view).captions).toEqual([{ label: 'Caption', text: 'A <caption>\nwith its original spacing.' }]);
    expect(view).toEqual(before);
  });
});

describe('presentation metadata follows the currently shown slide', () => {
  const deck: SurfaceView = { version: 1, template: 'presentation', title: 'Deck title', source: { title: 'Deck source' }, data: { index: 1, slides: [
    { ...fact, title: 'Other slide', source: { title: 'Do not show this source' } },
    { ...fact, title: 'Current slide', source: { title: 'Current slide source' } },
  ] } };

  it('combines current slide and deck only on explicit request', () => {
    const html = renderToStaticMarkup(<Renderer view={{ ...deck, showSource: true }} />);
    expect(html.match(/aria-label="About this view"/g)).toHaveLength(1);
    for (const text of ['Current slide', 'Current slide source', 'Deck title', 'Deck source']) expect(html).toContain(text);
    expect(html).not.toContain('Do not show this source');
    const menu = renderToStaticMarkup(<ViewInformation view={deck} placement="menu" />);
    expect(menu).toContain('Current slide source');
    expect(menu).not.toContain('Do not show this source');
  });

  it('inherits utility flags, respects an explicit leaf override, and never repeats a deck heading', () => {
    const container = { ...deck, showTitle: true, showCaption: true, showSource: true, showControls: true };
    expect(liveSurfaceOptions(fact, container)).toEqual({ showTitle: false, showCaption: true, showSource: true, showControls: true });
    expect(liveSurfaceOptions({ ...fact, showCaption: false, showSource: false, showControls: false }, container)).toEqual({ showTitle: false, showCaption: false, showSource: false, showControls: false });
  });

  it('deduplicates the same source regardless of object key order', () => {
    const information = viewInformationContent(fact, { ...deck, source: { timestamp: source.timestamp, locator: source.locator, url: source.url, title: source.title } });
    expect(information.sources).toEqual([source]);
  });
});

describe('fit modes preserve readable content and intrinsic interaction', () => {
  it('uses full-frame media and deliberate reading regions without altering source data', () => {
    for (const template of ['image', 'map', 'whiteboard', 'video', 'html', 'weather', 'presentation'] as const) expect(liveSurfaceLayout(samples[template])).toEqual({ mode: 'media', fullBleed: true });
    const fullList: ViewSpec = { version: 1, template: 'table', data: { columns: ['Tool'], rows: Array.from({ length: 51 }, (_, index) => ({ Tool: `tool_${index + 1}` })) } };
    const before = structuredClone(fullList);
    expect(liveSurfaceLayout(fullList)).toEqual({ mode: 'reading', fullBleed: false });
    expect(fullList).toEqual(before);
    expect(liveSurfaceLayout({ ...samples.document, data: { text: 'Short excerpt.', layout: 'excerpt' } }).mode).toBe('focus');
    expect(liveSurfaceLayout({ ...samples.document, data: { text: 'Paragraph one.\n\nParagraph two.\n\nParagraph three.' } }).mode).toBe('reading');
    expect(liveSurfaceLayout({ ...samples.document, data: { text: 'x'.repeat(1500), layout: 'reading' } }).mode).toBe('reading');
  });

  it('keeps submitted actions, poll choices, form fields and checklist responses', () => {
    const action = renderToStaticMarkup(<Renderer view={{ ...fact, showControls: false, actions: [{ id: 'answer', kind: 'input', label: 'Send answer' }] } as SurfaceView} actionable onAction={async () => {}} />);
    expect(action).toContain('Send answer');
    expect(action).toContain('<input');
    const form = renderToStaticMarkup(<Renderer view={{ ...samples.form, showControls: false } as SurfaceView} actionable onRespond={async () => {}} />);
    expect(form).toContain('<form');
    expect(form).toContain('class="response-submit" type="submit"');
    const poll = renderToStaticMarkup(<Renderer view={{ ...samples.poll, showControls: false } as SurfaceView} actionable onRespond={async () => {}} />);
    expect(poll).toContain('poll-option');
    expect(poll).toContain('Results are hidden');
    const checklist = renderToStaticMarkup(<Renderer view={{ ...samples.checklist, showControls: false } as SurfaceView} actionable onRespond={async () => {}} />);
    expect(checklist).toContain('role="checkbox"');
    expect(checklist).not.toContain('View-only checklist');
  });

  it('retains meaningful quote attribution and access states independently of caption flags', () => {
    const quote = renderToStaticMarkup(<Renderer view={{ ...samples.quote, showCaption: false, showSource: false } as SurfaceView} />);
    expect(quote).toContain(String(samples.quote.data.attribution));
    const checklist = renderToStaticMarkup(<Renderer view={{ ...samples.checklist, showControls: false } as SurfaceView} />);
    expect(checklist).toContain('View-only checklist');
  });

  it('keeps actual slide navigation but omits an idle 1/1 counter', () => {
    const one: SurfaceView = { version: 1, template: 'presentation', data: { slides: [fact] } };
    expect(renderToStaticMarkup(<Renderer view={one} />)).not.toContain('class="presentation-controls"');
    const multiple: SurfaceView = { ...one, data: { slides: [fact, { ...fact, data: { text: 'The second idea.' } }] }, showControls: true };
    const html = renderToStaticMarkup(<Renderer view={multiple} editable revision={1} onRespond={async () => {}} />);
    expect(html).toContain('aria-label="Previous slide"');
    expect(html).toContain('aria-label="Next slide"');
    expect(renderToStaticMarkup(<Renderer view={{...multiple,showControls:false}} />)).not.toContain('class="presentation-controls"');
  });
});

describe('code and whiteboard utilities do not become default display chrome', () => {
  it('shows exact code and supplied highlights without Copy or clickable line controls', () => {
    const data = { kind: 'code' as const, code: 'const value = "<exact>";\n  return value;', highlightLines: [2] };
    const html = renderToStaticMarkup(<CodeRenderer data={data} />);
    expect(html).toContain('const value = &quot;&lt;exact&gt;&quot;;');
    expect(html).toContain('  return value;');
    expect(html).toContain('class="code-line highlighted"');
    expect(html).toContain('aria-label="Line 2"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('code-toolbar');
    const withUtilities = renderToStaticMarkup(<CodeRenderer data={data} showControls />);
    expect(withUtilities).toContain('aria-label="Copy code"');
    expect(withUtilities).toContain('aria-label="Highlight line 2"');
  });

  it('retains diff semantics and long-code pagination when optional utilities are off', () => {
    const diff = renderToStaticMarkup(<CodeRenderer data={{ kind: 'diff', before: 'Keep this line\nOld', after: 'Keep this line\nNew' }} />);
    expect(diff).toContain('Keep this line');
    expect(diff).toContain('aria-label="Removed"');
    expect(diff).toContain('aria-label="Added"');
    expect(diff).not.toContain('Changes only');
    expect(diff).not.toContain('Copy code');
    const longCode = renderToStaticMarkup(<CodeRenderer data={{ kind: 'code', code: Array.from({ length: 151 }, (_, index) => `line_${index + 1}`).join('\n') }} />);
    expect(longCode).toContain('line_150');
    expect(longCode).toContain('of 151');
    expect(longCode).toContain('Next →');
  });

  it('keeps drawing tools permission-bound and zoom explicitly optional', () => {
    const data = { elements: [{ id: 'note', type: 'text' as const, x: 20, y: 30, text: 'The supplied idea.' }] };
    const passive = renderToStaticMarkup(<WhiteboardRenderer data={data} />);
    expect(passive).toContain('The supplied idea.');
    expect(passive).not.toContain('board-zoom');
    expect(passive).not.toContain('board-toolbar');
    const editable = renderToStaticMarkup(<WhiteboardRenderer data={data} editable revision={1} onEdit={async () => 2} />);
    expect(editable).toContain('aria-label="Whiteboard tools"');
    expect(editable).toContain('aria-label="Drawing style"');
    expect(editable).not.toContain('Changes saved');
    expect(editable).not.toContain('board-zoom');
    const utilities = renderToStaticMarkup(<WhiteboardRenderer data={data} showControls />);
    expect(utilities).toContain('aria-label="Fit board to screen"');
    expect(utilities).not.toContain('board-toolbar');
  });
});
