import { z } from 'zod';
import { formDataSchema, pollDataSchema, qaDataSchema, type FormField } from '../shared/view-schemas.js';
import type { DisplayRecord, TemplateResponseState, ViewSpec } from '../shared/types.js';
import { AppError, id, now, Store } from './store.js';
import type {ViewerUploadRecord} from './session-uploads.js';
import { hash } from './auth.js';

export interface EngagementDisplay extends DisplayRecord { interactionEpoch?: string }
interface ResponseRecord { id: string; sessionId: string; displayId: string; epoch: string; userId: string; kind: 'form'|'poll'|'qa'; value: unknown; createdAt: string }
const fail = (message: string): never => { throw new AppError('INVALID_RESPONSE', message); };
export function displayedLeaf(view: ViewSpec | null): ViewSpec | null {
  if (view?.template !== 'presentation') return view;
  const data = view.data as { slides: ViewSpec[]; index?: number }; return data.slides[data.index ?? 0] ?? null;
}
export function replaceLeaf(view: ViewSpec, data: Record<string, unknown>): ViewSpec {
  if (view.template !== 'presentation') return { ...view, data };
  const slides = structuredClone(view.data.slides) as ViewSpec[], index = Number(view.data.index) || 0;
  slides[index] = { ...slides[index], data }; return { ...view, data: { ...view.data, slides } };
}
function validateField(field: FormField, value: unknown): unknown {
  const empty = value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
  if (empty) { if (field.required) fail('A required form field is empty.'); return undefined; }
  if(field.type==='file'){if(!Array.isArray(value)||value.length>field.maxCount||new Set(value).size!==value.length||value.some(x=>typeof x!=='string'||x.length>128))fail('Choose files within the displayed count limit.');return value;}
  if (field.type === 'checkbox') { if (typeof value !== 'boolean' || (field.required && !value)) fail('A required checkbox must be checked.'); return value; }
  if (field.type === 'number' || field.type === 'range') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('A numeric field must contain a finite number.');
    const n = value as number;
    if (field.min !== undefined && n < field.min || field.max !== undefined && n > field.max) fail('A numeric field is outside its allowed range.');
    if (field.step !== undefined) { const steps = (n - (field.min ?? 0)) / field.step; if (Math.abs(steps - Math.round(steps)) > 1e-7 * Math.max(1, Math.abs(steps))) fail('A numeric field does not match its step.'); }
    return n;
  }
  if (field.type === 'choice') { if (typeof value !== 'string' || !field.options.some(option => option.id === value)) fail('Select one of the displayed choices.'); return value; }
  if (field.type === 'multi-choice') {
    if (!Array.isArray(value) || value.length > (field.maxChoices ?? field.options.length) || new Set(value).size !== value.length || value.some(v => typeof v !== 'string' || !field.options.some(o => o.id === v))) fail('Select unique options within the displayed choice limit.');
    return value;
  }
  if (typeof value !== 'string' || value.length > field.maxLength) fail('Text exceeds the displayed field limit.');
  if (field.type === 'email' && !z.email().safeParse(value).success) fail('Enter a valid email address. This response does not verify mailbox ownership.');
  return value;
}

