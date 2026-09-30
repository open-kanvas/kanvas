import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionRecord } from '../shared/types';
import { api, errorMessage, type SessionDetail } from './api';
import { useAuth, useMedia, useSession, useTask } from './hooks';
import { Icon, Wordmark, type IconName } from './icons';
import { Badge, Button, EmptyState, ErrorNotice, Field, IconButton, Loading, Modal } from './components/ui';
import { DisplaysPanel } from './panels/Displays';
import { PublishPanel } from './panels/Publish';
import { LibraryPanel } from './panels/Library';
import { AccessPanel, ActivityPanel, SettingsPanel } from './panels/Session';
import { AccountHub } from './AccountHub';
import { SessionsHome } from './SessionsHome';
import { ConnectionsPanel } from './panels/Connections';
import { InvitationModal, OwnerNotices } from './Invitations';

type Tab = 'displays' | 'publish' | 'library' | 'access' | 'settings' | 'activity';
const tabs: { id: Tab; name: string; icon: IconName }[] = [
  { id: 'displays', name: 'Displays', icon: 'screen' }, { id: 'publish', name: 'Send a visual', icon: 'send' }, { id: 'library', name: 'Library', icon: 'folder' },
  { id: 'activity', name: 'Activity', icon: 'activity' }, { id: 'access', name: 'People & access', icon: 'people' }, { id: 'settings', name: 'Settings', icon: 'settings' },
];
export interface PanelProps { detail: SessionDetail; reload: () => Promise<void>; editable: boolean; owner: boolean }

