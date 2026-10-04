import type { SessionConfig } from '../shared/types';
import { readingDefaults } from '../shared/reading';
import { VisibleOptions } from './VisibleOptions';
export function ReadingSettings({value,change,disabled=false,dimension='all'}:{value:SessionConfig;change:(patch:Partial<SessionConfig>)=>void;disabled?:boolean;dimension?:string}){
 const r=readingDefaults(value),show=(name:string)=>dimension==='all'||dimension===name;
 return <fieldset className="regional-settings" disabled={disabled}><legend>Reading defaults</legend><small className="reading-scope-note">Applies to document and reading views only, not other templates.</small>
 {show('readingFontSize')&&<><VisibleOptions label="Text size" defaultValue="22" value={String(r.fontSize)} options={[...new Set([20,22,24,28,32,40,r.fontSize])].sort((a,b)=>a-b).map(n=>[String(n),`${n} px`])} onChange={v=>change({readingFontSize:Number(v)})}/><label>Exact text size<input aria-label="Default reading text size" type="number" min={16} max={40} value={r.fontSize} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=16&&n<=40)change({readingFontSize:n});}}/></label></>}
 {show('readingWpm')&&<label>Reading speed (default: 220 words/minute)<input aria-label="Default reading words per minute" type="number" min={120} max={320} value={r.wpm} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isInteger(n)&&n>=120&&n<=320)change({readingWpm:n});}}/> words/minute</label>}
 {show('readingZoom')&&<><VisibleOptions label="Zoom" defaultValue="1" value={String(r.zoom)} options={[...new Set([.75,1,1.25,1.5,1.75,r.zoom])].sort((a,b)=>a-b).map(n=>[String(n),`${Math.round(n*100)}%`])} onChange={v=>change({readingZoom:Number(v)})}/><label>Exact zoom factor<input aria-label="Default reading zoom" type="number" min={.75} max={1.75} step={.05} value={r.zoom} onChange={e=>{const n=e.target.valueAsNumber;if(n>=.75&&n<=1.75)change({readingZoom:n});}}/></label><small>Zoom presets and the exact factor change the same setting. 1 = 100% (default).</small></>}
 </fieldset>;
}
