import {z} from 'zod';
import {sequenceId, playbackSchema,changeTimedSequence,sequenceStatus} from './local-sequence.js';
const midi=z.number().int().min(0).max(127).describe('MIDI pitch number; middle C is 60 (C4). No MIDI input or audio.');
const pitch=z.object({midi,label:z.string().min(1).max(30).describe('Supplied spelling, e.g. Eb4 rather than D#4.')}).strict();
export const instrumentElementSchema=z.object({
 highlight:z.boolean().default(true),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
 label:z.string().max(50).optional(),finger:z.string().max(12).optional(),pitch:pitch.optional(),
}).strict();
export const elementId=z.string().regex(/^(key:[0-9]{1,3}|string:[a-zA-Z0-9_.-]{1,40}:(fret:[0-9]{1,2}|mute))$/);
const keyboard=z.object({family:z.literal('keyboard'),firstMidi:midi,lastMidi:midi}).strict();
const fretted=z.object({family:z.literal('fretted'),handedness:z.enum(['right','left']).default('right').describe('Left mirrors the fret direction horizontally, preserving string order and physical fret IDs.'),strings:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_.-]{1,40}$/),label:z.string().min(1).max(30),openPitch:pitch}).strict()).min(1).max(12).describe('Top-to-bottom as supplied. Conventional horizontal guitar order is high to low: E4, B3, G3, D3, A2, E2. Handedness does not reverse strings.'),firstFret:z.number().int().min(0).max(23).default(0),fretCount:z.number().int().min(1).max(24).default(5),capo:z.number().int().min(0).max(12).default(0)}).strict();
export const instrumentConfigSchema=z.discriminatedUnion('family',[keyboard,fretted]);
export const instrumentElementsSchema=z.record(elementId,instrumentElementSchema);
export const instrumentFrameSchema=z.object({id:sequenceId,durationMs:z.number().int().min(250).max(120000),elements:instrumentElementsSchema}).strict();
export const instrumentDataSchema=z.object({
 config:instrumentConfigSchema,
 frames:z.array(instrumentFrameSchema).max(256).default([]),
 playback:playbackSchema.default({state:'paused',positionMs:0}),
 elements:instrumentElementsSchema.default({}),
 label:z.string().max(100).optional(),
}).strict().superRefine((data,ctx)=>{
 const c=data.config;
 if(c.family==='keyboard'&&(c.lastMidi<c.firstMidi||c.lastMidi-c.firstMidi>60))ctx.addIssue({code:'custom',path:['config'],message:'Use an ascending range of at most 61 keys'});
 if(c.family==='fretted'&&(new Set(c.strings.map(s=>s.id)).size!==c.strings.length||c.firstFret+c.fretCount>25))ctx.addIssue({code:'custom',path:['config'],message:'Unique string IDs and fret range ending at 24 required'});
 if(new Set(data.frames.map(f=>f.id)).size!==data.frames.length)ctx.addIssue({code:'custom',path:['frames'],message:'Frame IDs must be unique'});
 for(const states of [data.elements,...data.frames.map(f=>f.elements)])for(const [id,value] of Object.entries(states)){
  if(!instrumentTarget(c,id))ctx.addIssue({code:'custom',path:['elements',id],message:'Element must address a visible key, string/fret or mute marker'});
  if(c.family==='keyboard'&&value.pitch&&value.pitch.midi!==Number(id.slice(4)))ctx.addIssue({code:'custom',path:['elements',id],message:'Supplied pitch must match keyboard MIDI position'});
 }
});
export type InstrumentData=z.infer<typeof instrumentDataSchema>;
export type InstrumentConfig=z.infer<typeof instrumentConfigSchema>;
export type InstrumentElement=z.infer<typeof instrumentElementSchema>;
export function instrumentTarget(c:InstrumentConfig,id:string):boolean {
 if(c.family==='keyboard')return /^key:\d+$/.test(id)&&String(Number(id.slice(4)))===id.slice(4)&&Number(id.slice(4))>=c.firstMidi&&Number(id.slice(4))<=c.lastMidi;
 const match=/^string:([a-zA-Z0-9_.-]+):(mute|fret:(\d+))$/.exec(id);if(!match||!c.strings.some(s=>s.id===match[1]))return false;
 if(match[2]==='mute')return true;
 const fret=Number(match[3]);return String(fret)===match[3]&&fret>=c.firstFret&&fret<c.firstFret+c.fretCount;
}
export const instrumentOperationSchema=z.object({op:z.literal('instrument'),changes:z.array(z.object({id:elementId,value:instrumentElementSchema.nullable().describe('Complete visual state for this element; null clears it. Other elements/configuration are preserved.')}).strict()).min(1).max(256),label:z.string().max(100).optional()}).strict();
export function changeInstrument(data:InstrumentData,op:z.infer<typeof instrumentOperationSchema>):InstrumentData {
 if(new Set(op.changes.map(c=>c.id)).size!==op.changes.length)throw new Error('Duplicate target IDs');
 const elements={...data.elements};
 for(const change of op.changes){if(!instrumentTarget(data.config,change.id))throw new Error('Unknown instrument target');if(change.value===null)delete elements[change.id];else elements[change.id]=change.value;}
 if(data.frames.length)throw new Error('Clear the timed sequence before changing static highlights');
 return instrumentDataSchema.parse({...data,elements,...(op.label!==undefined?{label:op.label}:{})});
}
export const isBlackKey=(midi:number)=>[1,3,6,8,10].includes(midi%12);

export const instrumentSequenceOperationSchema=z.object({op:z.literal('instrument-sequence'),action:z.enum(['append','replace-future','replace','pause','resume','seek','clear']),frames:z.array(instrumentFrameSchema).max(256).optional(),positionMs:z.number().finite().nonnegative().max(30720000).optional()}).strict().describe('Supplied complete highlight states, locally timed. Same clock/transport semantics as captions. clear preserves current visible highlights as static elements. No sound.');
export function changeInstrumentSequence(data:InstrumentData,op:z.infer<typeof instrumentSequenceOperationSchema>,now:number):InstrumentData {
 const current=sequenceStatus(data.frames,data.playback,now);
 const elements=op.action==='clear'?(data.frames[current.index]?.elements??data.elements):data.elements;
 const next=changeTimedSequence(data.frames,data.playback,op.action,op.frames,op.positionMs,now);
 return instrumentDataSchema.parse({...data,elements,frames:next.items,playback:next.playback});
}
