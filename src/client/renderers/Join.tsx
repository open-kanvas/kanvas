

import {useRegional} from './Regional';
import {regionalDateTime} from '../../shared/regional';
import {useEffect,useState} from 'react';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo} from './ContentPrimitives';
import './join.css';
function JoinContent({data,showControls=false}:{data:TemplateData<'join'>;showControls?:boolean}) {
  const regional=useRegional();
  const address=typeof window!=='undefined'?new URL(data.url,window.location.origin).href:data.url;
  const [expired,setExpired]=useState(Date.parse(data.expiresAt)<=Date.now());
  useEffect(()=>{setExpired(Date.parse(data.expiresAt)<=Date.now());const timer=setInterval(()=>setExpired(Date.parse(data.expiresAt)<=Date.now()),1000);return()=>clearInterval(timer);},[data.expiresAt]);
  return <section className="join-surface"><h2>{data.label}</h2>{expired?<p className="join-expired" role="status">This invitation has expired. Ask the owner for a new one.</p>:<><div className="join-qr"><Photo image={data.qr}/></div><a className="join-address" href={data.url} target="_blank" rel="noopener noreferrer">{address.replace(/^https?:\/\//,'')}</a></>}<p>{data.description??'Scan or open the address, then ask the owner to approve your screen.'}</p>{showControls && <details className="supplementary-details"><summary>Invitation details</summary><p>Expires {regionalDateTime(data.expiresAt,regional,'UTC',()=>new Date(data.expiresAt).toLocaleString())} · Access requires approval</p></details>}</section>;
}
export function JoinRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  return <JoinContent data={view.data as TemplateData<'join'>} showControls={surface.showControls}/>;
}
