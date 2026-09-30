import { asyncMap, asyncSome } from './async-collections.js';
import { requestContext } from './request-context.js';
import { lifecycleNotice } from './lifecycle-notices.js';
import { NATO_WORDS, type RequestContext } from '../shared/recognition.js';
import { DisplayHistory } from './display-history.js';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { AssetRecord, DisplayRecord, SessionEvent, SessionRecord, ViewSpec } from '../shared/types.js';
import { Auth, hash, opaque, SCOPES, type AuthPrincipal, type BrowserSession, type OAuthAccessCredential, type OAuthRefreshCredential, type Token } from './auth.js';
import { AppError, id, now, required, Store } from './store.js';
import { shareForAdmission, SHARE_LIMITS } from './sharing.js';

export interface AccessFlowOptions {
  pairingFailedLimit?:number;
  pairingLabel?:()=>string;
  auth: Auth;
  store: Store;
  publicUrl: string;
  /** Authenticates the browser and checks CSRF on unsafe methods. */
  browser(request: Request): Promise<AuthPrincipal>;
  access(principal: AuthPrincipal, sessionId: string, role?: 'viewer' | 'editor' | 'owner'): Promise<SessionRecord>;
  /** Deliver only an invalidation; authorization is rechecked by the stream owner. */
  emit(event: SessionEvent): void;
}

export const ACCESS_LIMITS = Object.freeze({
  consentMs: 10 * 60_000,
  codeMs: 2 * 60_000,
  oauthTokenSeconds: 3600,
  oauthRefreshSeconds: 90 * 86400,
  oauthRefreshIdleSeconds: 30 * 86400,
  // Owners can notice a request late (feedback asked for about an hour).
  // This extends only the pending request, never grants access automatically.
  pairingMs: 60 * 60_000,
  pairedBrowserMs: 7 * 86400_000,
  maxSessionsPerGrant: 100,
  maxActiveTokensPerUser: 100,
  maxActiveTokensPerClient: 16,
  maxClients: 1024,
  maxPendingConsents: 2048,
  maxPendingPairingsPerSession: 16,
  maxActivePairingsPerSession: 128,
  pairingFailedLimit:50,
});

interface OAuthClient {
  id: string;
  clientName: string;
  redirectUris: string[];
  scopes: string[];
  /** Missing on pre-refresh registrations: their code-only profile is kept. */
  grantTypes?: ('authorization_code' | 'refresh_token')[];
  createdAt: string;
}
interface ConsentRequest {
  id: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  state?: string;
  challenge: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  decidedAt?: string;
  userId?: string;
}
interface AuthorizationCode {
  /** SHA-256 only; the bearer code is never persisted. */
  id: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: string[];
  sessionIds?: string[];
  /** Only a new explicit human decision can choose account-wide authority. */
  accessMode?: 'selected' | 'account';
  userId: string;
  challenge: string;
  expiresAt: number;
  usedAt?: string;
}
export interface PairingRecord {
  id: string;
  sessionId: string;
  displayId: string;
  ownerId: string;
  deviceName: string;
  selfName?:string;
  requestContext?:RequestContext;
  failedAttempts?:number;
  closeReason?:'label-collision'|'too-many-attempts';
  label: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked' | 'cancelled';
  proofHash: string;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  claimedAt?: string;
  browserSessionId?: string;
  grantExpiresAt?: number;
  shareId?: string;
  requestedInteractive?: boolean;
  interactive?: boolean;
}
interface RateRecord { id: string; count: number; expiresAt: number }

const COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const DAY = 86400_000;

class OAuthError extends Error {
  constructor(readonly error: string, message: string, readonly status = 400) { super(message); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID_REQUEST', 'A request object is required.');
  return value as Record<string, unknown>;
}
function string(value: unknown, field: string, max = 2048): string {
  if (typeof value !== 'string' || !value.length || value.length > max || CONTROL_CHARACTERS.test(value)) throw new AppError('INVALID_REQUEST', `A valid ${field} is required.`);
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new AppError('INVALID_REQUEST', 'A valid identifier is required.');
  return value;
}
function equal(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function noStore(response: Response): void {
  response.set('Cache-Control', 'no-store');
  response.set('Pragma', 'no-cache');
  response.set('Referrer-Policy', 'no-referrer');
}
function asOAuthError(error: unknown): OAuthError {
  if (error instanceof OAuthError) return error;
  if (error instanceof AppError) {
    if (error.status === 429) return new OAuthError('temporarily_unavailable', 'The request limit has been reached. Try again later.', 429);
    if (error.status >= 500) return new OAuthError('server_error', 'The authorization request could not be completed.', 500);
    return new OAuthError('invalid_request', error.message);
  }
  return new OAuthError('server_error', 'The authorization request could not be completed.', 500);
}
function sendOAuthError(response: Response, error: unknown): void {
  const failure = asOAuthError(error);
  if (failure.status === 429) response.set('Retry-After', '60');
  response.status(failure.status).json({ error: failure.error, error_description: failure.message });
}
function protocol(handler: (request: Request, response: Response) => void | Promise<void>): RequestHandler {
  return async (request, response) => {
    noStore(response);
    try { (await handler(request, response)); }
    catch (error) { sendOAuthError(response, error); }
  };
}
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}
function redirectAddress(value: unknown): string {
  const candidate = string(value, 'redirect URI');
  let url: URL;
  try { url = new URL(candidate); }
  catch { throw new OAuthError('invalid_client_metadata', 'The redirect URI is invalid.'); }
  if (url.username || url.password || candidate.includes('#') || /\s/.test(candidate) || !url.hostname ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname)))) {
    throw new OAuthError('invalid_client_metadata', 'Redirect URIs must use HTTPS, or HTTP on a loopback address, and cannot contain credentials or fragments.');
  }
  // Exact string matching is deliberate: no wildcard, path-prefix or arbitrary
  // redirect-port allowances are used during authorization or code exchange.
  return candidate;
}
function scopes(value: unknown, allowed: readonly string[] = SCOPES): string[] {
  const requested = value === undefined ? [...allowed] : string(value, 'scope', 100).split(' ');
  if (!requested.length || requested.some(item => !item || !allowed.includes(item))) throw new OAuthError('invalid_scope', 'Only the registered read and publish scopes are supported.');
  return [...new Set(requested)];
}
function oauthRedirect(redirectUri: string, state: string | undefined, issuer: string, values: Record<string, string>): string {
  const address = new URL(redirectUri);
  // A registered query string must not inject duplicate authorization results.
  for (const key of ['code', 'error', 'error_description', 'state', 'iss']) address.searchParams.delete(key);
  for (const [key, value] of Object.entries(values)) address.searchParams.set(key, value);
  if (state !== undefined) address.searchParams.set('state', state);
  address.searchParams.set('iss', issuer);
  return address.href;
}
export function pairingMetadata(pair: PairingRecord) {
  const { id, sessionId, displayId, deviceName, label, status, createdAt, expiresAt, decidedAt, shareId, requestedInteractive, interactive, grantExpiresAt } = pair;
  return { id, sessionId, displayId, deviceName, label, status, createdAt, expiresAt,selfName:pair.selfName,requestContext:pair.requestContext,failedAttempts:pair.failedAttempts??0,closeReason:pair.closeReason, ...(decidedAt ? { decidedAt } : {}),
    ...(shareId ? { shareId, requestedInteractive: requestedInteractive === true, interactive: interactive === true } : {}),
    ...(grantExpiresAt ? { grantExpiresAt } : {}),
  };
}

