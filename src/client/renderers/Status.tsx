

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import './status.css';

export function StatusRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'status'>; return <div className="health-content">{d.asOf && <p className="health-asof">{d.asOf}</p>}<div className="health-grid">{d.items.map((item,i)=><article className={`health-${item.status}`} key={i}><span className="health-indicator" aria-hidden="true"/><h2>{item.name}</h2><strong>{item.label ?? {ok:'Operational',warning:'Warning',down:'Unavailable',unknown:'Unknown'}[item.status]}</strong>{item.note && <p>{item.note}</p>}</article>)}</div></div>; }
}
