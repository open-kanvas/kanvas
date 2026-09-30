import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImageRenderer as CompatibleImageRenderer, MediaImage as CompatibleMediaImage, DocumentRenderer, WebRenderer } from '../../src/client/renderers/Content';
import { ImageRenderer, MediaImage, type ImageEntry } from '../../src/client/renderers/Image';
import { Renderer } from '../../src/client/renderers/Renderer';
import { validateView } from '../../src/shared/view-schemas';
import { viewInformationContent } from '../../src/shared/live-surface';

const caption = '  Exact supplied caption.\nSecond line; retained trailing spaces.  ';
const alt = '  Original accessible description — all four corners.  ';
const entry: ImageEntry = { url: '/api/assets/image-fixture', alt, caption };
const rich = () => validateView({ version: 1, template: 'image', title: 'Retained image title', source: { title: 'Original collection', url: 'https://example.com/collection', locator: 'Plate 17, original scan', timestamp: '2026-09-14T12:00:00Z' }, data: { images: [entry] } });

describe('full-frame image surface with retained metadata', () => {
  it('preserves established Content exports for image, document and profile callers', () => {
    expect(CompatibleImageRenderer).toBe(ImageRenderer); expect(CompatibleMediaImage).toBe(MediaImage);
  });
  it('shows the image without default captions, original links or gallery footer', () => {
    const html = renderToStaticMarkup(<ImageRenderer data={{ images: [entry] }} />);
    expect(html).toContain('image-content image-surface gallery-1'); expect(html).toContain(`alt="${alt}"`);
    expect(html).toContain('src="/api/assets/image-fixture"'); expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain('<figcaption'); expect(html).not.toContain('image-original-link'); expect(html).not.toContain('gallery-controls');
    expect(html).not.toContain(caption); expect(html).not.toContain('image-crop');
  });
  it('keeps the complete validated metadata without painting title/source widgets by default', () => {
    const view = rich(), before = structuredClone(view), html = renderToStaticMarkup(<Renderer view={view} />);
    expect(view).toEqual(before); expect(view.data.images).toEqual([entry]);
    expect(html).toContain('is-full-bleed'); expect(html).not.toContain('view-heading'); expect(html).not.toContain('view-information'); expect(html).not.toContain('<figcaption');
    expect(viewInformationContent(view)).toEqual({ titles: ['Retained image title'], sources: [view.source], captions: [{ label: 'Caption', text: caption }] });
  });
  it('renders exact captions only when explicitly enabled', () => {
    const html = renderToStaticMarkup(<ImageRenderer data={{ images: [entry] }} showCaption />);
    expect(html).toContain(`<figcaption tabindex="0">${caption}</figcaption>`); expect(html).not.toContain('image-original-link');
    expect(renderToStaticMarkup(<ImageRenderer data={{ images: [{ url: entry.url, alt }] }} showCaption />)).not.toContain('<figcaption');
  });
  it('makes title, source and original-link utilities independent opt-ins', () => {
    const view = rich();
    const titled = renderToStaticMarkup(<Renderer view={{ ...view, showTitle: true }} />);
    expect(titled).toContain('<h1>Retained image title</h1>'); expect(titled).not.toContain('<figcaption'); expect(titled).not.toContain('view-information');
    const sourced = renderToStaticMarkup(<Renderer view={{ ...view, showSource: true }} />);
    expect(sourced).toContain('aria-label="About this view"'); expect(sourced).toContain('Plate 17, original scan');
    expect(sourced).not.toContain('<figcaption'); expect(sourced).not.toContain('image-original-link');
    const controls = renderToStaticMarkup(<Renderer view={{ ...view, showControls: true }} />);
    expect(controls).toContain('class="image-original-link"'); expect(controls).toContain('href="/api/assets/image-fixture"');
    expect(controls).not.toContain('<figcaption'); expect(controls).not.toContain('view-information');
  });
  it('does not create an empty source widget even if source display is requested', () => {
    const view = validateView({ version: 1, template: 'image', showSource: true, source: {}, data: { images: [{ url: entry.url, alt: 'Image' }] } });
    const html = renderToStaticMarkup(<Renderer view={view} />);
    expect(html).not.toContain('view-information'); expect(html).not.toContain('About this view');
  });
  it('inherits presentation caption/source/utility flags and honors a slide override', () => {
    const deck = validateView({ version: 1, template: 'presentation', showCaption: true, showSource: true, showControls: true, data: { slides: [rich()], index: 0 } });
    const inherited = renderToStaticMarkup(<Renderer view={deck} />);
    expect(inherited).toContain(`<figcaption tabindex="0">${caption}</figcaption>`); expect(inherited).toContain('image-original-link'); expect(inherited).toContain('view-information');
    const quietSlide = validateView({ ...deck, data: { slides: [{ ...rich(), showCaption: false, showSource: false, showControls: false }], index: 0 } });
    const quiet = renderToStaticMarkup(<Renderer view={quietSlide} />);
    expect(quiet).not.toContain('<figcaption'); expect(quiet).not.toContain('image-original-link'); expect(quiet).not.toContain('view-information');
  });
});

