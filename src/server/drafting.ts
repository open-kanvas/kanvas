import { draftingDataSchema, draftingSelectionSchema, draftPassages, validDraftRange } from '../shared/drafting.js';
import type { ViewSpec } from '../shared/types.js';
import { displayedLeaf } from './engagement.js';
import { AppError } from './store.js';

/** Called after respond's access, revision, inbox-budget and idempotency guards.
 * Feedback is anchored to the visible leaf, never an off-screen deck passage.
 * Source/suggestion details are derived here, not trusted from a browser. */
export function draftingSelectionFeedback(view: ViewSpec, raw: unknown) {
  const leaf = displayedLeaf(view);
  if (leaf?.template !== 'drafting') throw new AppError('INVALID_RESPONSE', 'This display is not showing a draft.');
  const parsed = draftingSelectionSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_RESPONSE', 'Select a passage of up to 4,000 characters from the displayed draft.');
  const selection = parsed.data, data = draftingDataSchema.parse(leaf.data);
  if (!validDraftRange(data.text, selection) || data.text.slice(selection.start, selection.end) !== selection.text) {
    throw new AppError('INVALID_RESPONSE', 'The selected passage does not match this draft. Select it again from the current text.');
  }
  if (selection.via === 'passage' && !draftPassages(data.text).some(span => span.start === selection.start && span.end === selection.end)) {
    throw new AppError('INVALID_RESPONSE', 'This passage does not match a displayed review target.');
  }
  const suggestion = selection.via === 'suggestion' ? data.suggestions.find(item => item.id === selection.suggestionId) : undefined;
  if (selection.via === 'suggestion' && (!suggestion || suggestion.start !== selection.start || suggestion.end !== selection.end)) {
    throw new AppError('INVALID_RESPONSE', 'This suggested edit is no longer available at the selected passage.');
  }
  return {
    template: 'drafting' as const,
    textPath: view.template === 'presentation' ? `/data/slides/${Number(view.data.index ?? 0)}/data/text` : '/data/text',
    start: selection.start, end: selection.end,
    text: data.text.slice(selection.start, selection.end),
    via: selection.via,
    ...(suggestion ? { suggestion: { ...suggestion } } : {}),
    ...(data.purpose ? { purpose: data.purpose } : {}),
    draftStatus: data.status,
  };
}
