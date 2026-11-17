

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo,Link} from './ContentPrimitives';
import './quote.css';

export function QuoteRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'quote'>; return <figure className="quote-content"><span className="quote-mark" aria-hidden="true">“</span><blockquote>{d.text}</blockquote><figcaption><Photo image={d.image}/><div><strong><Link url={d.url}>{d.attribution}</Link></strong>{d.role && <span>{d.role}</span>}</div></figcaption></figure>; }
}
