import {diagnostic} from './frontend-diagnostics';
import { viewerTabId } from './renderers/Navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionEvent } from '../shared/types';
import { api, ApiError, errorMessage, sessionPath, setCsrfToken, type SessionDetail, type User } from './api';

interface AuthState { user: User | null; loading: boolean; previouslyAuthenticated?: boolean; error?: string | null; viewOnly?: boolean; captureOnly?: boolean; interactive?: boolean; sessionId?: string; displayId?: string; refresh: () => Promise<void>; logout: () => Promise<void> }
const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);
const returningScreenKey = 'kanvas:authenticated-before';
function returningScreen() {
  // A non-secret, per-tab UX hint only: authorization always comes from /me.
  // Preserve deliberate sign-out/revocation across reloads without storing identity.
  try { return sessionStorage.getItem(returningScreenKey) === 'true'; } catch { return false; }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [previouslyAuthenticated, setPreviouslyAuthenticated] = useState(returningScreen);
  const [scope, setScope] = useState<{ viewOnly?: boolean; captureOnly?: boolean; interactive?: boolean; sessionId?: string; displayId?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const value = await api<{ user: User; csrfToken: string; viewOnly?: boolean; captureOnly?: boolean; interactive?: boolean; sessionId?: string; displayId?: string }>('/api/auth/me');
      setPreviouslyAuthenticated(true);
      try { sessionStorage.setItem(returningScreenKey, 'true'); } catch { /* Storage can be disabled; in-memory state still protects this tab. */ }
      setCsrfToken(value.csrfToken); setUser(value.user); setScope({ viewOnly: value.viewOnly, captureOnly: value.captureOnly, interactive: value.interactive, sessionId: value.sessionId, displayId: value.displayId }); setAuthError(null);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) { setAuthError(errorMessage(error)); throw error; }
      setUser(null); setCsrfToken(''); setScope({}); setAuthError(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh().catch(() => setLoading(false)); }, [refresh]);
  useEffect(() => {
    const signout = () => { setUser(null); setCsrfToken(''); setScope({}); setAuthError(null); };
    window.addEventListener('kanvas:signout', signout);
    return () => window.removeEventListener('kanvas:signout', signout);
  }, []);
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    setCsrfToken(''); setUser(null); setScope({}); setAuthError(null);
  };
  return <AuthContext.Provider value={{ user, loading, previouslyAuthenticated, error: authError, ...scope, refresh, logout }}>{children}</AuthContext.Provider>;
}

export type ConnectionState = 'connecting' | 'live' | 'offline' | 'closed';

