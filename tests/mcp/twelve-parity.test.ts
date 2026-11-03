import {NOVEMBER_MAPPING} from './november-mapping.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal, Token } from '../../src/server/auth.js';
import { CANONICAL_TOOLS, parseCanonicalArguments } from '../../src/server/mcp/canonical.js';
import { resolveToolCall } from '../../src/server/mcp/catalog.js';
import { OPERATION_ENTRIES, type McpProfile } from '../../src/server/mcp/operations.js';
import { AFTERNOON_MAPPING } from './afternoon-mapping.js';
import { CURRENT_MAPPING } from './current-mapping.js';
import { ACCOUNT_MAPPING } from './account-mapping.js';
import { WORK_MAPPING, DEVICE_MAPPING } from './work-mapping.js';
import type { VideoCommandRecord } from '../../src/server/video-controls.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import type { DatasetRecord, UpdateRecord } from '../../src/shared/types.js';
import {
  APPENDED, EXACT_ROWS, EXACT_SOURCE, FIXED_TIME, LITERAL, PARITY_MAPPING, PNG,
  ParityWorld, fact, transcript, verifySuccessfulFixture, type Args, type CanonicalFixture,
} from './twelve-parity-fixtures.js';

/** Supply the same GENERATED UUIDs and alias choices to each isolated execution.
 * Hashing, authentication, PostgreSQL, domain handlers, media validation, source
 * materialization, history and request dedupe remain the real implementation.
 * This is more stringent than erasing arbitrary IDs/digests from snapshots:
 * even generated-dependent QR image bytes and SHA-256 digests compare exactly. */
const entropy = vi.hoisted(() => ({ uuid: 0, integer: 0x15_09_2026 }));
vi.mock('node:crypto', async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return {
    ...original,
    randomUUID: () => `00000000-0000-4000-8000-${(++entropy.uuid).toString(16).padStart(12, '0')}`,
    randomInt: (minimum: number, maximum?: number) => {
      const min = maximum === undefined ? 0 : minimum, max = maximum ?? minimum;
      entropy.integer = (Math.imul(entropy.integer, 1664525) + 1013904223) >>> 0;
      return min + entropy.integer % (max - min);
    },
  };
});

const worlds: ParityWorld[] = [];
beforeEach(() => {
  // Only Date/performance are controlled. Real event-loop scheduling remains
  // active, including the asynchronous prepared-view renderer and QR encoding.
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  vi.setSystemTime(FIXED_TIME);
});
afterEach(async () => {
  for (const world of worlds.splice(0).reverse()) await world.close();
  vi.useRealTimers();
});

async function world() {
  entropy.uuid = 0; entropy.integer = 0x15_09_2026; vi.setSystemTime(FIXED_TIME);
  const result = new ParityWorld(); worlds.push(result); await result.initialize(); return result;
}

async function invoke(w: ParityWorld, profile: McpProfile, canonical: CanonicalFixture, args: Args, principal: AuthPrincipal = w.principal) {
  const mapping = PARITY_MAPPING.find(entry => entry[0] === canonical)!;
  const raw = structuredClone(profile === 'twelve' ? { operation: mapping[2], ...args } : args);
  const before = structuredClone(raw);
  const resolved = resolveToolCall(profile, profile === 'twelve' ? mapping[1] : canonical, raw);
  if (resolved.error) throw resolved.error;
  expect(resolved.canonicalName).toBe(canonical);
  expect(resolved.args).toEqual(parseCanonicalArguments(canonical, args));
  expect(resolved.args).not.toHaveProperty('operation');
  const result = await w.service.execute(resolved.canonicalName, resolved.args, principal);
  expect(raw, 'Routing must not modify the caller-owned payload').toEqual(before);
  return result;
}

