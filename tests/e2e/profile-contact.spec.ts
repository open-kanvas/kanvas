import type { Page } from '@playwright/test';
import type { ViewSpec } from '../../src/shared/types';
import type { ProfileDetail } from '../../src/shared/profile-contact';
import { captureDisplay, createDisplay, createSession, expect, openViewer, publishPrepared, register, sessionDetail, test, waitForDisplay } from './support';

const contacts: ProfileDetail[] = [
  { label: 'Mobile', value: '+1 202 555 0123', type: 'phone' },
  { label: 'Email', value: 'alex+design@example.com', type: 'email' },
  { label: 'Website', value: 'https://example.com/profile/alex?section=work#contact', type: 'link' },
  { label: 'Studio', value: 'Ås gate 4 & 6\nOslo?api=2&query=other #north', type: 'address' },
];
const profile = (extra: Record<string, unknown> = {}): ViewSpec => ({ version: 1, template: 'profile', data: { name: 'Alex Morgan', kind: 'person', role: 'Design lead', description: 'A supplied biography remains available below the contact methods.', details: contacts, ...extra } });

async function setup(page: Page) {
  await register(page); const sessionId = await createSession(page, 'Typed profile acceptance'), display = await createDisplay(page, sessionId, 'Contact profile');
  const viewer = await openViewer(page, sessionId, display.id); await viewer.bringToFront();
  return { sessionId, displayId: display.id, viewer };
}
async function ready(page: Page, viewer: Page, sessionId: string, displayId: string, revision = 1) {
  await waitForDisplay(page, sessionId, displayId, value => value.revision === revision && value.appliedRevision === revision);
  await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-render-status', 'ready');
}
async function captureNativeActivations(viewer: Page) {
  // Verify the native anchor and keyboard activation without launching an OS
  // dialler or mail client from CI. This is not a claim that a call/email sent.
  await viewer.evaluate(() => {
    const state = window as Window & { __profileNativeTargets?: string[] }; state.__profileNativeTargets = [];
    document.addEventListener('click', event => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="tel:"],a[href^="mailto:"]') : null;
      if (anchor) { event.preventDefault(); state.__profileNativeTargets!.push(anchor.getAttribute('href')!); }
    }, true);
  });
}
const nativeTargets = (viewer: Page) => viewer.evaluate(() => (window as Window & { __profileNativeTargets?: string[] }).__profileNativeTargets ?? []);

test('typed contacts keep exact source values, visible labels, native keyboard actions and 44px targets', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page), details = [...contacts, { label: 'Joined', value: '2021' }];
  await publishPrepared(page, sessionId, [displayId], profile({ details })); await ready(page, viewer, sessionId, displayId);
  await captureNativeActivations(viewer);
  const phone = viewer.getByRole('link', { name: 'Mobile: +1 202 555 0123', exact: true }), email = viewer.getByRole('link', { name: 'Email: alex+design@example.com', exact: true });
  await expect(phone).toHaveAttribute('href', 'tel:+12025550123'); await expect(email).toHaveAttribute('href', 'mailto:alex%2Bdesign@example.com');
  await phone.focus(); await expect(phone).toBeFocused(); await viewer.keyboard.press('Tab'); await expect(email).toBeFocused(); await viewer.keyboard.press('Enter');
  await viewer.keyboard.press('Shift+Tab'); await expect(phone).toBeFocused(); await viewer.keyboard.press('Enter');
  expect(await nativeTargets(viewer)).toEqual(['mailto:alex%2Bdesign@example.com', 'tel:+12025550123']);
  for (const label of contacts.map(item => item.label)) await expect(viewer.locator('.profile-contacts dt').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  const targets = await viewer.locator('.profile-contacts a').evaluateAll(elements => elements.map(element => ({ height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })));
  expect(targets).toHaveLength(4); for (const target of targets) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.width).toBeGreaterThanOrEqual(44); }
  const stored = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!;
  expect(stored.view?.data.details).toEqual(details); expect(stored.view?.data.description).toBe('A supplied biography remains available below the contact methods.');
  await expect(viewer.locator('.view-heading')).toHaveCount(0); await expect(viewer.locator('.profile-description')).toContainText('A supplied biography');
  await viewer.locator('.profile-content').evaluate(element => { element.scrollTop = 0; });
  await captureDisplay(viewer, info, 'profile-contact');
  if (info.project.name.startsWith('phone')) {
    const resizedViewport = { width: 443, height: 823 };
    await viewer.setViewportSize(resizedViewport);
    await expect.poll(() => viewer.locator('.viewer-shell').evaluate(element => {
      const { width, height } = element.getBoundingClientRect(); return { width, height };
    }), { message: 'Contact surface receives the requested phone viewport' }).toEqual(resizedViewport);
    expect(await viewer.locator('.profile-content').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await captureDisplay(viewer, info, 'profile-contact-443');
  }
});

