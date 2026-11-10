import {SIGN_ART} from '../../shared/sign-art';
import {useEffect,useState} from 'react';
import {SignageDetails} from './SignageDetails';
import {signageDataSchema,signCatalog,signLabel,type SignageData} from '../../shared/signage';
import type {ViewSpec} from '../../shared/types';
import './signage.css';
/** Where an arrow sits on its sign: on the side it points to. */
export function signArrowSide(direction:string):'left'|'right'|'top'|'bottom'{
 if(direction.includes('left'))return 'left';
 if(direction.includes('right'))return 'right';
 return direction==='down'?'bottom':'top';
}
/** One closed, filled arrow outline for every direction: straight and diagonal
 * arrows are the same shape rotated, turns are one elbow shape mirrored. No
 * overlapping strokes, so the tip and corners are clean at any size. */
export const SIGN_ARROW_STRAIGHT='50,7 87,47 63,47 63,93 37,93 37,47 13,47',SIGN_ARROW_TURN='30,6 58,44 42,44 42,70 93,70 93,94 18,94 18,44 2,44';
export function SignArrow({direction}:{direction:string}){
 const rotations:Record<string,number>={ahead:0,up:0,right:90,down:180,left:270,'up-right':45,'down-right':135,'down-left':225,'up-left':315};
 const corner=direction.startsWith('turn-');
 return <svg className="sign-arrow" data-arrow-side={signArrowSide(direction)} viewBox="0 0 100 100" role="img" aria-label={direction}><g fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" transform={corner?'translate('+(direction.includes('right')?100:0)+' '+(direction.endsWith('down')?100:0)+') scale('+(direction.includes('right')?-1:1)+' '+(direction.endsWith('down')?-1:1)+')':'rotate('+(rotations[direction]??0)+' 50 50)'}><polygon points={corner?SIGN_ARROW_TURN:SIGN_ARROW_STRAIGHT}/></g></svg>;
}

export function SignageRenderer({view,serverNow}:{view:ViewSpec;serverNow?:string}){
 const offset=serverNow&&Number.isFinite(Date.parse(serverNow))?Date.parse(serverNow)-Date.now():0;
 const [now,setNow]=useState(Date.now()+offset);
 useEffect(()=>{setNow(Date.now()+offset);const timer=setInterval(()=>setNow(Date.now()+offset),1000);return()=>clearInterval(timer);},[serverNow]);
 if(import.meta.env.VITE_KANVAS_SIGNAGE==='false')return <div role="status">Signage viewing is disabled. Saved signs are retained.</div>;
 const parsed=signageDataSchema.safeParse(view.data);
 if(!parsed.success)return <div role="status">This saved sign is unavailable: its artwork has been retired. The original saved content is retained. Choose a reviewed sign from the current catalog.</div>;
 const data=parsed.data;
 return <div className="signage-grid" data-count={data.items.length}>{data.items.map(item=><SignCard key={item.id} item={item} data={data} now={now}/>)}</div>;
}
function SignCard({item,data,now}:{now:number;item:SignageData['items'][number];data:SignageData}){
 const rich=!!(item.directory||item.destinations||item.map||item.wifi);
 const def=signCatalog.find(s=>s.id===item.type)!,region=item.region??data.region,label=item.label??signLabel(item.type,region);
 return <article className={'signage-card sign-'+def.style+(rich?' sign-rich':'')} data-sign-id={item.id} data-sign-type={item.type} data-region={region} aria-label={label}><div className="signage-visual" data-arrow-side={item.direction?signArrowSide(item.direction):undefined}>{SIGN_ART[item.type]?<div className="sign-reviewed-composition"><img className="sign-reviewed-art" src={SIGN_ART[item.type]} alt={label}/>{def.style==='prohibit'&&<svg className="sign-reviewed-prohibition" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55"/><path d="M22 22L98 98"/></svg>}</div>:null}{item.direction&&<SignArrow direction={item.direction}/>}</div><SignageDetails item={item} showText={data.text!=='none'} now={now}/>{data.text!=='none'&&<><h2>{label}</h2>{item.caption&&<p>{item.caption}</p>}</>}</article>;
}
