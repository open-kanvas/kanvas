import type { RequestContext } from '../../shared/recognition';
import type { ViewerPresence, ToastRecord } from '../../shared/viewer-experience';
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import type { DisplayRecord } from '../../shared/types';
import { api, errorMessage, sessionPath } from '../api';
import { useTask } from '../hooks';
import { Badge, Button, EmptyState, ErrorNotice, Field, IconButton, formatDate } from '../components/ui';
import '../sharing.css';

interface Invitation { id: string; displayId: string; label: string; allowInteraction: boolean; status: 'active' | 'expired' | 'revoked'; expiresAt: string; joinUrl: string }
interface GuestRequest {selfName?:string;requestContext?:RequestContext;closeReason?:string;failedAttempts?:number;id: string; shareId?: string; displayId: string; deviceName: string; label: string; status: string; expiresAt: string; grantExpiresAt?: number; requestedInteractive?: boolean; interactive?: boolean }

function InvitationCode({ invitation }: { invitation: Invitation }) {
  const [src, setSrc] = useState<string>(), [error, setError] = useState<string>();
  useEffect(() => {
    let disposed = false;
    void QRCode.toDataURL(invitation.joinUrl, { width: 220, margin: 3, errorCorrectionLevel: 'M' })
      .then(value => { if (!disposed) { setSrc(value); setError(undefined); } })
      .catch(() => { if (!disposed) setError('QR code unavailable. Use the sharing link below.'); });
    return () => { disposed = true; };
  }, [invitation.joinUrl]);
  return <>{src && <img className="invitation-qr" src={src} width={220} height={220} alt={`Invitation QR code for ${invitation.label}`} />}<ErrorNotice message={error} /></>;
}

/** Mounted only for the session owner. A QR scan opens an admission request,
 * not a private viewer. Each browser still requires its own explicit decision. */
