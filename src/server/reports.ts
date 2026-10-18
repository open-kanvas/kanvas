import {assertExpectedRevision} from './revisions.js';
import type { Role, SessionRecord, DisplayRecord, UpdateRecord } from '../shared/types.js';
import { TEMPLATE_IDS } from '../shared/types.js';
import type { DiagnosticRecord, FeedbackInput, ErrorReportInput, ReportRecord, ReportPage, ReportsReadInput, ReportUpdateInput, ReportPatchInput } from '../shared/reports.js';
import { REPORT_CREATE_BYTES, REPORT_RECORD_BYTES } from '../shared/reports.js';
import { InputError } from './input-errors.js';
import { type AuthPrincipal, hash } from './auth.js';
import { AppError, id, now, required, Store } from './store.js';
import { safeError } from './mcp/results.js';
import { currentToolContext } from './mcp/call-context.js';
import { canonicalForOperation } from './mcp/discovery.js';
import { operationEntry, publicReference, profileScope } from './mcp/operations.js';

interface Access {
  session(principal: AuthPrincipal, sessionId: string, role: Role, write: boolean, reviewExisting?: boolean): Promise<Awaited<SessionRecord>>;
  display(principal: AuthPrincipal, sessionId: string, displayId: string): Promise<Awaited<DisplayRecord>>;
  account(principal:AuthPrincipal,write:boolean):Promise<Awaited<void>>;
  serviceAdmin(principal:AuthPrincipal):Promise<Awaited<boolean>>;
  changed(sessionId: string): void;
}
const identity = (p: AuthPrincipal) => p.tokenId ? `token:${p.tokenId}` : `user:${p.userId}`;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, child: unknown) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);

