import {mountLegal} from './legal.js';
import {mountPush,type PushOptions} from './push.js';
import { mountFrontendDiagnostics } from './frontend-diagnostics.js';
import { mountClientCapture } from './client-capture.js';
import { type DatabaseOptions } from './database-config.js';
import { mountPublicSessions } from './public-sessions.js';
import { PublicImages, mountPublicImages, type PublicImageOptions } from './public-images.js';
import { mountInvitations } from './invitations.js';
import { WebsitePreview, mountWebsitePreview, type WebsitePreviewOptions } from './website-preview.js';
import { KANVAS_VERSION } from '../shared/version.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Interpreter } from '../shared/types.js';
import { assertJsonBudget } from '../shared/view-schemas.js';
import { Auth, hash, type AuthPrincipal } from './auth.js';
import { KanvasService } from './domain.js';
import { AppError, required, Store } from './store.js';
import { createInterpreter, RenderingError, safeRenderingError } from './rendering/index.js';
import { mountMcp } from './mcp/index.js';
import { mcpProfile, type McpProfile } from './mcp/operations.js';
import { mountAccessFlows } from './access-flows.js';
import { mountSharing } from './sharing.js';
import { mountPublicDocs } from './public-docs.js';
import { mountNavigation } from './navigation.js';
import { mountExperience } from './experience.js';
import { mapConfig } from './map-config.js';
import { mountEmailSignin, type SigninMailer } from './email-signin.js';
import { mountSessionBrowsing } from './session-browsing.js';
import { mountAccounts } from './accounts.js';
import { mountTopology } from './topology.js';
import { requestContext } from './request-context.js';
import { mountEntryDevices } from './entry-devices.js';
import { InputError, validationIssues } from './input-errors.js';
import type { MonitoringOptions } from './monitoring.js';

export interface OAuthDiagnostic {
  event: 'kanvas-oauth';
  endpoint: 'registration' | 'authorization' | 'token' | 'discovery' | 'revocation' | 'device';
  method: 'GET' | 'POST' | 'OPTIONS' | 'other';
  status: number;
  durationMs: number;
  origin: 'absent' | 'same-origin' | 'other';
  registration?: {
    authMethod: 'none' | 'client_secret_post' | 'client_secret_basic' | 'omitted' | 'other';
    authorizationCodeRequested: boolean;
    refreshTokenRequested: boolean;
    otherGrantRequested: boolean;
    unsupportedScopeRequested: boolean;
    redirectCount: number;
  };
}
export interface AppOptions {
  /** Host lifecycle callback, installed before runtime ownership acquisition. */
  onOwnershipLost?: () => void;
  pushOptions?:PushOptions;
  serviceAdmins?: string[];
  consoleUrl?:string;
  /** Compatibility alias for older deployments. */
  adminUrl?:string;
  docsUrl?:string;
  pairingFailedLimit?:number;
  pairingLabel?:()=>string;
  websitePreviewOptions?:WebsitePreviewOptions;
  /** Deployment-owned tool catalog; never accepted in tool/HTTP arguments. */
  mcpProfile?: McpProfile;
  /** Rollout switch; explicit publishing and already-created targets still work. */
  publishSetupEnabled?: boolean;
  /** Embedding/test seam only; never configurable through an HTTP or MCP request. */
  monitoringOptions?: MonitoringOptions;
  publicImageOptions?:PublicImageOptions;
  signinMailer?: SigninMailer;
  inviteMailer?: import('./invite-email.js').InviteMailer;
  database?: DatabaseOptions; publicUrl?: string; allowRegistration?: boolean; interpreter?: Interpreter;
  staticDirectory?: string; allowedOrigins?: string[];
  /** Fixed categories/counts only. Never receives request values or credentials. */
  onOAuthDiagnostic?: (event: OAuthDiagnostic) => void;
}
const unsafe = (req: Request): boolean => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
const bodyObject = (request: Request): Record<string, unknown> => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw new AppError('INVALID_BODY', 'Expected a JSON object.');
  try { assertJsonBudget(request.body, 15 * 1024 * 1024, 500_000); } catch { throw new AppError('INVALID_BODY', 'Request exceeds the supported JSON size or complexity.'); }
  return request.body as Record<string, unknown>;
};

