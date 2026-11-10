import {KANVAS_VERSION} from '../shared/version';
import {diagnostic,diagnosticsAuthenticated,pauseDiagnostics} from './frontend-diagnostics';
import {diagnosticRoute} from '../shared/frontend-diagnostics';
import type { AssetRecord, DatasetSummary, DisplayRecord, InteractionRecord, Role, SessionRecord, UpdateRecord, ViewSpec } from '../shared/types';
import { isSafeUrl } from '../shared/view-schemas';

export interface User { id: string; username: string; displayName: string; avatarUrl?:string }
export interface Member { userId: string; id?: string; username: string; displayName?: string; role: Role }
export interface SessionDetail {
  session: SessionRecord;
  displays: DisplayRecord[];
  members: Member[];
  updates: UpdateRecord[];
  interactions: InteractionRecord[];
  datasets: DatasetSummary[];
  assets: AssetRecord[];
}
export interface PresentationRecord { id: string; name: string; slides: ViewSpec[]; createdAt?: string }
export interface TokenRecord { id: string; name: string; createdAt: string; lastUsedAt?: string; scopes?: string[]; sessionIds?: string[]; accessMode?: 'account'|'selected'; refreshable?: boolean; refreshExpiresAt?: number; reconnectRequired?: boolean; status?: 'active'|'expired' }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiError'; }
}

export interface BrowserAuthState { user:User; csrfToken:string; browserSessionId?:string; expiresAt?:number; freshUntil?:number; receiverDeviceId?:string;viewOnly?:boolean; captureOnly?:boolean; interactive?:boolean; sessionId?:string; displayId?:string }
let csrfToken = '';
let generation = 0;
let confirmedIdentity:string|undefined;
const authChannel=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('kanvas-auth-state'):undefined;
if(authChannel)authChannel.onmessage=()=>{advanceAuthGeneration();void confirmAuth().catch(()=>{});};
export const authGeneration = () => generation;
export function advanceAuthGeneration() { generation++; confirmation=undefined; return generation; }
export function setCsrfToken(value: string, accountDiagnostics = false) { csrfToken = value; diagnosticsAuthenticated(accountDiagnostics ? value : ''); }
type Confirmation = {generation:number; state:BrowserAuthState|null; reason?:string};
let confirmation:{generation:number; promise:Promise<Confirmation|undefined>}|undefined;
/** One confirmation per generation, shared by tabs' local requests. Cross-tab
 * changes are reconciled on foreground resume; credentials never use storage. */
