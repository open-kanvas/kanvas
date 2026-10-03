import { asyncFilter, asyncFlatMap, asyncMap } from './async-collections.js';
import type { AuthPrincipal, Token } from './auth.js';
import { hash } from './auth.js';
import { AppError, id, now, required } from './store.js';
import type { KanvasService } from './domain.js';
import type { PublishInput } from '../shared/publish-input.js';
import type { DisplayRecord, DatasetRecord, AssetRecord, SubmissionInput, UpdateRecord } from '../shared/types.js';
import { assertJsonBudget } from '../shared/view-schemas.js';
import { preflightSourceRequirements } from './rendering/sources.js';
import { inlineDatasetForSubmission } from './rendering/interpreter.js';

const canonical = (v: unknown) => JSON.stringify(v, (_key, child: unknown) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);
interface Binding { id: string; owner: string; sessionId: string; displayIds: string[]; createdAt: string }
interface SetupRequest {
  id: string; owner: string; fingerprint: string; createdAt: string; sessionId?: string;
  resolutionRef?: string; expiresAt?: string; choiceFingerprint?: string;
  candidates?: { sessionId: string; displayIds: string[] }[];
  targetRef?: string; updateId?: string; createdSession?: boolean; createdDisplays?: string[];
}

/** Orchestration only: all content, roles, sources and delivery still go through
 * the ordinary service. Routing references never act as credentials. */
