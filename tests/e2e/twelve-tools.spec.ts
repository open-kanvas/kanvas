import { operationRequest } from '../mcp/requests.js';
import { DISCOVERY_TOOL_NAMES, OPERATION_ENTRIES, operationId } from '../../src/server/mcp/operations.js';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { DisplayRecord, InteractionRecord, SessionRecord, UpdateRecord } from '../../src/shared/types';
import type { ReportPage, ReportRecord } from '../../src/shared/reports';
import { createDisplay, createSession, expect, isolatedContext, register, sessionApi, tab, test, waitForDisplay } from './support';

test('core-tool workflow preserves exact content, actual painting, viewer input and separate product reports', async ({ page, baseURL }) => {
  await register(page);
  const issued = await sessionApi<{ token: string }>(page, '/api/tokens', 'POST', { name: 'Disposable twelve-tool browser acceptance', scopes: ['read', 'publish'] });
  expect(issued.status).toBe(201);
  const client = new Client({ name: 'twelve-tool-browser-acceptance', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
  async function call<T>(name: string, operation: string, args: Record<string, unknown> = {}): Promise<T> {
    const entry = OPERATION_ENTRIES.find(entry => entry.tool === name && entry.operation === operation)!;
    const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(entry.canonical), arguments: args } });
    expect(result.isError, `${name}/${operation}`).not.toBe(true);
    return (result.structuredContent as { data: T }).data;
  }
  try {
    const catalog = await client.listTools();
    expect(catalog.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    const index = await client.callTool({ name: 'kanvas_discover', arguments: { catalog:'tools', action:'list' } });
    expect((index.content[0] as {text:string}).text.split('\n').filter(line=>line.includes(' — '))).toHaveLength(OPERATION_ENTRIES.length - 3);
    expect(catalog.tools.some(tool => tool.name === 'kanvas_submit')).toBe(false);
    const session = await call<SessionRecord>('kanvas_session', 'create', { name: 'Twelve-tool exact source workflow' });
    const sessionId = session.id;
    const display = await call<DisplayRecord>('kanvas_session', 'display.register', { sessionId, name: 'Returned viewer URL', width: 1200, height: 800 });
    expect(display.viewerUrl).toBe(`${baseURL}/view/${sessionId}/${display.id}`);
    const viewer = await page.context().newPage();
    await viewer.goto(display.viewerUrl!);
    await expect(viewer.locator('.viewer-shell')).toBeVisible();
    await viewer.bringToFront();
    const dataset = await call<{ id: string }>('kanvas_import', 'dataset.import', { sessionId, name: 'Exact ledger', json: '[{"item":"A","amount":1.2300},{"item":"B","amount":9007199254740993}]' });
    await call<UpdateRecord>('kanvas_publish', 'show', { sessionId, displayIds: [display.id], requestId: 'table-1', datasetId: dataset.id, templateHint: 'table', intent: 'Show all exact supplied rows.' });
    await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'table' && item.appliedRevision === item.revision && item.revision > 0);
    await expect(viewer.getByRole('cell', { name: '1.2300', exact: true })).toBeVisible();
    await expect(viewer.getByRole('cell', { name: '9007199254740993', exact: true })).toBeVisible();
    expect((await call<UpdateRecord>('kanvas_inspect', 'update.status', { sessionId, requestId: 'table-1' })).status).toBe('applied');

    const source = 'Exact source 1.2300; kanvas_submit stays literal.';
    await call<UpdateRecord>('kanvas_publish', 'show', { sessionId, displayIds: [display.id], requestId: 'fact-1', view: { version: 1, template: 'fact', data: { text: source }, actions: [{ id: 'confirm', kind: 'button', label: 'Confirm supplied fact' }] } });
    const first = await waitForDisplay(page, sessionId, display.id, item => item.view?.template === 'fact' && item.revision === item.appliedRevision);
    const changed = `${source} One explicitly supplied addition.`;
    await call('kanvas_publish', 'patch', { sessionId, displayId: display.id, requestId: 'patch-1', expectedRevision: first.revision, operations: [{ op: 'set', path: '/data/text', value: changed }] });
    const patched = await waitForDisplay(page, sessionId, display.id, item => item.revision > first.revision && item.revision === item.appliedRevision);
    await expect(viewer.getByText(changed, { exact: true })).toBeVisible();
    expect((await call<DisplayRecord>('kanvas_inspect', 'display.current', { sessionId, displayId: display.id })).view?.data.text).toBe(changed);
    await call('kanvas_control', 'display.update', { sessionId, displayId: display.id, width: 1000, height: 700 });
    const afterViewport = await call<DisplayRecord>('kanvas_inspect', 'display.current', { sessionId, displayId: display.id });
    expect(afterViewport.revision).toBe(patched.revision); expect(afterViewport.view?.data.text).toBe(changed);

    await viewer.getByRole('button', { name: 'Confirm supplied fact', exact: true }).click();
    let interaction: InteractionRecord | undefined;
    await expect.poll(async () => {
      const inbox = await call<{ interactions: InteractionRecord[] }>('kanvas_inspect', 'interactions.read', { sessionId });
      interaction = inbox.interactions.find(item => item.actionId === 'confirm');
      return Boolean(interaction);
    }).toBe(true);
    const repeatedRead = await call<{ interactions: InteractionRecord[] }>('kanvas_inspect', 'interactions.read', { sessionId });
    expect(repeatedRead.interactions.some(item => item.id === interaction!.id)).toBe(true);
    await call('kanvas_interactions', 'acknowledge', { sessionId, interactionId: interaction!.id });
    expect((await call<{ interactions: InteractionRecord[] }>('kanvas_inspect', 'interactions.read', { sessionId })).interactions.some(item => item.id === interaction!.id)).toBe(false);

    const report = await call<ReportRecord>('kanvas_feedback', 'submit', { sessionId, requestId: 'report-1', title: 'Synthetic acceptance observation', description: 'kanvas_submit remains literal report text, not a callable instruction.', category: 'quality', displayId: display.id });
    const readReports = await call<ReportPage>('kanvas_inspect', 'reports.read', { sessionId });
    expect(readReports.reports.map(item => item.id)).toEqual([report.id]);
    expect(readReports.reports[0].description).toBe(report.description);
    expect((await call<{ interactions: InteractionRecord[] }>('kanvas_inspect', 'interactions.read', { sessionId, status: 'all' })).interactions.some(item => item.id === report.id)).toBe(false);
    await call('kanvas_feedback', 'report.update', { sessionId, reportId: report.id, expectedRevision: report.revision, status: 'resolved', note: 'Synthetic browser acceptance verified the separate report round trip.' });
    expect((await call<ReportPage>('kanvas_inspect', 'reports.read', { sessionId })).reports[0].status).toBe('resolved');
    await call('kanvas_remove', 'display.clear', { sessionId, displayIds: [display.id], requestId: 'clear-1' });
    await waitForDisplay(page, sessionId, display.id, item => item.view === null && item.appliedRevision === item.revision);
    await expect(viewer.getByText(changed, { exact: true })).toHaveCount(0);
    await viewer.close();
  } finally { await client.close(); }
});

