import type { Page, TestInfo } from '@playwright/test';
import type { DisplayRecord, ViewSpec } from '../../src/shared/types';
import { createDisplay, createSession, expect, isolatedContext, publishPrepared, register, sessionApi, sessionDetail, tab, test, viewerPath, waitForDisplay } from './support';

const poll: ViewSpec = { version: 1, template: 'poll', data: { question: 'Private workshop question', options: [{ id: 'north', label: 'North' }, { id: 'south', label: 'South' }], revealResults: false } };

async function invitation(page: Page, responses = false) {
  await register(page);
  const sessionId = await createSession(page, 'Private sharing workspace'), display = await createDisplay(page, sessionId, 'Presenter screen');
  await publishPrepared(page, sessionId, [display.id], poll);
  await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'poll');
  await tab(page, 'People & access');
  const section = page.getByRole('region', { name: 'Display sharing' });
  await section.getByLabel('Display to share', { exact: true }).selectOption(display.id);
  await section.getByLabel('Invitation label', { exact: true }).fill('Public follow-along invitation');
  await expect(section.getByRole('checkbox', { name: /Allow requests to respond/ })).not.toBeChecked();
  if (responses) await section.getByRole('checkbox', { name: /Allow requests to respond/ }).check();
  await section.getByRole('button', { name: 'Create sharing link', exact: true }).click();
  const link = section.getByLabel('Sharing link for Public follow-along invitation', { exact: true });
  await expect(link).toBeVisible();
  const joinUrl = await link.inputValue(), qr = section.getByRole('img', { name: 'Invitation QR code for Public follow-along invitation', exact: true });
  await expect(qr).toBeVisible();
  await expect.poll(() => qr.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 100)).toBe(true);
  expect(new URL(joinUrl).pathname).toMatch(/^\/join\/[A-Za-z0-9_-]+$/);
  expect(new URL(joinUrl).search).toBe('');
  return { sessionId, display, joinUrl, section };
}

async function requestAccess(guest: Page, joinUrl: string, deviceName: string, interactive = false, screenshotInfo?: TestInfo) {
  await guest.goto(joinUrl);
  await expect(guest.getByRole('heading', { name: 'Public follow-along invitation', exact: true })).toBeVisible();
  await expect(guest.getByText('Private workshop question', { exact: true })).toHaveCount(0);
  await expect(guest.locator('.viewer-shell, .workspace')).toHaveCount(0);
  if (screenshotInfo) {
    const path = screenshotInfo.outputPath('sharing-guest-invitation.png');
    // Before requesting: no pairing label, proof or authenticated cookie is
    // present. This is the synthetic public invitation's pre-approval UI.
    await guest.locator('.share-join').screenshot({ path, animations: 'disabled' });
    await screenshotInfo.attach('Guest invitation before requesting access', { path, contentType: 'image/png' });
  }
  await guest.getByLabel('Your screen name (optional)', { exact: true }).fill(deviceName);
  if (interactive) await guest.getByRole('checkbox', { name: /Request permission to respond/ }).check();
  await guest.getByRole('button', { name: 'Request display access', exact: true }).click();
  await expect(guest.getByText('Waiting for the owner.', { exact: false })).toBeVisible();
  await expect(guest.getByText('Private workshop question', { exact: true })).toHaveCount(0);
}

