import { operationRequest } from '../mcp/requests.js';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatasetRecord, InteractionRecord, InterpretationResult, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import { ControlledInterpreter, denied, fact, PNG, startHarness, success, type Browser, type Detail, type Harness } from './harness.js';

const amounts = ['0.123456789012345678901234567890', '-12.3400000000000000000000001'];
const units = ['9007199254740993', '9007199254740995'];
const dates = ['2026-09-01', '2026-09-02'];
const exactRows = dates.map((date, index) => ({ date, amount: amounts[index], units: units[index] }));
const source = { title: 'Synthetic precision source', locator: 'Rows 1–2' };
const inlineSources = [
  { format: 'CSV', data: { csv: `date,amount,units\n${dates[0]},${amounts[0]},${units[0]}\n${dates[1]},${amounts[1]},${units[1]}` } },
  // The numeric tokens deliberately cross HTTP as JSON text, never JSON.parse/stringify round trips.
  { format: 'JSON', data: { json: `[{"date":"${dates[0]}","amount":${amounts[0]},"units":${units[0]}},{"date":"${dates[1]}","amount":${amounts[1]},"units":${units[1]}}]` } },
];
const renderCases = [
  { name: 'chart', template: 'chart' as const, binding: { x: 'date', y: ['amount', 'units'] } },
  { name: 'table', template: 'table' as const, binding: { columns: ['date', 'amount', 'units'] } },
  { name: 'decimal number', template: 'number' as const, binding: { y: ['amount'], row: 0 }, value: amounts[0] },
  { name: 'large integer number', template: 'number' as const, binding: { y: ['units'], row: 0 }, value: units[0] },
];

function displayView(detail: Detail, displayId: string): ViewSpec {
  const view = detail.displays.find(display => display.id === displayId)?.view;
  expect(view).toBeTruthy();
  return view!;
}

function assertExactView(view: ViewSpec, render: typeof renderCases[number]): void {
  if (view.template === 'presentation') {
    expect(view.data.index).toBe(0);
    const slides = view.data.slides as ViewSpec[]; expect(slides).toHaveLength(1);
    return assertExactView(slides[0], render);
  }
  expect(view.template).toBe(render.template);
  expect(view).not.toHaveProperty('source');
  if (render.template === 'number') expect(view.data.value).toBe(render.value);
  else if (render.template === 'table') {
    expect(view.data.columns).toEqual(['date', 'amount', 'units']);
    expect(view.data.rows).toEqual(exactRows);
  } else {
    const series = view.data.series as { name: string; points: { x: string; y: number; rawX: string; rawY: string; sourceRows: number[] }[] }[];
    expect(series.map(item => item.name)).toEqual(['amount', 'units']);
    for (const [index, values] of [amounts, units].entries()) {
      expect(series[index].points.map(point => point.rawX)).toEqual(dates);
      expect(series[index].points.map(point => point.rawY)).toEqual(values);
      expect(series[index].points.map(point => point.sourceRows)).toEqual([[0], [1]]);
      expect(series[index].points.every(point => Number.isFinite(point.y))).toBe(true);
    }
  }
}

/** A retained binding must be durable; an already-materialized inline view needs no binding. */
function assertResolvableView(view: ViewSpec, detail: Detail): void {
  if (view.template === 'presentation') { for (const slide of view.data.slides as ViewSpec[]) assertResolvableView(slide, detail); return; }
  const binding = view.data.binding as { datasetId?: string } | undefined;
  if (binding?.datasetId) expect(detail.datasets.map(dataset => dataset.id)).toContain(binding.datasetId);
}