describe.sequential('twelve-tool semantic parity against real committed stores', () => {
  it('accounts independently for all original parity fixtures and separately exercised new real-client operations', () => {
    const fixtures = [...PARITY_MAPPING,...AFTERNOON_MAPPING,...WORK_MAPPING,...DEVICE_MAPPING,...ACCOUNT_MAPPING,...CURRENT_MAPPING,...NOVEMBER_MAPPING].map(([canonical, tool, operation]) => ({ canonical, tool, operation }));
    expect(fixtures).toHaveLength(OPERATION_ENTRIES.length);
    expect(new Set(fixtures.map(entry => entry.canonical)).size).toBe(OPERATION_ENTRIES.length);
    expect(new Set(fixtures.map(entry => entry.tool)).size).toBe(12);
    expect([...fixtures].sort((a, b) => a.canonical.localeCompare(b.canonical))).toEqual([...OPERATION_ENTRIES].sort((a, b) => a.canonical.localeCompare(b.canonical)));
    expect(fixtures.map(entry => entry.canonical).sort()).toEqual(CANONICAL_TOOLS.map(tool => tool.name).sort());
  });

  it.each(PARITY_MAPPING)('%s = %s / %s: returned semantics AND every persisted table', async (canonical) => {
    const legacy = await world(), oldArgs = await legacy.argumentsFor(canonical);
    (await legacy.rememberBefore());
    const oldBefore = (await legacy.snapshot());
    const oldResult = await invoke(legacy, 'legacy', canonical, oldArgs);
    await legacy.finishOperation(canonical);
    (await verifySuccessfulFixture(canonical, legacy, oldResult));
    const oldAfter = (await legacy.snapshot());

    const twelve = await world(), newArgs = await twelve.argumentsFor(canonical);
    (await twelve.rememberBefore());
    expect(newArgs, 'Equivalent seeded operation arguments').toEqual(oldArgs);
    expect((await twelve.snapshot()), 'Equivalent preconditions in separate PostgreSQL schemas').toEqual(oldBefore);
    expect(twelve.path).not.toBe(legacy.path);
    const newResult = await invoke(twelve, 'twelve', canonical, newArgs);
    await twelve.finishOperation(canonical);
    (await verifySuccessfulFixture(canonical, twelve, newResult));
    expect(newResult).toEqual(oldResult);
    expect((await twelve.snapshot()), 'Full committed semantic side effects; no digest/content normalization').toEqual(oldAfter);
    expect(twelve.networkCalls).toEqual(legacy.networkCalls);
    expect(twelve.generatedInputs).toEqual(legacy.generatedInputs);
    // displays.identify only flashes an overlay on connected screens: it persists nothing by design.
    if (CANONICAL_TOOLS.find(entry => entry.name === canonical)?.readOnly || canonical === 'kanvas_displays_identify') expect(oldAfter).toEqual(oldBefore);
    else expect(oldAfter, 'A mutating fixture must actually exercise its mutation').not.toEqual(oldBefore);
  });

  // All twenty lazy/failed-read paths are covered in inspect-purity.test and
  // real HTTP. Retain this distinct expired-command projection, not that matrix
  // again with another temporary database for every operation.
  it('projects an expired video command without changing its stored receipt', async () => {
    const w = await world(), args = await w.argumentsFor('kanvas_video_status');
    const command = (await w.store.get<VideoCommandRecord>('video-command', w.ids.command))!;
    (await w.store.put('video-command', { ...command, expiresAt: new Date(FIXED_TIME - 1).toISOString() }));
    const before = (await w.snapshot()), changes = (await w.changes());
    expect(await invoke(w, 'twelve', 'kanvas_video_status', args)).toMatchObject({ status: 'expired' });
    expect((await w.snapshot())).toEqual(before); expect((await w.changes())).toBe(changes);
  });
});

