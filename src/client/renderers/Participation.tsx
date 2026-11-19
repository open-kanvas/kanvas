import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TemplateResponseState } from '../../shared/types';
import type { FormData as FormViewData, FormField, PollData, QAData } from '../../shared/view-schemas';
import {FileField} from '../SessionUploads';
import { errorMessage } from '../api';

export type Respond = (value: Record<string, unknown>) => Promise<unknown>;
interface ResponseProps { sessionId?:string;displayId?:string;revision?:number; actionable?: boolean; preview?: boolean; onRespond?: Respond; responseState?: TemplateResponseState }
function useResponse(enabled: boolean, onRespond?: Respond) {
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const send = async (value: Record<string, unknown>) => {
    if (!enabled || !onRespond || sending.current) return false;
    sending.current = true; setBusy(true); setError(null);
    try { await onRespond(value); setSent(true); return true; }
    catch (error) { setError(errorMessage(error)); return false; }
    finally { sending.current = false; setBusy(false); }
  };
  return { busy, sent, error, send };
}
function ResponseMessage({ error, message }: { error?: string | null; message?: string }) {
  return <>{message && <p className="response-status" role="status">{message}</p>}{error && <p className="inline-error" role="alert">{error}</p>}</>;
}
type FieldValue = string | boolean | string[];
const initialValues = (fields: FormField[]): Record<string, FieldValue> => Object.fromEntries(fields.map(field => [field.id, field.type === 'range' ? String(field.min) : field.type === 'checkbox' ? false : ['multi-choice','file'].includes(field.type) ? [] : '']));

/** Source-defined field IDs and option IDs are sent exactly; aggregate/identity data is never accepted. */
export function FormRenderer({ data, actionable, preview, onRespond, responseState,sessionId,displayId,revision }: ResponseProps & { data: FormViewData }) {
  const prefix = useId(), [values, setValues] = useState(() => initialValues(data.fields)),[uploading,setUploading]=useState<Record<string,boolean>>({});
  const canRespond = Boolean(actionable && onRespond && !preview && !data.closed);
  const response = useResponse(canRespond, onRespond), submitted = response.sent || responseState?.form?.submitted;
  const disabled = !canRespond || response.busy || Boolean(submitted);
  const change = (field: string, value: FieldValue) => setValues(previous => ({ ...previous, [field]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || Object.values(uploading).some(Boolean) || !event.currentTarget.reportValidity()) return;
    const payload: Record<string, string | boolean | number | string[]> = {};
    for (const field of data.fields) {
      const value = values[field.id];
      if (value === '' || value === undefined || Array.isArray(value) && !value.length) continue;
      payload[field.id] = field.type === 'number' || field.type === 'range' ? Number(value) : value;
    }
    await response.send({ kind: 'form.submit', values: payload });
  };
  return <div className="form-content">
    {data.description && <p className="participation-description">{data.description}</p>}
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={disabled} className="form-fields"><legend className="sr-only">Response fields</legend>{data.fields.map(field => {
        const id = `${prefix}-${field.id}`, label = <>{field.label}{field.required && <span className="required-field" aria-label="required"> *</span>}</>;
        const describedBy = field.help ? `${id}-help` : undefined;
        return <div className={`response-field field-${field.type}`} key={field.id}>
          {field.type==='file'?<><label htmlFor={id}>{label}</label><FileField id={id} required={field.required} disabled={disabled} limits={field} target={sessionId&&displayId&&revision!==undefined?{sessionId,displayId,revision,fieldId:field.id}:undefined} onChange={ids=>change(field.id,ids)} onBusy={busy=>setUploading(old=>({...old,[field.id]:busy}))}/></>:field.type === 'multi-choice' ? <fieldset aria-describedby={describedBy}><legend>{label}</legend><div className="response-choices">{field.options.map(option => {
            const selected = Array.isArray(values[field.id]) ? values[field.id] as string[] : [];
            return <label key={option.id}><input type="checkbox" name={field.id} value={option.id} checked={selected.includes(option.id)} disabled={disabled || Boolean(field.maxChoices && selected.length >= field.maxChoices && !selected.includes(option.id))} onChange={event => change(field.id, event.target.checked ? [...selected, option.id] : selected.filter(value => value !== option.id))} />{option.label}</label>;
          })}</div>{field.required && !(values[field.id] as string[])?.length && <span className="field-hint">Choose at least one option.</span>}</fieldset>
            : field.type === 'checkbox' ? <label className="response-check" htmlFor={id}><input id={id} name={field.id} type="checkbox" checked={Boolean(values[field.id])} required={field.required} aria-describedby={describedBy} onChange={event => change(field.id, event.target.checked)} />{label}</label>
              : <><label htmlFor={id}>{label}</label>{field.type === 'textarea' ? <textarea id={id} name={field.id} value={String(values[field.id] ?? '')} required={field.required} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder} aria-describedby={describedBy} onChange={event => change(field.id, event.target.value)} />
                : field.type === 'choice' ? <select id={id} name={field.id} required={field.required} value={String(values[field.id] ?? '')} aria-describedby={describedBy} onChange={event => change(field.id, event.target.value)}><option value="">Choose an option</option>{field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
                  : field.type === 'range' ? <div className="response-range"><input id={id} name={field.id} type="range" min={field.min} max={field.max} step={field.step ?? 1} value={String(values[field.id] ?? field.min)} aria-describedby={describedBy} onChange={event => change(field.id, event.target.value)} /><output htmlFor={id}>{String(values[field.id] ?? field.min)}</output></div>
                    : field.type === 'number' ? <input id={id} name={field.id} type="number" min={field.min} max={field.max} step={field.step ?? 'any'} required={field.required} placeholder={field.placeholder} value={String(values[field.id] ?? '')} aria-describedby={describedBy} onChange={event => change(field.id, event.target.value)} />
                      : <input id={id} name={field.id} type={field.type} required={field.required} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder} value={String(values[field.id] ?? '')} aria-describedby={describedBy} onChange={event => change(field.id, event.target.value)} />}</>}
          {field.help && <p id={`${id}-help`} className="field-hint">{field.help}</p>}
        </div>;
      })}</fieldset>
      {!preview && <div className="response-actions"><button className="response-submit" type="submit" disabled={disabled || Object.values(uploading).some(Boolean) || data.fields.some(field => ['multi-choice','file'].includes(field.type) && field.required && !(values[field.id] as string[])?.length)}>{response.busy ? 'Sending…' : data.submitLabel ?? 'Submit response'}</button><ResponseMessage error={response.error} message={submitted ? 'Response sent' : data.closed ? 'This form is closed.' : !canRespond ? 'View-only access' : undefined} /></div>}
    </form>
  </div>;
}