test('an agent can repair pairing and feedback inputs while the intended browser waits for explicit approval', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Agent recovery workflow');
  const issued = await sessionApi<{ token: string }>(page, '/api/tokens', 'POST', { name: 'Disposable recovery acceptance', scopes: ['read', 'publish'] });
  expect(issued.status).toBe(201);
  const client = new Client({ name: 'agent-input-recovery-browser', version: '1' });
  const context = await isolatedContext(browser, testInfo, baseURL!);
  async function call<T>(name: string, operation: string, args: Record<string, unknown>): Promise<T> {
    const entry = OPERATION_ENTRIES.find(entry => entry.tool === name && entry.operation === operation)!;
    const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(entry.canonical), arguments: args } });
    expect(result.isError, `${name}/${operation}`).not.toBe(true);
    return (result.structuredContent as { data: T }).data;
  }
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
    const display = await call<DisplayRecord>('kanvas_session', 'display.register', { sessionId, name: 'Unmeasured screen' });
    expect(display).toMatchObject({ width: 1280, height: 720 });
    const source = 'Only the explicitly approved browser should see this fact.';
    await call('kanvas_publish', 'show', { sessionId, displayIds: [display.id], requestId: 'recovery-fact', view: { version: 1, template: 'fact', data: { text: source } } });

    const guest = await context.newPage(); diagnostics.watch(guest);
    const requested = guest.waitForResponse(response => new URL(response.url()).pathname === '/api/pairings' && response.request().method() === 'POST');
    await guest.goto(display.viewerUrl!);await guest.getByRole('button',{name:'Pair this screen'}).click();
    const pair = (await (await requested).json() as { data: { id: string } }).data;
    await expect(guest.getByRole('heading', { name: 'Waiting for the owner.', exact: true })).toBeVisible();
    await expect(guest.getByText(source, { exact: true })).toHaveCount(0);

    const badDecision = await client.callTool({ name: 'kanvas_call', arguments: { operationId: 'kanvas.pairing.decide', arguments: { sessionId, pairingId: pair.id } } });
    expect(badDecision.isError).toBe(true);
    expect((badDecision.structuredContent as { error: unknown }).error).toMatchObject({
      code: 'INVALID_ARGUMENT', schemaTool: 'kanvas_discover', schemaArguments: { catalog: 'tools', action: 'get', id: 'kanvas.pairing.decide' }, topic: 'tools',
      issues: [{ path: 'approve', problem: 'Required boolean (true or false); received missing.' }, { path: 'confirm', problem: expect.stringContaining('owner confirms') }],
    });
    const repair = (badDecision.structuredContent as { error: { schemaTool: string; schemaArguments: Record<string, unknown> } }).error;
    const repaired = await client.callTool({ name: repair.schemaTool, arguments: repair.schemaArguments });
    expect(repaired.isError).not.toBe(true);
    expect((repaired.structuredContent as { data: unknown }).data).toMatchObject({
      catalog: 'tools', action: 'get', entry: { id: 'kanvas.pairing.decide', requiredInputs: expect.arrayContaining(['pairingId', 'approve', 'confirm']), inputSchema: { properties: { approve: { type: 'boolean' }, confirm: { const: true } } }, examples: expect.arrayContaining([expect.objectContaining({ tool: 'kanvas_call' })]) },
    });
    expect(JSON.stringify(repaired.structuredContent)).toContain('examples never grant consent');
    expect(JSON.stringify(repaired.structuredContent)).toContain('kanvas_call');
    const pending = await call<Array<{ id: string; displayId: string; status: string }>>('kanvas_inspect', 'pairings.read', { sessionId });
    expect(pending.find(item => item.id === pair.id)).toMatchObject({ displayId: display.id, status: 'pending' });
    await expect(guest.locator('.viewer-shell')).toHaveCount(0);
    await call('kanvas_access', 'pairing.decide', { sessionId, pairingId: pair.id, approve: true, confirm: true });
    await expect(guest.locator('.viewer-shell')).toBeVisible();
    await guest.bringToFront();
    await expect(guest.getByText(source, { exact: true })).toBeVisible();
    const size = guest.viewportSize()!;
    await waitForDisplay(page, sessionId, display.id, item => item.width === size.width && item.height === size.height && item.appliedRevision === item.revision && item.revision > 0);

    const reportArgs = { sessionId, requestId: 'recovery-report', title: 'Agent reproduction prose', description: 'The full reproduction should survive validation and be visible for review.', displayId: display.id };
    const tooLong = await client.callTool({ name: 'kanvas_call', arguments: { operationId: 'kanvas.error.report', arguments: { ...reportArgs, steps: 'x'.repeat(3201) } } });
    expect(tooLong.isError).toBe(true);
    expect((tooLong.structuredContent as { error: unknown }).error).toMatchObject({ code: 'INVALID_ARGUMENT', issues: [{ path: 'steps', maximum: 3200, actual: 3201, unit: 'characters' }] });
    const steps = 'Open the intended screen. Keep its request pending until the owner confirms it.\nThen approve that browser and check the exact fact.\n'.repeat(6).trim();
    const report = await call<ReportRecord>('kanvas_feedback', 'error.report', { ...reportArgs, steps });
    expect(report.steps).toEqual([steps]);
    expect((await call<ReportRecord>('kanvas_feedback', 'error.report', { ...reportArgs, steps })).id).toBe(report.id);
    await tab(page, 'Activity');
    await page.getByRole('button', { name: 'Reports', exact: true }).click();
    const visible = page.getByRole('article', { name: `Report: ${reportArgs.title}`, exact: true });
    await expect(visible).toBeVisible();
    await expect(visible.locator('ol > li')).toHaveCount(1);
    expect(await visible.locator('ol > li').textContent()).toBe(steps);
    expect((await call<ReportPage>('kanvas_inspect', 'reports.read', { sessionId })).reports).toHaveLength(1);
  } finally { await context.close(); await client.close(); }
});