const RETRY_OPERATIONS: CanonicalFixture[] = [
  'kanvas_submit', 'kanvas_view_patch', 'kanvas_clear', 'kanvas_display_navigate', 'kanvas_video_control', 'kanvas_timer_control',
  'kanvas_presentation_cue', 'kanvas_procedure_control',
  'kanvas_feedback_submit', 'kanvas_error_report', 'kanvas_share_create', 'kanvas_monitoring_start', 'kanvas_monitoring_update', 'kanvas_monitoring_stop',
];
function conflict(canonical: CanonicalFixture, args: Args, w: ParityWorld): Args {
  const changed = structuredClone(args);
  switch (canonical) {
    case 'kanvas_submit': changed.view = fact('Conflicting exact content'); break;
    case 'kanvas_view_patch': changed.operations = [{ op: 'appendText', path: '/data/segments/0/text', value: ' conflict' }]; break;
    case 'kanvas_clear': changed.displayIds = [w.spareId]; break;
    case 'kanvas_display_navigate': changed.direction = 'forward'; break;
    case 'kanvas_video_control': changed.command = { action: 'seek', time: 12.5 }; break;
    case 'kanvas_timer_control': changed.action = 'resume'; break;
    case 'kanvas_presentation_cue': changed.index = 0; break;
    case 'kanvas_procedure_control': changed.action = 'next'; break;
    case 'kanvas_feedback_submit': case 'kanvas_error_report': changed.description = `${LITERAL} changed`; break;
    case 'kanvas_share_create': changed.label = 'Different invitation'; break;
    case 'kanvas_monitoring_start': case 'kanvas_monitoring_update': changed.config = { ...changed.config as Args, durationSeconds: 360 }; break;
    case 'kanvas_monitoring_stop': changed.expectedVersion = 99; break;
    default: throw new Error(`Missing conflict fixture for ${canonical}`);
  }
  return changed;
}

async function expectOnlyReceiptAudit(w: ParityWorld, before: Awaited<ReturnType<ParityWorld['snapshot']>>, canonical: CanonicalFixture, calls: number, requestId: unknown) {
  const after = (await w.snapshot());
  // Existing submit()/cue() intentionally log each received request BEFORE
  // checking its durable receipt, including identical/conflicting retries.
  // Each received attempt now also has exactly one scoped history mirror.
  // Verify those precise audit additions, never mask all lifecycle data or
  // mistake receipt logging for a second publication. All prior rows and every
  // other table (especially request digests and history) must remain exact.
  const auditCount = canonical === 'kanvas_submit' || canonical === 'kanvas_presentation_cue' ? calls : 0;
  const added = after.documents.slice(before.documents.length);
  expect(added).toHaveLength(auditCount * 2);
  for (const [index, row] of added.entries()) {
    expect(row.id).toMatch(/^00000000-0000-4000-8000-[0-9a-f]{12}$/);
    expect(row).toEqual({
      rowid: Number(before.documents.at(-1)?.rowid ?? 0) + index + 1,
      id: row.id, kind: index % 2 === 0 ? 'lifecycle' : 'audit-event', session_id: w.sessionId,
      value: index % 2 === 0
        ? { id: row.id, sessionId: w.sessionId, requestId, stage: 'submission.received', at: new Date(w.time).toISOString() }
        : { id: row.id, sessionId: w.sessionId, type: 'publication.submission.received', at: new Date(w.time).toISOString(), details: {} },
    });
  }
  expect({ ...after, documents: after.documents.slice(0, before.documents.length) }, 'No second publication, history entry, request row, report, job or asset').toEqual(before);
  return after;
}

