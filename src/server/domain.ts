import {KANVAS_VERSION} from '../shared/version.js';
import {mapSplitViews} from '../shared/split-screen.js';
import {SessionModes} from './session-mode.js';
import {limitError} from './limit-errors.js';
import {STORED_SESSION_FACTOR} from './usage-limits.js';
import {Friction,type FrictionCall} from './friction.js';
import {Agents} from './agents.js';
import {TaskLists} from './task-lists.js';
import {MonitorStreams} from './monitor-streams.js';
import {MessageBoard} from './message-board.js';
import {Pickers} from './pickers.js';
import type {SessionMode} from '../shared/philosophy.js';
import type {ResponseContext} from './mcp/response-policy.js';
import {manageMap} from './mcp/manage-map.js';
import {attribute,eventContext} from './raw-events.js';
import {DevicePrivacy} from './device-privacy.js';
import {SuggestedGuidance} from './suggested-guidance.js';
import {resolveIntent} from './mcp/intent-resolve.js';
import {moleculeLibrary} from '../shared/molecules.js';
import {signCatalog,SIGNAGE_PROVENANCE,SIGN_DIRECTIONS} from '../shared/signage.js';
import {acceptSatisfaction,readSatisfaction} from './satisfaction.js';
import {visualHelp,showHelp} from './visual-help.js';
import {loginRead,loginDecide} from './device-login.js';
import {currentToolContext} from './mcp/call-context.js';
import {clientDetailsSchema,type ClientDetails,type AgentConnection} from '../shared/agent-context.js';
import {operationCatalog,templateCatalog} from './mcp/discovery.js';
import {recordDeliveryRequest,markDeliveryPush} from './delivery-telemetry.js';
import {screenRead,screenDecide} from './screen-enrollment.js';
import {revisionContext} from './revision-context.js';
import {assertExpectedRevision} from './revisions.js';
import {venueUpdate,venueTools} from './venue.js';
import {CustomTemplates,validateStatic} from './custom-templates.js';
import {MediaLibrary} from './media-library.js';
import {accountOverview} from './account-overview.js';
import {AgentGuidance} from './agent-guidance.js';
import {SessionPush,type PushOptions} from './push.js';
import {FrontendDiagnostics} from './frontend-diagnostics.js';
import {Flashcards} from './flashcards.js';
import {Checklists} from './checklists.js';
import {ClientCapture} from './client-capture.js';
import {Archive} from './archive.js';
import {accountUsageLimits,sessionUsageLimits} from './usage-limits.js';
import {devicesViewDataSchema} from '../shared/devices-view.js';
import {asyncEvery,asyncFlatMap,asyncMap} from './async-collections.js';
import {livePushSchema} from '../shared/monitoring.js';
import {Pointing} from './pointing.js';
import {scoreboardDataSchema} from '../shared/event-views.js';
import {Autoplay} from './autoplay.js';
import {ToolLog} from './tool-log.js';
import {setPublicAccess} from './public-sessions.js';
import {selectionInputSchema} from './mcp/work-tools.js';
import {projectSelection} from '../shared/selection.js';
import {BrowserAuth} from './browser-auth.js';
import {InviteEmail} from './invite-email.js';
import {Invitations} from './invitations.js';
import {progressAppend,chatAppend} from './task-views.js';
import {logEntries,type LogData} from '../shared/task-views.js';
import {EventEmitter} from 'node:events';
import {Experience} from './experience.js';
import {DEFAULT_CONFIG,mergeConfig,configPatchSchema} from '../shared/preferences.js';
import {STYLE_PRESETS} from '../shared/styles.js';
import {z} from 'zod';
import {compactSchemaReferences} from '../shared/json-schema.js';
import type {Request} from 'express';
import type {AssetRecord,DatasetRecord,DatasetSummary,DisplayRecord,InteractionRecord,InterpretationResult,Interpreter,Role,SessionConfig,SessionEvent,SessionRecord,SubmissionInput,UpdateRecord,ViewSpec} from '../shared/types.js';
import {validateView,assertJsonBudget,templateViewSchema,retainedProvenance} from '../shared/view-schemas.js';
import {samples,templateNames,chartVariantSamples} from '../shared/template-examples.js';
import {InputError,validationIssues} from './input-errors.js';
import {SessionReports,redactReportText} from './reports.js';
import {safeError} from './mcp/results.js';
import type {DiagnosticRecord,FeedbackInput,ErrorReportInput,ReportsReadInput,ReportUpdateInput} from '../shared/reports.js';
import {Auth,hash,type AuthPrincipal} from './auth.js';
import {AppError,id,now,required,Store} from './store.js';
import {CANONICAL_TOOLS as MCP_TOOLS,canonicalArgumentError as toolArgumentError} from './mcp/canonical.js';
import {guideFor} from './mcp/guide.js';
import {TEMPLATE_DISPLAY_GUIDANCE} from '../shared/display-guidance.js';
import {pairedDisplayAllowsAsset} from './access-flows.js';
import {DisplayHistory} from './display-history.js';
import {VideoControls} from './video-controls.js';
import {Engagement,displayedLeaf,replaceLeaf} from './engagement.js';
import {draftingSelectionFeedback} from './drafting.js';
import {participationCompatible} from './participation.js';
import {VisualCapture} from './visual-capture.js';
import type {McpService,McpResourceDescriptor} from './mcp/types.js';
import {createInterpreter,RenderingError,inlineDatasetForSubmission,materializeDatasetView,parseDataset,validateMedia,type DatasetInput,type MediaInput} from './rendering/index.js';
import {advanceProcedure,PROCEDURE_ACTIONS} from '../shared/procedure.js';
import {ViewPatches,type ViewPatchDisplay} from './view-patch.js';
import {DraftDocuments,PlannerDocuments,type DocumentKind} from './documents.js';
import {DisplaySync} from './display-sync.js';
import {AccountInventory} from './account-inventory.js';
import {plannerConflicts,plannerDataSchema,reviewPlanner} from '../shared/planner.js';
import {TimerControls} from './timer-controls.js';
import {type Monitoring,type MonitoringOptions} from './monitoring.js';
import {connectMonitoring} from './monitoring-integration.js';
import type {PresentationNavigation} from '../shared/presentation-control.js';
import {PublishSetup} from './publish-setup.js';
import type {PublishInput} from '../shared/publish-input.js';
import {MEDIA_FAILURE_CODES,MEDIA_FAILURES} from '../shared/media-failures.js';
import {helpFor} from '../shared/help.js';
import {Navigation} from './navigation.js';
import {Accounts} from './accounts.js';
import {Topology} from './topology.js';
import {EntryDevices} from './entry-devices.js';

interface StoredDisplay extends DisplayRecord { generation: number; targetAgentId?: string; interactionEpoch?: string }
interface Deck { instructions?:string;cardInstructions?:string[];mirrored?:boolean|'vertical'|'horizontal'|'both'; id: string; sessionId: string; name: string; slides: ViewSpec[]; createdAt: string }
interface Member { userId: string; username: string; displayName: string; role: Role }
interface RequestRecord { digest: string; result_id: string; kind: string }
interface Work { id: string; sessionId: string; principal: AuthPrincipal; generations: Record<string, number>; configRevision: number; deckId?: string; recoverableInput?: SubmissionInput; bypassHold?: boolean }
const roles: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };
const defaultConfig: SessionConfig = DEFAULT_CONFIG;
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const copy = <T>(value: T): T => structuredClone(value);
const datasetSummary = ({ rows: _rows, ...summary }: DatasetRecord): DatasetSummary => summary;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, child: unknown) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child);

function renderMetrics(results: InterpretationResult[], displayIds: string[], renderMs: number): NonNullable<UpdateRecord['metrics']> {
  const metrics: NonNullable<UpdateRecord['metrics']> = { renderMs, targetDisplays: displayIds.length };
  const additive = new Set(['validationMs']);
  for (const [index, result] of results.entries()) for (const [key, value] of Object.entries(result.metrics ?? {})) {
    if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) continue;
    metrics[`display.${displayIds[index]}.${key}`] = value;
    if (additive.has(key) && typeof value === 'number') metrics[key] = Number(metrics[key] ?? 0) + value;
  }
  for (const key of ['path']) {
    const values = results.map(result => result.metrics?.[key]).filter(value => value !== undefined);
    if (values.length) metrics[key] = values.every(value => value === values[0]) ? values[0] : 'mixed';
  }
  return metrics;
}

export function referencedAssets(value: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') { const match = /^\/api\/assets\/([A-Za-z0-9_-]{1,128})$/.exec(item); if (match) ids.add(match[1]); }
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value); return ids;
}

