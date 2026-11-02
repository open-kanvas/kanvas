import { z } from 'zod';

/** A patch is bounded independently of the (larger) final view budget. */
export const VIEW_PATCH_LIMITS = {
  operations: 32,
  bytes: 64 * 1024,
  nodes: 10_000,
  pathCharacters: 512,
  pathDepth: 12,
  appendCharacters: 20_000,
} as const;

const path = z.string().min(1).max(VIEW_PATCH_LIMITS.pathCharacters)
  .describe('JSON pointer /data/field; escape ~ as ~0 and / as ~1. No whole-data, array insert/remove or metadata edits.');

const itemId = z.string().min(1).max(128);
const itemFields = { text:z.string().min(1).max(1000).optional(), detail:z.string().max(1000).nullable().optional(), checked:z.boolean().optional() };

export const viewPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({op:z.literal('timeline'),action:z.enum(['select','next','previous','clear']),eventId:itemId.optional()}).strict().describe('Select a stable timeline event ID, move next/previous in chronological order, or clear back to static. eventId only with select. Equal dates keep input order; ends clamp. Without selection next starts first, previous starts last. Reuses atomic publication/history and revision checks.'),
  z.object({op:z.literal('roster'),action:z.enum(['add','remove','update']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),shift:itemId,person:itemId.optional(),value:z.object({code:z.string().min(1).max(8).nullable().optional(),note:z.string().max(200).nullable().optional()}).strict().optional()}).strict().describe('Target one roster assignment by date+shift+optional person. add/remove/update; value code/note, null clears. Atomic and revision-bound.'),
  z.object({op:z.literal('checklist'),itemId,action:z.enum(['add','remove','update','move']),value:z.object(itemFields).strict().optional(),beforeId:itemId.optional()}).strict().describe('Checklist ID: add/update value; detail:null clears. add/move beforeId or append.'),
  z.object({
    op: z.literal('set'), path,
    value: z.unknown().refine(value => value !== undefined, 'Supply a JSON value.')
      .describe('Set value; parent must exist.'),
  }).strict(),
  z.object({ op: z.literal('remove'), path }).strict(),
  z.object({
    op: z.literal('appendText'), path,
    value: z.string().min(1).max(VIEW_PATCH_LIMITS.appendCharacters)
      .describe('Append exact text.'),
  }).strict(),
]);

export const viewPatchSchema = z.object({
  sessionId: z.string().min(1).max(128),
  displayId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128)
    .describe('Retry identical input with the same key.'),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
    .describe('Current revision.'),
  operations: z.array(viewPatchOperationSchema).min(1).max(VIEW_PATCH_LIMITS.operations)
    .describe('Atomic, ordered; validates final view.'),
}).strict();

export type ViewPatchOperation = z.infer<typeof viewPatchOperationSchema>;
export type ViewPatchInput = z.infer<typeof viewPatchSchema>;
