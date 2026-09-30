import { FormattedTime } from './Regional';
import { lazy,Suspense,useEffect,useState,useRef } from 'react';
import type { SessionTopology as Topology,TopologyConnection } from '../../shared/accounts';
import type { TopologyData } from '../../shared/connection-views';
import { api,errorMessage } from '../api';
import { Icon } from '../icons';
import './connection-views.css';
const MapRenderer=lazy(()=>import('./Map'));
const browserIcons:Record<string,string>={Chrome:'chrome',Firefox:'firefox',Edge:'edge',Safari:'safari',Opera:'opera'};
export function DeviceIcon({type}:{type:TopologyConnection['deviceType']}){
  const mobile=type==='phone'||type==='tablet',laptop=type==='laptop';
  return <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" role="img" aria-label={type==='unknown'?'Device':type}><rect x={mobile?9:3} y={mobile?3:5} width={mobile?14:26} height={mobile?26:18} rx="2"/>{mobile?<path d="M14 25h4"/>:laptop?<path d="M1 27h30l-3-4H4z"/>:<path d="M16 23v5m-7 0h14"/>}{type==='tv'&&<path d="m11 2 5 3 5-3"/>}</svg>;
}
function PersonAvatar({url,name,guest,sessionId,displayId}:{url?:string;name:string;guest:boolean;sessionId:string;displayId?:string}){
  const src=url&&`${url}${displayId?`?sessionId=${encodeURIComponent(sessionId)}&displayId=${encodeURIComponent(displayId)}`:''}`;
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
  return <span className={`topology-avatar ${guest?'is-guest':''}`}>{src&&!failed?<img src={src} alt={`${name} profile`} onError={()=>setFailed(true)}/>:<Icon name="people" size={27}/>}</span>;
}
function WindowCard({connection,displayNames}:{connection:TopologyConnection;displayNames:Map<string,string>}){
  const c=connection,logo=browserIcons[c.browser];
  return <article className={`topology-window ${c.connected?'is-connected':'is-offline'} ${c.outlier?'is-outlier':''}`} data-window-id={c.id}>
    <div className="topology-window-heading">{logo?<img className="browser-logo" src={`/browser-icons/${logo}.svg`} alt={c.browser}/>:<Icon name="globe" size={22}/>}<strong>{c.windowName??c.browser}</strong><span className="topology-connection-state"><i/>{c.connected?'Connected':'Offline'}</span></div>
    <div className="topology-window-detail"><span>{displayNames.get(c.displayId)??'Display'}</span><span>{c.width&&c.height?`${c.width} × ${c.height}`:'Viewport unavailable'}</span></div>
    {c.location&&<p className="topology-location">≈ {[c.location.city,c.location.region,c.location.country].filter(Boolean).join(', ')}{c.location.accuracyKm?` · ±${c.location.accuracyKm} km`:''}</p>}
    {c.outlier&&<p className="topology-outlier">{c.outlier==='outside-expected-countries'?'Outside expected countries':'Different from session majority'}</p>}
    <time dateTime={c.connected?c.joinedAt:c.lastSeenAt}>{c.connected?'Joined':'Last seen'} {<FormattedTime value={c.connected?c.joinedAt:c.lastSeenAt}/>}</time>
  </article>;
}
export function SessionTopologyRenderer({sessionId,displayId,data,preview,onReady,onError,renderIdentity,publicSnapshot}:{publicSnapshot?:Topology;sessionId?:string;displayId?:string;data:TopologyData;preview?:boolean;onReady?:()=>void;onError?:()=>void;renderIdentity?:string|number}){
  const ready=useRef(onReady),failed=useRef(onError),reported=useRef<string|number>('');ready.current=onReady;failed.current=onError;
  const identity=renderIdentity??'ready';
  const [loaded,setLoaded]=useState<{identity:string|number;value:Topology}>(),[error,setError]=useState('');
  const snapshot=publicSnapshot??(loaded?.identity===identity?loaded.value:undefined);
  const layout=data.layout,groupBy=data.groupBy??'all';
  useEffect(()=>{
    if(!sessionId||preview||publicSnapshot)return;const controller=new AbortController();let inFlight=false;
    setError('');
    const load=async()=>{if(inFlight)return;inFlight=true;try{
      const value=await api<Topology>(`/api/sessions/${encodeURIComponent(sessionId)}/topology?${displayId?`displayId=${encodeURIComponent(displayId)}`:`includeLocation=${data.includeLocation}&includeOffline=${data.includeOffline}`}`,{signal:controller.signal});
      if(!controller.signal.aborted){setLoaded({identity,value});setError('');}
    }catch(e){if(!controller.signal.aborted){setLoaded(undefined);setError(errorMessage(e));}}finally{inFlight=false;}};
    void load();const timer=setInterval(()=>void load(),4000);return()=>{controller.abort();clearInterval(timer);};
  },[sessionId,displayId,preview,data.includeLocation,data.includeOffline,identity,publicSnapshot]);
  useEffect(()=>{if(error){failed.current?.();return;}if((preview||snapshot&&!(layout==='map'&&snapshot.locationVisible))&&reported.current!==identity){reported.current=identity;ready.current?.();}},[snapshot,error,preview,layout,identity]);
  if(preview)return <div className="topology-preview"><Icon name="people" size={48}/><h3>Session connections</h3><p>Displays · people · devices · windows</p><span>Live when opened on its session display</span></div>;
  if(error)return <div className="content-empty" role="alert">{error}</div>;
  if(!snapshot)return <div className="content-empty" role="status">Loading session connections…</div>;
  const names=new Map(snapshot.displays.map(d=>[d.id,d.name])),all=snapshot.displays.flatMap(d=>d.connections),located=all.filter(c=>c.location?.lat!==undefined&&c.location.lng!==undefined);
  const coordinates=new Map<string,{lat:number;lng:number;label:string;description:string;color:string;accuracyKm?:number}>();
  for(const c of located){const l=c.location!,key=`${l.lat}:${l.lng}`;const old=coordinates.get(key);coordinates.set(key,{lat:l.lat!,lng:l.lng!,label:old?`${old.label}, ${c.name}`:c.name,description:`${l.city??l.region??l.country} · approximate GeoIP${l.accuracyKm?` ±${l.accuracyKm} km`:''}${c.outlier?' · review location':''}`,color:c.outlier?'#f59e0b':c.connected?'#86b89d':'#94a3b8',accuracyKm:l.accuracyKm});}
  const devices=(person:Topology['people'][number],forDisplay?:string)=>person.devices.flatMap(device=>{
    const connections=device.connections.filter(c=>!forDisplay||c.displayId===forDisplay);
    return connections.length?[<section className="topology-device" key={device.id} data-device-id={device.id}><header><DeviceIcon type={device.type}/><div><h3>{device.name}</h3><span>{connections.length} window{connections.length===1?'':'s'}</span></div></header><div className="topology-windows">{connections.map(c=><WindowCard key={c.id} connection={c} displayNames={names}/>)}</div></section>]:[];
  });
  const personHeader=(person:Topology['people'][number])=><header><PersonAvatar url={person.avatarUrl} name={person.name} guest={person.guest} sessionId={sessionId??snapshot.sessionId} displayId={displayId}/><div><h2>{person.name}</h2><span>{person.guest?'Guest':'Registered account'}</span></div></header>;
  return <section className="session-topology" aria-label="Session connections" data-group-by={groupBy}>
    <header className="topology-toolbar"><div className="topology-counts"><strong>{snapshot.displays.length}<small>displays</small></strong><strong>{snapshot.counts.people}<small>people</small></strong><strong>{snapshot.counts.devices}<small>devices</small></strong><strong>{snapshot.counts.windows}<small>live windows</small></strong>{snapshot.counts.offline>0&&<strong>{snapshot.counts.offline}<small>offline</small></strong>}</div></header>
    {layout==='map'&&snapshot.locationVisible?<div className="topology-map-layout"><div className="topology-map"><Suspense fallback={<div className="content-empty">Loading map…</div>}><MapRenderer onReady={()=>ready.current?.()} onError={()=>failed.current?.()} renderIdentity={renderIdentity} data={{markers:[...coordinates.values()],...(!located.length?{center:{lat:20,lng:0},zoom:2}:{})}}/></Suspense></div><aside className="topology-map-people" data-navigation-scroll><h3>Approximate locations</h3><p>{located.length} located · {all.length-located.length} unavailable · {snapshot.counts.outliers} live outliers</p>{all.map(c=><div key={c.id} className={c.outlier?'is-outlier':''}><strong>{c.name}</strong><span>{c.location?[c.location.city,c.location.region,c.location.country].filter(Boolean).join(', '):'Location unavailable'}</span><small>{c.connected?'Connected':'Offline'}{c.outlier?' · review location':''}</small></div>)}<p>GeoIP is approximate. VPNs and network exits can appear elsewhere.</p></aside></div>:
      <div className="topology-groups" data-navigation-scroll>
        {groupBy==='people'?snapshot.people.map(person=><section className="topology-person" key={person.id}>{personHeader(person)}<div className="topology-devices">{devices(person)}</div></section>):
         groupBy==='devices'?snapshot.people.flatMap(person=>person.devices.map(device=><section className="topology-person topology-device-group" key={person.id+device.id}><header><DeviceIcon type={device.type}/><div><h2>{device.name}</h2><span>{person.name} · {person.guest?'Guest':'Registered account'}</span></div><PersonAvatar url={person.avatarUrl} name={person.name} guest={person.guest} sessionId={sessionId??snapshot.sessionId} displayId={displayId}/></header><div className="topology-windows">{device.connections.map(c=><WindowCard key={c.id} connection={c} displayNames={names}/>)}</div></section>)):
         snapshot.displays.map(display=><section className="topology-display" key={display.id} data-display-id={display.id}><header><span className="topology-display-icon"><Icon name="screen" size={48}/></span><div><h2>{display.name}</h2>{display.view?<span className="topology-display-view" title={display.view.template}>{display.view.label}</span>:<span className="topology-display-view is-blank">Nothing shown</span>}<span>Display · {display.connections.filter(c=>c.connected).length} live windows</span></div></header><div className="topology-display-people">{snapshot.people.filter(person=>person.devices.some(device=>device.connections.some(c=>c.displayId===display.id))).map(person=><section className="topology-person" key={person.id}>{personHeader(person)}<div className="topology-devices">{devices(person,display.id)}</div></section>)}{!display.connections.length&&<p>No connections recorded.</p>}</div></section>)}
        {!all.length&&<p className="topology-empty">No receiving browser windows are connected yet.</p>}
      </div>}
  </section>;
}