/** The same ACL, ordering and validation boundary serves HTTP and MCP. */
/** The same ACL, ordering and validation boundary serves HTTP and MCP. */
export class KanvasService implements McpService {
    readonly push: SessionPush;
    readonly diagnostics: FrontendDiagnostics;
    readonly flashcards: Flashcards;
    readonly guidance: AgentGuidance;
    readonly checklists: Checklists;
    readonly modes: SessionModes;
    readonly friction: Friction;
    readonly agents: Agents;
    readonly taskLists: TaskLists;
    readonly monitorStreams: MonitorStreams;
    readonly board: MessageBoard;
    readonly pickers: Pickers;
    readonly customTemplates = new CustomTemplates(this);
    readonly mediaLibrary = new MediaLibrary(this);
    async customTemplateCatalog(p: AuthPrincipal) { return this.customTemplates.catalog(p); }
    readonly autoplay: Autoplay;
    readonly pointing: Pointing;
    readonly toolLog: ToolLog;
    readonly accounts: Accounts;
    readonly topology: Topology;
    readonly privacy: DevicePrivacy;
    readonly devices: EntryDevices;
    readonly inventory: AccountInventory;
    readonly browserAuth: BrowserAuth;
    readonly inviteEmail: InviteEmail;
    readonly invitations: Invitations;
    readonly navigation: Navigation;
    readonly reports: SessionReports;
    readonly experience: Experience;
    readonly history: DisplayHistory;
    readonly archive: Archive;
    readonly video: VideoControls;
    readonly engagement: Engagement;
    readonly visualCapture: VisualCapture;
    readonly clientCapture: ClientCapture;
    readonly patches: ViewPatches;
    readonly timers: TimerControls;
    readonly drafts: DraftDocuments;
    readonly planners: PlannerDocuments;
    readonly displaySync: DisplaySync;
    readonly monitoring: Monitoring;
    readonly publication: PublishSetup;
    private readonly events = new EventEmitter();
    private readonly presence = new Map<string, number>();
    private readonly active = new Set<Promise<void>>();
    private readonly cancelWork = new Set<() => void>();
    private closed = false;
    constructor(readonly store: Store, readonly auth: Auth, readonly interpreter: Interpreter = createInterpreter(), readonly publicUrl = 'http://127.0.0.1:8787', monitoringOptions?: MonitoringOptions, publishSetupEnabled = true, pushOptions?: PushOptions) {
        this.push = new SessionPush(this, pushOptions);
        this.diagnostics = new FrontendDiagnostics(this);
        this.flashcards = new Flashcards(this);
        this.guidance = new AgentGuidance(this);
        this.checklists = new Checklists(this);
        this.modes = new SessionModes(this);
        this.friction = new Friction(this);
        this.friction.start();
        this.agents = new Agents(this);
        this.taskLists = new TaskLists(this);
        this.monitorStreams = new MonitorStreams(this);
        this.monitorStreams.start();
        this.board = new MessageBoard(this);
        this.pickers = new Pickers(this);
        this.pointing = new Pointing(this);
        this.toolLog = new ToolLog(this);
        this.autoplay = new Autoplay(this);
        this.accounts = new Accounts(this);
        this.topology = new Topology(this);
        this.navigation = new Navigation(this);
        this.publication = new PublishSetup(this, publishSetupEnabled);
        this.experience = new Experience(this);
        this.invitations = new Invitations(this);
        this.browserAuth = new BrowserAuth(this);
        this.inviteEmail = new InviteEmail(this);
        this.clientCapture = new ClientCapture(this);
        this.archive = new Archive(this);
        this.history = new DisplayHistory(store);
        this.video = new VideoControls(store);
        this.engagement = new Engagement(store);
        this.visualCapture = new VisualCapture(store, auth, publicUrl);
        this.devices = new EntryDevices(this);
        this.privacy = new DevicePrivacy(this);
        this.inventory = new AccountInventory(this);
        this.patches = new ViewPatches({
            transaction: async (operation) => (await store.transaction(operation)),
            display: async (principal, sessionId, displayId) => (await this.display(principal, sessionId, displayId, 'editor')),
            retry: async (principal, input) => (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'patch', input)),
            verifyView: async (principal, sessionId, view) => (await this.verifyView(principal, sessionId, view)),
            publish: async (principal, input, before, view) => (await this.publishMutation(principal, input, before, view, 'patch')),
        });
        this.timers = new TimerControls({
            transaction: async (operation) => (await store.transaction(operation)),
            display: async (principal, sessionId, displayId) => (await this.display(principal, sessionId, displayId, 'editor')),
            retry: async (principal, input) => (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'timer-control', input)),
            verifyView: async (principal, sessionId, view) => (await this.verifyView(principal, sessionId, view)),
            publish: async (principal, input, before, view) => (await this.publishMutation(principal, input, before, view, 'timer-control')),
        });
        this.drafts = new DraftDocuments({
            draftActor: async (principal, sessionId) => {
                const user = await this.auth.user(principal.userId);
                const members = await store.db.prepare('SELECT user_id FROM members WHERE session_id=?').all(sessionId);
                return { actor: { id: principal.participantId ?? principal.userId, name: (user?.displayName || 'Participant').slice(0, 160) }, multiUser: members.length > 1 };
            },
            transaction: async (operation) => (await store.transaction(operation)),
            display: async (principal, sessionId, displayId, minimum) => (await this.display(principal, sessionId, displayId, minimum)),
            retry: async (principal, sessionId, requestId, kind, payload) => (await this.retry<UpdateRecord>(principal, sessionId, requestId, kind, payload)),
            verifyView: async (principal, sessionId, view) => (await this.verifyView(principal, sessionId, view)),
            publish: async (principal, input, before, view, kind) => (await this.publishMutation(principal, input, before, view, kind)),
            frames: async (display) => (await this.history.frames(display)),
        });
        this.planners = new PlannerDocuments({
            transaction: async (operation) => (await store.transaction(operation)),
            display: async (principal, sessionId, displayId, minimum) => (await this.display(principal, sessionId, displayId, minimum)),
            retry: async (principal, sessionId, requestId, kind, payload) => (await this.retry<UpdateRecord>(principal, sessionId, requestId, kind, payload)),
            verifyView: async (principal, sessionId, view) => (await this.verifyView(principal, sessionId, view)),
            publish: async (principal, input, before, view, kind) => (await this.publishMutation(principal, input, before, view, kind)),
            frames: async (display) => (await this.history.frames(display)),
        });
        this.displaySync = new DisplaySync({
            store,
            display: async (principal, sessionId, displayId, minimum) => (await this.display(principal, sessionId, displayId, minimum)),
            access: async (principal, sessionId, minimum) => (await this.access(principal, sessionId, minimum)),
            history: this.history,
            emit: event => this.emit(event),
            closed: () => this.closed,
        });
        // Linked displays follow committed navigation on any member display.
        this.onEvent(event => {
            if (event.type === 'display' && !this.closed)
                this.displaySync.changed(event.sessionId);
        });
        this.reports = new SessionReports(store, {
            account: async (p, write) => (await this.accounts.account(p, write)),
            serviceAdmin: async (p) => (await this.accounts.isServiceAdmin(p)),
            session: async (principal, sessionId, role, write, reviewExisting = false) => {
                let session: SessionRecord;
                try {
                    session = (await this.access(principal, sessionId, role));
                }
                catch (error) {
                    // access() validates current credentials and the required session role
                    // before checking endedAt. Retained reports remain reviewable without
                    // reopening the session or allowing new content/report submissions.
                    if (!reviewExisting || !(error instanceof AppError) || error.code !== 'SESSION_ENDED')
                        throw error;
                    session = required((await this.store.get<SessionRecord>('session', sessionId)));
                }
                if (principal.scopedSessionId)
                    throw new AppError('FORBIDDEN', 'Paired screens have display-only access.', 403);
                if (write)
                    (await this.auth.assertCurrent(principal, 'publish', sessionId));
                return session;
            },
            display: async (principal, sessionId, displayId) => (await this.display(principal, sessionId, displayId)),
            changed: sessionId => this.emit({ type: 'report', sessionId }),
        });
        this.events.setMaxListeners(1024);
        this.monitoring = connectMonitoring(this, monitoringOptions);
    }
    async initialize(): Promise<void> {
        const store = this.store;
        const recovery: Work[] = [];
        // Setup reserves its complete validated input before committing. Only work
        // which never started can resume; interrupted work is not replayed.
        for (const update of (await store.list<UpdateRecord>('update')))
            if (['accepted', 'rendering'].includes(update.status)) {
                const work = (await store.get<Work>('work', update.id));
                if (update.status === 'accepted' && work?.recoverableInput) {
                    recovery.push(work);
                    continue;
                }
                (await store.put('update', { ...update, status: 'failed', error: 'Rendering was interrupted by a service restart. Submit again with a new request ID.', completedAt: now() }));
                if (work?.recoverableInput) {
                    delete work.recoverableInput;
                    (await store.put('work', work));
                }
            }
        for (const display of (await store.list<StoredDisplay>('display')))
            if (display.online)
                (await store.put('display', { ...display, online: false }));
        // Metadata is stored separately so a heartbeat never parses or retransmits the full source library.
        for (const dataset of (await store.list<DatasetRecord>('dataset')))
            if (!(await store.get('dataset-summary', dataset.id)))
                (await store.put('dataset-summary', datasetSummary(dataset)));
        this.onEvent(async (event) => {
            if (this.closed || event.data && typeof event.data === 'object' && 'monitoring' in event.data)
                return;
            if (event.type === 'ended')
                (await this.monitoring.cancelSession(event.sessionId));
            else if (['display', 'config', 'membership', 'update'].includes(event.type))
                (await this.monitoring.reconcileSession(event.sessionId));
        });
        (await this.monitoring.resume());
        this.autoplay.start();
        for (const work of recovery)
            this.schedule(work, work.recoverableInput!, work.bypassHold ?? false);
    }
    async authorize(request: Request): Promise<AuthPrincipal> { return (await this.auth.authorize(request)); }
    async recordToolCall(principal: AuthPrincipal, event: import('./mcp/types.js').ToolInvocation) {
        (await this.toolLog.capture(principal, event));
        if (!event.rawOnly && event.status === 'completed')
            await this.agents.observe(principal, event, event.canonical);
    }
    recordFriction(call: FrictionCall) { this.friction.record(call); }
    async recordFailure(operation: string, args: Record<string, unknown>, principal: AuthPrincipal, error: unknown, phase?: DiagnosticRecord['phase'], updateId?: string): Promise<Awaited<string | undefined>> {
        const definition = MCP_TOOLS.find(tool => tool.name === operation);
        if (!definition || definition.readOnly)
            return;
        try {
            if (typeof args.sessionId === 'string') {
                (await this.access(principal, args.sessionId));
                (await this.experience.log({ sessionId: args.sessionId, requestId: typeof args.requestId === 'string' ? args.requestId : undefined, updateId, stage: `${operation}.failed`, code: safeError(error).code }));
            }
        }
        catch { /* Never leak a denied session through diagnostics. */ }
        return (await this.reports.diagnostic(operation, args, principal, error, phase, updateId));
    }
    emit = (event: SessionEvent): void => { this.store.afterCommit(() => this.events.emit('change', event)); };
    /** Internal subscribers also use invalidations to terminate revoked browser streams. */
    onEvent(listener: (event: SessionEvent) => unknown): () => void {
        const receive = (event: SessionEvent) => {
            try {
                Promise.resolve(listener(event)).catch(() => { });
            }
            catch { /* Invalidations cannot roll back a committed operation. */ }
        };
        this.events.on('change', receive);
        return () => this.events.off('change', receive);
    }
    subscribe(principal: AuthPrincipal, listener: (event: SessionEvent) => void): () => void {
        return this.onEvent(async (event) => {
            if (event.type === 'identify' || event.type === 'pointing')
                return;
            try {
                (await this.access(principal, event.sessionId));
                listener({ type: event.type, sessionId: event.sessionId, displayId: event.displayId, revision: event.revision });
            }
            catch { /* An inaccessible session must not leak even a change hint. */ }
        });
    }
    access = async (principal: AuthPrincipal, sessionId: string, minimum: Role = 'viewer'): Promise<Awaited<SessionRecord>> => {
        (await this.auth.assertCurrent(principal, minimum === 'viewer' ? 'read' : 'publish', sessionId));
        const session = required((await this.store.get<SessionRecord>('session', sessionId)));
        const role = principal.scopedSessionId === sessionId ? 'viewer' : (await this.accounts.effectiveRole(principal.userId, sessionId));
        if (!role || roles[role] < roles[minimum])
            throw new AppError('NOT_FOUND', 'This session is unavailable to this account.', 404);
        if (session.endedAt)
            throw new AppError('SESSION_ENDED', 'This session has ended.', 410);
        return { ...session, config: (await this.accounts.effectiveConfig(session, principal.userId)), role };
    };
    async fullAccount(principal: AuthPrincipal, scope = 'read'): Promise<Awaited<void>> {
        (await this.auth.assertCurrent(principal, scope));
        if (principal.scopedSessionId)
            throw new AppError('FORBIDDEN', 'This screen has view-only access.', 403);
    }
    async recordAgentContext(principal: AuthPrincipal, sessionId: string, details: unknown, started = false) {
        await this.fullAccount(principal, 'read');
        await this.access(principal, sessionId);
        const ctx = currentToolContext(), selfReported = Object.fromEntries(Object.entries(clientDetailsSchema.parse(details ?? {})).map(([k, v]) => [k, redactReportText(v)])) as ClientDetails, connection = ctx?.connectionId ?? principal.agentId ?? principal.tokenId ?? 'direct';
        const key = hash(`${principal.userId}:${sessionId}:${connection}`), old = await this.store.get<AgentConnection>('agent-connection', key), inferred = { ...old?.inferred, ...ctx?.inferred };
        const supplied = { ...old?.selfReported, ...selfReported };
        const conflicts: string[] = [];
        if (supplied.agent && inferred.clientName && supplied.agent.toLowerCase() !== inferred.clientName.toLowerCase())
            conflicts.push('Self-reported agent differs from MCP client name; neither is verified.');
        const value: AgentConnection = { id: key, sessionId, userId: principal.userId, started: old?.started ?? started, joinedAt: old?.joinedAt ?? now(), updatedAt: now(), selfReported: supplied, inferred, conflicts, verified: false };
        const event = eventContext.getStore();
        if (event)
            event.client = { ...event.client, selfReported: Object.fromEntries(Object.entries(supplied).filter(([key]) => ['agent', 'model', 'harness', 'effort_or_mode', 'interaction_mode', 'device'].includes(key))), contextVerified: false };
        await this.store.put('agent-connection', value);
        // A declared preference belongs to the connection, across its sessions.
        if (selfReported.guidance)
            await this.store.put('guidance-preference', { id: hash(`${principal.userId}:${connection}`), userId: principal.userId, preference: selfReported.guidance, updatedAt: now() });
        return value;
    }
    /** Observable facts for the response policy. Never content, never inference. */
    async pointingEvents(principal: AuthPrincipal, connectionId: string, sessionId?: string) { return this.pointing.forAgent(principal, connectionId, sessionId); }
    async responseContext(principal: AuthPrincipal, args: unknown, connectionId: string, failed = false): Promise<ResponseContext> {
        const a = args && typeof args === 'object' && !Array.isArray(args) ? args as {
            sessionId?: unknown;
        } : {}, out: ResponseContext = {};
        // The installation default applies to every caller, also one whose grant is too narrow to read more.
        out.preference = process.env.KANVAS_GUIDANCE_DEFAULT === 'full' ? 'full' : 'concise';
        try {
            await this.fullAccount(principal);
        }
        catch {
            return out;
        }
        out.preference = (await this.store.get<{
            preference: 'concise' | 'full';
        }>('guidance-preference', hash(`${principal.userId}:${connectionId}`)))?.preference ?? (process.env.KANVAS_GUIDANCE_DEFAULT === 'full' ? 'full' : 'concise');
        try {
            if (!(await this.auth.displayNameSet(principal.userId)))
                out.displayNameHint = 'This account has no display name yet; set one with kanvas.profile.update {displayName} so screens show a name, not an email.';
        }
        catch { /* No account detail for a narrowed grant. */ }
        if (typeof a.sessionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(a.sessionId)) {
            try {
                await this.access(principal, a.sessionId);
                const online = (await this.experience.receiving.viewers(a.sessionId, undefined, true)).length > 0;
                out.displayConnected = online; /* A failed call records nothing. */
                out.mode = failed ? await this.modes.read(a.sessionId) : await this.modes.observeAgent(principal, a.sessionId, online);
            }
            catch { /* An unauthorized or ended session contributes nothing. */ }
        }
        out.manage = manageMap();
        if (!failed && !principal.browserId) {
            try {
                out.messageBoard = await this.board.notice(principal);
            }
            catch { /* A notice never replaces a result. */ }
        }
        return out;
    }
    /** session.state for agents: what is needed before a display decision, not the whole log. */
    async sessionState(principal: AuthPrincipal, a: {
        sessionId: string;
        includeUpdates?: 'recent' | 'all';
    }) {
        const detail = await this.detail(principal, a.sessionId) as Awaited<ReturnType<KanvasService['detail']>> & {
            updates: unknown[];
            interactions: {
                status?: string;
            }[];
        };
        const mode = await this.modes.read(a.sessionId);
        if (principal.scopedSessionId)
            return { ...detail, mode };
        const all = a.includeUpdates === 'all', pending = detail.interactions.filter(item => item.status === 'pending');
        return { ...detail,
            updates: all ? detail.updates : detail.updates.slice(-5),
            interactions: all ? detail.interactions : pending.slice(-20),
            counts: { updates: detail.updates.length, interactions: detail.interactions.length, pendingInteractions: pending.length, displays: detail.displays.length },
            ...(all ? {} : { more: 'updates holds the last 5 and interactions only pending ones. Pass includeUpdates:"all" for the complete lists, or read kanvas.session.log / kanvas.interactions.read.' }),
            mode, manage: manageMap() };
    }
    async agentConnections(principal: AuthPrincipal, sessionId: string) {
        if (principal.scopedSessionId || principal.pairingId)
            return [];
        return (await this.store.list<AgentConnection>('agent-connection', sessionId)).filter(x => x.userId === principal.userId);
    }
    async sessions(principal: AuthPrincipal): Promise<Awaited<SessionRecord[]>> {
        (await this.auth.assertCurrent(principal, 'read', principal.scopedSessionId));
        return (await asyncFlatMap((await this.store.list<SessionRecord>('session')), async (session) => {
            try {
                return [{ ...(await this.access(principal, session.id)), agentConnections: await this.agentConnections(principal, session.id) }];
            }
            catch (error) {
                // An ended session is still listed (its role and effective config still
                // resolve); every other denial (no access, revoked, not found) excludes it.
                if (error instanceof AppError && error.code === 'SESSION_ENDED') {
                    const role = principal.scopedSessionId === session.id ? 'viewer' : (await this.accounts.effectiveRole(principal.userId, session.id));
                    if (role)
                        return [{ ...session, agentConnections: await this.agentConnections(principal, session.id), config: (await this.accounts.effectiveConfig(session, principal.userId)), role }];
                }
                return [];
            }
        }));
    }
    /** Explicit public create: immediately joinable, with an opt-out for headless workflows. */
    async createReadySession(principal: AuthPrincipal, name: string, initialDisplay = true) {
        return this.store.atomic(async () => this.store.transaction(async () => {
            const session = await this.createSession(principal, name);
            if (!initialDisplay)
                return { ...session, displays: [] };
            const display = await this.createDisplay(principal, session.id, { name: 'Main display', width: 1280, height: 800 });
            return { ...session, displays: [display], viewerUrl: display.viewerUrl, note: 'This private display is ready to join and shows the branded ready screen until content is published. Creating its address does not grant access.' };
        }));
    }
    /** The blank ready screen invites a first-time account: nothing has been
     * published in this session yet and its owner has no other session. */
    async firstTimeSession(sessionId: string): Promise<boolean> {
        try {
            const session = await this.store.get<SessionRecord>('session', sessionId);
            if (!session || (await this.store.list<UpdateRecord>('update', sessionId)).length)
                return false;
            return (await this.sessionUsage(session.ownerId)).stored <= 1;
        }
        catch {
            return false;
        }
    }
    /** Sessions that use a slot: owned, not archived, and not the Home session
     * every account is given automatically. The limit counts sessions a person or
     * their agent created. */
    async sessionUsage(userId: string): Promise<{
        active: number;
        stored: number;
        limit: number;
        storedLimit: number;
        tier: string;
    }> {
        const limits = await accountUsageLimits(this.store, userId), entry = new Set((await this.store.list<{
            sessionId?: string;
        }>('account-entry')).flatMap(e => e.sessionId ? [e.sessionId] : []));
        const mine = (session: SessionRecord) => session.ownerId === userId && !entry.has(session.id);
        return { active: (await this.store.list<SessionRecord>('session')).filter(mine).length, stored: (await this.store.list<SessionRecord>('session', undefined, true)).filter(mine).length, limit: limits.sessions, storedLimit: limits.sessions * STORED_SESSION_FACTOR, tier: limits.tier };
    }
    /** Throws the structured, honest limit error when another active session is not allowed. */
    async assertSessionSlot(userId: string): Promise<void> {
        const usage = await this.sessionUsage(userId);
        if (usage.active >= usage.limit)
            throw limitError({ code: 'SESSION_LIMIT_REACHED', limit: usage.limit, used: usage.active, resource: 'sessions', tier: usage.tier, whatYouCanDo: ['Keep using existing sessions (kanvas.sessions.list).', 'Archive a session that is no longer needed: kanvas.archive.manage {resource:"session", sessionId}.'] });
        if (usage.stored >= usage.storedLimit)
            throw limitError({ code: 'SESSION_STORAGE_LIMIT_REACHED', limit: usage.storedLimit, used: usage.stored, resource: 'storedSessions', tier: usage.tier, whatYouCanDo: ['Keep using existing sessions.', 'Permanently delete an archived session: kanvas.archive.list, then kanvas.archive.manage request-delete and confirm-delete.'] });
    }
    async createSession(principal: AuthPrincipal, name: string): Promise<Awaited<SessionRecord>> {
        return this.store.atomic(async () => {
            (await this.fullAccount(principal, 'publish'));
            if (principal.tokenId && (await this.store.get<{
                sessionIds?: string[];
            }>('token', principal.tokenId))?.sessionIds)
                throw new AppError('FORBIDDEN', 'A session-scoped client cannot create another session. Create it in the workspace.', 403);
            const sessionLimit = (await accountUsageLimits(this.store, principal.userId)).sessions;
            await this.assertSessionSlot(principal.userId);
            const session: SessionRecord = { serverVersion: KANVAS_VERSION, id: id(), name, ownerId: principal.userId, config: copy((await this.experience.defaults(principal.userId)).config), configRevision: 0, createdAt: now(), updatedAt: now() };
            (await this.store.transaction(async () => { (await this.store.put('session', session)); (await this.store.db.prepare('INSERT INTO members VALUES(?,?,?)').run(session.id, principal.userId, 'owner')); }));
            (await this.accounts.audit('session.created', { actorId: principal.userId, sessionId: session.id }));
            if (currentToolContext())
                await this.recordAgentContext(principal, session.id, {}, true);
            this.emit({ type: 'membership', sessionId: session.id });
            return { ...session, role: 'owner' };
        });
    }
    async display(principal: AuthPrincipal, sessionId: string, displayId: string, minimum: Role = 'viewer'): Promise<Awaited<StoredDisplay>> {
        (await this.access(principal, sessionId, minimum));
        if (principal.scopedDisplayId && principal.scopedDisplayId !== displayId)
            throw new AppError('NOT_FOUND', 'This display is unavailable.', 404);
        const display = required((await this.store.get<StoredDisplay>('display', displayId)));
        if (display.sessionId !== sessionId)
            throw new AppError('NOT_FOUND', 'This display is unavailable.', 404);
        return display;
    }
    async publicDisplay(stored: StoredDisplay, principal?: AuthPrincipal): Promise<Awaited<DisplayRecord>> {
        const { generation: _generation, targetAgentId: _target, interactionEpoch: _epoch, shortUrl: _shortUrl, ...display } = stored;
        const alias = (await this.experience.existingAlias(display.sessionId, display.id));
        return { ...display, imageDiagnostics: (await this.store.list<{
                displayId: string;
                revision: number;
                host: string;
                reason: string;
                at: string;
            }>('image-diagnostic', display.sessionId)).filter(x => x.displayId === display.id && x.revision === display.revision).map(({ host, reason, at }) => ({ host, reason, at })), view: display.view ? retainedProvenance(display.view) as ViewSpec : null, ...((['iframe', 'website'].includes(displayedLeaf(display.view)?.template ?? '') || (displayedLeaf(display.view)?.template === 'web' && displayedLeaf(display.view)?.data.embed === true)) ? { remoteContent: { verified: false as const, note: 'Only the frame container is observed. Cross-origin content and embedding permission are controlled by the remote publisher.' } } : {}), ...(alias ? { shortUrl: `${this.publicUrl}/s/${alias.id}` } : {}), serverNow: now(), ...(principal ? { responseState: (await this.engagement.projection(stored, principal.participantId ?? principal.userId)) } : {}), videoCommand: (await this.video.pending(stored)), viewerUrl: new URL(`/view/${encodeURIComponent(display.sessionId)}/${encodeURIComponent(display.id)}`, this.publicUrl).href };
    }
    async detail(principal: AuthPrincipal, sessionId: string, requestedDisplayId?: string) {
        return this.store.snapshot(async () => {
            const session = { ...(await this.access(principal, sessionId)), agentConnections: await this.agentConnections(principal, sessionId) };
            const invitation = await this.firstTimeSession(sessionId);
            const displayId = requestedDisplayId ?? principal.scopedDisplayId;
            if (displayId)
                (await this.display(principal, sessionId, displayId));
            const displays = (await asyncMap((await this.store.list<StoredDisplay>('display', sessionId)).filter(d => !displayId || d.id === displayId), async (d) => (await this.publicDisplay(d, principal))));
            if (principal.scopedSessionId)
                return { session, displays, invitation, members: [], updates: [], interactions: [], datasets: [], assets: [] };
            if (displayId)
                return { session, displays, invitation, members: [], updates: [], interactions: (await this.interactions(principal, sessionId, 'all', 500)).interactions.filter(item => item.displayId === displayId), datasets: [], assets: [] };
            const members = (await asyncMap((await this.store.db.prepare('SELECT user_id AS "userId",role FROM members WHERE session_id=?').all(sessionId)), async (row) => ({ ...row, ...(await this.auth.user(String(row.userId))) })));
            return { session, displays, invitation, members, updates: (await asyncMap((await this.store.list<UpdateRecord>('update', sessionId)).slice(-200), async (update) => (await this.updateDelivery(update)))), interactions: (await this.interactions(principal, sessionId, 'all', 500)).interactions, datasets: (await this.store.list<DatasetSummary>('dataset-summary', sessionId)), assets: (await this.store.list<AssetRecord>('asset', sessionId)), recentDiagnostics: (await this.reports.recentDiagnostics(principal, sessionId)) };
        });
    }
    async createDisplay(principal: AuthPrincipal, sessionId: string, input: {
        name: string;
        width: number;
        height: number;
        pixelRatio?: number;
    }): Promise<Awaited<DisplayRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            if ((await this.store.list('display', sessionId)).length >= 64)
                throw new AppError('LIMIT_REACHED', 'This session has reached its 64-display limit.', 429);
            const display: StoredDisplay = { id: id(), sessionId, ...input, pixelRatio: input.pixelRatio ?? 1, viewportRevision: 0, revision: 0, generation: 0, interactionEpoch: id(), view: null, held: false, online: false, updatedAt: now() };
            (await this.store.transaction(async () => { (await this.store.put('display', display)); (await this.accounts.audit('display.created', { actorId: principal.userId, sessionId, displayId: display.id })); (await this.experience.alias(sessionId, display.id)); }));
            this.store.afterCommit(() => this.push.enqueue(principal, sessionId, display.id));
            this.emit({ type: 'display', sessionId, displayId: display.id, revision: display.revision });
            return (await this.publicDisplay(display));
        });
    }
    /** Flash each display's stable number and name so people can tell screens
     * apart. Transient: no revision, history, delivery or content change. */
    async identifyDisplays(principal: AuthPrincipal, sessionId: string, displayIds?: string[], durationMs = 2000) {
        (await this.access(principal, sessionId, 'editor'));
        const all = (await this.store.list<StoredDisplay>('display', sessionId));
        const known = new Set(all.map(d => d.id)), missing = (displayIds ?? []).filter(displayId => !known.has(displayId));
        if (missing.length)
            throw new InputError([{ path: 'displayIds', problem: `This display is not part of the session: ${missing[0]}` }]);
        const duration = Math.min(5000, Math.max(1000, Math.round(durationMs)));
        const online = new Set((await this.experience.receiving.viewers(sessionId)).filter(v => (v as {
            connected?: boolean;
        }).connected !== false).map(v => (v as {
            displayId?: string;
        }).displayId));
        const identified = all.map((d, index) => ({ displayId: d.id, name: d.name, ordinal: index + 1 })).filter(d => !displayIds?.length || displayIds.includes(d.displayId));
        for (const d of identified)
            this.emit({ type: 'identify', sessionId, displayId: d.displayId, data: { ordinal: d.ordinal, total: all.length, name: d.name, durationMs: duration } });
        return { identified: identified.map(d => ({ ...d, online: online.has(d.displayId) })), total: all.length, durationMs: duration, note: 'Transient overlay only; content, revisions and history are unchanged. Offline displays do not show it.' };
    }
    /** devices.read: a validated devices-template view. Session and display
     * names appear only where this account still has access; otherwise ids only. */
    private async devicesRecipe(principal: AuthPrincipal, devices: {
        id: string;
        name: string;
        location?: string;
        role?: string;
        tags?: string[];
        defaultSessionId?: string;
        context?: {
            device?: string;
            browser?: string;
        };
        connected?: boolean;
        lastSeenAt?: string;
        current?: {
            sessionId: string;
            displayId: string;
        };
        windows: {
            id: string;
            name?: string;
            connected?: boolean;
            lastSeenAt?: string;
            current?: {
                sessionId: string;
                displayId: string;
            };
        }[];
    }[]) {
        const cache = new Map<string, {
            name?: string;
            displays: Map<string, string>;
        }>();
        const place = async (target?: {
            sessionId: string;
            displayId: string;
        }) => {
            if (!target)
                return {};
            let entry = cache.get(target.sessionId);
            if (!entry) {
                entry = { displays: new Map() };
                try {
                    const session = (await this.access(principal, target.sessionId));
                    entry = { name: session.name, displays: new Map((await this.store.list<StoredDisplay>('display', target.sessionId)).map(d => [d.id, d.name])) };
                }
                catch { /* Inaccessible or ended: identifiers only. */ }
                cache.set(target.sessionId, entry);
            }
            const displayName = entry.displays.get(target.displayId);
            return { sessionId: target.sessionId, ...(entry.name ? { sessionName: entry.name.slice(0, 160) } : {}), displayId: target.displayId, ...(displayName ? { displayName: displayName.slice(0, 120) } : {}) };
        };
        const data = { groupBy: 'device', showOffline: true, devices: (await asyncMap(devices.slice(0, 100), async (d) => {
                const windows = d.windows.length ? d.windows : d.current ? [{ id: d.id, name: 'Browser', connected: d.connected, lastSeenAt: d.lastSeenAt, current: d.current }] : [];
                return { id: d.id, location: d.location, role: d.role, tags: d.tags, defaultSessionId: d.defaultSessionId, name: d.name.trim().slice(0, 120) || 'Device', ...(d.context?.device ? { device: d.context.device.slice(0, 80) } : {}), ...(d.context?.browser ? { browser: d.context.browser.slice(0, 40) } : {}), connected: Boolean(d.connected), ...(d.lastSeenAt ? { lastSeenAt: d.lastSeenAt } : {}),
                    windows: (await asyncMap(windows.slice(0, 40), async (w) => ({ id: w.id, ...(w.name ? { name: w.name.slice(0, 120) } : {}), connected: Boolean(w.connected), ...(w.lastSeenAt ? { lastSeenAt: w.lastSeenAt } : {}), ...(await place(w.current)) }))) };
            })) };
        const parsed = devicesViewDataSchema.safeParse(data);
        return parsed.success ? { tool: "kanvas.submit", note: 'Choose the target session and display. The view lists only this account’s own devices and windows.', view: { version: 1, template: 'devices', title: 'Devices and windows', showTitle: true, data: parsed.data } } : undefined;
    }
    /** One canonical size per display: the largest connected screen that is in
     * the foreground (any connected screen when none is). It changes only when
     * that answer changes, i.e. when a viewer really joins, leaves or resizes;
     * with nobody connected the last settled size stays. Per-viewer sizes remain
     * on each viewer record. Returns whether the stored size changed. */
    async settleViewport(sessionId: string, displayId: string, report?: {
        width?: number;
        height?: number;
        pixelRatio?: number;
    }): Promise<boolean> {
        return this.store.atomic(async () => {
            const display = await this.store.get<StoredDisplay>('display', displayId);
            if (!display || display.sessionId !== sessionId)
                return false;
            const candidates: {
                width: number;
                height: number;
                visible: boolean;
                pixelRatio?: number;
            }[] = (await this.experience.receiving.viewers(sessionId, displayId, true))
                .filter(v => v.tabId && v.width > 0 && v.height > 0).map(v => ({ width: v.width, height: v.height, visible: v.visible !== false }));
            if (report?.width && report.height)
                candidates.push({ width: report.width, height: report.height, visible: true, pixelRatio: report.pixelRatio });
            if (!candidates.length)
                return false;
            const pool = candidates.some(c => c.visible) ? candidates.filter(c => c.visible) : candidates;
            const area = (c: {
                width: number;
                height: number;
            }) => c.width * c.height;
            const largest = pool.reduce((best, next) => area(next) > area(best) ? next : best);
            // Equal-sized screens never trade places.
            const chosen = pool.find(c => c.width === display.width && c.height === display.height && area(c) >= area(largest)) ?? largest;
            const pixelRatio = chosen.pixelRatio ?? (chosen.width === display.width && chosen.height === display.height ? display.pixelRatio : report?.pixelRatio ?? display.pixelRatio);
            if (chosen.width === display.width && chosen.height === display.height && pixelRatio === display.pixelRatio)
                return false;
            display.width = chosen.width;
            display.height = chosen.height;
            display.pixelRatio = pixelRatio;
            display.viewportRevision++;
            display.updatedAt = now();
            await this.store.put('display', display);
            this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            return true;
        });
    }
    async updateDisplay(principal: AuthPrincipal, sessionId: string, displayId: string, input: {
        width?: number;
        height?: number;
        pixelRatio?: number;
        held?: boolean;
        expectedRevision?: number;
    }): Promise<Awaited<DisplayRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, sessionId, displayId, input.held === undefined ? 'viewer' : 'editor'));
            if (input.held !== undefined) {
                this.assertRevision(input.expectedRevision, display.revision);
                if (display.held !== input.held) {
                    display.held = input.held;
                    display.revision++;
                    display.generation++;
                }
            }
            // A receiving browser only REPORTS its viewport. The display's own size is
            // settled among all connected screens, so two viewers cannot flip it.
            if (principal.browserId && input.held === undefined) {
                await this.settleViewport(sessionId, displayId, input);
                return (await this.publicDisplay(required(await this.store.get<StoredDisplay>('display', displayId))));
            }
            if (input.width !== undefined || input.height !== undefined || input.pixelRatio !== undefined) {
                for (const key of ['width', 'height', 'pixelRatio'] as const)
                    if (input[key] !== undefined)
                        display[key] = input[key];
                display.viewportRevision++;
            }
            display.updatedAt = now();
            (await this.store.put('display', display));
            this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            return (await this.publicDisplay(display));
        });
    }
    assertRevision(expected: unknown, actual: number): void { assertExpectedRevision(expected, actual); }
    async accountDetails(principal: AuthPrincipal) {
        await this.fullAccount(principal);
        if (principal.tokenId && (await this.store.get<{
            sessionIds?: string[];
        }>('token', principal.tokenId))?.sessionIds)
            throw new AppError('FORBIDDEN', 'Account details require an account-wide grant.', 403);
        const user = required(await this.auth.user(principal.userId)), verified = await this.store.get<{
            email: string;
        }>('verified-email', principal.userId), limits = await accountUsageLimits(this.store, principal.userId);
        const email = verified?.email ?? (z.string().email().safeParse(user.username).success ? user.username : null);
        const details = { id: user.id, displayName: user.displayName, username: user.username, email, emailVerified: Boolean(verified), tier: limits.tier, quotaExempt: limits.tier !== 'trial', limits: { sessions: Number.isFinite(limits.sessions) ? limits.sessions : null, retainedViewsPerSession: Number.isFinite(limits.views) ? limits.views : null } };
        return { ...details, note: 'Tier is a quota entitlement, not administrator authority. Null limit means no trial quota; safety and access limits still apply.', publishRecipe: { tool: "kanvas.submit", privacy: 'Contains personal account data. Show only on the intended private display; never publish publicly without consent.', view: { version: 1, template: 'table', title: 'Your Kanvas account', showTitle: true, data: { columns: ['Account detail', 'Value'], rows: [['Name', details.displayName], ['Email', email ?? 'Not set'], ['Plan / quota tier', details.tier], ['Session quota', details.limits.sessions ?? 'No trial quota'], ['Retained views per session', details.limits.retainedViewsPerSession ?? 'No trial quota']].map(([key, value]) => ({ 'Account detail': key, Value: value })) } } } };
    }
    async startPage(principal: AuthPrincipal, offset = 0) { return accountOverview(this, principal, offset); }
    async beginSession(principal: AuthPrincipal, a: {
        requestId: string;
        name: string;
        deviceId?: string;
        windowId?: string;
    }) {
        return this.store.atomic(async () => this.store.transaction(async () => {
            await this.fullAccount(principal, 'publish');
            // list() requires account-wide authority and supplies authenticated presence.
            const inventory = await this.devices.list(principal);
            const key = hash(`${principal.userId}:${principal.tokenId ?? 'account'}:${a.requestId}`), digest = hash(JSON.stringify(a));
            const previous = await this.store.get<{
                id: string;
                digest: string;
                sessionId: string;
                displayId: string;
                deviceId: string;
                windowId: string;
                commandId: string;
            }>('start-request', key);
            if (previous) {
                if (previous.digest !== digest)
                    throw new AppError('REQUEST_ID_CONFLICT', 'This start request refers to different input.', 409);
                await this.display(principal, previous.sessionId, previous.displayId, 'editor');
                return { ...previous, status: 'started', startUrl: `${this.publicUrl}/`, note: 'Original start command; inspect the receiver for actual paint. No new session or redirect was created.' };
            }
            const windows = inventory.devices.flatMap(device => device.windows.filter(window => window.connected).map(window => ({ deviceId: device.id, deviceName: device.name, ...window })));
            const candidates = windows.filter(window => (!a.deviceId || window.deviceId === a.deviceId) && (!a.windowId || window.id === a.windowId));
            if (!windows.length && !a.deviceId && !a.windowId && principal.tokenId && await this.push.canNotify(principal.userId)) {
                const session = await this.createSession(principal, a.name), display = await this.createDisplay(principal, session.id, { name: 'Main display', width: 1280, height: 800 });
                const result = { id: key, digest, sessionId: session.id, displayId: display.id, notification: true };
                await this.store.put('start-request', result);
                return { ...result, status: 'started', startUrl: this.publicUrl + '/', nextAction: 'Publish to this session/display. An opted-in device notification is queued, not delivered or painted. The user must open it; verify actual paint before claiming visibility.' };
            }
            if (!windows.length)
                return { status: 'needs_display', startUrl: `${this.publicUrl}/`, nextAction: 'Open this bare Kanvas address and sign in. Then retry begin; no session has been created.' };
            if (!candidates.length)
                throw new AppError('VIEWER_UNAVAILABLE', 'The selected owned window is not connected.', 409);
            if (candidates.length !== 1)
                return { status: 'needs_target', startUrl: `${this.publicUrl}/`, windows: candidates.map(w => ({ deviceId: w.deviceId, windowId: w.id, deviceName: w.deviceName, name: w.name })), nextAction: 'Choose the intended window and retry begin with deviceId/windowId. No session has been created.' };
            const selected = candidates[0], session = await this.createSession(principal, a.name), display = await this.createDisplay(principal, session.id, { name: 'Main display', width: 1280, height: 800 });
            const receipt = await this.devices.windows.present(principal, { deviceId: selected.deviceId, windowId: selected.id, sessionId: session.id, displayId: display.id, expectedVersion: selected.version, requestId: a.requestId });
            const result = { id: key, digest, sessionId: session.id, displayId: display.id, deviceId: selected.deviceId, windowId: selected.id, commandId: receipt.commandId };
            await this.store.put('start-request', result);
            return { ...result, status: 'started', startUrl: `${this.publicUrl}/`, nextAction: 'Publish the requested content to this session/display. The blank display shows the Kanvas ready screen. Verify command paint before claiming it is visible; no URL needs to be read aloud.' };
        }));
    }
    async publishHome(principal: AuthPrincipal, sessionId: string, displayId: string) {
        return this.store.atomic(async () => {
            const d = (await this.display(principal, sessionId, displayId, 'editor'));
            if (d.view?.template === 'overview' && d.view.data.scope === 'account')
                return;
            const view = (await this.verifyView(principal, sessionId, { version: 1, template: 'overview', title: 'Your KANVAS sessions', showTitle: true, data: { scope: 'account' } }));
            const result = (await this.store.transaction(async () => (await this.publishMutation(principal, { sessionId, displayId, requestId: id() }, d, view, 'patch'))));
            this.emit({ type: 'display', sessionId, displayId, revision: result.revisions[displayId] });
        });
    }
    async renameSession(principal: AuthPrincipal, sessionId: string, expectedRevision: number | undefined, name: string) {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'owner'));
            const session = required((await this.store.get<SessionRecord>('session', sessionId)));
            this.assertRevision(expectedRevision, session.configRevision);
            session.name = name;
            (await this.accounts.audit('session.renamed', { actorId: principal.userId, sessionId }));
            session.configRevision++;
            session.updatedAt = now();
            (await this.store.put('session', session));
            this.emit({ type: 'config', sessionId, revision: session.configRevision });
            return session;
        });
    }
    async lockdownDisplay(principal: AuthPrincipal, raw: unknown) {
        const a = z.object({ sessionId: z.string(), displayId: z.string(), expectedRevision: revisionSchema.optional(), locked: z.boolean() }).strict().parse(raw);
        return this.store.atomic(async () => {
            await this.fullAccount(principal, 'publish');
            const display = await this.display(principal, a.sessionId, a.displayId, 'owner');
            this.assertRevision(a.expectedRevision, display.revision);
            display.lockdown = a.locked;
            await this.store.put('display', display);
            this.store.afterCommit(() => this.emit({ type: 'display', sessionId: a.sessionId, displayId: a.displayId, revision: display.revision }));
            return { displayId: a.displayId, locked: a.locked, note: 'App-only kiosk restriction; content remains visible and owner tools remain available. Use OS/browser kiosk mode to restrict the address bar, tabs and operating system.' };
        });
    }
    async renameDisplay(principal: AuthPrincipal, sessionId: string, displayId: string, expectedRevision: number | undefined, name: string) {
        return this.store.atomic(async () => {
            (await this.fullAccount(principal, 'publish'));
            const display = (await this.display(principal, sessionId, displayId, 'owner'));
            this.assertRevision(expectedRevision, display.revision);
            const clean = z.string().trim().min(1).max(160).parse(name);
            if (clean === display.name)
                return (await this.publicDisplay(display, principal));
            (await this.store.transaction(async () => {
                display.name = clean;
                display.revision++;
                display.generation++;
                display.updatedAt = now();
                display.delivery = { revision: display.revision, status: 'pending', updatedAt: display.updatedAt };
                (await this.store.put('display', display));
                (await this.accounts.audit('display.renamed', { actorId: principal.userId, sessionId, displayId }));
            }));
            this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            return (await this.publicDisplay(display, principal));
        });
    }
    async setSelection(principal: AuthPrincipal, raw: unknown) {
        return this.store.atomic(async () => {
            const a = selectionInputSchema.parse(raw), d = (await this.display(principal, a.sessionId, a.displayId, 'editor')), prior = (await this.retry<UpdateRecord>(principal, a.sessionId, a.requestId, 'patch', a));
            if (prior)
                return (await this.updateDelivery(prior));
            this.assertRevision(a.expectedRevision, d.revision);
            if (d.held)
                throw new AppError('DISPLAY_HELD', 'Release the hold before changing selection.', 409);
            if (!d.view)
                throw new AppError('INVALID_VIEW', 'Publish source content before selecting records.', 409);
            const leaf = displayedLeaf(d.view)!;
            const selected = { ...leaf, selection: a.selection ?? undefined };
            const view = (await this.verifyView(principal, a.sessionId, d.view.template === 'presentation' ? { ...d.view, data: { ...d.view.data, slides: (d.view.data.slides as ViewSpec[]).map((v, i) => i === Number(d.view!.data.index ?? 0) ? selected : v) } } : selected));
            const result = (await this.store.transaction(async () => (await this.publishMutation(principal, a, d, view, 'patch'))));
            this.emit({ type: 'display', sessionId: a.sessionId, displayId: d.id, revision: result.revisions[d.id] });
            this.emit({ type: 'update', sessionId: a.sessionId });
            return { ...(await this.updateDelivery(result)), selection: { sourceRetained: true, matched: projectSelection(selected).indices?.length } };
        });
    }
    async livePush(principal: AuthPrincipal, raw: unknown) {
        return this.store.atomic(async () => {
            const a = livePushSchema.parse(raw);
            (await this.fullAccount(principal, 'publish'));
            const display = (await this.display(principal, a.sessionId, a.displayId, 'editor'));
            const prior = (await this.retry<UpdateRecord>(principal, a.sessionId, a.requestId, 'patch', a));
            if (prior)
                return (await this.updateDelivery(prior));
            this.assertRevision(a.expectedRevision, display.revision);
            if (display.held)
                throw new AppError('DISPLAY_HELD', 'Resume the display before accepting live samples.', 409);
            const current = display.view;
            if (!current || current.template !== 'number' && (current.template !== 'chart' || !['gauge', 'line', 'area', 'bar', 'heatmap'].includes(String(current.data.kind))))
                throw new AppError('INVALID_VIEW', 'Live push requires a number or gauge, line, area, bar or heatmap chart.', 409);
            if (current.template === 'chart' && a.data.kind !== current.data.kind)
                throw new AppError('INVALID_VIEW', 'A live sample cannot change the chart kind. Publish a new view explicitly.', 409);
            const view = (await this.verifyView(principal, a.sessionId, { ...current, data: a.data }));
            const result = (await this.store.transaction(async () => (await this.publishMutation(principal, a, display, view, 'patch'))));
            this.emit({ type: 'display', sessionId: a.sessionId, displayId: display.id, revision: result.revisions[display.id] });
            this.emit({ type: 'update', sessionId: a.sessionId });
            return { ...(await this.updateDelivery(result)), sourceMode: 'authenticated-push' };
        });
    }
    async updateConfig(principal: AuthPrincipal, sessionId: string, expectedRevision: number | undefined, patch: Partial<SessionConfig>): Promise<Awaited<SessionRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            const session = required((await this.store.get<SessionRecord>('session', sessionId)));
            this.assertRevision(expectedRevision, session.configRevision);
            if (patch.syncMode !== undefined && patch.syncMode !== session.config.syncMode || patch.presenterViewerId !== undefined && patch.presenterViewerId !== session.config.presenterViewerId) {
                (await this.access(principal, sessionId, 'owner'));
                const mode = patch.syncMode ?? session.config.syncMode ?? 'independent', presenter = patch.presenterViewerId ?? session.config.presenterViewerId;
                if (mode === 'presenter' && (!presenter || !(await this.experience.viewers(principal, sessionId)).some(v => v.id === presenter)))
                    throw new AppError('PRESENTER_REQUIRED', "Select a connected viewer from kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026} before enabling presenter mode.", 409);
            }
            session.config = mergeConfig(session.config, patch);
            (await this.accounts.configChanged(sessionId, patch));
            (await this.accounts.audit('session.settings.changed', { actorId: principal.userId, sessionId }));
            session.configRevision++;
            session.updatedAt = now();
            (await this.store.put('session', session));
            this.emit({ type: 'config', sessionId, revision: session.configRevision });
            return session;
        });
    }
    async verifyView(principal: AuthPrincipal, sessionId: string, value: ViewSpec): Promise<Awaited<ViewSpec>> {
        if (value.template === 'instrument' && process.env.KANVAS_INSTRUMENTS_ENABLED === 'false')
            throw new AppError('FEATURE_DISABLED', 'Instrument publication is disabled on this installation.', 403);
        if (value.template === 'live-captions' && process.env.KANVAS_CAPTIONS_ENABLED === 'false')
            throw new AppError('FEATURE_DISABLED', 'Live Captions publication is disabled on this installation.', 403);
        try {
            assertJsonBudget(value);
        }
        catch {
            throw new InputError([{ path: 'view', problem: 'Exceeds the supported content size or complexity.' }]);
        }
        if (value.template === 'split-screen' && Array.isArray(value.data.panes))
            value = { ...value, data: await mapSplitViews(value.data, pane => this.verifyView(principal, sessionId, pane)) };
        if (value.template === 'presentation' && Array.isArray(value.data.slides)) {
            const slides: ViewSpec[] = [];
            for (const slide of value.data.slides as ViewSpec[])
                slides.push(await this.verifyView(principal, sessionId, slide));
            value = { ...value, data: { ...value.data, slides } };
        }
        if (value.template === 'monitor-stream')
            await this.monitorStreams.assertBindable(sessionId, String(value.data.streamId));
        if (value.template === 'game-board' && process.env.KANVAS_GAMES_ENABLED === 'false')
            throw new AppError('FEATURE_DISABLED', 'Game publication is disabled; retained positions are preserved.', 409);
        if (value.template === 'account-template')
            value = await this.customTemplates.resolve(principal, value);
        if (value.template === 'sale-poster' && (value.data.html || value.data.css))
            validateStatic(String(value.data.html ?? ''), String(value.data.css ?? ''));
        await this.mediaLibrary.authorizeReferences(principal, sessionId, value);
        let validated: ViewSpec;
        try {
            validated = validateView(value);
        }
        catch (error) {
            throw new InputError(error instanceof z.ZodError ? validationIssues(error, 'view', value) : [{ path: 'view', problem: 'Exceeds the supported content size or complexity.' }], value?.template);
        }
        if (validated.template === 'menu-board') {
            const data = validated.data as {
                sections: {
                    id?: string;
                    items: {
                        id?: string;
                    }[];
                }[];
                featured?: {
                    id?: string;
                };
            };
            for (const section of data.sections) {
                section.id ??= id();
                for (const item of section.items)
                    item.id ??= id();
            }
            if (data.featured)
                data.featured.id ??= id();
        }
        if (validated.template === 'todays-special') {
            const item = validated.data.item as {
                id?: string;
            };
            item.id ??= id();
        }
        const view = materializeDatasetView(validated, (await this.store.list<DatasetRecord>('dataset', sessionId)));
        try {
            assertJsonBudget(view);
        }
        catch {
            throw new InputError([{ path: 'view', problem: 'Materialized content exceeds the supported content size or complexity.' }]);
        }
        const leafViews = view.template === 'presentation' ? view.data.slides as ViewSpec[] : [view];
        for (const leaf of leafViews)
            if (leaf.template === 'session-topology' && (leaf.data.includeLocation || leaf.data.layout === 'map'))
                (await this.access(principal, sessionId, 'owner'));
        for (const assetId of referencedAssets(view))
            (await this.asset(principal, assetId, sessionId));
        return view;
    }
    async edit(principal: AuthPrincipal, sessionId: string, displayId: string, expectedRevision: number | undefined, data: Record<string, unknown>): Promise<Awaited<DisplayRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, sessionId, displayId, 'editor'));
            this.assertRevision(expectedRevision, display.revision);
            // Complete data replacement is validated against the current template's own
            // schema below; editors can already publish any template, so no allow-list.
            if (!display.view)
                throw new InputError([{ path: 'displayId', problem: 'This display has no current view. Publish a complete view with show first; replace_data replaces the data of the existing view.' }]);
            const view = (await this.verifyView(principal, sessionId, { ...display.view, data }));
            (await this.store.transaction(async () => {
                (await this.history.ensure(display));
                if (!participationCompatible(display.view, view))
                    display.interactionEpoch = id();
                display.zoomRoot ??= display.navigationRoot ?? display.revision;
                display.navigationRoot ??= display.revision;
                display.view = view ? await this.checklists.capture(display.sessionId, view) : null;
                display.revision++;
                display.generation++;
                display.updatedAt = now();
                display.delivery = { revision: display.revision, status: 'pending', updatedAt: display.updatedAt };
                (await this.store.put('display', display));
                (await this.history.record(display, 'edit'));
            }));
            this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            return (await this.publicDisplay(display, principal));
        });
    }
    /** Called inside the patch/timer host transaction; original input is the durable identity. */
    private async publishMutation(principal: AuthPrincipal, input: {
        sessionId: string;
        displayId: string;
        requestId: string;
    }, before: ViewPatchDisplay, view: ViewSpec, kind: 'patch' | 'timer-control' | 'presentation-control' | 'pin-recall' | 'checklist-show' | DocumentKind, navigationOnly = false): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, input.sessionId, input.displayId, 'editor'));
            this.assertRevision(before.revision, display.revision);
            if (before.generation !== display.generation || before.interactionEpoch !== display.interactionEpoch)
                throw new AppError('REVISION_CONFLICT', 'The display changed while applying this operation.', 409);
            if (kind === 'timer-control' && display.held)
                throw new AppError('DISPLAY_HELD', 'Release the display hold before controlling this timer.', 409);
            (await this.history.ensure(display));
            const sameChecklist = kind === 'checklist-show' && display.view?.template === 'checklist' && view.template === 'checklist' && Boolean(view.data.checklistId) && display.view.data.checklistId === view.data.checklistId;
            display.zoomRoot = !sameChecklist && ['pin-recall', 'checklist-show', 'presentation-control'].includes(kind) ? display.revision + 1 : display.zoomRoot ?? display.navigationRoot ?? display.revision;
            display.navigationRoot = !sameChecklist && ['pin-recall', 'checklist-show', 'presentation-control'].includes(kind) ? display.revision + 1 : display.navigationRoot ?? display.revision;
            display.view = view ? await (kind === 'pin-recall' ? this.checklists.restoreSnapshot(display.sessionId, view) : this.checklists.capture(display.sessionId, view)) : null;
            display.revision++;
            display.generation++;
            display.updatedAt = now();
            if (kind === 'pin-recall')
                display.interactionEpoch = id();
            display.targetAgentId = principal.agentId ?? display.targetAgentId;
            display.delivery = { revision: display.revision, status: 'pending', updatedAt: display.updatedAt };
            const update: UpdateRecord = { id: id(), sessionId: input.sessionId, requestId: input.requestId, displayIds: [display.id], revisions: { [display.id]: display.revision }, status: 'prepared', createdAt: now(), completedAt: now(), metrics: { path: 'direct' } };
            (await this.store.put('display', display));
            (await this.history.record(display, navigationOnly ? 'presentation.navigate' : kind));
            (await this.store.put('update', update));
            (await this.saveRequest(principal, input.sessionId, input.requestId, kind, input, update.id));
            await recordDeliveryRequest(this, update, { ...input, view }, kind);
            return update;
        });
    }
    async showChecklist(principal: AuthPrincipal, input: {
        sessionId: string;
        displayId: string;
        requestId: string;
        expectedRevision?: number;
    }, view: ViewSpec) {
        const display = await this.display(principal, input.sessionId, input.displayId, 'editor');
        const retry = await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'checklist-show', input);
        if (retry)
            return this.updateDelivery(retry);
        this.assertRevision(input.expectedRevision, display.revision);
        if (display.held)
            throw new AppError('DISPLAY_HELD', 'Release the display before showing a checklist.', 409);
        const update = await this.publishMutation(principal, input, display, await this.verifyView(principal, input.sessionId, view), 'checklist-show');
        this.store.afterCommit(() => this.emit({ type: 'display', sessionId: input.sessionId, displayId: input.displayId, revision: update.revisions[input.displayId] }));
        return this.updateDelivery(update);
    }
    async publishPreparedControl(principal: AuthPrincipal, input: {
        sessionId: string;
        displayId: string;
        requestId: string;
    }, view: ViewSpec): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, input.sessionId, input.displayId, 'editor'));
            if (display.held)
                throw new AppError('DISPLAY_HELD', 'Release this display before starting autoplay.', 409);
            const verified = (await this.verifyView(principal, input.sessionId, view));
            const update = (await this.publishMutation(principal, input, display, verified, 'presentation-control'));
            this.store.afterCommit(() => this.emit({ type: 'display', sessionId: input.sessionId, displayId: input.displayId, revision: update.revisions[input.displayId] }));
            return update;
        });
    }
    async recallPinnedView(principal: AuthPrincipal, input: {
        sessionId: string;
        displayId: string;
        requestId: string;
        expectedRevision?: number;
        pinId: string;
    }, view: ViewSpec | (() => ViewSpec | Promise<ViewSpec>)): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, input.sessionId, input.displayId, 'editor'));
            const prior = (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'pin-recall', input));
            if (prior)
                return prior;
            this.assertRevision(input.expectedRevision, display.revision);
            if (display.held)
                throw new AppError('DISPLAY_HELD', 'Release the hold before recalling a pinned view.', 409);
            const verified = (await this.verifyView(principal, input.sessionId, typeof view === 'function' ? await view() : view));
            const update = (await this.store.transaction(async () => { const result = (await this.publishMutation(principal, input, display, verified, 'pin-recall')); return result; }));
            this.emit({ type: 'display', sessionId: input.sessionId, displayId: input.displayId, revision: update.revisions[input.displayId] });
            return update;
        });
    }
    private identity(principal: AuthPrincipal): string { return principal.tokenId ? `token:${principal.tokenId}` : `user:${principal.participantId ?? principal.userId}`; }
    async navigatePresentation(principal: AuthPrincipal, input: PresentationNavigation): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, input.sessionId, 'editor'));
            const retry = (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'presentation-control', input));
            if (retry) {
                (await this.display(principal, input.sessionId, input.displayId, 'editor'));
                return retry;
            }
            const display = (await this.display(principal, input.sessionId, input.displayId, 'editor'));
            this.assertRevision(input.expectedRevision, display.revision);
            if (display.held)
                throw new AppError('DISPLAY_HELD', 'Release the display hold before navigating its slides.', 409);
            if (display.view?.template !== 'presentation')
                throw new AppError('NOT_PRESENTATION', "This display does not show a presentation. Read kanvas_call with operationId:\"kanvas.display.current\" and arguments:{\u2026} to choose the intended display.");
            const slides = display.view.data.slides as ViewSpec[], current = Number(display.view.data.index ?? 0);
            const index = input.action === 'next' ? Math.min(slides.length - 1, current + 1) : input.action === 'previous' ? Math.max(0, current - 1) : input.action === 'first' ? 0 : input.action === 'last' ? slides.length - 1 : input.index!;
            if (index >= slides.length)
                throw new AppError('INVALID_SLIDE', `The slide index must be between 0 and ${slides.length - 1}.`);
            const view = (await this.verifyView(principal, input.sessionId, { ...display.view, data: { ...display.view.data, index } }));
            let result!: UpdateRecord;
            (await this.store.transaction(async () => {
                if (index === current) {
                    result = { id: id(), sessionId: input.sessionId, requestId: input.requestId, displayIds: [display.id], revisions: { [display.id]: display.revision }, status: 'retained', createdAt: now(), completedAt: now(), metrics: { path: 'direct' } };
                    (await this.store.put('update', result));
                    (await this.saveRequest(principal, input.sessionId, input.requestId, 'presentation-control', input, result.id));
                }
                else
                    result = (await this.publishMutation(principal, input, display, view, 'presentation-control', true));
            }));
            this.emit({ type: 'display', sessionId: input.sessionId, displayId: display.id, revision: result.revisions[display.id] });
            return result;
        });
    }
    private async retry<T>(principal: AuthPrincipal, sessionId: string, requestId: string, kind: string, payload: unknown): Promise<Awaited<T | undefined>> {
        const row = (await this.store.db.prepare('SELECT digest,result_id,kind FROM requests WHERE session_id=? AND principal=? AND request_id=?').get(sessionId, this.identity(principal), requestId)) as RequestRecord | undefined;
        if (!row)
            return;
        if (row.kind !== kind || row.digest !== hash(canonical(payload)))
            throw new AppError('REQUEST_ID_CONFLICT', 'This request ID has already been used with different content.', 409);
        return required((await this.store.get<T>(kind === 'interaction' ? 'interaction' : 'update', row.result_id)));
    }
    private async saveRequest(principal: AuthPrincipal, sessionId: string, requestId: string, kind: string, payload: unknown, resultId: string): Promise<Awaited<void>> {
        (await this.store.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?)').run(sessionId, this.identity(principal), requestId, hash(canonical(payload)), resultId, kind));
    }
    async submit(principal: AuthPrincipal, input: SubmissionInput, kind = 'submit', bypassHold = false, deckId?: string, recoverable = false): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            const wireInput = copy(input);
            (await this.access(principal, input.sessionId, 'editor'));
            (await this.experience.log({ sessionId: input.sessionId, requestId: input.requestId, stage: 'submission.received' }));
            const session = (await this.access(principal, input.sessionId, 'editor'));
            const existing = (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, kind, input));
            if (existing)
                return existing;
            const displays = (await asyncMap(input.displayIds, async (displayId) => (await this.display(principal, input.sessionId, displayId, 'editor'))));
            const viewLimit = (await sessionUsageLimits(this.store, input.sessionId)).views;
            const retained = await this.history.retainedCount(input.sessionId);
            const pending = (await this.store.list<UpdateRecord>('update', input.sessionId)).filter(u => ['accepted', 'rendering'].includes(u.status)).reduce((n, u) => n + u.displayIds.length, 0);
            if (retained + pending + displays.length > viewLimit)
                throw limitError({ code: 'VIEW_LIMIT_REACHED', limit: viewLimit, used: retained + pending, resource: 'views', tier: (await sessionUsageLimits(this.store, input.sessionId)).tier, whatYouCanDo: ['Everything already shown stays available.', 'Permanently delete retained views that are no longer needed (kanvas.archive.manage on views); archived views still count.', 'Continue in a new session if the account has a free session slot.'] });
            if (input.datasetId && !(await this.store.list<DatasetRecord>('dataset', input.sessionId)).some(d => d.id === input.datasetId))
                throw new AppError('NOT_FOUND', 'The supplied dataset is unavailable.', 404);
            for (const assetId of input.assetIds ?? [])
                (await this.asset(principal, assetId, input.sessionId));
            if (input.view)
                input = { ...input, view: (await this.verifyView(principal, input.sessionId, input.view)) };
            if (this.active.size >= 32)
                throw new AppError('RENDER_QUEUE_FULL', 'The render queue is full. Try again shortly.', 429);
            const held = !bypassHold && displays.some(display => display.held);
            const inlineDataset = held ? undefined : inlineDatasetForSubmission(input, id());
            if (inlineDataset) {
                if ((await this.store.list<DatasetSummary>('dataset-summary', input.sessionId)).length >= 100)
                    throw new AppError('LIMIT_REACHED', 'Reuse or remove a source before submitting another inline dataset.', 429);
                input = { ...input, datasetId: inlineDataset.id };
            }
            const update: UpdateRecord = { id: id(), sessionId: input.sessionId, requestId: input.requestId, displayIds: input.displayIds, revisions: {}, status: held ? 'held' : 'accepted', createdAt: now(), ...(held ? { completedAt: now() } : {}) };
            const work: Work = { id: update.id, sessionId: input.sessionId, principal: copy(principal), generations: {}, configRevision: session.configRevision, ...(deckId ? { deckId } : {}), ...(recoverable && !held ? { recoverableInput: copy(input), bypassHold } : {}) };
            (await this.store.transaction(async () => {
                if (inlineDataset) {
                    (await this.store.put('dataset', inlineDataset));
                    (await this.store.put('dataset-summary', datasetSummary(inlineDataset)));
                }
                if (!held)
                    for (const display of displays) {
                        display.generation++;
                        work.generations[display.id] = display.generation;
                        (await this.store.put('display', display));
                    }
                (await this.store.put('update', update));
                (await this.store.put('work', work));
                // Store the original validated wire payload, not source materialization, for identical retry identity.
                (await this.saveRequest(principal, input.sessionId, input.requestId, kind, wireInput, update.id));
                await recordDeliveryRequest(this, update, wireInput, kind);
            }));
            this.emit({ type: 'update', sessionId: input.sessionId });
            if (inlineDataset)
                this.emit({ type: 'dataset', sessionId: input.sessionId });
            if (!held)
                this.schedule(work, copy(input), bypassHold);
            return copy(update);
        });
    }
    private schedule(work: Work, input: SubmissionInput, bypassHold: boolean): void {
        this.store.afterCommit(() => {
            const task = new Promise<void>(resolve => setImmediate(resolve)).then(async () => (await this.render(work, input, bypassHold)));
            this.active.add(task);
            void task.finally(() => this.active.delete(task)).catch(() => { });
        });
    }
    private async render(work: Work, input: SubmissionInput, bypassHold: boolean): Promise<void> {
        if (this.closed)
            return;
        const started = performance.now();
        let completedMetrics: UpdateRecord['metrics'];
        let timer: ReturnType<typeof setTimeout> | undefined, cancel: (() => void) | undefined;
        // Called under the write transaction: completion and invalidations cannot
        // race a receiver acknowledgement or resurrect a superseded revision.
        const finish = async (update: UpdateRecord) => {
            update.completedAt = now();
            await this.store.put('update', update);
            if (work.recoverableInput) {
                delete work.recoverableInput;
                await this.store.put('work', work);
            }
            await this.experience.log({ sessionId: input.sessionId, updateId: update.id, requestId: input.requestId, stage: `render.${update.status}`, elapsedMs: performance.now() - started, code: update.errorCode });
            if (update.status === 'prepared') {
                await markDeliveryPush(this, update);
                await this.experience.log({ sessionId: input.sessionId, updateId: update.id, requestId: input.requestId, stage: 'view.pushed' });
                for (const displayId of update.displayIds)
                    this.emit({ type: 'display', sessionId: update.sessionId, displayId, revision: update.revisions[displayId] });
            }
            this.emit({ type: 'update', sessionId: update.sessionId });
        };
        try {
            const claim = await this.store.atomic(async () => {
                const update = await this.store.get<UpdateRecord>('update', work.id);
                if (this.closed || !update || update.status !== 'accepted')
                    return;
                const session = await this.access(work.principal, input.sessionId, 'editor');
                const displays = await asyncMap(input.displayIds, displayId => this.display(work.principal, input.sessionId, displayId, 'editor'));
                const held = !bypassHold && displays.some(d => d.held);
                if (held || session.configRevision !== work.configRevision || displays.some(d => d.generation !== work.generations[d.id])) {
                    update.status = held ? 'held' : 'superseded';
                    await finish(update);
                    return;
                }
                update.status = 'rendering';
                await this.store.put('update', update);
                await this.experience.log({ sessionId: input.sessionId, updateId: work.id, requestId: input.requestId, stage: 'render.started' });
                this.emit({ type: 'update', sessionId: input.sessionId });
                return { session, displays, datasets: await this.store.list<DatasetRecord>('dataset', input.sessionId), assets: await this.store.list<AssetRecord>('asset', input.sessionId) };
            });
            if (!claim || this.closed)
                return;
            const renderer = input.view ? createInterpreter() : this.interpreter;
            // Rendering work is deliberately outside every database transaction.
            const pending = Promise.allSettled(claim.displays.map(display => renderer.interpret({ submission: input, config: claim.session.config, display, datasets: claim.datasets, assets: claim.assets }, (stage, details) => {
                void (async () => {
                    try {
                        if (this.closed)
                            return;
                        await this.access(work.principal, input.sessionId);
                        await this.experience.log({ sessionId: input.sessionId, displayId: display.id, updateId: work.id, requestId: input.requestId, stage, elapsedMs: Math.round((performance.now() - started) * 100) / 100, ...details });
                    }
                    catch { /* Late telemetry cannot outlive authorization. */ }
                })();
            })));
            const interrupted = new Promise<never>((_resolve, reject) => {
                cancel = () => reject(new AppError('RENDER_INTERRUPTED', 'Rendering was interrupted.', 503));
                this.cancelWork.add(cancel);
                timer = setTimeout(() => reject(new AppError('RENDER_TIMEOUT', 'Rendering exceeded its time limit.', 504)), renderer.deadlineMs?.(input) ?? 45000);
                timer.unref();
            });
            const settled = await Promise.race([pending, interrupted]);
            const results: InterpretationResult[] = settled.map(result => result.status === 'fulfilled' ? result.value : { action: 'retain', ...(result.reason instanceof RenderingError ? { metrics: result.reason.metrics } : {}) });
            completedMetrics = renderMetrics(results, input.displayIds, Math.round(performance.now() - started));
            const rejected = settled.find(result => result.status === 'rejected');
            if (rejected?.status === 'rejected')
                throw rejected.reason;
            if (this.closed)
                return;
            await this.store.atomic(async () => {
                const update = await this.store.get<UpdateRecord>('update', work.id);
                if (!update || update.status !== 'rendering')
                    return;
                update.metrics = renderMetrics(results, input.displayIds, Math.round(performance.now() - started));
                const session = await this.access(work.principal, input.sessionId, 'editor');
                const current = await asyncMap(input.displayIds, displayId => this.display(work.principal, input.sessionId, displayId, 'editor'));
                const stale = session.configRevision !== work.configRevision || current.some(d => d.generation !== work.generations[d.id]);
                const held = !bypassHold && current.some(d => d.held);
                if (stale || held)
                    update.status = held ? 'held' : 'superseded';
                else if (results.some(result => result.warnings?.length)) {
                    const failed = results.find(result => result.warnings?.length)!;
                    const error = new RenderingError(failed.failure?.code ?? (typeof failed.metrics?.outcome === 'string' ? failed.metrics.outcome : 'INVALID_SOURCE_CONTENT'), 'The requested view could not be validated.', false, failed.failure?.issues);
                    const safe = safeError(error);
                    update.status = 'failed';
                    update.error = `${safe.message} Previous content is retained.`;
                    update.errorCode = safe.code;
                    if (safe.issues)
                        update.validationIssues = safe.issues;
                    update.diagnosticId = await this.recordFailure("kanvas.submit", input as unknown as Record<string, unknown>, work.principal, error, 'rendering', update.id);
                }
                else if (results.every(result => result.action === 'retain'))
                    update.status = 'retained';
                else {
                    // Validate every view before changing any display; all writes commit together.
                    const views = await asyncMap(results, async (result, index) => result.action === 'retain' ? current[index].view : await this.verifyView(work.principal, input.sessionId, required(result.view, 'Rendering did not return a valid view.')));
                    const checklistCopies = new Map<string, ViewSpec>();
                    for (let index = 0; index < current.length; index++) {
                        const display = current[index];
                        if (results[index].action !== 'retain') {
                            const epoch = work.deckId ? `deck:${work.deckId}` : participationCompatible(display.view, views[index]) ? display.interactionEpoch : id();
                            await this.history.ensure(display);
                            const candidate = views[index], checklistKey = candidate?.template === 'checklist' && !candidate.data.checklistId ? canonical(candidate) : undefined;
                            display.view = checklistKey && checklistCopies.has(checklistKey) ? copy(checklistCopies.get(checklistKey)!) : candidate ? await this.checklists.capture(display.sessionId, candidate) : null;
                            if (checklistKey && display.view)
                                checklistCopies.set(checklistKey, display.view);
                            display.revision++;
                            display.navigationRoot = display.revision;
                            display.zoomRoot = display.revision;
                            display.interactionEpoch = epoch;
                            display.targetAgentId = work.principal.agentId;
                            display.updatedAt = now();
                            display.delivery = { revision: display.revision, status: 'pending', updatedAt: now() };
                            await this.store.put('display', display);
                            await this.history.record(display, input.view ? 'prepared' : 'interpreted');
                        }
                        update.revisions[display.id] = display.revision;
                    }
                    update.status = 'prepared';
                }
                await finish(update);
            });
        }
        catch (error) {
            if (this.closed)
                return;
            await this.store.atomic(async () => {
                const update = await this.store.get<UpdateRecord>('update', work.id);
                if (!update || !['accepted', 'rendering'].includes(update.status))
                    return;
                const safe = safeError(error);
                update.status = 'failed';
                update.error = `${safe.message} The previous view is unchanged.`;
                update.errorCode = safe.code;
                if (safe.issues)
                    update.validationIssues = safe.issues;
                update.metrics ??= completedMetrics ?? { renderMs: Math.round(performance.now() - started) };
                update.diagnosticId = await this.recordFailure("kanvas.submit", input as unknown as Record<string, unknown>, work.principal, error, 'rendering', update.id);
                await finish(update);
            });
        }
        finally {
            if (timer)
                clearTimeout(timer);
            if (cancel)
                this.cancelWork.delete(cancel);
        }
    }
    async clear(principal: AuthPrincipal, sessionId: string, displayIds: string[], requestId: string): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            const payload = { sessionId, displayIds, requestId };
            const retry = (await this.retry<UpdateRecord>(principal, sessionId, requestId, 'clear', payload));
            if (retry)
                return retry;
            const displays = (await asyncMap(displayIds, async (displayId) => (await this.display(principal, sessionId, displayId, 'editor'))));
            const update: UpdateRecord = { id: id(), sessionId, requestId, displayIds, revisions: {}, status: 'prepared', createdAt: now(), completedAt: now() };
            (await this.store.transaction(async () => {
                for (const display of displays) {
                    (await this.history.ensure(display));
                    display.view = null;
                    display.revision++;
                    display.navigationRoot = display.revision;
                    display.zoomRoot = display.revision;
                    display.generation++;
                    display.interactionEpoch = id();
                    delete display.targetAgentId;
                    display.updatedAt = now();
                    display.delivery = { revision: display.revision, status: 'pending', updatedAt: now() };
                    update.revisions[display.id] = display.revision;
                    (await this.store.put('display', display));
                    (await this.history.record(display, 'clear'));
                }
                (await this.store.put('update', update));
                (await this.saveRequest(principal, sessionId, requestId, 'clear', payload, update.id));
            }));
            for (const display of displays)
                this.emit({ type: 'display', sessionId, displayId: display.id, revision: display.revision });
            this.emit({ type: 'update', sessionId });
            return update;
        });
    }
    async applied(principal: AuthPrincipal, sessionId: string, displayId: string, revision: number): Promise<Awaited<DisplayRecord>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, sessionId, displayId));
            this.assertRevision(revision, display.revision);
            const matched = (await this.store.list<UpdateRecord>('update', sessionId)).find(x => x.revisions[displayId] === revision);
            (await this.experience.log({ sessionId, displayId, revision, stage: 'viewer.acknowledged', updateId: matched?.id, requestId: matched?.requestId }));
            if (display.appliedRevision === revision)
                return (await this.publicDisplay(display));
            display.appliedRevision = revision;
            display.delivery = { revision, status: 'applied', updatedAt: now(), lastGoodRevision: revision };
            (await this.store.put('display', display));
            for (const update of (await this.store.list<UpdateRecord>('update', sessionId)))
                if (update.status === 'prepared' && update.revisions[displayId] === revision) {
                    const acknowledged = (await asyncEvery(update.displayIds, async (key) => { const d = (await this.store.get<StoredDisplay>('display', key)); return d && d.revision === update.revisions[key] && d.appliedRevision === update.revisions[key]; }));
                    if (acknowledged) {
                        update.status = 'applied';
                        update.metrics = { ...update.metrics, appliedAfterMs: Date.now() - Date.parse(update.createdAt) };
                        (await this.store.put('update', update));
                    }
                }
            this.emit({ type: 'update', sessionId, displayId, revision });
            return (await this.publicDisplay(display));
        });
    }
    /** A browser failure is observable without falsely turning preparation into application. */
    async reportDelivery(principal: AuthPrincipal, sessionId: string, displayId: string, raw: unknown): Promise<Awaited<DisplayRecord>> {
        return this.store.atomic(async () => {
            const input = z.object({ revision: revisionSchema, status: z.literal('failed'), code: z.enum(MEDIA_FAILURE_CODES).optional(), lastGoodRevision: revisionSchema.optional() }).strict().parse(raw);
            const display = (await this.display(principal, sessionId, displayId));
            this.assertRevision(input.revision, display.revision);
            // A successful browser observation is not erased by another device's failure.
            if (display.appliedRevision !== display.revision) {
                display.delivery = { revision: display.revision, status: 'failed', updatedAt: now(), ...(input.code ? { code: input.code } : {}), message: `${input.code ? MEDIA_FAILURES[input.code] : 'A viewer could not render this revision.'} That viewer retains its last successfully rendered content.`, ...(input.lastGoodRevision !== undefined && input.lastGoodRevision < display.revision ? { lastGoodRevision: input.lastGoodRevision } : {}) };
                (await this.store.put('display', display));
                this.emit({ type: 'update', sessionId, displayId, revision: display.revision });
            }
            return (await this.publicDisplay(display, principal));
        });
    }
    async updateDelivery(update: UpdateRecord): Promise<Awaited<UpdateRecord>> {
        if (!Object.keys(update.revisions).length)
            return update;
        const delivery: NonNullable<UpdateRecord['delivery']> = {};
        for (const displayId of update.displayIds) {
            const display = (await this.store.get<StoredDisplay>('display', displayId)), revision = update.revisions[displayId];
            const waitedMs = Math.max(0, Date.now() - Date.parse(update.completedAt ?? update.createdAt));
            delivery[displayId] = !display || display.revision !== revision ? { status: 'superseded', revision }
                : display.appliedRevision === revision ? { status: 'applied', revision, ...((['iframe', 'website'].includes(displayedLeaf(display.view)?.template ?? '') || (displayedLeaf(display.view)?.template === 'web' && displayedLeaf(display.view)?.data.embed === true)) ? { message: 'The KANVAS frame container is rendered; remote website content remains unverified.' } : {}) }
                    : display.delivery?.revision === revision && display.delivery.status === 'failed' ? { status: 'failed', revision, message: display.delivery.message, ...(display.delivery.code ? { code: display.delivery.code } : {}) }
                        : !display.online ? { status: 'offline', revision, waitedMs, message: 'No viewer is connected. Open the authenticated display URL to apply this frame.' }
                            : waitedMs >= 30000 ? { status: 'timed_out', revision, waitedMs, message: 'No browser render acknowledgement within 30 seconds. The tab may be backgrounded or its renderer failed; inspect the display or request a snapshot.' }
                                : { status: 'pending', revision, waitedMs };
        }
        return { ...update, delivery };
    }
    async displayHistory(principal: AuthPrincipal, sessionId: string, displayId: string) {
        (await this.fullAccount(principal));
        return (await this.history.list((await this.display(principal, sessionId, displayId))));
    }
    async navigate(principal: AuthPrincipal, input: {
        sessionId: string;
        displayIds: string[];
        requestId: string;
        expectedRevisions: Record<string, number>;
        direction?: 'back' | 'forward';
        revision?: number;
    }): Promise<Awaited<UpdateRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, input.sessionId, 'editor'));
            const retry = (await this.retry<UpdateRecord>(principal, input.sessionId, input.requestId, 'navigate', input));
            if (retry)
                return retry;
            const targets = (await asyncMap(input.displayIds, async (displayId) => {
                const display = (await this.display(principal, input.sessionId, displayId, 'editor'));
                this.assertRevision(input.expectedRevisions[displayId], display.revision);
                const target = (await this.history.target(display, input.direction, input.revision));
                return { display, ...target, view: target.entry.view ? (await this.verifyView(principal, input.sessionId, target.entry.view)) : null };
            }));
            const update: UpdateRecord = { id: id(), sessionId: input.sessionId, requestId: input.requestId, displayIds: input.displayIds, revisions: {}, status: 'prepared', createdAt: now(), completedAt: now(), metrics: { path: 'direct', renderMs: 0 } };
            (await this.store.transaction(async () => {
                for (const { display, cursor, view, entry } of targets) {
                    (await this.history.ensure(display));
                    display.view = view ? await this.checklists.restoreSnapshot(display.sessionId, view) : null;
                    display.revision++;
                    display.generation++;
                    display.navigationRoot = display.revision;
                    display.zoomRoot = entry.zoomRoot ?? entry.revision;
                    display.interactionEpoch = entry.interactionEpoch ?? id();
                    display.targetAgentId = principal.agentId;
                    display.updatedAt = now();
                    display.delivery = { revision: display.revision, status: 'pending', updatedAt: now() };
                    update.revisions[display.id] = display.revision;
                    (await this.store.put('display', display));
                    (await this.history.moved(display, cursor));
                }
                (await this.store.put('update', update));
                (await this.saveRequest(principal, input.sessionId, input.requestId, 'navigate', input, update.id));
            }));
            for (const { display } of targets)
                this.emit({ type: 'display', sessionId: input.sessionId, displayId: display.id, revision: display.revision });
            this.emit({ type: 'update', sessionId: input.sessionId });
            return update;
        });
    }
    async videoControl(principal: AuthPrincipal, input: {
        sessionId: string;
        displayId: string;
        requestId: string;
        expectedRevision?: number;
        command: unknown;
    }) {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, input.sessionId, input.displayId, 'editor'));
            const identity = this.identity(principal), prior = (await this.store.db.prepare('SELECT digest,result_id,kind FROM requests WHERE session_id=? AND principal=? AND request_id=?').get(input.sessionId, identity, input.requestId)) as RequestRecord | undefined;
            if (prior) {
                if (prior.kind !== 'video-command' || prior.digest !== hash(canonical(input)))
                    throw new AppError('REQUEST_ID_CONFLICT', 'This request ID was used for different content.', 409);
                return required((await this.video.get(display, prior.result_id)));
            }
            this.assertRevision(input.expectedRevision, display.revision);
            let command!: Awaited<ReturnType<VideoControls['create']>>;
            (await this.store.transaction(async () => { command = (await this.video.create(display, input.requestId, input.command)); (await this.saveRequest(principal, input.sessionId, input.requestId, 'video-command', input, command.id)); }));
            this.emit({ type: 'display', sessionId: input.sessionId, displayId: display.id, revision: display.revision });
            return command;
        });
    }
    async videoAcknowledge(principal: AuthPrincipal, sessionId: string, displayId: string, commandId: string, raw: unknown) {
        const display = (await this.display(principal, sessionId, displayId));
        const result = (await this.video.acknowledge(display, commandId, raw));
        this.emit({ type: 'update', sessionId, displayId });
        return result;
    }
    async respond(principal: AuthPrincipal, sessionId: string, displayId: string, raw: unknown): Promise<Awaited<InteractionRecord>> {
        return this.store.atomic(async () => {
            const input = z.object({ revision: revisionSchema, requestId: z.string().min(1).max(128), value: z.record(z.string(), z.unknown()) }).strict().parse(raw);
            (await this.access(principal, sessionId));
            if (principal.captureOnly || principal.scopedSessionId && !principal.interactive)
                throw new AppError('FORBIDDEN', 'This screen has read-only access.', 403);
            try {
                assertJsonBudget(input.value, 32000);
            }
            catch {
                throw new AppError('INVALID_RESPONSE', 'The response exceeds its supported size.');
            }
            const payload = { displayId, ...input }, duplicate = (await this.retry<InteractionRecord>(principal, sessionId, input.requestId, 'interaction', payload));
            if (duplicate)
                return duplicate;
            const display = (await this.display(principal, sessionId, displayId));
            this.assertRevision(input.revision, display.revision);
            if (input.value.kind !== 'satisfaction.rate' && (await this.store.list<InteractionRecord>('interaction', sessionId)).filter(record => record.status === 'pending').length >= 1000)
                throw new AppError('INBOX_FULL', 'This session has too many pending actions.', 429);
            const leaf = required(displayedLeaf(display.view)), value = input.value;
            let actionId = String(value.kind), response: unknown, nextView: ViewSpec | undefined;
            if (value.kind === 'satisfaction.rate' && leaf.template === 'satisfaction') {
                response = await acceptSatisfaction(this.store, sessionId, displayId, principal.participantId ?? principal.userId, leaf, value);
            }
            else if (value.kind === 'scoreboard.adjust' && leaf.template === 'scoreboard') {
                const command = z.object({ kind: z.literal('scoreboard.adjust'), sideId: z.string().max(128), action: z.enum(['increase', 'decrease', 'set']), score: z.union([z.number().finite(), z.string().max(120)]).optional() }).strict().parse(value);
                const data = scoreboardDataSchema.parse(leaf.data), side = required(data.sides.find(x => x.id === command.sideId), 'That scoreboard side is unavailable.');
                if (!data.interactive || command.action === 'set')
                    (await this.access(principal, sessionId, 'editor'));
                if (command.action === 'set') {
                    if (command.score === undefined)
                        throw new AppError('INVALID_SCORE', 'Set requires a score.');
                    side.score = command.score;
                }
                else {
                    if (typeof side.score !== 'number' || !Number.isFinite(side.score) || Math.abs(side.score) > Number.MAX_SAFE_INTEGER)
                        throw new AppError('NON_NUMERIC_SCORE', 'Plus/minus requires a numeric score within the safe range. Set text scores explicitly.');
                    const result = side.score + (command.action === 'increase' ? data.step : -data.step);
                    if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER)
                        throw new AppError('SCORE_RANGE', 'The resulting score is outside the supported numeric range.');
                    side.score = result;
                }
                response = { sideId: side.id, score: side.score };
                nextView = replaceLeaf(display.view!, data);
            }
            else if (value.kind === 'log.inspect' && leaf.template === 'log') {
                const input = z.object({ kind: z.literal('log.inspect'), line: z.number().int().positive() }).strict().parse(value);
                const entry = required(logEntries(leaf.data as LogData).find(e => e.line === input.line), 'This log line is unavailable.');
                response = { line: entry.line, timestamp: entry.timestamp, level: entry.level, message: entry.message, annotation: entry.annotation };
            }
            else if (value.kind === 'drafting.select' && leaf.template === 'drafting') {
                response = draftingSelectionFeedback(display.view!, value);
            }
            else if (value.kind === 'checklist.toggle' && leaf.template === 'checklist') {
                const toggle = z.object({ kind: z.literal('checklist.toggle'), itemId: z.string().min(1).max(128), checked: z.boolean() }).strict().parse(value);
                // A narrow checkbox intent can rebase onto the latest document without
                // resubmitting stale sibling items. Full-data edits still require CAS.
                const latest = await this.checklists.latestView(sessionId, leaf), items = structuredClone(latest.data.items) as {
                    id: string;
                    checked: boolean;
                }[], item = items.find(item => item.id === toggle.itemId);
                if (item) {
                    item.checked = toggle.checked;
                    response = { itemId: item.id, checked: item.checked };
                }
                else
                    response = { itemId: toggle.itemId, applied: false, reason: 'Item was removed; the latest saved checklist is now shown.' };
                const updated = { ...latest, data: { ...latest.data, items } };
                nextView = display.view!.template === 'presentation' ? { ...display.view!, data: { ...display.view!.data, slides: (display.view!.data.slides as ViewSpec[]).map((slide, index) => index === Number(display.view!.data.index ?? 0) ? updated : slide) } } : updated;
            }
            else if (value.kind === 'planner.review' && leaf.template === 'planner') {
                const decision = z.object({ kind: z.literal('planner.review'), proposalId: z.string().min(1).max(128), decision: z.enum(['accept', 'reject', 'change']), comment: z.string().max(500).optional() }).strict().parse(value);
                const data = plannerDataSchema.parse(leaf.data), proposal = required(data.proposals.find(entry => entry.id === decision.proposalId), 'This proposal is no longer pending.');
                if (decision.decision === 'change')
                    response = { proposalId: proposal.id, decision: 'change', ...(decision.comment ? { comment: decision.comment } : {}), note: "The viewer asked for another option. Propose an alternative with kanvas_call with operationId:\"kanvas.planner.propose\" and arguments:{\u2026}; reusing this proposal id replaces it." };
                else {
                    (await this.access(principal, sessionId, 'editor'));
                    const reviewed = reviewPlanner(data, new Set(decision.decision === 'accept' ? [proposal.id] : []), new Set(decision.decision === 'reject' ? [proposal.id] : []));
                    response = { proposalId: proposal.id, decision: decision.decision, remaining: reviewed.data.proposals.length, conflicts: plannerConflicts(reviewed.data.items).length };
                    nextView = replaceLeaf(display.view!, reviewed.data);
                }
            }
            else if (value.kind === 'presentation.navigate' && display.view?.template === 'presentation') {
                (await this.access(principal, sessionId, 'editor'));
                const cue = z.object({ kind: z.literal('presentation.navigate'), index: z.number().int().min(0).max(63) }).strict().parse(value);
                nextView = { ...display.view, data: { ...display.view.data, index: cue.index } };
                response = { index: cue.index };
            }
            else if (value.kind === 'procedure.navigate' && ['procedure', 'recipe'].includes(leaf.template)) {
                (await this.access(principal, sessionId, 'editor'));
                const command = z.object({ kind: z.literal('procedure.navigate'), action: z.enum(PROCEDURE_ACTIONS) }).strict().parse(value);
                const data = advanceProcedure(leaf, command.action);
                nextView = replaceLeaf(display.view!, data);
                response = { action: command.action, index: data.index, stage: data.stage, total: (data.steps as string[]).length };
            }
            else if (value.kind === 'settings.request' && leaf.template === 'settings') {
                const request = z.object({ kind: z.literal('settings.request'), config: configPatchSchema, expectedConfigRevision: revisionSchema }).strict().parse(value);
                const session = (await this.access(principal, sessionId));
                this.assertRevision(request.expectedConfigRevision, session.configRevision);
                response = { config: request.config, baseConfigRevision: session.configRevision, applied: false, note: 'Viewer proposal. An authorized editor or owner must apply it.' };
            }
            else if (!['form.submit', 'poll.vote', 'qa.submit'].includes(actionId) || leaf.template !== actionId.split('.')[0])
                throw new AppError('INVALID_RESPONSE', 'This response does not match the displayed control.');
            if (nextView)
                nextView = (await this.verifyView(principal, sessionId, nextView));
            const interaction: InteractionRecord = { id: id(), sessionId, displayId, revision: input.revision, actionId, value: null, userId: principal.participantId ?? principal.userId, targetAgentId: display.targetAgentId, status: actionId === 'satisfaction.rate' ? 'acknowledged' : 'pending', createdAt: now() };
            (await this.store.transaction(async () => {
                if (!nextView && response === undefined) {
                    const accepted = (await this.engagement.submit(display, principal.participantId ?? principal.userId, value));
                    actionId = accepted.actionId;
                    response = accepted.value;
                }
                if (nextView) {
                    (await this.history.ensure(display));
                    display.zoomRoot ??= display.navigationRoot ?? display.revision;
                    display.navigationRoot ??= display.revision;
                    display.view = await this.checklists.capture(display.sessionId, nextView);
                    display.revision++;
                    display.generation++;
                    display.updatedAt = now();
                    (await this.store.put('display', display));
                    (await this.history.record(display, actionId));
                }
                if (leaf.template === 'satisfaction' && actionId === 'satisfaction.rate') {
                    const accepted = response as {
                        surveyId: string;
                        rating: number;
                        levels: number;
                    };
                    await this.store.put('satisfaction-response', { id: interaction.id, sessionId, displayId, ...accepted, createdAt: interaction.createdAt });
                }
                interaction.actionId = actionId;
                interaction.value = response;
                (await this.store.put('interaction', interaction));
                (await this.saveRequest(principal, sessionId, input.requestId, 'interaction', payload, interaction.id));
            }));
            this.emit({ type: 'interaction', sessionId, displayId });
            this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            return interaction;
        });
    }
    async connectDisplay(principal: AuthPrincipal, sessionId: string, displayId: string): Promise<Awaited<() => Promise<Awaited<void>>>> {
        return this.store.atomic(async () => {
            const display = (await this.display(principal, sessionId, displayId));
            this.presence.set(displayId, (this.presence.get(displayId) ?? 0) + 1);
            if (!display.online) {
                display.online = true;
                (await this.store.put('display', display));
                this.emit({ type: 'display', sessionId, displayId, revision: display.revision });
            }
            let disconnected = false;
            return async () => {
                // This callback runs after the original connect transaction has ended.
                // Serialize its read with the write: a stale presence snapshot must never
                // erase a concurrent lockdown, publication or other display configuration.
                if (disconnected || this.closed)
                    return;
                disconnected = true;
                await this.store.atomic(async () => {
                    const n = Math.max(0, (this.presence.get(displayId) ?? 1) - 1);
                    this.presence.set(displayId, n);
                    if (n === 0) {
                        const current = await this.store.get<StoredDisplay>('display', displayId);
                        if (current) {
                            current.online = false;
                            await this.store.put('display', current);
                            this.emit({ type: 'display', sessionId, displayId, revision: current.revision });
                        }
                    }
                });
            };
        });
    }
    async interact(principal: AuthPrincipal, sessionId: string, raw: unknown): Promise<Awaited<InteractionRecord>> {
        return this.store.atomic(async () => {
            const input = z.strictObject({ displayId: z.string().min(1).max(128), revision: revisionSchema, actionId: z.string().min(1).max(128), value: z.unknown(), requestId: z.string().min(1).max(128) }).parse(raw);
            (await this.access(principal, sessionId));
            if (principal.captureOnly || principal.scopedSessionId && !principal.interactive)
                throw new AppError('FORBIDDEN', 'This screen has view-only access.', 403);
            try {
                assertJsonBudget(input.value, 16000);
            }
            catch {
                throw new AppError('INVALID_ACTION_VALUE', 'The action value exceeds its size or complexity limit.');
            }
            const duplicate = (await this.retry<InteractionRecord>(principal, sessionId, input.requestId, 'interaction', input));
            if (duplicate)
                return duplicate;
            const display = (await this.display(principal, sessionId, input.displayId));
            if (['email', 'inbox', 'chat'].includes(displayedLeaf(display.view)?.template ?? ''))
                throw new AppError('READ_ONLY_VIEW', 'This message view is read-only. Compose in drafting; the agent sends through its messaging connector.', 403);
            this.assertRevision(input.revision, display.revision);
            const action = required(displayedLeaf(display.view)?.actions?.find(a => a.id === input.actionId), 'This control is no longer available.');
            if ((action.kind === 'choice' && (typeof input.value !== 'string' || !action.options?.includes(input.value))) || (action.kind === 'input' && (typeof input.value !== 'string' || input.value.length > 4000)) || (action.kind === 'button' && input.value !== true && input.value !== null))
                throw new AppError('INVALID_ACTION_VALUE', 'This value is not supported by the displayed control.');
            if ((await this.store.list<InteractionRecord>('interaction', sessionId)).filter(i => i.status === 'pending').length >= 1000)
                throw new AppError('INBOX_FULL', 'This session has too many pending actions.', 429);
            const interaction: InteractionRecord = { id: id(), sessionId, displayId: input.displayId, revision: input.revision, actionId: input.actionId, value: input.value, userId: principal.participantId ?? principal.userId, targetAgentId: display.targetAgentId, status: 'pending', createdAt: now() };
            (await this.store.transaction(async () => { (await this.store.put('interaction', interaction)); (await this.saveRequest(principal, sessionId, input.requestId, 'interaction', input, interaction.id)); }));
            this.emit({ type: 'interaction', sessionId, displayId: input.displayId });
            return interaction;
        });
    }
    async interactions(principal: AuthPrincipal, sessionId: string, status = 'pending', limit = 25, after?: string) {
        const session = (await this.access(principal, sessionId));
        if (principal.scopedSessionId)
            return { interactions: [] as InteractionRecord[] };
        const items = (await this.store.list<InteractionRecord>('interaction', sessionId)).filter(i => (session.role !== 'viewer' || i.userId === principal.userId) && (!principal.agentId || !i.targetAgentId || i.targetAgentId === principal.agentId) && (status === 'all' || i.status === status));
        const offset = after ? items.findIndex(i => i.id === after) + 1 : 0;
        if (after && !offset)
            throw new AppError('INVALID_CURSOR', 'Read the inbox again without a cursor.');
        const interactions = items.slice(offset, offset + limit);
        return { interactions, ...(offset + limit < items.length && interactions.length ? { nextCursor: interactions.at(-1)!.id } : {}) };
    }
    async acknowledge(principal: AuthPrincipal, sessionId: string, interactionId: string): Promise<Awaited<InteractionRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            const item = required((await this.store.get<InteractionRecord>('interaction', interactionId)));
            if (item.sessionId !== sessionId || (principal.agentId && item.targetAgentId && item.targetAgentId !== principal.agentId))
                throw new AppError('NOT_FOUND', 'This action is unavailable.', 404);
            item.status = 'acknowledged';
            (await this.store.put('interaction', item));
            this.emit({ type: 'interaction', sessionId, displayId: item.displayId });
            return item;
        });
    }
    async addMember(principal: AuthPrincipal, sessionId: string, username: string, role: 'viewer' | 'editor'): Promise<Awaited<Member>> {
        return this.store.atomic(async () => {
            await this.auth.requireFresh(principal);
            const session = (await this.access(principal, sessionId, 'owner'));
            const row = (await this.store.db.prepare('SELECT id FROM users WHERE username=?').get(username.trim().toLowerCase())) as {
                id: string;
            } | undefined;
            const user = required(row && (await this.auth.user(row.id)), 'That account is unavailable.');
            if (user.id === session.ownerId)
                throw new AppError('OWNER_ROLE', 'The owner role cannot be changed.');
            (await this.store.db.prepare('INSERT INTO members VALUES(?,?,?) ON CONFLICT(session_id,user_id) DO UPDATE SET role=excluded.role').run(sessionId, user.id, role));
            (await this.accounts.audit('session.member.changed', { actorId: principal.userId, subjectId: user.id, sessionId, details: { role } }));
            await this.monitoring.reconcileSession(sessionId);
            this.emit({ type: 'membership', sessionId });
            return { userId: user.id, username: user.username, displayName: user.displayName, role };
        });
    }
    async removeMember(principal: AuthPrincipal, sessionId: string, userId: string): Promise<Awaited<{
        removed: true;
    }>> {
        return this.store.atomic(async () => {
            await this.auth.requireFresh(principal);
            const session = (await this.access(principal, sessionId, 'owner'));
            if (userId === session.ownerId)
                throw new AppError('OWNER_ROLE', 'The session owner cannot be removed.');
            (await this.store.db.prepare('DELETE FROM members WHERE session_id=? AND user_id=?').run(sessionId, userId));
            (await this.accounts.audit('session.member.removed', { actorId: principal.userId, subjectId: userId, sessionId }));
            await this.monitoring.reconcileSession(sessionId);
            this.emit({ type: 'membership', sessionId });
            return { removed: true };
        });
    }
    async dataset(principal: AuthPrincipal, sessionId: string, input: DatasetInput): Promise<Awaited<DatasetRecord>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            if ((await this.store.list('dataset', sessionId)).length >= 100)
                throw new AppError('LIMIT_REACHED', 'This session has reached its dataset limit.', 429);
            const { summary: _summary, ...parsed } = parseDataset(input);
            const dataset: DatasetRecord = { ...parsed, id: id(), sessionId, createdAt: now() };
            (await this.store.transaction(async () => { (await this.store.put('dataset', dataset)); (await this.store.put('dataset-summary', datasetSummary(dataset))); }));
            this.emit({ type: 'dataset', sessionId });
            return dataset;
        });
    }
    async readDataset(principal: AuthPrincipal, sessionId: string, datasetId: string): Promise<Awaited<DatasetRecord>> {
        (await this.fullAccount(principal));
        (await this.access(principal, sessionId));
        const dataset = required((await this.store.get<DatasetRecord>('dataset', datasetId)));
        if (dataset.sessionId !== sessionId)
            throw new AppError('NOT_FOUND', 'This dataset is unavailable.', 404);
        return dataset;
    }
    async importAsset(principal: AuthPrincipal, sessionId: string, input: MediaInput): Promise<Awaited<AssetRecord>> {
        (await this.access(principal, sessionId, 'editor'));
        return (await this.storeMedia(sessionId, input));
    }
    /** Only trusted derivative capture bytes may use this path without publishing permission. */
    private async storeMedia(sessionId: string, input: MediaInput): Promise<Awaited<AssetRecord>> {
        return this.store.atomic(async () => {
            const media = validateMedia(input);
            if ((await this.store.list<AssetRecord>('asset', sessionId)).reduce((n, a) => n + a.size, 0) + media.size > 200 * 1024 * 1024)
                throw new AppError('LIMIT_REACHED', 'This session has reached its media storage limit.', 429);
            const assetId = id();
            const asset: AssetRecord = { id: assetId, sessionId, name: media.name, mimeType: media.mimeType, size: media.size, url: `/api/assets/${assetId}`, createdAt: now() };
            (await this.store.transaction(async () => { (await this.store.put('asset', asset)); (await this.store.db.prepare('INSERT INTO assets VALUES(?,?)').run(asset.id, media.bytes)); }));
            this.emit({ type: 'asset', sessionId });
            return asset;
        });
    }
    async asset(principal: AuthPrincipal, assetId: string, sessionId?: string): Promise<Awaited<AssetRecord>> {
        const asset = required((await this.store.get<AssetRecord>('asset', assetId)));
        if (sessionId && asset.sessionId !== sessionId)
            throw new AppError('NOT_FOUND', 'This asset is unavailable.', 404);
        (await this.access(principal, asset.sessionId));
        if (principal.scopedDisplayId && !(await pairedDisplayAllowsAsset(this.store, principal, asset)))
            throw new AppError('NOT_FOUND', 'This asset is unavailable to this screen.', 404);
        return asset;
    }
    async deleteContent(principal: AuthPrincipal, sessionId: string, kind: 'dataset' | 'asset', contentId: string): Promise<Awaited<{
        deleted: true;
    }>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            const content = required((await this.store.get<{
                sessionId: string;
            }>(kind, contentId)));
            if (content.sessionId !== sessionId)
                throw new AppError('NOT_FOUND', 'This content is unavailable.', 404);
            (await this.store.transaction(async () => {
                (await this.store.delete(kind, contentId));
                if (kind === 'dataset')
                    (await this.store.delete('dataset-summary', contentId));
                if (kind === 'asset') {
                    (await this.store.db.prepare('DELETE FROM assets WHERE id=?').run(contentId));
                    (await this.store.delete('capture-asset', contentId));
                }
            }));
            this.emit({ type: kind, sessionId });
            return { deleted: true };
        });
    }
    async createDeck(principal: AuthPrincipal, sessionId: string, name: string, slides: ViewSpec[], cue?: {
        instructions?: string;
        cardInstructions?: string[];
        mirrored?: boolean | 'vertical' | 'horizontal' | 'both';
    }): Promise<Awaited<Deck>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'editor'));
            if ((await this.store.list('deck', sessionId)).length >= 100)
                throw new AppError('LIMIT_REACHED', 'This session has reached its saved-deck limit.', 429);
            if (slides.length > 64 || slides.some(s => s.template === 'presentation'))
                throw new AppError('INVALID_DECK', 'Use 1–64 ordinary template slides; nested presentations are not supported.');
            const deck = { ...cue, id: id(), sessionId, name, slides: (await asyncMap(slides, async (slide) => (await this.verifyView(principal, sessionId, slide)))), createdAt: now() };
            (await this.store.put('deck', deck));
            return deck;
        });
    }
    async decks(principal: AuthPrincipal, sessionId: string): Promise<Awaited<Deck[]>> {
        (await this.access(principal, sessionId));
        if (principal.scopedSessionId)
            throw new AppError('FORBIDDEN', 'This screen has view-only access.', 403);
        return (await this.store.list<Deck>('deck', sessionId));
    }
    async cue(principal: AuthPrincipal, sessionId: string, deckId: string, index: number, displayIds: string[], requestId: string): Promise<Awaited<UpdateRecord>> {
        (await this.access(principal, sessionId, 'editor'));
        const deck = required((await this.store.get<Deck>('deck', deckId)));
        if (deck.sessionId !== sessionId)
            throw new AppError('NOT_FOUND', 'This deck is unavailable.', 404);
        required(deck.slides[index], 'This slide is unavailable.');
        const view: ViewSpec = { version: 1, template: 'presentation', title: deck.name, data: { slides: deck.slides, index, ...(deck.instructions || deck.cardInstructions ? { cueMode: true } : {}), ...(deck.mirrored ? { mirrored: deck.mirrored } : {}) } };
        return (await this.submit(principal, { sessionId, displayIds, requestId, intent: `Cue saved deck ${deckId}, slide ${index}`, view }, 'cue', true, deckId));
    }
    async end(principal: AuthPrincipal, sessionId: string): Promise<Awaited<{
        ended: true;
    }>> {
        return this.store.atomic(async () => {
            (await this.access(principal, sessionId, 'owner'));
            const session = required((await this.store.get<SessionRecord>('session', sessionId)));
            session.endedAt = now();
            session.updatedAt = now();
            (await this.store.put('session', session));
            (await this.accounts.audit('session.ended', { actorId: principal.userId, sessionId }));
            await this.monitoring.cancelSession(sessionId);
            this.emit({ type: 'ended', sessionId });
            return { ended: true };
        });
    }
    async readResource(uri: string, principal: AuthPrincipal): Promise<unknown> {
        if (uri === 'kanvas://start')
            return (await this.startPage(principal));
        if (uri === 'kanvas://help')
            return helpFor('orientation', this.publicUrl);
        if (uri === 'kanvas://sessions')
            return (await this.sessions(principal));
        const match = /^kanvas:\/\/sessions\/([A-Za-z0-9_-]+)\/(state|config|interactions|reports)$/.exec(uri);
        if (!match)
            throw new AppError('NOT_FOUND', 'This resource is unavailable.', 404);
        if (match[2] === 'state')
            return (await this.detail(principal, match[1]));
        if (match[2] === 'interactions')
            return (await this.interactions(principal, match[1]));
        if (match[2] === 'reports')
            return (await this.reports.read(principal, { sessionId: match[1], allAccounts: false, status: 'all', kind: 'all', limit: 10 }));
        const session = (await this.access(principal, match[1]));
        return { sessionId: session.id, config: session.config, revision: session.configRevision };
    }
    async listResources(principal: AuthPrincipal): Promise<McpResourceDescriptor[]> {
        return [{ uri: 'kanvas://start', name: 'Account start page · recent sessions', mimeType: 'application/json' }, { uri: 'kanvas://help', name: 'Kanvas Help and public documentation', mimeType: 'application/json' }, { uri: 'kanvas://sessions', name: 'Accessible KANVAS sessions', mimeType: 'application/json' }, ...(await this.sessions(principal)).flatMap(s => ['state', 'config', 'interactions', 'reports'].map(kind => ({ uri: `kanvas://sessions/${s.id}/${kind}`, name: `${s.name}: ${kind}`, mimeType: 'application/json' })))];
    }
    async resolveIntent(principal: AuthPrincipal, args: unknown) { return this.store.snapshot(() => resolveIntent(this, principal, args)); }
    async agentGuidance(principal: AuthPrincipal, args?: unknown) { return this.guidance.exposure(principal, args); }
    async argumentError(name: string, raw: Record<string, unknown>, principal: AuthPrincipal, error: unknown): Promise<unknown> {
        const definition = MCP_TOOLS.find(t => t.name === name), parsed = definition?.schema.safeParse(raw);
        if (parsed && !parsed.success) {
            const issue = parsed.error.issues.find(i => (i.path.length === 1 && /^expected(?:Revision|Version|DeckRevision|DraftRevision)$/.test(String(i.path[0]))) || (i.path.length === 2 && i.path[0] === 'expectedRevisions'));
            if (issue) {
                const field = String(issue.path[0]), current = await revisionContext(this, principal, name, field === 'expectedRevisions' ? { ...raw, displayId: issue.path[1] } : raw, field);
                if (current !== undefined)
                    return Object.assign(new AppError('INVALID_ARGUMENT', (field === 'expectedRevisions' ? 'Each expectedRevisions entry' : field) + ' must be a non-negative integer. Current revision is ' + current + '; omit this guard to apply to current state.'), { currentRevision: current });
            }
        }
        return error;
    }
    async execute(name: string, raw: unknown, principal: AuthPrincipal): Promise<unknown> {
        attribute(principal);
        const event = eventContext.getStore();
        if (event) {
            event.client = { ...event.client, ...currentToolContext()?.inferred };
            for (const key of ['sessionId', 'displayId'] as const)
                if (raw && typeof raw === 'object' && key in raw && typeof (raw as Record<string, unknown>)[key] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test((raw as Record<string, string>)[key]))
                    event[key] = (raw as Record<string, string>)[key];
        }
        if (event?.sessionId) {
            const context = currentToolContext(), connection = context?.connectionId ?? principal.agentId ?? principal.tokenId ?? 'direct';
            const known = await this.store.get<AgentConnection>('agent-connection', hash(`${principal.userId}:${event.sessionId}:${connection}`));
            if (known)
                event.client = { ...event.client, selfReported: Object.fromEntries(Object.entries(known.selfReported).filter(([key]) => ['agent', 'model', 'harness', 'effort_or_mode', 'interaction_mode', 'device'].includes(key))), contextVerified: false };
        }
        const definition = MCP_TOOLS.find(tool => tool.name === name);
        if (!definition)
            throw new AppError('UNKNOWN_TOOL', 'This operation is unavailable.', 404);
        // Each operation shares the published runtime schema; all casts follow this validation.
        const parsed = definition.schema.safeParse(raw);
        if (!parsed.success) {
            const invalidGuard = parsed.error.issues.find(i => (i.path.length === 1 && /^expected(?:Revision|Version|DeckRevision|DraftRevision)$/.test(String(i.path[0]))) || (i.path.length === 2 && i.path[0] === 'expectedRevisions'));
            if (invalidGuard && raw && typeof raw === 'object') {
                const field = String(invalidGuard.path[0]), current = await revisionContext(this, principal, name, field === 'expectedRevisions' ? { ...raw, displayId: invalidGuard.path[1] } : raw as Record<string, unknown>, field);
                if (current !== undefined)
                    throw Object.assign(new AppError('INVALID_ARGUMENT', (field === 'expectedRevisions' ? 'Each expectedRevisions entry' : field) + ' must be a non-negative integer. Current revision is ' + current + '; omit the guard to apply to current state.'), { currentRevision: current });
            }
            throw toolArgumentError(name, raw) ?? new InputError();
        }
        const a = parsed.data as Record<string, never>;
        if (venueTools.some(t => t.name === name))
            return venueUpdate(this, principal, name, a);
        if (name.startsWith('kanvas.account.templates.'))
            return this.customTemplates.execute(principal, name, a);
        if (name === "kanvas.media.list") {
            const all = await this.mediaLibrary.list(principal, a.query, a.tag), offset = Number(a.offset ?? 0), limit = Number(a.limit ?? 50);
            return { media: all.slice(offset, offset + limit), total: all.length, ...(offset + limit < all.length ? { nextOffset: offset + limit } : {}) };
        }
        if (name === "kanvas.media.import")
            return this.mediaLibrary.importAsset(principal, a.sessionId, a.assetId, a.tags);
        if (name === "kanvas.media.get")
            return this.mediaLibrary.own(principal, a.mediaId);
        switch (name) {
            case "kanvas.archive.list": return this.archive.list(principal, a);
            case "kanvas.archive.manage": return this.archive.manage(principal, a);
            case "kanvas.pointing.configure": return (await this.pointing.configure(principal, a));
            case "kanvas.pointing.read": return (await this.pointing.read(principal, a));
            case "kanvas.autoplay.control": return (await this.autoplay.control(principal, a));
            case "kanvas.autoplay.read": return (await this.autoplay.read(principal, a));
            case "kanvas.tool.log.append": return (await this.toolLog.append(principal, a));
            case "kanvas.tool.log.read": return (await this.toolLog.read(principal, a));
            case "kanvas.session.public.access": return (await setPublicAccess(this, principal, a));
            case "kanvas.scoreboard.control":
                (await this.access(principal, a.sessionId, 'editor'));
                return (await this.respond(principal, a.sessionId, a.displayId, { revision: a.expectedRevision ?? (await this.display(principal, a.sessionId, a.displayId, 'editor')).revision, requestId: a.requestId, value: { kind: 'scoreboard.adjust', sideId: a.sideId, action: a.action, ...(a.score !== undefined ? { score: a.score } : {}) } }));
            case "kanvas.diagnostics.read": return this.diagnostics.read(principal, a);
            case "kanvas.friction.read": return this.friction.read(principal, a);
            case "kanvas.agents.read": return this.agents.read(principal, a);
            case "kanvas.agents.revoke": return this.agents.revoke(principal, a);
            case "kanvas.tasklist.read": return this.taskLists.read(principal, a);
            case "kanvas.tasklist.update": return this.taskLists.update(principal, a);
            case "kanvas.tasklist.show": return this.taskLists.show(principal, a);
            case "kanvas.board.post": return this.board.post(principal, a);
            case "kanvas.board.read": return this.board.read(principal, a);
            case "kanvas.board.overview": return this.board.overview(principal, a);
            case "kanvas.board.update": return this.board.update(principal, a);
            case "kanvas.monitor.stream.create": return this.monitorStreams.create(principal, a);
            case "kanvas.monitor.stream.read": return this.monitorStreams.read(principal, a);
            case "kanvas.monitor.stream.revoke": return this.monitorStreams.revoke(principal, a);
            case "kanvas.icons.search": return this.pickers.searchIcons(principal, a);
            case "kanvas.fonts.list": return this.pickers.listFonts(principal, a);
            case "kanvas.window.viewport": return this.devices.windows.viewport(principal, a);
            case "kanvas.window.overview": return this.devices.windows.overview(principal, a);
            case "kanvas.guidance.suggestions.list": return new SuggestedGuidance(this).run(principal, a, 'list');
            case "kanvas.guidance.suggestions.save": return new SuggestedGuidance(this).run(principal, a, 'save');
            case "kanvas.guidance.suggestions.delete": return new SuggestedGuidance(this).run(principal, a, 'delete');
            case "kanvas.guidance.suggestions.import": return new SuggestedGuidance(this).run(principal, a, 'import');
            case "kanvas.guidance.library.list": return this.guidance.library(principal, a, 'list');
            case "kanvas.guidance.library.save": return this.guidance.library(principal, a, 'save');
            case "kanvas.guidance.library.delete": return this.guidance.library(principal, a, 'delete');
            case "kanvas.guidance.library.activate": return this.guidance.library(principal, a, 'activate');
            case "kanvas.help.visual": return visualHelp(a);
            case "kanvas.help.show": return showHelp(this, principal, a);
            case "kanvas.guidance.read": return this.guidance.read(principal, a);
            case "kanvas.guidance.set": return this.guidance.mutate(principal, a, 'set');
            case "kanvas.guidance.draft.edit": return this.guidance.mutate(principal, a, 'draft_edit');
            case "kanvas.guidance.draft.save": return this.guidance.mutate(principal, a, 'draft_save');
            case "kanvas.flashcards.read": return this.flashcards.read(principal, a);
            case "kanvas.flashcards.control": return this.flashcards.control(principal, a);
            case "kanvas.flashcards.show": return this.flashcards.show(principal, a);
            case "kanvas.checklist.read": return this.checklists.read(principal, a);
            case "kanvas.checklist.update": return this.checklists.update(principal, a);
            case "kanvas.checklist.show": return this.checklists.show(principal, a);
            case "kanvas.account.details": return await this.accountDetails(principal);
            case "kanvas.profile.read": return (await this.accounts.profile(principal));
            case "kanvas.profile.update": return (await this.accounts.updateProfile(principal, a));
            case "kanvas.groups.list": return (await this.accounts.list(principal));
            case "kanvas.group.read": return (await this.accounts.read(principal, a.groupId));
            case "kanvas.group.create": return (await this.accounts.create(principal, a));
            case "kanvas.group.update": return (await this.accounts.update(principal, a));
            case "kanvas.group.member.set": return (await this.accounts.setMember(principal, a));
            case "kanvas.group.access.read": return (await this.accounts.grants(principal, a.sessionId));
            case "kanvas.group.access.set": return (await this.accounts.grant(principal, a));
            case "kanvas.session.context.read": return (await this.accounts.context(principal, a.sessionId));
            case "kanvas.session.context.set": return (await this.accounts.setContext(principal, a));
            case "kanvas.activity.read": return (await this.accounts.activity(principal, a));
            case "kanvas.analytics.read": return (await this.accounts.analytics(principal, a));
            case "kanvas.topology.read": return (await this.topology.acrossSessions(principal, a));
            case "kanvas.catalog.show": {
                const entries = a.catalog === 'operations' ? operationCatalog() : [...(a.scope === 'account' ? [] : templateCatalog()), ...(a.scope === 'system' ? [] : await this.customTemplateCatalog(principal))];
                const items = entries.map(x => x.provider === 'account' ? `${x.title} (account)` : x.id.replace(/^kanvas\.(template\.)?/, '')).sort((a, b) => a.localeCompare(b, 'en'));
                return this.submit(principal, { sessionId: a.sessionId, displayIds: a.displayIds, requestId: a.requestId, view: { version: 1, template: 'catalog-list', showTitle: false, data: { kind: a.catalog, items } } });
            }
            case "kanvas.devices.read": {
                const listing = (await this.devices.list(principal));
                const recipe = (await this.devicesRecipe(principal, listing.devices));
                return { ...listing, ...(recipe ? { publishRecipe: recipe } : {}) };
            }
            case "kanvas.device.present": return (await this.devices.present(principal, a));
            case "kanvas.window.present": return (await this.devices.windows.present(principal, a));
            case "kanvas.connection.redirect": return (await this.devices.windows.redirect(principal, a));
            case "kanvas.account.inventory": return (await this.inventory.read(principal, a));
            case "kanvas.display.lockdown": return this.lockdownDisplay(principal, a);
            case "kanvas.device.lock": return this.privacy.set(principal, a, true);
            case "kanvas.device.unlock": return this.privacy.set(principal, a, false);
            case "kanvas.device.rename": return (await this.devices.rename(principal, a));
            case "kanvas.participants.read": return (await this.devices.participants(principal, a.sessionId));
            case "kanvas.help": {
                if (a.sessionId)
                    (await this.access(principal, a.sessionId));
                if (a.displayId)
                    (await this.display(principal, a.sessionId, a.displayId));
                return { ...helpFor(a.topic, this.publicUrl, a.question), ...(a.sessionId ? { context: { sessionId: a.sessionId, displayId: a.displayId, config: (await this.access(principal, a.sessionId)).config } } : {}) };
            }
            case "kanvas.navigation.control": return (await this.navigation.control(principal, a));
            case "kanvas.navigation.read": return (await this.navigation.read(principal, a));
            case "kanvas.pin.save": return (await this.navigation.savePin(principal, a));
            case "kanvas.pin.recall": return (await this.navigation.recallPin(principal, a));
            case "kanvas.pin.remove": return (await this.navigation.removePin(principal, a));
            case "kanvas.pins.read": return (await this.navigation.pins(principal, a.sessionId, a.displayId));
            case "kanvas.guide": {
                (await this.fullAccount(principal));
                return { ...guideFor(a.topic), help: helpFor('orientation', this.publicUrl), capabilities: { publishSetup: this.publication.enabled, inlinePresentationNavigation: true, videoProviders: ['native', 'youtube', 'vimeo'] } };
            }
            case "kanvas.procedure.control": {
                const interaction = (await this.respond(principal, a.sessionId, a.displayId, { requestId: a.requestId, revision: a.expectedRevision ?? (await this.display(principal, a.sessionId, a.displayId, 'editor')).revision, value: { kind: 'procedure.navigate', action: a.action } }));
                // The agent's own navigation is not viewer input: keep it for history, never as something to acknowledge.
                if (interaction.status === 'pending' || interaction.source !== 'agent') {
                    interaction.status = 'acknowledged';
                    interaction.source = 'agent';
                    await this.store.put('interaction', interaction);
                }
                return { interaction, display: (await this.publicDisplay((await this.display(principal, a.sessionId, a.displayId)), principal)) };
            }
            case "kanvas.display.current": return (await this.experience.current(principal, a.sessionId, a.displayId));
            case "kanvas.view.validate": {
                (await this.access(principal, a.sessionId));
                return { valid: true, view: (await this.verifyView(principal, a.sessionId, a.view)), published: false };
            }
            case "kanvas.styles.list": {
                (await this.fullAccount(principal));
                return { styles: STYLE_PRESETS };
            }
            case "kanvas.preferences.get": return (await this.experience.preferences(principal));
            case "kanvas.preferences.update": return (await this.experience.preferences(principal, a));
            case "kanvas.browser.auth.list": return this.browserAuth.list(principal, a);
            case "kanvas.browser.auth.revoke": return this.browserAuth.revoke(principal, a);
            case "kanvas.invite.send": return this.inviteEmail.send(principal, a);
            case "kanvas.invite.create": return (await this.invitations.create(principal, a));
            case "kanvas.invite.accept": return (await this.invitations.accept(principal, a));
            case "kanvas.invite.revoke": return (await this.invitations.revoke(principal, a));
            case "kanvas.address.customize": return (await this.experience.addresses.customize(principal, { sessionId: a.sessionId, displayId: a.displayId, alias: a.alias }));
            case "kanvas.address.get": return (await this.experience.address(principal, a.sessionId, a.displayId));
            case "kanvas.shares.read": return this.experience.shares(principal, a);
            case "kanvas.share.revoke": return this.experience.revokeShare(principal, a);
            case "kanvas.share.create": return (await this.experience.share(principal, a as unknown as Parameters<Experience['share']>[1]));
            case "kanvas.pairings.read": return (await this.experience.pairings(principal, a.sessionId));
            case "kanvas.pairing.revoke": return (await this.experience.revokePairing(principal, a as unknown as Parameters<Experience['revokePairing']>[1]));
            case "kanvas.pairing.decide": return (await this.experience.decide(principal, a as unknown as Parameters<Experience['decide']>[1]));
            case "kanvas.viewers.read": return (await this.experience.viewers(principal, a.sessionId, a.displayId));
            case "kanvas.login.read": return loginRead(this, principal, a);
            case "kanvas.login.decide": return loginDecide(this, principal, a);
            case "kanvas.screen.read": return screenRead(this, principal, a);
            case "kanvas.screen.decide": return screenDecide(this, principal, a);
            case "kanvas.display.inspect": return (await this.experience.inspect(principal, a as unknown as Parameters<Experience['inspect']>[1]));
            case "kanvas.session.overview": return { ...(await this.experience.overview(principal, a.sessionId)), publishRecipe: { tool: "kanvas.submit", sessionId: a.sessionId, displayIds: ['CHOOSE_TARGET_DISPLAY_ID'], requestId: 'NEW_UNIQUE_REQUEST_ID', view: { version: 1, template: 'overview', data: { order: 'oldest' } } }, note: 'This read returns metadata, not a new display. The overview template already exists. Use the recipe with the selected target display to show the chronological thumbnail gallery.' };
            case "kanvas.screen.control": return this.experience.screenControl(principal, a);
            case "kanvas.notifications.targets": return this.push.targets(principal);
            case "kanvas.notifications.rename": return this.push.rename(principal, a);
            case "kanvas.notifications.send": return this.push.notify(principal, a);
            case "kanvas.toast": return (await this.experience.toast(principal, a as unknown as Parameters<Experience['toast']>[1]));
            case "kanvas.session.log": return (await this.experience.logs(principal, a as unknown as Parameters<Experience['logs']>[1]));
            case "kanvas.map.camera": {
                const d = (await this.display(principal, a.sessionId, a.displayId, 'editor'));
                this.assertRevision(a.expectedRevision, d.revision);
                if (d.view?.template !== 'map')
                    throw new AppError('INVALID_VIEW', 'The current view is not a map.');
                return (await this.submit(principal, { sessionId: a.sessionId, displayIds: [a.displayId], requestId: a.requestId, view: { ...d.view, data: { ...d.view.data, center: a.center, zoom: a.zoom } } }));
            }
            case "kanvas.template.get": {
                (await this.fullAccount(principal));
                return { ...(a.template === 'signage' ? { signCatalog, artwork: SIGNAGE_PROVENANCE, directions: SIGN_DIRECTIONS } : {}), ...(a.template === 'molecule' ? { library: moleculeLibrary, operations: { show: 'submit prepared molecule view', read: "kanvas_call with operationId:\"kanvas.display.current\" and arguments:{\u2026} plus library record for libraryId", update: 'view.patch with revision and requestId; set /data/highlightAtoms, /data/highlightBonds, /data/viewport; use replace_data for whole structure', fit: 'set /data/viewport to {zoom:1}', clear: 'set both highlight arrays to []' } } : {}), template: a.template, name: templateNames[a.template], schema: compactSchemaReferences(z.toJSONSchema(templateViewSchema(a.template), { unrepresentable: 'any', io: 'input', reused: 'ref' })), example: samples[a.template], ...(a.template === 'chart' ? { variants: chartVariantSamples } : a.template === 'countdown' ? { variants: { countUp: { version: 1, template: 'countdown', data: { direction: 'up', startedAt: '2026-09-14T01:00:00Z', label: 'Time since launch' }, source: { title: 'KANVAS example' } } }, controlTool: "kanvas.timer.control" } : {}), displayGuidance: TEMPLATE_DISPLAY_GUIDANCE[a.template], ...(a.template === 'weather' ? { viewerContext: "For local weather, first read kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026} for fresh consented browser location/timezone/locale. Supply sourced conditions and temperatures; KANVAS does not fetch weather." } : {}), note: 'This is the complete validation schema, not submit arguments. Presentation omits annotations/default hints to fit the response budget; read each leaf template for those. Examples are illustrative. Show one useful visual beat, omit redundant titles (showTitle:true explicitly keeps one), and preserve supplied source values, units and qualifications. Reference/reading content is available when deliberately requested.' };
            }
            case "kanvas.feedback.submit": return (await this.reports.submit(principal, 'feedback', a as unknown as FeedbackInput));
            case "kanvas.error.report": return (await this.reports.submit(principal, 'error', a as unknown as ErrorReportInput));
            case "kanvas.reports.read": return (await this.reports.read(principal, a as unknown as ReportsReadInput));
            case "kanvas.report.patch": return await this.reports.patch(principal, a as unknown as import('../shared/reports.js').ReportPatchInput);
            case "kanvas.report.update": return (await this.reports.update(principal, a as unknown as ReportUpdateInput));
            case "kanvas.account.begin": {
                const result = await this.beginSession(principal, a as unknown as Parameters<KanvasService['beginSession']>[1]);
                if (a.clientDetails && 'sessionId' in result && typeof result.sessionId === 'string')
                    await this.recordAgentContext(principal, result.sessionId, a.clientDetails, true);
                return result;
            }
            case "kanvas.start.read": return (await this.startPage(principal, a.offset));
            case "kanvas.session.rename": return (await this.renameSession(principal, a.sessionId, a.expectedRevision, a.name));
            case "kanvas.display.rename": return (await this.renameDisplay(principal, a.sessionId, a.displayId, a.expectedRevision, a.name));
            case "kanvas.selection.set": return (await this.setSelection(principal, a));
            case "kanvas.sessions.list": return (await this.sessions(principal));
            case "kanvas.session.create": {
                const result = await this.createReadySession(principal, a.name, a.initialDisplay);
                if (a.clientDetails)
                    await this.recordAgentContext(principal, result.id, a.clientDetails, true);
                const mode = a.mode ? await this.modes.set(principal, result.id, a.mode as SessionMode | 'auto') : await this.modes.read(result.id);
                return { ...result, mode, agentConnections: await this.agentConnections(principal, result.id) };
            }
            case "kanvas.client.context.update": return this.recordAgentContext(principal, a.sessionId, a.clientDetails);
            case "kanvas.session.state": return (await this.sessionState(principal, a as unknown as {
                sessionId: string;
                includeUpdates?: 'recent' | 'all';
            }));
            case "kanvas.session.end": return (await this.end(principal, a.sessionId));
            case "kanvas.display.register": return (await this.createDisplay(principal, a.sessionId, a as unknown as Parameters<KanvasService['createDisplay']>[2]));
            case "kanvas.display.update": return (await this.updateDisplay(principal, a.sessionId, a.displayId, a));
            case "kanvas.displays.identify": return (await this.identifyDisplays(principal, a.sessionId, a.displayIds, a.durationMs));
            case "kanvas.displays.sync": return (await this.displaySync.configure(principal, a));
            case "kanvas.displays.sync.read": return (await this.displaySync.read(principal, a));
            case "kanvas.display.edit": return (await this.edit(principal, a.sessionId, a.displayId, a.expectedRevision, a.data));
            case "kanvas.chat.append":
            case "kanvas.progress.append":
            case "kanvas.view.patch":
            case "kanvas.timer.control": {
                const update = name === "kanvas.chat.append" ? (await chatAppend(this, principal, a)) : name === "kanvas.progress.append" ? (await progressAppend(this, principal, a)) : name === "kanvas.timer.control" ? (await this.timers.control(principal, a)) : (await this.patches.patch(principal, a));
                for (const displayId of update.displayIds)
                    this.emit({ type: 'display', sessionId: update.sessionId, displayId, revision: update.revisions[displayId] });
                this.emit({ type: 'update', sessionId: update.sessionId });
                return (await this.updateDelivery(update));
            }
            case "kanvas.draft.read": return (await this.drafts.read(principal, a));
            case "kanvas.draft.edit":
            case "kanvas.draft.suggest":
            case "kanvas.draft.review": {
                const result = name === "kanvas.draft.edit" ? (await this.drafts.edit(principal, a)) : name === "kanvas.draft.suggest" ? (await this.drafts.suggest(principal, a)) : (await this.drafts.review(principal, a));
                for (const displayId of result.update.displayIds)
                    this.emit({ type: 'display', sessionId: result.update.sessionId, displayId, revision: result.update.revisions[displayId] });
                this.emit({ type: 'update', sessionId: result.update.sessionId });
                return { ...(await this.updateDelivery(result.update)), document: result.summary };
            }
            case "kanvas.planner.read": return (await this.planners.read(principal, a));
            case "kanvas.planner.edit":
            case "kanvas.planner.propose":
            case "kanvas.planner.review":
            case "kanvas.planner.finalize": {
                const result = name === "kanvas.planner.edit" ? (await this.planners.edit(principal, a))
                    : name === "kanvas.planner.propose" ? (await this.planners.propose(principal, a))
                        : name === "kanvas.planner.review" ? (await this.planners.review(principal, a))
                            : (await this.planners.finalize(principal, a));
                for (const displayId of result.update.displayIds)
                    this.emit({ type: 'display', sessionId: result.update.sessionId, displayId, revision: result.update.revisions[displayId] });
                this.emit({ type: 'update', sessionId: result.update.sessionId });
                return { ...(await this.updateDelivery(result.update)), document: result.summary };
            }
            case "kanvas.monitoring.start": return (await this.monitoring.start(principal, a));
            case "kanvas.monitoring.read": return (await this.monitoring.read(principal, a));
            case "kanvas.monitoring.update": return (await this.monitoring.update(principal, a));
            case "kanvas.monitoring.stop": return (await this.monitoring.stop(principal, a));
            case "kanvas.live.push": return (await this.livePush(principal, a));
            case "kanvas.display.history": return (await this.displayHistory(principal, a.sessionId, a.displayId));
            case "kanvas.display.navigate": return (await this.navigate(principal, a as unknown as Parameters<KanvasService['navigate']>[1]));
            case "kanvas.video.control": return (await this.videoControl(principal, a as unknown as Parameters<KanvasService['videoControl']>[1]));
            case "kanvas.video.status": return (await this.video.get((await this.display(principal, a.sessionId, a.displayId)), a.commandId)) ?? null;
            case "kanvas.display.request.capture": return this.clientCapture.request(principal, { sessionId: a.sessionId, displayId: a.displayId, viewerId: a.viewerId });
            case "kanvas.display.capture.status": return this.clientCapture.status(principal, { sessionId: a.sessionId, displayId: a.displayId, captureId: a.captureId });
            case "kanvas.display.snapshot": {
                (await this.fullAccount(principal));
                const display = (await this.publicDisplay((await this.display(principal, a.sessionId, a.displayId)), principal));
                const live = (await this.experience.receiving.viewers(a.sessionId, a.displayId))
                    .filter(v => v.connected && v.width > 0 && v.height > 0).sort((x, y) => Number(y.visible) - Number(x.visible) || Date.parse(y.observedAt) - Date.parse(x.observedAt))[0];
                const dimensions = { width: a.width ?? live?.width ?? display.width, height: a.height ?? live?.height ?? display.height };
                const result = await this.visualCapture.capture(principal.userId, display, dimensions, async () => (await this.publicDisplay((await this.display(principal, a.sessionId, a.displayId)), principal)));
                Object.assign(result.metadata, { viewportSource: a.width || a.height ? 'explicit-with-live-defaults' : live ? 'connected-viewer' : 'display-default', ...(live ? { viewportViewerId: live.id } : {}) });
                (await this.access(principal, a.sessionId));
                if (a.includeBase64)
                    result.metadata.export = { base64: result.image.toString('base64'), mimeType: result.mimeType, name: `kanvas-snapshot-${display.revision}.jpg`, size: result.image.length };
                // Capturing already-readable pixels may create a bounded derivative asset,
                // but never accepts arbitrary uploaded bytes or grants publish permission.
                if ((await this.store.list('capture-asset', a.sessionId)).length >= 100 || (await this.store.list<AssetRecord>('asset', a.sessionId)).reduce((n, x) => n + x.size, 0) + result.image.length > 200 * 1024 * 1024) {
                    Object.assign(result.metadata, { reusable: false, storageNote: 'Snapshot returned inline. Remove unused capture assets before saving more; maximum 100 per session and normal media quota apply.' });
                    return result;
                }
                const asset = (await this.storeMedia(a.sessionId, { name: `Display snapshot revision ${display.revision}.jpg`, mimeType: result.mimeType, base64: result.image.toString('base64') }));
                (await this.store.put('capture-asset', { id: asset.id, sessionId: a.sessionId, displayId: display.id, revision: display.revision, createdAt: now() }));
                Object.assign(result.metadata, { assetId: asset.id, assetUrl: new URL(asset.url, this.publicUrl).href, assetPath: asset.url, reusable: true });
                return result;
            }
            case "kanvas.config.update": {
                const { mode: requestedMode, ...settings } = a as Record<string, unknown> & {
                    mode?: SessionMode | 'auto';
                };
                if (settings.config === undefined && requestedMode === undefined)
                    throw new InputError([{ path: 'config', problem: 'Supply config with at least one setting, or mode.' }]);
                if (requestedMode === undefined)
                    return (await this.experience.scopedSettings(principal, settings));
                if ((settings.scope ?? 'session') !== 'session')
                    throw new InputError([{ path: 'mode', problem: 'mode belongs to one session. Use scope "session" (the default).' }]);
                // A mode-only call changes no settings and needs no settings revision.
                const changesSettings = settings.config && typeof settings.config === 'object' && Object.keys(settings.config as object).length > 0;
                const result = changesSettings ? await this.experience.scopedSettings(principal, settings) : { sessionId: a.sessionId };
                return { ...(result as object), mode: await this.modes.set(principal, a.sessionId, requestedMode) };
            }
            case "kanvas.submit": {
                const result = await this.publication.show(principal, a as unknown as PublishInput);
                if (a.clientDetails && 'sessionId' in result && typeof result.sessionId === 'string')
                    await this.recordAgentContext(principal, result.sessionId, a.clientDetails);
                return (a.view as ViewSpec | undefined)?.template === 'settings' || a.templateHint === 'settings' ? { ...result, settingsGuidance: { tool: "kanvas.config.update", sessionId: a.sessionId ?? ('sessionId' in result ? result.sessionId : undefined), readRevision: "Read kanvas_call with operationId:\"kanvas.session.state\" and arguments:{\u2026} for configRevision; pass it as expectedRevision.", nextAction: "Apply user-requested changes now via settings.update with config:{style,theme,accent,textSize,readingFontSize,readingWpm,readingZoom}. This is live configuration, not static display content. Account defaults use profile kanvas_call with operationId:\"kanvas.preferences.update\" and arguments:{\u2026} and its current revision; never change scope implicitly." } } : result;
            }
            case "kanvas.presentation.navigate": return (await this.navigatePresentation(principal, a as unknown as PresentationNavigation));
            case "kanvas.clear": return (await this.clear(principal, a.sessionId, a.displayIds, a.requestId));
            case "kanvas.update.status": {
                (await this.access(principal, a.sessionId));
                const update = required(a.updateId ? (await this.store.get<UpdateRecord>('update', a.updateId)) : (await this.retryStatus(principal, a.sessionId, a.requestId)));
                if (update.sessionId !== a.sessionId)
                    throw new AppError('NOT_FOUND', 'This update is unavailable.', 404);
                return (await this.updateDelivery(update));
            }
            case "kanvas.dataset.import": return (await this.dataset(principal, a.sessionId, { name: a.name, ...(a.csv !== undefined ? { csv: a.csv } : a.json !== undefined ? { json: a.json } : { rows: a.rows }), source: a.source }));
            case "kanvas.dataset.delete": return (await this.deleteContent(principal, a.sessionId, 'dataset', a.datasetId));
            case "kanvas.asset.import": return (await this.importAsset(principal, a.sessionId, { name: a.name, mimeType: a.mimeType, base64: a.base64 }));
            case "kanvas.asset.export": {
                await this.fullAccount(principal);
                const asset = await this.asset(principal, a.assetId, a.sessionId);
                const row = required(await this.store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(asset.id));
                const bytes = Buffer.from(row.bytes as Uint8Array);
                if (a.offset > bytes.length)
                    throw new AppError('INVALID_ARGUMENT', 'The byte offset exceeds this asset size.');
                const chunk = bytes.subarray(a.offset, Math.min(bytes.length, a.offset + a.length)), end = a.offset + chunk.length;
                return { assetId: asset.id, name: asset.name, mimeType: asset.mimeType, size: bytes.length, offset: a.offset, bytes: chunk.length, base64: chunk.toString('base64'), ...(end < bytes.length ? { nextOffset: end } : {}), complete: end === bytes.length };
            }
            case "kanvas.asset.delete": return (await this.deleteContent(principal, a.sessionId, 'asset', a.assetId));
            case "kanvas.presentation.create": return (await this.createDeck(principal, a.sessionId, a.name, a.slides, { instructions: a.instructions, cardInstructions: a.cardInstructions, mirrored: a.mirrored }));
            case "kanvas.presentations.list": return (await this.decks(principal, a.sessionId));
            case "kanvas.presentation.cue": return (await this.cue(principal, a.sessionId, a.deckId, a.index, a.displayIds, a.requestId));
            case "kanvas.satisfaction.read":
                if (principal.captureOnly || principal.scopedSessionId)
                    throw new AppError('FORBIDDEN', 'Only session editors can read survey totals.', 403);
                await this.access(principal, a.sessionId, 'editor');
                if (a.displayId)
                    await this.display(principal, a.sessionId, a.displayId, 'editor');
                return readSatisfaction(this.store, a);
            case "kanvas.interactions.read": return (await this.interactions(principal, a.sessionId, a.status, a.limit, a.afterId));
            case "kanvas.interaction.ack": return (await this.acknowledge(principal, a.sessionId, a.interactionId));
            case "kanvas.member.add": return (await this.addMember(principal, a.sessionId, a.username, a.role));
            case "kanvas.member.remove": return (await this.removeMember(principal, a.sessionId, a.userId));
            default: throw new AppError('UNKNOWN_TOOL', 'This operation is unavailable.', 404);
        }
    }
    private async retryStatus(principal: AuthPrincipal, sessionId: string, requestId: string): Promise<Awaited<UpdateRecord | undefined>> {
        const row = (await this.store.db.prepare("SELECT result_id FROM requests WHERE session_id=? AND principal=? AND request_id=? AND kind IN ('submit','clear','cue','navigate','patch','timer-control','presentation-control','pin-recall','draft-edit','draft-suggest','draft-review','planner-edit','planner-suggest','planner-review','planner-finalize')").get(sessionId, this.identity(principal), requestId)) as {
            result_id: string;
        } | undefined;
        return row ? (await this.store.get<UpdateRecord>('update', row.result_id)) : undefined;
    }
    async close(): Promise<void> {
        await this.experience.receiving.close();
        await this.friction.close();
        this.monitorStreams.close();
        await this.autoplay.close();
        this.diagnostics.close();
        await this.push.close();
        this.closed = true;
        for (const cancel of this.cancelWork)
            cancel();
        await Promise.allSettled([...this.active, this.monitoring.close()]);
        this.events.removeAllListeners();
    }
}