describe('inline sources at publication and saved-playback boundaries', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  for (const inline of inlineSources) for (const render of renderCases) {
    it(`publishes an exact ${render.name} from inline ${inline.format}, then saves, cues and restarts it`, async () => {
      const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
      const submission = { requestId: randomUUID(), displayIds: [display.id], templateHint: render.template, data: { ...inline.data, binding: render.binding } };
      const accepted = success(await owner.request<UpdateRecord>('POST', `/api/sessions/${session.id}/submit`, submission));
      const prepared = await owner.settle(session.id, submission.requestId);
      expect(prepared.update.status).toBe('prepared');
      const view = displayView(prepared.detail, display.id);
      assertExactView(view, render);
      assertResolvableView(view, prepared.detail);
      const retry = success(await owner.request<UpdateRecord>('POST', `/api/sessions/${session.id}/submit`, submission));
      expect(retry.id).toBe(accepted.id);
      expect((await owner.detail(session.id)).displays[0].revision).toBe(prepared.detail.displays[0].revision);

      const deck = success(await owner.request<{ id: string; slides: ViewSpec[] }>('POST', `/api/sessions/${session.id}/presentations`, { name: 'Retained inline source', slides: [view] }));
      assertExactView(deck.slides[0], render);
      await owner.submit(session.id, [display.id], fact('Intervening content'));
      success(await owner.request('POST', `/api/sessions/${session.id}/presentations/${deck.id}/cue`, { index: 0, displayIds: [display.id], requestId: 'cue-before-restart' }));
      const cued = await owner.settle(session.id, 'cue-before-restart');
      expect(cued.update.status).toBe('prepared');
      assertExactView(displayView(cued.detail, display.id), render);

      const cookies = new Map(owner.cookies);
      await h.shutdown();
      const restarted = await startHarness({ database: h.database });
      try {
        const browser = restarted.browser();
        for (const [name, value] of cookies) browser.cookies.set(name, value);
        browser.csrf = success(await browser.request<{ csrfToken: string }>('GET', '/api/auth/me')).csrfToken;
        const restored = await browser.detail(session.id);
        expect(displayView(restored, display.id)).toEqual(displayView(cued.detail, display.id));
        assertResolvableView(displayView(restored, display.id), restored);
        const decks = success(await browser.request<{ id: string; slides: ViewSpec[] }[]>('GET', `/api/sessions/${session.id}/presentations`));
        assertExactView(decks.find(item => item.id === deck.id)!.slides[0], render);
        await browser.submit(session.id, [display.id], fact('Cleared for replay after restart'));
        success(await browser.request('POST', `/api/sessions/${session.id}/presentations/${deck.id}/cue`, { index: 0, displayIds: [display.id], requestId: 'cue-after-restart' }));
        const replayed = await browser.settle(session.id, 'cue-after-restart');
        expect(replayed.update.status).toBe('prepared');
        assertExactView(displayView(replayed.detail, display.id), render);
      } finally { await restarted.close(); }
    });
  }
});

interface Inbox { interactions: InteractionRecord[]; nextCursor?: string }

async function publisher(h: Harness, owner: Browser, sessionId: string): Promise<Client> {
  const issued = success(await owner.request<{ token: string }>('POST', '/api/tokens', { name: 'Synthetic regression publisher', scopes: ['read', 'publish'], sessionIds: [sessionId] }));
  const client = new Client({ name: 'kanvas-regressions', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } } });
  try { await client.connect(transport); return client; }
  catch (error) { await client.close(); throw error; }
}

async function tool<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool(operationRequest({ name, arguments: args }));
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toHaveProperty('data');
  return (result.structuredContent as { data: T }).data;
}

