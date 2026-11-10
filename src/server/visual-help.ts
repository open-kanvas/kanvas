import {z} from 'zod';
import {HELP_PAGES,HELP_TOPICS} from '../shared/help.js';
import type {ViewSpec} from '../shared/types.js';
import type {KanvasService} from './domain.js';
import type {AuthPrincipal} from './auth.js';
import {AppError} from './store.js';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const visualHelpSchema=z.strictObject({topic:z.enum(HELP_TOPICS),page:z.number().int().min(0).default(0)});
export const showHelpSchema=visualHelpSchema.extend({sessionId:id,displayIds:z.array(id).min(1).max(64),requestId:id});
export function visualHelp(raw:unknown){const a=visualHelpSchema.parse(raw),topic=HELP_PAGES[a.topic],pages:string[]=[];if(a.topic==='keyboard-shortcuts'){if(a.page!==0)throw new AppError('NOT_FOUND','Keyboard shortcuts are a single reference view; use page 0.',404);return {topic:a.topic,page:0,pageCount:1,view:{version:1,template:'keyboard-shortcuts',data:{}} as ViewSpec,reference:'/docs/keyboard-shortcuts'};}for(const step of topic.steps){let remaining=step;while(remaining.length>650){let cut=remaining.lastIndexOf('. ',650);if(cut<200)cut=remaining.lastIndexOf(' ',650);else cut++;pages.push(remaining.slice(0,cut));remaining=remaining.slice(cut).trimStart();}if(remaining)pages.push(remaining);}
 const diagramTopics=['orientation','submit','sharing'];const invitation=a.topic==='philosophy',hasDiagram=diagramTopics.includes(a.topic)||invitation,pageCount=pages.length+(hasDiagram?1:0);
 if(a.page>=pageCount)throw new AppError('NOT_FOUND','Help page is outside this topic.',404);
 // "What is this?" is answered in Kanvas's own style first: one line and three things to say.
 const view:ViewSpec=invitation&&a.page===0?{version:1,template:'welcome',data:{}} as ViewSpec:hasDiagram&&a.page===0?{version:1,template:'flowchart',title:topic.title,showTitle:true,data:{nodes:(a.topic==='sharing'?['Create invitation','Recipient requests access','Owner explicitly approves','Approved screen receives']:['Connect your agent','Approve a screen','Publish supplied content','Check actual delivery']).map((label,i)=>({id:String(i),label,shape:i===0||i===3?'terminal':'box'})),edges:[{from:'0',to:'1'},{from:'1',to:'2'},{from:'2',to:'3'}]}}:{version:1,template:'fact',title:topic.title,showTitle:true,data:{text:pages[a.page-(hasDiagram?1:0)],subtitle:`Kanvas Help · ${a.page+1} / ${pageCount}`}};
 return {topic:a.topic,page:a.page,pageCount,view,reference:`/docs/${a.topic}`};}
export async function showHelp(service:KanvasService,p:AuthPrincipal,raw:unknown){const a=showHelpSchema.parse(raw),result=visualHelp({topic:a.topic,page:a.page});return service.submit(p,{sessionId:a.sessionId,displayIds:a.displayIds,requestId:a.requestId,view:result.view});}
