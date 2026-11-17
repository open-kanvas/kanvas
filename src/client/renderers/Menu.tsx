

import {useRegional} from './Regional';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo} from './ContentPrimitives';
import './menu.css';

export function MenuRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'menu'>; return <div className="menu-content">{d.image&&<header className="menu-cover"><Photo image={d.image}/></header>}{d.groups.map((group,i)=><section key={i} className="menu-group"><header className="menu-group-header"><Photo image={group.image}/><h2>{group.title}</h2></header>{group.items.map((item,j)=><article key={j} className={`${item.featured?'is-featured':''} ${item.image?'menu-with-image':''}`}><Photo image={item.image}/><div className="menu-item-copy">{item.featured && <span className="content-eyebrow">Featured</span>}<header><h3>{item.name}</h3>{item.price && <strong>{item.price}</strong>}</header>{item.description && <p>{item.description}</p>}</div></article>)}</section>)}</div>; }
}
