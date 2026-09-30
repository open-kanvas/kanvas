import { z } from 'zod';

/** Offsets are JavaScript/DOM UTF-16 positions in the exact supplied text. */
export const DRAFTING_LIMITS = { text: 100_000, span: 4_000, suggestions: 100, replacement: 4_000 } as const;
const offset = z.number().int().min(0).max(DRAFTING_LIMITS.text);
const rangeShape = {
  start: offset.describe('Zero-based UTF-16 position in the exact current data.text. Do not split a surrogate pair.'),
  end: offset.describe('Exclusive UTF-16 end position. The nonempty source range may contain at most 4,000 units.'),
};
export const draftActorSchema = z.object({ id: z.string().min(1).max(128), name: z.string().min(1).max(160) }).strict();
export type DraftActor = z.infer<typeof draftActorSchema>;
const suggestion = z.object({
  id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/),
  ...rangeShape,
  replacement: z.string().max(DRAFTING_LIMITS.replacement).describe('Proposed replacement, not automatically applied. An empty string proposes deletion.'),
  reason: z.string().max(500).optional(),
  author: draftActorSchema.optional(),
}).strict();

export interface DraftRange { start: number; end: number }

/** Never permit an offset in the middle of an emoji/supplementary character. */
export function isDraftTextBoundary(text: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

export function validDraftRange(text: string, range: DraftRange): boolean {
  return range.start < range.end && range.end - range.start <= DRAFTING_LIMITS.span
    && isDraftTextBoundary(text, range.start) && isDraftTextBoundary(text, range.end);
}

export const draftingDataSchema = z.object({
  attribution: z.enum(['auto', 'show', 'hide']).optional(),
  collaborative: z.boolean().optional(),
  activity: z.array(z.object({ actor: draftActorSchema, action: z.enum(['edit', 'suggest', 'accept', 'reject']), suggestionId: z.string().max(128).optional(), revision: z.number().int().nonnegative(), at: z.string().datetime() }).strict()).max(50).optional(),
  text: z.string().max(DRAFTING_LIMITS.text).describe('Exact current draft, preserving spaces and line breaks. May initially be empty; text only, not HTML or a transcript log.'),
  purpose: z.string().min(1).max(160).optional().describe('Short purpose or destination hint, such as Email draft; does not configure delivery.'),
  status: z.enum(['drafting', 'reviewing', 'ready']).default('drafting').describe('Supplied drafting stage, not microphone activity or delivery status.'),
  suggestions: z.array(suggestion).max(DRAFTING_LIMITS.suggestions).default([]).describe('Unique-ID, non-overlapping suggestions against current text. Update affected anchors when revising that text.'),
  focus: z.object({ ...rangeShape, label: z.string().max(160).optional() }).strict().optional().describe('Agent-directed highlighted passage for review. May overlap a suggestion; does not change the draft.'),
}).strict().superRefine((data, ctx) => {
  const ids = new Set<string>();
  const ordered = data.suggestions.map((span, index) => ({ ...span, index })).sort((a, b) => a.start - b.start);
  for (const [order, span] of ordered.entries()) {
    if (ids.has(span.id)) ctx.addIssue({ code: 'custom', path: ['suggestions', span.index, 'id'], message: 'Suggestion IDs must be unique' });
    ids.add(span.id);
    if (!validDraftRange(data.text, span)) ctx.addIssue({ code: 'custom', path: ['suggestions', span.index], message: 'Suggestion must reference 1–4,000 UTF-16 units of the exact draft, without splitting a character' });
    if (order > 0 && span.start < ordered[order - 1].end) ctx.addIssue({ code: 'custom', path: ['suggestions', span.index], message: 'Suggestion ranges must not overlap' });
  }
  if (data.focus && !validDraftRange(data.text, data.focus)) ctx.addIssue({ code: 'custom', path: ['focus'], message: 'Focus must reference 1–4,000 UTF-16 units of the exact draft, without splitting a character' });
});
export type DraftingData = z.infer<typeof draftingDataSchema>;

export const draftingSelectionSchema = z.object({
  kind: z.literal('drafting.select'),
  ...rangeShape,
  text: z.string().min(1).max(DRAFTING_LIMITS.span),
  via: z.enum(['selection', 'passage', 'suggestion']),
  suggestionId: z.string().min(1).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.start >= value.end || value.end - value.start !== value.text.length) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Selection range must match the exact selected text length' });
  if ((value.via === 'suggestion') !== (value.suggestionId !== undefined)) ctx.addIssue({ code: 'custom', path: ['suggestionId'], message: 'Only a suggestion selection requires its displayed suggestion ID' });
});
export type DraftingSelection = z.infer<typeof draftingSelectionSchema>;

/** Lossless, bounded keyboard/tap targets. Delimiters stay in the source text. */
export function draftPassages(text: string): DraftRange[] {
  const passages: DraftRange[] = [];
  let start = 0;
  while (start < text.length) {
    const paragraphEnd = text.indexOf('\n\n', start);
    const naturalEnd = paragraphEnd < 0 ? text.length : paragraphEnd + 2;
    let end = Math.min(naturalEnd, start + DRAFTING_LIMITS.span);
    if (!isDraftTextBoundary(text, end)) end--;
    passages.push({ start, end });
    start = end;
  }
  return passages;
}
