import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import {templateSchemas} from '../../src/shared/template-data';
import { profileAddressHref, profileContactTarget, profileEmailHref, profileLinkHref, profilePhoneHref } from '../../src/shared/profile-contact';
import { templateViewSchema, validateView } from '../../src/shared/view-schemas';
import { ProfileRenderer } from '../../src/client/renderers/Profile';
import { Renderer } from '../../src/client/renderers/Renderer';

const identity = { name: 'Alex Morgan', kind: 'person' as const, role: 'Design lead' };
const contacts = [
  { label: 'Phone', value: '+1 202 555 0123', type: 'phone' as const },
  { label: 'Email', value: 'alex+design@example.com', type: 'email' as const },
  { label: 'Website', value: 'https://example.com/alex?section=work#contact', type: 'link' as const },
  { label: 'Studio', value: 'Bryggegata 8\n0250 Oslo, Norway', type: 'address' as const },
];
const profile = (data: Record<string, unknown> = {}) => validateView({ version: 1, template: 'profile', data: { ...identity, ...data } });

describe('safe explicitly typed profile targets', () => {
  it('creates telephone targets from actual digits and explicit extensions without guessing country codes', () => {
    expect(profilePhoneHref('+1 202 555 0123')).toBe('tel:+12025550123');
    expect(profilePhoneHref('(202) 555-0142')).toBe('tel:2025550142');
    expect(profilePhoneHref('+1 (202) 555-0142 ext. 003')).toBe('tel:+12025550142;ext=003');
    expect(profilePhoneHref('020 1234 5678 x42')).toBe('tel:02012345678;ext=42');
    expect(profilePhoneHref('+1\u00a0202\u202f555\u00a00123')).toBe('tel:+12025550123');
    expect(profilePhoneHref('112')).toBe('tel:112');
    expect(profileContactTarget({ value: '+1 202 555 0123' })).toBeUndefined();
  });

  it('rejects phone control/URI/query injection, dial commands, ambiguous schemes and unbounded digits', () => {
    for (const value of ['tel:+12025550123', 'javascript:alert(1)', '+12025550123\n', '+12025550123\r\nX-Header: x', '+12025550123%0d%0a', '+12025550123?body=text', '+12025550123;ext=5', '+12025550123,123', '*21*123#', '+12025550123#5', '12+345', '12', '1'.repeat(16), '123 x' + '1'.repeat(11), '1-800-FLOWERS']) {
      expect(profilePhoneHref(value)).toBeUndefined();
      expect(templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Phone', type: 'phone', value }] }).success).toBe(false);
    }
  });

  it('encodes one exact email recipient including plus aliases, never composer headers or extra recipients', () => {
    const href = profileEmailHref('alex+design@example.com')!;
    expect(href).toBe('mailto:alex%2Bdesign@example.com'); expect(decodeURIComponent(href.slice('mailto:'.length))).toBe('alex+design@example.com');
    expect(profileEmailHref("o'connor@example.co.uk")).toBe('mailto:o%27connor@example.co.uk');
    expect(new URL(href).search).toBe(''); expect(new URL(href).hash).toBe('');
    for (const value of ['mailto:alex@example.com', 'Alex <alex@example.com>', 'alex@example.com?subject=Hi', 'alex@example.com?bcc=else@example.com', 'alex@example.com,else@example.com', 'alex@example.com;else@example.com', 'alex\r\nBcc:else@example.com', 'alex%0d%0a@example.com', 'alex?body=text@example.com', 'alex&bcc=else@example.com', 'alex@example.com%0a', '.alex@example.com', 'alex..other@example.com', 'alex@-example.com', 'alex@example', 'a'.repeat(65) + '@example.com']) {
      expect(profileEmailHref(value)).toBeUndefined();
      expect(templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Email', type: 'email', value }] }).success).toBe(false);
    }
  });

  it('permits public HTTPS contact links only while keeping their supplied query and fragment', () => {
    expect(profileLinkHref(contacts[2].value)).toBe(contacts[2].value);
    for (const value of ['http://example.com/profile', '/api/assets/file', 'javascript:alert(1)', 'data:text/html,hello', 'https://localhost/profile', 'https://127.0.0.1/profile', 'https://service.internal/profile', 'https://example.com\\@localhost/profile', 'https://example.com/\nprofile']) {
      expect(profileLinkHref(value)).toBeUndefined();
      expect(templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Website', type: 'link', value }] }).success).toBe(false);
    }
  });

  it('encodes the complete address as one deliberate maps query without lookup or query injection', () => {
    const address = 'Ås gate 4 & 6\nOslo?api=2&query=elsewhere #north';
    const target = new URL(profileAddressHref(address)!);
    expect(target.origin).toBe('https://www.google.com'); expect(target.pathname).toBe('/maps/search/');
    expect([...target.searchParams.entries()]).toEqual([['api', '1'], ['query', address]]); expect(target.hash).toBe('');
    expect(profileAddressHref('Street\u0000Name')).toBeUndefined(); expect(profileAddressHref('  ')).toBeUndefined();
    // Very long supplied addresses remain valid readable content, without a
    // fake action when the encoded navigation would exceed safe URL limits.
    const long = 'A very long supplied street address '.repeat(100);
    expect(templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Address', type: 'address', value: long }] }).success).toBe(true);
    expect(profileAddressHref(long)).toBeUndefined();
  });
});

describe('backward-compatible profile detail schema', () => {
  it('keeps old plain details and separate links byte-for-byte without adding a default type', () => {
    const supplied = { ...identity, details: [{ label: 'Email', value: 'alex+design@example.com' }, { label: 'Phone', value: '+1 202 555 0123' }, { label: 'Based in', value: '  Oslo\nNorway  ' }], links: [{ label: 'Existing HTTP site', url: 'http://example.com/site?x=1' }, { label: 'Protected document', url: '/api/assets/profile-document' }] };
    expect(templateSchemas.profile.parse(supplied)).toEqual(supplied);
    expect(templateSchemas.profile.parse(supplied).details?.every(item => !('type' in item))).toBe(true);
    const explicit = { label: 'Email as plain text', value: 'alex@example.com', type: 'text' as const };
    expect(templateSchemas.profile.parse({ ...identity, details: [explicit] }).details).toEqual([explicit]);
    expect(profileContactTarget(explicit)).toBeUndefined();
  });

  it('retains all explicitly typed original values and reports invalid values at their exact field', () => {
    expect(templateSchemas.profile.parse({ ...identity, details: contacts }).details).toEqual(contacts);
    const invalid = templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Email', type: 'email', value: 'alex@example.com?bcc=other@example.com' }] });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues).toContainEqual(expect.objectContaining({ path: ['details', 0, 'value'] }));
    for (const detail of [{ label: 'Phone', value: '123', type: 'sms' }, { label: 'Email', value: 'alex@example.com', type: 'email', subject: 'Hello' }, { label: 'Link', value: 'https://example.com', type: 'link', href: 'javascript:alert(1)' }]) {
      expect(templateSchemas.profile.safeParse({ ...identity, details: [detail] }).success).toBe(false);
    }
    expect(templateSchemas.profile.safeParse({ ...identity, details: Array.from({ length: 21 }, () => ({ label: 'Text', value: 'Plain' })) }).success).toBe(false);
    expect(templateSchemas.profile.safeParse({ ...identity, details: [{ label: 'Text', value: 'x'.repeat(4001) }] }).success).toBe(false);
    const schema = z.toJSONSchema(templateViewSchema('profile'), { io: 'input' });
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(JSON.stringify(schema)).toContain('"phone"'); expect(JSON.stringify(schema)).toContain('"email"');
  });

  it('does not introduce typed contact fields to product, weather or other generic details', () => {
    expect(templateSchemas.product.safeParse({ name: 'Product', offers: [{ vendor: 'Store', price: '10' }], details: [contacts[0]] }).success).toBe(false);
    expect(templateSchemas.weather.safeParse({ place: 'Oslo', temperature: '18°', condition: 'clear', details: [contacts[0]] }).success).toBe(false);
  });
});

describe('prominent and inert-when-untyped profile presentation', () => {
  it('promotes typed contact methods before the retained biography and keeps every label visible', () => {
    const source = profile({ description: 'A supplied biography remains available.', details: [...contacts, { label: 'Joined', value: '2021' }], links: [{ label: 'Portfolio', url: 'https://example.com/portfolio' }] });
    const html = renderToStaticMarkup(<Renderer view={source} actionable={false} editable={false} />);
    for (const contact of contacts) expect(html).toContain(`<dt>${contact.label}</dt>`);
    expect(html).toContain('href="tel:+12025550123"'); expect(html).toContain('href="mailto:alex%2Bdesign@example.com"');
    expect(html).toContain('+1 202 555 0123'); expect(html).toContain('alex+design@example.com');
    expect(html).toContain('rel="noopener noreferrer"'); expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('Open in Maps'); expect(html).toContain('A supplied biography remains available.'); expect(html).toContain('<dt>Joined</dt>'); expect(html).toContain('2021');
    expect(html.indexOf('profile-contacts')).toBeLessThan(html.indexOf('A supplied biography remains available.'));
    expect(html).not.toContain('class="view-heading"'); expect(html).not.toContain('<summary>More details');
  });

  it('never auto-links ordinary values, including email/phone-labelled text and explicitly plain URLs', () => {
    const source = profile({ details: [{ label: 'Email', value: 'alex@example.com' }, { label: 'Phone', value: '+1 202 555 0123' }, { label: 'Website', value: 'https://example.com', type: 'text' }] });
    const html = renderToStaticMarkup(<Renderer view={source} />);
    expect(html).toContain('alex@example.com'); expect(html).toContain('+1 202 555 0123'); expect(html).toContain('https://example.com');
    expect(html).not.toMatch(/<a\b|href=|profile-contacts|<img/);
  });

  it('treats labels, names, biography and values as text, with defensive rejection of unsafe typed targets', () => {
    const source = profile({ name: '<b>Alex</b>', description: '<script>Biography</script>', details: [{ label: '<b>Details</b>', value: '<img src=x onerror=alert(1)>' }] });
    const html = renderToStaticMarkup(<Renderer view={source} />);
    expect(html).toContain('&lt;b&gt;Alex&lt;/b&gt;'); expect(html).toContain('&lt;script&gt;Biography&lt;/script&gt;'); expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<b>|<script>|<img/);
    const unsafe = { ...source, data: { ...source.data, details: [{ label: 'Bad URI', type: 'email', value: 'javascript:alert(1)' }], links: [{ label: 'Unsafe legacy target', url: 'javascript:alert(1)' }] } };
    const defensive = renderToStaticMarkup(<ProfileRenderer view={unsafe} />);
    expect(defensive).not.toContain('href='); expect(defensive).toContain('javascript:alert(1)'); expect(defensive).toContain('Unsafe legacy target');
  });

  it('does not hide contact labels or actions in optional generic details, even inside a presentation', () => {
    const leaf = { ...profile({ details: [...contacts, { label: 'Joined', value: '2021' }] }), showControls: true };
    const html = renderToStaticMarkup(<Renderer view={leaf} containerView={validateView({ version: 1, template: 'presentation', data: { slides: [leaf] } })} />);
    expect(html).toContain('<summary>More details</summary>');
    expect(html.indexOf('href="tel:')).toBeLessThan(html.indexOf('<summary>More details'));
    for (const contact of contacts) expect(html).toContain(`<dt>${contact.label}</dt>`);
    expect(html).not.toContain('view-information');
  });

  it('retains optional source portraits and original separate links under their existing policies', () => {
    const html = renderToStaticMarkup(<Renderer view={profile({ image: { url: '/api/assets/portrait', alt: 'Supplied portrait' }, links: [{ label: 'Existing link', url: 'http://example.com/original' }, { label: 'Protected profile document', url: '/api/assets/profile-document' }] })} />);
    expect(html).toContain('src="/api/assets/portrait"'); expect(html).toContain('alt="Supplied portrait"'); expect(html).toContain('Loading media…');
    expect(html).toContain('href="http://example.com/original"'); expect(html).toContain('href="/api/assets/profile-document"');
    expect(html).not.toContain('profile-contacts');
  });
});