export function SharingPanel({ sessionId, displays }: { sessionId: string; displays: Pick<DisplayRecord, 'id' | 'name'>[] }) {
  const task = useTask();
  const [viewers,setViewers]=useState<ViewerPresence[]>([]),[notices,setNotices]=useState<ToastRecord[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]), [requests, setRequests] = useState<GuestRequest[]>([]), [loadError, setLoadError] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState(displays[0]?.id ?? ''), [label, setLabel] = useState('Shared display');
  const [hours, setHours] = useState(24), [allowInteraction, setAllowInteraction] = useState(false), [copied, setCopied] = useState<string | null>(null);
  const load = async () => {
    try {
      const [shares, pairs,active,notifications] = await Promise.all([api<Invitation[]>(`${sessionPath(sessionId)}/shares`), api<GuestRequest[]>(`${sessionPath(sessionId)}/pairings`),api<ViewerPresence[]>(`${sessionPath(sessionId)}/viewers`),api<ToastRecord[]>(`${sessionPath(sessionId)}/notices`)]);
      setInvitations(shares); setRequests(pairs.filter(item => ['pending','approved'].includes(item.status)));setViewers(active);setNotices(notifications); setLoadError(null);
    } catch (error) { setLoadError(errorMessage(error)); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 4000); return () => clearInterval(timer); }, [sessionId]);
  useEffect(() => { if (!displays.some(item => item.id === displayId)) setDisplayId(displays[0]?.id ?? ''); }, [displayId, displays]);
  const create = (event: FormEvent) => {
    event.preventDefault();
    void task.run(async () => {
      await api(`${sessionPath(sessionId)}/shares`, { method: 'POST', body: { displayId, label: label.trim(), allowInteraction, expiresInHours: hours } });
      await load();
    });
  };
  const decide = (request: GuestRequest, approve: boolean, interactive = false) => void task.run(async () => {
    await api(`/api/pairings/${encodeURIComponent(request.id)}/decision`, { method: 'POST', body: { approve, ...(approve ? { interactive } : {}) } });
    await load();
  });
  return <section className="sharing-section" aria-label="Display sharing">
    <div className="panel-heading"><div><h2>Share a display</h2><p>Let people scan a QR code or open a link, then approve each browser. They follow the same live display without joining the workspace.</p></div><IconButton icon="refresh" label="Refresh invitations and guests" onClick={() => void load()} /></div>
    <div className="lifecycle-notices" aria-live="polite">{notices.slice(-5).map(n=><p key={n.id}>{n.text} <time>{new Date(n.createdAt).toLocaleTimeString()}</time></p>)}</div><ErrorNotice message={loadError} /><ErrorNotice message={task.error} />
    {!displays.length ? <EmptyState icon="screen" title="Add a display first.">Sharing links connect guests to one existing display.</EmptyState> : <form className="sharing-form" onSubmit={create}>
      <Field label="Display to share"><select value={displayId} onChange={event => setDisplayId(event.target.value)} disabled={task.busy}>{displays.map(display => <option key={display.id} value={display.id}>{display.name}</option>)}</select></Field>
      <Field label="Invitation label" hint="Visible to anyone who opens the invitation, before approval."><input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} required disabled={task.busy} /></Field>
      <Field label="Invitation lifetime"><select value={hours} onChange={event => setHours(Number(event.target.value))} disabled={task.busy}><option value={1}>1 hour</option><option value={24}>24 hours</option><option value={168}>7 days</option></select></Field>
      <label className="sharing-check"><input type="checkbox" checked={allowInteraction} onChange={event => setAllowInteraction(event.target.checked)} disabled={task.busy} /><span>Allow requests to respond<small>You still approve view-only or interactive access separately for each browser. Responses never grant editing or workspace access.</small></span></label>
      <Button type="submit" icon="plus" busy={task.busy} disabled={!displayId || !label.trim()}>Create sharing link</Button>
    </form>}
    {!!invitations.length && <div className="sharing-invitations">{[...invitations].reverse().map(invitation => <article className="sharing-invitation" key={invitation.id}>
      <div><h3>{invitation.label}</h3><p>{displays.find(display => display.id === invitation.displayId)?.name ?? 'Display'} · {invitation.allowInteraction ? 'Responses may be requested' : 'View-only requests'}</p><Badge tone={invitation.status === 'active' ? 'good' : 'neutral'}>{invitation.status}</Badge><p>Expires {formatDate(invitation.expiresAt)}</p></div>
      {invitation.status === 'active' && <>
        <InvitationCode invitation={invitation} />
        <Field label={`Sharing link for ${invitation.label}`}><input readOnly value={invitation.joinUrl} onFocus={event => event.target.select()} /></Field>
        <div className="sharing-actions"><Button variant="secondary" icon={copied === invitation.id ? 'check' : 'copy'} onClick={() => void task.run(async () => { await navigator.clipboard.writeText(invitation.joinUrl); setCopied(invitation.id); })}>{copied === invitation.id ? 'Link copied' : 'Copy sharing link'}</Button><Button variant="ghost" onClick={() => void task.run(async () => { await api(`/api/shares/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' }); await load(); })}>Revoke invitation and guests</Button></div>
      </>}
    </article>)}</div>}
    <div className="panel-heading"><div><h3>Pairing requests and approvals</h3><p>Confirm the request label with the person before approving. A session supports up to 128 approved browsers. New requests expire after one hour, or sooner if the invitation ends; each request shows its own deadline.</p></div></div>
    {!requests.length ? <p className="sharing-empty">No pending or approved pairing requests. Signed-in viewers appear separately below.</p> : <div className="sharing-requests">{requests.map(request => <article key={request.id}>
      <div><h4>{request.deviceName}</h4>{request.selfName&&<p>{request.selfName} · self-identified</p>}{request.requestContext&&<p>{request.requestContext.device} · {request.requestContext.browser}{request.requestContext.language?` · ${request.requestContext.language}`:''}{request.requestContext.location&&<small>Approximate IP location: {[request.requestContext.location.city,request.requestContext.location.region,request.requestContext.location.country].filter(Boolean).join(', ')} · not identity verification</small>}</p>}<p>{displays.find(display => display.id === request.displayId)?.name ?? 'Display'} · request label <strong>{request.label}</strong></p><p>{request.status === 'pending' ? `${request.requestedInteractive ? 'Requests permission to respond' : 'Requests view-only access'} · expires ${formatDate(request.expiresAt)}` : `${request.interactive ? 'Responses enabled' : 'View-only access'} · expires ${request.grantExpiresAt ? formatDate(new Date(request.grantExpiresAt).toISOString()) : 'with invitation'}`}</p><Badge tone={request.status === 'approved' ? 'good' : 'warn'}>{request.status}</Badge></div>
      <div className="sharing-actions">{request.status === 'pending' ? <>
        <Button variant="ghost" disabled={task.busy} onClick={() => decide(request, false)}>Deny guest</Button>
        <Button variant="secondary" disabled={task.busy} onClick={() => decide(request, true)}>Approve view only</Button>
        {request.requestedInteractive && <Button icon="check" disabled={task.busy} onClick={() => decide(request, true, true)}>Approve responses</Button>}
      </> : <Button variant="secondary" disabled={task.busy} onClick={() => void task.run(async () => { await api(`/api/pairings/${encodeURIComponent(request.id)}`, { method: 'DELETE' }); await load(); })}>Revoke guest</Button>}</div>
    </article>)}</div>}
    <section className="active-viewers" aria-label="Active viewers"><h3>Active viewers · {viewers.filter(v=>v.connected).length} connected</h3><p>Actual receiving-browser connections, including signed-in browsers. Pairing approvals above are access history, not a connected count.</p>{!viewers.length?<p>No connected viewers.</p>:viewers.map(v=><article key={v.id}><strong>{v.name??'Browser'}</strong><p>{v.connected?'Connected':'Recently observed; connection unconfirmed'} · {v.connectionMethod==='paired'?'Paired browser':'Signed-in browser'}</p><p>{v.requestContext?.device} · {v.requestContext?.browser} · {v.width}×{v.height}</p><small>Joined {v.joinedAt?formatDate(v.joinedAt):'unknown'} · last active {formatDate(v.lastActiveAt??v.observedAt)}</small></article>)}</section>
  </section>;
}
