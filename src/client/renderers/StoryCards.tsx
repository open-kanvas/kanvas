

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {MediaImage} from './Image';

import {liveSurfaceOptions} from '../../shared/live-surface';

import './story-cards.css';

export function StoryCardsRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  {const d=view.data as TemplateData<'story-cards'>;const news=d.items.some(item=>item.image);return <div className={`story-cards ${news?'story-news':'story-text'}`} data-count={d.items.length} data-layout={news?'news':'text'} data-many={d.items.length>=4?'true':undefined} data-navigation-scroll>{d.items.map((item,i)=><article className={item.image?'story-card has-image':'story-card'} key={i}>{item.image&&<div className="story-card-image"><MediaImage entry={item.image}/></div>}<div className="story-card-copy"><h2>{item.headline}</h2>{item.summary&&<p>{item.summary}</p>}</div></article>)}</div>;}
}