test('JSON-encoded tool arguments still require consent and produce an acknowledged view on the receiving screen', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Cached-host wire recovery');
  const issued = await sessionApi<{ token: string }>(page, '/api/tokens', 'POST', { name: 'Disposable wire recovery', scopes: ['read', 'publish'] });
  expect(issued.status).toBe(201);
  const client = new Client({ name: 'cached-host-wire-recovery', version: '1' });
  const context = await isolatedContext(browser, testInfo, baseURL!);
  async function call<T>(name: string, operation: string, args: Record<string, unknown>): Promise<T> {
    const entry = OPERATION_ENTRIES.find(entry => entry.tool === name && entry.operation === operation)!;
    const result = await client.callTool({ name: 'kanvas_call', arguments: { operationId: operationId(entry.canonical), arguments: args } });
    expect(result.isError, `${name}/${operation}`).not.toBe(true);
    expect((result.structuredContent as { server: { version: string } }).server.version).toBe(client.getServerVersion()?.version);
    return (result.structuredContent as { data: T }).data;
  }
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseURL), { requestInit: { headers: { Authorization: `Bearer ${issued.data!.token}` } } }));
    const catalog = await client.listTools();
    const pairing = await client.callTool({ name: 'kanvas_discover', arguments: { catalog: 'tools', action: 'get', id: 'kanvas.pairing.decide' } });
    expect((pairing.structuredContent as any).data.entry.inputSchema.properties.approve).toMatchObject({ type: 'boolean' });
    expect(catalog.tools.map(tool => tool.name)).toEqual(DISCOVERY_TOOL_NAMES);
    const display = await call<DisplayRecord>('kanvas_session', 'display.register', { sessionId, name: 'Confirmed receiving screen' });
    const guest = await context.newPage(); diagnostics.watch(guest);
    const requested = guest.waitForResponse(response => new URL(response.url()).pathname === '/api/pairings' && response.request().method() === 'POST');
    await guest.goto(display.viewerUrl!);await guest.getByRole('button',{name:'Pair this screen'}).click();
    const pair = (await (await requested).json() as { data: { id: string } }).data;
    await expect(guest.getByRole('heading', { name: 'Waiting for the owner.', exact: true })).toBeVisible();
    const invalid = await client.callTool(operationRequest({ name: 'kanvas_access', arguments: { operation: 'pairing.decide', sessionId, pairingId: pair.id, approve: 'true', confirm: 'false' } }));
    expect(invalid.isError).toBe(true);
    const error = (invalid.structuredContent as { error: { diagnosticId: string } }).error;
    const state = await call<{ recentDiagnostics: { diagnosticId: string; operation: string }[] }>('kanvas_inspect', 'session.state', { sessionId });
    expect(state.recentDiagnostics.some(item => item.diagnosticId === error.diagnosticId && item.operation === 'kanvas.pairing.decide')).toBe(true);
    await expect(guest.locator('.viewer-shell')).toHaveCount(0);
    await call('kanvas_access', 'pairing.decide', { sessionId, pairingId: pair.id, approve: 'true', confirm: 'true', interactive: 'false' });
    await expect(guest.locator('.viewer-shell')).toBeVisible();
    await guest.bringToFront();
    const text = 'Encoded transport, exact visible values: 1.2300 and 9007199254740993.';
    const input = { sessionId, requestId: 'encoded-visible-fact', displayIds: JSON.stringify([display.id]), view: JSON.stringify({ version: 1, template: 'fact', data: { text } }) };
    const update = await call<UpdateRecord>('kanvas_publish', 'show', input);
    const current = await waitForDisplay(page, sessionId, display.id, item => item.view?.data.text === text && item.appliedRevision === item.revision);
    await expect(guest.getByText(text, { exact: true })).toBeVisible();
    expect((await call<UpdateRecord>('kanvas_inspect', 'update.status', { sessionId, requestId: input.requestId })).status).toBe('applied');
    expect((await call<UpdateRecord>('kanvas_publish', 'show', input)).id).toBe(update.id);
    const amended = `${text} An explicit patch.`;
    await call('kanvas_publish', 'patch', { sessionId, displayId: display.id, expectedRevision: String(current.revision), requestId: 'encoded-visible-patch', operations: JSON.stringify([{ op: 'set', path: '/data/text', value: amended }]) });
    await waitForDisplay(page, sessionId, display.id, item => item.revision > current.revision && item.appliedRevision === item.revision && item.view?.data.text === amended);
    await expect(guest.getByText(amended, { exact: true })).toBeVisible();
    const steps = '["Literal reproduction text, not an argument envelope"]';
    const reportArgs = { sessionId, requestId: 'wire-browser-report', title: 'Cached-host recovery verified', description: amended, diagnosticId: error.diagnosticId, steps };
    const report = await call<ReportRecord>('kanvas_feedback', 'error.report', reportArgs);
    expect((await call<ReportRecord>('kanvas_feedback', 'error.report', reportArgs)).id).toBe(report.id);
    const stored = (await call<ReportPage>('kanvas_inspect', 'reports.read', { sessionId })).reports;
    expect(stored).toHaveLength(1); expect(stored[0].steps).toEqual([steps]);
    await tab(page, 'People & access');
    diagnostics.allowHttp(guest, `/api/sessions/${sessionId}`, 401);
    await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
    await expect(guest.locator('.viewer-shell')).toHaveCount(0);
    await expect(guest.getByText(amended, { exact: true })).toHaveCount(0);
  } finally { await context.close(); await client.close(); }
});

