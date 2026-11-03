import {useEffect,useState,type CSSProperties} from 'react';
import QRCode from 'qrcode';
import {wifiPayload,type SignageData} from '../../shared/signage';
import {SignArrow} from './Signage';
type Item=SignageData['items'][number];
export function SignageDetails({item,showText,now}:{item:Item;showText:boolean;now:number}){
 const [qr,setQr]=useState<string>();
 const payload=item.wifi?wifiPayload(item.wifi):undefined;
 useEffect(()=>{let active=true;setQr(undefined);if(payload)void QRCode.toDataURL(payload,{margin:2,width:512,errorCorrectionLevel:'M'}).then(value=>{if(active)setQr(value);}).catch(()=>{if(active)setQr(undefined);});return()=>{active=false;};},[payload]);
 const directory=item.directory;
 const entries=directory?.entries.filter(e=>directory.layout!=='single-floor'||e.floor===directory.floor)??[];
 const floors=[...new Set(entries.map(e=>e.floor))];
 return <>
 {item.image&&<img className="sign-logo" src={item.image} alt="Supplied sign image"/>}
 {item.value!==undefined&&showText&&<strong className="sign-value">{item.value}</strong>}
 {item.endsAt&&<strong className="sign-value" aria-label="Seconds until live">{Math.max(0,Math.ceil((Date.parse(item.endsAt)-now)/1000))}</strong>}
 {showText&&item.status&&<strong className="sign-status">{item.status}</strong>}
 {showText&&item.details&&<dl className="sign-details">{item.details.map((d,i)=><div key={i}>{d.label&&<dt>{d.label}</dt>}<dd>{d.value}</dd></div>)}</dl>}
 {showText&&item.destinations&&<div className="sign-destinations">{item.destinations.map(d=><div key={d.id} data-destination-id={d.id}><SignArrow direction={d.direction}/><strong>{d.label}</strong><span>{d.minutes} min</span></div>)}</div>}
 {directory&&showText&&<div className={'sign-directory directory-'+directory.layout} style={{'--directory-rows':Math.max(1,entries.length+floors.length)} as CSSProperties}>{floors.map(floor=><section key={floor}><h3>{floor}</h3>{entries.filter(e=>e.floor===floor).map(e=><div key={e.id} data-tenant-id={e.id}>{e.direction&&<SignArrow direction={e.direction}/>}<strong>{e.name}</strong>{e.room&&<span>{e.room}</span>}{e.description&&<small>{e.description}</small>}</div>)}</section>)}</div>}
 {item.map&&<svg className="sign-map" viewBox="0 0 100 100" aria-label="Supplied schematic map"><title>Supplied schematic map</title>{item.map.areas.map(a=><g key={a.id}><rect x={a.x} y={a.y} width={a.width} height={a.height}/>{showText&&<text x={a.x+a.width/2} y={a.y+a.height/2} textAnchor="middle">{a.label}</text>}</g>)}<circle className="you-are-here" cx={item.map.youAreHere.x} cy={item.map.youAreHere.y} r="3"/>{showText&&<text x={item.map.youAreHere.x} y={Math.min(97,item.map.youAreHere.y+7)} textAnchor="middle">You are here</text>}</svg>}
 {item.wifi&&<div className="sign-wifi">{qr&&<img src={qr} alt="Scan to join supplied Wi-Fi network"/>}{showText&&<><strong>{item.wifi.ssid}</strong>{item.wifi.showPassword&&<span>{item.wifi.password}</span>}</>}</div>}
 </>;
}
