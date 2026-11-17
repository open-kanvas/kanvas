

import {useRegional} from './Regional';

import {type CSSProperties} from 'react';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import './kpi.css';

export function KpiRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'kpi'>; return <div className="kpi-content">{d.items.map((item,i)=><article key={i} className={item.value.length>18?'kpi-long-value':undefined}><h2>{item.label}</h2><strong style={{'--value-length':Math.max(4,item.value.length)} as CSSProperties}>{item.value}</strong>{(item.delta || item.trend) && <p className={`metric-trend trend-${item.trend}`}>{item.trend === 'up' ? '↗' : item.trend === 'down' ? '↘' : '→'} {item.delta}</p>}{item.note && <p>{item.note}</p>}</article>)}</div>; }
}
