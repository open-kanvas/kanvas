import { useCallback, useEffect, useRef, useState } from 'react';
import { REPORT_STATUSES, REPORT_DESCRIPTION_MAX, type ReportPage, type ReportRecord } from '../../shared/reports';
import { api, errorMessage, requestId, sessionPath, viewerPath } from '../api';
import { useAuth,useTask } from '../hooks';
import { Badge, Button, EmptyState, ErrorNotice, Field, formatDate } from '../components/ui';
import type { PanelProps } from '../Workspace';
import './reports.css';

export function ReportsPanel({ detail, owner }: PanelProps) {
  const auth=useAuth();
  const [scope,setScope]=useState<'session'|'account'|'service'|'all'>('session'),[writeScope,setWriteScope]=useState<'session'|'account'|'service'>('session'),[serviceAdmin,setServiceAdmin]=useState(false);
  const [reports, setReports] = useState<ReportRecord[]>([]), [nextCursor, setNextCursor] = useState<string>();
  const [filter, setFilter] = useState('all'), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false), [kind, setKind] = useState<'feedback' | 'error'>('feedback');
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [displayId, setDisplayId] = useState('');
  const [saved, setSaved] = useState<string>(), [submissionId, setSubmissionId] = useState(requestId);
  const generation = useRef(0); const task = useTask();
  const sessionId = detail.session.id;
  const load = useCallback(async (afterId?: string) => {
    const current = ++generation.current; setLoading(true);
    try {
      const query = new URLSearchParams({ status: filter, ...(scope!=='session'?{scope}:{}), ...(afterId ? { afterId } : {}) });
      const page = await api<ReportPage>(`${scope==='session'?`${sessionPath(sessionId)}/reports`:'/api/reports'}?${query}`);
      if (current !== generation.current) return;
      setReports(old => afterId ? [...old, ...page.reports.filter(report => !old.some(existing => existing.id === report.id))] : page.reports);
      setServiceAdmin(page.serviceAdmin===true);setNextCursor(page.nextCursor); setError(null);
    } catch (failure) { if (current === generation.current) setError(errorMessage(failure)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [sessionId, filter,scope]);
  useEffect(() => { setReports([]); setNextCursor(undefined); void load(); return () => { generation.current++; }; }, [load]);
  const change = (apply: () => void) => { apply(); setSubmissionId(requestId()); setSaved(undefined); };
  return <div className="reports-panel">
    <div className="panel-heading"><div><h3>Feedback & error reports</h3><p>A shared record of problems, ideas, and what we learned. Choose session, private account feedback, or a general service request. Only service administrators can see the unified log.</p></div><div className="form-actions"><Button variant="secondary" disabled={loading} onClick={() => void load()}>Refresh reports</Button><Button onClick={() => setWriting(!writing)}>{writing ? 'Close form' : 'Write a report'}</Button></div></div>
    {writing && <form className="report-compose" onSubmit={event => { event.preventDefault(); void task.run(async () => {
      const record = await api<ReportRecord>(`${writeScope==='session'?sessionPath(sessionId):'/api'}/${kind === 'error' ? 'error-reports' : 'feedback'}`, { method: 'POST', body: { ...(writeScope!=='session'?{scope:writeScope}:{}), requestId: submissionId, title, description, client: 'browser', ...(writeScope==='session'&&displayId ? { displayId } : {}) } });
      setSaved(record.id); setTitle(''); setDescription(''); setSubmissionId(requestId()); setWriting(false); await load();
    }); }}>
      <Field label="Report scope"><select value={writeScope} onChange={e=>change(()=>setWriteScope(e.target.value as typeof writeScope))}><option value="session">This session</option><option value="account">My account (private)</option><option value="service">General KANVAS service request</option></select></Field><div className="field-row"><Field label="Report type"><select value={kind} onChange={e => change(() => setKind(e.target.value as typeof kind))}><option value="feedback">Feedback or suggestion</option><option value="error">Something went wrong</option></select></Field><Field label="Related display"><select disabled={writeScope!=='session'} value={displayId} onChange={e => change(() => setDisplayId(e.target.value))}><option value="">Whole session</option>{detail.displays.map(display => <option key={display.id} value={display.id}>{display.name}</option>)}</select></Field></div>
      <Field label="Report title"><input required maxLength={160} value={title} onChange={e => change(() => setTitle(e.target.value))} /></Field>
      <Field label="What happened or could be better?" hint={`${description.trim().length} / ${REPORT_DESCRIPTION_MAX} characters. Include useful context, but no passwords, access tokens or private source content.`}><textarea required maxLength={REPORT_DESCRIPTION_MAX} rows={8} value={description} onChange={e => change(() => setDescription(e.target.value))} /></Field>
      <ErrorNotice message={task.error} /><div className="form-actions"><Button type="submit" busy={task.busy}>Submit report</Button></div>
    </form>}
    {saved && <p role="status">Report saved. Reference: {saved}</p>}
    <Field label="Report list"><select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="session">This session</option><option value="account">My account</option><option value="service">{serviceAdmin?'Service requests':'My service requests'}</option>{serviceAdmin&&<option value="all">All reports · service administration</option>}</select></Field>
    <Field label="Report status"><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{REPORT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
    <ErrorNotice message={error} />
    {reports.length ? <div className="report-list">{reports.map(report => <ReportItem key={report.id} report={report} owner={report.scope==='account'&&report.accountId===auth.user?.id||report.scope==='service'&&serviceAdmin||(!report.scope||report.scope==='session')&&report.sessionId===sessionId&&owner} reload={load} />)}</div> : <EmptyState icon="activity" title={loading ? 'Loading reports…' : 'No reports here yet.'}>Connected agents can submit feedback and reproducible errors here, separately from viewer button responses.</EmptyState>}
    {nextCursor && <div className="form-actions"><Button variant="secondary" busy={loading} onClick={() => void load(nextCursor)}>Load more reports</Button></div>}
  </div>;
}

function ReportItem({ report, owner, reload }: { report: ReportRecord; owner: boolean; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<{ revision: number; status: ReportRecord['status']; note: string } | null>(null);
  const task = useTask();
  const stale = draft !== null && draft.revision !== report.revision;
  return <article className="report-item" aria-label={`Report: ${report.title}`}>
    <div className="report-heading"><h4>{report.title}</h4><Badge tone={report.status === 'resolved' ? 'good' : report.kind === 'error' ? 'warn' : 'neutral'}>{report.status}</Badge><Badge>{report.kind}</Badge><Badge>{report.scope??'session'}</Badge></div>
    <p className="report-text">{report.description}</p>
    <small>{report.client ?? 'Connected account'} · {formatDate(report.createdAt)}{report.severity ? ` · ${report.severity} severity` : ''}</small>
    {report.displayId && report.sessionId && <p><a href={viewerPath(report.sessionId!, report.displayId)} target="_blank" rel="noreferrer">Open related display</a></p>}
    {!!report.steps?.length && <ol>{report.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
    {report.expected && <p className="report-text"><strong>Expected: </strong>{report.expected}</p>}{report.actual && <p className="report-text"><strong>Observed: </strong>{report.actual}</p>}
    {report.history.length > 0 && <details open><summary>Review history</summary><ul>{report.history.map((item, index) => <li key={index}><strong>{item.status}</strong> · {formatDate(item.createdAt)}<p className="report-text">{item.note}</p></li>)}</ul></details>}
    <details><summary>Report reference & diagnostic</summary><dl><dt>Report ID</dt><dd>{report.id}</dd><dt>Revision</dt><dd>{report.revision}</dd>{report.diagnostic && <><dt>Diagnostic ID</dt><dd>{report.diagnostic.id}</dd><dt>Operation / phase</dt><dd>{report.diagnostic.operation} / {report.diagnostic.phase}</dd><dt>Error code</dt><dd>{report.diagnostic.code}</dd></>}{report.updateId && <><dt>Update ID</dt><dd>{report.updateId}</dd></>}</dl>{report.diagnostic?.issues?.map((issue, index) => <p key={index}>{issue.path}: {issue.problem}</p>)}{report.redacted && <p>Credential-like text or URL parameters were removed before saving.</p>}</details>
    {owner && !draft && <Button variant="secondary" onClick={() => setDraft({ revision: report.revision, status: report.status, note: '' })}>Review report</Button>}
    {draft && <form className="report-review" onSubmit={event => { event.preventDefault(); void task.run(async () => {
      await api(`${report.sessionId?`${sessionPath(report.sessionId)}/reports`:'/api/reports'}/${encodeURIComponent(report.id)}`, { method: 'PATCH', body: { ...(report.scope?{scope:report.scope}:{}), expectedRevision: draft.revision, status: draft.status, note: draft.note } });
      setDraft(null); await reload();
    }); }}>
      <Field label="Review status"><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as ReportRecord['status'] })}>{REPORT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
      <Field label="Review note" hint="Record the finding, follow-up, or verified fix."><textarea required maxLength={2000} rows={3} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></Field>
      {stale && <p role="alert">Another review changed this report. Your note is preserved; cancel and reopen the review to use its latest revision.</p>}
      <ErrorNotice message={task.error} /><div className="form-actions"><Button variant="secondary" type="button" onClick={() => setDraft(null)}>Cancel review</Button><Button type="submit" busy={task.busy} disabled={stale}>Save review</Button></div>
    </form>}
  </article>;
}
