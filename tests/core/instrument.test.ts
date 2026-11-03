import {describe,it,expect} from 'vitest';
import {instrumentDataSchema,instrumentFrameSchema,changeInstrument,changeInstrumentSequence,instrumentTarget,isBlackKey} from '../../src/shared/instrument.js';
import {sequenceStatus} from '../../src/shared/local-sequence.js';
const keyboard=()=>instrumentDataSchema.parse({config:{family:'keyboard',firstMidi:60,lastMidi:83},elements:{'key:60':{pitch:{midi:60,label:'C4'}},'key:63':{pitch:{midi:63,label:'Eb4'}},'key:67':{},'key:70':{}}});
describe('supplied instrument visual state',()=>{
 it('changes Cm7 to E major atomically without rebuilding configuration or unrelated data',()=>{
  const before=keyboard(),after=changeInstrument(before,{op:'instrument',label:'E major',changes:[...['60','63','67','70'].map(n=>({id:`key:${n}`,value:null})),...[64,68,71].map(midi=>({id:`key:${midi}`,value:{highlight:true,pitch:{midi,label:{64:'E4',68:'G#4',71:'B4'}[midi]!}}}))]});
  expect(after.config).toEqual(before.config);expect(Object.keys(after.elements)).toEqual(['key:64','key:68','key:71']);expect(after.elements['key:68'].pitch?.label).toBe('G#4');expect(before.elements['key:63'].pitch?.label).toBe('Eb4');
 });
 it('validates structural targets, MIDI coordinate agreement and unique changes',()=>{
  const d=keyboard();expect(()=>changeInstrument(d,{op:'instrument',changes:[{id:'key:59',value:null}]})).toThrow();expect(()=>changeInstrument(d,{op:'instrument',changes:[{id:'key:60',value:{highlight:true,pitch:{midi:61,label:'C4'}}}]})).toThrow();expect(()=>changeInstrument(d,{op:'instrument',changes:[{id:'key:60',value:null},{id:'key:60',value:null}]})).toThrow();expect(isBlackKey(63)).toBe(true);expect(isBlackKey(64)).toBe(false);
 });
 it('supports guitar/bass/ukulele configurations with supplied tuning and physical fret IDs',()=>{
  for(const pitches of [[40,45,50,55,59,64],[28,33,38,43],[67,60,64,69]]){
   const config={family:'fretted',strings:pitches.map((midi,i)=>({id:`s${i}`,label:`String ${i+1}`,openPitch:{midi,label:`supplied ${midi}`}})),fretCount:6,capo:2};
   const d=instrumentDataSchema.parse({config,elements:{'string:s0:fret:0':{finger:'0',pitch:{midi:pitches[0],label:'Open'}},'string:s1:fret:2':{finger:'2'},[`string:s${pitches.length-1}:mute`]:{}}});
   expect(instrumentTarget(d.config,'string:s0:fret:5')).toBe(true);expect(instrumentTarget(d.config,'string:s0:fret:6')).toBe(false);expect(instrumentTarget(d.config,'string:absent:mute')).toBe(false);
  }
 });
 it('plays explicit frames, seeks, freezes on clear, then permits static narrow changes',()=>{
  let d=keyboard();const frames=instrumentFrameSchema.array().parse([{id:'c',durationMs:1000,elements:{'key:60':{highlight:true}}},{id:'d',durationMs:1000,elements:{'key:62':{highlight:true}}}]);
  d=changeInstrumentSequence(d,{op:'instrument-sequence',action:'replace',frames},10000);d=changeInstrumentSequence(d,{op:'instrument-sequence',action:'resume'},10000);expect(sequenceStatus(d.frames,d.playback,11500).activeId).toBe('d');expect(()=>changeInstrument(d,{op:'instrument',changes:[{id:'key:60',value:null}]})).toThrow();
  d=changeInstrumentSequence(d,{op:'instrument-sequence',action:'clear'},11500);expect(d.frames).toEqual([]);expect(d.elements).toEqual({'key:62':{highlight:true}});expect(changeInstrument(d,{op:'instrument',changes:[{id:'key:62',value:null}]}).elements).toEqual({});
 });
});