/** Bounded process-local limiter; installation sits behind the configured reverse proxy. */
class Limiter {
  private readonly entries = new Map<string, { count: number; reset: number }>();
  take(key: string, maximum: number, windowMs: number): void {
    const time = Date.now();
    if (this.entries.size > 5000) for (const [k, v] of this.entries) if (v.reset <= time) this.entries.delete(k);
    const entry = this.entries.get(key);
    if (!entry || entry.reset <= time) { if (this.entries.size >= 10_000) throw new AppError('RATE_LIMIT', 'Service is busy. Try again shortly.', 429); this.entries.set(key, { count: 1, reset: time + windowMs }); return; }
    if (++entry.count > maximum) throw new AppError('RATE_LIMIT', 'Too many attempts. Try again shortly.', 429);
  }
}

export async function createApp(options: AppOptions = {}) {
  const profile = mcpProfile(options.mcpProfile);
  const publicAddress = new URL(options.publicUrl ?? 'http://127.0.0.1:8787');
  if (!['https:', 'http:'].includes(publicAddress.protocol) || publicAddress.username || publicAddress.password || publicAddress.pathname !== '/' || publicAddress.search || publicAddress.hash) throw new Error('KANVAS public URL must be an HTTP(S) origin without credentials, path, query or fragment.');
  if (publicAddress.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(publicAddress.hostname)) throw new Error('A non-loopback KANVAS public URL must use HTTPS.');
  const publicUrl = publicAddress.origin;
  const consoleUrl=options.consoleUrl??options.adminUrl;
  const adminAddress=consoleUrl?new URL(consoleUrl):undefined;
  if(adminAddress&&(adminAddress.protocol!=='https:'||adminAddress.username||adminAddress.password||adminAddress.pathname!=='/'||adminAddress.search||adminAddress.hash))throw new Error('The console URL must be a credential-free HTTPS origin.');
  const adminOrigin=adminAddress?.origin;
  const origins = new Set([publicUrl,...(adminOrigin?[adminOrigin]:[]), ...(options.allowedOrigins ?? [])]);
  const allowedHosts = [...new Set([publicAddress.hostname,...(adminAddress?[adminAddress.hostname]:[]), '127.0.0.1', 'localhost', '[::1]'])];
  const store = new Store(options.database, options.onOwnershipLost);
  try { await store.ready; await store.claimRuntime(); } catch (error) { await store.close(); throw error; }
  const auth = new Auth(store, publicAddress.protocol === 'https:', options.allowRegistration ?? true, `${publicUrl}/mcp`);
  const service = new KanvasService(store, auth, options.interpreter ?? createInterpreter(), publicUrl, options.monitoringOptions, options.publishSetupEnabled, options.pushOptions);
  service.inviteEmail.mailer=options.inviteMailer;
  try { await service.initialize(); } catch(error) { await service.close(); await store.close(); throw error; }
  service.adminUrl=adminOrigin;
  service.accounts.serviceAdmins=new Set(options.serviceAdmins??[]);
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', 'loopback');
  app.use((req,res,next)=>{const started=performance.now();res.on('finish',async ()=>{if(req.method==='GET'&&String(res.getHeader('content-type')).startsWith('text/event-stream'))return;const category=req.path.startsWith('/mcp')?'agent':req.path.startsWith('/api/auth/')||req.path.startsWith('/oauth/')?'account':req.path.startsWith('/api/')?'api':'page';try{(await service.accounts.recordRequest(category,res.statusCode,performance.now()-started));}catch{/* Metrics must not affect a completed response or shutdown. */}});next();});
  const limiter = new Limiter();
  const streams = new Set<() => void | Promise<void>>();
  const browser = async (req: Request): Promise<Awaited<AuthPrincipal>> => { const { principal, session } = (await auth.browser(req)); if (unsafe(req)) { if (principal.captureOnly) throw new AppError('FORBIDDEN', 'Capture identities are read-only.', 403); auth.csrf(req, session); } return principal; };
  const account = async (req: Request, scope = 'read') => { const principal = (await browser(req)); (await service.fullAccount(principal, scope)); return principal; };
  const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ data });
  const operation = (name: string, extra: (req: Request) => Record<string, unknown> = () => ({})) => async (req: Request, res: Response) => {
    const principal = (await browser(req)), input = unsafe(req) && req.body !== undefined ? bodyObject(req) : {};
    send(res, await service.execute(name, { ...input, ...extra(req) }, principal));
  };
  const sessionArgs = (req: Request) => ({ sessionId: String(req.params.id) });
  const displayArgs = (req: Request) => ({ ...sessionArgs(req), displayId: String(req.params.displayId) });

  if (options.onOAuthDiagnostic) app.use((req: Request, res: Response, next: NextFunction) => {
    const endpoints: Record<string, OAuthDiagnostic['endpoint']> = {
      '/oauth/device/authorize': 'device', '/oauth/register': 'registration', '/oauth/authorize': 'authorization', '/oauth/token': 'token', '/oauth/revoke': 'revocation',
      '/.well-known/oauth-authorization-server': 'discovery', '/.well-known/oauth-protected-resource': 'discovery',
      '/.well-known/oauth-protected-resource/mcp': 'discovery',
    };
    const endpoint = Object.hasOwn(endpoints, req.path) ? endpoints[req.path] : undefined;
    if (endpoint) {
      const start = performance.now();
      res.once('finish', () => {
        const event: OAuthDiagnostic = {
          event: 'kanvas-oauth', endpoint,
          method: req.method === 'GET' || req.method === 'POST' || req.method === 'OPTIONS' ? req.method : 'other',
          status: res.statusCode, durationMs: Math.round(performance.now() - start),
          origin: !req.get('origin') ? 'absent' : req.get('origin') === publicUrl ? 'same-origin' : 'other',
        };
        // Deliberately do not inspect authorization or token inputs, URLs,
        // cookies, client names, redirect addresses or error descriptions.
        if (endpoint === 'registration') {
          const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
          const method = body.token_endpoint_auth_method;
          const grants = Array.isArray(body.grant_types) ? body.grant_types : [];
          event.registration = {
            authMethod: method === undefined ? 'omitted' : method === 'none' || method === 'client_secret_post' || method === 'client_secret_basic' ? method : 'other',
            authorizationCodeRequested: grants.includes('authorization_code'), refreshTokenRequested: grants.includes('refresh_token'),
            otherGrantRequested: grants.some(grant => grant !== 'authorization_code' && grant !== 'refresh_token'),
            unsupportedScopeRequested: body.scope !== undefined && (typeof body.scope !== 'string' || body.scope.split(' ').some(scope => scope !== 'read' && scope !== 'publish')),
            redirectCount: Array.isArray(body.redirect_uris) ? Math.min(body.redirect_uris.length, 9) : 0,
          };
        }
        try { options.onOAuthDiagnostic?.(event); } catch { /* Diagnostics must not change access decisions. */ }
      });
    }
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': req.path === '/connect' ? 'no-referrer' : 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), display-capture=(self)' });
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; media-src 'self' https: http:; connect-src 'self'; frame-src 'self' about: https:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'");
    try {
      if (!allowedHosts.includes(req.hostname)) throw new AppError('INVALID_HOST', 'This host is not configured for KANVAS.', 403);
      const origin = req.get('origin');
      if (unsafe(req) && origin && !origins.has(origin)) throw new AppError('CROSS_ORIGIN', 'Cross-origin requests are not accepted.', 403);
      if (unsafe(req) && req.get('sec-fetch-site') === 'cross-site') throw new AppError('CROSS_ORIGIN', 'Cross-site requests are not accepted.', 403);
      if (unsafe(req)) limiter.take(`write:${req.ip}`, 600, 60_000);
      next();
    } catch (error) { next(error); }
  });
  app.use(cookieParser());
  app.use(['/api/diagnostics','/api/push'],express.json({limit:'16kb',strict:true}));
  app.use(express.json({ limit: '15mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 24 }));
  const closePublic=(await mountPublicSessions(app,service,browser));
  mountSessionBrowsing(app,service,browser);
  app.get('/api/sessions/:id/displays/:displayId/tool-log',async (req,res)=>send(res,(await service.toolLog.forDisplay((await browser(req)),String(req.params.id),String(req.params.displayId)))));
  app.post('/api/sessions/:id/displays/:displayId/autoplay',operation('kanvas_autoplay_control',displayArgs));
  app.get('/api/sessions/:id/displays/:displayId/autoplay',operation('kanvas_autoplay_read',displayArgs));
  const closeDevices=mountEntryDevices(app,service.devices,browser);
  mountAccounts(app,service.accounts,browser);
  mountTopology(app,service.topology,browser);
  mountExperience(app,service.experience,browser);
  mountNavigation(app,service.navigation,browser);
  mountInvitations(app,service.invitations,browser);
  mountPublicImages(app,new PublicImages(service,options.publicImageOptions),browser);
  mountWebsitePreview(app,new WebsitePreview(service,options.websitePreviewOptions),browser);
  mountPublicDocs(app,service.publicUrl,profile,options.docsUrl);
  mountLegal(app);
  mountEmailSignin(app,auth,publicUrl,options.signinMailer,async userId=>{(await service.devices.provision({userId}));(await service.accounts.audit('account.registered',{actorId:userId,subjectId:userId}));},adminOrigin,async userId=>(await service.accounts.audit('account.signed-in',{actorId:userId,subjectId:userId})));
  app.get('/api/start', async (req,res)=>send(res,(await service.startPage((await account(req)),z.coerce.number().int().min(0).max(10000).parse(req.query.offset??0)))));
  app.post('/api/sessions/:id/rename',operation('kanvas_session_rename',sessionArgs));
  app.post('/api/sessions/:id/displays/:displayId/chat',operation('kanvas_chat_append',displayArgs));
  app.post('/api/sessions/:id/displays/:displayId/selection',operation('kanvas_selection_set',displayArgs));
  const tiles=mapConfig();app.get('/api/map/config',(_req,res)=>res.json({data:tiles}));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', version: KANVAS_VERSION, mcpProfile: 'discovery' }));
  app.get('/readyz', async (_req, res) => {
    try { await store.query('SELECT 1'); res.json({ status: 'ready', version: KANVAS_VERSION, database: 'postgresql' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.get('/api/auth/me', async (req, res) => {
    const { principal, session } = (await auth.browser(req));
    const user = principal.scopedDisplayId ? { id: principal.participantId ?? 'capture', username: 'guest', displayName: principal.captureOnly ? 'Visual inspection' : 'Guest viewer' } : required((await auth.user(principal.userId)));
    send(res, { user, csrfToken: session.csrf, ...(principal.captureOnly ? { captureOnly: true } : {}), ...(principal.scopedDisplayId ? { viewOnly: true, interactive: principal.interactive === true, sessionId: principal.scopedSessionId, displayId: principal.scopedDisplayId } : {}) });
  });
  for (const action of ['register', 'login'] as const) app.post(`/api/auth/${action}`, async (req, res) => {
    limiter.take(`auth:${req.ip}`, 30, 60_000);
    if(options.signinMailer)throw new AppError('EMAIL_VERIFICATION_REQUIRED','Use the email sign-in flow to verify your address to sign in. Password authentication is disabled.',403);
    const body = bodyObject(req), user = await auth[action](body);
    if(action==='register')(await service.devices.provision({userId:user.id}));
    (await service.accounts.audit(action==='register'?'account.registered':'account.signed-in',{actorId:user.id,subjectId:user.id}));
    // Rotate any existing cookie to prevent retaining authority under an earlier account.
    (await auth.logout(req, res)); const session = (await auth.issueBrowser(user.id, res)); send(res, { user, csrfToken: session.csrf }, action === 'register' ? 201 : 200);
  });
  app.post('/api/auth/logout', async (req, res) => {
    const principal = (await browser(req)), sessions = (await service.sessions(principal)); (await auth.logout(req, res));
    for (const session of sessions) service.emit({ type: 'membership', sessionId: session.id }); send(res, { signedOut: true });
  });
  app.get('/api/sessions', async (req, res) => send(res, (await service.sessions((await browser(req))))));
  app.post('/api/sessions', operation('kanvas_session_create'));
  app.get('/api/account/details',operation('kanvas_account_details'));
  const checklistPage=(req:Request)=>z.strictObject({offset:z.coerce.number().int().min(0).max(1000).optional(),limit:z.coerce.number().int().min(1).max(100).optional()}).parse(req.query);
  app.get('/api/sessions/:id/checklists',operation('kanvas_checklist_read',req=>({...sessionArgs(req),...checklistPage(req)})));
  app.get('/api/sessions/:id/checklists/:checklistId',operation('kanvas_checklist_read',req=>({...sessionArgs(req),...checklistPage(req),checklistId:String(req.params.checklistId)})));
  app.patch('/api/sessions/:id/checklists/:checklistId',operation('kanvas_checklist_update',req=>({...sessionArgs(req),checklistId:String(req.params.checklistId)})));
  app.post('/api/sessions/:id/checklists/:checklistId/show',operation('kanvas_checklist_show',req=>({...sessionArgs(req),checklistId:String(req.params.checklistId)})));
  app.get('/api/sessions/:id', async (req, res) => {
    const displayId = req.query.displayId;
    if (displayId !== undefined && (typeof displayId !== 'string' || !displayId || displayId.length > 128)) throw new AppError('INVALID_DISPLAY', 'Supply one valid display identifier.');
    send(res, (await service.detail((await browser(req)), String(req.params.id), displayId)));
  });
  app.patch('/api/sessions/:id/config', operation('kanvas_config_update', sessionArgs));
  app.post('/api/sessions/:id/displays', operation('kanvas_display_register', sessionArgs));
  app.patch('/api/sessions/:id/displays/:displayId', operation('kanvas_display_update', displayArgs));
  app.patch('/api/sessions/:id/displays/:displayId/name', operation('kanvas_display_rename', displayArgs));
  app.patch('/api/sessions/:id/displays/:displayId/view', operation('kanvas_display_edit', displayArgs));
  app.post('/api/sessions/:id/displays/:displayId/patch', operation('kanvas_view_patch', displayArgs));
  app.post('/api/sessions/:id/displays/:displayId/timer-control', operation('kanvas_timer_control', displayArgs));
  app.post('/api/sessions/:id/monitoring', operation('kanvas_monitoring_start', sessionArgs));
  app.get('/api/sessions/:id/monitoring', operation('kanvas_monitoring_read', sessionArgs));
  app.get('/api/sessions/:id/monitoring/:jobId', operation('kanvas_monitoring_read', req => ({ ...sessionArgs(req), jobId: String(req.params.jobId) })));
  app.patch('/api/sessions/:id/monitoring/:jobId', operation('kanvas_monitoring_update', req => ({ ...sessionArgs(req), jobId: String(req.params.jobId) })));
  app.post('/api/sessions/:id/monitoring/:jobId/stop', operation('kanvas_monitoring_stop', req => ({ ...sessionArgs(req), jobId: String(req.params.jobId) })));
  app.post('/api/sessions/:id/displays/:displayId/applied', async (req, res) => {
    const { revision } = z.strictObject({ revision: z.number().int().nonnegative() }).parse(bodyObject(req));
    send(res, (await service.applied((await browser(req)), String(req.params.id), String(req.params.displayId), revision)));
  });
  app.post('/api/sessions/:id/displays/:displayId/delivery', async (req, res) => send(res, (await service.reportDelivery((await browser(req)), String(req.params.id), String(req.params.displayId), bodyObject(req)))));
  app.get('/api/sessions/:id/displays/:displayId/history', operation('kanvas_display_history', displayArgs));
  app.post('/api/sessions/:id/navigate', operation('kanvas_display_navigate', sessionArgs));
  app.post('/api/sessions/:id/displays/:displayId/presentation/navigate', operation('kanvas_presentation_navigate', displayArgs));
  app.post('/api/sessions/:id/displays/:displayId/video-control', operation('kanvas_video_control', displayArgs));
  app.get('/api/sessions/:id/displays/:displayId/video-status', operation('kanvas_video_status', req => ({ ...displayArgs(req), ...(req.query.commandId ? { commandId: req.query.commandId } : {}) })));
  app.post('/api/sessions/:id/displays/:displayId/video-commands/:commandId/result', async (req, res) => send(res, (await service.videoAcknowledge((await browser(req)), String(req.params.id), String(req.params.displayId), String(req.params.commandId), bodyObject(req)))));
  app.get('/api/sessions/:id/displays/:displayId/pointing',async (req,res)=>send(res,(await service.pointing.read((await browser(req)),{sessionId:String(req.params.id),displayId:String(req.params.displayId)}))));
  app.put('/api/sessions/:id/displays/:displayId/pointing',async (req,res)=>send(res,(await service.pointing.write((await browser(req)),String(req.params.id),String(req.params.displayId),bodyObject(req)))));
  app.post('/api/sessions/:id/displays/:displayId/respond' , async (req, res) => send(res, (await service.respond((await browser(req)), String(req.params.id), String(req.params.displayId), bodyObject(req))), 201));
  app.post('/api/sessions/:id/submit', operation('kanvas_submit', sessionArgs));
  app.post('/api/sessions/:id/clear', operation('kanvas_clear', sessionArgs));
  app.post('/api/feedback',operation('kanvas_feedback_submit',bodyObject));
  app.post('/api/error-reports',operation('kanvas_error_report',bodyObject));
  app.get('/api/reports',operation('kanvas_reports_read',req=>({...req.query,...(req.query.limit?{limit:Number(req.query.limit)}:{})})));
  app.patch('/api/reports/:reportId',operation('kanvas_report_update',req=>({...bodyObject(req),reportId:String(req.params.reportId)})));
  app.post('/api/sessions/:id/feedback', operation('kanvas_feedback_submit', sessionArgs));
  app.post('/api/sessions/:id/error-reports', operation('kanvas_error_report', sessionArgs));
  app.get('/api/sessions/:id/reports', operation('kanvas_reports_read', req => ({
    ...sessionArgs(req),
    ...(req.query.status !== undefined ? { status: req.query.status } : {}),
    ...(req.query.kind !== undefined ? { kind: req.query.kind } : {}),
    ...(req.query.afterId !== undefined ? { afterId: req.query.afterId } : {}),
    ...(req.query.limit !== undefined ? { limit: Number(req.query.limit) } : {}),
  })));
  app.patch('/api/sessions/:id/reports/:reportId', operation('kanvas_report_update', req => ({ ...sessionArgs(req), reportId: String(req.params.reportId) })));
  app.post('/api/sessions/:id/interactions', async (req, res) => send(res, (await service.interact((await browser(req)), String(req.params.id), bodyObject(req))), 201));
  app.post('/api/sessions/:id/interactions/:actionId/ack', async (req, res) => send(res, (await service.acknowledge((await browser(req)), String(req.params.id), String(req.params.actionId)))));
  app.post('/api/sessions/:id/members', operation('kanvas_member_add', sessionArgs));
  app.delete('/api/sessions/:id/members/:userId', operation('kanvas_member_remove', req => ({ ...sessionArgs(req), userId: String(req.params.userId) })));
  app.post('/api/sessions/:id/datasets', async (req, res) => {
    const principal = (await browser(req)), body = z.strictObject({ name: z.string(), csv: z.string().optional(), rows: z.unknown().optional(), json: z.string().optional(), source: z.unknown().optional() }).parse(bodyObject(req));
    send(res, (await service.dataset(principal, String(req.params.id), body as Parameters<KanvasService['dataset']>[2])), 201);
  });
  app.delete('/api/sessions/:id/datasets/:datasetId', operation('kanvas_dataset_delete', req => ({ ...sessionArgs(req), datasetId: String(req.params.datasetId) })));
  app.get('/api/sessions/:id/datasets/:datasetId', async (req, res) => send(res, (await service.readDataset((await browser(req)), String(req.params.id), String(req.params.datasetId)))));
  app.post('/api/sessions/:id/assets', async (req, res) => {
    const body = z.strictObject({ name: z.string(), mimeType: z.string(), base64: z.string() }).parse(bodyObject(req));
    send(res, (await service.importAsset((await browser(req)), String(req.params.id), body)), 201);
  });
  app.delete('/api/sessions/:id/assets/:assetId', operation('kanvas_asset_delete', req => ({ ...sessionArgs(req), assetId: String(req.params.assetId) })));
  (await app.get('/api/assets/:assetId', async (req, res) => {
    // Reusable captures and other already-readable media support the same scoped
    // publisher identity as MCP. This read-only route never creates a browser grant.
    const principal = req.get('authorization') ? (await auth.authorize(req)) : (await browser(req));
    const asset = (await service.asset(principal, String(req.params.assetId)));
    const row = required((await store.db.prepare('SELECT bytes FROM assets WHERE id=?').get(asset.id))) as {bytes:Uint8Array};
    const bytes = Buffer.from(row.bytes);
    res.set({ 'Content-Type': asset.mimeType, 'Accept-Ranges': 'bytes', 'Content-Disposition': `${asset.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(asset.name)}` });
    if(asset.mimeType==='image/svg+xml')res.set('Content-Security-Policy',"default-src 'none'; sandbox");
    const range = req.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { res.status(416).set('Content-Range', `bytes */${bytes.length}`).end(); return; }
      const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) { res.status(416).set('Content-Range', `bytes */${bytes.length}`).end(); return; }
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${bytes.length}`).send(bytes.subarray(start, end + 1)); return;
    }
    res.send(bytes);
  }));
  app.get('/api/sessions/:id/presentations', operation('kanvas_presentations_list', sessionArgs));
  app.post('/api/sessions/:id/presentations', operation('kanvas_presentation_create', sessionArgs));
  app.post('/api/sessions/:id/presentations/:deckId/cue', operation('kanvas_presentation_cue', req => ({ ...sessionArgs(req), deckId: String(req.params.deckId) })));
  app.post('/api/sessions/:id/end', operation('kanvas_session_end', sessionArgs));

  app.get('/api/tokens', async (req, res) => send(res, (await auth.tokenMetadata((await account(req)).userId))));
  app.post('/api/tokens', async (req, res) => {
    const principal = (await account(req, 'publish'));
    const body = z.strictObject({ name: z.string().trim().min(1).max(160), scopes: z.array(z.enum(['read', 'publish'])).min(1).max(2).default(['read', 'publish']), sessionIds: z.array(z.string().min(1).max(128)).min(1).max(100).optional() }).parse(bodyObject(req));
    if ((await auth.tokenMetadata(principal.userId)).length >= 100) throw new AppError('LIMIT_REACHED', 'Revoke an unused client before creating another.', 429);
    for (const sessionId of body.sessionIds ?? []) (await service.access(principal, sessionId, body.scopes.includes('publish') ? 'editor' : 'viewer'));
    const { value, token } = (await auth.issueToken(principal.userId, body.name, body.scopes, body.sessionIds));
    send(res, { id: token.id, name: token.name, scopes: token.scopes, sessionIds: token.sessionIds, createdAt: token.createdAt, token: value }, 201);
  });
  app.delete('/api/tokens/:id', async (req, res) => { const principal = (await account(req, 'publish')); (await auth.revokeToken(principal.userId, String(req.params.id))); for (const session of (await service.sessions(principal))) service.emit({ type: 'membership', sessionId: session.id }); send(res, { revoked: true }); });

  app.post('/api/flashcards/control',async(req,res)=>send(res,await service.flashcards.control(await account(req,'publish'),req.body)));
  mountPush(app,service.push,browser);
  mountFrontendDiagnostics(app,service.diagnostics,browser);
  mountClientCapture(app, service.clientCapture, browser);

  app.get('/api/sessions/:id/events', async (req, res) => {
    const principal = (await browser(req)), sessionId = String(req.params.id);
    (await service.access(principal, sessionId));
    const displayId = typeof req.query.displayId === 'string' ? req.query.displayId : principal.scopedDisplayId;
    if (displayId) (await service.display(principal, sessionId, displayId));
    limiter.take(`stream:${principal.browserId}`, 60, 60_000);
    const receiving=displayId&&!principal.captureOnly?(await service.experience.receiving.connect(principal,sessionId,displayId,typeof req.query.tabId==='string'?req.query.tabId:undefined,req.get('user-agent')??'',req.get('accept-language'),await requestContext(req))):undefined;
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); res.write(': connected\n\n');
    const targetWindow=displayId?(await service.devices.windows.forTab(principal,typeof req.query.tabId==='string'?req.query.tabId:undefined)):undefined;
    const windowReceiver=targetWindow?(await service.devices.windows.stream(principal,targetWindow.deviceId,targetWindow.id,data=>res.write(`event: window-command\ndata: ${JSON.stringify(data)}\n\n`))):undefined;
    let closed = false;
    const disconnectDisplay=displayId&&!principal.captureOnly?(await service.connectDisplay(principal,sessionId,displayId)):()=>{};
    const disconnect=async ()=>{windowReceiver?.close();receiving?.disconnect();(await disconnectDisplay());};
    const finish = async () => { if (closed) return; closed = true; clearInterval(heartbeat); unsubscribe(); unsubscribeRevocation(); streams.delete(finish); (await disconnect()); res.end(); };
    const unsubscribe = service.onEvent(async event => {
      if (closed || event.sessionId !== sessionId) return;
      if (event.type === 'ended') { res.write(`event: change\ndata: ${JSON.stringify({ type: 'ended', sessionId })}\n\n`); (await finish()); return; }
      try { (await service.access(principal, sessionId)); if (displayId) (await service.display(principal, sessionId, displayId)); } catch { (await finish()); return; }
      if (principal.scopedDisplayId && (event.displayId && event.displayId !== displayId || !['display', 'config', 'update', 'membership', 'identify'].includes(event.type))) return;
      const safe = { type: event.type, sessionId, ...(event.displayId ? { displayId: event.displayId } : {}), ...(event.revision !== undefined ? { revision: event.revision } : {}), ...(event.type === 'identify' && event.data && typeof event.data === 'object' ? { identify: event.data } : {}) };
      if (!res.write(`event: change\ndata: ${JSON.stringify(safe)}\n\n`)) (await finish());
    });
    const heartbeat = setInterval(async () => { try { (await service.access(principal, sessionId)); receiving?.touch(); (await windowReceiver?.push());res.write(': keepalive\n\n'); } catch { (await finish()); } }, 15_000); heartbeat.unref();
    const unsubscribeRevocation=auth.onBrowserRevoked(principal.browserId!,()=>{void finish();});
    streams.add(finish); req.on('close', () => { void finish().catch(() => {}); });
    // Setup above crosses asynchronous registration boundaries after headers
    // are sent. The peer can disconnect before the close listener is installed.
    if (req.destroyed || res.destroyed) { await finish(); return; }
    try{(await windowReceiver?.push());}catch{(await finish());}
  });

  const closeAccess=mountAccessFlows(app, { auth, store, publicUrl, browser, access: service.access, emit: service.emit,pairingFailedLimit:options.pairingFailedLimit,pairingLabel:options.pairingLabel });
  mountSharing(app, { auth, store, publicUrl, browser, access: service.access, emit: service.emit });
  app.all('/mcp/signup',(_req,res)=>res.status(410).json({error:{code:'SIGNUP_RETIRED',message:'Connect to /mcp using normal OAuth. OAuth already verifies and provisions the account. For standalone browser access, open the KANVAS root and sign in by email.'}}));
  const mcp = mountMcp(app, service, { profile, allowedHosts, allowedOrigins: [...origins], resourceMetadataUrl: `${publicUrl}/.well-known/oauth-protected-resource` });
  const staticDirectory = resolve(options.staticDirectory ?? 'dist/client');
  if (existsSync(resolve(staticDirectory, 'index.html'))) {
    app.use(express.static(staticDirectory, { index: false, dotfiles: 'deny', etag: false, cacheControl: false }));
    // Keep old bookmarks working; the user dashboard is now Console. A separate
    // console host serves it at /, while single-origin installations use /console.
    app.get('/admin',(req,res)=>res.redirect(302,`${adminOrigin?`${adminOrigin}/`:'/console'}${req.originalUrl.slice('/admin'.length)}`));
    app.get('/console',(req,res,next)=>{if(adminOrigin)return res.redirect(302,`${adminOrigin}/${req.originalUrl.slice('/console'.length)}`);next();});
    app.get('/',(req,res,next)=>{if(adminAddress&&req.hostname===adminAddress.hostname)return next();if(typeof req.query.session==='string'&&/^[A-Za-z0-9_-]+$/.test(req.query.session))return res.redirect(302,`${adminOrigin?`${adminOrigin}/`:'/console'}?session=${req.query.session}`);next();});
    app.get(['/', '/connect', '/console', '/start', '/session/:sessionId', '/view/:sessionId/:displayId', '/join/:shareId','/welcome/:invitationId'], (_req, res) => res.sendFile('index.html', { root: staticDirectory, dotfiles: 'deny' }));
  }
  app.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'This endpoint is unavailable.', 404)));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    const errorType = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    const known = error instanceof AppError ? error : error instanceof z.ZodError ? new AppError('INVALID_REQUEST', 'Request fields do not match the supported format.') : error instanceof RenderingError ? new AppError(error.code, safeRenderingError(error).message) : errorType === 'entity.too.large' ? new AppError('PAYLOAD_TOO_LARGE', 'Request exceeds the supported size limit.', 413) : errorType === 'entity.parse.failed' ? new AppError('INVALID_JSON', 'The request contains invalid JSON.') : new AppError('INTERNAL_ERROR', 'The request could not be completed.', 500);
    res.status(known.status).json({ error: { code: known.code, message: known.message.slice(0, 700), ...(error instanceof InputError ? { issues: error.issues, ...error.guidance } : error instanceof z.ZodError ? { issues: validationIssues(error) } : {}) } });
  });
  let closing = false;
  return { app, store, auth, service, async close() { if (closing) return; closing = true; await closePublic();await closeDevices();await closeAccess(); await Promise.allSettled([...streams].map(close=>Promise.resolve(close()))); await mcp.close(); await service.close(); (await store.close()); } };
}
