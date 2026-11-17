import {type CSSProperties} from 'react';
import {fontCssName,fontDisplayName,fontUrl,fontVariableRange,FONT_FAMILIES,type FontPickerData,type FontRef} from '../../shared/pickers';
import './font-picker.css';

const face=(font:FontRef):CSSProperties=>({fontFamily:`"${fontCssName(font.family)}", system-ui, sans-serif`,fontWeight:font.weight});

const fontLabel=(font:FontRef)=>`${fontDisplayName(font.family)} ${font.weight}`;

export function FontPicker({data}:{data:FontPickerData}){
 const family=data.fonts[0].family;
 const weights=data.mode==='weights'?(Object.hasOwn(FONT_FAMILIES,family)?[...FONT_FAMILIES[family].weights]:[400,700]).map(weight=>({family,weight})):[];
 const pairings=data.mode==='pairings'?Array.from({length:Math.floor(data.fonts.length/2)},(_,i)=>({heading:data.fonts[i*2],body:data.fonts[i*2+1]})):[];
 const used=[...data.fonts,...weights];
 // Same-origin font files only; names are validated ids, never free text.
 // A variable family is one file for its whole weight range; a static family is one file per weight.
 const css=[...new Map(used.map(font=>[fontVariableRange(font.family)?font.family:`${font.family}:${font.weight}`,font])).values()].map(font=>{const range=fontVariableRange(font.family);return `@font-face{font-family:"${fontCssName(font.family)}";font-weight:${range?`${range[0]} ${range[1]}`:font.weight};font-style:normal;font-display:swap;src:url(${fontUrl(font.family,font.weight)}) format("woff2")}`;}).join('');
 const rows=data.mode==='weights'?weights:data.fonts,body='Kanvas is your agent’s screen. The detail is already visible, so your words get shorter.';
 return <div className={`picker font-picker mode-${data.mode}`} data-picker-mode={data.mode} data-sample-size={data.sampleSize} style={data.sampleSize?{'--font-sample-size':`${data.sampleSize}px`} as CSSProperties:undefined}><style>{css}</style>
  {data.mode==='pairings'?<ol className="picker-grid font-pairings" style={{'--count':pairings.length} as CSSProperties}>{pairings.map((pair,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined}><b className="picker-number">{index+1}</b><h3 style={face(pair.heading)}>{data.text}</h3><p style={face(pair.body)}>{body}</p><code className="picker-label">{`${fontLabel(pair.heading)} + ${fontLabel(pair.body)}`}</code></li>)}</ol>
  :<ol className="font-samples" style={{'--count':rows.length} as CSSProperties}>{rows.map((font,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined} data-font-family={font.family} data-font-weight={font.weight}><b className="picker-number">{index+1}</b>
   {data.mode==='context'?<div className="font-context"><h3 style={face(font)}>{data.text}</h3><p style={face({...font,weight:400})}>{body}</p><span className="picker-button" style={face(font)}>Button</span></div>:<p className="font-sample" style={face(font)}>{data.text}</p>}
   <code className="picker-label">{fontLabel(font)}</code></li>)}</ol>}
 </div>;
}
