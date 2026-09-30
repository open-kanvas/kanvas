import { z } from 'zod';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const presentationNavigateSchema = z.strictObject({
  sessionId: id, displayId: id, requestId: z.string().min(1).max(128),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  action: z.enum(['next', 'previous', 'first', 'last', 'goto']),
  index: z.number().int().min(0).max(63).optional(),
}).superRefine((value, ctx) => {
  if ((value.action === 'goto') !== (value.index !== undefined)) ctx.addIssue({ code: 'custom', path: ['index'], message: 'Supply a zero-based index only for action goto.' });
}).meta({ allOf: [{ if: { properties: { action: { const: 'goto' } }, required: ['action'] }, then: { required: ['index'] }, else: { not: { required: ['index'] } } }] });
export type PresentationNavigation = z.infer<typeof presentationNavigateSchema>;
