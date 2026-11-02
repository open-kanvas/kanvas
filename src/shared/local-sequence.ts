import { z } from 'zod';

export const sequenceId = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/);
export const sequenceItemSchema = z.object({
  id: sequenceId,
  durationMs: z.number().int().min(250).max(120000),
  text: z.string().min(1).max(400),
}).strict();
export const playbackSchema = z.object({
  state: z.enum(['paused', 'playing']).default('paused'),
  positionMs: z.number().finite().nonnegative().max(120000000).default(0),
  startedAt: z.iso.datetime({offset:true}).optional().describe('Server-compatible UTC wall-clock anchor. Required when playing; use sequence resume to anchor on the server.'),
}).strict().refine(p => p.state !== 'playing' || !!p.startedAt, 'Playing requires startedAt');
export const captionDataSchema = z.object({
  chunks: z.array(sequenceItemSchema).max(1000).default([]),
  playback: playbackSchema.default({state:'paused',positionMs:0}),
  previousChunks: z.number().int().min(0).max(3).default(2),
  language: z.string().max(40).optional(),
}).strict().refine(d => new Set(d.chunks.map(c=>c.id)).size===d.chunks.length, 'Chunk IDs must be unique');
export type CaptionData = z.infer<typeof captionDataSchema>;
export type Playback = z.infer<typeof playbackSchema>;
export type TimedItem = {id:string;durationMs:number};
export function sequenceStatus(items:TimedItem[], playback:Playback, nowMs:number) {
  const durationMs=items.reduce((sum,item)=>sum+item.durationMs,0);
  const elapsed=playback.positionMs+(playback.state==='playing'?Math.max(0,nowMs-Date.parse(playback.startedAt!)):0);
  const positionMs=Math.min(durationMs,elapsed);
  let end=0; let index=items.findIndex(item => (end+=item.durationMs)>positionMs);
  const complete=items.length>0&&positionMs>=durationMs;
  if(complete) index=items.length-1;
  return {positionMs,durationMs,index,activeId:items[index]?.id??null,queued:Math.max(0,items.length-index-1),phase:!items.length?'empty':complete?'complete':playback.state==='playing'&&Date.parse(playback.startedAt!)>nowMs?'scheduled':playback.state};
}
export const sequenceOperationSchema=z.object({
  op:z.literal('sequence'),action:z.enum(['append','replace-future','replace','pause','resume','seek','clear']),
  chunks:z.array(sequenceItemSchema).max(1000).optional(),
  positionMs:z.number().finite().nonnegative().max(120000000).optional(),
}).strict().describe('Live captions only. append retains clock; replace-future retains current/past; replace resets paused at zero. pause/resume/seek use server time. clear empties and pauses. Read display.current.sequenceStatus. All mutations use the ordinary patch revision/requestId.');
export type SequenceOperation=z.infer<typeof sequenceOperationSchema>;
/** Shared only by captions and supplied instrument frames; no server slide timer. */
export function changeTimedSequence<T extends TimedItem>(items:T[],current:Playback,action:SequenceOperation['action'],supplied:T[]|undefined,position:number|undefined,nowMs:number):{items:T[];playback:Playback} {
  const status=sequenceStatus(items,current,nowMs);
  const queueAction=['append','replace-future','replace'].includes(action);
  if(queueAction!==!!supplied || (action==='seek')!==(position!==undefined)) throw new Error('Only queue actions require items; only seek requires positionMs');
  let playback={...current};
  if(action==='append'||action==='replace-future') {
    items=[...(action==='append'?items:items.slice(0,status.index+1)),...supplied!];
    if((status.phase==='complete'||status.phase==='empty')&&playback.state==='playing') playback={state:'playing',positionMs:status.durationMs,startedAt:new Date(nowMs).toISOString()};
  }
  if(action==='replace'||action==='clear') {items=supplied??[];playback={state:'paused',positionMs:0};}
  if(action==='pause') playback={state:'paused',positionMs:status.positionMs};
  if(action==='resume'&&playback.state!=='playing') playback={state:'playing',positionMs:status.positionMs,startedAt:new Date(nowMs).toISOString()};
  if(action==='seek') {
    if(position!>status.durationMs) throw new Error('Seek exceeds sequence duration');
    playback={state:playback.state,positionMs:position!,...(playback.state==='playing'?{startedAt:new Date(nowMs).toISOString()}:{})};
  }
  return {items,playback};
}
export function changeCaptionSequence(data:CaptionData,op:SequenceOperation,nowMs:number):CaptionData {
 const next=changeTimedSequence(data.chunks,data.playback,op.action,op.chunks,op.positionMs,nowMs);
 return captionDataSchema.parse({...data,chunks:next.items,playback:next.playback});
}
