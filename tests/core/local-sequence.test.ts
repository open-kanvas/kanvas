import {describe,it,expect} from 'vitest';
import {captionDataSchema,changeCaptionSequence,sequenceStatus} from '../../src/shared/local-sequence.js';
const now=Date.parse('2026-11-02T12:00:00Z');
const source=()=>captionDataSchema.parse({chunks:[{id:'a',text:'First thought',durationMs:1000},{id:'b',text:'Second thought',durationMs:2000}],playback:{state:'playing',positionMs:0,startedAt:new Date(now).toISOString()}});
describe('local declarative sequence',()=>{
 it('catches up at exact boundaries, completion and a reconnect without tick accumulation',()=>{
  const d=source();expect(sequenceStatus(d.chunks,d.playback,now+999).activeId).toBe('a');expect(sequenceStatus(d.chunks,d.playback,now+1000).activeId).toBe('b');expect(sequenceStatus(d.chunks,d.playback,now+90000)).toMatchObject({activeId:'b',phase:'complete',positionMs:3000});
 });
 it('pause survives wall time; resume and seek retain fractional progress',()=>{
  let d=changeCaptionSequence(source(),{op:'sequence',action:'pause'},now+475);expect(sequenceStatus(d.chunks,d.playback,now+99999).positionMs).toBe(475);
  d=changeCaptionSequence(d,{op:'sequence',action:'resume'},now+10000);expect(sequenceStatus(d.chunks,d.playback,now+10525).activeId).toBe('b');
  d=changeCaptionSequence(d,{op:'sequence',action:'seek',positionMs:25.5},now+11000);expect(sequenceStatus(d.chunks,d.playback,now+11001).positionMs).toBe(26.5);
 });
 it('replaces future only; append at completed queue starts new chunks now',()=>{
  const next={id:'c',text:'Third',durationMs:1000};let d=changeCaptionSequence(source(),{op:'sequence',action:'replace-future',chunks:[next]},now+100);expect(d.chunks.map(c=>c.id)).toEqual(['a','c']);expect(d.playback).toEqual(source().playback);
  d=changeCaptionSequence(source(),{op:'sequence',action:'append',chunks:[next]},now+100000);expect(sequenceStatus(d.chunks,d.playback,now+100000)).toMatchObject({activeId:'c',positionMs:3000});
  d=changeCaptionSequence(d,{op:'sequence',action:'replace',chunks:[next]},now);expect(d.playback).toEqual({state:'paused',positionMs:0});
  expect(changeCaptionSequence(d,{op:'sequence',action:'clear'},now).chunks).toEqual([]);
 });
 it('rejects duplicate IDs, overlong chunks, invalid actions and out-of-range seeks',()=>{
  expect(()=>changeCaptionSequence(source(),{op:'sequence',action:'append',chunks:[source().chunks[0]]},now)).toThrow();expect(()=>changeCaptionSequence(source(),{op:'sequence',action:'seek',positionMs:3001},now)).toThrow();expect(()=>changeCaptionSequence(source(),{op:'sequence',action:'pause',chunks:[]},now)).toThrow();expect(captionDataSchema.safeParse({chunks:[{id:'a',text:'x'.repeat(401),durationMs:1000}]}).success).toBe(false);
 });
});