describe.each([['legacy', 'twelve'], ['twelve', 'legacy']] as const)('cross-profile durable retries %s → %s', (firstProfile, retryProfile) => {
  // Every operation is tested in the migration direction. Rollback retains a
  // representative of each distinct receipt implementation, not a second full
  // Cartesian product of the same parser/discriminator removal.
  const rollback = new Set<CanonicalFixture>(['kanvas_submit', 'kanvas_view_patch', 'kanvas_video_control', 'kanvas_feedback_submit', 'kanvas_share_create', 'kanvas_procedure_control', 'kanvas_monitoring_start']);
  it.each(firstProfile === 'legacy' ? RETRY_OPERATIONS : RETRY_OPERATIONS.filter(name => rollback.has(name)))('%s reuses its receipt and rejects changed payload without another side effect', async canonical => {
    const w = await world(), args = await w.argumentsFor(canonical); (await w.rememberBefore());
    const first = await invoke(w, firstProfile, canonical, args) as Record<string, unknown>;
    await w.finishOperation(canonical);
    (await verifySuccessfulFixture(canonical, w, first));
    const committed = (await w.snapshot()), renderCalls = w.generatedInputs.length, fetches = w.networkCalls.length;
    const replay = await invoke(w, retryProfile, canonical, args) as Record<string, unknown>;
    await w.flush();
    // Prepared async publications may have advanced from accepted to prepared
    // since the first receipt. Both profiles must now return identical current
    // receipt semantics with the ORIGINAL update/report/job/demo identity.
    const sameProfileReplay = await invoke(w, firstProfile, canonical, args);
    expect(replay).toEqual(sameProfileReplay);
    const identityField = first.demoId !== undefined ? 'demoId' : first.id !== undefined ? 'id' : 'interaction';
    expect(replay[identityField]).toEqual(first[identityField]);
    const afterReplays = await expectOnlyReceiptAudit(w, committed, canonical, 2, args.requestId); expect(w.generatedInputs).toHaveLength(renderCalls); expect(w.networkCalls).toHaveLength(fetches);
    await expect(invoke(w, retryProfile, canonical, conflict(canonical, args, w))).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
    expect(await w.snapshot(), 'Conflicting request is fully rolled back').toEqual(afterReplays);
  });
});