/** Key-order-independent structural equality for JSON configuration values. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export function sameConfig(a: unknown, b: unknown): boolean {
  return a === b || stableJson(a) === stableJson(b);
}
export function useSession(id: string | null, displayId?: string) {
  const [epoch, setEpoch] = useState(0);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const generation = useRef(0);
  const inFlight = useRef(false);
  const refreshAgain = useRef(false);
  const ended = useRef(false);
  const streamOpen = useRef(false);
  const reload = useCallback(async () => {
    if (!id || ended.current) return;
    if (!navigator.onLine) { setConnection('offline'); setLoading(false); return; }
    if (inFlight.current) { refreshAgain.current = true; return; }
    inFlight.current = true;
    const currentGeneration = generation.current;
    try {
      const state = await api<SessionDetail>(`${sessionPath(id)}${displayId ? `?displayId=${encodeURIComponent(displayId)}&tabId=${encodeURIComponent(viewerTabId())}` : ''}`);
      for(const update of state.updates.slice(0,2)){const target=displayId??update.displayIds[0];diagnostic({event:'update-received',sessionId:id,displayId:target,updateId:update.id,revision:target?update.revisions[target]:undefined});}
      // A snapshot started before the stream closed must not resurrect an ended session.
      if (currentGeneration !== generation.current || ended.current) return;
      if (state.session.endedAt) {
        ended.current = true; setDetail(null); setConnection('closed'); setError('This session has ended. Its display is no longer available.');
      } else {
        setDetail(previous => previous ? {
          ...state,
          // Keep the previous object only when the effective configuration is
          // unchanged. Layered appearance (session context, team/organization
          // defaults) changes without bumping session.configRevision, so the
          // revision alone must never pin a stale theme on an open display.
          session: { ...state.session, config: sameConfig(previous.session.config, state.session.config) ? previous.session.config : state.session.config },
          displays: state.displays.map(display => {
            const old = previous.displays.find(item => item.id === display.id);
            // Viewport/presence/ack changes must not reset a map camera or an in-progress local inspection.
            return old && (old.revision === display.revision || JSON.stringify(old.view) === JSON.stringify(display.view)) ? { ...display, view: old.view } : display;
          }),
        } : state);
        setError(null);
        setConnection(!navigator.onLine ? 'offline' : streamOpen.current ? 'live' : 'connecting');
      }
    } catch (error) {
      if (currentGeneration !== generation.current || ended.current) return;
      if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status)) {
        ended.current = true; setDetail(null); setConnection('closed');
      } else setConnection('offline');
      setError(errorMessage(error));
    } finally {
      if (currentGeneration === generation.current) {
        inFlight.current = false;
        setLoading(false);
        if (refreshAgain.current && !ended.current) { refreshAgain.current = false; void reload(); }
      }
    }
  }, [id, displayId, epoch]);

  useEffect(() => {
    generation.current += 1; inFlight.current = false; refreshAgain.current = false; ended.current = false; streamOpen.current = false;
    setDetail(null); setError(null); setLoading(Boolean(id)); setConnection(id ? 'connecting' : 'closed');
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let eventSource: EventSource | null = null;
    const refreshSoon = () => {
      if (disposed || timer || !navigator.onLine) return;
      timer = setTimeout(() => { timer = undefined; void reload(); }, 70);
    };
    const connect = () => {
      if (disposed || ended.current || !navigator.onLine) return;
      eventSource?.close(); streamOpen.current = false; setConnection('connecting');
      const source = new EventSource(`${sessionPath(id)}/events${displayId ? `?displayId=${encodeURIComponent(displayId)}&tabId=${encodeURIComponent(viewerTabId())}` : ''}`, { withCredentials: true });
      eventSource = source;
      source.onopen = () => {
        diagnostic({event:'stream-open',sessionId:id,displayId});
        if (disposed || eventSource !== source || ended.current || !navigator.onLine) return;
        streamOpen.current = true; setConnection('live'); void reload();
      };
      source.onerror = () => {
        diagnostic({event:'stream-error',sessionId:id,displayId});
        if (disposed || eventSource !== source) return;
        streamOpen.current = false;
        if (!ended.current) { setConnection('offline'); void reload(); }
        else source.close();
      };
      source.addEventListener('change', (event) => {
        if (disposed || eventSource !== source || !navigator.onLine) return;
        try {
          const change = JSON.parse((event as MessageEvent<string>).data) as SessionEvent;
          if (change.sessionId !== id) return;
          if(change.type==='display'||change.type==='update')diagnostic({event:'update-received',sessionId:id,displayId:change.displayId,revision:change.revision,...(change.type==='update'&&change.data&&typeof change.data==='object'&&'id' in change.data?{updateId:String(change.data.id)}:{})});
          if (change.type === 'identify') {
            const identify = (change as SessionEvent & { identify?: Record<string, unknown> }).identify ?? {};
            window.dispatchEvent(new CustomEvent('kanvas:identify', { detail: { ...identify, sessionId: change.sessionId, displayId: change.displayId } }));
            return;
          }
          window.dispatchEvent(new CustomEvent('kanvas:session-change', { detail: { sessionId: change.sessionId, displayId: change.displayId, type: change.type } }));
          if (change.type === 'ended') {
            ended.current = true; streamOpen.current = false; setDetail(null); setConnection('closed'); setError('This session has ended.'); source.close(); return;
          }
          refreshSoon();
        } catch { refreshSoon(); }
      });
      source.addEventListener('window-command',event=>{
        if(disposed||eventSource!==source||ended.current||!navigator.onLine)return;
        try{window.dispatchEvent(new CustomEvent('kanvas:window-command',{detail:JSON.parse((event as MessageEvent<string>).data)}));}catch{/* Invalid telemetry cannot target a window. */}
      });
    };
    const onOffline = () => {
      if (disposed || ended.current) return;
      // Existing SSE connections need not error immediately when a browser goes offline.
      diagnostic({event:'stream-close',sessionId:id,displayId});eventSource?.close(); eventSource = null; streamOpen.current = false;
      clearTimeout(timer); timer = undefined; setConnection('offline'); setLoading(false);
    };
    const onOnline = () => {
      if (!disposed && !ended.current) { connect(); void reload(); }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    // Registration can finish after the first content connection. Reconnect
    // once so the same authenticated stream also owns this window receiver.
    const onDeviceRegistered=()=>{if(displayId)connect();};
    window.addEventListener('kanvas:device-registered',onDeviceRegistered);
    if (navigator.onLine) { connect(); void reload(); } else onOffline();
    return () => {
      disposed = true; generation.current += 1; streamOpen.current = false; eventSource?.close(); clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline);
      window.removeEventListener('kanvas:device-registered',onDeviceRegistered);
    };
  }, [id, displayId, reload]);
  const reconnect = () => { if (navigator.onLine) setEpoch(value => value + 1); else setConnection('offline'); };
  return { detail, error, loading, connection, reload, reconnect };
}

export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true); setError(null);
    try { return await task(); }
    catch (error) { setError(errorMessage(error)); return undefined; }
    finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