export function PollRenderer({ data, actionable, preview, onRespond, responseState }: ResponseProps & { data: PollData }) {
  const state = responseState?.poll, selectionKey = JSON.stringify(state?.selectedOptionIds ?? []), prefix = useId();
  const [selected, setSelected] = useState<string[]>(state?.selectedOptionIds ?? []);
  useEffect(() => { setSelected(JSON.parse(selectionKey) as string[]); }, [selectionKey]);
  const canRespond = Boolean(actionable && onRespond && !preview && !data.closed), response = useResponse(canRespond, onRespond);
  const maxChoices = data.maxChoices ?? 1;
  const hasResults = state?.revealed === true && typeof state.totalVotes === 'number' && state.counts !== undefined;
  return <div className="poll-content">
    <h2 className="participation-prompt">{data.question}</h2><p className="participation-hint">{maxChoices === 1 ? 'Choose one option.' : `Choose up to ${maxChoices} options.`}</p>
    <form onSubmit={event => { event.preventDefault(); if (selected.length) void response.send({ kind: 'poll.vote', optionIds: selected }); }}>
      <fieldset className="poll-options" disabled={!canRespond || response.busy}><legend className="sr-only">{data.question}</legend>{data.options.map(option => {
        // Never fall back to view.data totals or calculate votes from local selections.
        const count = hasResults ? Math.max(0, Math.floor(state.counts![option.id] ?? 0)) : undefined;
        const percent = count === undefined || !state?.totalVotes ? 0 : Math.min(100, count / state.totalVotes * 100);
        return <label className={`poll-option ${selected.includes(option.id) ? 'selected' : ''}`} key={option.id} htmlFor={`${prefix}-${option.id}`}>
          <input id={`${prefix}-${option.id}`} name={prefix} type={maxChoices === 1 ? 'radio' : 'checkbox'} value={option.id} checked={selected.includes(option.id)} disabled={!canRespond || response.busy || selected.length >= maxChoices && !selected.includes(option.id) && maxChoices > 1} onChange={event => setSelected(previous => maxChoices === 1 ? [option.id] : event.target.checked ? [...previous, option.id] : previous.filter(value => value !== option.id))} />
          <span>{option.label}</span>{count !== undefined && <><span className="poll-count">{count} {count === 1 ? 'vote' : 'votes'}</span><span className="poll-bar" style={{ width: `${percent}%` }} aria-hidden="true" /></>}
        </label>;
      })}</fieldset>
      {!preview && <div className="response-actions"><button className="response-submit" disabled={!canRespond || response.busy || !selected.length} type="submit">{response.busy ? 'Saving…' : state?.selectedOptionIds?.length ? 'Update vote' : 'Vote'}</button><ResponseMessage error={response.error} message={response.sent ? 'Vote saved' : data.closed ? 'Voting is closed.' : !canRespond ? 'View-only access' : undefined} /></div>}
    </form>
    {hasResults ? <p className="poll-results-status" role="status">{state.totalVotes} {state.totalVotes === 1 ? 'participant has' : 'participants have'} voted{maxChoices > 1 ? ' · multiple selections allowed' : ''}.</p> : <p className="poll-results-status">{state?.revealed ? 'Waiting for results from the server…' : 'Results are hidden until the presenter reveals them.'}</p>}
  </div>;
}

