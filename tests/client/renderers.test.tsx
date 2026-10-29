import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TEMPLATE_IDS, type ViewSpec } from '../../src/shared/types';
import { validateView } from '../../src/shared/view-schemas';
import { safeUrl, sourceLabel } from '../../src/client/api';
import { chartVariantSamples, samples } from '../../src/client/samples';
import { Renderer } from '../../src/client/renderers/Renderer';
import { ChartRenderer, TableRenderer, summaryText } from '../../src/client/renderers/Chart';
import { highlightLine, lineDiff } from '../../src/client/renderers/Code';
import { highlightedText, NumberRenderer, safeEmbedUrl } from '../../src/client/renderers/Content';
import { elementBounds } from '../../src/client/renderers/Whiteboard';

describe('the complete visual vocabulary', () => {
  it.each(TEMPLATE_IDS)('%s has a valid, source-preserving starter and a renderable surface', template => {
    const view = validateView(samples[template]);
    // One catalog render covers both starter integrity and default metadata
    // disclosure. Formerly live-surface repeated all 41 renders for these same
    // wrappers; retain its assertions here, not a second full matrix.
    const surface = { ...view, title: 'Stored metadata title', source: { ...view.source, title: 'Metadata-only source' }, showTitle: undefined, showCaption: undefined, showSource: undefined, showControls: undefined };
    const before = structuredClone(surface);
    const html = renderToStaticMarkup(<Renderer view={surface} />);
    expect(html).toContain(`template-${template}`);
    expect(html).not.toContain('not supported by this version');
    expect(html).not.toContain('class="view-heading"');
    expect(html).not.toContain('aria-label="About this view"');
    expect(html).not.toContain('has-view-information');
    expect(html).not.toContain('Metadata-only source');
    expect(surface).toEqual(before);
    expect(view.source??{}).not.toHaveProperty('illustrative');
    if (template === 'iframe') { expect(html).toContain('<iframe'); expect(html).not.toContain('class="iframe-toolbar"'); }
  });

  it.each(Object.entries(chartVariantSamples))('renders the supplied %s chart values', (_name, input) => {
    const view = validateView(input);
    const html = renderToStaticMarkup(<Renderer view={view} />);
    expect(html).toContain('<svg');
    expect(html).not.toContain('Illustrative data');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('does not turn falsy source values into missing cells', () => {
    const html = renderToStaticMarkup(<TableRenderer data={{ columns: ['Value'], rows: [{ Value: 0 }, { Value: false }, { Value: '' }, { Value: null }] }} />);
    const cells = [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
    expect(cells).toHaveLength(4);
    expect(cells[0][1]).toContain('data-cell-type="number"'); expect(cells[0][2]).toBe('0');
    expect(cells[1][1]).toContain('data-cell-type="boolean"'); expect(cells[1][2]).toBe('false');
    expect(cells[2][1]).toContain('data-cell-type="string"'); expect(cells[2][1]).toContain('aria-label="Empty string"'); expect(cells[2][2]).toBe('');
    expect(cells[3][1]).toContain('data-cell-type="null"'); expect(cells[3][2]).toContain('aria-label="Null value"');
  });

  it('keeps precise bound numeric strings intact', () => {
    const exact = '9007199254740993.000000000123';
    const html = renderToStaticMarkup(<NumberRenderer data={{ value: exact, unit: 'USD' }} />);
    expect(html).toContain(exact);
    expect(html).toContain('USD');
  });

  it('keeps long finite numeric values, rather than limiting them to twelve decimals', () => {
    const html = renderToStaticMarkup(<NumberRenderer data={{ value: 0.12345678901234567 }} />);
    expect(html).toContain('0.12345678901234566');
  });

  it('surfaces data reduction and precision qualifications', () => {
    expect(summaryText({ sourceRows: 10000, displayedRows: 120, downsampled: true, excludedRows: 3, precisionNote: 'Chart coordinates approximate exact source strings.' }))
      .toContain('120 shown from 10,000 source rows · downsampled · 3 rows excluded · Chart coordinates approximate exact source strings.');
  });

  it('uses exact raw decimal values for accessible point labels', () => {
    const html = renderToStaticMarkup(<ChartRenderer data={{ kind: 'line', series: [{ name: 'Balance', points: [{ x: 'A', y: .123456789, rawY: '0.1234567890123456789' }, { x: 'B', y: .3, rawY: '0.3000000000000000001' }] }] }} />);
    expect(html).toContain('Balance: A, 0.1234567890123456789');
    expect(html).toContain('Balance: B, 0.3000000000000000001');
  });

  it('draws negative and zero observations without invalid SVG coordinates', () => {
    const html = renderToStaticMarkup(<ChartRenderer data={{ kind: 'bar', series: [{ name: 'Delta', points: [{ x: 'Loss', y: -7 }, { x: 'Flat', y: 0 }, { x: 'Gain', y: 4 }] }] }} />);
    expect(html).toContain('Delta: Loss, -7');
    expect(html).toContain('Delta: Flat, 0');
    expect(html).not.toMatch(/(?:NaN|Infinity|height="-)/);
  });
});

describe('safe source rendering', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'https://user:password@example.com', 'http://127.0.0.1/internal', '//example.com/path'])('does not make %s executable or navigable', value => {
    expect(safeUrl(value, true)).toBeUndefined();
    expect(safeEmbedUrl(value)).toBeUndefined();
  });

  it('supports protected media without expanding the local-URL allowance', () => {
    expect(safeUrl('/api/assets/asset_123', true)).toBe('/api/assets/asset_123');
    expect(safeUrl('/api/assets/../tokens', true)).toBeUndefined();
    expect(safeUrl('/api/tokens', true)).toBeUndefined();
  });

  it('keeps protected PDF downloads navigable without treating a relative URL as a hostname', () => {
    const url = '/api/assets/pdf_123';
    const html = renderToStaticMarkup(<Renderer view={{ version: 1, template: 'web', data: { url, text: 'PDF document · protected download' }, source: { url } }} />);
    expect(html.match(/href="\/api\/assets\/pdf_123"/g)).toHaveLength(1);
    expect(html).toContain('Open original');
    expect(html).not.toContain('<iframe');
    expect(sourceLabel(url)).toBe('Protected document');
    expect(sourceLabel('https://www.example.com/document.pdf')).toBe('example.com');
  });

  it.each(['/api/assets/../tokens', '/api/assets/file?redirect=https://example.com', '/api/assets/%2e%2e', '/api/tokens', '//example.com/file'])('does not widen protected document links to %s', url => {
    const html = renderToStaticMarkup(<Renderer view={{ version: 1, template: 'web', data: { url }, source: { url } }} />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<iframe');
    expect(sourceLabel(url)).toBe('Source');
  });

  it('only frames supported publisher-owned embed paths', () => {
    expect(safeEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBeTruthy();
    expect(safeEmbedUrl('https://player.vimeo.com/video/123456')).toBeTruthy();
    expect(safeEmbedUrl('https://www.openstreetmap.org/export/embed.html')).toBeTruthy();
    expect(safeEmbedUrl('https://www.youtube-nocookie.com.evil.example/embed/dQw4w9WgXcQ')).toBeUndefined();
    expect(safeEmbedUrl('https://example.com/allowed-looking-frame')).toBeUndefined();
  });

  it('renders source text and highlighting as text, including apparent markup', () => {
    const text = '<script>alert("not executable")</script> & evidence';
    const html = renderToStaticMarkup(<p>{highlightedText(text, [{ start: 0, end: 8 }, { start: 3, end: 15 }])}</p>);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;s');
    expect(html).toContain('<mark');
    const content = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(content).toBe(text);
  });

  it('never inserts the highlighter output as raw source HTML', () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(<code>{highlightLine(malicious, 'html')}</code>);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;');
    expect(html).toContain('hljs-');
  });

  it('retains attribution without adding an unsolicited interpretation label', () => {
    const view: ViewSpec = { version: 1, template: 'document', data: { text: 'A concise interpretation.', quote: false }, source: { title: 'Source report', url: 'https://example.com/report', locator: 'Section 4' } };
    const html = renderToStaticMarkup(<Renderer view={validateView({ ...view, showSource: true })} />);
    expect(html).not.toContain('Interpretation');
    expect(html).not.toContain('<blockquote');
    expect(html).toContain('Source report');
    expect(html).toContain('Section 4');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('inspectable code and collaborative geometry', () => {
  it.each([
    ['one\ntwo\nthree', 'one\nupdated\nthree'],
    ['', 'first line'],
    ['removed line', ''],
    ['same\nsame\nold\nend', 'same\nnew\nsame\nend'],
    ['α\nβ\nγ', 'α\nγ\nδ'],
  ])('the diff losslessly reconstructs both inputs', (before, after) => {
    const diff = lineDiff(before, after);
    expect(diff.filter(line => line.type !== 'add').map(line => line.text).join('\n')).toBe(before);
    expect(diff.filter(line => line.type !== 'remove').map(line => line.text).join('\n')).toBe(after);
    const oldNumbers = diff.filter(line => line.old !== undefined).map(line => line.old);
    expect(oldNumbers).toEqual(Array.from({ length: oldNumbers.length }, (_, i) => i + 1));
  });

  it('bounds freehand points relative to the element position, including negative offsets', () => {
    expect(elementBounds({ id: 'stroke', type: 'draw', x: 100, y: 70, points: [{ x: -20, y: 5 }, { x: 30, y: -15 }] })).toEqual({ x: 80, y: 55, width: 50, height: 20 });
  });
});
