import {ScreenPairingPanel,ScreenApproval} from './ScreenEnrollment';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SessionRecord } from '../shared/types';
import { api, errorMessage } from './api';
import { useAuth, useTask } from './hooks';
import { Icon, Wordmark } from './icons';
import { Button, ErrorNotice, Field, Loading } from './components/ui';
import { EmailRequest } from './EmailSignin';

export interface ViewerRoute { sessionId: string; displayId: string }
export function AuthScreen({ viewer, authorizationRequestId }: { viewer?: ViewerRoute; authorizationRequestId?: string }) {
  const auth=useAuth();
  const [choice,setChoice]=useState<'account'|'pairing'|null>(viewer?null:'account');
  const [options,setOptions]=useState<{emailSignin:boolean}|null>(null),[key,setKey]=useState('');
  useEffect(()=>{void api<{emailSignin:boolean}>('/api/auth/options').then(setOptions).catch(()=>setOptions({emailSignin:false}));},[]);
  return <main className="auth-layout"><div className="auth-story auth-logo-panel"><Wordmark/></div>
    <div className="auth-panel"><div className="auth-mobile-mark"><Wordmark/></div><div className="auth-card">
      {viewer&&choice==='pairing'?<PairingScreen viewer={viewer} onBack={()=>setChoice(null)}/>:<>
        <span className="eyebrow">{viewer?'Open this display':'Your visual workspace'}</span><h2>{authorizationRequestId?'Sign in to connect your agent.':viewer?'Choose how to connect.':'Welcome to KANVAS.'}</h2>
        {viewer&&<div className="auth-access-choices" role="group" aria-label="Choose display access"><button aria-pressed={choice==='account'} onClick={()=>setChoice('account')}><Icon name="key" size={24}/><strong>Sign in to my account</strong><span>Use an email link for your sessions and displays.</span></button><button onClick={()=>setChoice('pairing')}><Icon name="screen" size={24}/><strong>Pair this screen</strong><span>No account needed. Ask the owner to approve this display only.</span></button></div>}
        {choice==='account'&&<section aria-label="Account sign-in">{auth.signoutReason&&<p role="status">{auth.signoutReason}</p>}<p className="auth-description">{authorizationRequestId?'Sign in with your own account, then approve the connection. Screen pairing only allows viewing a display; it cannot connect an agent. No need to clear browser cookies.':'Enter your email and confirm the sign-in link. No password is needed.'}</p>{options?.emailSignin?<EmailRequest authorizationRequestId={authorizationRequestId}/>:options===null?<Loading label="Checking email sign-in"/>:<ErrorNotice message={authorizationRequestId?'Account sign-in is temporarily unavailable. Try again later, then reconnect from your agent. Screen pairing cannot authorize this connection.':'Email sign-in is temporarily unavailable on this installation. Screen pairing remains available.'}/>}</section>}
        {!viewer&&!authorizationRequestId&&<ScreenPairingPanel/>}
        {!viewer&&!authorizationRequestId&&<form className="auth-session-key" onSubmit={event=>{event.preventDefault();const value=key.trim().toLowerCase();if(/^[a-z0-9]{4,32}$/.test(value))window.location.assign(`/s/${encodeURIComponent(value)}`);}}><h3>Join a session on this screen</h3><p>No account needed. Enter the short session key, then ask the owner to approve this browser.</p><Field label="Session key"><input value={key} onChange={e=>setKey(e.target.value)} minLength={4} maxLength={32} pattern="[A-Za-z0-9]{4,32}" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. abcd" required/></Field><Button type="submit" variant="secondary" icon="screen">Open session</Button></form>}
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
  const auth=useAuth();
  const [matchesCode,setMatchesCode]=useState(false);
  const [request,setRequest]=useState<{clientName:string;scopes:string[];expiresAt:string;refreshable:boolean;userCode?:string}|null>(null),[loading,setLoading]=useState(true),[expired,setExpired]=useState(false);
  const task=useTask();
  useEffect(()=>{let disposed=false;setLoading(true);setRequest(null);task.setError(null);setExpired(false);void api<NonNullable<typeof request>>(`/api/oauth/requests/${encodeURIComponent(requestId)}`).then(value=>{if(!disposed)setRequest(value);}).catch(error=>{if(!disposed)task.setError(errorMessage(error));}).finally(()=>{if(!disposed)setLoading(false);});return()=>{disposed=true;};},[requestId]);
  useEffect(()=>{if(!request)return;const timer=setTimeout(()=>setExpired(true),Math.max(0,Date.parse(request.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[request?.expiresAt]);
  const decide=(approve:boolean)=>void task.run(async()=>{const result=await api<{redirectUri:string}>('/api/oauth/approve',{method:'POST',body:{requestId,approve,...(request?.userCode?{matchesCode}:{}),...(approve?{accessMode:'account'}:{})}});const url=new URL(result.redirectUri);if(!['https:','http:'].includes(url.protocol))throw new Error('The client redirect address is unsupported.');window.location.assign(url.href);});
  return <main className="consent-layout"><Wordmark/><div className="consent-card">{loading?<Loading label="Checking connection request"/>:<><span className="consent-symbol"><Icon name="key" size={32}/></span><span className="eyebrow">Connect an agent</span><h1>{request?.clientName??'Client connection'}</h1><p>The client name is self-reported, not a verified identity. Only connect a client you started yourself.</p><ErrorNotice message={task.error}/>{!request&&<p>Return to your agent and choose Connect again. No connection was approved.</p>}{request&&<><p>Signed in as <strong>{auth.user?.username}</strong>.</p><button className="text-back" disabled={task.busy} onClick={()=>void task.run(async()=>{await api('/api/auth/logout',{method:'POST',body:{}});window.location.reload();})}>Use another account</button><p>Connect this client to your KANVAS account, including current and future sessions available to you. Other accounts’ private sessions remain private. Session sharing and device approval remain separate.</p>{request.userCode&&<section><p>Compare this code with the code shown by your agent:</p><strong className="email-match-code">{request.userCode}</strong><label className="email-code-confirm"><input type="checkbox" checked={matchesCode} onChange={event=>setMatchesCode(event.target.checked)}/><span>I started this connection and the code matches my agent.</span></label></section>}<div className="consent-scopes">{request.scopes.map(scope=><div key={scope}><Icon name={scope==='publish'?'send':'eye'} size={20}/><span><strong>{scope==='publish'?'Publish content and create sessions':'Read session content'}</strong><small>{scope==='publish'?'Send visuals and make changes within your permissions.':'Read displays, configuration and interaction feedback.'}</small></span></div>)}</div>{request.refreshable&&<p>This connection renews automatically for up to 90 days, with a 30-day inactivity limit. Revoke access anytime from Connections.</p>}{expired&&<ErrorNotice message="This connection request has expired. Return to your agent and choose Connect again."/>}<div className="form-actions"><Button variant="secondary" onClick={()=>decide(false)} disabled={task.busy||expired}>Decline</Button><Button onClick={()=>decide(true)} busy={task.busy} disabled={expired||Boolean(request.userCode&&!matchesCode)}>Allow account access</Button></div></>}<p><a href="/" target="_blank" rel="noopener noreferrer">Open your console in another tab</a></p></>}</div></main>;
}

/** Resolving a recognition code never authorizes the client or signs in a browser. */
export function DeviceConnectScreen() {
  const query = new URLSearchParams(window.location.search);
  if(query.has('screen_code'))return <ScreenApproval/>;
  const [code,setCode] = useState(query.get('user_code') ?? '');
  const task = useTask(), result = query.get('result');
  const lookup = () => void task.run(async () => {
    const found = await api<{requestId:string}>('/api/oauth/device/lookup', {method:'POST',body:{user_code:code}});
    window.location.assign(`/?authorize=${encodeURIComponent(found.requestId)}`);
  });
  return <main className="consent-layout"><Wordmark/><section className="consent-card"><a href="/connect?screen_code=">Connect a screen instead</a><h1>{result==='approved'?'Connection approved.':result==='denied'?'Connection declined.':'Connect your agent.'}</h1>{result==='approved'||result==='denied'?<><p role="status">{result==='approved'?'Return to your agent. It can now finish connecting; some clients require you to resume or retry.':'No access was granted. Return to your agent to request another connection.'}</p><a href="/connect">Enter another code</a></>:<><p>Enter the code shown by your agent. Continue to sign in and review account permissions. Opening this page grants no access.</p><form onSubmit={event=>{event.preventDefault();lookup();}}><Field label="Connection code"><input value={code} onChange={event=>setCode(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={30} placeholder="XXXX-XXXX-XXXX" required/></Field><ErrorNotice message={task.error}/><Button type="submit" busy={task.busy}>Review connection</Button></form></>}<p><a href="/">Return to KANVAS</a></p></section></main>;
}
