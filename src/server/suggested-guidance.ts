import {z} from 'zod';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {hash} from './auth.js';
import {AppError,now} from './store.js';
import type {Definition} from './mcp/canonical.js';
import {GUIDANCE_BOUNDARY} from './agent-guidance.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),revision=z.number().int().nonnegative();
const list=z.strictObject({afterId:id.optional(),limit:z.number().int().min(1).max(20).default(5)});
const save=z.strictObject({suggestionId:id,name:z.string().trim().min(1).max(100),text:z.string().trim().min(1).max(5000),expectedRevision:revision.optional(),requestId:id});
const remove=save.pick({suggestionId:true,expectedRevision:true,requestId:true});
const copy=remove.extend({promptId:id,name:z.string().trim().min(1).max(100).optional()});
export const suggestedGuidanceTools: Definition[] = [
    {
        name: "kanvas.guidance.suggestions.list", schema: list, readOnly: true, description: 'Browse the separate global suggested guidance catalog, including exact text/revision. Not your private library. Browsing never saves or activates guidance; import explicitly, then activate separately.',
        domain: "guidance-suggestions",
        requiredScope: "read",
        discovery: {"group":"guidance","hint":"Browse optional global suggestions, separate from my personal prompts.","examples":[{}]},
        searchAliases: ["kanvas.guidance.suggestions.list"]
    },
    {
        name: "kanvas.guidance.suggestions.save", schema: save, idempotent: true, description: 'Service administrators only: create or edit global suggested guidance. Omit expectedRevision to use current state; explicit0 requires a new suggestion, and explicit stale revisions fail. Editorial content only; never extract private prompts. Existing personal copies remain unchanged.',
        domain: "guidance-suggestions",
        requiredScope: "publish",
        discovery: {"group":"guidance","hint":"Service admin curates global suggestions; never extracts private prompts.","examples":[{"suggestionId":"concise","name":"Concise","text":"Keep commentary brief.","expectedRevision":0,"requestId":"suggestion-save"}]},
        searchAliases: ["kanvas.guidance.suggestions.save"]
    },
    {
        name: "kanvas.guidance.suggestions.delete", schema: remove, idempotent: true, description: 'Service administrators only: remove a global suggestion. Omit expectedRevision to use current state; an explicit revision guards the removal. Existing imported personal copies and active guidance remain unchanged.',
        domain: "guidance-suggestions",
        requiredScope: "publish",
        discovery: {"group":"guidance","hint":"Service admin removes a suggestion; personal copies remain.","examples":[{"suggestionId":"concise","expectedRevision":1,"requestId":"suggestion-delete"}]},
        searchAliases: ["kanvas.guidance.suggestions.delete"]
    },
    {
        name: "kanvas.guidance.suggestions.import", schema: copy, idempotent: true, description: "Explicitly copy a selected global suggestion into a NEW private promptId. Omit expectedRevision to copy current content; provide the previewed revision to reject intervening edits. Never overwrites a personal prompt or activates guidance. The copy is independently editable; activate separately with kanvas_call with operationId:\"kanvas.guidance.library.activate\" and arguments:{\u2026}.",
        domain: "guidance-suggestions",
        requiredScope: "publish",
        discovery: {"group":"guidance","hint":"Explicitly copy a suggestion to a new personal prompt, without activation.","examples":[{"suggestionId":"passive","expectedRevision":1,"promptId":"my-passive","requestId":"suggestion-import"}]},
        searchAliases: ["kanvas.guidance.suggestions.import"]
    },
];
interface Suggestion {id:string;name:string;text:string;revision:number;updatedAt?:string;deleted?:boolean}
/** Fresh editorial defaults. No account records are consulted or extracted. */
const seeds:Suggestion[]=[
 {id:'muted-agent',name:'Muted Agent',text:'Keep spoken and written commentary minimal. When I explicitly request a Kanvas action, perform the authorized action quietly; explain blockers that need my input.',revision:1},
 {id:'passive',name:'Passive',text:'Use Kanvas only when I explicitly ask for a visual or screen action. Otherwise answer in the conversation without changing displays.',revision:1},
 {id:'proactive',name:'Proactive',text:'Offer or show a useful visual when it supports my current request and the source and destination are authorized. Keep it relevant; do not treat this preference as permission for unrelated actions.',revision:1},
 {id:'reduced-verbosity',name:'Reduced verbosity',text:'Keep explanations brief and focused on the result. Omit repeated tool narration; include essential uncertainty, blockers, and next steps.',revision:1},
 {id:'proactive-concise',name:'Proactive with reduced verbosity',text:'Use helpful visuals for my current request within authorized sources and destinations. Keep commentary concise and avoid narrating routine tool calls. Explain meaningful uncertainty or blockers.',revision:1},
];
export class SuggestedGuidance {
 constructor(private service:KanvasService){}
 private get store(){return this.service.store;}
 private async records(){const rows=new Map(seeds.map(x=>[x.id,x]));for(const row of await this.store.list<Suggestion>('guidance-suggestion'))rows.set(row.id,row);return rows;}
 async run(p:AuthPrincipal,raw:unknown,kind:'list'|'save'|'delete'|'import'){
  await this.service.fullAccount(p,kind==='list'?'read':'publish');
  await this.service.accounts.account(p,kind!=='list');
  if(kind==='list'){
   const a=list.parse(raw),all=[...(await this.records()).values()].filter(x=>!x.deleted).sort((a,b)=>a.id.localeCompare(b.id));
   let offset=0;if(a.afterId){const i=all.findIndex(x=>x.id===a.afterId);if(i<0)throw new AppError('INVALID_CURSOR','List suggestions again without a cursor.');offset=i+1;}
   const suggestions=all.slice(offset,offset+a.limit).map(({id,...x})=>({suggestionId:id,...x}));
   return {catalog:'global-suggestions',suggestions,...(offset+suggestions.length<all.length?{nextCursor:suggestions.at(-1)!.suggestionId}:{}),note:'Optional starting points, not personal prompts or active guidance. Import explicitly; activate separately.',boundary:GUIDANCE_BOUNDARY};
  }
  if(kind!=='import'&&!await this.service.accounts.isServiceAdmin(p))throw new AppError('FORBIDDEN','Global guidance management requires a configured service administrator.',403);
  const a=(kind==='save'?save:kind==='delete'?remove:copy).parse(raw);
  return this.store.atomic(()=>this.store.transaction(async()=>{
   const requestKey=hash(p.userId+':suggestions:'+a.requestId),digest=hash(JSON.stringify({kind,a})),prior=await this.store.get<{digest:string;result:unknown}>('guidance-request',requestKey);
   if(prior){if(prior.digest!==digest)throw new AppError('REQUEST_ID_CONFLICT','Request ID already used.',409);return prior.result;}
   const saved=(await this.records()).get(a.suggestionId);
   this.service.assertRevision(a.expectedRevision,saved?.revision??0);
   if(kind!=='save'&&(!saved||saved.deleted))throw new AppError('NOT_FOUND','Suggestion not found.',404);
   let result:unknown;
   if(kind==='import'){
    const input=a as z.infer<typeof copy>;
    const prompt=await this.service.guidance.library(p,{promptId:input.promptId,name:input.name??saved!.name,text:saved!.text,expectedRevision:0,requestId:'suggestion-'+requestKey},'save');
    result={prompt,source:{suggestionId:a.suggestionId,revision:saved!.revision},activated:false};
   }else{
    const input=a as z.infer<typeof save>,next:Suggestion={id:a.suggestionId,name:kind==='save'?input.name:saved!.name,text:kind==='save'?input.text:'',revision:(saved?.revision??0)+1,updatedAt:now(),...(kind==='delete'?{deleted:true}:{})};
    await this.store.put('guidance-suggestion',next);result={suggestionId:next.id,name:next.name,text:next.text,revision:next.revision,deleted:!!next.deleted};
   }
   await this.store.put('guidance-request',{id:requestKey,digest,result});return result;
  }));
 }
}

