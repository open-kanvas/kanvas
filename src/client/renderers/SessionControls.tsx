import { VisibleOptions } from '../VisibleOptions';
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
import { ErrorNotice, Field } from '../components/ui';

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
 const [draft,setDraft]=useState(props.config),[base,setBase]=useState(props.configRevision??0),[scope,setScope]=useState('session'),[status,setStatus]=useState('');
 const [defaults,setDefaults]=useState<{revision:number;config:SessionConfig}>(),[groups,setGroups]=useState<{id:string;name:string;kind:string;role:string;revision:number;defaults:Partial<SessionConfig>}[]>([]);
 const defaultsRef=useRef<typeof defaults>(undefined),writing=useRef(false),scopeRef=useRef(scope);scopeRef.current=scope;
 const task=useTask(),dimension=String(props.view.data.dimension??'all'),show=(name:string)=>dimension==='all'||dimension===name;
 useEffect(()=>{if(scope==='session'&&!writing.current){setDraft(props.config);setBase(props.configRevision??0);}},[props.config,props.configRevision,scope]);
 useEffect(()=>{
  if(!props.editable||props.preview)return;
  let active=true;
  const refresh=async()=>{
   try {
    const [next,result]=await Promise.all([api<NonNullable<typeof defaults>>('/api/preferences'),api<{groups:typeof groups}>('/api/groups')]);
    if(!active||writing.current)return;
    const previous=defaultsRef.current;if(previous&&next.revision<previous.revision)return;defaultsRef.current=next;setDefaults(next);setGroups(result.groups.filter(g=>['owner','admin'].includes(g.role)));
    if(scopeRef.current==='account'){setDraft(next.config);setBase(next.revision);}
    else if(scopeRef.current!=='session'){const group=result.groups.find(g=>g.id===scopeRef.current);if(group){setDraft(mergeConfig(props.config!,group.defaults));setBase(group.revision);}}
    if(previous&&previous.revision!==next.revision){
      const changes=Object.entries(next.config).filter(([key,value])=>JSON.stringify(previous.config[key as keyof SessionConfig])!==JSON.stringify(value)&&(dimension==='all'||dimension===key));
      if(changes.length)setStatus('All new sessions updated: '+changes.map(([key,value])=>key+': '+String(value)).join(', ')+(scopeRef.current==='session'?'. This session is unchanged.':''));
    }
   }catch{/* Defaults are optional; session controls remain available. */}
  };
  void refresh();const timer=setInterval(()=>void refresh(),3000);
  const changed=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.sessionId===props.sessionId&&detail.type==='config')void refresh();};
  window.addEventListener('kanvas:session-change',changed);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('kanvas:session-change',changed);};
 },[props.editable,props.preview,props.sessionId,props.config,dimension]);
 if(!draft)return <p>Session settings are available on a connected display.</p>;
 const propose=Boolean(!props.editable&&props.actionable&&props.onRespond),canChange=!props.preview&&(props.editable||propose);
 const change=(next:Partial<SessionConfig>)=>{
  if(!canChange||writing.current||!props.sessionId||!props.displayId)return;
  const before=draft;setDraft(mergeConfig(draft,next));setStatus('');writing.current=true;
  void task.run(async()=>{
   try{
    const group=groups.find(g=>g.id===scope);
    if(propose){await props.onRespond!({kind:'settings.request',config:next,expectedConfigRevision:base,scope:'session'});setDraft(before);setStatus('Change requested from your agent.');}
    else {
      const result=await api<{revision?:number;configRevision?:number;config?:SessionConfig;defaults?:Partial<SessionConfig>}>(displayPath(props.sessionId!,props.displayId!)+'/settings',{method:'POST',body:{expectedRevision:base,config:next,scope:group?.kind??scope,...(group?{groupId:group.id}:{})}});
      setBase(result.configRevision??result.revision??base);setDraft(result.config??mergeConfig(before,result.defaults??next));
      if(scope==='account'&&result.config){const saved={revision:result.revision!,config:result.config};defaultsRef.current=saved;setDefaults(saved);}
      setStatus(scope==='account'?'Saved for all new sessions. This session is unchanged.':'Settings saved.');
    }
    writing.current=false;await props.onRefresh?.();
   }catch(error){writing.current=false;setDraft(before);await props.onRefresh?.();throw error;}
   finally{writing.current=false;}
  });
 };
 const selectScope=(next:string)=>{setScope(next);setStatus('');const group=groups.find(g=>g.id===next);setDraft(next==='account'&&defaults?defaults.config:group?mergeConfig(props.config!,group.defaults):props.config);setBase(next==='account'?defaults?.revision??0:group?.revision??props.configRevision??0);};
 return <section className={'surface-settings'+(dimension==='all'?'':' settings-focused')}>
 <header className="surface-settings-heading">{typeof props.view.data.description==='string'&&<p>{props.view.data.description}</p>}
 {props.editable&&props.view.data.allowAccountDefaults!==false?<label className="settings-scope">Apply to <select aria-label="Apply to" value={scope} onChange={e=>selectScope(e.target.value)} disabled={task.busy}><option value="session">This session</option>{defaults&&<option value="account">All new sessions</option>}{groups.map(g=><option value={g.id} key={g.id}>{g.kind==='team'?'Team':'Organization'}: {g.name}</option>)}</select><small>Changes save immediately.</small></label>:<p className="settings-permission">{props.editable?'Changes save immediately.':propose?'Ask your agent, or select an option to request a change.':'View-only screen. Ask your agent to apply changes.'}</p>}</header>
 <div className="surface-settings-scroll" data-navigation-scroll><fieldset disabled={!canChange||task.busy} className="settings-sections">
 {(show('style')||show('theme')||show('accent'))&&<section className="settings-section"><h3>Appearance</h3>{show('style')&&<VisibleOptions label="Style preset" defaultValue="ocean" value={draft.style??'ocean'} options={STYLE_PRESETS.map(s=>[s.id,s.name])} colors={Object.fromEntries(STYLE_PRESETS.map(s=>[s.id,s.accent]))} onChange={v=>change({style:v,accent:STYLE_PRESETS.find(s=>s.id===v)!.accent})}/>}
 {show('theme')&&<VisibleOptions label="Theme" defaultValue="dark" value={draft.theme} options={[["dark","Dark"],["light","Light"],["system","Follow device"]]} onChange={v=>change({theme:v as SessionConfig['theme']})}/>}
 {show('accent')&&<Field label="Accent (default: Ocean blue)"><input type="color" value={draft.accent} onChange={e=>change({accent:e.target.value})}/></Field>}</section>}
 {['all','readingFontSize','readingWpm','readingZoom'].includes(dimension)&&<ReadingSettings value={draft} disabled={!canChange||task.busy} change={change} dimension={dimension}/>}
 {['all','numberLocale','unitSystem','dateFormat','timeFormat','timeZone'].includes(dimension)&&<RegionalSettings value={draft} disabled={!canChange||task.busy} change={change} dimension={dimension}/>}
 </fieldset></div><div className="surface-settings-status" role="status" aria-live="polite">{status}</div><ErrorNotice message={task.error}/>
 </section>;
}
