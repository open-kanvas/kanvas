import {type CSSProperties} from 'react';
import {iconId,iconRefOf,iconSetTitle,iconUrl,iconVariants,type IconPickerData,type IconRef} from '../../shared/pickers';
// Shared picker rules are supplied by picker-primitives.css in Renderer.

const iconStyle=(icon:IconRef):CSSProperties=>({WebkitMaskImage:`url(${iconUrl(icon)})`,maskImage:`url(${iconUrl(icon)})`});

function IconGlyph({icon,size}:{icon:IconRef;size?:string}){return <i className="picker-icon" role="img" aria-label={`${iconSetTitle(icon)} ${icon.name}`} style={{...iconStyle(icon),...(size?{width:size,height:size}:{})}}/>;}

export function IconPicker({data}:{data:IconPickerData}){
 // A core set has style variants; a catalogue icon is one drawing, so it is shown as it is.
 const icons=data.icons.map(iconRefOf),styles=data.mode==='variants'?iconVariants(icons[0]):[];
 const variants:IconRef[]=styles.length?styles.map(variant=>({...icons[0],variant})):data.mode==='variants'?[icons[0]]:icons;
 return <div className={`picker icon-picker mode-${data.mode}`} data-picker-mode={data.mode}>{data.concept&&<p className="picker-concept">{data.concept}</p>}
  <ol className="picker-grid" style={{'--count':variants.length} as CSSProperties}>{variants.map((icon,index)=><li key={index} className={data.selected===index+1?'is-selected':undefined} data-icon-id={iconId(icon)}>
   <b className="picker-number">{index+1}</b>
   {data.mode==='context'?<div className="picker-context"><span className="picker-button"><IconGlyph icon={icon} size="1.1em"/>Button</span><span className="picker-menu"><IconGlyph icon={icon} size="1em"/>Menu item</span><span className="picker-list"><IconGlyph icon={icon} size="1.6em"/>List row</span></div>:<IconGlyph icon={icon}/>}
   <code className="picker-label">{iconId(icon)}</code>{data.mode==='sets'&&<small>{iconSetTitle(icon)}</small>}{data.mode==='variants'&&icon.variant&&<small>{icon.variant}</small>}</li>)}</ol>
 </div>;
}