describe.sequential('source fidelity, publication modes and scope-sensitive effects', () => {
  it('preserves literal source inputs, nested operation text and rendered output in both profiles', async () => {
    const runs = [];
    for (const profile of ['legacy', 'twelve'] as const) {
      const w = await world();
      const args = { sessionId: w.sessionId, displayIds: [w.displayId], requestId: 'generated-context', context: LITERAL,
        intent: 'Show the exact supplied wording', templateHint: 'fact', source: EXACT_SOURCE,
        data: { operation: 'kanvas_submit', command: { action: 'literal data' }, amount: '00123.4500', text: LITERAL } };
      const receipt = await invoke(w, profile, 'kanvas_submit', args) as UpdateRecord;
      await w.flush();
      expect(w.generatedInputs).toHaveLength(1);
      expect(w.generatedInputs[0].submission).toEqual(args);
      expect((await w.current()).view).toEqual(fact());
      expect((await w.store.get<UpdateRecord>('update', receipt.id))).toMatchObject({ status: 'prepared', metrics: { path: 'source', validationMs: 7, [`display.${w.displayId}.validationMs`]: 7 } });
      expect((await w.current()).appliedRevision).toBeUndefined();
      expect((await w.current()).delivery?.status).toBe('pending');
      runs.push({ state: (await w.snapshot()), input: w.generatedInputs, receipt });
    }
    expect(runs[1]).toEqual(runs[0]);
  });

  it.each(['legacy', 'twelve'] as const)('%s preserves exact source rows and rejects patches to bound source values atomically', async profile => {
    const w = await world();
    const importArgs = await w.argumentsFor('kanvas_dataset_import');
    const dataset = await invoke(w, profile, 'kanvas_dataset_import', importArgs) as DatasetRecord;
    expect(dataset.rows).toEqual(EXACT_ROWS);
    await invoke(w, profile, 'kanvas_submit', { sessionId: w.sessionId, displayIds: [w.displayId], requestId: 'bound-table',
      view: { version: 1, template: 'table', data: { binding: { datasetId: dataset.id } } } });
    await w.flush();
    expect((await w.current()).view?.data.rows).toEqual(EXACT_ROWS);
    expect((await w.current()).view?.source).toEqual(EXACT_SOURCE);
    const before = (await w.snapshot());
    await expect(invoke(w, profile, 'kanvas_view_patch', { ...(await w.request()), requestId: 'illegal-source-edit', operations: [{ op: 'set', path: '/data/rows/0/amount', value: '123.45' }] })).rejects.toMatchObject({ code: 'PATCH_SOURCE_CONFLICT' });
    expect((await w.snapshot())).toEqual(before);
    expect((await w.store.get<DatasetRecord>('dataset', dataset.id))?.rows).toEqual(EXACT_ROWS);
  });

  it.each(['legacy', 'twelve'] as const)('%s distinguishes complete data replacement from a narrow text patch', async profile => {
    const w = await world(); await w.publish(transcript());
    const original = (await w.current());
    await invoke(w, profile, 'kanvas_view_patch', { ...(await w.request()), requestId: 'partial', operations: [{ op: 'appendText', path: '/data/segments/0/text', value: APPENDED }] });
    expect((await w.current()).view?.data).toEqual({ ...transcript().data, segments: [{ id: 'utterance-001', text: LITERAL + APPENDED, speaker: 'Speaker 0001', timestamp: '00:01.250' }, { id: 'untouched', text: 'Untouched sibling 9007199254740993' }] });
    await invoke(w, profile, 'kanvas_display_edit', { ...(await w.revisioned()), data: { segments: [{ id: 'only-replacement', text: LITERAL }] } });
    // Complete replacement drops omitted language/sibling fields. The common
    // transcription validator supplies its documented status:'complete' default.
    expect((await w.current()).view?.data).toEqual({ segments: [{ id: 'only-replacement', text: LITERAL }], status: 'complete' });
    expect((await w.current()).view?.data).not.toHaveProperty('language');
    expect((await w.current()).view).toMatchObject({ title: original.view!.title, source: EXACT_SOURCE, actions: transcript().actions });
    expect(w.generatedInputs).toEqual([]);
  });

  it.each(['legacy', 'twelve'] as const)('%s read-only capture saves a derived image without gaining upload or publication rights', async profile => {
    const w = await world();
    const grant = (await w.store.get<Token>('token', w.principal.tokenId!))!;
    (await w.store.put('token', { ...grant, scopes: ['read'] }));
    const readOnly = { ...w.principal, scopes: ['read'] };
    const beforeDisplay = (await w.current());
    const capture = await invoke(w, profile, 'kanvas_display_snapshot', { ...w.base(), width: 640, height: 480 }, readOnly) as VisualCaptureResult;
    expect(capture).toBeInstanceOf(VisualCaptureResult); expect(capture.image).toEqual(PNG);
    expect((await w.store.get('capture-asset', String(capture.metadata.assetId)))).toMatchObject({ displayId: w.displayId });
    expect((await w.current())).toEqual(beforeDisplay);
    const saved = (await w.snapshot());
    await expect(invoke(w, profile, 'kanvas_asset_import', { sessionId: w.sessionId, name: 'Unauthorized upload', mimeType: 'image/png', base64: PNG.toString('base64') }, readOnly)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(invoke(w, profile, 'kanvas_submit', { sessionId: w.sessionId, displayIds: [w.displayId], requestId: 'unauthorized-publication', view: fact() }, readOnly)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await w.snapshot())).toEqual(saved);
  });

  it.each(['legacy', 'twelve'] as const)('%s keeps viewer acknowledgement isolated from product reports and target-agent identity', async profile => {
    const w = await world(); await w.interaction(); await w.report();
    const grant = (await w.store.get<Token>('token', w.principal.tokenId!))!;
    (await w.store.put('token', { ...grant, id: 'other-agent-grant', agentId: 'other-agent' }));
    const otherAgent = { ...w.principal, tokenId: 'other-agent-grant', agentId: 'other-agent' };
    const before = (await w.snapshot());
    await expect(invoke(w, profile, 'kanvas_interaction_ack', { sessionId: w.sessionId, interactionId: w.ids.interaction }, otherAgent)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(invoke(w, profile, 'kanvas_interaction_ack', { sessionId: w.sessionId, interactionId: w.ids.report })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(invoke(w, profile, 'kanvas_report_update', { sessionId: w.sessionId, reportId: w.ids.interaction, expectedRevision: 0, status: 'resolved', note: 'Not a report' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await w.snapshot())).toEqual(before);
  });
});