describe('the published MCP feedback pagination contract', () => {
    let h: Harness, client: Client | undefined;
    beforeEach(async () => { h = await startHarness(); client = undefined; });
    afterEach(async () => { await client?.close(); await h?.close(); });
    it('uses afterId, a 25-record default, explicit limits and terminal cursors without losing or duplicating actions', async () => {
        const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id);
        client = await publisher(h, owner, session.id);
        const view: ViewSpec = { ...fact('Synthetic feedback pages'), actions: [{ id: 'next', kind: 'button', label: 'Next' }] };
        await tool(client, "kanvas.publish", { sessionId: session.id, requestId: 'pagination-source', displayIds: [display.id], view });
        const prepared = await owner.settle(session.id, 'pagination-source');
        expect(prepared.update.status).toBe('prepared');
        const ids: string[] = [];
        for (let index = 0; index < 31; index++) {
            const interaction = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, { displayId: display.id, revision: prepared.detail.displays[0].revision, actionId: 'next', value: true, requestId: `click-${index}` }));
            ids.push(interaction.id);
        }
        const first = await tool<Inbox>(client, "kanvas.interactions.read", { sessionId: session.id });
        expect(first.interactions.map(item => item.id)).toEqual(ids.slice(0, 25));
        expect(first.nextCursor).toBe(ids[24]);
        expect(first.interactions.every(item => item.status === 'pending')).toBe(true);
        const remaining = await tool<Inbox>(client, "kanvas.interactions.read", { sessionId: session.id, afterId: first.nextCursor });
        expect(remaining.interactions.map(item => item.id)).toEqual(ids.slice(25));
        expect(remaining.nextCursor).toBeUndefined();
        const traversed: string[] = [];
        let afterId: string | undefined;
        for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
            const page = await tool<Inbox>(client, "kanvas.interactions.read", { sessionId: session.id, limit: 7, ...(afterId ? { afterId } : {}) });
            expect(page.interactions.length).toBeLessThanOrEqual(7);
            traversed.push(...page.interactions.map(item => item.id));
            afterId = page.nextCursor;
            if (!afterId)
                break;
        }
        expect(traversed).toEqual(ids);
        expect(new Set(traversed).size).toBe(ids.length);
        const end = await tool<Inbox>(client, "kanvas.interactions.read", { sessionId: session.id, afterId: ids.at(-1), limit: 1 });
        expect(end.interactions).toEqual([]);
        expect(end.nextCursor).toBeUndefined();
        // Reading any page must not consume pending feedback.
        expect((await tool<Inbox>(client, "kanvas.interactions.read", { sessionId: session.id, limit: 100 })).interactions.map(item => item.id)).toEqual(ids);
        const invalid = await client.callTool(operationRequest({
            name: "kanvas_call",
            arguments: {
                operationId: "kanvas.interactions.read",
                arguments: {
                    sessionId: session.id, afterId: 'unknown-cursor'
                }
            }
        }));
        expect(invalid.isError).toBe(true);
        const error = (invalid.structuredContent as {
            error: {
                code: string;
                message: string;
            };
        }).error;
        expect(['INVALID_CURSOR', 'INVALID_ARGUMENT']).toContain(error.code);
        expect(error.message.length).toBeLessThan(300);
        for (const limit of [0, 101]) {
            const invalidLimit = await client.callTool(operationRequest({
                name: "kanvas_call",
                arguments: {
                    operationId: "kanvas.interactions.read",
                    arguments: {
                        sessionId: session.id, limit
                    }
                }
            }));
            expect(invalidLimit.isError).toBe(true);
        }
    });
});

