import {InlineMap} from './InlineMap';
import {useNavigation} from './Navigation';
import {useMediaResource} from './readiness';
import {useMemo,useRef,useState} from 'react';
import type {TemplateData} from '../../shared/template-data';
import {CategoryIcon} from './CategoryIcon';
import {MediaImage} from './Image';
import MapRenderer,{type MapData} from './Map';
import {useRegional} from './Regional';
import {regionalDate,regionalDateTime} from '../../shared/regional';
import './itinerary.css';
type Data=TemplateData<'itinerary'>;
const colors=['#2563eb','#c2410c','#7c3aed','#047857','#be123c','#0e7490'];
export function itineraryMap(data:Data, day:number|null):MapData {
 const markers:NonNullable<MapData['markers']>=[],routes:NonNullable<MapData['routes']>=[];
 let previous:Data['days'][number]['items'][number]|undefined;
 data.days.forEach((d,di)=>{if(day!==null&&day!==di)return;d.items.forEach((item,i)=>{
  if(!item.coordinates)return;
  markers.push({...item.coordinates,key:`${di}-${i}`,indexLabel:`${di+1}.${i+1}`,label:`${di+1}.${i+1} ${item.title}`,description:[d.date,item.time,item.place,item.category,item.description].filter(Boolean).join(' · '),color:colors[di%colors.length]});
  const mode=item.transport??(['flight','train','boat','car','walk','transit'].includes(item.category??'')?item.category:undefined)??'connection';
  if(previous?.coordinates)routes.push({name:`Day ${di+1} · ${previous.title} → ${item.title} · ${mode}`,coordinates:[previous.coordinates,item.coordinates],color:colors[di%colors.length],dashed:['flight','boat'].includes(mode)});
  previous=item;
 });});return {markers,routes};
}
export function ItineraryRenderer({data}:{data:Data}) {
 const media=useMediaResource(data.layout==='map'?'pending':'ready');
 const navigation=useNavigation(),[localDay,setLocalDay]=useState<number|null>(null),day=navigation?(navigation.state.day===undefined||navigation.state.day==='all'?null:navigation.state.day-1):localDay,setDay=(value:number|null)=>{if(navigation)navigation.send({action:'selectDay',day:value===null?'all':value+1});else setLocalDay(value);};
 const regional=useRegional(),[selected,setSelected]=useState<string|null>(null);
 const root=useRef<HTMLDivElement>(null),mapData=useMemo(()=>itineraryMap(data,day),[data,day]);
 const map=data.layout==='map',shown=day===null?data.days.map((d,i)=>({d,i})):[{d:data.days[day]??data.days[0],i:day}];
 const focus=(key:string)=>{setSelected(key);root.current?.querySelector(`[id="itinerary-${key}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});};
 return <div ref={root} className={`itinerary-layout${map?' itinerary-map-layout':''}`}>
 {map&&<nav className="itinerary-day-picker" aria-label="Itinerary day"><button aria-pressed={day===null} disabled={navigation?!navigation.canNavigate:false} onClick={()=>setDay(null)}>Whole trip</button>{data.days.map((d,i)=><button key={i} aria-pressed={day===i} disabled={navigation?!navigation.canNavigate:false} onClick={()=>setDay(i)}>Day {i+1} · {d.date}</button>)}</nav>}
 {map&&<div className="itinerary-map"><MapRenderer data={mapData} showControls onMarkerSelect={focus} onReady={media.ready} onError={media.fail}/></div>}
 <div className="itinerary-content" data-navigation-scroll>{shown.map(({d,i})=><section key={i}><header><time>{regionalDate(d.date,regional,'UTC',d.date)}</time><h2>{d.title??`Day ${i+1}`}</h2></header><ol>{d.items.map((item,j)=><li key={j} id={`itinerary-${i}-${j}`} className={selected===`${i}-${j}`?'is-selected':undefined}>
 <div className="itinerary-anchor"><time>{item.time?regionalDateTime(item.time,regional):'·'}</time><CategoryIcon category={item.category}/>{map&&<small style={{color:colors[i%colors.length]}}>{i+1}.{j+1}</small>}</div>
 <div className="itinerary-detail">{item.type&&<span className="content-eyebrow">{item.type}</span>}<h3>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>:item.title}</h3>{item.place&&<strong>{item.place}</strong>}{item.description&&<p>{item.description}</p>}{map&&(item.category||item.transport)&&<small>{[item.category,item.transport?`Arrive by ${item.transport}`:undefined].filter(Boolean).join(' · ')}</small>}{item.inlineMap&&<InlineMap {...item.inlineMap}/>} {item.image&&<div className="itinerary-image"><MediaImage entry={item.image}/></div>}</div></li>)}</ol></section>)}</div>
 </div>;
}
