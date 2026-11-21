

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo} from './ContentPrimitives';
import './leaderboard.css';

export function LeaderboardRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'leaderboard'>; return <ol className="leaderboard-content">{d.items.map((item,i)=><li key={i}><span className="leaderboard-rank">{item.rank}</span><Photo image={item.image}/><h2>{item.name}</h2><strong>{item.value}</strong>{item.change && <small>{item.change}</small>}</li>)}</ol>; }
}
