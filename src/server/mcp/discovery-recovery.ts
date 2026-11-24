import {operationCatalog, templateCatalog, minimalExample, type CatalogItem} from './discovery.js';
import {LocalSearch} from './local-search.js';
import type {TemplateId} from '../../shared/types.js';

/** Only public builtin contracts; no request values or account data in recovery. */
export function discoveryFallback(catalog: string, id: string) {
  return {tool:'kanvas_call', arguments:{operationId:'kanvas.discover', arguments:{catalog,action:'get',id}}};
}
let operationSearch: LocalSearch<CatalogItem> | undefined;
function closestOperations(query: string): CatalogItem[] {
  const items = operationCatalog();
  const clean = query.slice(0,180).replace(/^kanvas\.(template\.)?/, '').replace(/[._-]/g,' ');
  const ranked = (operationSearch ??= new LocalSearch(items)).search(clean).map(row=>row.document);
  // Curated near-misses are suggestions only, never executable aliases.
  const preferred = (/^(?:kanvas\.)?(?:view\.)?scroll$/.test(query) || query === 'kanvas.view.navigate') ? 'kanvas.navigation.control' : query === 'kanvas.feedback.create' ? 'kanvas.feedback.submit' : undefined;
  const exact = preferred ? items.find(item=>item.id===preferred) : undefined;
  return (exact ? [exact,...ranked.filter(item=>item.id!==exact.id)] : ranked).slice(0,3);
}
export function operationSuggestions(query: string) {
  return closestOperations(query).map(item=>{
    const detail=item.detail(), schema=detail.inputSchema as {properties?:object;required?:string[]};
    const example=(detail.examples as unknown[]).find(example=>Buffer.byteLength(JSON.stringify(example))<=1500);
    return {operationId:item.id,description:item.summary,allowedFields:Object.keys(schema.properties??{}).slice(0,80),requiredFields:schema.required??[],...(example?{example}:{}),get:discoveryFallback('tools',item.id)};
  });
}
export function templateSuggestions(ids: string[]) {
  return ids.slice(0,3).flatMap(id=>{
    const item=templateCatalog().find(item=>item.id==='kanvas.template.'+id);
    if(!item)return [];
    const example=minimalExample(id as TemplateId);
    return [{id:item.id,description:item.summary,...(Buffer.byteLength(JSON.stringify(example))<=1500?{example}:{}),get:discoveryFallback('templates',item.id)}];
  });
}
