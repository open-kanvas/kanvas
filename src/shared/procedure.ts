import type { ViewSpec } from './types.js';

export const PROCEDURE_ACTIONS = ['start','next','back','complete','overview'] as const;
export type ProcedureAction = typeof PROCEDURE_ACTIONS[number];

/** Pure transition over pre-staged source. No generated content or timing drift. */
export function advanceProcedure(view: ViewSpec, action: ProcedureAction): Record<string,unknown> {
  if (!['procedure','recipe'].includes(view.template)) throw new Error('This view is not a procedure.');
  const d = view.data, steps = d.steps as string[], last = steps.length-1;
  let index=Number(d.index??0), stage=String(d.stage??'intro');
  if(action==='overview') return {...d,...(view.template==='recipe'?{mode:'overview'}:{}),stage:'intro',index:0};
  if(action==='start') {stage='step';index=0;}
  if(action==='complete') {stage='complete';index=last;}
  if(action==='next') {if(stage==='intro'){stage='step';index=0;}else if(stage==='step'){if(index===last)stage='complete';else index++;}}
  if(action==='back') {if(stage==='complete'){stage='step';index=last;}else if(stage==='step'){if(index===0)stage='intro';else index--;}}
  return {...d,...(view.template==='recipe'?{mode:'steps'}:{}),index,stage};
}
