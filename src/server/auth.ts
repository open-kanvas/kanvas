import { EventEmitter } from 'node:events';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Principal } from '../shared/types.js';
import { avatarUrl, saveAccountImage } from './account-images.js';
import { AppError, id, now, required, Store } from './store.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export interface User { id: string; username: string; displayName: string; avatarUrl?: string }
export interface AuthPrincipal extends Principal { browserId?: string; receiverDeviceId?: string; scopedSessionId?: string; scopedDisplayId?: string; pairingId?: string; captureOnly?: boolean; oauthAccessId?: string; interactive?: boolean; participantId?: string }
export interface BrowserSessionPolicy { idleDays?: number; absoluteDays?: number; renewalHours?: number; freshMinutes?: number }
export const fullBrowser = (session: BrowserSession) => !session.scopedSessionId && !session.scopedDisplayId && !session.pairingId && !session.captureOnly && !session.receiverDeviceId;
export interface BrowserSession { publicId?: string; lastActiveAt?: string; idleExpiresAt?: number; absoluteExpiresAt?: number; authenticatedAt?: number; renewedAt?: number; device?: string; browser?: string; origin?: string; createdAt?: string; id: string; receiverDeviceId?: string; userId: string; csrf: string; expiresAt: number; scopedSessionId?: string; scopedDisplayId?: string; pairingId?: string; captureOnly?: boolean; interactive?: boolean }
/** The stable client connection, not an individual rotating credential. Legacy
 * publisher/OAuth tokens without resource keep their original hash and expiry. */
export interface Token { id: string; userId: string; agentId: string; name: string; hash: string; scopes: string[]; sessionIds?: string[]; expiresAt: number; createdAt: string; lastUsedAt?: string; revoked?: boolean; clientId?: string; resource?: string; refreshExpiresAt?: number; refreshIdleExpiresAt?: number }
/** Credential IDs are SHA-256 digests. No access or refresh bearer is stored. */
export interface OAuthAccessCredential { id: string; tokenId: string; scopes: string[]; expiresAt: number }
export interface OAuthRefreshCredential { id: string; tokenId: string; scopes: string[]; expiresAt: number; createdAt: string; usedAt?: string }
interface BrowserPairing { id: string; status: string; ownerId?: string; sessionId?: string; displayId?: string; browserSessionId?: string; grantExpiresAt?: number; shareId?: string; interactive?: boolean }
type DbUser = {id: string; username: string; display_name: string; password_hash: string};
const PASSWORD_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => scrypt(password, salt, 64, PASSWORD_OPTIONS, (error, bytes) => error ? reject(error) : resolve(bytes)));
export const SCOPES = ['read', 'publish'] as const;