test('website and maps navigation happens only on deliberate clicks with exact encoded address and isolated tabs', async ({ page }) => {
  const { sessionId, displayId, viewer } = await setup(page);
  const requests: string[] = [], website = contacts[2].value, maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contacts[3].value)}`;
  const matches = (url: URL) => url.href === website.split('#')[0] || url.href === maps;
  await page.context().route(matches, route => { requests.push(route.request().url()); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted contact target</title><p>Deliberate contact navigation</p>' }); });
  await publishPrepared(page, sessionId, [displayId], profile()); await ready(page, viewer, sessionId, displayId);
  expect(requests).toEqual([]);
  const siteLink = viewer.getByRole('link', { name: `Website: ${website}`, exact: true });
  await expect(siteLink).toHaveAttribute('href', website); await expect(siteLink).toHaveAttribute('rel', 'noopener noreferrer');
  const openedSite = viewer.waitForEvent('popup'); await siteLink.click(); const siteTab = await openedSite;
  await expect(siteTab.getByText('Deliberate contact navigation')).toBeVisible(); expect(await siteTab.evaluate(() => window.opener === null)).toBe(true); await siteTab.close();
  expect(requests).toHaveLength(1);
  const mapLink = viewer.getByRole('link', { name: /^Open Studio in Maps:/ });
  await expect(mapLink).toHaveAttribute('href', maps); expect(new URL(maps).searchParams.get('query')).toBe(contacts[3].value);
  const openedMap = viewer.waitForEvent('popup'); await mapLink.click(); const mapTab = await openedMap;
  await expect(mapTab.getByText('Deliberate contact navigation')).toBeVisible(); expect([...new URL(mapTab.url()).searchParams.entries()]).toEqual([['api', '1'], ['query', contacts[3].value]]);
  expect(await mapTab.evaluate(() => window.opener === null)).toBe(true); await mapTab.close();
  expect(requests).toHaveLength(2); expect((await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.revision).toBe(1);
});

test('ordinary legacy values stay plain even when named Email or Phone, while separate links remain unchanged', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page);
  const details = [{ label: 'Email', value: 'alex@example.com' }, { label: 'Phone', value: '+1 202 555 0123' }, { label: 'Website as text', value: 'https://example.com', type: 'text' }, { label: 'Literal source', value: '<b>Not active HTML</b>' }];
  const links = [{ label: 'Existing profile page', url: 'http://example.com/legacy?source=profile' }];
  await publishPrepared(page, sessionId, [displayId], profile({ details, links })); await ready(page, viewer, sessionId, displayId);
  await expect(viewer.locator('.profile-contacts,.extended-details a,.extended-details b')).toHaveCount(0);
  for (const detail of details) await expect(viewer.locator('.extended-details')).toContainText(detail.value);
  await expect(viewer.getByRole('link', { name: 'Existing profile page ↗', exact: true })).toHaveAttribute('href', links[0].url);
  const stored = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.view!;
  expect(stored.data.details).toEqual(details); expect(stored.data.links).toEqual(links);
  expect((stored.data.details as ProfileDetail[]).slice(0, 2).every(detail => !('type' in detail))).toBe(true);
  await captureDisplay(viewer, info, 'profile-legacy-plain');
});

test('long names, typed values, addresses and biography wrap in the profile scroll region without page overflow', async ({ page }, info) => {
  const { sessionId, displayId, viewer } = await setup(page);
  const name = 'A'.repeat(230), email = 'a'.repeat(64) + '@' + 'b'.repeat(60) + '.example.com', website = 'https://example.com/profile?supplied=' + 'exactvalue'.repeat(120), address = 'A very long supplied street address '.repeat(90);
  const details = [{ label: 'Email', value: email, type: 'email' }, { label: 'Website', value: website, type: 'link' }, { label: 'Address', value: address, type: 'address' }, { label: 'Original notes', value: 'Final supplied detail remains readable.' }];
  await publishPrepared(page, sessionId, [displayId], profile({ name, details, description: 'Exact biography text. '.repeat(100) })); await ready(page, viewer, sessionId, displayId);
  await expect(viewer.locator('.profile-name')).toHaveText(name); await expect(viewer.locator('[data-contact-type="email"] .profile-contact-value')).toHaveText(email);
  await expect(viewer.locator('[data-contact-type="link"] .profile-contact-value')).toHaveText(website); await expect(viewer.locator('[data-contact-type="address"] .profile-contact-value')).toHaveText(address);
  await expect(viewer.locator('[data-contact-type="address"] a')).toHaveCount(0);
  const region = viewer.locator('.profile-content');
  expect(await region.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight > element.clientHeight)).toBe(true);
  await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(viewer.getByText('Final supplied detail remains readable.', { exact: true })).toBeInViewport();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await captureDisplay(viewer, info, 'profile-long-source');
});

test('typed profile contacts remain actionable and source-exact inside a presentation without becoming slide commands', async ({ page }) => {
  const { sessionId, displayId, viewer } = await setup(page), leaf = profile();
  const deck: ViewSpec = { version: 1, template: 'presentation', showControls: true, data: { slides: [leaf, { version: 1, template: 'fact', data: { text: 'The contact profile is one supplied slide.' } }], index: 0 } };
  await publishPrepared(page, sessionId, [displayId], deck); await ready(page, viewer, sessionId, displayId);
  await captureNativeActivations(viewer);
  const email = viewer.getByRole('link', { name: 'Email: alex+design@example.com', exact: true });
  await email.focus(); await viewer.keyboard.press('Enter'); expect(await nativeTargets(viewer)).toEqual(['mailto:alex%2Bdesign@example.com']);
  let stored = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.view!;
  expect(stored.data.index).toBe(0); expect((stored.data.slides as ViewSpec[])[0].data.details).toEqual(contacts);
  await viewer.getByRole('button', { name: 'Next slide', exact: true }).click(); await ready(page, viewer, sessionId, displayId, 2);
  await expect(viewer.getByText('The contact profile is one supplied slide.', { exact: true })).toBeVisible();
  await viewer.getByRole('button', { name: 'Previous slide', exact: true }).click(); await ready(page, viewer, sessionId, displayId, 3);
  await expect(viewer.getByRole('link', { name: 'Mobile: +1 202 555 0123', exact: true })).toHaveAttribute('href', 'tel:+12025550123');
  stored = (await sessionDetail(page, sessionId)).displays.find(value => value.id === displayId)!.view!;
  expect((stored.data.slides as ViewSpec[])[0].data.details).toEqual(contacts);
});
