import { testDatabase, removeTestDatabase } from '../postgres.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseOptions } from '../../src/server/database-config.js';
import { expect, vi } from 'vitest';
import { Auth, hash, type AuthPrincipal, type Token } from '../../src/server/auth.js';
import { KanvasService } from '../../src/server/domain.js';
import { Store } from '../../src/server/store.js';
import { VisualCaptureResult } from '../../src/server/visual-capture.js';
import type { PairingRecord } from '../../src/server/access-flows.js';
import type { MonitoringJob } from '../../src/server/monitoring.js';
import type { MonitoringConfig, MonitoringSummary } from '../../src/shared/monitoring.js';
import type { ReportRecord } from '../../src/shared/reports.js';
import type { AssetRecord, DatasetRecord, DisplayRecord, InteractionRecord, InterpretationInput, Interpreter, SessionRecord, UpdateRecord, ViewSpec } from '../../src/shared/types.js';
import type { ViewerPresence } from '../../src/shared/viewer-experience.js';
import { samples } from '../../src/shared/template-examples.js';

/** Independent acceptance manifest, transcribed from the accepted 57→12 plan.
 * Do not generate it from the implementation registry: that would hide omissions. */
export const PARITY_MAPPING = [
  ['kanvas_help','kanvas_inspect','help.read'],
  ['kanvas_navigation_read','kanvas_inspect','navigation.read'],
  ['kanvas_navigation_control','kanvas_control','navigation.control'],
  ['kanvas_pin_save','kanvas_control','pin.save'],
  ['kanvas_pin_recall','kanvas_control','pin.recall'],
  ['kanvas_pin_remove','kanvas_control','pin.remove'],
  ['kanvas_pins_read','kanvas_inspect','pins.read'],
  ['kanvas_guide', 'kanvas_inspect', 'guide.get'],
  ['kanvas_template_get', 'kanvas_inspect', 'template.get'],
  ['kanvas_reports_read', 'kanvas_inspect', 'reports.read'],
  ['kanvas_sessions_list', 'kanvas_inspect', 'sessions.list'],
  ['kanvas_session_state', 'kanvas_inspect', 'session.state'],
  ['kanvas_display_history', 'kanvas_inspect', 'display.history'],
  ['kanvas_video_status', 'kanvas_inspect', 'video.status'],
  ['kanvas_update_status', 'kanvas_inspect', 'update.status'],
  ['kanvas_presentations_list', 'kanvas_inspect', 'presentations.list'],
  ['kanvas_interactions_read', 'kanvas_inspect', 'interactions.read'],
  ['kanvas_display_current', 'kanvas_inspect', 'display.current'],
  ['kanvas_view_validate', 'kanvas_inspect', 'view.validate'],
  ['kanvas_styles_list', 'kanvas_inspect', 'styles.list'],
  ['kanvas_preferences_get', 'kanvas_inspect', 'preferences.get'],
  ['kanvas_pairings_read', 'kanvas_inspect', 'pairings.read'],
  ['kanvas_viewers_read', 'kanvas_inspect', 'viewers.read'],
  ['kanvas_display_inspect', 'kanvas_inspect', 'display.observe'],
  ['kanvas_session_overview', 'kanvas_inspect', 'session.overview'],
  ['kanvas_session_log', 'kanvas_inspect', 'session.log'],
  ['kanvas_monitoring_read', 'kanvas_inspect', 'monitoring.read'],
  ['kanvas_session_create', 'kanvas_session', 'create'],
  ['kanvas_display_register', 'kanvas_session', 'display.register'],
  ['kanvas_address_get', 'kanvas_session', 'address.get'],
  ['kanvas_submit', 'kanvas_publish', 'show'],
  ['kanvas_display_edit', 'kanvas_publish', 'replace_data'],
  ['kanvas_view_patch', 'kanvas_publish', 'patch'],
  ['kanvas_toast', 'kanvas_publish', 'notify'],
  ['kanvas_displays_identify', 'kanvas_control', 'displays.identify'],
  ['kanvas_display_update', 'kanvas_control', 'display.update'],
  ['kanvas_display_navigate', 'kanvas_control', 'history.navigate'],
  ['kanvas_video_control', 'kanvas_control', 'video.control'],
  ['kanvas_timer_control', 'kanvas_control', 'timer.control'],
  ['kanvas_map_camera', 'kanvas_control', 'map.camera'],
  ['kanvas_presentation_create', 'kanvas_control', 'presentation.create'],
  ['kanvas_presentation_cue', 'kanvas_control', 'presentation.cue'],
  ['kanvas_presentation_navigate', 'kanvas_control', 'presentation.navigate'],
  ['kanvas_procedure_control', 'kanvas_control', 'procedure.control'],
  ['kanvas_config_update', 'kanvas_configure', 'session.update'],
  ['kanvas_preferences_update', 'kanvas_configure', 'preferences.update'],
  ['kanvas_dataset_import', 'kanvas_import', 'dataset.import'],
  ['kanvas_asset_import', 'kanvas_import', 'asset.import'],
  ['kanvas_interaction_ack', 'kanvas_interactions', 'acknowledge'],
  ['kanvas_feedback_submit', 'kanvas_feedback', 'submit'],
  ['kanvas_error_report', 'kanvas_feedback', 'error.report'],
  ['kanvas_report_update', 'kanvas_feedback', 'report.update'],
  ['kanvas_display_snapshot', 'kanvas_capture', 'snapshot'],
  ['kanvas_monitoring_start', 'kanvas_monitor', 'start'],
  ['kanvas_monitoring_update', 'kanvas_monitor', 'update'],
  ['kanvas_monitoring_stop', 'kanvas_monitor', 'stop'],
  ['kanvas_share_create', 'kanvas_access', 'share.create'],
  ['kanvas_pairing_decide', 'kanvas_access', 'pairing.decide'],
  ['kanvas_member_add', 'kanvas_access', 'member.add'],
  ['kanvas_member_remove', 'kanvas_access', 'member.remove'],
  ['kanvas_clear', 'kanvas_remove', 'display.clear'],
  ['kanvas_session_end', 'kanvas_remove', 'session.end'],
  ['kanvas_dataset_delete', 'kanvas_remove', 'dataset.delete'],
  ['kanvas_asset_delete', 'kanvas_remove', 'asset.delete'],
] as const;

