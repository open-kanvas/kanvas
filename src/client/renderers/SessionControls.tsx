import { FormattedTime } from './Regional';
import { AccountOverview } from './AccountOverview';
import { ReadingSettings } from '../ReadingSettings';
import { RegionalSettings } from '../RegionalSettings';
import { useMediaResource } from './readiness';
import { useEffect, useRef, useState } from 'react';
import { Renderer, type RendererProps } from './Renderer';
import { api, displayPath, requestId, sessionPath } from '../api';
import { type ViewSpec, type SessionConfig } from '../../shared/types';
import { STYLE_PRESETS } from '../../shared/styles';
import { mergeConfig } from '../../shared/preferences';
import { useTask,useAuth } from '../hooks';
import { Button, ErrorNotice, Field } from '../components/ui';

interface Card {displayId:string;displayName:string;displayRevision:number;revision:number;title?:string;template:string;createdAt:string;current:boolean;preview:string;image?:string;width:number;height:number}
function RetainedPreview({card,props,maxHeight}:{card:Card;props:RendererProps;maxHeight:number}){
  const frame=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[width,setWidth]=useState(240);
  const [result,setResult]=useState<{view:ViewSpec|null;config:SessionConfig}|null>(null);
  useEffect(()=>{const element=frame.current;if(!element)return;const intersection=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);intersection.disconnect();}},{rootMargin:'100px'});intersection.observe(element);const resize=new ResizeObserver(()=>setWidth(element.clientWidth));resize.observe(element);setWidth(element.clientWidth);return()=>{intersection.disconnect();resize.disconnect();};},[]);
  useEffect(()=>{if(!visible||!props.sessionId||!props.displayId)return;const controller=new AbortController();const query=new URLSearchParams({sourceDisplayId:card.displayId,revision:String(card.revision)});void api<{view:ViewSpec|null;config:SessionConfig}>(`${displayPath(props.sessionId,props.displayId)}/overview/preview?${query}`,{signal:controller.signal}).then(setResult).catch(()=>{});return()=>controller.abort();},[visible,props.sessionId,props.displayId,card.displayId,card.revision]);
  const sourceWidth=Math.max(320,card.width),sourceHeight=Math.max(240,card.height);
  const height=Math.max(90,Math.min(maxHeight,width*sourceHeight/sourceWidth)),scale=Math.min(width/sourceWidth,height/sourceHeight);
  return <div ref={frame} className="retained-preview" style={{height}} aria-hidden="true" inert>{result?.view?<div style={{width:sourceWidth,height:sourceHeight,left:(width-sourceWidth*scale)/2,top:(height-sourceHeight*scale)/2,transform:`scale(${scale})`}}><Renderer view={result.view} config={result.config} preview editable={false} actionable={false}/></div>:<p>{card.preview}</p>}</div>;
}
export function SessionOverview(props:RendererProps){return props.view.data.scope==='account'?<AccountOverview {...props}/>:<RetainedOverview {...props}/>;}
function RetainedOverview(props:RendererProps){
  const [cards,setCards]=useState<Card[]>([]),[loaded,setLoaded]=useState(false),[showMetadata,setShowMetadata]=useState(props.view.data.showMetadata!==false);
  const auth=useAuth(),task=useTask(),media=useMediaResource(props.preview?'ready':'pending');
  const load=async()=>{if(!props.sessionId||!props.displayId)return;const result=await api<{cards:Card[]}>(`${displayPath(props.sessionId,props.displayId)}/overview`);setCards(result.cards);setLoaded(true);};
  useEffect(()=>setShowMetadata(props.view.data.showMetadata!==false),[props.revision,props.view.data.showMetadata]);
  useEffect(()=>{if(props.preview)return;void task.run(async()=>{try{await load();}catch(error){media.fail();throw error;}});const timer=setInterval(()=>void load().catch(()=>{}),8000);return()=>clearInterval(timer);},[props.sessionId,props.displayId,props.revision,props.preview]);
  useEffect(()=>{if(loaded)media.ready();},[loaded,media.ready]);
  const ordered=props.view.data.order==='newest'?[...cards].reverse():cards;
  const grid=props.view.data.layout!=='list',previews=props.view.data.showPreviews!==false;
  return <div className="overview-content"><ErrorNotice message={task.error}/>{!cards.length&&<p>{props.preview?'Retained views appear here in an active session.':'No retained views yet.'}</p>}<div className={grid?'retained-overview-grid':'overview-list'} data-navigation-scroll>{ordered.map(card=><article key={`${card.displayId}:${card.revision}`} className={card.current?'current':''}>
    {previews&&<RetainedPreview card={card} props={props} maxHeight={grid?240:140}/>}
    <div className="overview-card-caption"><h3>{card.title??`View ${card.revision}`}</h3>{showMetadata&&<><span>{card.displayName} · {card.template}{card.current?' · current':''}</span><time>{<FormattedTime value={card.createdAt}/>}</time></>}</div>
    <button className="overview-open" aria-label={`Show ${card.title??`view ${card.revision}`} on ${card.displayName}`} disabled={!props.editable||task.busy} onClick={()=>void task.run(async()=>{await api(`${sessionPath(props.sessionId!)}/navigate`,{method:'POST',body:{displayIds:[card.displayId],requestId:requestId(),expectedRevisions:{[card.displayId]:card.displayRevision},revision:card.revision}});await props.onRefresh?.();await load();})}><span className="sr-only">Show this view →</span></button>
  </article>)}</div>{!props.preview&&!auth.viewOnly&&<footer className="overview-account-actions"><a href="/">Home</a><button onClick={()=>void task.run(()=>auth.logout())}>Sign out of this browser</button></footer>}</div>;

}
export function SessionSettings(props:RendererProps){
  const [draft,setDraft]=useState(props.config),[base,setBase]=useState(props.configRevision??0),[dirty,setDirty]=useState(false),[saveDefaults,setSaveDefaults]=useState(false),[defaultsRevision,setDefaultsRevision]=useState<number|undefined>(),[saved,setSaved]=useState(false),[requested,setRequested]=useState(false);const task=useTask();
  useEffect(()=>{if(!dirty){setDraft(props.config);setBase(props.configRevision??0);}},[props.config,props.configRevision,dirty]);
  useEffect(()=>{if(!props.editable||props.preview)return;void api<{revision:number}>('/api/preferences').then(x=>setDefaultsRevision(x.revision)).catch(()=>{});},[props.editable,props.preview,saved]);
  if(!draft)return <p>Session settings are available on a connected display.</p>;
  const propose=Boolean(!props.editable&&props.actionable&&props.onRespond),canChange=!props.preview&&(props.editable||propose),conflict=base!==(props.configRevision??0);
  const change=(patch:Partial<SessionConfig>)=>{setDraft(mergeConfig(draft,patch));setDirty(true);setSaved(false);setRequested(false);};
  return <form className="surface-settings" onSubmit={event=>{event.preventDefault();if(!props.sessionId||!props.displayId||!canChange||!dirty||conflict||task.busy)return;void task.run(async()=>{
    if(propose){await props.onRespond!({kind:'settings.request',config:draft,expectedConfigRevision:base});setRequested(true);}
    else{await api(`${displayPath(props.sessionId!,props.displayId!)}/settings`,{method:'POST',body:{expectedRevision:base,config:draft,saveDefaults,defaultsRevision}});setSaved(true);}
    setDirty(false);await props.onRefresh?.();
  });}}><header className="surface-settings-heading">{typeof props.view.data.description==='string'&&<p>{props.view.data.description}</p>}<p className="settings-permission">{props.editable?'Select your changes, then Apply settings.':propose?'You can request changes. The session owner or agent applies them.':'View-only screen. Only a session editor can change these settings.'}</p></header>
    <div className="surface-settings-scroll"><fieldset disabled={!canChange||task.busy}><legend>Appearance and behavior</legend>
    <div className="surface-style-picker" role="group" aria-label="Style preset">{STYLE_PRESETS.map(style=><button key={style.id} type="button" aria-label={style.name} aria-pressed={draft.style===style.id} style={{borderColor:style.accent}} onClick={()=>change({style:style.id,accent:style.accent})}>{draft.style===style.id&&<span aria-hidden="true">✓ </span>}{style.name}</button>)}</div><div className="surface-settings-grid">
    <Field label="Theme"><select value={draft.theme} onChange={e=>change({theme:e.target.value as SessionConfig['theme']})}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Follow this device</option></select></Field>
    <Field label="Density"><select value={draft.density} onChange={e=>change({density:e.target.value as SessionConfig['density']})}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
    <Field label="Accent"><input type="color" value={draft.accent} onChange={e=>change({accent:e.target.value})}/></Field></div>
    <ReadingSettings value={draft} disabled={!canChange||task.busy} change={change}/><RegionalSettings value={draft} disabled={!canChange||task.busy} change={change}/>
    {props.editable&&defaultsRevision!==undefined&&props.view.data.allowAccountDefaults!==false&&<label className="settings-defaults"><input type="checkbox" checked={saveDefaults} onChange={e=>{setSaveDefaults(e.target.checked);setDirty(true);}}/> Also use these defaults for my new sessions</label>}
    </fieldset></div><footer className="surface-settings-actions"><div role="status" aria-live="polite">{task.busy?'Saving…':requested?'Request sent. Waiting for the owner or agent to apply it.':saved?<><span>Settings saved.</span> Your agent has been notified.</>:dirty?`Selected: ${draft.theme} · ${STYLE_PRESETS.find(s=>s.id===draft.style)?.name??'Custom'} — not applied yet.`:'Current session settings.'}</div>
    <ErrorNotice message={task.error}/>{conflict&&dirty&&<p role="alert">Settings changed elsewhere. Your draft is kept. <button type="button" onClick={()=>{setDirty(false);setDraft(props.config);setBase(props.configRevision??0);}}>Load current settings</button></p>}
    {canChange&&<Button type="submit" disabled={!dirty||conflict} busy={task.busy}>{propose?'Request settings change':'Apply settings'}</Button>}</footer></form>;
}