export function confirmAuth():Promise<Confirmation|undefined> {
  const current=generation;
  if(confirmation?.generation===current)return confirmation.promise;
  const promise=(async()=>{
    let response:Response;
    try { response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}); }
    catch { throw new ApiError(0,'offline','Sign-in could not be checked. Your workspace is still open; reconnect and try again.'); }
    const payload=await response.json().catch(()=>null);
    if(current!==generation)return;
    if(response.status===401){
      if(confirmedIdentity!==undefined){advanceAuthGeneration();confirmedIdentity=undefined;}
      setCsrfToken('');
      const result:Confirmation={generation,state:null,reason:payload?.error?.message??'Sign in again to continue.'};
      window.dispatchEvent(new CustomEvent('kanvas:auth-confirmed',{detail:result}));return result;
    }
    if(!response.ok||!payload?.data?.user?.id||typeof payload.data.csrfToken!=='string')throw new ApiError(response.status,'auth_unavailable','Sign-in could not be checked. Your workspace is still open; try again shortly.');
    const state=payload.data as BrowserAuthState;
    const identity=state.browserSessionId??state.user.id;
    if(confirmedIdentity!==undefined&&confirmedIdentity!==identity)advanceAuthGeneration();
    confirmedIdentity=identity;setCsrfToken(state.csrfToken,!state.viewOnly&&!state.captureOnly);
    const result:Confirmation={generation,state};
    window.dispatchEvent(new CustomEvent('kanvas:auth-confirmed',{detail:result}));return result;
  })();
  confirmation={generation:current,promise};
  // Keep a completed confirmation briefly for bursts of simultaneously failing
  // API responses, but never reuse it after login/logout changes generation.
  void promise.finally(()=>setTimeout(()=>{if(confirmation?.promise===promise)confirmation=undefined;},250)).catch(()=>{});
  return promise;
}
function eventClientContext(){if(typeof window==='undefined'||typeof navigator==='undefined'||typeof screen==='undefined')return JSON.stringify({clientRelease:KANVAS_VERSION});return JSON.stringify({timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,language:navigator.language,languages:navigator.languages,platform:navigator.platform,screenWidth:screen.width,screenHeight:screen.height,pixelRatio:devicePixelRatio,viewportWidth:innerWidth,viewportHeight:innerHeight,networkType:(navigator as Navigator&{connection?:{effectiveType?:string}}).connection?.effectiveType,clientRelease:KANVAS_VERSION});}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; headers?:Record<string,string>; keepalive?: boolean } = {}, recovered=false): Promise<T> {
  const method=options.method??'GET';
  const authMutation=method!=='GET'&&/^\/api\/auth\/(?:login|register|logout|email\/(?:complete|consume))$/.test(path);
  if(authMutation)advanceAuthGeneration();
  // Signing in or out, or revoking browsers, can end this page's own sign-in on the server before the page knows.
  if(method!=='GET'&&path.startsWith('/api/auth/'))pauseDiagnostics();
  const started=generation;
  let response:Response;
  try {
    response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:options.signal,...(options.keepalive?{keepalive:true}:{}),headers:{Accept:'application/json','X-Kanvas-Client-Context':eventClientContext(),...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'&&csrfToken?{'X-Kanvas-CSRF':csrfToken}:{}),...options.headers},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
  } catch(error) {
    if(error instanceof DOMException&&error.name==='AbortError')throw error;
    diagnostic({event:'request',route:diagnosticRoute(path),status:0});
    throw new ApiError(0,'offline','Connection interrupted. Your last saved content is unchanged.');
  }
  if(response.status===401)pauseDiagnostics();
  diagnostic({event:'request',route:diagnosticRoute(path),status:response.status});
  if(started!==generation)throw new ApiError(409,'STALE_AUTH_RESPONSE','Sign-in changed while this request was running. Refresh before continuing.');
  if(response.status===204)return undefined as T;
  const payload=await response.json().catch(()=>null) as {data?:T;error?:{code?:string;message?:string}}|null;
  if(started!==generation)throw new ApiError(409,'STALE_AUTH_RESPONSE','Sign-in changed while this request was running. Refresh before continuing.');
  if(!response.ok){
    const code=payload?.error?.code;
    if(code==='REAUTH_REQUIRED')window.dispatchEvent(new Event('kanvas:reauth-required'));
    if(!recovered&&((response.status===401&&!path.startsWith('/api/auth/'))||code==='CSRF_REQUIRED')){
      let checked:Confirmation|undefined;
      try{checked=await confirmAuth();}catch{throw new ApiError(503,'AUTH_UNAVAILABLE','Sign-in could not be checked. Your workspace is still open; try again shortly.');}
      if(started!==generation||!checked)throw new ApiError(409,'STALE_AUTH_RESPONSE','Sign-in changed. Review the current account before trying again.');
      if(checked.state){
        if(method==='GET'&&!options.signal?.aborted)return api<T>(path,options,true);
        throw new ApiError(409,'AUTH_REVALIDATED','Your sign-in is valid and has been refreshed. Nothing was retried; review and try the action again.');
      }
    }
    throw new ApiError(response.status,code??'request_failed',payload?.error?.message??`Request failed (${response.status}).`);
  }
  if(!payload||!('data' in payload))throw new ApiError(response.status,'invalid_response','The service returned an unexpected response.');
  if(authMutation)authChannel?.postMessage({changed:true});
  return payload.data as T;
}

export const requestId = () => crypto.randomUUID();
export const sessionPath = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;
export const displayPath = (sessionId: string, displayId: string) => `${sessionPath(sessionId)}/displays/${encodeURIComponent(displayId)}`;
export const viewerPath = (sessionId: string, displayId: string) => `/view/${encodeURIComponent(sessionId)}/${encodeURIComponent(displayId)}`;
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }

/** Content URLs must never become executable navigation. Asset URLs remain same-origin. */
export function safeUrl(value: unknown, asset = false): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (asset && /^\/api\/(?:assets\/|media\/|public\/sessions\/[A-Za-z0-9_-]{1,128}\/assets\/)[a-zA-Z0-9_-]{1,128}$/.test(value)) return value;
  if (!isSafeUrl(value)) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

/** Only approved asset routes may be relative. Do not resolve arbitrary relative navigation. */
export function sourceLabel(value: string): string {
  const url = safeUrl(value, true);
  if (!url) return 'Source';
  return url.startsWith('/api/') ? 'Protected document' : new URL(url).hostname.replace(/^www\./, '');
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-zA-Z0-9._-]/g, '-') || 'kanvas'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
