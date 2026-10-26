import type { SessionRecord } from '../shared/types';
import { Button } from './components/ui';
import './sessions-home.css';

const roles: Record<string, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
const day = (value?: string) => {
  const date = value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
};
const newest = (a: SessionRecord, b: SessionRecord) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');

function Row({ session, onChoose }: { session: SessionRecord; onChoose: (id: string) => void }) {
  const updated = day(session.endedAt ?? session.updatedAt);
  const meta = [roles[session.role ?? ''] ?? '', updated ? `${session.endedAt ? 'Ended' : 'Updated'} ${updated}` : ''].filter(Boolean).join(' · ');
  return <li><button type="button" className="sessions-home-row" onClick={() => onChoose(session.id)}>
    <span className="sessions-home-initial" aria-hidden="true">{session.name.slice(0, 1).toUpperCase()}</span>
    <span className="sessions-home-name">{session.name}{session.agentConnections?.map(c=><small key={c.id}> · {c.selfReported.agent??c.inferred.clientName??"Agent"}{c.started?" (started)":" (joined)"}</small>)}</span>
    <span className="sessions-home-meta">{meta}</span>
  </button></li>;
}

/** Account home at the root URL: every session this account can open,
 * independent of whichever session was used last. */
export function SessionsHome({ sessions, onChoose, onCreate }: { sessions: SessionRecord[]; onChoose: (id: string) => void; onCreate: () => void }) {
  const open = sessions.filter(session => !session.endedAt).sort(newest), ended = sessions.filter(session => session.endedAt).sort(newest);
  return <section className="sessions-home" aria-labelledby="sessions-home-title">
    <header className="sessions-home-header">
      <div><span className="eyebrow">Account home</span><h2 id="sessions-home-title">Your sessions</h2><p>Open a session to manage its displays and content, or start a new one.</p></div>
      <div className="sessions-home-actions"><Button icon="plus" onClick={onCreate}>New session</Button><a className="button button-secondary" href="/start">Use this browser as a screen</a></div>
    </header>
    {open.length ? <ul className="sessions-home-list">{open.map(session => <Row key={session.id} session={session} onChoose={onChoose} />)}</ul>
      : <p className="sessions-home-empty">No open sessions. Start a new one when you need it.</p>}
    {ended.length > 0 && <details className="sessions-home-ended"><summary>{ended.length === 1 ? '1 ended session' : `${ended.length} ended sessions`}</summary>
      <ul className="sessions-home-list">{ended.map(session => <Row key={session.id} session={session} onChoose={onChoose} />)}</ul></details>}
  </section>;
}
