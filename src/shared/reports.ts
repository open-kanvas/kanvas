import {clientDetailsSchema,type ClientDetails} from './agent-context.js';
import { z } from 'zod';

export const REPORT_STATUSES = ['open', 'investigating', 'resolved', 'dismissed'] as const;
export const REPORT_KINDS = ['feedback', 'error'] as const;
export const REPORT_DESCRIPTION_MAX = 12_000;
export const REPORT_CREATE_BYTES = 48 * 1024;
export const REPORT_RECORD_BYTES = 60 * 1024;
export const REPORT_REPRODUCTION_TEXT_MAX = 3200;
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const scopeContract={if:{properties:{scope:{enum:['account','service','all']}},required:['scope']},then:{properties:{sessionId:false,displayId:false,updateId:false,diagnosticId:false}},else:{required:['sessionId']}};
const common = {
  scope:z.enum(['session','account','service']).optional(), sessionId: id.optional(), requestId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(REPORT_DESCRIPTION_MAX),
  displayId: id.optional(), updateId: id.optional(),
  clientDetails:clientDetailsSchema.optional(),
  client: z.enum(['claude', 'chatgpt', 'browser', 'other']).optional(),
};
const scoped=(v:{scope?:string;sessionId?:string;displayId?:string;updateId?:string;diagnosticId?:string},c:z.RefinementCtx)=>{
  const scope=v.scope??'session';
  if(scope==='session'&&!v.sessionId)c.addIssue({code:'custom',path:['sessionId'],message:'Session scope requires sessionId. For a general report use scope:service or scope:account without sessionId.'});
  if(scope!=='session'&&(v.sessionId||v.displayId||v.updateId||v.diagnosticId))c.addIssue({code:'custom',path:['scope'],message:'Account/service reports cannot target a session, display, update or diagnostic.'});
};
export const feedbackSubmitSchema = z.strictObject({
  ...common, category: z.enum(['usability', 'feature', 'quality', 'other']).default('other'),
}).superRefine(scoped).meta(scopeContract);
export const errorReportSchema = z.strictObject({
  ...common, severity: z.enum(['low', 'normal', 'high']).default('normal'),
  diagnosticId: id.optional(),
  // Natural agent prose is a legitimate reproduction, not a malformed list.
  // Preserve the input shape through repeated boundary validation. The report
  // store normalizes prose into one step after validation, without truncation.
  steps: z.union([
    z.array(z.string().trim().min(1).max(400)).max(8),
    z.string().trim().min(1).max(REPORT_REPRODUCTION_TEXT_MAX),
  ]).optional(),
  expected: z.string().trim().max(1000).optional(), actual: z.string().trim().max(1000).optional(),
}).superRefine(scoped).meta(scopeContract);
export const reportsReadSchema = z.strictObject({
  scope:z.enum(['session','account','service','all']).optional(),sessionId: id.optional(), kind: z.enum(['all', ...REPORT_KINDS]).default('all'),
  status: z.enum(['all', ...REPORT_STATUSES]).default('all'),
  limit: z.number().int().min(1).max(20).default(10), afterId: id.optional(),
}).superRefine(scoped).meta(scopeContract);
export const reportUpdateSchema = z.strictObject({
  scope:z.enum(['session','account','service']).optional(),sessionId: id.optional(), reportId: id, expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  status: z.enum(REPORT_STATUSES), note: z.string().trim().min(1).max(2000),
}).superRefine(scoped).meta(scopeContract);
export type FeedbackInput = z.infer<typeof feedbackSubmitSchema>;
export type ErrorReportInput = z.infer<typeof errorReportSchema>;
export type ReportsReadInput = z.infer<typeof reportsReadSchema>;
export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>;
export interface DiagnosticRecord {
  id: string; sessionId: string; operation: string; code: string;
  /** Optional fixed-registry routing context; canonical operation stays stable. */
  publicTool?: string; publicOperation?: string;
  phase: 'validation' | 'execution' | 'rendering'; createdAt: string;
  template?: string; updateId?: string;
  issues?: { path: string; problem: string }[];
}
export interface ReportRecord {
  id: string; scope?:'session'|'account'|'service'; accountId?:string; sessionId?: string; kind: typeof REPORT_KINDS[number]; status: typeof REPORT_STATUSES[number]; revision: number;
  title: string; description: string; authorId: string; agentId?: string; client?: FeedbackInput['client'];
  displayId?: string; updateId?: string; diagnosticId?: string; diagnostic?: DiagnosticRecord;
  category?: FeedbackInput['category']; severity?: ErrorReportInput['severity']; steps?: string[]; expected?: string; actual?: string;
  createdAt: string; updatedAt: string;
  clientDetails?:ClientDetails; clientContext?:{inferred?:{userAgent?:string;clientName?:string;clientVersion?:string};selfReported:ClientDetails;verified:false;conflicts:string[]};
  context: { configRevision?: number; displayRevision?: number; template?: string; updateStatus?: string };
  history: { status: typeof REPORT_STATUSES[number]; note: string; actorId: string; createdAt: string }[];
  redacted: boolean;
}
export interface ReportPage { reports: ReportRecord[]; nextCursor?: string; serviceAdmin?:boolean }

/** Author follow-up by stable report ID, independent of filing session context. */
export const reportPatchSchema = z.strictObject({
 reportId: id, expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
 note: z.string().trim().min(1).max(2000),
 title: z.string().trim().min(1).max(160).optional(),
 description: z.string().trim().min(1).max(REPORT_DESCRIPTION_MAX).optional(),
});
export type ReportPatchInput = z.infer<typeof reportPatchSchema>;
