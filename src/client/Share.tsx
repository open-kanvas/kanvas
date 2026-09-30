import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, viewerPath } from './api';
import { useAuth, useTask } from './hooks';
import { Icon, Wordmark } from './icons';
import { Badge, Button, ErrorNotice, Field, Loading, formatDate } from './components/ui';
import './sharing.css';

interface Invitation { id: string; label: string; allowInteraction: boolean; expiresAt: string; status: string; viewerPath?: string }
interface Admission { id: string; label: string; status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked' | 'cancelled'; expiresAt: string; sessionId: string; displayId: string; interactive?: boolean }

export function parseShareRoute(pathname: string): string | undefined {
  const match = /^\/join\/([A-Za-z0-9_-]{1,128})\/?$/.exec(pathname);
  return match?.[1];
}

/** The invitation itself never renders private display data. Browser-held
 * proof plus an explicit owner decision is required before opening a viewer. */
export function ShareScreen({ shareId }: { shareId: string }) {
  const auth = useAuth(), task = useTask();
  const [invitation, setInvitation] = useState<Invitation | null>(null), [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null), [pollError, setPollError] = useState<string | null>(null);
  const [selfName,setSelfName]=useState('');
  const [deviceName, setDeviceName] = useState(''), [requestedInteractive, setRequestedInteractive] = useState(false);
  const [admission, setAdmission] = useState<Admission | null>(null), [expired, setExpired] = useState(false);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setLoadError(null); setInvitation(null); setAdmission(null); setExpired(false);
    void api<Invitation>(`/api/shares/${encodeURIComponent(shareId)}`)
      .then(value => { if (!disposed) setInvitation(value); })
      .catch(error => { if (!disposed) setLoadError(errorMessage(error)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [shareId, auth.user?.id]);
  useEffect(() => {
    if (!invitation) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(invitation.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [invitation?.expiresAt]);
  useEffect(() => {
    if (!admission || admission.status !== 'pending') return;
    // The proof cookie and request expire together. Stop polling locally even
    // after the browser correctly stops sending that short-lived cookie.
    const timer = setTimeout(() => setAdmission(current => current?.id === admission.id && current.status === 'pending' ? { ...current, status: 'expired' } : current), Math.max(0, Date.parse(admission.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [admission?.id, admission?.status, admission?.expiresAt]);
  useEffect(() => {
    if (!admission || admission.status !== 'pending' || expired) return;
    let disposed = false, checking = false;
    const check = async () => {
      if (checking) return; checking = true;
      try {
        const next = await api<Admission>(`/api/pairings/${encodeURIComponent(admission.id)}/status`);
        if (disposed) return;
        setPollError(null); setAdmission(next);
        if (next.status === 'approved') {
          await auth.refresh();
          window.location.assign(viewerPath(next.sessionId, next.displayId));
        }
      } catch (error) { if (!disposed) setPollError(errorMessage(error)); }
      finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 2000); void check();
    return () => { disposed = true; clearInterval(timer); };
  }, [admission?.id, admission?.status, expired, auth.refresh]);
  const requestAccess = (event: FormEvent) => {
    event.preventDefault();
    if (expired) return;
    void task.run(async () => {
      const record = await api<Admission>('/api/pairings', { method: 'POST', body: { shareId, deviceName: deviceName.trim(),selfName:selfName.trim(), requestedInteractive } });
      setAdmission(record); setPollError(null);
    });
  };
  return <main className="consent-layout share-join"><Wordmark /><section className="consent-card">
    {loading ? <Loading label="Checking display invitation" /> : <>
      <span className="consent-symbol"><Icon name="screen" size={32} /></span><span className="eyebrow">Follow along on your screen</span>
      <h1>{invitation?.label ?? 'Display invitation'}</h1>
      <ErrorNotice message={loadError} /><ErrorNotice message={task.error} />
      {invitation && <>
        <p>The owner must approve this browser before you can see the display. This link does not give access to other displays or the workspace.</p>
        {expired ? <ErrorNotice message="This invitation has expired. Ask the owner for a new sharing link." /> : invitation.viewerPath ? <>
          <p>You already have access to this display.</p><a className="button button-primary" href={invitation.viewerPath}>Open display <Icon name="arrow" size={17} /></a>
        </> : admission ? <div className="pairing-request">
          <Badge tone={admission.status === 'approved' ? 'good' : admission.status === 'pending' ? 'warn' : 'neutral'}>{admission.status}</Badge>
          <span className="eyebrow">Your request label</span><strong>{admission.label}</strong>
          {admission.status === 'pending' && <><span className="spinner" /><p>Waiting for the owner. Keep this page open and confirm this label with them. Your request expires {formatDate(admission.expiresAt)}.</p><Button variant="secondary" busy={task.busy} onClick={() => void task.run(async () => {
            const next = await api<Admission>(`/api/pairings/${encodeURIComponent(admission.id)}/cancel`, { method: 'POST', body: {} }); setAdmission(next);
          })}>Cancel request</Button></>}
          {['denied', 'expired', 'revoked', 'cancelled'].includes(admission.status) && <Button variant="secondary" onClick={() => { setAdmission(null); setPollError(null); }}>Request again</Button>}
          <ErrorNotice message={pollError} />
        </div> : auth.user ? <>
          <p>This browser is signed in without access to this display. You can keep that sign-in and open this invitation in a separate private browser window, or sign out here to request guest access.</p>
          <Button variant="secondary" busy={task.busy} onClick={() => void task.run(auth.logout)}>Sign out to join as a guest</Button>
        </> : <form className="auth-form" onSubmit={requestAccess}>
          <Field label="Your name (optional)" hint="Self-identified, shown to the owner."><input value={selfName} onChange={e=>setSelfName(e.target.value)} maxLength={80}/></Field><Field label="Your screen name (optional)" hint="The owner uses this name and the request label to recognize your device."><input value={deviceName} onChange={event => setDeviceName(event.target.value)} placeholder="e.g. Sam’s phone" maxLength={80} disabled={task.busy} /></Field>
          {invitation.allowInteraction && <label className="sharing-check"><input type="checkbox" checked={requestedInteractive} onChange={event => setRequestedInteractive(event.target.checked)} disabled={task.busy} /><span>Request permission to respond<small>The owner can allow you to use this display’s forms, polls, questions and other controls. Your responses are shared with the presenter.</small></span></label>}
          <Button type="submit" icon="screen" busy={task.busy}>Request display access</Button>
        </form>}
        <p className="share-expiry">Invitation expires {formatDate(invitation.expiresAt)}. The owner can revoke it or your browser access at any time.</p>
      </>}
    </>}
  </section></main>;
}
