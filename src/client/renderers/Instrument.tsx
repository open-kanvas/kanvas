import {useSequence} from './LiveCaptions';
import {isBlackKey,type InstrumentData,type InstrumentElement} from '../../shared/instrument';
import './instrument.css';
const color=(e?:InstrumentElement)=>e?.highlight?(e.color??'#38bdf8'):undefined;
const text=(e?:InstrumentElement)=>[e?.label??e?.pitch?.label,e?.finger?`(${e.finger})`:undefined].filter(Boolean).join(' ');
export function Instrument({data,serverNow,preview}:{data:InstrumentData;serverNow?:string;preview?:boolean}) {
 const status=useSequence(data.frames,data.playback,serverNow,preview);
 const elements=data.frames[status.index]?.elements??data.elements;
 const c=data.config;
 if(c.family==='keyboard'){
  const keys=Array.from({length:c.lastMidi-c.firstMidi+1},(_,i)=>c.firstMidi+i);
  let whites=0;const positions=keys.map(midi=>({midi,black:isBlackKey(midi),x:isBlackKey(midi)?whites-.32:whites++}));
  const min=Math.min(0,positions[0].x),width=Math.max(whites,...positions.map(k=>k.x+(k.black ? .64 : 1)))-min;
  return <section className="instrument-visual" data-active-frame={status.activeId??''} data-phase={status.phase} aria-label="Keyboard visualization">{data.label&&<h2>{data.label}</h2>}<div className="instrument-scroll"><svg role="img" aria-label="Supplied keyboard highlights" viewBox={`0 0 ${width*70} 330`}>
   <title>Keyboard — MIDI 60 is C4</title>{[false,true].flatMap(black=>positions.filter(k=>k.black===black).map(k=>{const id=`key:${k.midi}`,e=elements[id];return <g key={id} data-element-id={id} data-highlight={!!e?.highlight}><title>{text(e)||`MIDI ${k.midi}`}</title><rect x={(k.x-min)*70+1} y="1" width={(black ? .64 : 1)*70-2} height={black?195:320} rx="5" fill={color(e)??(black?'#172033':'#f7fafc')} stroke="#475569" strokeWidth="2"/><text x={(k.x-min+(black ? .32 : .5))*70} y={black?170:290} textAnchor="middle" fill={e?.highlight?'#07111d':black?'#fff':'#172033'} fontSize="15">{text(e)||k.midi}</text></g>;}))}
  </svg></div></section>;
 }
 const step=105,height=100+c.strings.length*80,width=170+c.fretCount*step;
 return <section className="instrument-visual" data-active-frame={status.activeId??''} data-phase={status.phase} aria-label="Fretted-string visualization">{data.label&&<h2>{data.label}</h2>}<div className="instrument-scroll"><svg role="img" aria-label="Supplied fretted-string fingerings" viewBox={`0 0 ${width} ${height}`}><title>Physical fret positions; strings ordered as supplied; capo {c.capo}</title>
  {Array.from({length:c.fretCount},(_,i)=>{const fret=c.firstFret+i,x=130+i*step;return <g key={fret}><line x1={x+step/2} x2={x+step/2} y1="65" y2={height-35} stroke="#64748b" strokeWidth={fret===0?6:2}/><text x={x} y="35" textAnchor="middle" fill="#dbeafe" fontSize="22">{fret===0?'Open':fret}{fret===c.capo&&c.capo>0?' capo':''}</text></g>;})}
  {c.strings.map((s,si)=>{const y=90+si*80,muteId=`string:${s.id}:mute`,mute=elements[muteId];return <g key={s.id}><text x="8" y={y+8} fill="#f8fafc" fontSize="22">{s.label}</text><title>{s.openPitch.label}, MIDI {s.openPitch.midi}</title><line x1="100" x2={width-30} y1={y} y2={y} stroke="#94a3b8" strokeWidth={2+(c.strings.length-si)*.3}/><g data-element-id={muteId} data-highlight={!!mute?.highlight}>{mute?.highlight&&<text x="76" y={y+9} fill={color(mute)} fontSize="30">×</text>}</g>{Array.from({length:c.fretCount},(_,i)=>{const fret=c.firstFret+i,id=`string:${s.id}:fret:${fret}`,e=elements[id],x=130+i*step;return <g key={id} data-element-id={id} data-highlight={!!e?.highlight}><title>{s.label}, fret {fret}{text(e)?`: ${text(e)}`:''}</title>{e?.highlight&&<circle cx={x} cy={y} r="27" fill={color(e)} stroke={fret===0?'#f8fafc':'none'} strokeWidth="4"/>}{e&&<text x={x} y={y+6} textAnchor="middle" fill={e.highlight?'#07111d':'#f8fafc'} fontSize="16">{text(e)}</text>}</g>;})}</g>;})}
 </svg></div></section>;
}
