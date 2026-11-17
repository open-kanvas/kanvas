

import {useRegional} from './Regional';

import {useState} from 'react';

import type {TemplateData} from '../../shared/template-data';
import type {RendererProps} from './Renderer';
import {CategoryIcon} from './CategoryIcon';

import {ProcedureRenderer} from './Procedure';
import {errorMessage} from '../api';

import {liveSurfaceOptions} from '../../shared/live-surface';

import {Photo,OptionalDetails} from './ContentPrimitives';
import './recipe.css';
function RecipeStart({respond}:{respond:NonNullable<RendererProps['onRespond']>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <><button className="recipe-start" disabled={busy} onClick={()=>{setBusy(true);setError('');void respond({kind:'procedure.navigate',action:'start'}).catch(e=>setError(errorMessage(e))).finally(()=>setBusy(false));}}>Start step-by-step →</button>{error&&<p role="alert">{error}</p>}</>;
}
export function RecipeRenderer(props: RendererProps) {
  const regional=useRegional();
  const {view,onReady}=props;
  const surface=liveSurfaceOptions(view,props.containerView);
  { const d=view.data as TemplateData<'recipe'>; if(d.mode==='steps')return <ProcedureRenderer {...props}/>; return <div className="recipe-content"><header><Photo image={d.image}/><div><h2>{d.name}</h2><p>{d.description}</p><p className="recipe-meta">{[d.duration,d.yield].filter(Boolean).join(' · ')}</p>{!props.preview&&surface.showControls&&props.editable&&props.onRespond&&<RecipeStart respond={props.onRespond}/>}</div></header><OptionalDetails enabled={surface.showControls} summary="Ingredients & full method" className="supplementary-details recipe-full"><div className="recipe-columns"><section><h3>What you need</h3><ul>{d.materials.map((x,i)=><li key={i}>{x}</li>)}</ul></section><section><h3>Steps</h3><ol>{d.steps.map((x,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span><p><CategoryIcon className="recipe-step-icon" category={d.stepDetails?.find(s=>s.index===i)?.action}/>{x}</p></li>)}</ol></section></div></OptionalDetails></div>; }
}
