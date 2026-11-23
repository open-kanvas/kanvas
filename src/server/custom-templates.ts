import {SaxesParser} from 'saxes';
import {z} from 'zod';
import {customDefinitionSchema,bindTemplate,type CustomTemplate} from '../shared/custom-templates.js';
import {AppError,id,now,required} from './store.js';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import type {Definition} from './mcp/canonical.js';
import type {CatalogItem} from './mcp/discovery.js';
import type {ViewSpec} from '../shared/types.js';
const key=z.string().min(1).max(128);
export const customTools: Definition[] = [
    {
        name: "kanvas.account.templates.create", schema: customDefinitionSchema, description: 'Create a private account custom template: name, bounded JSON schema (object/properties/required; arrays/items, string/number/integer/boolean), static well-formed HTML and CSS. Bind escaped fields with {{field}} and repeat arrays of objects with named fields: schema items:{type:"object",properties:{text:{type:"string"}}}, HTML {{#each items}}<li>{{text}}</li>{{/each}}. For primitive arrays use {{#each points}}<li>{{value}}</li>{{/each}}; implicit {{this}} is not supported. No scripts, event handlers, external resources, URLs, raw bindings or CSS escapes/imports. No editing/versioning: create a replacement then explicitly delete the old ID.',
        domain: "template",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Store a private reusable definition; creating it does not publish a view.","examples":[{"name":"My headline","schema":{"type":"object","properties":{"headline":{"type":"string"}},"required":["headline"]},"html":"<h1>{{headline}}</h1>","css":"h1 {font-size: 64px;}"}]},
        searchAliases: ["kanvas.account.templates.create"]
    },
    {
        name: "kanvas.account.templates.list", schema: z.object({ query: z.string().max(200).optional() }).strict(), readOnly: true, description: 'List/search only your own reusable custom templates. Also included alongside built-ins in kanvas_discover templates search/list.',
        domain: "template",
        requiredScope: "read",
        discovery: {"group":"content","hint":"List/search your authorized private template definitions without publishing.","examples":[{"query":"headline"}]},
        searchAliases: ["kanvas.account.templates.list"]
    },
    {
        name: "kanvas.account.templates.delete", schema: z.object({ templateId: key }).strict(), destructive: true, description: 'Delete your custom template definition. Published snapshots remain visible; new publication or data updates using the deleted definition are unavailable.',
        domain: "template",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Delete only your private definition; published snapshots remain.","examples":[{"templateId":"template-id"}]},
        searchAliases: ["kanvas.account.templates.delete"]
    },
    {
        name: "kanvas.account.templates.publish", schema: z.object({ templateId: key, values: z.record(z.string(), z.unknown()), sessionId: key, displayIds: z.array(key).min(1).max(20), requestId: key }).strict(), description: 'Publish your private template by ID using schema-validated values. Publish complete validated values with kanvas.account.templates.publish. For existing views, inspect the supported template contract and kanvas.display.edit/kanvas.view.patch schemas before choosing a narrow update. Name is separate from built-in templateHint. Creating a definition does not publish it.', idempotent: true,
        domain: "template",
        requiredScope: "publish",
        discovery: {"group":"content","hint":"Explicitly publish validated values through your private definition to selected authorized displays.","examples":[{"templateId":"template-id","values":{"headline":"Hello"},"sessionId":"session-id","displayIds":["display-id"]}]},
        searchAliases: ["kanvas.account.templates.publish"]
    },
];
const tags=new Set('div span p h1 h2 h3 h4 h5 h6 article section header footer main aside strong b em i u small br hr ul ol li dl dt dd table thead tbody tfoot tr th td caption blockquote pre code figure figcaption time'.split(' '));
const attrs=new Set(['class','id','title','role','aria-label','colspan','rowspan','scope','datetime']);
export function validateStatic(html:string,css:string){
 if(/{{|}}/.test(css))throw new AppError('INVALID_ARGUMENT','CSS is static; put data bindings in HTML.');
 if(/[\\<>]|\/\*|@|(?:url|image-set|-webkit-image-set|image|src)\s*\(|expression\s*\(|-moz-binding|behavior\s*:/i.test(css))throw new AppError('INVALID_ARGUMENT','CSS must be static: no URLs, imports, escapes, comments, markup or executable properties.');
 // XML parsing provides strict nesting and entity decoding; a deliberately small
 // safe HTML subset avoids browser error-recovery/parser differential hazards.
 const parser=new SaxesParser({xmlns:false});
 parser.on('doctype',()=>{throw new AppError('INVALID_ARGUMENT','Doctypes are not allowed.');});
 parser.on('processinginstruction',()=>{throw new AppError('INVALID_ARGUMENT','Processing instructions are not allowed.');});
 parser.on('opentag',tag=>{if(tag.name!=='template-root'&&!tags.has(tag.name.toLowerCase()))throw new AppError('INVALID_ARGUMENT','Unsupported HTML element. Use static text/layout elements only.');for(const [name,value]of Object.entries(tag.attributes)){if(!attrs.has(name.toLowerCase())||/[<>]/.test(String(value)))throw new AppError('INVALID_ARGUMENT','Unsupported HTML attribute. No scripts, styles, links or resource attributes.');}});
 parser.on('error',()=>{throw new AppError('INVALID_ARGUMENT','Use well-formed static HTML; close elements and escape literal ampersands.');});
 try{parser.write('<template-root>'+html+'</template-root>').close();}catch(e){if(e instanceof AppError)throw e;throw new AppError('INVALID_ARGUMENT','Invalid static HTML.');}
}
export function validateCustomSchema(schema:Record<string,unknown>,depth=0):void{
 if(depth>8)throw new AppError('INVALID_ARGUMENT','Schema nesting is limited to 8.');
 if(!['object','array','string','number','integer','boolean'].includes(String(schema.type)))throw new AppError('INVALID_ARGUMENT','Schema type must be object, array, string, number, integer or boolean.');
 const allowed=new Set(['type','properties','required','items','additionalProperties','description','title','enum','maxLength','minLength','minimum','maximum','minItems','maxItems']);
 if(Object.keys(schema).some(k=>!allowed.has(k)))throw new AppError('INVALID_ARGUMENT','Unsupported schema keyword. References and executable formats are not supported.');
 if(schema.type==='object'){const props=schema.properties;if(!props||typeof props!=='object'||Array.isArray(props)||Object.keys(props).length>60)throw new AppError('INVALID_ARGUMENT','Objects require up to 60 properties.');for(const [name,child]of Object.entries(props)){if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||['constructor','prototype','__proto__'].includes(name))throw new AppError('INVALID_ARGUMENT','Use simple safe field names.');if(!child||typeof child!=='object'||Array.isArray(child))throw new AppError('INVALID_ARGUMENT','Each property needs a schema.');validateCustomSchema(child as Record<string,unknown>,depth+1);}if(schema.required!==undefined&&(!Array.isArray(schema.required)||schema.required.some(x=>typeof x!=='string'||!Object.hasOwn(props,x))))throw new AppError('INVALID_ARGUMENT','required must name declared properties.');if(schema.additionalProperties!==undefined&&schema.additionalProperties!==false)throw new AppError('INVALID_ARGUMENT','Only declared properties are allowed.');}
 if(schema.type==='array'){if(!schema.items||typeof schema.items!=='object'||Array.isArray(schema.items))throw new AppError('INVALID_ARGUMENT','Arrays require items schema.');validateCustomSchema(schema.items as Record<string,unknown>,depth+1);}
 for(const field of ['maxLength','minLength','minimum','maximum','minItems','maxItems'])if(schema[field]!==undefined&&(typeof schema[field]!=='number'||!Number.isFinite(schema[field])))throw new AppError('INVALID_ARGUMENT','Schema bounds must be finite numbers.');
 if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||schema.enum.length>100||schema.enum.some(x=>!['string','number','boolean'].includes(typeof x))))throw new AppError('INVALID_ARGUMENT','enum must contain at most 100 scalar values.');
}
export function validateBindings(html:string,schema:Record<string,any>):void{
 const scopes:Record<string,any>[]=[schema],tokens=/{{\s*(#each\s+([A-Za-z][A-Za-z0-9_]*)|\/each|([A-Za-z][A-Za-z0-9_]*))\s*}}/g;
 let position=0,match:RegExpExecArray|null;
 while((match=tokens.exec(html))){
  if(/{{|}}/.test(html.slice(position,match.index)))throw new AppError('INVALID_ARGUMENT','Unsupported binding syntax.');
  position=tokens.lastIndex;
  if(match[1]==='/each'){if(scopes.length===1)throw new AppError('INVALID_ARGUMENT','Unexpected closing each binding.');scopes.pop();continue;}
  const name=match[2]??match[3],properties=scopes.at(-1)!.properties??{},field=Object.hasOwn(properties,name)?properties[name]:undefined;
  if(!field)throw new AppError('INVALID_ARGUMENT','Every binding must name a declared field in its current schema scope.');
  if(match[2]){if(field.type!=='array'||scopes.length>8)throw new AppError('INVALID_ARGUMENT','each requires an array and at most eight nested scopes.');scopes.push(field.items.type==='object'?field.items:{type:'object',properties:{value:field.items}});}
  else if(['object','array'].includes(field.type))throw new AppError('INVALID_ARGUMENT','Bind scalar fields; use each for arrays.');
 }
 if(scopes.length!==1||/{{|}}/.test(html.slice(position)))throw new AppError('INVALID_ARGUMENT','Use balanced {{field}} and {{#each items}}…{{/each}} bindings.');
}
export function validateCustomValues(schema:Record<string,any>,v:unknown,depth=0):void{
 const fail=()=>{throw new AppError('INVALID_ARGUMENT','Values do not match the custom template schema. Read its discovery detail.');};
 if(depth>8)fail();
 if(schema.enum&&!schema.enum.includes(v))fail();
 if(schema.type==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return fail();const o=v as Record<string,unknown>,props=schema.properties;if(Object.keys(o).some(k=>!Object.hasOwn(props,k))||(schema.required??[]).some((k:string)=>!Object.hasOwn(o,k)))fail();for(const [k,value]of Object.entries(o))validateCustomValues(props[k],value,depth+1);}
 else if(schema.type==='array'){if(!Array.isArray(v)||v.length>Math.min(500,schema.maxItems??500)||v.length<(schema.minItems??0))return fail();for(const x of v)validateCustomValues(schema.items,x,depth+1);}
 else if(schema.type==='string'){if(typeof v!=='string'||v.length>Math.min(10000,schema.maxLength??10000)||v.length<(schema.minLength??0))fail();}
 else if(schema.type==='boolean'){if(typeof v!=='boolean')fail();}
 else if(typeof v!=='number'||!Number.isFinite(v)||(schema.type==='integer'&&!Number.isInteger(v))||v<(schema.minimum??-Infinity)||v>(schema.maximum??Infinity))fail();
}
export class CustomTemplates {
    constructor(private s: KanvasService) { }
    async list(p: AuthPrincipal, query = '') { await this.s.accounts.account(p); return (await this.s.store.list<CustomTemplate>('custom-template', p.userId)).filter(t => t.ownerId === p.userId && t.name.toLowerCase().includes(query.toLowerCase())); }
    async get(p: AuthPrincipal, key: string) { await this.s.accounts.account(p); const t = await this.s.store.get<CustomTemplate>('custom-template', key); if (!t || t.ownerId !== p.userId)
        throw new AppError('NOT_FOUND', 'Custom template is unavailable.', 404); return t; }
    async resolve(p: AuthPrincipal, view: ViewSpec) { if (view.template !== 'account-template')
        return view; const t = await this.get(p, String(view.data.templateId)); validateCustomValues(t.schema, view.data.values); let html: string; try {
        html = bindTemplate(t.html, view.data.values as Record<string, unknown>);
    }
    catch {
        throw new AppError('INVALID_ARGUMENT', 'Invalid or oversized template binding. Use declared fields and balanced each sections.');
    } validateStatic(html, t.css); return { ...view, data: { templateId: t.id, values: view.data.values, html, css: t.css } }; }
    async execute(p: AuthPrincipal, name: string, a: any) {
        if (name === "kanvas.account.templates.list")
            return { templates: (await this.list(p, a.query)).map(t => ({ id: t.id, name: t.name, createdAt: t.createdAt, discoveryId: 'account.template.' + t.id })) };
        await this.s.accounts.account(p, true);
        if (name === "kanvas.account.templates.create")
            return this.s.store.atomic(async () => { const input = customDefinitionSchema.parse(a); validateCustomSchema(input.schema); if (input.schema.type !== 'object')
                throw new AppError('INVALID_ARGUMENT', 'Root schema must be object.'); validateStatic(input.html, input.css); validateBindings(input.html, input.schema); if ((await this.list(p)).length >= 100)
                throw new AppError('LIMIT_REACHED', 'Maximum 100 private templates.', 429); const t = { ...input, id: id(), ownerId: p.userId, sessionId: p.userId, createdAt: now() }; await this.s.store.put('custom-template', t); return { id: t.id, name: t.name, createdAt: t.createdAt, discoveryId: 'account.template.' + t.id }; });
        if (name === "kanvas.account.templates.delete") {
            const t = await this.get(p, a.templateId);
            await this.s.store.delete('custom-template', t.id);
            return { deleted: true, templateId: t.id };
        }
        const view = await this.resolve(p, { version: 1, template: 'account-template', data: { templateId: a.templateId, values: a.values } });
        return this.s.submit(p, { sessionId: a.sessionId, displayIds: a.displayIds, requestId: a.requestId, view });
    }
    async catalog(p: AuthPrincipal): Promise<CatalogItem[]> { try {
        await this.s.accounts.account(p);
    }
    catch (error) {
        if (error instanceof AppError && error.code === 'FORBIDDEN')
            return [];
        throw error;
    } const templates = await this.list(p); return templates.map(t => ({ id: 'account.template.' + t.id, provider: 'account', revision: t.createdAt, title: t.name, summary: 'Private reusable template: ' + t.name, keywords: t.name, text: t.name + ' ' + JSON.stringify(t.schema), detail: () => ({ id: 'account.template.' + t.id, templateId: t.id, name: t.name, schema: t.schema, operationId: 'kanvas.account.templates.publish', arguments: { templateId: t.id, values: {}, sessionId: 'SESSION', displayIds: ['DISPLAY'] }, update: 'Publish complete validated values with kanvas.account.templates.publish; inspect kanvas.display.edit/kanvas.view.patch and supported template contracts before a narrow existing-view update. Private definition; publishing deliberately shares rendered content with that display.' }) })); }
}
