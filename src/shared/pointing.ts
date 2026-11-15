import { z } from 'zod';
const id=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),index=z.number().int().nonnegative().max(100000),unit=z.number().finite().min(0).max(1);
/** A single tap leaves a mark that fades; a long press or double tap pins one until its author points elsewhere. */
export const POINTER_FADE_MS=4000,POINTER_PIN_MS=30*60_000,POINTING_QUEUE=30,POINTING_QUEUE_MS=10*60_000,POINTING_BLOCK_EVENTS=8;
/** Logical addresses first: pixels are never shared between text/table/chart viewers.
 * `point` is the fallback for content without a semantic target: a fraction of the view, 0-1 from its top left. */
export const pointingAnchorSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('text'),key:z.string().regex(/^[a-f0-9]{8}$/),occurrence:index,start:index,end:index}).strict().refine(v=>v.end>v.start&&v.end-v.start<=2000,'Choose a word or a short span.'),
  z.object({kind:z.literal('cell'),row:index,column:z.string().max(500)}).strict(),
  z.object({kind:z.literal('chart'),series:z.string().max(500),x:z.string().max(500),y:z.string().max(500)}).strict(),
  z.object({kind:z.literal('image'),index:z.number().int().min(0).max(15),x:unit,y:unit}).strict(),
  z.object({kind:z.literal('point'),x:unit,y:unit}).strict(),
]);
/** What was under the finger, as the receiving browser read it from the rendered view. Display text only. */
export const pointingTargetSchema=z.object({
  role:z.string().max(40).optional(),label:z.string().max(200).optional(),context:z.string().max(300).optional(),pane:z.string().max(32).optional(),
}).strict();
export const pointingConfigureSchema=z.object({sessionId:id,enabled:z.boolean().optional(),tools:z.boolean().optional().describe('Show the on-screen Point button with span selection and clearing. Off by default: tapping needs no button.'),expectedRevision:index.optional(),confirm:z.literal(true)}).strict().refine(v=>v.enabled!==undefined||v.tools!==undefined,'State enabled or tools.');
export const pointingReadSchema=z.object({sessionId:id,displayId:id.optional()}).strict();
export const pointingWriteSchema=z.object({revision:index,anchor:pointingAnchorSchema.nullable(),pinned:z.boolean().default(false),point:z.object({x:unit,y:unit}).strict().optional(),target:pointingTargetSchema.optional()}).strict();
export type PointingAnchor=z.infer<typeof pointingAnchorSchema>;
export type PointingTarget=z.infer<typeof pointingTargetSchema>;
export interface SharedPointer {id:string;name:string;revision:number;anchor:PointingAnchor;point?:{x:number;y:number};pinned:boolean;createdAt:string;expiresAt:number;color:string}
export interface PointingState {canConfigure?:boolean;enabled:boolean;tools?:boolean;revision:number;canPoint:boolean;canPointScope?:'calling-principal';eligibilityReason?:'disabled'|'agent-read-only'|'capture-only'|'view-only'|'eligible';pointers:SharedPointer[];/** Server clock in epoch ms, so a browser with a wrong clock still fades marks on time. */serverNow?:number}
/** One pointing gesture as an agent receives it with its next response. */
export interface PointingEvent {seq:number;at:string;sessionId:string;displayId:string;display:string;by:string;pinned:boolean;revision:number;template?:string;title?:string;anchor:PointingAnchor;point?:{x:number;y:number};target?:PointingTarget;summary:string}
/** Stable semantic text fingerprint, not a credential or security primitive. */
export function pointingTextKey(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
/** One plain sentence for the agent; built from recorded fields only. */
export function pointingSummary(by:string,display:string,anchor:PointingAnchor,target?:PointingTarget,pinned=false):string{
  const quoted=target?.label?`"${target.label}"`:'';
  const what=anchor.kind==='chart'?`the chart mark ${anchor.series?`${anchor.series} `:''}at ${anchor.x} (${anchor.y})`
    :anchor.kind==='cell'?`the cell in row ${anchor.row+1}, column "${anchor.column}"${quoted?` (${quoted})`:''}`
    :anchor.kind==='image'?`image ${anchor.index+1} at ${Math.round(anchor.x*100)}% across, ${Math.round(anchor.y*100)}% down`
    :anchor.kind==='text'?(quoted||'a word')+(target?.context&&target.context!==target.label?` in "${target.context}"`:'')
    :(quoted?`${target?.role?`the ${target.role} `:''}${quoted}`:`a spot ${Math.round(anchor.x*100)}% across, ${Math.round(anchor.y*100)}% down`);
  return `${by} ${pinned?'pinned a pointer on':'pointed at'} ${what}${target?.pane?` in pane ${target.pane}`:''} on ${display}.`;
}
