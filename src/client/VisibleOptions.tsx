import { useId } from 'react';
export function VisibleOptions({label,value,options,onChange,disabled=false}:{label:string;value:string;options:readonly (readonly [string,string])[];onChange:(value:string)=>void;disabled?:boolean}) {
 const name=useId();return <fieldset className="visible-options" data-setting={label} disabled={disabled}><legend>{label}</legend><div>{options.map(([id,text])=><label key={id} className={value===id?'selected':''}><input type="radio" name={name} value={id} checked={value===id} onChange={()=>onChange(id)}/><span>{text}</span></label>)}</div></fieldset>;
}
