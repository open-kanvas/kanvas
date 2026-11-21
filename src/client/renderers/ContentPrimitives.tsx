import {useMediaResource} from './readiness';
import type {ReactNode} from 'react';
import './content-primitives.css';
export function Photo({ image }: { image?: { url:string;alt:string } }) {const resource=useMediaResource(image?'pending':'ready');return image?<img className="content-photo" src={image.url} alt={image.alt} onLoad={resource.ready} onError={resource.fail} ref={element=>{if(element?.complete){if(element.naturalWidth>0)resource.ready();else resource.fail();}}}/>:null;}
export const OptionalDetails = ({ enabled, summary, children, className = "supplementary-details" }: { enabled: boolean; summary: string; children: ReactNode; className?: string }) => enabled ? <details className={className}><summary>{summary}</summary>{children}</details> : <div className={className}>{children}</div>;
export const Details = ({ items, showControls = false }: { items?: { label: string; value: string }[]; showControls?: boolean }) => items?.length ? <OptionalDetails enabled={showControls} summary="More details"><dl className="content-details">{items.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></OptionalDetails> : null;
export const Link = ({ url, children }: { url?: string; children: ReactNode }) => url ? <a href={url} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <>{children}</>;