/** Only the currently rendered media slots grant a paired screen asset access.
 * A hidden dataset, an arbitrary string containing an asset path, a previous
 * view, or an off-screen presentation slide does not confer that permission.
 */
export async function pairedDisplayAllowsAsset(store: Store, principal: AuthPrincipal, asset: Pick<AssetRecord, 'id' | 'sessionId' | 'url'>): Promise<Awaited<boolean>> {
  if (!principal.browserId || !principal.pairingId || !principal.scopedDisplayId || principal.scopedSessionId !== asset.sessionId) return false;
  const pair = (await store.get<PairingRecord>('pairing', principal.pairingId));
  const browser = (await store.get<BrowserSession>('browser', principal.browserId));
  if (!pair || pair.status !== 'approved' || pair.ownerId !== principal.userId || pair.sessionId !== asset.sessionId ||
      pair.displayId !== principal.scopedDisplayId || pair.browserSessionId !== principal.browserId ||
      !pair.grantExpiresAt || pair.grantExpiresAt <= Date.now() || !browser || browser.expiresAt <= Date.now()) return false;
  const display = (await store.get<DisplayRecord>('display', principal.scopedDisplayId));
  if (!display?.view || display.sessionId !== asset.sessionId || asset.url !== `/api/assets/${asset.id}`) return false;
  const matches = (value: unknown) => typeof value === 'string' && value === asset.url;
  const images = (value: unknown) => Array.isArray(value) && value.some(image => image && typeof image === 'object' && matches((image as Record<string, unknown>).url));
  async function referenced(view: ViewSpec, depth = 0): Promise<Awaited<boolean>> {
    if (!view || !view.data || depth > 1) return false;
    const data = view.data;
    if (view.template === 'image' || view.template === 'document') return images(data.images);
    if (view.template === 'video') return matches(data.url) || matches(data.poster);
    if (view.template === 'web') return matches(data.snapshotUrl);
    if (['product','profile','quote','recipe'].includes(view.template)) return Boolean(data.image && typeof data.image === 'object' && matches((data.image as {url?:unknown}).url));
    if (view.template === 'join') return Boolean(data.qr&&typeof data.qr==='object'&&matches((data.qr as {url?:unknown}).url));
    if (view.template === 'menu') {
      const image=(v:unknown)=>Boolean(v&&typeof v==='object'&&(v as {image?:{url?:unknown}}).image&&matches((v as {image:{url?:unknown}}).image.url));
      return image(data)||Array.isArray(data.groups)&&data.groups.some(g=>image(g)||Array.isArray(g?.items)&&g.items.some(image));
    }
    if (view.template === 'leaderboard' && Array.isArray(data.items)) return data.items.some(item=>item && typeof item==='object' && (item as {image?:{url?:unknown}}).image && matches((item as {image:{url?:unknown}}).image.url));
    if(view.template==='overview'){
      // Publishing this aggregate explicitly exposes its retained image previews,
      // not arbitrary historical media, datasets or other session endpoints.
      const selected=Array.isArray(data.displayIds)?data.displayIds as string[]:undefined;
      const history=new DisplayHistory(store);
      return (await asyncSome((await store.list<DisplayRecord>('display',asset.sessionId)).filter(d=>!selected||selected.includes(d.id)), async d=>(await asyncSome((await history.list(d)).entries, async entry=>{
        let retained=(await history.target(d,undefined,entry.revision)).entry.view;
        if(retained?.template==='presentation')retained=(retained.data.slides as ViewSpec[])[Number(retained.data.index??0)];
        if(!retained||['overview','settings','display-grid'].includes(retained.template))return false;
        return (await referenced(retained,0));
      }))));
    }
    if (view.template === 'presentation' && Array.isArray(data.slides)) {
      const index = data.index === undefined ? 0 : data.index;
      if (!Number.isSafeInteger(index) || (index as number) < 0) return false;
      return (await referenced(data.slides[index as number] as ViewSpec, depth + 1));
    }
    return false;
  }
  return (await referenced(display.view));
}

/** Public OAuth protocol endpoints and protected human approval interfaces.
 * OAuth consent remains a human browser action. Display pairing also has a
 * separate owner-authorized MCP path, requiring an explicit confirmation;
 * invitation/feedback text alone never grants access.
 */
