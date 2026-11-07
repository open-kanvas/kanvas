import type { RequestContext } from './recognition.js';
import { z } from 'zod';
import {domInspectionSchema} from './dom-inspection.js';
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const point = z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict();
export const viewerObservationSchema = z.object({
  dom:domInspectionSchema.optional(),tabId:id, sequence:revision.optional(), revision, renderedRevision:revision.nullable(), status:z.enum(['loading','ready','failed','empty','browsing']), visible:z.boolean(),
  browsing:z.object({sourceDisplayId:id,revision,position:z.number().int().nonnegative(),total:z.number().int().nonnegative()}).strict().optional(),
  text:z.string().max(8000), elements:z.array(z.object({role:z.string().max(60),label:z.string().max(300)}).strict()).max(40).default([]),
  width:z.number().int().min(1).max(32768),height:z.number().int().min(1).max(32768),
  reading:z.object({fontSize:z.number().min(16).max(40),wpm:z.number().min(120).max(320),zoom:z.number().min(.75).max(1.75),playing:z.boolean(),position:z.number().min(0).max(1),pixelsPerSecond:z.number().min(0).max(10000)}).strict().optional(),
  context:z.object({consent:z.literal(true),timeZone:z.string().max(100).optional(),language:z.string().max(100).optional(),locale:z.string().max(100).optional(),location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().min(0).max(1_000_000)}).strict().optional(),locationStatus:z.enum(['not-requested','requesting','granted','denied','unavailable']).default('not-requested')}).strict().nullable().default(null),
}).strict();
export const annotationInputSchema = z.object({
  requestId:id,tabId:id,revision,kind:z.enum(['point','arrow','circle','region','freehand','note']),
  points:z.array(point).min(1).max(500),note:z.string().max(2000).optional(),
  target:z.discriminatedUnion('type',[
    z.object({type:z.literal('view'),coordinates:z.literal('normalized-view')}).strict(),
    z.object({type:z.literal('image'),coordinates:z.literal('normalized-image'),imageIndex:z.number().int().min(0).max(3),naturalWidth:z.number().int().positive().max(100000),naturalHeight:z.number().int().positive().max(100000)}).strict(),
    z.object({type:z.literal('map'),coordinates:z.literal('geographic'),locations:z.array(z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict()).min(1).max(500)}).strict(),
    z.object({type:z.literal('chart'),coordinates:z.literal('normalized-view'),series:z.string().max(240),x:z.union([z.string().max(500),z.number()]),y:z.union([z.string().max(500),z.number()])}).strict(),
  ]).default({type:'view',coordinates:'normalized-view'}),
}).strict();
export type ViewerObservation = z.infer<typeof viewerObservationSchema>;
export type AnnotationInput = z.infer<typeof annotationInputSchema>;
export interface ViewerPresence extends ViewerObservation {deviceId?:string;deviceName?:string;connected?:boolean;connectionMethod?:'account'|'paired';joinedAt?:string;lastActiveAt?:string;disconnectedAt?:string;name?:string;requestContext?:RequestContext;id:string;sessionId:string;displayId:string;observedAt:string;expiresAt:number;participantId:string}
export interface AnnotationRecord extends AnnotationInput {id:string;sessionId:string;displayId:string;viewerId:string;createdAt:string}
export interface ToastRecord {title?:string;description?:string;icon?:string;time?:string;confirmationWords?:string;confirmation?:boolean;ownerId?:string;id:string;sessionId:string;displayId:string;text:string;severity:'info'|'success'|'warning';createdAt:string;expiresAt:string;sticky:boolean}
/** Lifecycle records remain available for delivery, but must not cover a reading screen for their whole retention period. */
export function toastVisibleUntil(toast:ToastRecord){return toast.ownerId&&!toast.confirmation?Math.min(Date.parse(toast.expiresAt),Date.parse(toast.createdAt)+(toast.severity==='warning'?15_000:8_000)):Date.parse(toast.expiresAt);}