export function Workspace() {
  const auth = useAuth();
  const [inviting,setInviting]=useState(false);
  const mobileLayout = useMedia('(max-width:740px)');
  const [sessions, setSessions] = useState<SessionRecord[]>([]), [sessionsLoading, setSessionsLoading] = useState(true), [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get('session'));
  // The root URL opens on the account home; only an explicit ?session= selects a session there.
  const homeFirst = useRef(window.location.pathname === '/');
  const [tab, setTab] = useState<Tab>('displays'), [connections, setConnections] = useState(false), [accountHub,setAccountHub]=useState(()=>new URLSearchParams(window.location.search).has('account')), [newSession, setNewSession] = useState(false), [mobileNav, setMobileNav] = useState(false), [includeEnded, setIncludeEnded] = useState(false);
  const state = useSession(selected);
  useEffect(()=>{if(state.detail)setSessions(old=>old.map(s=>s.id===state.detail!.session.id?state.detail!.session:s));},[state.detail?.session.name,state.detail?.session.configRevision]);
  const sessionsRequest = useRef(0);
  const loadSessions = useCallback(async () => {
    const request = ++sessionsRequest.current;
    try {
      const result = await api<SessionRecord[]>('/api/sessions');
      // An initial list can finish after the post-create refresh. Never let it
      // replace the newer list or move an active form back into another session.
      if (request !== sessionsRequest.current) return;
      setSessions(result); setSessionsError(null);
      setSelected(current => current && result.some(s => s.id === current) ? current : homeFirst.current ? null : result.find(s => !s.endedAt)?.id ?? null);
    } catch (e) { if (request === sessionsRequest.current) setSessionsError(errorMessage(e)); } finally { if (request === sessionsRequest.current) setSessionsLoading(false); }
  }, []);
  useEffect(() => { void loadSessions(); }, [loadSessions]);
  const chooseSession = (id: string) => { setSelected(id); setConnections(false); setAccountHub(false); setTab('displays'); setMobileNav(false); const url = new URL(window.location.href); url.searchParams.set('session', id); window.history.replaceState({}, '', url); };
  const goHome = () => { homeFirst.current = true; setSelected(null); setConnections(false); setAccountHub(false); setMobileNav(false); const url = new URL(window.location.href); url.searchParams.delete('session'); url.searchParams.delete('account'); window.history.replaceState({}, '', url); };
  const owner = state.detail?.session.ownerId === auth.user?.id || state.detail?.session.role === 'owner', editable = owner || state.detail?.session.role === 'editor';
  const panelProps = state.detail ? { detail: state.detail, reload: state.reload, editable, owner } : null;
  const activeSessions = sessions.filter(s => !s.endedAt), visibleSessions = includeEnded ? sessions : activeSessions;
  const session = state.detail?.session ?? sessions.find(s => s.id === selected);
  const goPublish = () => setTab('publish');
  return <div className={`workspace ${mobileNav ? 'nav-is-open' : ''}`}>
    {mobileNav && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside id="workspace-navigation" className="workspace-sidebar" inert={mobileLayout && !mobileNav}><a className="brand-link" href="/" aria-label="KANVAS workspace"><Wordmark /></a><div className="sidebar-intro">Your ideas, in view.</div>
      <button className={`sidebar-overview ${!connections && !accountHub && !selected ? 'active' : ''}`} onClick={goHome}><Icon name="layers" size={19} />Workspace<span>{activeSessions.length}</span></button>
      <div className="sidebar-section-label"><span>Sessions</span><IconButton icon="plus" label="Create session" onClick={() => setNewSession(true)} /></div>
      <nav className="session-nav" aria-label="Sessions">{visibleSessions.map(s => <button key={s.id} className={`${selected === s.id && !connections && !accountHub ? 'selected' : ''} ${s.endedAt ? 'ended' : ''}`} onClick={() => chooseSession(s.id)}><span className="session-initial">{s.name.slice(0, 1).toUpperCase()}</span><span className="session-nav-name">{s.name}<small>{s.endedAt ? 'Ended' : s.role && s.role !== 'owner' ? `Shared · ${s.role}` : s.id === selected && state.detail ? `${state.detail.displays.length} display${state.detail.displays.length === 1 ? '' : 's'}` : 'Private session'}</small></span><Icon name="chevron" size={13} /></button>)}{!sessionsLoading && !visibleSessions.length && <span className="sidebar-empty">Your first session starts here.</span>}</nav>
      <button className="sidebar-new" onClick={() => setNewSession(true)}><Icon name="plus" size={16} />New session</button>
      <button className="sidebar-new" onClick={()=>{setInviting(true);setMobileNav(false);}}><Icon name="people" size={16}/>Invite to KANVAS</button>
      {sessions.some(s => s.endedAt) && <button className="sidebar-archive" onClick={() => setIncludeEnded(!includeEnded)}>{includeEnded ? 'Hide ended sessions' : 'Show ended sessions'}</button>}
      <div className="sidebar-bottom"><button className={`sidebar-connections ${accountHub ? 'active' : ''}`} onClick={()=>{setAccountHub(true);setConnections(false);setMobileNav(false);}}><Icon name="people" size={18}/>Account &amp; teams<Icon name="chevron" size={14}/></button><button className={`sidebar-connections ${connections ? 'active' : ''}`} onClick={() => { setConnections(true); setAccountHub(false); setMobileNav(false); }}><Icon name="key" size={18} />Agent connections<Icon name="chevron" size={14} /></button><div className="sidebar-user"><span className="avatar">{auth.user?.avatarUrl?<img src={auth.user.avatarUrl} alt=""/>:(auth.user?.displayName || auth.user?.username || '?').slice(0, 1).toUpperCase()}</span><div><strong>{auth.user?.displayName || auth.user?.username}</strong><span>@{auth.user?.username}</span></div><IconButton icon="logout" label="Sign out" onClick={() => void auth.logout().catch(e => setSessionsError(errorMessage(e)))} /></div></div>
    </aside>
    <main className="workspace-main"><header className="workspace-header"><div className="workspace-heading"><IconButton icon="layers" label="Open navigation" className="mobile-menu" aria-expanded={mobileNav} aria-controls="workspace-navigation" onClick={() => setMobileNav(true)} /><div><span className="eyebrow">{accountHub ? 'Your account' : connections ? 'Bring your agent along' : 'Your visual workspace'}</span><h1>{accountHub ? 'People, groups & history' : connections ? 'Agent connections' : session?.name ?? 'A space for what’s next.'}</h1></div></div><div className="workspace-header-actions">{session && !connections && !accountHub && <Badge tone={state.connection === 'live' ? 'good' : state.connection === 'offline' ? 'warn' : 'neutral'} dot>{state.connection === 'live' ? 'Live session' : state.connection === 'offline' ? 'Reconnecting' : session.endedAt ? 'Ended' : 'Connecting'}</Badge>}<Button variant="secondary" icon="plus" onClick={() => setNewSession(true)}>New session</Button></div></header>
      <ErrorNotice message={sessionsError} onDismiss={() => setSessionsError(null)} />
      {!accountHub && !connections && session && <nav className="workspace-tabs" aria-label="Session workspace">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}><Icon name={item.icon} size={17} />{item.name}{item.id === 'activity' && !!state.detail?.interactions.filter(i => i.status === 'pending').length && <span className="tab-count">{state.detail.interactions.filter(i => i.status === 'pending').length}</span>}</button>)}</nav>}
      <div className="workspace-content">
        {accountHub ? <AccountHub/> : connections ? <ConnectionsPanel sessions={activeSessions} /> : sessionsLoading ? <Loading /> : !selected && sessions.length ? <SessionsHome sessions={sessions} onChoose={chooseSession} onCreate={() => setNewSession(true)} /> : !selected ? <div className="welcome-workspace"><div><span className="eyebrow">One session. Many possibilities.</span><h2>Give the conversation<br /><em>something to look at.</em></h2><p>Create a session, open a display, and let your ideas take shape.</p><Button icon="plus" onClick={() => setNewSession(true)}>Create your first session</Button></div><div className="welcome-art" aria-hidden="true"><span>Clarity.</span><i /><small>Every great idea starts with a little space.</small></div><div className="welcome-steps"><article><span>01</span><h3>Make a session</h3><p>A private space for your conversation and its visuals.</p></article><article><span>02</span><h3>Connect a display</h3><p>A phone, a desktop, or the screen everyone can see.</p></article><article><span>03</span><h3>Bring it to life</h3><p>Send a visual yourself, or connect your agent.</p></article></div></div> : state.loading && !state.detail ? <Loading label="Opening session" /> : !panelProps ? <EmptyState icon="lock" title={session?.endedAt ? 'This session has ended.' : 'Session unavailable'} action={<Button variant="secondary" icon="refresh" onClick={() => { state.reconnect(); void loadSessions(); }}>Refresh</Button>}>{state.error ?? 'You may no longer have access to this session.'}</EmptyState> : <>
          {state.error && <ErrorNotice message={state.error} />}
          {tab === 'displays' && <DisplaysPanel {...panelProps} onPublish={goPublish} />}
          {tab === 'publish' && <PublishPanel {...panelProps} />}
          {tab === 'library' && <LibraryPanel {...panelProps} />}
          {tab === 'activity' && <ActivityPanel {...panelProps} />}
          {tab === 'access' && <AccessPanel {...panelProps} />}
          {tab === 'settings' && <SettingsPanel {...panelProps} onEnded={() => { setSelected(null); void loadSessions(); }} />}
        </>}
      </div><footer className="workspace-footer"><span>KANVAS</span><span>Made for the conversation.</span><span className="footer-privacy"><Icon name="lock" size={12} />Private by default</span></footer>
    </main>
    {newSession && <NewSessionModal onClose={() => setNewSession(false)} onCreated={async s => { setNewSession(false); await loadSessions(); chooseSession(s.id); }} />}
    {inviting&&<InvitationModal onClose={()=>setInviting(false)}/>}
    <OwnerNotices/>
  </div>;
}
function NewSessionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (session: SessionRecord) => Promise<void> }) {
  const [name, setName] = useState(''); const task = useTask();
  return <Modal title="A new space to begin." onClose={onClose}><p className="modal-description">Sessions keep your displays, content, and people together. Only you have access until you invite someone.</p><form onSubmit={event => { event.preventDefault(); void task.run(async () => { const session = await api<SessionRecord>('/api/sessions', { method: 'POST', body: { name: name.trim() } }); await onCreated(session); }); }}><Field label="Session name"><input value={name} onChange={e => setName(e.target.value)} required maxLength={100} placeholder="e.g. Design conversation" autoFocus /></Field><ErrorNotice message={task.error} /><div className="form-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" icon="arrow" busy={task.busy}>Create session</Button></div></form></Modal>;
}
