import { useInternalNavigation } from './Navigation';
import { useState } from 'react';
import { CategoryIcon } from './CategoryIcon';
import { useMediaResource } from './readiness';
import './content-additions.css';
function RecipePhoto({image}:{image:{url:string;alt:string}}){const resource=useMediaResource('pending');return <img className="procedure-photo" src={image.url} alt={image.alt} onLoad={resource.ready} onError={resource.fail} ref={node=>{if(node?.complete&&node.naturalWidth)resource.ready();}}/>;}
import type { RendererProps } from './Renderer';
import type { ExtendedData } from '../../shared/extended-templates';
import { advanceProcedure, type ProcedureAction } from '../../shared/procedure';
import { errorMessage } from '../api';

export function ProcedureRenderer(props:RendererProps) {
  const d=props.view.data as ExtendedData<'recipe'>, stage=d.stage??'intro', index=d.index??0;
  const step=d.stepDetails?.find(s=>s.index===index),photo=stage==='step'?step?.image:d.image;
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const canControl=Boolean(!props.preview&&props.editable&&(props.onRespond||props.onEdit));
  const change=async(action:ProcedureAction)=>{if(!canControl||pending)return;setPending(true);setError('');try{if(props.onRespond)await props.onRespond({kind:'procedure.navigate',action});else if(props.onEdit&&props.revision!==undefined)await props.onEdit(advanceProcedure(props.view,action),props.revision);}catch(e){setError(errorMessage(e));}finally{setPending(false);}};
  useInternalNavigation(direction=>{if(!canControl||direction<0&&stage==='intro'||direction>0&&stage==='complete')return false;void change(direction<0?'back':'next');return true;});
  const progress=stage==='complete'?d.steps.length:stage==='intro'?0:index;
  return <section className={`procedure-content procedure-${stage}`} aria-label="Step-by-step guide">
    <header className="procedure-header"><span className="content-eyebrow">{d.name}</span><span aria-live="polite">{stage==='intro'?'Ready to begin':stage==='complete'?'Complete':`Step ${index+1} of ${d.steps.length}`}</span></header>
    <div className="procedure-progress" role="progressbar" aria-label="Procedure progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={d.steps.length}><i style={{width:`${progress/d.steps.length*100}%`}}/></div>
    <div className="procedure-stage" key={`${stage}-${index}`} tabIndex={0}>
      {photo&&<RecipePhoto key={photo.url} image={photo}/>}
      {stage==='step'&&step?.action&&<CategoryIcon category={step.action} className="procedure-action"/>}
      {stage==='intro'?<><h2>{d.name}</h2>{d.description&&<p>{d.description}</p>}{!!d.materials?.length&&<section><h3>What you need</h3><ul>{d.materials.map((x,i)=><li key={i}>{x}</li>)}</ul></section>}</>:stage==='complete'?<><span className="procedure-complete" aria-hidden="true">✓</span><h2>All done.</h2><p>{d.completion??`You have completed all ${d.steps.length} steps.`}</p></>:<><span className="procedure-step-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><p className={`procedure-instruction ${d.steps[index].length>350?'long-instruction':''}`}>{d.steps[index]}</p></>}
    </div>
    {!props.preview&&<footer className="procedure-controls">{!canControl&&<p>View only</p>}<div><button disabled={!canControl||pending||stage==='intro'} onClick={()=>void change('back')}>Back</button><button disabled={!canControl||pending} onClick={()=>void change(stage==='complete'?'start':'next')}>{pending?'Updating…':stage==='intro'?'Begin':stage==='complete'?'Start again':index===d.steps.length-1?'Finish':'Next step'} <span aria-hidden="true">→</span></button></div>{error&&<p role="alert">{error}</p>}</footer>}
  </section>;
}
