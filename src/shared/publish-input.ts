import { viewFormatSchema } from './regional.js';
import { selectionSchema } from './selection.js';
import { z } from 'zod';
import { TEMPLATE_IDS, type SubmissionInput } from './types.js';
import { actionSchema, provenanceSchema } from './view-schemas.js';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const targets = z.array(id).min(1).max(64).refine(values => new Set(values).size === values.length).meta({ uniqueItems: true });
const resolution = z.strictObject({ ref: id, sessionId: id.optional(), displayIds: targets.optional(), newSession: z.literal(true).optional() })
  .superRefine((v, ctx) => {
    if (Boolean(v.sessionId) === Boolean(v.newSession)) ctx.addIssue({ code: 'custom', message: 'Choose an existing sessionId or newSession:true, not both.' });
    if (v.displayIds && !v.sessionId) ctx.addIssue({ code: 'custom', path: ['displayIds'], message: 'Choosing displays requires their sessionId.' });
  }).meta({ oneOf: [{ required: ['sessionId'], not: { required: ['newSession'] } }, { required: ['newSession'], not: { anyOf: [{ required: ['sessionId'] }, { required: ['displayIds'] }] } }] });

export const publishInputSchema = z.strictObject({
  requestId: z.string().min(1).max(128), sessionId: id.optional(), displayIds: targets.optional(),
  sessionName: z.string().trim().min(1).max(160).optional(), newSession: z.literal(true).optional(),
  targetRef: id.optional(), contextId: z.string().min(1).max(128).optional(), resolution: resolution.optional(),
  context: z.string().max(12000).optional(), intent: z.string().max(1000).optional(), data: z.unknown().optional(),
  datasetId: id.optional(), assetIds: z.array(id).max(32).optional(), templateHint: z.enum(TEMPLATE_IDS).optional(),
  source: provenanceSchema.optional(),
  view: z.strictObject({ format:viewFormatSchema.optional(), selection:selectionSchema.optional(), version: z.literal(1), template: z.enum(TEMPLATE_IDS), title: z.string().max(500).optional(),
    showTitle: z.boolean().optional(), showCaption: z.boolean().optional(), showSource: z.boolean().optional(), showControls: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()), source: provenanceSchema.optional(), actions: z.array(actionSchema).max(8).optional(),
  }).optional(),
}).superRefine((v, ctx) => {
  if (v.displayIds && !v.sessionId) ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'Explicit displayIds require their sessionId.' });
  if (v.targetRef && (v.sessionId || v.displayIds || v.newSession || v.sessionName || v.resolution)) ctx.addIssue({ code: 'custom', path: ['targetRef'], message: 'Use targetRef alone for targeting, not with a new, explicit or unresolved target.' });
  if ((v.newSession || v.sessionName) && (v.sessionId || v.displayIds || v.resolution)) ctx.addIssue({ code: 'custom', path: ['newSession'], message: 'New-session targeting cannot also select existing resources or a pending choice.' });
  if (v.resolution && v.displayIds) ctx.addIssue({ code: 'custom', path: ['resolution'], message: 'Put the chosen displayIds inside resolution.' });
}).meta({ allOf: [
  { if: { required: ['displayIds'] }, then: { required: ['sessionId'] } },
  ...['sessionId', 'displayIds', 'newSession', 'sessionName', 'resolution'].map(key => ({ not: { required: ['targetRef', key] } })),
  ...['newSession', 'sessionName'].flatMap(key => ['sessionId', 'displayIds', 'resolution'].map(other => ({ not: { required: [key, other] } }))),
  { not: { required: ['resolution', 'displayIds'] } },
] });

export interface PublishInput extends Omit<SubmissionInput, 'sessionId' | 'displayIds'> {
  sessionId?: string; displayIds?: string[]; sessionName?: string; newSession?: true; targetRef?: string; contextId?: string;
  resolution?: { ref: string; sessionId?: string; displayIds?: string[]; newSession?: true };
}