export function mountAccessFlows(app: Express, options: AccessFlowOptions): () => void {
  const { auth, store, browser, access, emit } = options;
  const failedLimit=options.pairingFailedLimit??ACCESS_LIMITS.pairingFailedLimit;
  if(!Number.isInteger(failedLimit)||failedLimit<10||failedLimit>200)throw new Error('Pairing failed-attempt limit must be 10–200.');
  const publicAddress = new URL(options.publicUrl);
  if (publicAddress.username || publicAddress.password || publicAddress.search || publicAddress.hash || publicAddress.pathname !== '/' ||
      (publicAddress.protocol !== 'https:' && !(publicAddress.protocol === 'http:' && isLoopback(publicAddress.hostname)))) {
    throw new Error('KANVAS publicUrl must be an HTTPS origin, or an HTTP loopback origin.');
  }
  const issuer = publicAddress.origin, resource = `${issuer}/mcp`;
  const proofCookie = auth.secure ? '__Host-kanvas-pairing' : 'kanvas-pairing';
  const proofOptions = { httpOnly: true, secure: auth.secure, sameSite: 'strict' as const, path: '/' };
  // Mount before MCP so unauthenticated clients discover the actual issuer.
  app.locals.mcpResourceMetadataUrl ??= `${issuer}/.well-known/oauth-protected-resource/mcp`;

  const fullBrowser = async (request: Request): Promise<AuthPrincipal> => {
    const principal = await browser(request);
    if (principal.scopedSessionId || principal.scopedDisplayId || principal.pairingId || principal.captureOnly || principal.tokenId || !principal.browserId) {
      throw new AppError('FORBIDDEN', 'Sign in with your account to manage access.', 403);
    }
    return principal;
  };
  const changed = async (pair: PairingRecord) => {
    const person=pair.selfName||pair.deviceName;
    const text=pair.status==='pending'?`${person} requests display access. Awaiting your approval.`:pair.status==='expired'?`${person}’s display request expired; a fresh request is needed.`:pair.closeReason==='label-collision'?`Ambiguous recognition labels: ${person} must request access again.`:pair.closeReason==='too-many-attempts'?`${person}’s display request closed after ${failedLimit} failed attempts.`:`${person}: display access ${pair.status}.`;
    (await lifecycleNotice(store,pair.sessionId,pair.displayId,`pair:${pair.id}:${pair.status}`,text,['expired','denied','cancelled','revoked'].includes(pair.status)?'warning':'info'));
    emit({type:'membership',sessionId:pair.sessionId,displayId:pair.displayId});
  };
  const expirePair = async (pair: PairingRecord): Promise<Awaited<PairingRecord>> => {
    let shareClosed = false;
    if (pair.shareId && ['pending', 'approved'].includes(pair.status)) {
      try { (await shareForAdmission(store, pair.shareId)); } catch { shareClosed = true; }
    }
    const expired = shareClosed || pair.status === 'pending' && Date.parse(pair.expiresAt) <= Date.now() ||
      pair.status === 'approved' && ((!pair.claimedAt && Date.parse(pair.expiresAt) <= Date.now()) || !pair.grantExpiresAt || pair.grantExpiresAt <= Date.now());
    if (expired) {
      pair.status = 'expired'; pair.decidedAt = now();
      (await store.put('pairing', pair));
      if (pair.browserSessionId) (await store.delete('browser', pair.browserSessionId));
      (await changed(pair));
    }
    return pair;
  };
  let lastPruned = 0;
  const prune = async () => {
    const time = Date.now();
    if (time - lastPruned < 60_000) return;
    lastPruned = time;
    for (const record of (await store.list<RateRecord>('access-rate'))) if (record.expiresAt <= time) (await store.delete('access-rate', record.id));
    for (const code of (await store.list<AuthorizationCode>('oauth-code'))) if (code.expiresAt <= time) (await store.delete('oauth-code', code.id));
    for (const credential of (await store.list<OAuthAccessCredential>('oauth-access'))) if (credential.expiresAt <= time) (await store.delete('oauth-access', credential.id));
    for (const credential of (await store.list<OAuthRefreshCredential>('oauth-refresh'))) {
      const token = (await store.get<Token>('token', credential.tokenId));
      // A used refresh digest is a replay tombstone until the WHOLE family
      // expires, even if that older credential's idle window has elapsed.
      if (!token?.refreshExpiresAt || token.refreshExpiresAt + DAY <= time) (await store.delete('oauth-refresh', credential.id));
    }
    for (const request of (await store.list<ConsentRequest>('oauth-consent'))) if (Date.parse(request.expiresAt) + DAY <= time) (await store.delete('oauth-consent', request.id));
    for (const record of (await store.list<PairingRecord>('pairing'))) {
      const pair = (await expirePair(record));
      if (!['pending', 'approved'].includes(pair.status) && Date.parse(pair.decidedAt ?? pair.expiresAt) + DAY <= time) (await store.delete('pairing', pair.id));
    }
  };
  const rate = async (request: Request, purpose: string, max: number, windowMs: number) => {
    (await prune());
    // IP addresses are neither returned nor retained in cleartext. The app,
    // not caller-supplied forwarding headers, controls Express proxy trust.
    const key = hash(`${purpose}\0${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`);
    const existing = (await store.get<RateRecord>('access-rate', key)), time = Date.now();
    const record = existing && existing.expiresAt > time ? existing : { id: key, count: 0, expiresAt: time + windowMs };
    if (record.count >= max || (!existing && (await store.list<RateRecord>('access-rate')).length >= 4096)) throw new AppError('RATE_LIMITED', 'Too many access requests. Try again later.', 429);
    record.count++; (await store.put('access-rate', record));
  };
  const consent = async (requestId: unknown): Promise<Awaited<ConsentRequest>> => {
    const request = required((await store.get<ConsentRequest>('oauth-consent', identifier(requestId))), 'This connection request is unavailable.');
    if (request.status === 'pending' && Date.parse(request.expiresAt) <= Date.now()) {
      request.status = 'expired'; (await store.put('oauth-consent', request));
    }
    if (request.status !== 'pending') throw new AppError('REQUEST_CLOSED', 'This connection request was already completed or expired. Connect again from your client.', 410);
    return request;
  };
  const selectedSessions = async (value: unknown, principal: AuthPrincipal, requestedScopes: string[]): Promise<string[]> => {
    if (!Array.isArray(value) || !value.length || value.length > ACCESS_LIMITS.maxSessionsPerGrant) throw new AppError('INVALID_SCOPE', 'Select between 1 and 100 sessions.');
    const sessionIds = [...new Set(value.map(identifier))];
    for (const sessionId of sessionIds) await access(principal, sessionId, requestedScopes.includes('publish') ? 'editor' : 'viewer');
    return sessionIds;
  };
  const refreshable = (client: OAuthClient): boolean => client.grantTypes?.includes('refresh_token') === true;
  const invalidateConnection = async (token: Token) => {
    for (const session of (await store.list<SessionRecord>('session'))) {
      if (token.sessionIds && !token.sessionIds.includes(session.id)) continue;
      try { await access({ userId: token.userId }, session.id); }
      catch { continue; }
      emit({ type: 'membership', sessionId: session.id });
    }
  };
  /** Called only inside the code/refresh exchange transaction. The connection
   * identity and its original consent boundaries never rotate or widen. */
  const mintOAuthCredentials = async (token: Token, grantedScopes: string[], accessValue = opaque()) => {
    const time = Date.now();
    let refreshValue: string | undefined;
    if (token.refreshExpiresAt !== undefined) {
      token.refreshIdleExpiresAt = Math.min(token.refreshExpiresAt, time + ACCESS_LIMITS.oauthRefreshIdleSeconds * 1000);
      refreshValue = opaque();
      const refresh: OAuthRefreshCredential = {
        id: hash(refreshValue), tokenId: token.id, scopes: [...grantedScopes],
        expiresAt: token.refreshIdleExpiresAt, createdAt: now(),
      };
      (await store.put('oauth-refresh', refresh));
    }
    const expiresAt = Math.min(time + ACCESS_LIMITS.oauthTokenSeconds * 1000, token.refreshExpiresAt ?? Infinity, token.refreshIdleExpiresAt ?? Infinity);
    const credential: OAuthAccessCredential = { id: hash(accessValue), tokenId: token.id, scopes: [...grantedScopes], expiresAt };
    token.expiresAt = Math.max(token.expiresAt, expiresAt);
    (await store.put('oauth-access', credential)); (await store.put('token', token));
    return { access_token: accessValue, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((expiresAt - time) / 1000)), scope: grantedScopes.join(' '),
      ...(refreshValue ? { refresh_token: refreshValue } : {}),
    };
  };
  const requireProof = async (request: Request): Promise<Awaited<PairingRecord>> => {
    const proof:unknown=request.cookies?.[proofCookie],pair=(await store.get<PairingRecord>('pairing',identifier(request.params.id)));
    if(!pair)throw new AppError('NOT_FOUND','This screen request is unavailable.',404);
    const current=(await expirePair(pair));
    if(typeof proof!=='string'||!COOKIE_VALUE.test(proof)||!equal(current.proofHash,hash(proof))){
      if(current.status==='pending'||current.status==='approved'&&!current.claimedAt){
        current.failedAttempts=(current.failedAttempts??0)+1;
        if(current.failedAttempts>=failedLimit){current.status='cancelled';current.closeReason='too-many-attempts';current.decidedAt=now();if(current.browserSessionId)(await store.delete('browser',current.browserSessionId));}
        (await store.put('pairing',current));
        if(current.failedAttempts===1)(await lifecycleNotice(store,current.sessionId,current.displayId,`pair:${current.id}:failed`,'A display request received an invalid browser proof. No access was granted.','warning'));
        if(current.status==='cancelled')(await changed(current));
      }
      throw new AppError('UNAUTHORIZED','Open the original screen to manage this request.',401);
    }
    return current;
  };
  const ownerPair = async (request: Request): Promise<Awaited<PairingRecord>> => {
    const principal = (await fullBrowser(request));
    const pair = required((await store.get<PairingRecord>('pairing', identifier(request.params.id))), 'This screen request is unavailable.');
    const session = await access(principal, pair.sessionId, 'owner');
    if (pair.ownerId !== principal.userId || session.ownerId !== pair.ownerId) throw new AppError('NOT_FOUND', 'This screen request is unavailable.', 404);
    return (await expirePair(pair));
  };

  app.get('/.well-known/oauth-authorization-server', protocol((_request, response) => {
    response.json({
      issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`, registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`, revocation_endpoint_auth_methods_supported: ['none'],
      response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'], scopes_supported: SCOPES,
      code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true,
    });
  }));
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], protocol((_request, response) => {
    response.json({ resource, authorization_servers: [issuer], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'KANVAS MCP' });
  }));
  app.post('/oauth/register', protocol(async (request, response) => {
    (await rate(request, 'oauth-register', 20, 60 * 60_000));
    const body = object(request.body);
    if (JSON.stringify(body).length > 16_384) throw new OAuthError('invalid_client_metadata', 'Client metadata exceeds the supported size.');
    if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 8) throw new OAuthError('invalid_client_metadata', 'Register between 1 and 8 exact redirect URIs.');
    // Respect the requested profile. Omitted grant_types defaults to code-only
    // (RFC 7591); registering refresh support does not itself grant authority.
    if ((body.token_endpoint_auth_method ?? 'none') !== 'none' ||
        (body.grant_types !== undefined && (!Array.isArray(body.grant_types) || !body.grant_types.includes('authorization_code') ||
          body.grant_types.length > 2 || new Set(body.grant_types).size !== body.grant_types.length ||
          body.grant_types.some(grant => grant !== 'authorization_code' && grant !== 'refresh_token'))) ||
        (body.response_types !== undefined && (!Array.isArray(body.response_types) || body.response_types.length !== 1 || body.response_types[0] !== 'code'))) {
      throw new OAuthError('invalid_client_metadata', 'Only public authorization-code clients with S256 PKCE are supported.');
    }
    const clientName = body.client_name === undefined ? 'MCP client' : string(body.client_name, 'client name', 120).trim();
    if (!clientName) throw new OAuthError('invalid_client_metadata', 'Provide a client name.');
    const grantTypes: OAuthClient['grantTypes'] = Array.isArray(body.grant_types) && body.grant_types.includes('refresh_token') ? ['authorization_code', 'refresh_token'] : ['authorization_code'];
    const client: OAuthClient = { id: id(), clientName, redirectUris: [...new Set(body.redirect_uris.map(redirectAddress))], scopes: scopes(body.scope), grantTypes, createdAt: now() };
    if ((await store.list<OAuthClient>('oauth-client')).length >= ACCESS_LIMITS.maxClients) throw new OAuthError('temporarily_unavailable', 'The client registration limit has been reached.', 429);
    (await store.put('oauth-client', client));
    response.status(201).json({ client_id: client.id, client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000), client_name: client.clientName, redirect_uris: client.redirectUris, token_endpoint_auth_method: 'none', grant_types: client.grantTypes, response_types: ['code'], scope: client.scopes.join(' ') });
  }));

  app.get('/oauth/authorize', protocol(async (request, response) => {
    let redirectUri: string | undefined, state: string | undefined;
    try {
      (await rate(request, 'oauth-authorize', 60, 10 * 60_000));
      const query = object(request.query), clientId = identifier(query.client_id);
      const client = (await store.get<OAuthClient>('oauth-client', clientId));
      const candidateRedirect = string(query.redirect_uri, 'redirect URI');
      if (!client || !client.redirectUris.includes(candidateRedirect)) throw new OAuthError('invalid_request', 'The client or its exact redirect URI is not registered.');
      redirectUri = candidateRedirect;
      if (query.state !== undefined) state = string(query.state, 'state', 1024);
      if (query.response_type !== 'code') throw new OAuthError('unsupported_response_type', 'Only the authorization code response is supported.');
      if (query.response_mode !== undefined && query.response_mode !== 'query') throw new OAuthError('invalid_request', 'Only the query response mode is supported.');
      if (query.code_challenge_method !== 'S256' || typeof query.code_challenge !== 'string' || !COOKIE_VALUE.test(query.code_challenge)) throw new OAuthError('invalid_request', 'S256 PKCE with a valid code challenge is required.');
      if (query.resource !== resource) throw new OAuthError('invalid_target', 'The resource must be this KANVAS MCP endpoint.');
      const requestedScopes = scopes(query.scope, client.scopes);
      if ((await store.list<ConsentRequest>('oauth-consent')).filter(item => item.status === 'pending' && Date.parse(item.expiresAt) > Date.now()).length >= ACCESS_LIMITS.maxPendingConsents) {
        throw new OAuthError('temporarily_unavailable', 'The authorization request limit has been reached.', 429);
      }
      const pending: ConsentRequest = { id: id(), clientId, redirectUri, resource, scopes: requestedScopes, state, challenge: query.code_challenge, createdAt: now(), expiresAt: new Date(Date.now() + ACCESS_LIMITS.consentMs).toISOString(), status: 'pending' };
      (await store.put('oauth-consent', pending));
      response.redirect(303, `${issuer}/?authorize=${encodeURIComponent(pending.id)}`);
    } catch (error) {
      const failure = asOAuthError(error);
      if (!redirectUri || failure.status >= 500 || failure.status === 429) throw failure;
      response.redirect(303, oauthRedirect(redirectUri, state, issuer, { error: failure.error, error_description: failure.message }));
    }
  }));

  app.get('/api/oauth/requests/:id', async (request, response) => {
    noStore(response); (await fullBrowser(request));
    const pending = (await consent(request.params.id));
    const client = required((await store.get<OAuthClient>('oauth-client', pending.clientId)), 'This client connection is unavailable.');
    response.json({ data: { id: pending.id, clientId: client.id, clientName: client.clientName, scopes: pending.scopes, expiresAt: pending.expiresAt, redirectUri: pending.redirectUri, resource: pending.resource, accessModes: ['selected', 'account'], refreshable: refreshable(client) } });
  });
  app.post('/api/oauth/approve', async (request, response) => {
    noStore(response);
    const principal = (await fullBrowser(request));
    (await rate(request, 'oauth-consent', 90, 10 * 60_000));
    const body = object(request.body);
    if (typeof body.approve !== 'boolean') throw new AppError('INVALID_REQUEST', 'An explicit approval or denial is required.');
    const result = (await store.transaction(async () => {
      const pending = (await consent(body.requestId));
      required((await store.get<OAuthClient>('oauth-client', pending.clientId)), 'This client connection is unavailable.');
      pending.userId = principal.userId; pending.decidedAt = now();
      if (!body.approve) {
        pending.status = 'denied'; (await store.put('oauth-consent', pending));
        return oauthRedirect(pending.redirectUri, pending.state, issuer, { error: 'access_denied', error_description: 'The account holder declined this connection.' });
      }
      const accessMode = body.accessMode ?? 'selected';
      if (accessMode !== 'selected' && accessMode !== 'account') throw new AppError('INVALID_SCOPE', 'Choose selected-session or account access explicitly.');
      if (accessMode === 'account' && body.sessionIds !== undefined) throw new AppError('INVALID_SCOPE', 'Account access and a selected-session restriction cannot be combined.');
      const sessionIds = accessMode === 'account' ? undefined : (await selectedSessions(body.sessionIds, principal, pending.scopes)), code = opaque();
      const grant: AuthorizationCode = { id: hash(code), clientId: pending.clientId, redirectUri: pending.redirectUri, resource: pending.resource, scopes: pending.scopes, sessionIds, accessMode, userId: principal.userId, challenge: pending.challenge, expiresAt: Date.now() + ACCESS_LIMITS.codeMs };
      pending.status = 'approved';
      (await store.put('oauth-code', grant)); (await store.put('oauth-consent', pending));
      return oauthRedirect(pending.redirectUri, pending.state, issuer, { code });
    }));
    response.json({ data: { redirectUri: result } });
  });
  app.post('/oauth/token', protocol(async (request, response) => {
    (await rate(request, 'oauth-token', 120, 10 * 60_000));
    const body = object(request.body);
    if (request.get('authorization') || body.client_secret !== undefined) throw new OAuthError('invalid_client', 'This endpoint accepts registered public PKCE clients, not client credentials.');
    if (body.grant_type === 'refresh_token') {
      const clientId = identifier(body.client_id);
      if (typeof body.refresh_token !== 'string' || !COOKIE_VALUE.test(body.refresh_token)) throw new OAuthError('invalid_grant', 'The refresh credential is invalid. Reconnect from your client.');
      // A single-resource refresh may omit resource (RFC 8707). It remains
      // bound to the original MCP audience; another audience is never allowed.
      if (body.resource !== undefined && body.resource !== resource) throw new OAuthError('invalid_target', 'The resource must be this KANVAS MCP endpoint.');
      if (body.sessionIds !== undefined || body.accessMode !== undefined) throw new OAuthError('invalid_request', 'Changing session access requires a new human approval.');
      const digest = hash(body.refresh_token);
      const result = (await store.transaction(async () => {
        const credential = (await store.get<OAuthRefreshCredential>('oauth-refresh', digest));
        const token = credential ? (await store.get<Token>('token', credential.tokenId)) : undefined;
        const client = (await store.get<OAuthClient>('oauth-client', clientId));
        if (!credential || !token || !client || !refreshable(client) || token.clientId !== clientId || token.resource !== resource || !(await auth.user(token.userId))) {
          throw new OAuthError('invalid_grant', 'The refresh credential is invalid or belongs to a different connection. Reconnect from your client.');
        }
        if (credential.usedAt) {
          // Commit revocation before returning invalid_grant. Throwing here
          // would roll it back and let a replayed family remain usable.
          token.revoked = true; (await store.put('token', token));
          return { revoked: token };
        }
        if (token.revoked || credential.expiresAt <= Date.now() || !token.refreshExpiresAt ||
            Math.min(token.refreshExpiresAt, token.refreshIdleExpiresAt ?? 0) <= Date.now()) {
          throw new OAuthError('invalid_grant', 'This connection expired or was revoked. Reconnect from your client.');
        }
        // A refresh can reduce its scopes, but cannot widen them again on the
        // next rotation. The original human session selection never changes.
        const permitted = credential.scopes.filter(scope => token.scopes.includes(scope));
        const grantedScopes = scopes(body.scope, permitted);
        const issued = (await mintOAuthCredentials(token, grantedScopes));
        credential.usedAt = now(); (await store.put('oauth-refresh', credential));
        return { issued };
      }));
      if (result.revoked) {
        (await invalidateConnection(result.revoked));
        throw new OAuthError('invalid_grant', 'This refresh credential was already used. The connection was revoked; reconnect from your client.');
      }
      response.json(result.issued);
      return;
    }
    if (body.grant_type !== 'authorization_code') throw new OAuthError('unsupported_grant_type', 'Only authorization-code and registered refresh-token exchanges are supported.');
    const clientId = identifier(body.client_id), redirectUri = string(body.redirect_uri, 'redirect URI');
    if (typeof body.code !== 'string' || !COOKIE_VALUE.test(body.code) || typeof body.code_verifier !== 'string' || !VERIFIER.test(body.code_verifier)) throw new OAuthError('invalid_grant', 'The authorization code or its verifier is invalid.');
    if (body.resource !== resource) throw new OAuthError('invalid_target', 'The resource must be this KANVAS MCP endpoint.');
    const digest = hash(body.code), challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
    const issued = (await store.transaction(async () => {
      const grant = (await store.get<AuthorizationCode>('oauth-code', digest)), client = (await store.get<OAuthClient>('oauth-client', clientId));
      if (!grant || grant.usedAt || grant.expiresAt <= Date.now() || !client || !(await auth.user(grant.userId)) ||
          grant.clientId !== clientId || grant.redirectUri !== redirectUri || !client.redirectUris.includes(redirectUri) || grant.resource !== resource || !equal(grant.challenge, challenge)) {
        throw new OAuthError('invalid_grant', 'The authorization code is invalid, expired, already used, or bound to a different request.');
      }
      // Consent does not freeze membership: revocation/end before exchange
      // cannot mint a working connection, and actions recheck it afterwards.
      try {
        if (grant.accessMode === 'account') {
          if (grant.sessionIds !== undefined) throw new Error('Inconsistent account grant.');
        } else await selectedSessions(grant.sessionIds, { userId: grant.userId }, grant.scopes);
      }
      catch { throw new OAuthError('invalid_grant', 'The approved session access is no longer available.'); }
      const active = (await store.list<Token>('token')).filter(token => token.userId === grant.userId && !token.revoked &&
        (token.expiresAt > Date.now() || Math.min(token.refreshExpiresAt ?? 0, token.refreshIdleExpiresAt ?? 0) > Date.now()));
      if (active.length >= ACCESS_LIMITS.maxActiveTokensPerUser || active.filter(token => token.clientId === clientId).length >= ACCESS_LIMITS.maxActiveTokensPerClient) throw new OAuthError('temporarily_unavailable', 'Revoke an unused connection before creating another.', 429);
      const connection = (await auth.issueToken(grant.userId, client.clientName, grant.scopes, grant.sessionIds, clientId, ACCESS_LIMITS.oauthTokenSeconds));
      connection.token.resource = resource;
      if (refreshable(client)) connection.token.refreshExpiresAt = Date.now() + ACCESS_LIMITS.oauthRefreshSeconds * 1000;
      const token = (await mintOAuthCredentials(connection.token, grant.scopes, connection.value));
      grant.usedAt = now(); (await store.put('oauth-code', grant));
      return token;
    }));
    response.json(issued);
  }));

  app.post('/oauth/revoke', protocol(async (request, response) => {
    (await rate(request, 'oauth-revoke', 120, 10 * 60_000));
    const body = object(request.body);
    if (request.get('authorization') || body.client_secret !== undefined) throw new OAuthError('invalid_client', 'Only registered public clients are supported.');
    const clientId = identifier(body.client_id);
    if (!(await store.get<OAuthClient>('oauth-client', clientId))) throw new OAuthError('invalid_client', 'The client is not registered.');
    const value = string(body.token, 'token', 300), digest = hash(value);
    // RFC 7009: an unknown token (including one belonging to another client)
    // succeeds without revealing whether that credential exists.
    const credential = (await store.get<OAuthRefreshCredential>('oauth-refresh', digest)) ?? (await store.get<OAuthAccessCredential>('oauth-access', digest));
    const token = credential ? (await store.get<Token>('token', credential.tokenId)) : (await store.list<Token>('token')).find(item => !item.resource && item.hash === digest);
    if (token?.clientId === clientId) {
      (await auth.revokeToken(token.userId, token.id));
      (await invalidateConnection(token));
    }
    response.status(200).end();
  }));

  app.post('/api/pairings', async (request, response) => {
    noStore(response);
    const body = object(request.body);
    (await rate(request, body.shareId === undefined ? 'pairing-create' : 'share-pairing-create', body.shareId === undefined ? 20 : 120, 10 * 60_000));
    const share = body.shareId === undefined ? undefined : (await shareForAdmission(store, identifier(body.shareId)));
    const sessionId = share?.sessionId ?? identifier(body.sessionId), displayId = share?.displayId ?? identifier(body.displayId);
    if (share && (body.sessionId !== undefined && body.sessionId !== share.sessionId || body.displayId !== undefined && body.displayId !== share.displayId)) throw new AppError('INVALID_REQUEST', 'This invitation is for one specific display.');
    if (body.requestedInteractive !== undefined && typeof body.requestedInteractive !== 'boolean' || body.interactive !== undefined || body.participantId !== undefined || body.userId !== undefined) throw new AppError('INVALID_REQUEST', 'Guest identity and approval are assigned by the server.');
    const requestedInteractive = body.requestedInteractive === true;
    if (requestedInteractive && !share?.allowInteraction) throw new AppError('FORBIDDEN', 'This invitation permits view-only access.', 403);
    const deviceName = body.deviceName === undefined || body.deviceName === '' ? 'Shared screen' : string(body.deviceName, 'screen name', 80).trim()||'Shared screen';
    const selfName=body.selfName===undefined||body.selfName===''?undefined:string(body.selfName,'your name',80).trim()||undefined;
    const context=await requestContext(request);
    const session = (await store.get<SessionRecord>('session', sessionId)), display = (await store.get<DisplayRecord>('display', displayId));
    if (!session || session.endedAt || !display || display.sessionId !== session.id) throw new AppError('NOT_FOUND', 'This screen is unavailable.', 404);
    // A pairing exchange must not silently replace a real account's login.
    try {
      (await auth.browser(request));
      throw new AppError('ALREADY_SIGNED_IN', 'Sign out before requesting access for a shared screen.', 409);
    } catch (error) { if (!(error instanceof AppError) || error.status !== 401) throw error; }
    const proof = opaque(), time = Date.now();
    const pair: PairingRecord = { id: id(), sessionId, displayId, ownerId: session.ownerId, deviceName,selfName,requestContext:context, label: '', status: 'pending', proofHash: hash(proof), createdAt: now(), expiresAt: new Date(Math.min(time + ACCESS_LIMITS.pairingMs, share ? Date.parse(share.expiresAt) : Infinity)).toISOString(),
      ...(share ? { shareId: share.id, requestedInteractive, interactive: false } : {}),
    };
    const replaced: PairingRecord[] = [];
    (await store.transaction(async () => {
      const oldProof: unknown = request.cookies?.[proofCookie];
      if (typeof oldProof === 'string' && COOKIE_VALUE.test(oldProof)) {
        for (const prior of (await store.list<PairingRecord>('pairing'))) {
          if (equal(prior.proofHash, hash(oldProof)) && (prior.status === 'pending' || prior.status === 'approved' && !prior.claimedAt)) {
            prior.status = 'cancelled'; prior.decidedAt = now(); (await store.put('pairing', prior)); replaced.push(prior);
          }
        }
      }
      const existing = (await store.list<PairingRecord>('pairing', sessionId));
      if (existing.filter(item => item.status === 'pending' && Date.parse(item.expiresAt) > time).length >= (share ? SHARE_LIMITS.maxPendingPerSession : ACCESS_LIMITS.maxPendingPairingsPerSession) ||
          existing.filter(item => item.status === 'approved' && (item.grantExpiresAt ?? 0) > time).length >= ACCESS_LIMITS.maxActivePairingsPerSession) {
        throw new AppError('RATE_LIMITED', 'This session has too many active screen requests. Ask its owner to review them.', 429);
      }
      pair.label=options.pairingLabel?.()??`${NATO_WORDS[randomInt(26)]} ${NATO_WORDS[randomInt(26)]}`;
      const collisions=(await store.list<PairingRecord>('pairing')).filter(item=>item.label===pair.label&&Date.parse(item.expiresAt)>time&&(item.status==='pending'||item.status==='approved'&&!item.claimedAt));
      if(collisions.length){
        for(const other of [...collisions,pair]){other.status='cancelled';other.closeReason='label-collision';other.decidedAt=now();if(other.browserSessionId)(await store.delete('browser',other.browserSessionId));(await store.put('pairing',other));if(other!==pair)replaced.push(other);}
      }
      (await store.put('pairing', pair));
    }));
    response.cookie(proofCookie, proof, { ...proofOptions, maxAge: ACCESS_LIMITS.pairingMs });
    for (const prior of replaced) (await changed(prior));
    (await changed(pair));
    response.status(201).json({ data: pairingMetadata(pair) });
  });
  app.get('/api/pairings/:id/status', async (request, response) => {
    noStore(response);
    let pair = (await requireProof(request));
    if (pair.status === 'approved') {
      const session = (await store.get<SessionRecord>('session', pair.sessionId)), display = (await store.get<DisplayRecord>('display', pair.displayId));
      if (!session || session.endedAt || session.ownerId !== pair.ownerId || !display || display.sessionId !== pair.sessionId) {
        pair.status = 'revoked'; pair.decidedAt = now(); (await store.put('pairing', pair));
        if (pair.browserSessionId) (await store.delete('browser', pair.browserSessionId));
        (await changed(pair));
      } else if (!pair.claimedAt) {
        // A browser that signed in while approval was pending keeps its own
        // identity; polling cannot log it in as the session owner.
        try {
          (await auth.browser(request));
          throw new AppError('ALREADY_SIGNED_IN', 'This browser is already signed in. Open the display using that account.', 409);
        } catch (error) { if (!(error instanceof AppError) || error.status !== 401) throw error; }
        pair = (await store.transaction(async () => {
          const current = required((await store.get<PairingRecord>('pairing', pair.id)));
          if (current.status !== 'approved' || current.claimedAt || Date.parse(current.expiresAt) <= Date.now()) throw new AppError('REQUEST_CLOSED', 'This screen request was already used or expired.', 410);
          const viewer = (await auth.issueBrowser(current.ownerId, response, { scopedSessionId: current.sessionId, scopedDisplayId: current.displayId, pairingId: current.id, interactive: current.interactive === true }));
          viewer.expiresAt = Math.min(viewer.expiresAt, current.grantExpiresAt ?? 0); (await store.put('browser', viewer));
          current.claimedAt = now(); current.browserSessionId = viewer.id; (await store.put('pairing', current));
          return current;
        }));
      } else {
        const current = (await auth.browser(request));
        if (current.session.id !== pair.browserSessionId || current.principal.pairingId !== pair.id) throw new AppError('UNAUTHORIZED', 'This approval has already been claimed by its original browser.', 401);
      }
    }
    response.json({ data: pairingMetadata(pair) });
  });
  app.post('/api/pairings/:id/details',async (request,response)=>{
    noStore(response);const pair=(await requireProof(request)),body=object(request.body);
    if(pair.status!=='pending')throw new AppError('REQUEST_CLOSED','Only a pending request can be labelled.',409);
    const name=body.selfName===undefined||body.selfName===''?undefined:string(body.selfName,'your name',80).trim()||undefined;
    pair.selfName=name;(await store.put('pairing',pair));(await changed(pair));response.json({data:pairingMetadata(pair)});
  });
  app.post('/api/pairings/:id/cancel', async (request, response) => {
    noStore(response);
    const pair = (await requireProof(request));
    if (pair.status === 'pending' || pair.status === 'approved') {
      pair.status = 'cancelled'; pair.decidedAt = now(); (await store.put('pairing', pair));
      if (pair.browserSessionId) (await store.delete('browser', pair.browserSessionId));
      (await changed(pair));
    }
    response.clearCookie(proofCookie, proofOptions);
    response.json({ data: pairingMetadata(pair) });
  });
  app.get('/api/sessions/:sessionId/pairings', async (request, response) => {
    noStore(response);
    const principal = (await fullBrowser(request)), sessionId = identifier(request.params.sessionId);
    await access(principal, sessionId, 'owner');
    response.json({ data: (await asyncMap((await store.list<PairingRecord>('pairing', sessionId)), expirePair)).map(pairingMetadata) });
  });
  app.post('/api/pairings/:id/decision', async (request, response) => {
    noStore(response);
    // Invalid attempts are rate-limited even when owner authorization fails.
    (await rate(request, 'pairing-decision', 240, 10 * 60_000));
    const pair = (await ownerPair(request)), body = object(request.body);
    if (typeof body.approve !== 'boolean') throw new AppError('INVALID_REQUEST', 'An explicit approval or denial is required.');
    if (body.interactive !== undefined && typeof body.interactive !== 'boolean') throw new AppError('INVALID_REQUEST', 'Choose interactive access explicitly.');
    if (pair.status !== 'pending') throw new AppError('REQUEST_CLOSED', 'This screen request was already completed or expired.', 409);
    const display = (await store.get<DisplayRecord>('display', pair.displayId));
    if (!display || display.sessionId !== pair.sessionId) throw new AppError('NOT_FOUND', 'This screen is unavailable.', 404);
    (await store.transaction(async () => {
      const current = required((await store.get<PairingRecord>('pairing', pair.id)));
      if (current.status !== 'pending' || Date.parse(current.expiresAt) <= Date.now()) throw new AppError('REQUEST_CLOSED', 'This screen request was already completed or expired.', 409);
      const share = current.shareId ? (await shareForAdmission(store, current.shareId)) : undefined;
      if (body.approve && body.interactive === true && (!current.requestedInteractive || !share?.allowInteraction)) throw new AppError('FORBIDDEN', 'This browser did not request permitted interactive access.', 403);
      if (body.approve && (await store.list<PairingRecord>('pairing', pair.sessionId)).filter(item => item.status === 'approved' && (item.grantExpiresAt ?? 0) > Date.now()).length >= ACCESS_LIMITS.maxActivePairingsPerSession) {
        throw new AppError('RATE_LIMITED', 'Revoke an unused screen before approving another.', 429);
      }
      current.status = body.approve ? 'approved' : 'denied'; current.decidedAt = now();
      if (body.approve) {
        current.grantExpiresAt = Math.min(Date.now() + ACCESS_LIMITS.pairedBrowserMs, share ? Date.parse(share.expiresAt) : Infinity);
        current.interactive = body.interactive === true;
      }
      (await store.put('pairing', current)); Object.assign(pair, current);
    }));
    (await changed(pair));
    response.json({ data: pairingMetadata(pair) });
  });
  app.delete('/api/pairings/:id', async (request, response) => {
    noStore(response);
    const pair = (await ownerPair(request));
    if (pair.status === 'approved' || pair.status === 'pending') {
      pair.status = 'revoked'; pair.decidedAt = now();
      (await store.transaction(async () => { (await store.put('pairing', pair)); if (pair.browserSessionId) (await store.delete('browser', pair.browserSessionId)); }));
      (await changed(pair));
    }
    response.json({ data: pairingMetadata(pair) });
  });
  const sweep=setInterval(async ()=>{for(const pair of (await store.list<PairingRecord>('pairing')))if(['pending','approved'].includes(pair.status))(await expirePair(pair));(await prune());},5000);sweep.unref();
  return ()=>clearInterval(sweep);
}