async function admit(owner: Page, guest: Page, name: string, responses = false) {
  const card = owner.locator('.sharing-requests article').filter({ has: owner.getByRole('heading', { name, exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: responses ? 'Approve responses' : 'Approve view only', exact: true }).click();
  await expect(guest.locator('.viewer-shell')).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Private workshop question', exact: true })).toBeVisible();
  await expect(guest.locator('.workspace, .workspace-sidebar')).toHaveCount(0);
  return card;
}

test('QR discovery waits for approval, follows live updates view-only, and loses access on revocation', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  const { sessionId, display, joinUrl, section } = await invitation(page), context = await isolatedContext(browser, testInfo, baseURL!);
  try {
    const path = testInfo.outputPath('sharing-owner-invitation.png');
    // Only a synthetic public discovery URL is pictured, never a bearer or
    // pairing proof. No guest request exists when this region is captured.
    await section.screenshot({ path, animations: 'disabled' });
    await testInfo.attach('Owner invitation and generated QR', { path, contentType: 'image/png' });
    const guest = await context.newPage(); diagnostics.watch(guest);
    await requestAccess(guest, joinUrl, 'View-only guest', false, testInfo);
    await expect(guest.getByRole('checkbox', { name: /Request permission to respond/ })).toHaveCount(0);
    await admit(page, guest, 'View-only guest');
    await expect(guest).toHaveURL(new RegExp(`${viewerPath(sessionId, display.id)}$`));
    await expect(guest.getByRole('radio', { name: 'North', exact: true })).toBeDisabled();
    await expect(guest.getByRole('button', { name: 'Vote', exact: true })).toBeDisabled();
    await expect(guest.getByText('View-only access', { exact: true })).toBeVisible();
    await publishPrepared(page, sessionId, [display.id], { version: 1, template: 'fact', data: { text: 'Everyone follows this exact live update.' } });
    await expect(guest.locator('.fact-text')).toHaveText('Everyone follows this exact live update.');
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.goto('/');
    await expect(guest).toHaveURL(new RegExp(`${viewerPath(sessionId, display.id)}$`));
    await expect(guest.locator('.workspace')).toHaveCount(0);
    diagnostics.allowHttp(guest, `/api/sessions/${sessionId}`, 401);
    await section.getByRole('button', { name: 'Revoke invitation and guests', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Choose how to connect.', exact: true })).toBeVisible();
    await expect(guest.locator('.fact-text')).toHaveCount(0);
    diagnostics.allowHttp(guest, '/api/shares/', 410);
    await guest.goto(joinUrl);
    await expect(guest.getByRole('alert')).toContainText('expired or was revoked');
    await expect(guest.getByRole('button', { name: 'Request display access', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('explicitly approved guest browsers vote independently, retain their own choices, and can be revoked separately', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  const { sessionId, display, joinUrl } = await invitation(page, true);
  const firstContext = await isolatedContext(browser, testInfo, baseURL!), secondContext = await isolatedContext(browser, testInfo, baseURL!);
  try {
    const first = await firstContext.newPage(), second = await secondContext.newPage(); diagnostics.watch(first); diagnostics.watch(second);
    await requestAccess(first, joinUrl, 'First voting guest', true);
    const firstCard = await admit(page, first, 'First voting guest', true);
    await requestAccess(second, joinUrl, 'Second voting guest', true);
    await admit(page, second, 'Second voting guest', true);
    await first.getByRole('radio', { name: 'North', exact: true }).check();
    await first.getByRole('button', { name: 'Vote', exact: true }).click();
    await expect(first.getByText('Vote saved', { exact: true })).toBeVisible();
    await expect(second.getByRole('radio', { name: 'North', exact: true })).not.toBeChecked();
    await second.getByRole('radio', { name: 'South', exact: true }).check();
    await second.getByRole('button', { name: 'Vote', exact: true }).click();
    await expect(second.getByText('Vote saved', { exact: true })).toBeVisible();
    await expect(first.locator('.poll-count')).toHaveCount(0); await expect(second.locator('.poll-count')).toHaveCount(0);
    let detail = await sessionDetail(page, sessionId), stored = detail.displays.find(item => item.id === display.id)!;
    expect(stored.responseState!.poll).toEqual({ revealed: false });
    expect(new Set(detail.interactions.map(item => item.userId)).size).toBe(2);
    expect(detail.interactions.every(item => item.userId.startsWith('pairing:'))).toBe(true);
    await first.reload();
    await expect(first.getByRole('radio', { name: 'North', exact: true })).toBeChecked();
    await expect(first.getByRole('radio', { name: 'South', exact: true })).not.toBeChecked();
    const reveal = await sessionApi<DisplayRecord>(page, `/api/sessions/${sessionId}/displays/${display.id}/view`, 'PATCH', { expectedRevision: stored.revision, data: { ...stored.view!.data, revealResults: true } });
    expect(reveal.status).toBe(200);
    await Promise.all([first, second].map(guest => expect(guest.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(reveal.data!.revision))));
    const firstLive = first.locator('.viewer-candidate'), secondLive = second.locator('.viewer-candidate');
    await expect(firstLive.locator('.poll-results-status')).toBeVisible();
    await expect(secondLive.locator('.poll-results-status')).toBeVisible();
    await expect(firstLive.locator('.poll-results-status')).toContainText('2 participants have voted');
    await expect(secondLive.locator('.poll-results-status')).toContainText('2 participants have voted');
    await expect(firstLive.locator('.poll-option').filter({ hasText: 'North' }).locator('.poll-count')).toHaveText('1 vote');
    await expect(secondLive.locator('.poll-option').filter({ hasText: 'South' }).locator('.poll-count')).toHaveText('1 vote');
    diagnostics.allowHttp(first, `/api/sessions/${sessionId}`, 401);
    await firstCard.getByRole('button', { name: 'Revoke guest', exact: true }).click();
    await expect(first.getByRole('heading', { name: 'Choose how to connect.', exact: true })).toBeVisible();
    await expect(first.locator('.poll-content')).toHaveCount(0);
    await expect(second.getByRole('heading', { name: 'Private workshop question', exact: true })).toBeVisible();
    await second.getByRole('radio', { name: /North/ }).check();
    await second.getByRole('button', { name: 'Update vote', exact: true }).click();
    await expect(secondLive.locator('.poll-option').filter({ hasText: 'North' }).locator('.poll-count')).toHaveText('2 votes');
    detail = await sessionDetail(page, sessionId); stored = detail.displays.find(item => item.id === display.id)!;
    expect(stored.responseState!.poll).toMatchObject({ totalVotes: 2, counts: { north: 2, south: 0 } });
    expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await firstContext.close(); await secondContext.close(); }
});

test('owners may deny a requested response grant and pending requests expire without revealing display content', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  const { joinUrl } = await invitation(page, true), context = await isolatedContext(browser, testInfo, baseURL!);
  try {
    const guest = await context.newPage(); diagnostics.watch(guest); await guest.clock.install();
    await requestAccess(guest, joinUrl, 'Denied guest', true);
    const card = page.locator('.sharing-requests article').filter({ has: page.getByRole('heading', { name: 'Denied guest', exact: true }) });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Deny guest', exact: true }).click();
    await expect(guest.getByText('denied', { exact: true })).toBeVisible();
    await expect(guest.locator('.viewer-shell, .workspace')).toHaveCount(0);
    await expect(guest.getByText('Private workshop question', { exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Request again', exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'Request again', exact: true }).click();
    const nextRequest = guest.waitForResponse(response => new URL(response.url()).pathname === '/api/pairings' && response.request().method() === 'POST');
    await guest.getByRole('button', { name: 'Request display access', exact: true }).click();
    const expiry = Date.parse((await (await nextRequest).json() as { data: { expiresAt: string } }).data.expiresAt);
    await expect(guest.getByText('Waiting for the owner.', { exact: false })).toBeVisible();
    // The server expiry is covered over real HTTP. Advance the browser clock
    // here to verify its UI does not poll forever after the proof-cookie TTL.
    const browserNow = await guest.evaluate(() => Date.now());
    await guest.clock.fastForward(Math.max(0, expiry - browserNow) + 5_000);
    await expect(guest.getByText('expired', { exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Request again', exact: true })).toBeVisible();
    let additionalPolls = 0;
    guest.on('request', request => { if (/\/api\/pairings\/[^/]+\/status$/.test(new URL(request.url()).pathname)) additionalPolls++; });
    await guest.clock.fastForward(10_000);
    expect(additionalPolls).toBe(0);
    await expect(guest.locator('.viewer-shell, .workspace')).toHaveCount(0);
  } finally { await context.close(); }
});