/** Best-effort removal of common credential formats; reports are not raw logs. */
export function redactReportText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, '[redacted]')
    .replace(/((?:["']?)(?:authorization|cookie|password|client_secret|access_token|refresh_token|api[_-]?key)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s<>"']+/gi, address => {
      try { const url = new URL(address); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
      catch { return '[invalid URL omitted]'; }
    });
}

/** Session-private reports remain reviewable across restarts, never auto-executed. */
export class SessionReports {
  constructor(private readonly store: Store, private readonly access: Access) {}

  /** Bounded, content-free recovery for clients that hide isError text. This
   * does not expose report prose, request values or diagnostics to guest screens. */
  async recentDiagnostics(principal: AuthPrincipal, sessionId: string) {
    (await this.access.session(principal, sessionId, 'viewer', false));
    if (principal.scopedSessionId) return [];
    const rows = (await this.store.db.prepare("SELECT value FROM documents WHERE kind='diagnostic' AND session_id=? ORDER BY rowid DESC LIMIT 10").all(sessionId));
    return rows.map(row => {
      const record = JSON.parse(String(row.value)) as DiagnosticRecord;
      const historicalOrigin = record.publicTool && record.publicOperation ? operationEntry(record.publicTool, record.publicOperation)?.canonical : undefined;
      const currentOrigin = record.publicTool === 'kanvas_call' && record.publicOperation ? canonicalForOperation(record.publicOperation) : historicalOrigin;
      const reference = publicReference(currentOrigin ?? record.operation);
      // Recovery routes name the current interface; persisted provenance remains untouched.
      const savedOrigin = profileScope.getStore() === 'discovery' ? reference : record.publicTool ? {tool:record.publicTool,operation:record.publicOperation} : reference;
      return { diagnosticId: record.id, createdAt: record.createdAt, code: record.code, phase: record.phase,
        ...(savedOrigin ?? {}),
        ...(record.issues?.length ? { issues: record.issues } : {}) };
    });
  }

  async diagnostic(operation: string, args: Record<string, unknown>, principal: AuthPrincipal, error: unknown, phase?: DiagnosticRecord['phase'], updateId?: string): Promise<Awaited<string | undefined>> {
    return this.store.atomic(async () => {
    const sessionId = args.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length > 128) return;
    try {
      (await this.access.session(principal, sessionId, 'viewer', false));
      const failure = safeError(error);
      const context = currentToolContext();
      // The external invocation and the failing internal handler need not be
      // identical: presentation cues, camera controls and guest QR publication
      // all delegate to submit. Retain both identities without changing args,
      // request digests or the canonical diagnostic operation.
      const origin = context && (context.tool === 'kanvas_call' ? canonicalForOperation(context.operation) : operationEntry(context.tool, context.operation)?.canonical);
      const hasOrigin = context && origin === context.canonicalName;
      const record: DiagnosticRecord = {
        id: id(), sessionId, operation, code: failure.code,
        ...(hasOrigin ? { publicTool: context.tool, publicOperation: context.operation } : {}),
        phase: phase ?? (failure.code === 'INVALID_ARGUMENT' ? 'validation' : 'execution'), createdAt: now(),
        ...(failure.issues?.length ? { issues: failure.issues } : {}),
      };
      const view = args.view;
      const template = view && typeof view === 'object' && 'template' in view ? view.template : args.templateHint;
      if (TEMPLATE_IDS.includes(template as never)) record.template = String(template);
      if (updateId && (await this.store.get<UpdateRecord>('update', updateId))?.sessionId === sessionId) record.updateId = updateId;
      (await this.store.transaction(async () => {
        (await this.store.put('diagnostic', record));
        (await this.store.db.prepare("DELETE FROM documents WHERE kind='diagnostic' AND session_id=? AND id IN (SELECT id FROM documents WHERE kind='diagnostic' AND session_id=? ORDER BY rowid DESC OFFSET 500)").run(sessionId, sessionId));
      }));
      return record.id;
    } catch { return; } // Diagnostics never replace the original failure or grant access.

    });
  }

  async submit(principal: AuthPrincipal, kind: ReportRecord['kind'], input: FeedbackInput | ErrorReportInput): Promise<Awaited<ReportRecord>> {
    return this.store.atomic(async () => {
    const scope=input.scope??'session';
    const session=scope==='session'?(await this.access.session(principal,required(input.sessionId),'viewer',true)):undefined;
    if(!session)(await this.access.account(principal,true));
    const bucket=session?.id??`report-${scope}:${principal.userId}`;
    const where=session?"session_id=?":"(value::jsonb->>'scope')=? AND (value::jsonb->>'authorId')=?";
    const params=session?[session.id]:[scope,principal.userId];
    const digest = hash(canonical({ kind, input }));
    const previous = (await this.store.db.prepare('SELECT digest,result_id,kind FROM requests WHERE session_id=? AND principal=? AND request_id=?').get(bucket, identity(principal), input.requestId));
    if (previous) {
      if (previous.kind !== 'report' || previous.digest !== digest) throw new AppError('REQUEST_ID_CONFLICT', 'This request ID has already been used with different content.', 409);
      return required((await this.store.get<ReportRecord>('report', String(previous.result_id))));
    }
    const count = (await this.store.db.prepare(`SELECT count(*) AS total FROM documents WHERE kind='report' AND ${where}`).get(...params));
    if (Number(count?.total) >= 1000) throw new AppError('LIMIT_REACHED', 'This session has reached its report limit.', 429);
    const recent = (await this.store.db.prepare(`SELECT count(*) AS total FROM documents WHERE kind='report' AND ${where} AND (value::jsonb->>'authorId')=? AND (value::jsonb->>'createdAt')>?`).get(...params, principal.userId, new Date(Date.now() - 3600_000).toISOString()));
    if (Number(recent?.total) >= 20) throw new AppError('RATE_LIMIT', 'This account has reached the hourly report limit for this session.', 429);
    const context: ReportRecord['context'] = session?{ configRevision: session.configRevision }:{};
    if (input.displayId) {
      const display = (await this.access.display(principal, required(input.sessionId), input.displayId));
      context.displayRevision = display.revision; if (display.view) context.template = display.view.template;
    }
    if (input.updateId) {
      const update = required((await this.store.get<UpdateRecord>('update', input.updateId)));
      if (update.sessionId !== input.sessionId) throw new AppError('NOT_FOUND', 'This update is unavailable.', 404);
      if (input.displayId && !update.displayIds.includes(input.displayId)) throw new AppError('INVALID_ARGUMENT', 'The update does not target that display.');
      context.updateStatus = update.status;
    }
    const diagnosticId = 'diagnosticId' in input ? input.diagnosticId : undefined;
    let diagnostic: DiagnosticRecord | undefined;
    if (diagnosticId) {
      diagnostic = required((await this.store.get<DiagnosticRecord>('diagnostic', diagnosticId)));
      if (diagnostic.sessionId !== input.sessionId) throw new AppError('NOT_FOUND', 'This diagnostic is unavailable.', 404);
    }
    let redacted = false;
    const clean = (text: string): string => { const result = redactReportText(text); redacted ||= result !== text; return result; };
    const record: ReportRecord = {
      id: id(), ...(session?{sessionId:session.id}:{scope,...(scope==='account'?{accountId:principal.userId}:{})}), kind, status: 'open', revision: 0,
      title: clean(input.title), description: clean(input.description), authorId: principal.userId,
      ...(principal.agentId ? { agentId: principal.agentId } : {}), ...(input.client ? { client: input.client } : {}),
      ...(input.displayId ? { displayId: input.displayId } : {}), ...(input.updateId ? { updateId: input.updateId } : {}),
      ...(diagnostic ? { diagnosticId, diagnostic } : {}),
      ...('category' in input ? { category: input.category } : { severity: input.severity }),
      ...('steps' in input && input.steps ? { steps: (typeof input.steps === 'string' ? [input.steps] : input.steps).map(clean) } : {}),
      ...('expected' in input && input.expected ? { expected: clean(input.expected) } : {}),
      ...('actual' in input && input.actual ? { actual: clean(input.actual) } : {}),
      createdAt: now(), updatedAt: now(), context, history: [], redacted,
    };
    const bytes = Buffer.byteLength(JSON.stringify(record));
    if (bytes > REPORT_CREATE_BYTES) throw new InputError([{ path: 'report', problem: `Maximum ${REPORT_CREATE_BYTES} UTF-8 JSON bytes including report metadata; submitted ${bytes}. Split very large material into linked reports.`, maximum: REPORT_CREATE_BYTES, actual: bytes, unit: 'bytes' }], undefined, { schemaTool: 'kanvas_guide', topic: 'feedback' });
    (await this.store.transaction(async () => {
      (await this.store.put('report', record));
      (await this.store.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?)').run(bucket, identity(principal), input.requestId, digest, record.id, 'report'));
    }));
    if(input.sessionId)this.access.changed(input.sessionId);
    return record;

    });
  }

  async read(principal: AuthPrincipal, input: ReportsReadInput): Promise<Awaited<ReportPage>> {
    const scope=input.scope??'session';
    let where='session_id=?',params:(string|number)[]=[input.sessionId??''];
    if(scope==='session')(await this.access.session(principal,required(input.sessionId),'viewer',false,true));
    else{
      (await this.access.account(principal,false));
      if(scope==='all'){if(!(await this.access.serviceAdmin(principal)))throw new AppError('FORBIDDEN','Unified service reports require a configured service administrator.',403);where='1=1';params=[];}
      else if(scope==='account'){where="(value::jsonb->>'scope')='account' AND (value::jsonb->>'accountId')=?";params=[principal.userId];}
      else {where="(value::jsonb->>'scope')='service'";params=[];if(!(await this.access.serviceAdmin(principal))){where+=" AND (value::jsonb->>'authorId')=?";params.push(principal.userId);}}
    }
    let cursor:number|undefined;
    if(input.afterId){const row=(await this.store.db.prepare(`SELECT rowid FROM documents WHERE kind='report' AND ${where} AND id=?`).get(...params,input.afterId));if(!row)throw new AppError('INVALID_CURSOR','Read reports again without a cursor.');cursor=Number(row.rowid);}
    const rows=(await this.store.db.prepare(`SELECT value FROM documents WHERE kind='report' AND ${where} AND (?='all' OR (value::jsonb->>'kind')=?) AND (?='all' OR (value::jsonb->>'status')=?) AND (?::bigint IS NULL OR rowid<?) ORDER BY rowid DESC LIMIT ?`).all(...params,input.kind,input.kind,input.status,input.status,cursor??null,cursor??null,input.limit+1));
    const reports: ReportRecord[] = []; let bytes = 0;
    for (const row of rows) {
      const value = String(row.value), size = Buffer.byteLength(value);
      if (reports.length && (reports.length >= input.limit || bytes + size > REPORT_RECORD_BYTES)) break;
      reports.push(JSON.parse(value) as ReportRecord); bytes += size;
    }
    return { reports, serviceAdmin:(await this.access.serviceAdmin(principal)), ...(rows.length > reports.length && reports.length ? { nextCursor: reports.at(-1)!.id } : {}) };
  }

  async patch(principal: AuthPrincipal, input: ReportPatchInput): Promise<ReportRecord> {
    return this.store.atomic(async () => {
      await this.access.account(principal, true);
      const record = await this.store.get<ReportRecord>('report', input.reportId);
      if (!record || record.authorId !== principal.userId) throw new AppError('NOT_FOUND', 'This report is unavailable.', 404);
      // A selected-session grant cannot reach another session through an ID.
      if (record.sessionId) await this.access.session(principal, record.sessionId, 'viewer', true, true);
      assertExpectedRevision(input.expectedRevision,record.revision);
      const clean = (value: string) => { const result = redactReportText(value); record.redacted ||= result !== value; return result; };
      if (input.title !== undefined) record.title = clean(input.title);
      if (input.description !== undefined) record.description = clean(input.description);
      record.revision++; record.updatedAt = now();
      record.history = [...record.history, {status: record.status, note: clean(input.note), actorId: principal.userId, createdAt: record.updatedAt}].slice(-16);
      while (record.history.length > 1 && Buffer.byteLength(JSON.stringify(record)) > REPORT_RECORD_BYTES) record.history.shift();
      if (Buffer.byteLength(JSON.stringify(record)) > REPORT_RECORD_BYTES) throw new AppError('LIMIT_EXCEEDED', 'The report exceeds its UTF-8 storage budget. Shorten the update.');
      await this.store.put('report', record);
      if (record.sessionId) this.access.changed(record.sessionId);
      return record;
    });
  }

  async update(principal: AuthPrincipal, input: ReportUpdateInput): Promise<Awaited<ReportRecord>> {
    return this.store.atomic(async () => {
    const scope=input.scope??'session';
    if(scope==='session')(await this.access.session(principal,required(input.sessionId),'owner',true,true));else (await this.access.account(principal,true));
    const record = required((await this.store.get<ReportRecord>('report', input.reportId)));
    if(scope==='service'&&!(await this.access.serviceAdmin(principal)))throw new AppError('FORBIDDEN','Service report review requires a configured administrator.',403);
    if ((record.scope??'session')!==scope || scope==='account'&&record.accountId!==principal.userId || record.sessionId !== input.sessionId) throw new AppError('NOT_FOUND', 'This report is unavailable.', 404);
    assertExpectedRevision(input.expectedRevision,record.revision);
    const note = redactReportText(input.note);
    record.redacted ||= note !== input.note;
    record.status = input.status; record.revision++; record.updatedAt = now();
    record.history = [...record.history, { status: input.status, note, actorId: principal.userId, createdAt: record.updatedAt }].slice(-16);
    // Keep the full report bounded, including its review history and UTF-8 text.
    while (record.history.length > 1 && Buffer.byteLength(JSON.stringify(record)) > REPORT_RECORD_BYTES) record.history.shift();
    const bytes = Buffer.byteLength(JSON.stringify(record));
    if (bytes > REPORT_RECORD_BYTES) throw new InputError([{ path: 'note', problem: `This note makes the report ${bytes} UTF-8 JSON bytes; maximum ${REPORT_RECORD_BYTES}. Shorten the note without changing the original report.`, maximum: REPORT_RECORD_BYTES, actual: bytes, unit: 'bytes' }], undefined, { schemaTool: 'kanvas_guide', topic: 'feedback' });
    (await this.store.put('report', record)); if(input.sessionId)this.access.changed(input.sessionId); return record;

    });
  }
}
