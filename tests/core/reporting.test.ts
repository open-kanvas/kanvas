import { operationRequest } from '../mcp/requests.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { Client as LegacyClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport as LegacyTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { RenderingError } from '../../src/server/rendering/errors.js';
import { TEMPLATE_IDS, type DisplayRecord, type UpdateRecord } from '../../src/shared/types.js';
import type { DiagnosticRecord, ReportPage, ReportRecord } from '../../src/shared/reports.js';
import { validateView } from '../../src/shared/view-schemas.js';
import { fact, ORIGIN, startHarness, success, type Browser, type Harness } from './harness.js';

interface ToolResult { isError?: boolean; structuredContent?: { data?: unknown; error?: { code: string; diagnosticId?: string; issues?: { path: string; problem: string }[] }; truncated?: boolean } }
function value<T>(result: ToolResult): T { expect(result.isError).not.toBe(true); expect(result.structuredContent?.truncated).not.toBe(true); return result.structuredContent?.data as T; }
function failure(result: ToolResult, code: string) { expect(result.isError).toBe(true); expect(result.structuredContent?.error?.code).toBe(code); return result.structuredContent!.error!; }

describe.each(['modern', 'legacy'] as const)('%s MCP publication contracts and private reports', protocol => {
  let h: Harness;
  const clients: (Client | LegacyClient)[] = [];
  beforeEach(async () => { h = await startHarness(); });
  afterEach(async () => { await Promise.all(clients.splice(0).map(client => client.close().catch(() => {}))); await h?.close(); });
  async function publisher(owner: Browser, sessions: string[], scopes = ['read', 'publish']) {
    const issued = (await h.runtime.auth.issueToken(owner.user!.id, 'Isolated reporting acceptance', scopes, sessions));
    const requestInit = { headers: { Authorization: `Bearer ${issued.value}` } };
    const client = protocol === 'modern' ? new Client({ name: 'reporting-acceptance', version: '1' }, { versionNegotiation: { mode: 'auto' } }) : new LegacyClient({ name: 'reporting-acceptance', version: '1' });
    clients.push(client);
    if (client instanceof Client) await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', h.baseUrl), { requestInit }));
    else await client.connect(new LegacyTransport(new URL('/mcp', h.baseUrl), { requestInit }));
    return { call: async (name: string, args: Record<string, unknown>): Promise<ToolResult> => await client.callTool(operationRequest({ name, arguments: args })) as ToolResult, client, tokenId: issued.token.id };
  }

  it('explains rejected fact fields without leaking content, then publishes the discovered contract', async () => {
    const owner = await h.account(), session = await owner.session(), p = await publisher(owner, [session.id]);
    const display = value<DisplayRecord>(await p.call('kanvas_display_register', { sessionId: session.id, name: 'Discovered display', width: 1280, height: 800 }));
    expect(display.viewerUrl).toBe(`${ORIGIN}/view/${session.id}/${display.id}`);
    const marker = randomUUID();
    const requestsBefore = (await h.runtime.store.db.prepare('SELECT count(*) AS n FROM requests').get())?.n;
    const rejected = await p.call('kanvas_submit', { sessionId: session.id, displayIds: [display.id], requestId: 'invalid-fact', view: { version: 1, template: 'fact', data: { body: marker } } });
    const error = failure(rejected, 'INVALID_ARGUMENT');
    expect(error.issues?.some(issue => issue.path === 'view.data.text')).toBe(true);
    expect(typeof error.diagnosticId).toBe('string');
    const diagnostic = (await h.runtime.store.get<DiagnosticRecord>('diagnostic', error.diagnosticId!));
    expect(diagnostic).toMatchObject({ operation: 'kanvas_submit', phase: 'validation', code: 'INVALID_ARGUMENT', template: 'fact' });
    expect(JSON.stringify([rejected, diagnostic]).includes(marker)).toBe(false);
    expect((await owner.detail(session.id)).updates).toHaveLength(0);
    expect((await h.runtime.store.db.prepare('SELECT count(*) AS n FROM requests').get())?.n).toBe(requestsBefore);
    for (const template of TEMPLATE_IDS) {
      const result = await p.call('kanvas_template_get', { template });
      expect(result.isError, `${template}: ${JSON.stringify(result.structuredContent?.error)}`).not.toBe(true);
      expect(result.structuredContent?.truncated, `${template} must return its complete schema`).not.toBe(true);
      const contract = value<{ entry: {schema: unknown; example?: unknown; note?: string} }>(result).entry;
      expect(contract.schema).toHaveProperty('type', 'object');
      if(contract.example!==undefined)expect(validateView(contract.example).template).toBe(template);
      else { expect(template).toBe('presentation');expect(contract.note).toContain('Complete view schema'); }
    }
    const accepted = value<UpdateRecord>(await p.call('kanvas_submit', { sessionId: session.id, displayIds: [display.id], requestId: 'repaired-fact', view: fact('Contract recovered') }));
    expect(accepted.status).toBe('accepted');
    const prepared = await owner.settle(session.id, 'repaired-fact');
    expect(prepared.update.status).toBe('prepared');
    expect(prepared.detail.displays[0].view?.data.text).toBe('Contract recovered');
    success(await owner.request('POST', `/api/sessions/${session.id}/displays/${display.id}/applied`, { revision: prepared.detail.displays[0].revision }));
    expect(value<UpdateRecord>(await p.call('kanvas_update_status', { sessionId: session.id, updateId: accepted.id })).status).toBe('applied');
    expect((value<{ displays: DisplayRecord[] }>(await p.call('kanvas_session_state', { sessionId: session.id }))).displays[0].viewerUrl).toBe(display.viewerUrl);
  },20_000); // Exhaustively fetch every contract as the built-in catalog grows.


  it('classifies invalid inline data and advertised context limits before rendering, without changing the last view', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), p = await publisher(owner, [session.id]);
    await owner.submit(session.id, [display.id], fact('Preserve this'));
    const attempts = [
      { data: { rows: 'not an array' } },
      { context: 'x'.repeat(12001), templateHint: 'fact' },
      { view: { version: 1, template: 'fact', data: { text: 'No unsafe provenance' }, source: { url: 'javascript:alert(1)' } } },
    ];
    for (const [index, attempt] of attempts.entries()) failure(await p.call('kanvas_submit', { sessionId: session.id, displayIds: [display.id], requestId: randomUUID(), ...attempt }), index === 0 ? 'INVALID_DATASET' : 'INVALID_ARGUMENT');
    const current = await owner.detail(session.id);
    expect(current.updates).toHaveLength(1);
    expect(current.displays[0].view?.data.text).toBe('Preserve this');
  });

  it('links diagnostics and durable review history, deduplicates retries, and keeps reports separate from updates/actions', async () => {
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), p = await publisher(owner, [session.id]);
    const rejected = failure(await p.call('kanvas_submit', { sessionId: session.id, displayIds: [display.id], requestId: 'rejected', view: { version: 1, template: 'fact', data: {} } }), 'INVALID_ARGUMENT');
    const input = { sessionId: session.id, requestId: 'report-bug', title: 'Fact publication failed', description: 'A fact-card field was not discoverable.', displayId: display.id, client: 'claude', diagnosticId: rejected.diagnosticId, steps: ['Register a display', 'Submit a fact'], expected: 'A clear input error', actual: 'The earlier client saw a generic error' };
    const report = value<ReportRecord>(await p.call('kanvas_error_report', input));
    expect(report).toMatchObject({ kind: 'error', status: 'open', revision: 0, authorId: owner.user!.id, diagnosticId: rejected.diagnosticId });
    expect(report.diagnostic?.phase).toBe('validation');
    expect(report.context.displayRevision).toBe(0);
    expect(value<ReportRecord>(await p.call('kanvas_error_report', input)).id).toBe(report.id);
    failure(await p.call('kanvas_error_report', { ...input, description: 'Different retry content' }), 'REQUEST_ID_CONFLICT');
    const feedback = value<ReportRecord>(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'suggestion', title: 'Make sharing clear', description: 'Return the viewer URL from display registration.', category: 'usability' }));
    expect(feedback.kind).toBe('feedback');
    failure(await p.call('kanvas_update_status', { sessionId: session.id, requestId: 'report-bug' }), 'NOT_FOUND');
    expect((await owner.detail(session.id)).interactions).toHaveLength(0);
    expect((await owner.detail(session.id)).updates).toHaveLength(0);
    const reviewed = value<ReportRecord>(await p.call('kanvas_report_update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'resolved', note: 'Verified a valid fact was applied and invalid fields return precise errors.' }));
    expect(reviewed.revision).toBe(1); expect(reviewed.history).toHaveLength(1);
    expect(reviewed.history[0].actorId).toBe(owner.user!.id);
    failure(await p.call('kanvas_report_update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'dismissed', note: 'Stale review' }), 'REVISION_CONFLICT');
    const closed = value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id, status: 'resolved' }));
    expect(closed.reports.map(item => item.id)).toEqual([report.id]);
    const first = value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id, limit: 1 }));
    const second = value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id, limit: 1, afterId: first.nextCursor }));
    expect([first.reports[0].id, second.reports[0].id]).toEqual([feedback.id, report.id]);
    expect(second.nextCursor).toBeUndefined();
    const resource = await p.client.readResource({ uri: `kanvas://sessions/${session.id}/reports` });
    expect(JSON.parse((resource.contents[0] as { text: string }).text).reports).toHaveLength(2);
  });

  it('enforces session/token/role isolation, rejects spoofed authors, and protects report HTTP writes with CSRF', async () => {
    const owner = await h.account(), other = await h.account(), session = await owner.session(), foreign = await other.session();
    const p = await publisher(owner, [session.id]), outsider = await publisher(other, [foreign.id]), reader = await publisher(owner, [session.id], ['read']);
    const input = { sessionId: session.id, requestId: 'private', title: 'Private report', description: 'Visible only to this session.' };
    const report = value<ReportRecord>(await p.call('kanvas_feedback_submit', input));
    failure(await outsider.call('kanvas_reports_read', { sessionId: session.id }), 'FORBIDDEN');
    await expect(outsider.client.readResource({ uri: `kanvas://sessions/${session.id}/reports` })).rejects.toThrow();
    failure(await reader.call('kanvas_feedback_submit', { ...input, requestId: 'read-only' }), 'FORBIDDEN');
    failure(await p.call('kanvas_feedback_submit', { ...input, requestId: 'spoof', authorId: other.user!.id }), 'INVALID_ARGUMENT');
    const foreignDisplay = await other.display(foreign.id);
    failure(await p.call('kanvas_error_report', { ...input, requestId: 'foreign-link', displayId: foreignDisplay.id }), 'NOT_FOUND');
    const rejected = failure(await outsider.call('kanvas_submit', { sessionId: foreign.id, displayIds: [foreignDisplay.id], requestId: 'invalid', view: { version: 1, template: 'fact', data: {} } }), 'INVALID_ARGUMENT');
    failure(await p.call('kanvas_error_report', { ...input, requestId: 'foreign-diagnostic', diagnosticId: rejected.diagnosticId }), 'NOT_FOUND');
    success(await owner.request('POST', `/api/sessions/${session.id}/members`, { username: other.user!.username, role: 'editor' }));
    const editor = await publisher(other, [session.id]);
    failure(await editor.call('kanvas_report_update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'resolved', note: 'Cannot review as editor' }), 'NOT_FOUND');
    expect((await owner.request('POST', `/api/sessions/${session.id}/feedback`, { requestId: 'csrf', title: 'No CSRF', description: 'Must not save' }, { csrf: null })).status).toBe(403);
    expect((await owner.request('PATCH', `/api/sessions/${session.id}/reports/${report.id}`, { expectedRevision: 0, status: 'resolved', note: 'No CSRF' }, { csrf: null })).status).toBe(403);
    (await h.runtime.auth.revokeToken(owner.user!.id, p.tokenId));
    await expect(p.call('kanvas_reports_read', { sessionId: session.id })).rejects.toThrow();
  });

  it('keeps authorized report review available after session end without reopening content access', async () => {
    const owner = await h.account(), other = await h.account(), session = await owner.session(), foreign = await other.session();
    const display = await owner.display(session.id), p = await publisher(owner, [session.id]), reader = await publisher(owner, [session.id], ['read']);
    const outsider = await publisher(other, [foreign.id]);
    const report = value<ReportRecord>(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'before-ending', title: 'Retained report', description: 'Review survives the display session.' }));
    value(await p.call('kanvas_session_end', { sessionId: session.id }));
    const ended = (await h.runtime.store.get('session', session.id)), retainedDisplay = (await h.runtime.store.get('display', display.id));
    expect(ended).toHaveProperty('endedAt');
    expect(value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id })).reports.map(r => r.id)).toContain(report.id);
    expect(value<ReportPage>(await reader.call('kanvas_reports_read', { sessionId: session.id })).reports.map(r => r.id)).toContain(report.id);
    const review = { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'resolved', note: 'Verified after the session ended.' };
    failure(await outsider.call('kanvas_reports_read', { sessionId: session.id }), 'FORBIDDEN');
    failure(await reader.call('kanvas_report_update', review), 'FORBIDDEN');
    failure(await p.call('kanvas_session_state', { sessionId: session.id }), 'SESSION_ENDED');
    failure(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'after-ending', title: 'New report', description: 'Must not create new session activity.' }), 'SESSION_ENDED');
    expect(value<ReportRecord>(await p.call('kanvas_report_update', review))).toMatchObject({ status: 'resolved', revision: 1 });
    expect((await h.runtime.store.get('session', session.id))).toEqual(ended);
    expect((await h.runtime.store.get('display', display.id))).toEqual(retainedDisplay);
    (await h.runtime.auth.revokeToken(owner.user!.id, p.tokenId));
    await expect(p.call('kanvas_reports_read', { sessionId: session.id })).rejects.toThrow();
  });

  it('redacts common credentials and URL secrets before saving or returning reports', async () => {
    const owner = await h.account(), session = await owner.session(), p = await publisher(owner, [session.id]);
    const marker = randomBytes(24).toString('hex');
    const input = { sessionId: session.id, requestId: 'redact', title: 'Redaction probe', description: `Authorization: Bearer ${marker}\npassword="${marker}"\nhttps://example.com/callback?code=${marker}#${marker}\nsk-or-v1-${marker}` };
    const report = value<ReportRecord>(await p.call('kanvas_error_report', input));
    expect(report.redacted).toBe(true);
    expect(JSON.stringify(report).includes(marker)).toBe(false);
    expect(JSON.stringify((await h.runtime.store.get('report', report.id))).includes(marker)).toBe(false);
    expect(report.description).toContain('https://example.com/callback');
    const changed = value<ReportRecord>(await p.call('kanvas_report_update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'investigating', note: `access_token=${marker}` }));
    expect(JSON.stringify(changed).includes(marker)).toBe(false);
  });

  it('notifies a subscribed host about saved reports without consuming them or starting an agent turn', async () => {
    const owner = await h.account(), session = await owner.session(), p = await publisher(owner, [session.id]);
    const uri = `kanvas://sessions/${session.id}/reports`, notices: string[] = [];
    let close: () => Promise<unknown>;
    if (p.client instanceof Client) {
      p.client.setNotificationHandler('notifications/resources/updated', event => { notices.push(event.params.uri); });
      const stream = await p.client.listen({ resourceSubscriptions: [uri] });
      close = () => stream.close();
    } else {
      const client = p.client;
      client.setNotificationHandler(ResourceUpdatedNotificationSchema, event => { notices.push(event.params.uri); });
      await client.subscribeResource({ uri });
      close = () => client.unsubscribeResource({ uri });
    }
    try {
      value(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'notify', title: 'A new report', description: 'Read after the notification.' }));
      await vi.waitFor(() => expect(notices).toContain(uri));
      const first = value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id }));
      const second = value<ReportPage>(await p.call('kanvas_reports_read', { sessionId: session.id }));
      expect(second.reports).toEqual(first.reports);
      expect(second.reports[0].status).toBe('open');
    } finally { await close(); }
  });

  it('keeps report pages within the MCP result budget and enforces a per-account hourly cap', async () => {
    const owner = await h.account(), session = await owner.session(), p = await publisher(owner, [session.id]);
    for (let index = 0; index < 20; index++) value(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: `report-${index}`, title: `Report ${index}`, description: '漢'.repeat(4000) }));
    failure(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'over-cap', title: 'Over cap', description: 'Bounded' }), 'LIMIT_EXCEEDED');
    const ids: string[] = []; let afterId: string | undefined;
    do {
      const result = await p.call('kanvas_reports_read', { sessionId: session.id, limit: 20, ...(afterId ? { afterId } : {}) });
      const page = value<ReportPage>(result);
      expect(Buffer.byteLength(JSON.stringify(result.structuredContent))).toBeLessThan(64 * 1024);
      ids.push(...page.reports.map(item => item.id)); afterId = page.nextCursor;
    } while (afterId);
    expect(ids).toHaveLength(20); expect(new Set(ids).size).toBe(20);
  });

  it('persists report history across an actual service restart', async () => {
    const owner = await h.account(), session = await owner.session(), p = await publisher(owner, [session.id]);
    const report = value<ReportRecord>(await p.call('kanvas_feedback_submit', { sessionId: session.id, requestId: 'durable', title: 'Keep this report', description: 'Survives a restart.' }));
    value(await p.call('kanvas_report_update', { sessionId: session.id, reportId: report.id, expectedRevision: 0, status: 'investigating', note: 'Review has begun.' }));
    await p.client.close(); await h.shutdown();
    const restarted = await createApp({ database: h.database });
    try {
      const stored = (await restarted.store.get<ReportRecord>('report', report.id));
      expect(stored).toMatchObject({ revision: 1, status: 'investigating' });
      expect(stored?.history[0].note).toBe('Review has begun.');
    } finally { await restarted.close(); }
  });

  it('attaches a content-free diagnostic to asynchronous rendering failures', async () => {
    await h.close();
    const marker = randomUUID();
    h = await startHarness({ interpreter: { interpret: async () => { throw new RenderingError('INVALID_SOURCE_CONTENT', marker); } } });
    const owner = await h.account(), session = await owner.session(), display = await owner.display(session.id), p = await publisher(owner, [session.id]);
    value(await p.call('kanvas_submit', { sessionId: session.id, displayIds: [display.id], requestId: 'invalid-source-diagnostic', context: 'A supplied fact', templateHint: 'fact' }));
    const { update } = await owner.settle(session.id, 'invalid-source-diagnostic');
    expect(update.status).toBe('failed'); expect(update.errorCode).toBe('INVALID_SOURCE_CONTENT');
    const diagnostic = (await h.runtime.store.get<DiagnosticRecord>('diagnostic', update.diagnosticId!));
    expect(diagnostic).toMatchObject({ phase: 'rendering', updateId: update.id });
    expect(JSON.stringify([update, diagnostic]).includes(marker)).toBe(false);
  });
});