export type CanonicalFixture = typeof PARITY_MAPPING[number][0];
export type Args = Record<string, unknown>;
export const FIXED_TIME = Date.parse('2026-09-15T12:00:00.000Z');
export const FIXED_ISO = new Date(FIXED_TIME).toISOString();
export const LITERAL = 'Literal kanvas_submit / kanvas_interactions_read / kanvas_timer_control; 00123.4500\nÅ, 中, and 😀 remain user data.';
export const APPENDED = '\nExact addition: kanvas_guide 0.000000000000000001';
export const EXACT_SOURCE = { title: 'kanvas_template_get is a source title', locator: 'Row 001, value 00123.4500', timestamp: '2024-02-03T04:05:06.789Z', url: 'https://example.com/kanvas_submit' };
export const EXACT_JSON = '[{"code":"0001","amount":123.4500,"large":9007199254740993,"tiny":1.2300e-19,"signed":-0,"missing":null,"active":false,"note":"kanvas_submit"},{"code":"0002","amount":0.123456789012345678901,"large":9007199254740995,"tiny":1e-23,"signed":0,"missing":"","active":true,"note":"kanvas_guide"}]';
export const EXACT_ROWS = [
  { code: '0001', amount: '123.4500', large: '9007199254740993', tiny: '1.2300e-19', signed: '-0', missing: null, active: false, note: 'kanvas_submit' },
  { code: '0002', amount: '0.123456789012345678901', large: '9007199254740995', tiny: '1e-23', signed: '0', missing: '', active: true, note: 'kanvas_guide' },
];
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ot8AAAAASUVORK5CYII=', 'base64');
export const MONITOR_URL = 'https://parity.example.com/public-sample';
export const MONITOR_CONFIG: MonitoringConfig = {
  mode: 'json', url: MONITOR_URL, intervalSeconds: 30, durationSeconds: 180,
  template: 'number', mapping: { value: { $path: '/price' }, label: { $path: '/label' } },
};
export const fact = (text = LITERAL): ViewSpec => ({ version: 1, template: 'fact', data: { text }, source: EXACT_SOURCE });
export const transcript = (): ViewSpec => ({
  version: 1, template: 'transcription', title: 'Exact authored title', showTitle: false,
  data: { segments: [{ id: 'utterance-001', text: LITERAL, speaker: 'Speaker 0001', timestamp: '00:01.250' }, { id: 'untouched', text: 'Untouched sibling 9007199254740993' }], status: 'live', language: 'nb' },
  source: EXACT_SOURCE, actions: [{ id: 'reply', kind: 'input', label: 'kanvas_submit is a literal label' }],
});

/** Snapshot committed state via a separate PostgreSQL pool, never a mock or
 * cached domain objects. Preserve exact text, JSON structure and asset bytes. */
export async function persistedSnapshot(options: DatabaseOptions) {
  const reader = new Store(options);
  const tables = [
    ['documents', 'rowid'], ['users', 'id'], ['members', 'session_id,user_id'],
    ['assets', 'id'], ['requests', 'session_id,principal,request_id'], ['request_metrics', 'rowid'],
  ] as const;
  try {
    return await reader.snapshot(async () => {
      const result: Record<string, Record<string, any>[]> = {};
      for (const [table, order] of tables) {
        const rows = (await reader.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows;
        result[table] = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
          // PostgreSQL clock timestamps cannot follow Vitest's JavaScript clock.
          ['created_at','joined_at','last_login_at','last_seen_at'].includes(key) && value instanceof Date ? (expect(Number.isFinite(value.getTime())).toBe(true),'DB_TIMESTAMP') :
          table === 'documents' && key === 'value' ? JSON.parse(String(value)) as unknown
            : value instanceof Uint8Array ? { bytes: Buffer.from(value).toString('hex') } : value,
        ])));
      }
      return result;
    });
  } finally { await reader.close(); }
}

type StoredDisplay = DisplayRecord & { generation: number; interactionEpoch?: string; targetAgentId?: string };
export class ParityWorld {
  readonly directory = mkdtempSync(join(tmpdir(), 'kanvas-twelve-parity-'));
  readonly path = join(this.directory, 'isolated.sqlite');
  readonly database = testDatabase(this.path);
  readonly store = new Store(this.database);
  readonly auth = new Auth(this.store, false, false);
  readonly principal: AuthPrincipal = { userId: 'parity-owner', agentId: 'parity-agent', tokenId: 'parity-grant', scopes: ['read', 'publish'] };
  readonly generatedInputs: InterpretationInput[] = [];
  readonly networkCalls: { url: string; mode: string }[] = [];
  readonly service: KanvasService;
  sessionId!: string;
  displayId!: string;
  spareId!: string;
  readonly capture;
  time = FIXED_TIME;
  sequence = 0;
  ids: Record<string, string> = {};
  before!: StoredDisplay;
  spareBefore!: StoredDisplay;

