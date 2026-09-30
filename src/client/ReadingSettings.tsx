import type { SessionConfig } from '../shared/types';
import { readingDefaults } from '../shared/reading';

export function ReadingSettings({value,change,disabled=false}:{value:SessionConfig;change:(patch:Partial<SessionConfig>)=>void;disabled?:boolean}){
  const r=readingDefaults(value);
  return <fieldset className="regional-settings" disabled={disabled}><legend>Reading defaults</legend>
    <label>Text size<select aria-label="Default reading text size" value={r.fontSize} onChange={e=>change({readingFontSize:Number(e.target.value)})}>{Array.from({length:25},(_,i)=>16+i).map(size=><option key={size} value={size}>{size} px</option>)}</select></label>
    <label>Reading speed<input aria-label="Default reading words per minute" type="number" min={120} max={320} value={r.wpm} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=120&&n<=320)change({readingWpm:n});}}/> words/minute</label>
    <label>Zoom<select aria-label="Default reading zoom" value={r.zoom} onChange={e=>change({readingZoom:Number(e.target.value)})}>{[.75,.85,.95,1,1.05,1.15,1.25,1.35,1.45,1.55,1.65,1.75,...(![.75,.85,.95,1,1.05,1.15,1.25,1.35,1.45,1.55,1.65,1.75].includes(r.zoom)?[r.zoom]:[])].sort((a,b)=>a-b).map(v=><option key={v} value={v}>{Math.round(v*100)}%</option>)}</select></label>
    <small>Text size, speed and zoom are independent. Automatic scrolling always starts paused.</small>
  </fieldset>;
}