describe('original gallery images, crops and safe media compatibility', () => {
  it('retains all four image nodes in supplied order with intrinsic enlarge access', () => {
    const images = Array.from({ length: 4 }, (_, index) => ({ url: `/api/assets/original-${index}`, alt: `Original image ${index + 1}`, caption: `Retained caption ${index + 1}` }));
    const before = structuredClone(images), html = renderToStaticMarkup(<ImageRenderer data={{ images }} />);
    expect(html.match(/<img /gu)).toHaveLength(4); expect(html.match(/role="button"/gu)).toHaveLength(4); expect(html.match(/loading="eager"/gu)).toHaveLength(4);
    for (let i = 0; i < images.length; i++) expect(html).toContain(`aria-label="Enlarge Original image ${i + 1}"`);
    expect([...html.matchAll(/<img[^>]*src="([^"]+)"/gu)].map(match => match[1])).toEqual(images.map(image => image.url));
    expect(html).not.toContain('<figcaption'); expect(html).not.toContain('gallery-controls'); expect(images).toEqual(before);
  });
  it('does not replace an explicit empty alt with a visible caption or navigation label', () => {
    const html = renderToStaticMarkup(<ImageRenderer data={{ images: [{ ...entry, alt: '' }, { ...entry, url: '/api/assets/second', alt: '' }] }} />);
    expect(html.match(/alt=""/gu)).toHaveLength(2); expect(html).toContain('aria-label="Enlarge Exact supplied caption.');
    expect(renderToStaticMarkup(<MediaImage entry={{ url: entry.url, caption: 'Fallback accessible description' }} />)).toContain('alt="Fallback accessible description"');
  });
  it('uses only an explicitly supplied normalized crop and leaves that metadata intact', () => {
    const cropped = { ...entry, crop: { x: .25, y: .2, width: .5, height: .6 } };
    const view = validateView({ version: 1, template: 'image', data: { images: [cropped] } });
    const html = renderToStaticMarkup(<ImageRenderer data={{ images: [cropped] }} />);
    expect(html).toContain('class="image-crop"'); expect(html).toContain('width:200%'); expect(html).toContain('left:-50%');
    expect(view.data.images).toEqual([cropped]);
    expect(() => validateView({ ...view, data: { images: [{ ...cropped, crop: { x: .8, y: 0, width: .5, height: 1 } }] } })).toThrow();
    expect(() => validateView({ ...view, data: { images: [{ ...entry, fit: 'cover' }] } })).toThrow();
  });
  it('keeps unsafe URLs out of image and optional original-link requests', () => {
    const html = renderToStaticMarkup(<ImageRenderer data={{ images: [{ url: 'javascript:alert(1)', alt: 'Unavailable original' }] }} showControls />);
    expect(html).not.toContain('javascript:'); expect(html).not.toContain('<img '); expect(html).not.toContain('image-original-link');
    expect(html).toContain('Image unavailable'); expect(html).toContain('Unavailable original');
  });
  it('keeps shared document and snapshot images outside the new image-only layout', () => {
    const document = renderToStaticMarkup(<DocumentRenderer data={{ text: 'Exact excerpt.', images: [entry] }} showCaption />);
    const snapshot = renderToStaticMarkup(<WebRenderer data={{ url: 'https://example.com/page', snapshotUrl: entry.url }} />);
    expect(document).toContain('<figcaption>'); expect(document).toContain(caption); expect(snapshot).toContain('class="web-snapshot"');
    expect(document).not.toContain('image-surface'); expect(snapshot).not.toContain('image-surface');
  });
});