  constructor() {
    const interpreter: Interpreter = { interpret: async input => {
      this.generatedInputs.push(structuredClone(input));
      if (!input.submission.context) throw new Error('The parity source renderer requires explicit literal context.');
      return { action: 'replace', view: fact(input.submission.context), metrics: { path: 'source', validationMs: 7 } };
    } };
    this.service = new KanvasService(this.store, this.auth, interpreter, 'https://parity.kanvas.example', {
      automatic: false, now: () => this.time,
      fetcher: async (url, options) => {
        expect(url).toBe(MONITOR_URL);
        expect(options.mode).toBe('json');
        expect(options.signal.aborted).toBe(false);
        this.networkCalls.push({ url, mode: options.mode });
        return { statusCode: 200, latencyMs: 12.375, mimeType: 'application/json', finalUrl: url,
          body: Buffer.from(JSON.stringify({ price: '00123.4500', label: LITERAL })) };
      },
    });
    // Only the isolated browser boundary is stubbed. Snapshot ACL, validation,
    // media sniffing, quotas, derivative marker and actual asset BLOB are real.
    this.capture = vi.spyOn(this.service.visualCapture, 'capture').mockImplementation(async (_user, display, dimensions, recheck) => {
      expect((await recheck()).revision).toBe(display.revision);
      return new VisualCaptureResult({ sessionId: display.sessionId, displayId: display.id, revision: display.revision,
        renderedRevision: display.revision, capturedAt: FIXED_ISO, width: dimensions.width ?? 640, height: dimensions.height ?? 480,
        readiness: 'ready', source: 'isolated-server-browser', blockedExternalRequests: 0,
        observedViewer: { online: display.online, appliedRevision: display.appliedRevision } }, Buffer.from(PNG), 'image/png');
    });
  }

