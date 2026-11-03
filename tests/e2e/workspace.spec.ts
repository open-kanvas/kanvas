import { randomUUID } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import type { DatasetRecord, UpdateRecord, ViewSpec } from '../../src/shared/types';
import {
  captureDisplay, createDisplay, createSession, expect, expectFullSurface, isolatedContext,
  login, openViewer, publishPrepared, register, selectTargets, sessionApi, sessionDetail,
  signOutWorkspace, tab, test, viewerPath, waitForDisplay,
} from './support';

const fact = (text: string): ViewSpec => ({
  version: 1, template: 'fact', data: { text },
  source: { title: 'Browser acceptance fixture' },
});
const checklist: ViewSpec = {
  version: 1, template: 'checklist', title: 'Ready to build',
  data: { items: [
    { id: 'evidence', text: 'Prepare the evidence', checked: false },
    { id: 'source', text: 'Confirm the source', checked: false },
  ] },
  source: { title: 'Browser acceptance fixture' },
};

test('real account, two independently targeted displays, source-bound chart and full-surface layouts', async ({ page }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Ideas in view');
  const primary = await createDisplay(page, sessionId, 'Conversation surface');
  const secondary = await createDisplay(page, sessionId, 'Data surface');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Workspace has no horizontal overflow').toBe(true);
  const first = await openViewer(page, sessionId, primary.id);
  const second = await openViewer(page, sessionId, secondary.id);
  const secondaryViewport = testInfo.project.name.startsWith('phone') ? { width: 360, height: 740 } : { width: 1024, height: 768 };
  await second.setViewportSize(secondaryViewport);

  await tab(page, 'Send a visual');
  await page.getByLabel('Exact text to display').fill('One useful idea deserves the entire screen.');
  await page.getByLabel('Visual style', { exact: true }).selectOption('fact');
  await selectTargets(page, [primary.name]);
  // Literal source text is displayed exactly; no generation request is needed.
  await page.getByRole('button', { name: /^Send supplied content/ }).click();
  await expect(first.locator('.fact-text')).toHaveText('One useful idea deserves the entire screen.');
  await expect(second.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await expect(page.locator('.submission-result')).toContainText('In view');

  await tab(page, 'Library');
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  const imported = page.getByRole('dialog');
  await imported.getByLabel('Dataset name', { exact: true }).fill('Exact revenue source');
  await imported.getByLabel('Or paste CSV / JSON', { exact: true }).fill('date,revenue_NOK\n2026-01-01,42.000\n2026-02-01,\n2026-03-01,61.125');
  await imported.getByLabel('Source title (optional)', { exact: true }).fill('Synthetic revenue ledger');
  await expect(imported.getByRole('checkbox', { name: 'Illustrative / synthetic data' })).toHaveCount(0);
  await expect(imported).toContainText('up to 5 MB');
  await imported.getByRole('button', { name: 'Import dataset', exact: true }).click();
  await expect(imported).toBeHidden();
  const metadata = (await sessionDetail(page, sessionId)).datasets.find(item => item.name === 'Exact revenue source');
  expect(metadata).toBeDefined();
  expect(metadata).not.toHaveProperty('rows');
  const sourceResponse = await sessionApi<DatasetRecord>(page, `/api/sessions/${sessionId}/datasets/${metadata!.id}`);
  expect(sourceResponse.status).toBe(200);
  const data = sourceResponse.data!;
  expect(data.rows.map(row => row.revenue_NOK)).toEqual(['42.000', null, '61.125']);

  await tab(page, 'Send a visual');
  await page.getByLabel('Exact text to display').fill('');
  await page.getByLabel('Visual style', { exact: true }).selectOption('chart');
  await page.getByLabel('Use a dataset', { exact: true }).selectOption(data.id);
  await selectTargets(page, [secondary.name]);
  await page.getByRole('button', { name: /^Send supplied content/ }).click();
  await expect(second.locator('.chart-svg')).toBeVisible();
  await expect(second.locator('.view-qualification')).toHaveCount(0);
  await expect(second.locator('.view-information>summary')).toHaveCount(0);
  await second.getByRole('button',{name:'Display controls',exact:true}).click();
  await expect(second.locator('.viewer-menu').getByLabel('About this view',{exact:true})).toHaveCount(0);
  await second.getByRole('button',{name:'Display controls',exact:true}).click();
  await expect(second.locator('.viewer-menu')).toHaveCount(0);
  await expect(first.locator('.fact-text')).toHaveText('One useful idea deserves the entire screen.');
  const chart = await waitForDisplay(page, sessionId, secondary.id, display => display.view?.template === 'chart' && display.appliedRevision === display.revision);
  const points = (chart.view!.data.series as Array<{ points: Array<{ y: number | null; rawY?: unknown; sourceRows?: number[] }> }>)[0].points;
  expect(points.map(point => point.rawY)).toEqual(['42.000', null, '61.125']);
  expect(points.map(point => point.y)).toEqual([42, null, 61.125]);
  expect(points.map(point => point.sourceRows)).toEqual([[0], [1], [2]]);

  await expect(second.getByRole('button', { name: 'Data', exact: true })).toHaveCount(0);
  await publishPrepared(page, sessionId, [secondary.id], {...chart.view!, showControls: true});
  await waitForDisplay(page, sessionId, secondary.id, display => display.revision > chart.revision && display.appliedRevision === display.revision);
  await expect(second.getByRole('button', { name: 'Data', exact: true })).toHaveCount(0);
  // Exact raw cells are a source-bound table, not a removed chart/data toggle.
  await publishPrepared(page, sessionId, [secondary.id], { version: 1, template: 'table', data: { binding: { datasetId: data.id } } });
  const raw = await waitForDisplay(page, sessionId, secondary.id, display => display.view?.template === 'table' && display.appliedRevision === display.revision);
  await expect(second.getByRole('cell', { name: '42.000', exact: true })).toBeVisible();
  await expect(second.getByRole('cell', { name: '61.125', exact: true })).toBeVisible();
  await expect(second.getByRole('cell', { name: 'Null value', exact: true })).toBeVisible();
  await expect(second.getByRole('cell', { name: 'Null value', exact: true })).toHaveText('—');
  await publishPrepared(page, sessionId, [secondary.id], chart.view!);
  await waitForDisplay(page, sessionId, secondary.id, display => display.revision > raw.revision && display.view?.template === 'chart' && display.appliedRevision === display.revision);
  await waitForDisplay(page, sessionId, secondary.id, display => display.width === secondaryViewport.width && display.height === secondaryViewport.height);
  const ownViewport = first.viewportSize()!;
  await waitForDisplay(page, sessionId, primary.id, display => display.width === ownViewport.width && display.height === ownViewport.height);
  await captureDisplay(first, testInfo, 'fact-full-surface');
  await captureDisplay(second, testInfo, 'source-bound-chart');

  await tab(page, 'Library');
  await page.getByRole('button', { name: /^Media / }).click();
  await page.locator('.panel-heading').getByRole('button', { name: 'Upload media', exact: true }).click();
  const media = page.getByRole('dialog');
  await expect(media).toContainText('Images, video, PDF');
  const acceptedTypes = await media.locator('input[type=file]').getAttribute('accept');
  expect(acceptedTypes).not.toContain('audio/');
  expect(acceptedTypes).toContain('image/avif');
  await media.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('shared checklist conflicts are rejected, controls work, feedback stays pending and clears are acknowledged', async ({ page, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Shared decisions');
  const display = await createDisplay(page, sessionId, 'Shared checklist');
  await publishPrepared(page, sessionId, [display.id], checklist);
  const first = await openViewer(page, sessionId, display.id);
  const second = await openViewer(page, sessionId, display.id);
  // Two real viewers can finish painting the previous revision after the other
  // viewer has changed it. The ACK must reject that stale revision with 409;
  // the dedicated delayed-ACK case below verifies its code and quiet recovery.
  const appliedPath = `/api/sessions/${sessionId}/displays/${display.id}/applied`;
  diagnostics.allowHttp(first, appliedPath, 409);
  diagnostics.allowHttp(second, appliedPath, 409);
  const firstEvidence = first.getByRole('checkbox', { name: 'Prepare the evidence', exact: true });
  const secondSource = second.getByRole('checkbox', { name: 'Confirm the source', exact: true });
  await expect(firstEvidence).toBeEnabled();
  await firstEvidence.click();
  await expect(firstEvidence).toBeChecked();
  await expect(second.getByRole('checkbox', { name: 'Prepare the evidence', exact: true })).toBeChecked();
  const beforeRace = await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === item.revision && item.revision > 1);

  // Delay only the outgoing shared edit, allowing another real viewer to advance the revision.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested!: (revision: number) => void;
  const outgoing = new Promise<number>(resolve => { requested = resolve; });
  const editPath = `/api/sessions/${sessionId}/displays/${display.id}/respond`;
  const intercept = async (route: Route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as { revision: number };
    requested(body.revision);
    await held;
    await route.continue();
  };
  diagnostics.allowHttp(second, editPath, 409);
  await second.route(`**${editPath}`, intercept);
  try {
    await secondSource.click();
    expect(await outgoing).toBe(beforeRace.revision);
    await firstEvidence.click();
    await expect(firstEvidence).not.toBeChecked();
    const currentRace = await waitForDisplay(page, sessionId, display.id, item => item.revision > beforeRace.revision);
    const rejected = second.waitForResponse(response => response.url().endsWith(editPath) && response.request().method() === 'POST');
    release();
    expect((await rejected).status()).toBe(409);
    await expect(second.getByRole('region', { name: 'Ready to build' }).getByRole('alert')).toHaveText(`Revision conflict: state changed; current revision is ${currentRace.revision}. Retry with this revision, or omit the guard to apply to current state. Another concurrent write may still conflict.`);
    await expect(secondSource).not.toBeChecked();
    await expect(second.getByRole('checkbox', { name: 'Prepare the evidence', exact: true })).not.toBeChecked();
  } finally {
    release();
    await second.unroute(`**${editPath}`, intercept);
  }
  await secondSource.click();
  await expect(secondSource).toBeChecked();
  await expect(first.getByRole('checkbox', { name: 'Confirm the source', exact: true })).toBeChecked();
  await captureDisplay(first, testInfo, 'shared-checklist');

  await first.getByRole('button', { name: 'Display controls', exact: true }).click();
  await first.getByRole('button', { name: 'Hold this view', exact: true }).click();
  await expect(first.getByRole('status')).toContainText('Held');
  const heldUpdate = await publishPrepared(page, sessionId, [display.id], fact('This held update must not replace the checklist.'));
  await expect.poll(async () => (await sessionDetail(page, sessionId)).updates.find(item => item.id === heldUpdate.id)?.status).toBe('held');
  await expect(first.getByRole('checkbox', { name: 'Confirm the source', exact: true })).toBeChecked();
  await first.getByRole('button', { name: 'Resume updates', exact: true }).click();
  await expect(first.locator('.viewer-status')).toHaveCount(0);
  await first.getByRole('button', { name: 'Display controls', exact: true }).click();

  const interactive: ViewSpec = { ...fact('The next move is yours.'), actions: [{ id: 'next-step', label: 'Ask the connected agent', kind: 'button' }] };
  await publishPrepared(page, sessionId, [display.id], interactive);
  const action = first.getByRole('button', { name: 'Ask the connected agent', exact: true });
  await expect(action).toBeEnabled();
  await action.click();
  await expect(first.getByRole('status')).toHaveText('Sent · awaiting acknowledgement');
  const feedback = (await sessionDetail(page, sessionId)).interactions.find(item => item.actionId === 'next-step');
  expect(feedback).toMatchObject({ displayId: display.id, status: 'pending', value: true });
  expect(feedback!.revision).toBe((await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!.revision);

  const clear = await sessionApi<UpdateRecord>(page, `/api/sessions/${sessionId}/clear`, 'POST', { displayIds: [display.id], requestId: randomUUID() });
  expect(clear.status).toBeGreaterThanOrEqual(200);
  expect(clear.status).toBeLessThan(300);
  await expect(first.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await waitForDisplay(page, sessionId, display.id, item => item.view === null && item.revision > beforeRace.revision && item.appliedRevision === item.revision);
  await expectFullSurface(first);
});

test('saved presentation authoring and deliberate cues preserve the independent second surface', async ({ page, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Prepared conversation');
  const stage = await createDisplay(page, sessionId, 'Presentation stage');
  const aside = await createDisplay(page, sessionId, 'Discussion surface');
  await publishPrepared(page, sessionId, [aside.id], fact('Keep the discussion visible.'));
  const viewer = await openViewer(page, sessionId, stage.id);
  const sideViewer = await openViewer(page, sessionId, aside.id);
  // The presenter can cue the next slide before the previous paint ACK arrives.
  diagnostics.allowHttp(viewer, `/api/sessions/${sessionId}/displays/${stage.id}/applied`, 409);

  await tab(page, 'Library');
  await page.getByRole('button', { name: /^Presentations / }).click();
  await page.getByRole('button', { name: 'Create presentation', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Presentation name', { exact: true }).fill('Ready at the cue');
  await editor.getByLabel('Slide 1 content', { exact: true }).fill(JSON.stringify({ ...fact('Prepared before the conversation.'), title: 'The opening' }));
  await editor.getByLabel('Add a template', { exact: true }).selectOption('number');
  await editor.getByRole('button', { name: 'Add slide', exact: true }).click();
  await editor.getByLabel('Slide 2 content', { exact: true }).fill(JSON.stringify({
    version: 1, template: 'number', title: 'The exact result',
    data: { value: '42.000', unit: 'kg', label: 'Supplied measurement' },
    source: { title: 'Browser acceptance fixture' },
  } satisfies ViewSpec));
  await editor.getByRole('button', { name: 'Save presentation', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Ready at the cue', exact: true })).toBeVisible();

  // Reopen the workspace before playback to prove the deck is saved server-side.
  await page.reload();
  await tab(page, 'Library');
  await page.getByRole('button', { name: /^Presentations / }).click();
  await expect(page.getByRole('heading', { name: 'Ready at the cue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open presenter', exact: true }).click();
  const presenter = page.getByRole('dialog');
  await selectTargets(page, [stage.name]);
  await presenter.getByRole('button', { name: 'Show slide 1', exact: true }).click();
  await expect(viewer.getByText('Prepared before the conversation.', { exact: true })).toBeVisible();
  await expect(sideViewer.locator('.fact-text')).toHaveText('Keep the discussion visible.');
  await presenter.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(viewer.getByText('42.000', { exact: true })).toBeVisible();
  await expect(viewer.getByText('Supplied measurement', { exact: true })).toBeVisible();
  await expect(sideViewer.locator('.fact-text')).toHaveText('Keep the discussion visible.');
  await expect(presenter.getByRole('status')).toContainText('Slide 2 cued');
  await waitForDisplay(page, sessionId, stage.id, display => display.view !== null && display.appliedRevision === display.revision);
  await captureDisplay(viewer, testInfo, 'prepared-presentation');
  await expectFullSurface(sideViewer);
});

test('member viewer responses, no editing authority, live revocation and logout remove private content', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Invitation only');
  const display = await createDisplay(page, sessionId, 'Private shared view');
  const privateView: ViewSpec = { ...checklist, title: 'Private acceptance content' };
  await publishPrepared(page, sessionId, [display.id], privateView);

  const guestContext = await isolatedContext(browser, testInfo, baseURL!);
  try {
    const guest = await guestContext.newPage();
    diagnostics.watch(guest);
    const account = await register(guest);
    const ownHome = (await sessionApi<{ id: string; name: string }[]>(guest, '/api/sessions')).data!;
    expect(ownHome).toHaveLength(1); expect(ownHome[0].name).toBe('Home');
    await expect(guest.locator('.workspace-heading h1')).toHaveText('Home');
    // A queued read of this account's own Home may correctly lose authority
    // during the explicit sign-out. Do not permit errors for other resources.
    diagnostics.allowHttp(guest, `/api/sessions/${ownHome[0].id}`, 401);
    await signOutWorkspace(guest);
    await tab(page, 'People & access');
    await page.getByLabel('Add an existing account', { exact: true }).fill(account.username);
    await page.getByLabel('Access', { exact: true }).selectOption('viewer');
    await page.getByRole('button', { name: 'Add participant', exact: true }).click();
    await expect(page.locator('.people-list')).toContainText(`@${account.username}`);

    await login(guest, account, viewerPath(sessionId, display.id));
    await expect(guest.getByRole('region', { name: 'Private acceptance content', exact: true })).toBeVisible();
    const responseControl = guest.getByRole('checkbox', { name: 'Prepare the evidence', exact: true });
    await expect(responseControl).toBeEnabled();
    await responseControl.click();
    await expect(responseControl).toBeChecked();
    await guest.getByRole('button', { name: 'Display controls', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Hold this view', exact: true })).toHaveCount(0);
    // The response added a retained position. Browsing its predecessor is
    // private and read-only, and must not restore the shared checklist.
    const sharedAfterResponse = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
    await guest.getByRole('button', { name: 'Previous view', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Back to live', exact: true })).toBeVisible();
    await expect(responseControl).toBeDisabled();
    const stillShared = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
    expect(stillShared.revision).toBe(sharedAfterResponse.revision);
    expect(stillShared.view).toEqual(sharedAfterResponse.view);
    await guest.getByRole('button', { name: 'Back to live', exact: true }).click();
    await expect(responseControl).toBeEnabled();
    await expect(responseControl).toBeChecked();
    await expectFullSurface(guest);

    diagnostics.allowHttp(guest, `/api/sessions/${sessionId}`, 403);
    diagnostics.allowHttp(guest, `/api/sessions/${sessionId}`, 404);
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: `Remove access for ${account.username}`, exact: true }).click();
    await expect(page.locator('.people-list')).not.toContainText(`@${account.username}`);
    await expect(guest.getByRole('heading', { name: 'This display is unavailable.', exact: true })).toBeVisible();
    await expect(guest.getByText('Private acceptance content', { exact: true })).toHaveCount(0);
    await expect(guest.getByRole('checkbox', { name: 'Prepare the evidence', exact: true })).toHaveCount(0);
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'This display is unavailable.', exact: true })).toBeVisible();
    await expect(guest.getByText('Private acceptance content', { exact: true })).toHaveCount(0);

    await guest.getByRole('button', { name: 'Display controls', exact: true }).click();
    await guest.getByRole('button', { name: 'Sign out of this screen', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Sign in on this screen', exact: true })).toBeVisible();
    await expect(guest).toHaveURL(new URL('/',baseURL!).href);
    await expect(guest.getByText('Private acceptance content', { exact: true })).toHaveCount(0);
    await expect(guest.locator('.render-surface')).toHaveCount(0);
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Sign in on this screen', exact: true })).toBeVisible();
    await expect(guest).toHaveURL(new URL('/',baseURL!).href);
    await expect(guest.getByText('Private acceptance content', { exact: true })).toHaveCount(0);
  } finally { await guestContext.close(); }
});

test('disconnected viewer retains its last view, reconnects to the newest state and keeps the explicit theme', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  const account = await register(page);
  const sessionId = await createSession(page, 'Connection continuity');
  const display = await createDisplay(page, sessionId, 'Resilient surface');
  await publishPrepared(page, sessionId, [display.id], fact('The last received view stays useful.'));
  const viewerContext = await isolatedContext(browser, testInfo, baseURL!);
  let viewer: Page | undefined;
  try {
    viewer = await viewerContext.newPage();
    diagnostics.watch(viewer);
    await login(viewer, account, viewerPath(sessionId, display.id));
    await expect(viewer.locator('.fact-text')).toHaveText('The last received view stays useful.');
    const initial = await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === item.revision);
    diagnostics.allowOffline(viewer);
    await viewerContext.setOffline(true);
    await expect(viewer.getByRole('status')).toContainText('Offline', { timeout: 2_000 });
    await publishPrepared(page, sessionId, [display.id], fact('The current view arrives after reconnect.'));
    // A delayed acknowledgement must not mark the newer, unseen revision applied.
    const staleAck = await sessionApi(page, `/api/sessions/${sessionId}/displays/${display.id}/applied`, 'POST', { revision: initial.revision });
    expect(staleAck).toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    const offline = (await sessionDetail(page, sessionId)).displays.find(item => item.id === display.id)!;
    expect(offline.revision).toBeGreaterThan(initial.revision);
    expect(offline.appliedRevision).toBe(initial.revision);
    await expect(viewer.locator('.fact-text')).toHaveText('The last received view stays useful.');
    await viewerContext.setOffline(false);
    await expect(viewer.locator('.viewer-candidate .fact-text')).toHaveText('The current view arrives after reconnect.');
    await expect(viewer.locator('.viewer-candidate .fact-text')).toBeVisible();
    const reconnected = await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === item.revision);
    await expect(viewer.locator('.viewer-shell')).toHaveAttribute('data-rendered-revision', String(reconnected.revision));
    await expect(viewer.locator('.viewer-status')).toHaveCount(0);

    await tab(page, 'Settings');
    await expect(page.getByRole('radio', { name: /^Coding / })).toHaveCount(0);
    await page.getByLabel('Theme', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Settings saved');
    await expect(viewer.locator('.viewer-shell')).not.toHaveAttribute('data-mode');
    await expect(viewer.locator('.viewer-shell')).toHaveClass(/theme-light/);
    await publishPrepared(page, sessionId, [display.id], fact('An explicit theme survives a new visual.'));
    await expect(viewer.locator('.viewer-candidate .fact-text')).toHaveText('An explicit theme survives a new visual.');
    await expect(viewer.locator('.viewer-candidate .fact-text')).toBeVisible();
    const detail = await sessionDetail(page, sessionId);
    expect(detail.session.config).toMatchObject({ theme: 'light' });
    await expect(viewer.locator('.viewer-shell')).not.toHaveAttribute('data-mode');
    await captureDisplay(viewer, testInfo, 'reconnected-light-surface');
  } finally {
    await viewerContext.setOffline(false);
    await viewerContext.close();
  }
});

test('a delayed authorized snapshot cannot restore content after the session ends', async ({ page, diagnostics }) => {
  await register(page);
  const sessionId = await createSession(page, 'Final means final');
  const display = await createDisplay(page, sessionId, 'Closing surface');
  await publishPrepared(page, sessionId, [display.id], fact('Private content before closure.'));
  const viewer = await openViewer(page, sessionId, display.id);
  await expect(viewer.locator('.fact-text')).toHaveText('Private content before closure.');
  await waitForDisplay(page, sessionId, display.id, item => item.appliedRevision === item.revision);

  const path = `/api/sessions/${sessionId}`;
  const snapshotUrl = (url: URL) => url.pathname === path && url.searchParams.get('displayId') === display.id;
  let release!: () => void, captured!: () => void, captureFailed!: (error: unknown) => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const snapshotCaptured = new Promise<void>((resolve, reject) => { captured = resolve; captureFailed = reject; });
  let holdNext = true;
  const intercept = async (route: Route) => {
    if (route.request().method() !== 'GET' || !holdNext) return route.continue();
    holdNext = false;
    try {
      // Fetch while access is valid, but deliver the actual response after the ended event.
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      captured();
      await held;
      await route.fulfill({ response });
    } catch (error) { captureFailed(error); throw error; }
  };
  await viewer.route(snapshotUrl, intercept);
  for (const target of [page, viewer]) {
    diagnostics.allowHttp(target, path, 403);
    diagnostics.allowHttp(target, path, 404);
    diagnostics.allowHttp(target, path, 410);
  }
  try {
    await publishPrepared(page, sessionId, [display.id], fact('This snapshot arrived too late.'));
    await snapshotCaptured;
    const ended = await sessionApi(page, `${path}/end`, 'POST', {});
    expect(ended.status).toBe(200);
    await expect(viewer.getByRole('heading', { name: 'This display is unavailable.', exact: true })).toBeVisible();

    const arrived = viewer.waitForResponse(response => snapshotUrl(new URL(response.url())));
    release();
    const response = await arrived;
    expect(response.status()).toBe(200);
    await response.finished();
    await viewer.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(viewer.getByRole('heading', { name: 'This display is unavailable.', exact: true })).toBeVisible();
    await expect(viewer.locator('.render-surface')).toHaveCount(0);
    await expect(viewer.getByText('Private content before closure.', { exact: true })).toHaveCount(0);
    await expect(viewer.getByText('This snapshot arrived too late.', { exact: true })).toHaveCount(0);
  } finally {
    release();
    await viewer.unroute(snapshotUrl, intercept);
  }
});

test('a stale viewer acknowledgement refreshes the newer view without an editing warning', async ({ page, diagnostics }) => {
  await register(page);
  const sessionId = await createSession(page, 'Acknowledge the current view');
  const display = await createDisplay(page, sessionId, 'Ordered acknowledgements');
  await publishPrepared(page, sessionId, [display.id], fact('The first view was painted.'));
  await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'fact');
  const viewer = await page.context().newPage();
  const appliedPath = `/api/sessions/${sessionId}/displays/${display.id}/applied`;
  const appliedUrl = (url: URL) => url.pathname === appliedPath;
  const snapshotUrl = (url: URL) => url.pathname === `/api/sessions/${sessionId}` && url.searchParams.get('displayId') === display.id;
  let releaseApplied!: () => void, appliedRequested!: (revision: number) => void;
  let releaseSnapshot!: () => void, snapshotRequested!: () => void;
  const heldApplied = new Promise<void>(resolve => { releaseApplied = resolve; });
  const appliedCaptured = new Promise<number>(resolve => { appliedRequested = resolve; });
  const heldSnapshot = new Promise<void>(resolve => { releaseSnapshot = resolve; });
  const snapshotCaptured = new Promise<void>(resolve => { snapshotRequested = resolve; });
  let holdApplied = true;
  const interceptApplied = async (route: Route) => {
    if (route.request().method() !== 'POST' || !holdApplied) return route.continue();
    holdApplied = false;
    appliedRequested((route.request().postDataJSON() as { revision: number }).revision);
    await heldApplied;
    await route.continue();
  };
  const interceptSnapshot = async (route: Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    snapshotRequested();
    await heldSnapshot;
    await route.continue();
  };
  await viewer.route(appliedUrl, interceptApplied);
  diagnostics.allowHttp(viewer, appliedPath, 409);
  try {
    await viewer.goto(viewerPath(sessionId, display.id));
    await expect(viewer.locator('.fact-text')).toHaveText('The first view was painted.');
    const staleRevision = await appliedCaptured;
    await viewer.route(snapshotUrl, interceptSnapshot);
    const viewport = viewer.viewportSize()!;
    // A real viewport change starts a refresh, which stays in flight until after the ACK.
    await viewer.setViewportSize({ ...viewport, height: viewport.height - 24 });
    await snapshotCaptured;
    await publishPrepared(page, sessionId, [display.id], fact('The newer view wins the race.'));
    await waitForDisplay(page, sessionId, display.id, item => item.revision > staleRevision);
    await expect(viewer.locator('.fact-text')).toHaveText('The first view was painted.');

    const rejected = viewer.waitForResponse(response => response.url().endsWith(appliedPath) && response.request().method() === 'POST');
    releaseApplied();
    const response = await rejected;
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('REVISION_CONFLICT');
    await response.finished();
    await viewer.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(viewer.locator('.viewer-status')).toHaveCount(0);

    releaseSnapshot();
    await expect(viewer.locator('.viewer-candidate .fact-text')).toHaveText('The newer view wins the race.');
    await expect(viewer.locator('.viewer-candidate .fact-text')).toBeVisible();
    await waitForDisplay(page, sessionId, display.id, item => item.revision > staleRevision && item.appliedRevision === item.revision);
    await expect(viewer.locator('.viewer-status')).toHaveCount(0);
  } finally {
    releaseApplied(); releaseSnapshot();
    await viewer.unroute(appliedUrl, interceptApplied);
    await viewer.unroute(snapshotUrl, interceptSnapshot);
  }
});

// A slow initial list must not undo a newer explicit selection or retarget a form.
for (const releaseAt of ['session', 'display']) {
  test(`a late initial session list cannot replace a newly created ${releaseAt}`, async ({ page }) => {
    let first = true;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let snapshotReady!: () => void;
    const captured = new Promise<void>(resolve => { snapshotReady = resolve; });
    await page.route('**/api/sessions', async route => {
      if (route.request().method() !== 'GET' || !first) { await route.continue(); return; }
      first = false;
      const response = await route.fetch();
      snapshotReady();
      await held;
      await route.fulfill({ response });
    });
    try {
      await register(page);
      await captured;
      const sessionId = await createSession(page, 'Keep my explicit selection');
      if (releaseAt === 'display') await page.getByRole('button', { name: 'Add display', exact: true }).click();
      const late = page.waitForResponse(response => new URL(response.url()).pathname === '/api/sessions' && response.request().method() === 'GET');
      release();
      await (await late).finished();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator('.workspace-heading h1')).toHaveText('Keep my explicit selection');
      expect(new URL(page.url()).searchParams.get('session')).toBe(sessionId);
      if (releaseAt === 'display') {
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Display name', { exact: true }).fill('Correct session screen');
        await dialog.getByRole('button', { name: 'Add display', exact: true }).click();
        await expect(dialog).toBeHidden();
        expect((await sessionDetail(page, sessionId)).displays.some(display => display.name === 'Correct session screen')).toBe(true);
      } else await createDisplay(page, sessionId, 'Correct session screen');
    } finally { release(); }
  });
}
