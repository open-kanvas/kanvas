import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SessionRecord } from '../shared/types';
import { api, errorMessage } from './api';
import { useAuth, useTask } from './hooks';
import { Icon, Wordmark } from './icons';
import { Button, ErrorNotice, Field, Loading } from './components/ui';
import { EmailRequest } from './EmailSignin';

export interface ViewerRoute { sessionId: string; displayId: string }
export function AuthScreen({ viewer }: { viewer?: ViewerRoute }) {
  const [choice,setChoice]=useState<'account'|'pairing'|null>(viewer?null:'account');
  const [options,setOptions]=useState<{emailSignin:boolean}|null>(null),[key,setKey]=useState('');
  useEffect(()=>{void api<{emailSignin:boolean}>('/api/auth/options').then(setOptions).catch(()=>setOptions({emailSignin:false}));},[]);
  return <main className="auth-layout"><div className="auth-story"><Wordmark/><div className="auth-statement"><span className="eyebrow">Less noise. More clarity.</span><h1>Ideas<br/>deserve<br/><em>room.</em></h1><p>A live visual surface for the things<br/>worth seeing together.</p></div></div>
    <div className="auth-panel"><div className="auth-mobile-mark"><Wordmark/></div><div className="auth-card">
      {viewer&&choice==='pairing'?<PairingScreen viewer={viewer} onBack={()=>setChoice(null)}/>:<>
        <span className="eyebrow">{viewer?'Open this display':'Your visual workspace'}</span><h2>{viewer?'Choose how to connect.':'Welcome to KANVAS.'}</h2>
        {viewer&&<div className="auth-access-choices" role="group" aria-label="Choose display access"><button aria-pressed={choice==='account'} onClick={()=>setChoice('account')}><Icon name="key" size={24}/><strong>Sign in to my account</strong><span>Use an email link for your sessions and displays.</span></button><button onClick={()=>setChoice('pairing')}><Icon name="screen" size={24}/><strong>Pair this screen</strong><span>No account needed. Ask the owner to approve this display only.</span></button></div>}
        {choice==='account'&&<section aria-label="Account sign-in"><p className="auth-description">Enter your email and confirm the sign-in link. No password is needed.</p>{options?.emailSignin?<EmailRequest/>:options===null?<Loading label="Checking email sign-in"/>:<ErrorNotice message="Email sign-in is temporarily unavailable on this installation. Screen pairing remains available."/>}</section>}
        {!viewer&&<form className="auth-session-key" onSubmit={event=>{event.preventDefault();const value=key.trim().toLowerCase();if(/^[a-z0-9]{4,32}$/.test(value))window.location.assign(`/s/${encodeURIComponent(value)}`);}}><h3>Join a session on this screen</h3><p>No account needed. Enter the short session key, then ask the owner to approve this browser.</p><Field label="Session key"><input value={key} onChange={e=>setKey(e.target.value)} minLength={4} maxLength={32} pattern="[A-Za-z0-9]{4,32}" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. abcd" required/></Field><Button type="submit" variant="secondary" icon="screen">Open session</Button></form>}
      </>}
    </div><span className="auth-footnote"><Icon name="lock" size={13}/>Private by default. Public only when the owner chooses.</span></div></main>;
}

interface PairingRecord { closeReason?:'label-collision'|'too-many-attempts';selfName?:string;id: string; label: string; status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked' | 'cancelled'; expiresAt: string; sessionId?: string; displayId?: string }
function PairingScreen({ viewer, onBack }: { viewer: ViewerRoute; onBack: () => void }) {
  const { refresh } = useAuth();
  const [selfName,setSelfName]=useState('');
  const [deviceName, setDeviceName] = useState('Shared screen'), [request, setRequest] = useState<PairingRecord | null>(null), [pollError, setPollError] = useState<string | null>(null);
  const task = useTask();
  const pending=useRef<Promise<PairingRecord>|null>(null);
  useEffect(()=>{
    let active=true;
    pending.current ??= api<PairingRecord>('/api/pairings',{method:'POST',body:{...viewer,deviceName:'New display browser'}});
    void pending.current.then(value=>{if(active)setRequest(value);}).catch(error=>{if(active)task.setError(errorMessage(error));});
    return()=>{active=false;};
  },[viewer.sessionId,viewer.displayId]);
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    // The proof cookie expires with the request. Stop waiting locally instead
    // of requiring a status response after the browser has stopped sending it.
    const timer = setTimeout(() => {
      setRequest(current => current?.id === request.id && current.status === 'pending' ? { ...current, status: 'expired' } : current);
      setPollError(null);
    }, Math.max(0, Date.parse(request.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [request?.id, request?.status, request?.expiresAt]);
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    let disposed = false;
    const check = async () => {
      try {
        const status = await api<PairingRecord>(`/api/pairings/${encodeURIComponent(request.id)}/status`);
        if (disposed) return;
        setPollError(null);
        // A late status response must not reopen a locally completed request.
        setRequest(current => current?.id === request.id && current.status === 'pending' ? status : current);
        if (status.status === 'approved') await refresh();
      } catch (e) { if (!disposed) setPollError(errorMessage(e)); }
    };
    const timer = setInterval(() => void check(), 2200); void check();
    return () => { disposed = true; clearInterval(timer); };
  }, [request?.id, request?.status, refresh]);
  const cancel = async () => { const current=request??await pending.current?.catch(()=>null); if (current?.status === 'pending') await api(`/api/pairings/${encodeURIComponent(current.id)}/cancel`, { method: 'POST', body: {} }); onBack(); };
  return <><span className="eyebrow">Connect this screen</span><h2>{request?.status === 'pending' ? 'Waiting for the owner.' : 'A shared view. Your screen.'}</h2><p className="auth-description">Tell your agent the request label below. The owner can approve this browser through KANVAS tools or the workspace. Approval gives view-only access to this display; the label alone grants nothing.</p>
    {!request ? <form className="auth-form" onSubmit={event => { event.preventDefault(); void task.run(async () => {
      pending.current = api<PairingRecord>('/api/pairings', { method: 'POST', body: { ...viewer, deviceName: deviceName.trim(),selfName:selfName.trim() } });
      setRequest(await pending.current); setPollError(null);
    }); }}><Field label="Screen name"><input value={deviceName} onChange={e => setDeviceName(e.target.value)} maxLength={80} placeholder="Meeting room display (optional)" /></Field><Field label="Your name (optional)"><input value={selfName} onChange={e=>setSelfName(e.target.value)} maxLength={80}/></Field><ErrorNotice message={task.error} /><Button type="submit" busy={task.busy} icon="screen">Request screen access</Button></form> : <div className="pairing-request"><div className="pairing-symbol"><Icon name="screen" size={34} />{request.status === 'pending' && <span className="spinner" />}</div><span className="eyebrow">This browser is requesting access</span><strong>{request.label}</strong><span className={`pairing-status status-${request.status}`}>{request.status}</span>{request.status === 'pending' && <p>Keep this page open. The request expires at {new Date(request.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}{request.status==='pending'&&<form onSubmit={e=>{e.preventDefault();void task.run(async()=>{setRequest(await api<PairingRecord>(`/api/pairings/${encodeURIComponent(request.id)}/details`,{method:'POST',body:{selfName:selfName.trim()}}));});}}><Field label="Your name (optional)" hint="Self-identified; helps the owner recognize your request."><input value={selfName} onChange={e=>setSelfName(e.target.value)} maxLength={80}/></Field><Button type="submit" busy={task.busy}>Add my name</Button></form>}{request.closeReason==='label-collision'&&<p role="status">Two pending requests received the same recognition label. Both were cancelled; request a new label.</p>}{request.closeReason==='too-many-attempts'&&<p role="status">Too many invalid attempts. Start a fresh request from this screen.</p>}{['denied', 'expired', 'revoked', 'cancelled'].includes(request.status) && <Button variant="secondary" onClick={() => { pending.current = null; setRequest(null); setPollError(null); task.setError(null); }}>Try a new request</Button>}<ErrorNotice message={pollError} /></div>}
    <button className="text-back" onClick={() => void task.run(cancel)}>← Back to sign in</button><ErrorNotice message={request ? task.error : null} />
  </>;
}

export function ConsentScreen({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<{ id: string; clientName: string; scopes: string[]; expiresAt: string; accessModes: ('selected' | 'account')[]; refreshable: boolean } | null>(null), [sessions, setSessions] = useState<SessionRecord[]>([]), [selected, setSelected] = useState<string[]>([]), [loading, setLoading] = useState(true);
  const [accessMode, setAccessMode] = useState<'selected' | 'account'>('selected');
  const [sessionName, setSessionName] = useState(''), [expired, setExpired] = useState(false);
  const task = useTask();
  useEffect(() => {
    let disposed = false;
    setLoading(true); setRequest(null); setSelected([]); setAccessMode('selected'); setExpired(false);
    void Promise.all([api<NonNullable<typeof request>>(`/api/oauth/requests/${encodeURIComponent(requestId)}`), api<SessionRecord[]>('/api/sessions')])
      .then(([r, s]) => { if (!disposed) { setRequest(r); setSessions(s.filter(item => !item.endedAt)); } })
      .catch(error => { if (!disposed) task.setError(errorMessage(error)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [requestId]);
  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(request.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [request?.expiresAt]);
  const refreshSessions = () => void task.run(async () => {
    await api(`/api/oauth/requests/${encodeURIComponent(requestId)}`);
    const current = (await api<SessionRecord[]>('/api/sessions')).filter(item => !item.endedAt);
    setSessions(current); setSelected(previous => previous.filter(id => current.some(session => session.id === id)));
  });
  const createSession = (event: FormEvent) => {
    event.preventDefault();
    if (expired || !sessionName.trim()) return;
    void task.run(async () => {
      await api(`/api/oauth/requests/${encodeURIComponent(requestId)}`);
      const session = await api<SessionRecord>('/api/sessions', { method: 'POST', body: { name: sessionName.trim() } });
      setSessions(previous => [...previous, session]); setSelected(previous => [...previous, session.id]); setSessionName('');
      // Creating a private session never submits consent. The account holder
      // must still explicitly choose Allow or Decline below.
    });
  };
  const decide = (approve: boolean) => void task.run(async () => {
    const result = await api<{ redirectUri: string }>('/api/oauth/approve', { method: 'POST', body: { requestId, approve, ...(approve ? { accessMode, ...(accessMode === 'selected' ? { sessionIds: selected } : {}) } : {}) } });
    const url = new URL(result.redirectUri); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The client redirect address is unsupported.');
    window.location.assign(url.href);
  });
  return <main className="consent-layout"><Wordmark /><div className="consent-card">{loading ? <Loading label="Checking connection request" /> : <>
    <span className="consent-symbol"><Icon name="key" size={32} /></span><span className="eyebrow">Connect an agent</span><h1>{request?.clientName ?? 'Client connection'}</h1>
    <p>Choose how this client may access your KANVAS account.</p><ErrorNotice message={task.error} />
    {request && <>
      <div className="consent-scopes">{request.scopes.map(scope => <div key={scope}><Icon name={scope === 'publish' ? 'send' : 'eye'} size={20} /><span><strong>{scope === 'publish' ? 'Publish content' : 'Read session content'}</strong><small>{scope === 'publish' ? 'Send visuals and update sessions within your permissions.' : 'Read displays, configuration, and interaction feedback.'}</small></span></div>)}</div>
      {request.refreshable && <p>This client can renew its connection automatically for up to 90 days, with a 30-day inactivity limit. You can revoke it anytime from Connections.</p>}
      {expired && <ErrorNotice message="This connection request has expired. Return to your agent and choose Connect again." />}
      {request.accessModes?.includes('account') && <fieldset className="session-choices" disabled={task.busy || expired}><legend>Connection access</legend>
        <label><input type="radio" name="accessMode" value="selected" checked={accessMode === 'selected'} onChange={() => setAccessMode('selected')} /><span>Selected sessions only</span></label>
        <label><input type="radio" name="accessMode" value="account" checked={accessMode === 'account'} onChange={() => setAccessMode('account')} /><span>Account access</span></label>
      </fieldset>}
      {accessMode === 'account' ? <p>Allow access to all current and future sessions available to your account. {request.scopes.includes('publish') ? 'The client can also create new sessions for you through its tools. ' : ''}Other accounts’ private sessions stay private. You do not need to create a session to connect.</p> : <fieldset className="session-choices" disabled={task.busy || expired}><legend>Selected sessions</legend>{sessions.map(session => <label key={session.id}><input type="checkbox" checked={selected.includes(session.id)} onChange={e => setSelected(e.target.checked ? [...selected, session.id] : selected.filter(id => id !== session.id))} /><span>{session.name}</span></label>)}{!sessions.length && <p>Select account access to connect without a session, or create your first private session below. Either choice still requires your approval.</p>}</fieldset>}
      {accessMode === 'selected' && !sessions.length && !expired && <form className="auth-form" onSubmit={createSession}>
        <Field label="New session name" hint="Only you have access until you allow this connection."><input value={sessionName} onChange={e => setSessionName(e.target.value)} required maxLength={100} placeholder="e.g. Claude conversation" disabled={task.busy} /></Field>
        <Button type="submit" variant="secondary" icon="plus" busy={task.busy} disabled={!sessionName.trim()}>Create session</Button>
      </form>}
      {accessMode === 'selected' && !expired && <Button type="button" variant="ghost" icon="refresh" onClick={refreshSessions} disabled={task.busy}>Refresh sessions</Button>}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={() => decide(false)} disabled={task.busy || expired}>Decline</Button><Button type="button" onClick={() => decide(true)} busy={task.busy} disabled={accessMode === 'selected' && !selected.length || expired}>{accessMode === 'account' ? 'Allow account access' : 'Allow selected sessions'}</Button></div>
    </>}
    <p><a href="/" target="_blank" rel="noopener noreferrer">Open your workspace in another tab</a></p>
  </>}</div></main>;
}