export class Auth {
  private readonly browserRevocations = new EventEmitter().setMaxListeners(2048);
  onBrowserRevoked(browserId:string,callback:()=>void){this.browserRevocations.on(browserId,callback);return ()=>{this.browserRevocations.off(browserId,callback);};}
  readonly cookieName: string;
  readonly policy: { idleMs: number; absoluteMs: number; renewalMs: number; freshMs: number };
  constructor(readonly store: Store, readonly secure: boolean, readonly allowRegistration: boolean, readonly oauthResource?: string, policy: BrowserSessionPolicy = {}) {
    this.cookieName = secure ? '__Host-kanvas' : 'kanvas';
    const idle = policy.idleDays ?? 90, absolute = policy.absoluteDays ?? 365, renewal = policy.renewalHours ?? 24, fresh = policy.freshMinutes ?? 15;
    if (![idle,absolute,renewal,fresh].every(v=>Number.isFinite(v)&&v>0) || idle>absolute || absolute>3650 || renewal*3600000>=idle*86400000 || fresh>60) throw new Error('Invalid browser session policy.');
    this.policy = { idleMs: idle*86400000, absoluteMs: absolute*86400000, renewalMs: renewal*3600000, freshMs:fresh*60000 };
  }
  private metadata(request?: Request) {
    const ua = request?.get('user-agent') ?? '';
    return { device: /iPhone/i.test(ua)?'iPhone':/iPad/i.test(ua)?'iPad':/Android/i.test(ua)?'Android':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':/Linux/i.test(ua)?'Linux':'Unknown device',
      browser:/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Browser',
      origin: this.oauthResource ? new URL(this.oauthResource).origin : 'unknown' };
  }
  private async audit(session: BrowserSession, reason: string) {
    if (!fullBrowser(session)) return;
    await this.store.put('audit-event',{id:id(),at:now(),type:`account.browser.${reason==='signed-in'?'signed-in':'closed'}`,actorId:session.userId,subjectId:session.userId,
      details:{browserSessionId:session.publicId ?? id(),reason,device:session.device??'Unknown device',browser:session.browser??'Browser',origin:session.origin??'unknown'}});
  }
  async revokeBrowser(browserId:string, reason='revoked') {
    return this.store.atomic(async()=>{
      const session = await this.store.get<BrowserSession>('browser',browserId);
      if(session){
        session.publicId ??= id();
        await this.audit(session,reason);
        if(fullBrowser(session))await this.store.put('browser-closed',{id:browserId,reason,closedAt:Date.now()});
      }
      await this.store.delete('browser',browserId);
      await this.store.db.prepare("DELETE FROM documents WHERE kind='push-subscription' AND value::jsonb->>'browserId'=?").run(browserId);
      this.store.afterCommit(()=>this.browserRevocations.emit(browserId));
    });
  }
  /** Called only for still-valid full account records. Legacy expiry is not extended
   * until an explicit foreground action; its original creation bounds absolute age. */
  async migrateBrowser(browserId:string, request?:Request):Promise<BrowserSession|undefined> {
    return this.store.atomic(async()=>{
      const session=await this.store.get<BrowserSession>('browser',browserId);
      if(!session||!fullBrowser(session)||session.expiresAt<=Date.now())return session;
      if(!session.publicId){
        const created=Number.isFinite(Date.parse(session.createdAt??''))?Date.parse(session.createdAt!):session.expiresAt-7*86400000;
        Object.assign(session,{publicId:id(),createdAt:new Date(created).toISOString(),authenticatedAt:created,lastActiveAt:new Date(created).toISOString(),idleExpiresAt:session.expiresAt,absoluteExpiresAt:created+this.policy.absoluteMs,renewedAt:0,...this.metadata(request)});
        session.expiresAt=Math.min(session.idleExpiresAt!,session.absoluteExpiresAt!);
        await this.store.put('browser',session);
      }
      return session;
    });
  }
  private async currentBrowser(browserId:string,request?:Request):Promise<BrowserSession> {
    let session=await this.store.get<BrowserSession>('browser',browserId);
    if(session && fullBrowser(session) && !session.publicId && session.expiresAt>Date.now()) session=await this.migrateBrowser(browserId,request);
    if(!session){
      const closed=await this.store.get<{reason:string}>('browser-closed',browserId);
      throw new AppError(closed?.reason==='idle-expired'?'SESSION_IDLE_EXPIRED':closed?.reason==='absolute-expired'?'SESSION_ABSOLUTE_EXPIRED':closed?'SESSION_REVOKED':'UNAUTHORIZED',closed?'This browser sign-in expired or was revoked. Sign in again.':'Sign in to continue.',401);
    }
    if(session.expiresAt<=Date.now() || (session.absoluteExpiresAt??Infinity)<=Date.now()){
      const reason=(session.absoluteExpiresAt??Infinity)<=Date.now()?'absolute-expired':'idle-expired';
      const valid=await this.store.atomic(async()=>{
        const current=await this.store.get<BrowserSession>('browser',browserId);
        if(current&&current.expiresAt>Date.now()&&(current.absoluteExpiresAt??Infinity)>Date.now())return current;
        await this.revokeBrowser(browserId,reason);
      });
      if(valid&&await this.user(valid.userId))return valid;
      throw new AppError(reason==='absolute-expired'?'SESSION_ABSOLUTE_EXPIRED':'SESSION_IDLE_EXPIRED','This browser sign-in expired. Sign in again.',401);
    }
    if(!await this.user(session.userId)) throw new AppError('UNAUTHORIZED','Sign in to continue.',401);
    return session;
  }
  async requireFresh(principal:AuthPrincipal) {
    // OAuth/service credentials retain their independently scoped authorization.
    if(!principal.browserId)return;
    const session=await this.currentBrowser(principal.browserId);
    if(!fullBrowser(session))throw new AppError('FORBIDDEN','Full account sign-in is required.',403);
    if(Date.now()-(session.authenticatedAt??0)>this.policy.freshMs)throw new AppError('REAUTH_REQUIRED','Confirm your sign-in to change account access. Your current session remains open; then review and try the action again.',403);
  }
  async activity(request:Request,response:Response) {
    // No GET, heartbeat, OAuth, polling or stream path invokes renewal.
    // isTrusted/visibility are checked by the browser; this is not an assertion
    // that a malicious credential holder can be distinguished from its owner.
    if(request.get('X-Kanvas-Activity')!=='foreground')throw new AppError('INVALID_ACTIVITY','Foreground activity is required.');
    const {session:before}=await this.browser(request);this.csrf(request,before);
    if(!fullBrowser(before))return {renewed:false};
    return this.store.atomic(async()=>{
      const session=await this.currentBrowser(before.id);
      const time=Date.now();
      if(time-(session.renewedAt??0)<this.policy.renewalMs)return {renewed:false,expiresAt:session.expiresAt};
      session.lastActiveAt=new Date(time).toISOString();session.renewedAt=time;
      session.idleExpiresAt=Math.min(time+this.policy.idleMs,session.absoluteExpiresAt!);
      session.expiresAt=session.idleExpiresAt;
      await this.store.put('browser',session);
      const cookie=request.cookies[this.cookieName] as string;
      this.store.afterCommit(()=>this.setBrowserCookie(response,cookie,session.expiresAt));
      return {renewed:true,expiresAt:session.expiresAt};
    });
  }
  private setBrowserCookie(response:Response,cookie:string,expiresAt:number) {
    response.cookie(this.cookieName,cookie,{httpOnly:true,secure:this.secure,sameSite:'strict',path:'/',maxAge:Math.max(0,expiresAt-Date.now())});
  }
  async user(userId: string): Promise<Awaited<User | undefined>> {
    const row = (await this.store.db.prepare('SELECT id,username,display_name FROM users WHERE id=?').get(userId)) as Omit<DbUser,'password_hash'>|undefined;
    return row ? { id: row.id, username: row.username, displayName: row.display_name, avatarUrl: (await avatarUrl(this.store, row.id)) } : undefined;
  }
  async register(body: Record<string, unknown>): Promise<User> {
    if (!this.allowRegistration) throw new AppError('REGISTRATION_CLOSED', 'Account registration is disabled on this installation.', 403);
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(username)) throw new AppError('INVALID_USERNAME', 'Use 3–40 letters, numbers, underscores or hyphens.');
    if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 256) throw new AppError('INVALID_PASSWORD', 'Use a password between 10 and 256 characters.');
    const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 80) : username;
    const salt = randomBytes(16).toString('hex'), encoded = (await derive(body.password, salt)).toString('hex');
    const user = {id: id(), username, displayName};
    (await this.store.transaction(async ()=>{
      try { (await this.store.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user.id, username, displayName, `${salt}:${encoded}`)); }
      catch { throw new AppError('USERNAME_UNAVAILABLE', 'That username is unavailable.', 409); }
      if(body.avatar!==undefined&&body.avatar!==null){const imageId=(await saveAccountImage(this.store,user.id,body.avatar));(await this.store.put('profile',{id:user.id,revision:1,avatarId:imageId,updatedAt:now()}));}
    }));
    return (await this.user(user.id))!;
  }
  async login(body: Record<string, unknown>): Promise<User> {
    if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 256) throw new AppError('INVALID_LOGIN', 'Username or password is incorrect.', 401);
    const row = (await this.store.db.prepare('SELECT * FROM users WHERE username=?').get(body.username.trim().toLowerCase())) as DbUser|undefined;
    const [salt, encoded] = row?.password_hash.split(':') ?? ['absent-user-timing-salt', '00'.repeat(64)];
    const candidate = await derive(body.password, salt), expected = Buffer.from(encoded, 'hex');
    if (!row || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new AppError('INVALID_LOGIN', 'Username or password is incorrect.', 401);
    return {id: row.id, username: row.username, displayName: row.display_name};
  }
  async issueBrowser(userId: string, response: Response, scope?: Pick<BrowserSession,'scopedSessionId'|'scopedDisplayId'|'pairingId'|'captureOnly'|'interactive'|'receiverDeviceId'>, request?:Request): Promise<BrowserSession> {
    return this.store.atomic(async () => {
      const cookie=opaque(),time=Date.now();
      const session:BrowserSession={id:hash(cookie),createdAt:now(),userId,csrf:opaque(),expiresAt:time+7*86400000,...scope};
      if(fullBrowser(session))Object.assign(session,{publicId:id(),lastActiveAt:now(),authenticatedAt:time,renewedAt:time,idleExpiresAt:time+this.policy.idleMs,absoluteExpiresAt:time+this.policy.absoluteMs,expiresAt:time+this.policy.idleMs,...this.metadata(request)});
      await this.store.put('browser',session);await this.audit(session,'signed-in');
      this.store.afterCommit(()=>this.setBrowserCookie(response,cookie,session.expiresAt));
      return session;
    });
  }
  async browser(request: Request): Promise<{principal: AuthPrincipal; session: BrowserSession}> {
    const cookie: unknown=request.cookies?.[this.cookieName];
    if(typeof cookie!=='string')throw new AppError('UNAUTHORIZED','Sign in to continue.',401);
    const session=await this.currentBrowser(hash(cookie),request),pairing=await this.currentPairing(session);
    return {session,principal:{userId:session.userId,browserId:session.id,receiverDeviceId:session.receiverDeviceId,scopedSessionId:session.scopedSessionId,scopedDisplayId:session.scopedDisplayId,pairingId:session.pairingId,captureOnly:session.captureOnly,
      interactive:!session.captureOnly&&session.interactive===true&&pairing?.interactive===true,...(pairing&&!session.captureOnly?{participantId:`pairing:${pairing.id}`}:{})}};
  }
  private async currentPairing(session: BrowserSession): Promise<Awaited<BrowserPairing | undefined>> {
    if (!session.pairingId) return;
    const pair = (await this.store.get<BrowserPairing>('pairing', session.pairingId));
    if (!pair || pair.status !== 'approved' || (
      pair.ownerId !== session.userId || pair.sessionId !== session.scopedSessionId || pair.displayId !== session.scopedDisplayId ||
      pair.browserSessionId !== session.id || !pair.grantExpiresAt || pair.grantExpiresAt <= Date.now()
    )) throw new AppError('UNAUTHORIZED', 'This screen access has expired or been revoked.', 401);
    if (pair.shareId) {
      const share = (await this.store.get<{ status: string; expiresAt: string; ownerId: string; sessionId: string; displayId: string; allowInteraction: boolean }>('share', pair.shareId));
      if (!share || share.status !== 'active' || Date.parse(share.expiresAt) <= Date.now() || share.ownerId !== session.userId ||
          share.sessionId !== session.scopedSessionId || share.displayId !== session.scopedDisplayId || pair.interactive && !share.allowInteraction) {
        throw new AppError('UNAUTHORIZED', 'This display invitation has expired or been revoked.', 401);
      }
    }
    return pair;
  }
  csrf(request: Request, session: BrowserSession): void {
    const value = request.get('X-Kanvas-CSRF');
    if (typeof value !== 'string' || hash(value) !== hash(session.csrf)) throw new AppError('CSRF_REQUIRED', 'Refresh the page before trying again.', 403);
  }
  async logout(request: Request, response: Response, reason='logout'): Promise<Awaited<void>> {
    return this.store.atomic(async () => {
    const cookie: unknown = request.cookies?.[this.cookieName];
    if (typeof cookie === 'string') await this.revokeBrowser(hash(cookie),reason);
    this.store.afterCommit(()=>response.clearCookie(this.cookieName, {httpOnly:true, secure:this.secure, sameSite:'strict', path:'/'}));

    });
  }
  async issueToken(userId: string, name: string, scopes: string[] = ['read','publish'], sessionIds?: string[], clientId?: string, expirySeconds = 30 * 86400) {
    return this.store.atomic(async () => {
    if (!scopes.length || scopes.some(scope => !SCOPES.includes(scope as typeof SCOPES[number]))) throw new AppError('INVALID_SCOPE', 'Unsupported client scope.');
    const value = opaque();
    const token: Token = {id:id(), userId, agentId:id(), name:name.slice(0,160), hash:hash(value), scopes:[...new Set(scopes)], sessionIds, expiresAt:Date.now()+expirySeconds*1000, createdAt:now(), clientId};
    (await this.store.put('token', token));
    return {value, token};

    });
  }
  async tokenMetadata(userId: string) {
    return (await this.store.list<Token>('token')).filter(t => t.userId === userId && !t.revoked).map(token => {
      const {id,name,scopes,sessionIds,createdAt,lastUsedAt,expiresAt} = token;
      const refreshable = token.refreshExpiresAt !== undefined && token.refreshIdleExpiresAt !== undefined;
      const refreshExpiresAt = refreshable ? Math.min(token.refreshExpiresAt!, token.refreshIdleExpiresAt!) : undefined;
      return {id,name,scopes,sessionIds,createdAt,lastUsedAt,expiresAt,
        accessMode: sessionIds === undefined ? 'account' as const : 'selected' as const,
        refreshable, ...(refreshExpiresAt !== undefined ? {refreshExpiresAt} : {}),
        reconnectRequired: Boolean(token.clientId) && (!refreshable || refreshExpiresAt! <= Date.now()),
        status: (refreshExpiresAt ?? expiresAt) > Date.now() ? 'active' as const : 'expired' as const,
      };
    });
  }
  async revokeToken(userId: string, tokenId: string) {
    return this.store.atomic(async () => {
    const token = required((await this.store.get<Token>('token', tokenId)));
    if (token.userId !== userId) throw new AppError('NOT_FOUND','Client connection is unavailable.',404);
    token.revoked = true; (await this.store.put('token', token));

    });
  }
  async authorize(request: Request): Promise<Awaited<AuthPrincipal>> {
    return this.store.atomic(async () => {
    const value = request.get('authorization');
    if (!value?.startsWith('Bearer ') || value.length > 300) throw new AppError('UNAUTHORIZED', 'An authorized client connection is required.', 401);
    const digest = hash(value.slice(7));
    const credential = (await this.store.get<OAuthAccessCredential>('oauth-access', digest));
    const token = credential ? (await this.store.get<Token>('token', credential.tokenId)) : (await this.store.list<Token>('token')).find(item => !item.resource && item.hash === digest);
    if (!token || token.revoked || token.expiresAt <= Date.now() || !(await this.user(token.userId)) ||
        (token.resource && (!credential || credential.expiresAt <= Date.now() || this.oauthResource && token.resource !== this.oauthResource)) ||
        (token.refreshExpiresAt !== undefined && Math.min(token.refreshExpiresAt, token.refreshIdleExpiresAt ?? 0) <= Date.now())) {
      throw new AppError('UNAUTHORIZED', 'Client access expired or was revoked. Reconnect if this client cannot renew its authorization.', 401);
    }
    token.lastUsedAt = now(); (await this.store.put('token', token));
    return {userId:token.userId, agentId:token.agentId, tokenId:token.id, scopes:credential?.scopes ?? token.scopes, ...(credential ? {oauthAccessId: credential.id} : {})};

    });
  }
  /** Re-check retained principals at every action and stream delivery. */
  async assertCurrent(principal: AuthPrincipal, scope = 'read', sessionId?: string): Promise<Awaited<void>> {
    if (principal.tokenId) {
      const token = (await this.store.get<Token>('token', principal.tokenId));
      const credential = principal.oauthAccessId ? (await this.store.get<OAuthAccessCredential>('oauth-access', principal.oauthAccessId)) : undefined;
      if (!token || token.revoked || token.expiresAt <= Date.now() || token.userId !== principal.userId || !(await this.user(token.userId)) ||
          (token.resource && (!credential || credential.tokenId !== token.id || credential.expiresAt <= Date.now() || this.oauthResource && token.resource !== this.oauthResource)) ||
          (token.refreshExpiresAt !== undefined && Math.min(token.refreshExpiresAt, token.refreshIdleExpiresAt ?? 0) <= Date.now())) {
        throw new AppError('UNAUTHORIZED','Client access expired or was revoked.',401);
      }
      if (!token.scopes.includes(scope) || (credential && !credential.scopes.includes(scope)) || (sessionId && token.sessionIds && !token.sessionIds.includes(sessionId))) throw new AppError('FORBIDDEN','This client has not been granted that access.',403);
    }
    if (principal.browserId) {
      const session = await this.currentBrowser(principal.browserId);
      if (session.userId !== principal.userId) throw new AppError('UNAUTHORIZED','Sign in to continue.',401);
      const pairing = (await this.currentPairing(session));
      principal.receiverDeviceId=session.receiverDeviceId;principal.scopedSessionId=session.scopedSessionId;principal.scopedDisplayId=session.scopedDisplayId;principal.pairingId=session.pairingId;principal.captureOnly=session.captureOnly;
      // Refresh retained guest flags from the server grant before a domain
      // action checks them; caller-supplied participant identity is never used.
      principal.interactive = !session.captureOnly && session.interactive === true && pairing?.interactive === true;
      principal.participantId = pairing && !session.captureOnly ? `pairing:${pairing.id}` : undefined;
      if (session.captureOnly && scope !== 'read') throw new AppError('FORBIDDEN','This capture has view-only access.',403);
    }
    if (principal.captureOnly && scope !== 'read') throw new AppError('FORBIDDEN','This capture has view-only access.',403);
    if (principal.scopedSessionId) {
      if (sessionId !== principal.scopedSessionId || scope !== 'read') throw new AppError('FORBIDDEN','This screen has view-only access.',403);
      if (principal.pairingId&&(await this.store.get<{status:string}>('pairing', principal.pairingId))?.status !== 'approved') throw new AppError('FORBIDDEN','This screen access has been revoked.',403);
    }
  }
}
