import {KeyboardShortcuts} from './KeyboardShortcuts';
import { ItineraryRenderer } from './Itinerary';
import { TimelineRenderer } from './TaskViews';
import { useRegional } from './Regional';
import { regionalDate, regionalNumber, regionalDateTime } from '../../shared/regional';
import { ProductComparison } from './Product';
import { useEffect, useState, type CSSProperties } from 'react';
import { useMediaResource } from './readiness';
import type { ExtendedData } from '../../shared/extended-templates';
import type { RendererProps } from './Renderer';
import './extended.css';
import './content-additions.css';
import { CategoryIcon } from './CategoryIcon';
import { MediaImage } from './Image';
import './timeline-fit.css';
import { ProcedureRenderer } from './Procedure';
import { errorMessage } from '../api';
import { WeatherRenderer } from './Weather';
import { liveSurfaceOptions } from '../../shared/live-surface';
import { profileContactTarget, type ProfileDetail } from '../../shared/profile-contact';
import { isSafeUrl } from '../../shared/urls';
import './profile-contact.css';

function Photo({ image }: { image?: { url:string;alt:string } }) {const resource=useMediaResource(image?'pending':'ready');return image?<img className="extended-photo" src={image.url} alt={image.alt} onLoad={resource.ready} onError={resource.fail} ref={element=>{if(element?.complete){if(element.naturalWidth>0)resource.ready();else resource.fail();}}}/>:null;}
const OptionalDetails = ({ enabled, summary, children, className = "supplementary-details" }: { enabled: boolean; summary: string; children: React.ReactNode; className?: string }) => enabled ? <details className={className}><summary>{summary}</summary>{children}</details> : <div className={className}>{children}</div>;
const Details = ({ items, showControls = false }: { items?: { label: string; value: string }[]; showControls?: boolean }) => items?.length ? <OptionalDetails enabled={showControls} summary="More details"><dl className="extended-details">{items.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></OptionalDetails> : null;
const Link = ({ url, children }: { url?: string; children: React.ReactNode }) => url ? <a href={url} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <>{children}</>;

function ProfileContacts({ items }: { items: ProfileDetail[] }) {
  return <dl className="profile-contacts" aria-label="Contact details">{items.map((item, index) => {
    const target = profileContactTarget(item);
    return <div className="profile-contact-detail" data-contact-type={item.type} key={index}>
      <dt>{item.label}</dt>
      <dd>{item.type === 'address' ? <><span className="profile-contact-value">{item.value}</span>{target && <a className="profile-contact-map" href={target.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open ${item.label} in Maps: ${item.value}`}>Open in Maps <span aria-hidden="true">↗</span></a>}</> : target ?
        <a className="profile-contact-action" href={target.href} target={target.external ? '_blank' : undefined} rel={target.external ? 'noopener noreferrer' : undefined} referrerPolicy={target.external ? 'no-referrer' : undefined} aria-label={`${item.label}: ${item.value}`}><span className="profile-contact-value">{item.value}</span>{target.external && <span className="profile-contact-arrow" aria-hidden="true">↗</span>}</a>
        : <span className="profile-contact-value">{item.value}</span>}
      </dd>
    </div>;
  })}</dl>;
}

function RecipeStart({respond}:{respond:NonNullable<RendererProps['onRespond']>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <><button className="recipe-start" disabled={busy} onClick={()=>{setBusy(true);setError('');void respond({kind:'procedure.navigate',action:'start'}).catch(e=>setError(errorMessage(e))).finally(()=>setBusy(false));}}>Start step-by-step →</button>{error&&<p role="alert">{error}</p>}</>;
}
function JoinRenderer({data,showControls=false}:{data:ExtendedData<'join'>;showControls?:boolean}) {
  const regional=useRegional();
  const address=typeof window!=='undefined'?new URL(data.url,window.location.origin).href:data.url;
  const [expired,setExpired]=useState(Date.parse(data.expiresAt)<=Date.now());
  useEffect(()=>{setExpired(Date.parse(data.expiresAt)<=Date.now());const timer=setInterval(()=>setExpired(Date.parse(data.expiresAt)<=Date.now()),1000);return()=>clearInterval(timer);},[data.expiresAt]);
  return <section className="join-surface"><h2>{data.label}</h2>{expired?<p className="join-expired" role="status">This invitation has expired. Ask the owner for a new one.</p>:<><div className="join-qr"><Photo image={data.qr}/></div><a className="join-address" href={data.url} target="_blank" rel="noopener noreferrer">{address.replace(/^https?:\/\//,'')}</a></>}<p>{data.description??'Scan or open the address, then ask the owner to approve your screen.'}</p>{showControls && <details className="supplementary-details"><summary>Invitation details</summary><p>Expires {regionalDateTime(data.expiresAt,regional,'UTC',()=>new Date(data.expiresAt).toLocaleString())} · Access requires approval</p></details>}</section>;
}

export function ExtendedRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  switch (view.template) {
    case 'keyboard-shortcuts': return <KeyboardShortcuts/>;
    case 'html': {
      const data = view.data as ExtendedData<'html'>;
      const css = (data.css ?? '').replace(/<\/style/gi, '');
      const doc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:system-ui;background:#151515;color:#fafafa}*{box-sizing:border-box}${css}</style></head><body>${data.html}</body></html>`;
      return <iframe className="custom-visual" title={data.description} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} onLoad={onReady} />;
    }
    case 'story-cards':{const d=view.data as ExtendedData<'story-cards'>;const news=d.items.some(item=>item.image);return <div className={`story-cards ${news?'story-news':'story-text'}`} data-count={d.items.length} data-layout={news?'news':'text'} data-many={d.items.length>=4?'true':undefined} data-navigation-scroll>{d.items.map((item,i)=><article className={item.image?'story-card has-image':'story-card'} key={i}>{item.image&&<div className="story-card-image"><MediaImage entry={item.image}/></div>}<div className="story-card-copy"><h2>{item.headline}</h2>{item.summary&&<p>{item.summary}</p>}</div></article>)}</div>;}
    case 'timeline': return <TimelineRenderer data={view.data as ExtendedData<'timeline'>}/>;
    case 'itinerary': return <ItineraryRenderer data={view.data as ExtendedData<'itinerary'>}/>;
    case 'product': { const d=view.data as ExtendedData<'product'>; if(d.layout==='comparison'||d.layout==='multi-vendor') return <ProductComparison data={d}/>; return <div className={`product-content layout-${d.layout}`}><div className="product-intro"><Photo image={d.image}/><div><h2>{d.name}</h2><p>{d.description}</p><Details items={d.details} showControls={surface.showControls}/></div></div><div className="product-offers">{d.offers.map((offer,i)=><article key={i}><span className="content-eyebrow"><Link url={offer.url}>{offer.vendor}</Link></span><strong className="offer-price">{offer.price}</strong>{[offer.availability,offer.hours,offer.distance,offer.shipping].filter(Boolean).map((x,j)=><p key={j}>{x}</p>)}{surface.showControls && offer.url && <Link url={offer.url}>View offer</Link>}</article>)}</div></div>; }
    case 'weather': return <WeatherRenderer preview={props.preview} data={view.data as ExtendedData<'weather'>} showControls={surface.showControls}/>;
    case 'profile': {
      const d=view.data as ExtendedData<'profile'>;
      const contacts = d.details?.filter(item => item.type && item.type !== 'text') ?? [], plain = d.details?.filter(item => !item.type || item.type === 'text');
      return <div className={`profile-content profile-${d.kind} profile-contact-layout ${contacts.length ? 'profile-has-contacts' : ''}`}>
        <Photo key={d.image?.url} image={d.image}/>
        <div className="profile-copy">
          <header className="profile-identity"><h2 className="profile-name">{d.name}</h2>{d.role && <p className="profile-role">{d.role}</p>}</header>
          {!!contacts.length && <ProfileContacts items={contacts}/>}
          {!!d.links?.length && <nav className="profile-links" aria-label="Profile links">{d.links.map((link,i)=><Link key={i} url={isSafeUrl(link.url) ? link.url : undefined}>{link.label}</Link>)}</nav>}
          {d.description && <p className="profile-description">{d.description}</p>}
          <Details items={plain} showControls={surface.showControls}/>
        </div>
      </div>;
    }
    case 'kpi': { const d=view.data as ExtendedData<'kpi'>; return <div className="kpi-content">{d.items.map((item,i)=><article key={i} className={item.value.length>18?'kpi-long-value':undefined}><h2>{item.label}</h2><strong style={{'--value-length':Math.max(4,item.value.length)} as CSSProperties}>{item.value}</strong>{(item.delta || item.trend) && <p className={`metric-trend trend-${item.trend}`}>{item.trend === 'up' ? '↗' : item.trend === 'down' ? '↘' : '→'} {item.delta}</p>}{item.note && <p>{item.note}</p>}</article>)}</div>; }
    case 'quote': { const d=view.data as ExtendedData<'quote'>; return <figure className="quote-content"><span className="quote-mark" aria-hidden="true">“</span><blockquote>{d.text}</blockquote><figcaption><Photo image={d.image}/><div><strong><Link url={d.url}>{d.attribution}</Link></strong>{d.role && <span>{d.role}</span>}</div></figcaption></figure>; }
    case 'procedure': return <ProcedureRenderer {...props}/>;
    case 'join': return <JoinRenderer data={view.data as ExtendedData<'join'>} showControls={surface.showControls}/>;
    case 'recipe': { const d=view.data as ExtendedData<'recipe'>; if(d.mode==='steps')return <ProcedureRenderer {...props}/>; return <div className="recipe-content"><header><Photo image={d.image}/><div><h2>{d.name}</h2><p>{d.description}</p><p className="recipe-meta">{[d.duration,d.yield].filter(Boolean).join(' · ')}</p>{!props.preview&&props.editable&&props.onRespond&&<RecipeStart respond={props.onRespond}/>}</div></header><OptionalDetails enabled={surface.showControls} summary="Ingredients & full method" className="supplementary-details recipe-full"><div className="recipe-columns"><section><h3>What you need</h3><ul>{d.materials.map((x,i)=><li key={i}>{x}</li>)}</ul></section><section><h3>Steps</h3><ol>{d.steps.map((x,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span><p><CategoryIcon className="recipe-step-icon" category={d.stepDetails?.find(s=>s.index===i)?.action}/>{x}</p></li>)}</ol></section></div></OptionalDetails></div>; }
    case 'menu': { const d=view.data as ExtendedData<'menu'>; return <div className="menu-content">{d.image&&<header className="menu-cover"><Photo image={d.image}/></header>}{d.groups.map((group,i)=><section key={i} className="menu-group"><header className="menu-group-header"><Photo image={group.image}/><h2>{group.title}</h2></header>{group.items.map((item,j)=><article key={j} className={`${item.featured?'is-featured':''} ${item.image?'menu-with-image':''}`}><Photo image={item.image}/><div className="menu-item-copy">{item.featured && <span className="content-eyebrow">Featured</span>}<header><h3>{item.name}</h3>{item.price && <strong>{item.price}</strong>}</header>{item.description && <p>{item.description}</p>}</div></article>)}</section>)}</div>; }
    case 'leaderboard': { const d=view.data as ExtendedData<'leaderboard'>; return <ol className="leaderboard-content">{d.items.map((item,i)=><li key={i}><span className="leaderboard-rank">{item.rank}</span><Photo image={item.image}/><h2>{item.name}</h2><strong>{item.value}</strong>{item.change && <small>{item.change}</small>}</li>)}</ol>; }
    case 'status': { const d=view.data as ExtendedData<'status'>; return <div className="health-content">{d.asOf && <p className="health-asof">{d.asOf}</p>}<div className="health-grid">{d.items.map((item,i)=><article className={`health-${item.status}`} key={i}><span className="health-indicator" aria-hidden="true"/><h2>{item.name}</h2><strong>{item.label ?? {ok:'Operational',warning:'Warning',down:'Unavailable',unknown:'Unknown'}[item.status]}</strong>{item.note && <p>{item.note}</p>}</article>)}</div></div>; }
    default: return null;
  }
}