export class PublishSetup {
  constructor(private readonly service: KanvasService, readonly enabled = true) {}
  private owner(p: AuthPrincipal) { return `${p.userId}:${p.tokenId ? `grant:${p.tokenId}` : 'account'}`; }
  private async canCreate(p: AuthPrincipal) { return !p.tokenId || !(await this.service.store.get<Token>('token', p.tokenId))?.sessionIds; }
  private async binding(p: AuthPrincipal, ref: string): Promise<Awaited<Binding>> {
    const b = (await this.service.store.get<Binding>('publish-target', ref));
    if (!b || b.owner !== this.owner(p)) throw new AppError('NOT_FOUND', 'This publication target is unavailable.', 404);
    (await this.service.access(p, b.sessionId, 'editor'));
    for (const displayId of b.displayIds) (await this.service.display(p, b.sessionId, displayId, 'editor'));
    return b;
  }
  private async candidates(p: AuthPrincipal, sessionId?: string) {
    return (await asyncFlatMap((sessionId ? [(await this.service.access(p, sessionId, 'editor'))] : (await asyncFilter((await this.service.sessions(p)), async s=>!(await this.service.devices.isEntrySession(s.id))))), async session => {
      try { (await this.service.access(p, session.id, 'editor')); }
      catch { return []; }
      return [{ sessionId: session.id, name: session.name, displays: (await this.service.store.list<DisplayRecord>('display', session.id)).map(d => ({ displayId: d.id, name: d.name })) }];
    })).sort((a, b) => a.name.localeCompare(b.name) || a.sessionId.localeCompare(b.sessionId));
  }
  private async needsTarget(p: AuthPrincipal, input: PublishInput, record: SetupRequest) {
    const available = (await this.candidates(p, input.sessionId));
    const allowed = new Map((record.candidates ?? []).map(c => [c.sessionId, new Set(c.displayIds)]));
    return {
      status: 'needs_target', requestId: input.requestId, resolutionRef: record.resolutionRef, expiresAt: record.expiresAt,
      canCreateSession: (await this.canCreate(p)) && !input.sessionId,
      candidates: available.filter(c => allowed.has(c.sessionId)).slice(0, 8).map(c => ({ ...c, displays: c.displays.filter(d => allowed.get(c.sessionId)!.has(d.displayId)).slice(0, 8) })),
      moreCandidates: available.length > 8,
      nextAction: 'Choose once: retry the identical requestId and content with resolution:{ref,sessionId,displayIds}, or resolution:{ref,newSession:true} if permitted. No content has been published. Use sessions.list for other explicit targets with a new requestId.',
    };
  }
  private async result(p: AuthPrincipal, record: SetupRequest, input: PublishInput) {
    const target = (await this.binding(p, required(record.targetRef)));
    const update = required((await this.service.store.get<UpdateRecord>('update', required(record.updateId))));
    const session = (await this.service.access(p, target.sessionId, 'editor'));
    return {
      ...(await this.service.updateDelivery(update)), updateId: update.id, targetRef: target.id,
      targets: (await asyncMap(target.displayIds, async displayId => { const d = (await this.service.publicDisplay((await this.service.display(p, target.sessionId, displayId, 'editor')))); return { displayId, viewerUrl: d.viewerUrl, shortUrl: d.shortUrl }; })),
      createdSession: record.createdSession ?? false, createdDisplays: record.createdDisplays ?? [],
      ...(update.status === 'failed' ? { nextAction: 'The failed attempt and its target are retained. Inspect update.status. To try changed content use a new requestId and this targetRef; do not create another session.' } : {}),
    };
  }
  async show(p: AuthPrincipal, input: PublishInput) {
    return this.service.store.atomic(async () => {
    const s = this.service;
    // Preserve the old explicit branch, its exact idempotency namespace and result.
    const extra = input.contextId || input.targetRef || input.newSession || input.sessionName || input.resolution;
    if (input.sessionId && input.displayIds && !extra) return { ...(await s.submit(p, input as SubmissionInput)) };
    (await s.fullAccount(p, 'publish'));
    if (!this.enabled) throw new AppError('PUBLISH_SETUP_DISABLED', 'Automatic setup is disabled. Supply explicit sessionId and displayIds.');
    if (input.view === undefined && input.data === undefined && !input.context?.trim() && !input.datasetId && !input.assetIds?.length) throw new AppError('INVALID_CONTENT', 'Supply content before creating a display. Intent alone is not source content.');
    assertJsonBudget(input, 6 * 1024 * 1024, 1_500_000);
    const owner = this.owner(p), key = hash(`${owner}\0${input.requestId}`);
    const { resolution, ...original } = input;
    const fingerprint = hash(canonical(original));
    return (await s.store.transaction(async () => {
      const prior = (await s.store.get<SetupRequest>('publish-setup', key));
      if (prior && (prior.owner !== owner || prior.fingerprint !== fingerprint)) throw new AppError('REQUEST_ID_CONFLICT', 'This setup request ID already refers to different input.', 409);
      if (prior?.updateId) {
        if (resolution && prior.choiceFingerprint !== hash(canonical(resolution))) throw new AppError('REQUEST_ID_CONFLICT', 'This setup request was resolved to a different target.', 409);
        return (await this.result(p, prior, input));
      }
      if (resolution && (!prior || resolution.ref !== prior.resolutionRef || Date.parse(prior.expiresAt!) <= Date.now())) throw new AppError('TARGET_CHOICE_EXPIRED', 'Read the pending choice or start a new request; this resolution is unavailable.', 409);
      if (prior && !resolution) {
        if (Date.parse(prior.expiresAt!) <= Date.now()) throw new AppError('TARGET_CHOICE_EXPIRED', 'This target choice expired. Use a new requestId.', 409);
        return (await this.needsTarget(p, input, prior));
      }
      const pending = (await s.store.list<SetupRequest>('publish-setup')).filter(r => r.owner === owner && !r.updateId);
      for (const r of pending) if (r.id !== key && Date.parse(r.expiresAt ?? '') <= Date.now()) (await s.store.delete('publish-setup', r.id));
      if (!prior && pending.filter(r => Date.parse(r.expiresAt ?? '') > Date.now()).length >= 32) throw new AppError('LIMIT_REACHED', 'Resolve an existing publication choice before starting another.');
      const contextKey = input.contextId ? hash(`${owner}\0${input.contextId}`) : undefined;
      const context = contextKey ? (await s.store.get<{ id: string; targetRef: string }>('publish-context', contextKey)) : undefined;
      let binding = input.targetRef ? (await this.binding(p, input.targetRef)) : context && !input.newSession && !input.sessionName && !input.sessionId && !resolution ? (await this.binding(p, context.targetRef)) : undefined;
      let sessionId = binding?.sessionId ?? input.sessionId, displayIds = binding?.displayIds ?? input.displayIds;
      let create = Boolean(input.newSession || input.sessionName), createdSession = false;
      const record: SetupRequest = prior ?? { id: key, owner, fingerprint, createdAt: now() };
      if (resolution) {
        if (input.sessionId && resolution.sessionId !== input.sessionId) throw new AppError('INVALID_TARGET', 'Choose a display in the originally requested session.');
        if (resolution.newSession) create = true;
        else {
          const candidate = prior!.candidates?.find(c => c.sessionId === resolution.sessionId);
          if (!candidate || resolution.displayIds?.some(d => !candidate.displayIds.includes(d))) throw new AppError('NOT_FOUND', 'The chosen target is unavailable.', 404);
          sessionId = resolution.sessionId; displayIds = resolution.displayIds;
        }
      }
      if (!sessionId && !create) {
        const candidates = (await this.candidates(p));
        if (!candidates.length && (await this.canCreate(p))) create = true;
        else if (!candidates.length) throw new AppError('SESSION_CREATION_FORBIDDEN', 'This connection cannot create a session or publish to an available one. Select the intended session in connection settings. Workspace creation alone does not extend its grant.', 403);
        else {
          record.resolutionRef = id(); record.expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
          record.candidates = candidates.map(c => ({ sessionId: c.sessionId, displayIds: c.displays.map(d => d.displayId) }));
          (await s.store.put('publish-setup', record)); return (await this.needsTarget(p, input, record));
        }
      }
      if (create) {
        if (!(await this.canCreate(p))) throw new AppError('SESSION_CREATION_FORBIDDEN', 'This selected-session connection cannot create another session. Explicitly authorize the intended session in connection settings.', 403);
        const fields = input.view?.data ?? (input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data as Record<string, unknown> : {});
        const text = input.context ?? (typeof fields.text === 'string' ? fields.text : typeof fields.sourceText === 'string' ? fields.sourceText : undefined);
        const name = input.sessionName ?? input.view?.title?.trim() ?? input.intent?.trim() ?? text?.trim().split(/[\n.!?]/)[0] ?? `${input.templateHint ?? input.view?.template ?? 'Visual'} conversation`;
        sessionId = (await s.createSession(p, name.replace(/\s+/g, ' ').slice(0, 160) || 'Visual conversation')).id;
        createdSession = true;
      }
      const session = (await s.access(p, required(sessionId), 'editor'));
      const createdDisplays: string[] = [];
      if (!displayIds) {
        const displays = (await s.store.list<DisplayRecord>('display', session.id));
        // The first registered display is the stable primary; never broadcast
        // to additional screens or switch based on incidental viewer recency.
        if (displays.length) displayIds = [displays[0].id];
        else { const d = (await s.createDisplay(p, session.id, { name: 'Main display', width: 1280, height: 720 })); displayIds = [d.id]; createdDisplays.push(d.id); }
      }
      for (const displayId of displayIds) (await s.display(p, session.id, displayId, 'editor'));
      const { sessionName: _name, newSession: _new, targetRef: _ref, contextId: _context, resolution: _resolution, ...content } = input;
      const submission: SubmissionInput = { ...content, sessionId: session.id, displayIds };
      // Validate source requirements within the setup transaction. Any invalid
      // source, missing asset or exhausted alias rolls ALL setup back.
      if (submission.view) (await s.verifyView(p, session.id, submission.view));
      else {
        const inline = inlineDatasetForSubmission(submission, 'preflight-source');
        if (!inline) preflightSourceRequirements({ submission, config: session.config, display: (await s.display(p, session.id, displayIds[0])), datasets: (await s.store.list<DatasetRecord>('dataset', session.id)), assets: (await s.store.list<AssetRecord>('asset', session.id)) });
      }
      const update = (await s.submit(p, submission, 'submit', false, undefined, true));
      binding ??= { id: id(), owner, sessionId: session.id, displayIds, createdAt: now() };
      (await s.store.put('publish-target', binding));
      if (contextKey) (await s.store.put('publish-context', { id: contextKey, targetRef: binding.id, sessionId: session.id }));
      Object.assign(record, { sessionId: session.id, targetRef: binding.id, updateId: update.id, createdSession, createdDisplays, ...(resolution ? { choiceFingerprint: hash(canonical(resolution)) } : {}) });
      (await s.store.put('publish-setup', record));
      return (await this.result(p, record, input));
    }));

    });
  }
}
