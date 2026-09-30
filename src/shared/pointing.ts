import { z } from 'zod';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),index=z.number().int().nonnegative().max(100000),unit=z.number().finite().min(0).max(1);
/** Logical addresses only. Pixels are never shared between text/table/chart viewers. */
export const pointingAnchorSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('text'),key:z.string().regex(/^[a-f0-9]{8}$/),occurrence:index,start:index,end:index}).strict().refine(v=>v.end>v.start&&v.end-v.start<=2000,'Choose a word or a short span.'),
  z.object({kind:z.literal('cell'),row:index,column:z.string().max(500)}).strict(),
  z.object({kind:z.literal('chart'),series:z.string().max(500),x:z.string().max(500),y:z.string().max(500)}).strict(),
  z.object({kind:z.literal('image'),index:z.number().int().min(0).max(15),x:unit,y:unit}).strict(),
]);
export const pointingConfigureSchema=z.object({sessionId:id,enabled:z.boolean(),expectedRevision:index,confirm:z.literal(true)}).strict();
export const pointingReadSchema=z.object({sessionId:id,displayId:id.optional()}).strict();
export const pointingWriteSchema=z.object({revision:index,anchor:pointingAnchorSchema.nullable()}).strict();
export type PointingAnchor=z.infer<typeof pointingAnchorSchema>;
export interface SharedPointer {id:string;name:string;revision:number;anchor:PointingAnchor;createdAt:string;expiresAt:number;color:string}
export interface PointingState {enabled:boolean;revision:number;canPoint:boolean;pointers:SharedPointer[]}
/** Stable semantic text fingerprint, not a credential or security primitive. */
export function pointingTextKey(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
