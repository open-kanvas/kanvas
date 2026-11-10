import type {PublishInput} from '../shared/publish-input.js';
import {LocalSearch} from './mcp/local-search.js';
import {templateCatalog} from './mcp/discovery.js';

/** A single short sentence is a reasonable fact. Longer prose with no template
 * and no data shape has no deterministic match: choosing "fact" would put a
 * wall of text on a screen and report success. */
export const FACT_CONTEXT_MAX=160;
/** True when the loose path has only prose to go on: no prepared view, no
 * template hint, no data, no dataset or media, and context too long for a fact. */
export function needsTemplate(input:Pick<PublishInput,'view'|'templateHint'|'data'|'datasetId'|'assetIds'|'context'>):boolean{
 if(input.view!==undefined||input.templateHint||input.data!==undefined||input.datasetId||input.assetIds?.length)return false;
 const context=typeof input.context==='string'?input.context.trim():'';
 return context.length>FACT_CONTEXT_MAX;
}
/** Nothing is published. The existing lexical ranking over the template
 * catalog proposes three candidates, each with its minimal example; the agent,
 * which knows what it wants to show, picks one and resubmits a prepared view. */
export function needsTemplateResult(input:Pick<PublishInput,'requestId'|'intent'|'context'>){
 const text=`${input.intent??''}`.trim()||String(input.context??'').slice(0,400);
 const ranked=new LocalSearch(templateCatalog()).search(text).slice(0,3).map(row=>row.document);
 const candidates=(ranked.length?ranked:templateCatalog().filter(item=>['kanvas.template.list','kanvas.template.fact','kanvas.template.document'].includes(item.id))).map(item=>({id:item.id,template:item.id.slice('kanvas.template.'.length),description:item.summary,example:item.example?.()}));
 return {
  status:'needs_template' as const,requestId:input.requestId,published:false,
  reason:`No template was named and the content is ${String(input.context??'').trim().length} characters of prose, which matches no data shape. Nothing was put on the screen.`,
  candidates,
  nextAction:'Choose a template (one of these or any from the templates catalog), shape your content as its data, and resubmit with view:{template,data} and a new requestId. Keep the same target. A single short sentence (160 characters or fewer) is still shown as a fact.',
  ranking:'local lexical match of your intent against template descriptions; it suggests, you decide',
 };
}