  async initialize() {
    for (const [id, username] of [['parity-owner', 'parity_owner'], ['parity-member', 'parity_member'], ['parity-outsider', 'parity_outsider']]) {
      // No login, password derivation, real bearer, or deployment account is used.
      await this.store.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, username, username, 'unusable-fixture-hash');
    }
    await this.store.put('token', {
      id: this.principal.tokenId!, userId: this.principal.userId, agentId: this.principal.agentId!, name: 'Isolated parity grant',
      hash: hash('not-an-issued-bearer'), scopes: ['read', 'publish'], createdAt: FIXED_ISO, expiresAt: FIXED_TIME + 86400_000,
    } satisfies Token);
    await this.service.initialize();
    this.sessionId = (await this.service.createSession(this.principal, 'Independent parity session')).id;
    this.displayId = (await this.service.createDisplay(this.principal, this.sessionId, { name: 'Target display', width: 1200, height: 800, pixelRatio: 1.25 })).id;
    this.spareId = (await this.service.createDisplay(this.principal, this.sessionId, { name: 'Do not alter', width: 800, height: 600 })).id;
    await this.publish(fact());
    await this.publish(fact('Untouched second display 00123.4500'), this.spareId);
  }
  async current(displayId = this.displayId): Promise<Awaited<StoredDisplay>> { return (await this.store.get<StoredDisplay>('display', displayId))!; }
  async session(): Promise<Awaited<SessionRecord>> { return (await this.store.get<SessionRecord>('session', this.sessionId))!; }
  base(): Args { return { sessionId: this.sessionId, displayId: this.displayId }; }
  async revisioned(): Promise<Awaited<Args>> { return { ...this.base(), expectedRevision: (await this.current()).revision }; }
  async request(): Promise<Awaited<Args>> { return { ...(await this.revisioned()), requestId: 'operation-request' }; }
  async rememberBefore() { this.before = (await this.current()); this.spareBefore = (await this.current(this.spareId)); }
  async snapshot() { return persistedSnapshot(this.database); }
  async changes(): Promise<Awaited<number>> { return this.store.mutationCount; }
  advance(milliseconds: number) { this.time += milliseconds; vi.setSystemTime(this.time); }
  async canonical<T = unknown>(name: string, args: Args): Promise<T> { return await this.service.execute(name, args, this.principal) as T; }
  async flush() {
    const deadline=process.hrtime.bigint()+5_000_000_000n;
    while(process.hrtime.bigint()<deadline) {
      const pending = (await this.store.list<UpdateRecord>('update')).filter(update => ['accepted', 'rendering'].includes(update.status));
      if (!pending.length) {
        expect((await this.store.list<UpdateRecord>('update')).filter(update => update.status === 'failed'), 'Fixture publications must succeed, not merely match failures').toEqual([]);
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Isolated fixture rendering did not settle within five seconds.');
  }
  async publish(view: ViewSpec, displayId = this.displayId) {
    const result = await this.canonical<UpdateRecord>('kanvas_submit', { sessionId: this.sessionId, displayIds: [displayId], requestId: `seed-view-${++this.sequence}`, view });
    await this.flush();
    expect((await this.store.get<UpdateRecord>('update', result.id))?.status).toBe('prepared');
    return result;
  }
  async dataset() {
    const result = await this.canonical<DatasetRecord>('kanvas_dataset_import', { sessionId: this.sessionId, name: 'Exact numeric source', json: EXACT_JSON, source: EXACT_SOURCE });
    this.ids.dataset = result.id; expect(result.rows).toEqual(EXACT_ROWS); return result;
  }
  async asset() {
    const result = await this.canonical<AssetRecord>('kanvas_asset_import', { sessionId: this.sessionId, name: 'Literal kanvas_submit.png', mimeType: 'image/png', base64: PNG.toString('base64') });
    this.ids.asset = result.id; return result;
  }
  async deck() {
    const result = await this.canonical<{ id: string }>('kanvas_presentation_create', { sessionId: this.sessionId, name: 'Retained deck', slides: [fact(), fact('Second exact slide 0002')] });
    this.ids.deck = result.id;
  }
  async report() {
    const result = await this.canonical<ReportRecord>('kanvas_feedback_submit', { ...this.base(), requestId: 'seed-report', title: 'Literal kanvas_submit report', description: LITERAL });
    this.ids.report = result.id;
  }
  async interaction() {
    await this.publish({ ...fact(), actions: [{ id: 'reply', kind: 'input', label: 'Literal action label' }] });
    const result = (await this.service.interact(this.principal, this.sessionId, { displayId: this.displayId, revision: (await this.current()).revision, actionId: 'reply', value: LITERAL, requestId: 'seed-interaction' }));
    this.ids.interaction = result.id;
  }
  async pairing() {
    this.ids.pairing = 'pending-pairing';
    (await this.store.put('pairing', { id: this.ids.pairing, sessionId: this.sessionId, displayId: this.displayId,
      ownerId: this.principal.userId, deviceName: 'Disposable parity browser', label: 'Violet Otter 23', status: 'pending',
      proofHash: hash('unclaimable-synthetic-proof'), createdAt: FIXED_ISO, expiresAt: new Date(FIXED_TIME + 60_000).toISOString(),
    } satisfies PairingRecord));
  }
  async viewer() {
    (await this.store.put('browser', { id: 'isolated-viewer-browser', userId: this.principal.userId, csrf: 'not-a-live-csrf-value', expiresAt: FIXED_TIME + 600_000 }));
    const result = (await this.service.experience.observe({ userId: this.principal.userId, browserId: 'isolated-viewer-browser' }, this.sessionId, this.displayId, {
      tabId: 'parity-tab', sequence: 1, revision: (await this.current()).revision, renderedRevision: (await this.current()).revision, status: 'ready', visible: true,
      text: LITERAL, elements: [{ role: 'button', label: 'kanvas_submit' }], width: 1200, height: 800,
      context: { consent: true, timeZone: 'Europe/Oslo', locale: 'nb-NO', language: 'nb', locationStatus: 'granted', location: { latitude: 58.4612345678, longitude: 8.7723456789, accuracy: 3.125 } },
    }));
    this.ids.viewer = result.viewerId;
  }
  async video(withCommand = false) {
    await this.publish({ version: 1, template: 'video', data: { url: 'https://example.com/exact-video.mp4', start: 1.25, end: 20.75, muted: true }, source: EXACT_SOURCE });
    if (withCommand) {
      const result = await this.canonical<{ id: string }>('kanvas_video_control', { ...(await this.request()), requestId: 'seed-command', command: { action: 'seek', time: 12.375 } });
      this.ids.command = result.id;
    }
  }
  async timer() {
    await this.publish({ version: 1, template: 'countdown', data: { endsAt: new Date(FIXED_TIME + 61_375).toISOString(), label: LITERAL, completeText: 'Exactly complete' }, source: EXACT_SOURCE });
  }
  async monitor(sample = true) {
    const result = await this.canonical<MonitoringSummary>('kanvas_monitoring_start', { ...(await this.request()), requestId: 'seed-monitor', config: MONITOR_CONFIG });
    this.ids.job = result.id;
    if (sample) await this.service.monitoring.runDue();
  }

  async argumentsFor(name: CanonicalFixture): Promise<Args> {
    switch (name) {
      case 'kanvas_guide': return { topic: 'tools' };
      case 'kanvas_template_get': return { template: 'countdown' };
      case 'kanvas_reports_read': await this.report(); return { sessionId: this.sessionId, kind: 'feedback', status: 'open', limit: 20 };
      case 'kanvas_sessions_list': return {};
      case 'kanvas_session_state': await this.dataset(); await this.asset(); return { sessionId: this.sessionId };
      case 'kanvas_display_history': await this.publish(fact('Second retained view')); return this.base();
      case 'kanvas_video_status': await this.video(true); return { ...this.base(), commandId: this.ids.command };
      case 'kanvas_update_status': return { sessionId: this.sessionId, requestId: 'seed-view-1' };
      case 'kanvas_presentations_list': await this.deck(); return { sessionId: this.sessionId };
      case 'kanvas_interactions_read': await this.interaction(); return { sessionId: this.sessionId, status: 'pending', limit: 25 };
      case 'kanvas_display_current': return this.base();
      case 'kanvas_view_validate': await this.dataset(); return { sessionId: this.sessionId, view: { version: 1, template: 'table', data: { binding: { datasetId: this.ids.dataset } } } };
      case 'kanvas_styles_list': return {};
      case 'kanvas_preferences_get':
        await this.canonical('kanvas_preferences_update', { expectedRevision: 0, config: { readingFontSize:28 } }); return {};
      case 'kanvas_pairings_read': (await this.pairing()); return { sessionId: this.sessionId };
      case 'kanvas_viewers_read': (await this.viewer()); return this.base();
      case 'kanvas_display_inspect': (await this.viewer()); return { ...this.base(), viewerId: this.ids.viewer, fresh: false };
      case 'kanvas_session_overview': await this.publish(fact('Second retained view')); return { sessionId: this.sessionId };
      case 'kanvas_session_log': return { sessionId: this.sessionId, requestId: 'seed-view-1', limit: 100 };
      case 'kanvas_monitoring_read': await this.monitor(); return { sessionId: this.sessionId, jobId: this.ids.job };
      case 'kanvas_session_create': return { name: 'New independent topic' };
      case 'kanvas_display_register': return { sessionId: this.sessionId, name: 'New display', width: 641, height: 481, pixelRatio: 1.5 };
      case 'kanvas_address_get': return { sessionId: this.sessionId };
      case 'kanvas_submit': return { sessionId: this.sessionId, displayIds: [this.displayId], requestId: 'operation-request', view: transcript() };
      case 'kanvas_display_edit':
        await this.publish(transcript()); return { ...(await this.revisioned()), data: { segments: [{ id: 'replacement', text: 'Full replacement 00123.4500' }] } };
      case 'kanvas_view_patch':
        await this.publish(transcript()); return { ...(await this.request()), operations: [{ op: 'appendText', path: '/data/segments/0/text', value: APPENDED }, { op: 'set', path: '/data/status', value: 'complete' }] };
      case 'kanvas_toast': return { sessionId: this.sessionId, displayIds: [this.displayId], text: LITERAL, severity: 'warning', durationMs: 4500, sticky: false };
      case 'kanvas_displays_identify': return { sessionId: this.sessionId, displayIds: [this.displayId], durationMs: 1500 };
      case 'kanvas_display_update': return { ...(await this.revisioned()), width: 900, height: 700, pixelRatio: 1.5, held: true };
      case 'kanvas_display_navigate':
        await this.publish(fact('Second retained view')); return { sessionId: this.sessionId, displayIds: [this.displayId], requestId: 'operation-request', direction: 'back', expectedRevisions: { [this.displayId]: (await this.current()).revision } };
      case 'kanvas_video_control': await this.video(); return { ...(await this.request()), command: { action: 'seek', time: 12.375 } };
      case 'kanvas_timer_control': await this.timer(); return { ...(await this.request()), action: 'pause' };
      case 'kanvas_map_camera': await this.publish(structuredClone(samples.map)); return { ...(await this.request()), center: { lat: 58.4612345678, lng: 8.7723456789 }, zoom: 12.375 };
      case 'kanvas_presentation_create': return { sessionId: this.sessionId, name: 'Exact retained presentation', slides: [fact(), transcript()] };
      case 'kanvas_presentation_cue': await this.deck(); return { sessionId: this.sessionId, deckId: this.ids.deck, index: 1, displayIds: [this.displayId], requestId: 'operation-request' };
      case 'kanvas_presentation_navigate': await this.publish({ version: 1, template: 'presentation', data: { index: 0, slides: [fact(), transcript()] } }); return { ...(await this.request()), action: 'next' };
      case 'kanvas_help': return {topic:'navigation'};
      case 'kanvas_navigation_read': return this.base();
      case 'kanvas_navigation_control': return {...(await this.request()),navigation:{action:'highlight',text:'Literal'}};
      case 'kanvas_pin_save': return {...this.base(),requestId:'operation-request',label:'Exact pin'};
      case 'kanvas_pin_recall':
      case 'kanvas_pin_remove':
      case 'kanvas_pins_read': {
        const pin=await this.canonical('kanvas_pin_save',{...this.base(),requestId:'seed-pin',label:'Pinned literal'}) as {id:string};
        return name==='kanvas_pins_read'?this.base():name==='kanvas_pin_remove'?{...this.base(),pinId:pin.id}:{...(await this.request()),pinId:pin.id};
      }
      case 'kanvas_procedure_control': await this.publish(structuredClone(samples.procedure)); return { ...(await this.request()), action: 'start' };
      case 'kanvas_config_update': return { sessionId: this.sessionId, expectedRevision: (await this.session()).configRevision, config: { theme: 'light', readingFontSize:28 } };
      case 'kanvas_preferences_update': return { expectedRevision: 0, config: { theme: 'light', readingFontSize:28, } };
      case 'kanvas_dataset_import': return { sessionId: this.sessionId, name: 'Exact numeric source', json: EXACT_JSON, source: EXACT_SOURCE };
      case 'kanvas_asset_import': return { sessionId: this.sessionId, name: 'Literal kanvas_submit.png', mimeType: 'image/png', base64: PNG.toString('base64') };
      case 'kanvas_interaction_ack': await this.interaction(); await this.report(); return { sessionId: this.sessionId, interactionId: this.ids.interaction };
      case 'kanvas_feedback_submit': await this.interaction(); return { ...this.base(), requestId: 'operation-request', title: 'Literal kanvas_submit report', description: LITERAL, client: 'other' };
      case 'kanvas_error_report': return { ...this.base(), requestId: 'operation-request', title: 'Literal kanvas_timer_control error', description: LITERAL, severity: 'high', steps: ['Keep 00123.4500 exactly', 'kanvas_submit is quoted content'], expected: LITERAL, actual: 'Exact failure words', client: 'other' };
      case 'kanvas_report_update': await this.report(); return { sessionId: this.sessionId, reportId: this.ids.report, expectedRevision: 0, status: 'investigating', note: LITERAL };
      case 'kanvas_display_snapshot': return { ...this.base(), width: 640, height: 480 };
      case 'kanvas_monitoring_start': return { ...(await this.request()), config: MONITOR_CONFIG };
      case 'kanvas_monitoring_update': await this.monitor(); return { sessionId: this.sessionId, jobId: this.ids.job, requestId: 'operation-request', expectedVersion: 1, config: { ...MONITOR_CONFIG, durationSeconds: 240, title: 'Updated exact source' } };
      case 'kanvas_monitoring_stop': await this.monitor(); return { sessionId: this.sessionId, jobId: this.ids.job, requestId: 'operation-request', expectedVersion: 1 };
      case 'kanvas_share_create': return { ...(await this.request()), showOnDisplay: true, label: 'Invited parity browser', allowInteraction: false, expiresInHours: 2 };
      case 'kanvas_pairing_decide': (await this.pairing()); return { sessionId: this.sessionId, pairingId: this.ids.pairing, approve: true, interactive: false, confirm: true };
      case 'kanvas_member_add': return { sessionId: this.sessionId, username: 'parity_member', role: 'editor' };
      case 'kanvas_member_remove': await this.canonical('kanvas_member_add', { sessionId: this.sessionId, username: 'parity_member', role: 'editor' }); return { sessionId: this.sessionId, userId: 'parity-member' };
      case 'kanvas_clear': return { sessionId: this.sessionId, displayIds: [this.displayId], requestId: 'operation-request' };
      case 'kanvas_session_end': return { sessionId: this.sessionId };
      case 'kanvas_dataset_delete': await this.dataset(); return { sessionId: this.sessionId, datasetId: this.ids.dataset };
      case 'kanvas_asset_delete': await this.asset(); return { sessionId: this.sessionId, assetId: this.ids.asset };
    }
  }

  async finishOperation(name: CanonicalFixture) {
    await this.flush();
    if (name === 'kanvas_monitoring_start') await this.service.monitoring.runDue();
    if (name === 'kanvas_monitoring_update') { this.advance(30_000); await this.service.monitoring.runDue(); }
  }
  async close() { await this.service.close(); this.capture.mockRestore(); (await this.store.close()); await removeTestDatabase(this.database); rmSync(this.directory, { recursive: true, force: true }); }
}

/** A successful semantic assertion for EVERY mapping, independent of dispatch
 * parity. Equal failures or two equally inert calls cannot satisfy this suite. */
export async function verifySuccessfulFixture(name: CanonicalFixture, w: ParityWorld, result: unknown) {
  const current = (await w.current());
  switch (name) {
    case 'kanvas_guide': expect(result).toMatchObject({ topic: 'tools', version: 1 }); expect(result).toHaveProperty('groups'); break;
    case 'kanvas_template_get': expect(result).toMatchObject({ template: 'countdown', schema: { type: 'object' }, example: { template: 'countdown' } }); break;
    case 'kanvas_reports_read': expect(result).toMatchObject({ reports: [{ id: w.ids.report, description: LITERAL, status: 'open' }] }); break;
    case 'kanvas_sessions_list': expect(result).toMatchObject([{ id: w.sessionId, name: 'Independent parity session', role: 'owner' }]); break;
    case 'kanvas_session_state': expect(result).toMatchObject({ session: { id: w.sessionId }, displays: [{ id: w.displayId, view: fact() }, { id: w.spareId }], datasets: [{ id: w.ids.dataset }], assets: [{ id: w.ids.asset }] }); break;
    case 'kanvas_display_history': expect(result).toMatchObject({ currentRevision: 2, canGoBack: true, canGoForward: false }); expect((result as { entries: unknown[] }).entries).toHaveLength(3); break;
    case 'kanvas_video_status': expect(result).toMatchObject({ id: w.ids.command, action: 'seek', time: 12.375, status: 'pending' }); break;
    case 'kanvas_update_status': expect(result).toMatchObject({ requestId: 'seed-view-1', status: 'prepared', revisions: { [w.displayId]: 1 } }); break;
    case 'kanvas_presentations_list': expect(result).toMatchObject([{ id: w.ids.deck, slides: [fact(), fact('Second exact slide 0002')] }]); break;
    case 'kanvas_interactions_read': expect(result).toMatchObject({ interactions: [{ id: w.ids.interaction, value: LITERAL, status: 'pending', targetAgentId: w.principal.agentId }] }); break;
    case 'kanvas_display_current': expect(result).toMatchObject({ id: w.displayId, view: fact(), latestUpdate: { status: 'prepared' } }); break;
    case 'kanvas_view_validate': expect(result).toMatchObject({ valid: true, published: false, view: { template: 'table', data: { rows: EXACT_ROWS }, source: EXACT_SOURCE } }); break;
    case 'kanvas_styles_list': expect((result as { styles: unknown[] }).styles).toHaveLength(8); break;
    case 'kanvas_preferences_get': expect(result).toMatchObject({ revision: 1, config: { readingFontSize:28 } }); break;
    case 'kanvas_pairings_read': expect(result).toMatchObject([{ id: w.ids.pairing, status: 'pending', label: 'Violet Otter 23' }]); expect((result as object[])[0]).not.toHaveProperty('proofHash'); break;
    case 'kanvas_viewers_read': expect(result).toMatchObject([{ id: w.ids.viewer, text: LITERAL, context: { location: { latitude: 58.4612345678, longitude: 8.7723456789, accuracy: 3.125 } } }]); break;
    case 'kanvas_display_inspect': expect(result).toMatchObject({ source: 'receiving-browser-dom', available: true, observations: [{ text: LITERAL, status: 'ready', fresh: true }] }); break;
    case 'kanvas_session_overview': expect((result as { cards: unknown[] }).cards).toHaveLength(3); expect((result as { cards: { preview: string }[] }).cards.map(card => card.preview)).toContain('Second retained view'); break;
    case 'kanvas_session_log': expect((result as { entries: { stage: string }[] }).entries.map(entry => entry.stage)).toEqual(expect.arrayContaining(['render.started', 'render.prepared', 'view.pushed'])); break;
    case 'kanvas_monitoring_read': expect(result).toMatchObject({ id: w.ids.job, status: 'active', health: { status: 'healthy' } }); break;
    case 'kanvas_session_create': {
      const session = result as SessionRecord; expect(session).toMatchObject({ name: 'New independent topic', ownerId: w.principal.userId, configRevision: 0, role: 'owner' });
      expect((await w.store.get('session', session.id))).toMatchObject({ name: session.name }); expect((await w.store.list('session'))).toHaveLength(2); break;
    }
    case 'kanvas_display_register': {
      const display = result as DisplayRecord; expect(display).toMatchObject({ name: 'New display', width: 641, height: 481, pixelRatio: 1.5, revision: 0, view: null });
      expect(display.viewerUrl).toBe(`https://parity.kanvas.example/view/${w.sessionId}/${display.id}`); expect((await w.store.list('display'))).toHaveLength(3); break;
    }
    case 'kanvas_address_get': expect(result).toMatchObject({ access: 'locator-only' }); expect((await w.store.list<{ displayId?: string }>('alias', w.sessionId)).some(alias => alias.displayId === undefined)).toBe(true); expect((await w.store.list('pairing'))).toEqual([]); break;
    case 'kanvas_submit': expect(current.view).toEqual(transcript()); expect(current.revision).toBe(w.before.revision + 1); expect(w.generatedInputs).toEqual([]); break;
    case 'kanvas_display_edit': expect(current.view?.data).toEqual({ segments: [{ id: 'replacement', text: 'Full replacement 00123.4500' }], status: 'complete' }); expect(current.view?.data).not.toHaveProperty('language'); expect(current.view?.source).toEqual(EXACT_SOURCE); expect(current.view?.title).toBe('Exact authored title'); expect(current.revision).toBe(w.before.revision + 1); break;
    case 'kanvas_view_patch': expect(current.view).toEqual({ ...transcript(), data: { ...transcript().data, status: 'complete', segments: [{ id: 'utterance-001', text: LITERAL + APPENDED, speaker: 'Speaker 0001', timestamp: '00:01.250' }, { id: 'untouched', text: 'Untouched sibling 9007199254740993' }] } }); expect(current.revision).toBe(w.before.revision + 1); expect(current.interactionEpoch).toBe(w.before.interactionEpoch); break;
    case 'kanvas_toast': expect(result).toMatchObject({ notifications: [{ text: LITERAL, severity: 'warning', displayId: w.displayId }] }); expect(current).toEqual(w.before); expect((await w.store.list('toast'))).toHaveLength(1); break;
    case 'kanvas_displays_identify': expect(result).toMatchObject({ identified: [{ displayId: w.displayId }], durationMs: 1500 }); expect(current).toEqual(w.before); break;
    case 'kanvas_display_update': expect(current).toMatchObject({ width: 900, height: 700, pixelRatio: 1.5, held: true, viewportRevision: w.before.viewportRevision + 1, revision: w.before.revision + 1 }); expect(current.view).toEqual(w.before.view); break;
    case 'kanvas_display_navigate': expect(current.view).toEqual(fact()); expect(current.revision).toBe(w.before.revision + 1); expect(w.generatedInputs).toEqual([]); break;
    case 'kanvas_video_control': expect(result).toMatchObject({ action: 'seek', time: 12.375, status: 'pending' }); expect((await w.store.list('video-command'))).toHaveLength(1); expect(current).toEqual(w.before); break;
    case 'kanvas_timer_control': expect(current.view?.data).toEqual({ ...w.before.view!.data, pausedRemainingSeconds: 61.375 }); break;
    case 'kanvas_map_camera': expect(current.view?.data).toEqual({ ...w.before.view!.data, center: { lat: 58.4612345678, lng: 8.7723456789 }, zoom: 12.375 }); expect(current.view?.source).toEqual(w.before.view!.source); break;
    case 'kanvas_presentation_create': expect(result).toMatchObject({ name: 'Exact retained presentation', slides: [fact(), transcript()] }); expect((await w.store.list('deck'))).toHaveLength(1); expect(current).toEqual(w.before); break;
    case 'kanvas_presentation_cue': expect(current.view).toMatchObject({ template: 'presentation', data: { index: 1, slides: [fact(), fact('Second exact slide 0002')] } }); expect(current.interactionEpoch).toBe(`deck:${w.ids.deck}`); break;
    case 'kanvas_presentation_navigate': expect(current.view).toMatchObject({ template: 'presentation', data: { index: 1, slides: [fact(), transcript()] } }); expect(current.interactionEpoch).toBe(w.before.interactionEpoch); expect(current.revision).toBe(w.before.revision + 1); break;
    case 'kanvas_help': expect(result).toMatchObject({name:'Kanvas Help',published:false,topic:'navigation'}); break;
    case 'kanvas_navigation_read': expect(result).toMatchObject({mode:'independent',capabilities:{search:true}}); break;
    case 'kanvas_navigation_control': expect(result).toMatchObject({state:{highlight:'Literal'},version:1}); break;
    case 'kanvas_pin_save': expect(result).toMatchObject({label:'Exact pin'}); expect((await w.store.list('view-pin'))).toHaveLength(1); break;
    case 'kanvas_pin_recall': expect(result).toMatchObject({status:'prepared'}); break;
    case 'kanvas_pin_remove': expect(result).toMatchObject({removed:true}); expect((await w.store.list('view-pin'))).toHaveLength(0); break;
    case 'kanvas_pins_read': expect(result).toHaveLength(1); break;
    case 'kanvas_procedure_control': expect(result).toMatchObject({ interaction: { status: 'pending', value: { action: 'start' } } }); expect(current.revision).toBe(w.before.revision + 1); expect(current.view?.template).toBe('procedure'); break;
    case 'kanvas_config_update': expect((await w.session())).toMatchObject({ configRevision: 1, config: { theme: 'light', readingFontSize:28 } }); expect(current).toEqual(w.before); break;
    case 'kanvas_preferences_update': expect(result).toMatchObject({ revision: 1, config: { theme: 'light', } }); expect((await w.store.get('preferences', w.principal.userId))).toMatchObject({ revision: 1 }); expect((await w.session()).config.theme).not.toBe('light'); break;
    case 'kanvas_dataset_import': expect(result).toMatchObject({ rows: EXACT_ROWS, source: EXACT_SOURCE }); expect((await w.store.list<DatasetRecord>('dataset'))[0].rows).toEqual(EXACT_ROWS); expect((await w.store.list('dataset-summary'))).toHaveLength(1); break;
    case 'kanvas_asset_import': {
      const asset = result as AssetRecord; expect(asset).toMatchObject({ mimeType: 'image/png', size: PNG.length, name: 'Literal kanvas_submit.png' });
      expect(Buffer.from((await w.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(asset.id))!.bytes as Uint8Array)).toEqual(PNG); break;
    }
    case 'kanvas_interaction_ack': expect(result).toMatchObject({ id: w.ids.interaction, value: LITERAL, status: 'acknowledged' }); expect((await w.store.get('interaction', w.ids.interaction))).toMatchObject({ status: 'acknowledged' }); expect((await w.store.get('report', w.ids.report))).toMatchObject({ status: 'open', revision: 0 }); break;
    case 'kanvas_feedback_submit': expect(result).toMatchObject({ kind: 'feedback', description: LITERAL, status: 'open', redacted: false }); expect((await w.store.get('interaction', w.ids.interaction))).toMatchObject({ status: 'pending' }); expect((await w.store.list('report'))).toHaveLength(1); break;
    case 'kanvas_error_report': expect(result).toMatchObject({ kind: 'error', description: LITERAL, severity: 'high', expected: LITERAL, actual: 'Exact failure words', redacted: false }); expect((await w.store.list('report'))).toHaveLength(1); break;
    case 'kanvas_report_update': expect(result).toMatchObject({ id: w.ids.report, revision: 1, status: 'investigating', history: [{ note: LITERAL, status: 'investigating' }] }); expect((await w.store.get('report', w.ids.report))).toEqual(result); break;
    case 'kanvas_display_snapshot': {
      expect(result).toBeInstanceOf(VisualCaptureResult); const capture = result as VisualCaptureResult;
      expect(capture.image).toEqual(PNG); expect(capture.metadata).toMatchObject({ source: 'isolated-server-browser', readiness: 'ready', revision: w.before.revision, reusable: true });
      expect((await w.store.get('capture-asset', String(capture.metadata.assetId)))).toMatchObject({ displayId: w.displayId, revision: w.before.revision });
      expect(Buffer.from((await w.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(String(capture.metadata.assetId)))!.bytes as Uint8Array)).toEqual(PNG); expect(current).toEqual(w.before); break;
    }
    case 'kanvas_monitoring_start': expect(result).toMatchObject({ status: 'active', version: 1, health: { status: 'starting' } }); expect(current.view?.data).toMatchObject({ value: '00123.4500', label: LITERAL }); expect(current.monitoring).toMatchObject({ status: 'healthy', latencyMs: 12.375 }); expect(w.networkCalls).toHaveLength(1); break;
    case 'kanvas_monitoring_update': expect(result).toMatchObject({ version: 2, config: { durationSeconds: 240, title: 'Updated exact source' } }); expect(current.view?.data).toMatchObject({ value: '00123.4500', label: LITERAL }); expect(w.networkCalls).toHaveLength(2); break;
    case 'kanvas_monitoring_stop': expect(result).toMatchObject({ status: 'stopped', version: 2, health: { stoppedReason: 'user' } }); expect(current.view).toEqual(w.before.view); expect((await w.store.list<MonitoringJob>('monitoring-job'))[0].status).toBe('stopped'); break;
    case 'kanvas_share_create': {
      const share = result as { id: string; qrAssetId: string; url: string }; expect(result).toMatchObject({ status: 'active', allowInteraction: false, label: 'Invited parity browser' });
      expect((await w.store.get('share', share.id))).toMatchObject({ displayId: w.displayId }); expect((await w.store.get('asset', share.qrAssetId))).toMatchObject({ mimeType: 'image/png' }); expect((await w.store.list('pairing'))).toEqual([]); expect(current.view).toMatchObject({ template: 'join' }); break;
    }
    case 'kanvas_pairing_decide': expect(result).toMatchObject({ status: 'approved', interactive: false, label: 'Violet Otter 23' }); expect((await w.store.get('pairing', w.ids.pairing))).toMatchObject({ status: 'approved', grantExpiresAt: expect.any(Number) }); expect((await w.store.list('browser'))).toEqual([]); break;
    case 'kanvas_member_add': expect(result).toMatchObject({ userId: 'parity-member', role: 'editor' }); expect((await w.store.db.prepare('SELECT role FROM members WHERE session_id=? AND user_id=?').get(w.sessionId, 'parity-member'))).toMatchObject({ role: 'editor' }); break;
    case 'kanvas_member_remove': expect(result).toEqual({ removed: true }); expect((await w.store.db.prepare('SELECT role FROM members WHERE session_id=? AND user_id=?').get(w.sessionId, 'parity-member'))).toBeUndefined(); break;
    case 'kanvas_clear': expect(result).toMatchObject({ status: 'prepared' }); expect(current.view).toBeNull(); expect(current.revision).toBe(w.before.revision + 1); expect((await w.current(w.spareId))).toEqual(w.spareBefore); expect((await w.session()).endedAt).toBeUndefined(); break;
    case 'kanvas_session_end': expect(result).toEqual({ ended: true }); expect((await w.session()).endedAt).toBe(FIXED_ISO); expect(current.view).toEqual(w.before.view); break;
    case 'kanvas_dataset_delete': expect(result).toEqual({ deleted: true }); expect((await w.store.get('dataset', w.ids.dataset))).toBeUndefined(); expect((await w.store.get('dataset-summary', w.ids.dataset))).toBeUndefined(); expect(current).toEqual(w.before); break;
    case 'kanvas_asset_delete': expect(result).toEqual({ deleted: true }); expect((await w.store.get('asset', w.ids.asset))).toBeUndefined(); expect((await w.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(w.ids.asset))).toBeUndefined(); expect(current).toEqual(w.before); break;
  }
}

export async function seedExpiredViewer(w: ParityWorld) {
  (await w.store.put('viewer', { id: 'expired-viewer', sessionId: w.sessionId, displayId: w.displayId, participantId: w.principal.userId,
    tabId: 'expired-tab', revision: (await w.current()).revision, renderedRevision: null, status: 'empty', visible: false,
    width: 1, height: 1, text: LITERAL, elements: [], context: null, observedAt: '2020-01-01T00:00:00.000Z', expiresAt: FIXED_TIME - 1,
  } satisfies ViewerPresence));
}
