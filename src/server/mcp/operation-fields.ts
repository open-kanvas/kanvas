

import {viewFormatSchema} from '../../shared/regional.js';

import {selectionSchema} from '../../shared/selection.js';

import {z} from 'zod';

import {configPatchSchema} from '../../shared/preferences.js';

import {TEMPLATE_IDS} from '../../shared/types.js';

import {provenanceSchema,actionSchema} from '../../shared/view-schemas.js';

export const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const requestId = z.string().min(1).max(128);
export const name = z.string().trim().min(1).max(160);
export const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const dimensions = z.number().int().min(1).max(32768);
export const ratio = z.number().min(0.25).max(8);
export const displayIds = z.array(id).min(1).max(64).refine(values => new Set(values).size === values.length).meta({ uniqueItems: true });
export const record = z.record(z.string(), z.unknown());
export const source = provenanceSchema;
export const view = z.strictObject({
  format: viewFormatSchema.optional(),
  selection: selectionSchema.optional(),
  version: z.literal(1),
  template: z.enum(TEMPLATE_IDS),
  title: z.string().max(500).optional(),
  showTitle: z.boolean().optional(),
  showCaption: z.boolean().optional(),
  showControls: z.boolean().optional(),
  data: record,
  actions: z.array(actionSchema).max(8).optional(),
});
export const config = configPatchSchema;
export const sessionModeSchema = z.enum(['live','presenting','ambient','signage','auto']);
export const exactlyOne = (left: string, right: string) => ({
  oneOf: [
    { required: [left], not: { required: [right] } },
    { required: [right], not: { required: [left] } },
  ],
});