describe('multi-target usage accounting', () => {
  let h: Harness, interpreter: ControlledInterpreter;
  beforeEach(async () => { interpreter = new ControlledInterpreter(); h = await startHarness({ interpreter }); });
  afterEach(async () => { interpreter?.releaseAll(); await h?.close(); });

  async function prepare(metrics: readonly [InterpretationResult['metrics'], InterpretationResult['metrics']]) {
    const owner = await h.account(), session = await owner.session();
    const displays = [await owner.display(session.id, 'Phone', 390, 844), await owner.display(session.id, 'Room', 1920, 1080)];
    const submission = { requestId: 'accounted-update', displayIds: displays.map(display => display.id), data: { text: 'Synthetic multiple-target source' } };
    success(await owner.request('POST', `/api/sessions/${session.id}/submit`, submission));
    await interpreter.waitFor(2);
    // The second target completes first; metric identity must follow the target, not completion order.
    for (const index of [1, 0]) interpreter.calls[index].resolve({ action: 'replace', view: fact(`For width ${interpreter.calls[index].input.display.width}`), metrics: metrics[index] });
    const prepared = await owner.settle(session.id, submission.requestId);
    expect(prepared.update.status).toBe('prepared');
    for (const display of displays) expect(displayView(prepared.detail, display.id).data.text).toBe(`For width ${display.width}`);
    return { owner, session, displays, submission, prepared };
  }

  it('sums validation time and preserves target identity through retries and paint acknowledgements', async () => {
    const metrics=[{path:'source',validationMs:8},{path:'prepared',validationMs:13}] as const;
    const {owner,session,displays,submission,prepared}=await prepare(metrics);
    const total=prepared.update.metrics!;
    expect(total).toMatchObject({validationMs:21,targetDisplays:2,path:'mixed'});
    for(const [index,display] of displays.entries())expect(total[`display.${display.id}.validationMs`]).toBe(metrics[index].validationMs);
    const retry=success(await owner.request<UpdateRecord>('POST',`/api/sessions/${session.id}/submit`,submission));expect(retry.id).toBe(prepared.update.id);expect(retry.metrics).toEqual(total);expect(interpreter.calls).toHaveLength(2);
    for(const display of displays)success(await owner.request('POST',`/api/sessions/${session.id}/displays/${display.id}/applied`,{revision:prepared.update.revisions[display.id]}));
    const applied=(await owner.detail(session.id)).updates.find(update=>update.id===prepared.update.id)!;expect(applied.status).toBe('applied');expect(applied.metrics).toMatchObject(total);
  });
  it('does not invent absent rendering measurements',async()=>{
    const {prepared}=await prepare([{},{}]);expect(prepared.update.metrics).toMatchObject({targetDisplays:2});expect(prepared.update.metrics).not.toHaveProperty('validationMs');
  });
});