export function QARenderer({ data, actionable, preview, onRespond, responseState }: ResponseProps & { data: QAData }) {
  const [text, setText] = useState(''), id = useId();
  const canRespond = Boolean(actionable && onRespond && !preview && !data.closed), response = useResponse(canRespond, onRespond);
  const state = responseState?.qa, entries = state?.revealed ? state.entries ?? [] : [];
  const highest = Math.max(1, ...entries.map(entry => entry.count ?? 1)), words = data.mode === 'word-cloud';
  return <div className={`qa-content qa-${data.mode ?? 'questions'}`}>
    <h2 className="participation-prompt">{data.prompt}</h2>
    {words && <p className="participation-hint">One word or short phrase.</p>}
    {!preview && <form className="qa-response" onSubmit={event => { event.preventDefault(); if (text.trim()) void response.send({ kind: 'qa.submit', text }).then(sent => { if (sent) setText(''); }); }}><label className="sr-only" htmlFor={id}>{words ? 'Your word or phrase' : 'Your question'}</label>{words ? <input id={id} value={text} maxLength={data.maxLength ?? 500} disabled={!canRespond || response.busy} onChange={event => setText(event.target.value)} placeholder="Your word or phrase" required /> : <textarea id={id} value={text} maxLength={data.maxLength ?? 500} disabled={!canRespond || response.busy} onChange={event => setText(event.target.value)} placeholder="Your question" required />}<div className="response-actions"><button className="response-submit" type="submit" disabled={!canRespond || response.busy || !text.trim()}>{response.busy ? 'Sending…' : 'Send'}</button><ResponseMessage error={response.error} message={response.sent ? 'Response sent' : data.closed ? 'Submissions are closed.' : !canRespond ? 'View-only access' : undefined} /></div></form>}
    {!state?.revealed ? <p className="qa-empty">Responses are hidden until the presenter reveals them.</p> : entries.length ? words ? <ul className="word-cloud" aria-label="Audience word cloud">{entries.map(entry => <li key={entry.id} style={{ fontSize: `${1.1 + Math.sqrt((entry.count ?? 1) / highest) * 2.4}em` }}><span dir="auto">{entry.text}</span><small aria-label={`${entry.count ?? 1} occurrences`}>{entry.count ?? 1}</small></li>)}</ul> : <ol className="qa-entries" aria-label="Audience questions">{entries.map(entry => <li key={entry.id}><p dir="auto">{entry.text}</p>{entry.count !== undefined && entry.count > 1 && <span>{entry.count} submissions</span>}</li>)}</ol> : <p className="qa-empty">{words ? 'The word cloud will appear here.' : 'No questions yet.'}</p>}
  </div>;
}