test('an expired direct-screen request stops waiting and offers a fresh unapproved request', async ({ page, browser, baseURL, diagnostics }, testInfo) => {
  await register(page);
  const sessionId = await createSession(page, 'Expired direct screen');
  const display = await createDisplay(page, sessionId, 'Intended screen');
  const context = await isolatedContext(browser, testInfo, baseURL!);
  try {
    const guest = await context.newPage(); diagnostics.watch(guest);
    await guest.clock.install();
    type PairingResult = { id: string; status: string; expiresAt: string; closeReason?: string };
    const pendingRequest = async (action: () => Promise<void>): Promise<PairingResult> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const requested = guest.waitForResponse(r => new URL(r.url()).pathname === '/api/pairings' && r.request().method() === 'POST');
        await action();
        const response = await requested;
        expect(response.ok()).toBe(true);
        const result = (await response.json() as { data: PairingResult }).data;
        if (result.status !== 'cancelled') {
          expect(result.status).toBe('pending');
          return result;
        }
        // Recognition labels intentionally fail closed on a random collision.
        // Verify the real safety outcome, then take the offered user action;
        // do not retry failed assertions or bypass approval to test expiry.
        expect(result.closeReason).toBe('label-collision');
        await expect(guest.getByRole('status')).toHaveText('Two pending requests received the same recognition label. Both were cancelled; request a new label.');
        await expect(guest.locator('.viewer-shell')).toHaveCount(0);
        await guest.getByRole('button', { name: 'Try a new request', exact: true }).click();
        action = () => guest.getByRole('button', { name: 'Request screen access', exact: true }).click();
      }
      throw new Error('Could not obtain a non-colliding pending pairing request after three explicit requests.');
    };
    const first = await pendingRequest(async () => {
      await guest.goto(`${baseURL}/view/${sessionId}/${display.id}`);
      await guest.getByRole('button', { name: 'Pair this screen' }).click();
    });
    await expect(guest.getByRole('heading', { name: 'Waiting for the owner.', exact: true })).toBeVisible();
    await guest.clock.fastForward(Math.max(0, Date.parse(first.expiresAt) - await guest.evaluate(() => Date.now())) + 5_000);
    await expect(guest.getByText('expired', { exact: true })).toBeVisible();
    await expect(guest.locator('.viewer-shell')).toHaveCount(0);
    let polls = 0;
    guest.on('request', r => { if (/\/api\/pairings\/[^/]+\/status$/.test(new URL(r.url()).pathname)) polls++; });
    await guest.clock.fastForward(10_000);
    expect(polls).toBe(0);

    // Server time was never changed. Bring this synthetic browser back to real
    // time before obtaining another genuinely valid server-issued deadline.
    await guest.clock.setSystemTime(Date.now());
    await guest.getByRole('button', { name: 'Try a new request', exact: true }).click();
    const next = await pendingRequest(() => guest.getByRole('button', { name: 'Request screen access', exact: true }).click());
    expect(next.id).not.toBe(first.id); expect(next.status).toBe('pending');
    expect(Date.parse(next.expiresAt)).toBeGreaterThan(Date.now());
    await expect(guest.getByRole('heading', { name: 'Waiting for the owner.', exact: true })).toBeVisible();
    await expect(guest.locator('.viewer-shell')).toHaveCount(0);
  } finally { await context.close(); }
});