describe('bounded session snapshots and explicit source retrieval', () => {
  let h: Harness;
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await h?.close(); });

  it('returns row-free metadata and grants full source retrieval only to an authorized full-account session viewer', async () => {
    const owner = await h.account(), viewer = await h.account(), outsider = await h.account();
    const session = await owner.session(), other = await owner.session('Separate source boundary');
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: viewer.user!.username, role: 'viewer' }));
    const rows = Array.from({ length: 1200 }, (_, index) => ({ index: String(index), amount: amounts[0], note: `synthetic-private-row-${index}-${'x'.repeat(80)}` }));
    const dataset = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${session.id}/datasets`, { name: 'Large exact source', rows, source }));
    const foreign = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${other.id}/datasets`, { name: 'Other session source', rows: [{ value: 'not in this session' }] }));
    for (const browser of [owner, viewer]) {
      const response = await browser.request<Detail>('GET', `/api/sessions/${session.id}`);
      const detail = success(response);
      expect(detail.datasets).toHaveLength(1);
      expect(detail.datasets[0]).toMatchObject({ id: dataset.id, sessionId: session.id, name: dataset.name, rowCount: rows.length, columns: ['index', 'amount', 'note'], source });
      expect(detail.datasets[0]).not.toHaveProperty('rows');
      expect(response.text.includes('synthetic-private-row-')).toBe(false);
      expect(response.text.length).toBeLessThan(10_000);
      const explicit = await browser.request<DatasetRecord>('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`);
      expect(success(explicit)).toEqual(dataset);
      expect(explicit.headers.get('cache-control')).toMatch(/no-store/);
      denied(await browser.request('GET', `/api/sessions/${session.id}/datasets/${foreign.id}`));
    }
    denied(await outsider.request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    denied(await viewer.request('GET', `/api/sessions/${other.id}/datasets/${foreign.id}`));
    denied(await h.browser().request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`), [401]);
    denied(await viewer.request('DELETE', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    success(await owner.request('DELETE', `/api/sessions/${session.id}/members/${viewer.user!.id}`));
    denied(await viewer.request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    success(await owner.request('DELETE', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    expect((await owner.detail(session.id)).datasets).toEqual([]);
    denied(await owner.request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`), [404]);
  });

  it('scopes viewer refreshes to the requested display and excludes source libraries, membership, update history and other-screen actions', async () => {
    const owner = await h.account(), viewer = await h.account(), session = await owner.session();
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: viewer.user!.username, role: 'viewer' }));
    const displays = [await owner.display(session.id, 'Shared screen'), await owner.display(session.id, 'Private screen')];
    const question: ViewSpec = { ...fact('Choose context'), actions: [{ id: 'context', kind: 'input', label: 'Context' }] };
    const prepared = await owner.submit(session.id, displays.map(display => display.id), question);
    const interactionIds: string[] = [];
    for (const display of displays) {
      const interaction = success(await owner.request<InteractionRecord>('POST', `/api/sessions/${session.id}/interactions`, { displayId: display.id, revision: prepared.update.revisions[display.id], actionId: 'context', value: `input-for-${display.id}`, requestId: `interaction-${display.id}` }));
      interactionIds.push(interaction.id);
    }
    const dataset = success(await owner.request<DatasetRecord>('POST', `/api/sessions/${session.id}/datasets`, { name: 'Not for heartbeat transfer', rows: exactRows }));
    success(await owner.request('POST', `/api/sessions/${session.id}/assets`, { name: 'library-only.png', mimeType: 'image/png', base64: PNG }));
    for (const browser of [owner, viewer]) for (const [index, display] of displays.entries()) {
      const scoped = success(await browser.request<Detail>('GET', `/api/sessions/${session.id}?displayId=${display.id}`));
      expect(scoped.displays.map(item => item.id)).toEqual([display.id]);
      expect(scoped.displays[0].view).toEqual(displayView(prepared.detail, display.id));
      for (const collection of ['datasets', 'assets', 'members', 'updates'] as const) expect(scoped[collection]).toEqual([]);
      // Viewer members see their own responses, while owners can review the inbox.
      expect(scoped.interactions.map(interaction => interaction.id)).toEqual(browser === owner ? [interactionIds[index]] : []);
      expect(scoped.interactions.every(interaction => interaction.displayId === display.id)).toBe(true);
    }
    const management = await owner.detail(session.id);
    expect(management.displays).toHaveLength(2);
    expect(management.members).toHaveLength(2);
    expect(management.updates).toHaveLength(1);
    expect(management.interactions).toHaveLength(2);
    expect(management.datasets).toHaveLength(1);
    expect(management.assets).toHaveLength(1);

    const paired = h.browser();
    const pairing = success(await paired.request<{ id: string }>('POST', '/api/pairings', { sessionId: session.id, displayId: displays[0].id, deviceName: 'Scoped regression screen' }));
    success(await owner.request('POST', `/api/pairings/${pairing.id}/decision`, { approve: true }));
    success(await paired.request('GET', `/api/pairings/${pairing.id}/status`));
    const pairedDetail = success(await paired.request<Detail>('GET', `/api/sessions/${session.id}?displayId=${displays[0].id}`));
    expect(pairedDetail.displays.map(display => display.id)).toEqual([displays[0].id]);
    for (const collection of ['datasets', 'assets', 'members', 'updates', 'interactions'] as const) expect(pairedDetail[collection]).toEqual([]);
    denied(await paired.request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}`));
    denied(await paired.request('GET', `/api/sessions/${session.id}/datasets/${dataset.id}?displayId=${displays[0].id}`));
    denied(await paired.request('GET', `/api/sessions/${session.id}?displayId=${displays[1].id}`));
    denied(await owner.request('GET', `/api/sessions/${session.id}?displayId=unknown-display`), [404]);
    denied(await owner.request('GET', `/api/sessions/${session.id}?displayId=${displays[0].id}&displayId=${displays[1].id}`), [400]);
    const other = await owner.session('Other display session'), foreignDisplay = await owner.display(other.id);
    denied(await owner.request('GET', `/api/sessions/${session.id}?displayId=${foreignDisplay.id}`), [404]);
  });
});
