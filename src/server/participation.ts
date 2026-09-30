import { isDeepStrictEqual } from 'node:util';
import type { ViewSpec } from '../shared/types.js';

const omit = (data: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));
const byId = (items: Record<string, unknown>[]): Record<string, unknown>[] => [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));

/**
 * Compare validated, schema-normalized views, never client-supplied response
 * totals. Presentation positions remain significant because participation is
 * scoped to the stored display epoch and slide index.
 */
function participationIdentity(view: ViewSpec | null): unknown {
  if (view?.template === 'presentation') return (view.data.slides as ViewSpec[]).map(participationIdentity);
  if (view?.template === 'poll') return { template: 'poll', data: { ...omit(view.data, ['closed', 'revealResults']), options: byId(view.data.options as Record<string, unknown>[]) } };
  if (view?.template === 'qa') return { template: 'qa', data: omit(view.data, ['closed', 'revealResults']) };
  if (view?.template === 'form') return { template: 'form', data: {
    ...omit(view.data, ['closed', 'description', 'submitLabel']),
    fields: byId((view.data.fields as Record<string, unknown>[]).map(field => ({
      ...omit(field, ['help', 'placeholder']),
      ...(Array.isArray(field.options) ? { options: byId(field.options as Record<string, unknown>[]) } : {}),
    }))),
  } };
  return null;
}

/**
 * Closing/revealing a question, changing supporting copy, or reordering stable
 * field/option IDs keeps real responses. Changed questions, meanings or
 * constraints require a fresh epoch on full publish/edit, and rejection by a
 * participation-preserving patch. Leaving and later republishing a question
 * also starts a fresh round; epochs must not be derived from question content.
 */
export function participationCompatible(before: ViewSpec | null, after: ViewSpec | null): boolean {
  return isDeepStrictEqual(participationIdentity(before), participationIdentity(after));
}