/** Per-identity answers are authoritative; render data cannot supply vote totals. */
export class Engagement {
  private readonly recent = new Map<string, number[]>();
  constructor(private readonly store: Store) {}
  private epoch(display: EngagementDisplay): string { return `${display.interactionEpoch ?? 'legacy'}:${display.view?.template === 'presentation' ? Number(display.view.data.index) || 0 : 0}`; }
  private async records(display: EngagementDisplay): Promise<Awaited<ResponseRecord[]>> {
    return (await this.store.list<ResponseRecord>('audience-response', display.sessionId)).filter(record => record.displayId === display.id && record.epoch === this.epoch(display));
  }
  async submit(display: EngagementDisplay, userId: string, raw: Record<string, unknown>): Promise<Awaited<{ actionId: string; value: unknown; record: ResponseRecord }>> {
    return this.store.atomic(async () => {
    const view = displayedLeaf(display.view), epoch = this.epoch(display);
    if (!view || !['form', 'poll', 'qa'].includes(view.template)) fail('This view does not accept that response type.');
    const rows = (await this.records(display)), kind = view!.template as 'form'|'poll'|'qa';
    const existing = rows.find(row => row.kind === kind && row.userId === userId);
    if (rows.length >= 1000 && (!existing || kind === 'qa')) throw new AppError('LIMIT_REACHED', 'This display has reached its audience-response limit.', 429);
    let value: unknown;
    if (kind === 'form') {
      const input = z.object({ kind: z.literal('form.submit'), values: z.record(z.string(), z.unknown()) }).strict().parse(raw);
      const data = formDataSchema.parse(view!.data); if (data.closed) throw new AppError('RESPONSE_CLOSED', 'This form is closed.', 409);
      if (Object.keys(input.values).some(key => !data.fields.some(field => field.id === key))) fail('The response contains an unknown form field.');
      for(const field of data.fields)if(field.type==='file'&&Array.isArray(input.values[field.id])){
       const records=await this.store.list<ViewerUploadRecord>('viewer-upload',display.sessionId);
       for(const assetId of input.values[field.id] as unknown[]){
        const upload=records.find(r=>r.assetId===assetId&&r.actor===userId&&r.displayId===display.id&&r.revision===display.revision&&r.fieldId===field.id);
        if(!upload||!field.accept.includes(upload.mimeType as typeof field.accept[number])||upload.size>field.maxSize||!await this.store.get('asset',upload.assetId))fail('A file is unavailable to this form response.');
       }
      }
      value = Object.fromEntries(data.fields.flatMap(field => { const result = validateField(field, input.values[field.id]); return result === undefined ? [] : [[field.id, result]]; }));
    } else if (kind === 'poll') {
      const input = z.object({ kind: z.literal('poll.vote'), optionIds: z.array(z.string().min(1).max(128)).min(1).max(20) }).strict().parse(raw);
      const data = pollDataSchema.parse(view!.data); if (data.closed) throw new AppError('RESPONSE_CLOSED', 'This poll is closed.', 409);
      if (input.optionIds.length > data.maxChoices || new Set(input.optionIds).size !== input.optionIds.length || input.optionIds.some(key => !data.options.some(option => option.id === key))) fail('Select unique options within the displayed vote limit.');
      value = input.optionIds;
    } else {
      const input = z.object({ kind: z.literal('qa.submit'), text: z.string().trim().min(1).max(2000) }).strict().parse(raw);
      const data = qaDataSchema.parse(view!.data); if (data.closed) throw new AppError('RESPONSE_CLOSED', 'This audience question is closed.', 409);
      if (input.text.length > data.maxLength) fail('The audience response exceeds the displayed text limit.');
      value = input.text;
    }
    const rateKey = `${display.id}:${userId}`, time = Date.now(), recent = (this.recent.get(rateKey) ?? []).filter(stamp => time - stamp < 60_000);
    if (this.recent.size > 5000) for (const [key, stamps] of this.recent) if (time - (stamps.at(-1) ?? 0) >= 60_000) this.recent.delete(key);
    if (recent.length >= 10 || (!this.recent.has(rateKey) && this.recent.size >= 10_000)) throw new AppError('RATE_LIMIT', 'Wait a minute before adding more audience responses.', 429);
    this.recent.set(rateKey, [...recent, time]);
    const record: ResponseRecord = { id: kind !== 'qa' && existing ? existing.id : id(), sessionId: display.sessionId, displayId: display.id, epoch, userId, kind, value, createdAt: now() };
    (await this.store.put('audience-response', record));
    // A bounded per-session store; old published views are not an unlimited answer archive.
    const all = (await this.store.list<ResponseRecord>('audience-response', display.sessionId));
    for (const old of all.slice(0, Math.max(0, all.length - 5000))) (await this.store.delete('audience-response', old.id));
    return { actionId: kind === 'poll' ? 'poll.vote' : `${kind}.submit`, value, record };

    });
  }
  async projection(display: EngagementDisplay, userId: string): Promise<Awaited<TemplateResponseState | undefined>> {
    const view = displayedLeaf(display.view); if (!view || !['form', 'poll', 'qa'].includes(view.template)) return;
    const rows = (await this.records(display)).filter(row => row.kind === view.template), mine = rows.filter(row => row.userId === userId);
    if (view.template === 'form') return { form: { submitted: Boolean(mine.length) } };
    if (view.template === 'poll') {
      const data = pollDataSchema.parse(view.data), selected = mine.at(-1)?.value as string[] | undefined;
      const counts: Record<string, number> = Object.fromEntries(data.options.map(option => [option.id, 0]));
      for (const row of rows) for (const option of row.value as string[]) if (Object.hasOwn(counts, option)) counts[option]++;
      return { poll: { revealed: data.revealResults, ...(selected ? { selectedOptionIds: selected } : {}), ...(data.revealResults ? { totalVotes: rows.length, counts } : {}) } };
    }
    const data = qaDataSchema.parse(view.data);
    let entries: { id: string; text: string; count?: number }[] = [];
    if (data.revealResults) {
      if (data.mode === 'questions') entries = rows.slice(-100).map(row => ({ id: row.id, text: String(row.value) }));
      else {
        const words = new Map<string, number>();
        for (const row of rows) for (const word of String(row.value).toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) words.set(word, (words.get(word) ?? 0) + 1);
        entries = [...words].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([text, count]) => ({ id: hash(text).slice(0, 24), text, count }));
      }
    }
    return { qa: { revealed: data.revealResults, submitted: Boolean(mine.length), ...(data.revealResults ? { entries } : {}) } };
  }
}
