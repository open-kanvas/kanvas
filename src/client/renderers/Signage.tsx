import {SIGN_ART} from '../../shared/sign-art';
import {useEffect,useState} from 'react';
import {SignageDetails} from './SignageDetails';
import {signageDataSchema,signCatalog,signLabel,type SignageData} from '../../shared/signage';
import {SignGlyph} from './signage-glyphs';
import type {ViewSpec} from '../../shared/types';
import './signage.css';
export function SignArrow({direction}:{direction:string}){
 const rotations:Record<string,number>={ahead:0,up:0,right:90,down:180,left:270,'up-right':45,'down-right':135,'down-left':225,'up-left':315};
 const corner=direction.startsWith('turn-');
 return <svg className="sign-arrow" viewBox="0 0 100 100" role="img" aria-label={direction}><g fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="square" strokeLinejoin="miter" transform={corner?undefined:'rotate('+(rotations[direction]??0)+' 50 50)'}>{corner?<g transform={'translate('+(direction.includes('right')?100:0)+' '+(direction.endsWith('down')?100:0)+') scale('+(direction.includes('right')?-1:1)+' '+(direction.endsWith('down')?-1:1)+')'}><path d="M83 83H25V17 M8 35L25 17L42 35"/></g>:<path d="M50 88V12 M20 42L50 12L80 42"/>}</g></svg>;
}
export function SignageRenderer({view,serverNow}:{view:ViewSpec;serverNow?:string}){
 const offset=serverNow&&Number.isFinite(Date.parse(serverNow))?Date.parse(serverNow)-Date.now():0;
 const [now,setNow]=useState(Date.now()+offset);
 useEffect(()=>{setNow(Date.now()+offset);const timer=setInterval(()=>setNow(Date.now()+offset),1000);return()=>clearInterval(timer);},[serverNow]);
 if(import.meta.env.VITE_KANVAS_SIGNAGE==='false')return <div role="status">Signage viewing is disabled. Saved signs are retained.</div>;
 const data=signageDataSchema.parse(view.data);
 return <div className="signage-grid" data-count={data.items.length}>{data.items.map(item=><SignCard key={item.id} item={item} data={data} now={now}/>)}</div>;
}
function SignCard({item,data,now}:{now:number;item:SignageData['items'][number];data:SignageData}){
 const rich=!!(item.directory||item.destinations||item.map||item.wifi);
 const def=signCatalog.find(s=>s.id===item.type)!,region=item.region??data.region,label=item.label??signLabel(item.type,region);
 return <article className={'signage-card sign-'+def.style+(rich?' sign-rich':'')} data-sign-id={item.id} data-sign-type={item.type} data-region={region} aria-label={label}><div className="signage-visual">{SIGN_ART[item.type]?<div className="sign-reviewed-composition"><img className="sign-reviewed-art" src={SIGN_ART[item.type]} alt={label}/>{def.style==='prohibit'&&<svg className="sign-reviewed-prohibition" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55"/><path d="M22 22L98 98"/></svg>}</div>:<svg className="sign-pictogram" viewBox="0 0 120 120" role="img" aria-label={label}>
 {def.style==='warning'&&<path className="sign-shape" d="M60 4L117 109H3Z"/>}{def.style==='prohibit'&&<circle className="sign-shape" cx="60" cy="60" r="55"/>}{def.style==='mandatory'&&<circle className="sign-shape" cx="60" cy="60" r="57"/>}
 <g transform={def.style==='warning'?'translate(33 42) scale(.54)':def.style==='prohibit'?'translate(25 25) scale(.7)':'translate(10 10)'}><SignGlyph name={def.glyph}/></g>
 {def.style==='prohibit'&&<path className="prohibition-slash" d="M22 22L98 98"/>}</svg>}{item.direction&&<SignArrow direction={item.direction}/>}</div><SignageDetails item={item} showText={data.text!=='none'} now={now}/>{data.text!=='none'&&<><h2>{label}</h2>{item.caption&&<p>{item.caption}</p>}</>}</article>;
}
