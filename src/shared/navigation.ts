import {projectSelection} from './selection.js';
import {z} from 'zod';
import {readingActionSchema,READING_DEFAULTS,READING_SPEEDS,type ReadingState} from './reading.js';
import {logEntries,type LogData} from './task-views.js';
import type {ViewSpec} from './types.js';

const unit = z.number().finite().min(0).max(1);
export const navigationActionSchema = z.discriminatedUnion('action', [
  readingActionSchema,
  z.object({action:z.literal('zoom'),scale:z.number().min(0.25).max(3).optional(),direction:z.enum(['in','out','reset']).optional()}).strict().refine(x=>(x.scale!==undefined)!==Boolean(x.direction),'Supply scale or direction.'),
  z.object({ action: z.literal('page'), direction: z.enum(['next','previous']).optional(), page: z.number().int().min(1).max(100000).optional() }).strict().refine(x => Boolean(x.direction) !== (x.page !== undefined), 'Supply direction or a one-based page, not both.'),
  z.object({ action: z.literal('scroll'), x: unit.optional(), y: unit.optional(), deltaX: z.number().min(-1).max(1).optional(), deltaY: z.number().min(-1).max(1).optional() }).strict().refine(x => [x.x,x.y,x.deltaX,x.deltaY].some(v=>v!==undefined), 'Supply a normalized position or delta.'),
  z.object({ action: z.literal('search'), query: z.string().max(500) }).strict(),
  z.object({ action: z.literal('match'), direction: z.enum(['next','previous']) }).strict(),
  z.object({ action: z.literal('highlight'), text: z.string().max(500) }).strict(),
  z.object({ action: z.literal('focus'), text: z.string().min(1).max(500).optional(), region: z.object({x:unit,y:unit,width:unit.positive(),height:unit.positive()}).strict().refine(x=>x.x+x.width<=1&&x.y+x.height<=1).optional(), zoom: z.number().min(1).max(4).default(1) }).strict().refine(x=>Boolean(x.text)!==Boolean(x.region), 'Supply text or a normalized region.'),
  z.object({ action:z.literal('gotoLine'),line:z.number().int().min(1).max(1000000),panelId:z.string().min(1).max(128).optional(),side:z.enum(['before','after']).optional() }).strict(),
  z.object({action:z.literal('selectDay'),day:z.union([z.literal('all'),z.number().int().min(1).max(31)])}).strict(),
  z.object({ action:z.literal('fit') }).strict(),
  z.object({ action: z.literal('reset') }).strict(),
]);
export type NavigationAction = z.infer<typeof navigationActionSchema>;
export interface NavigationState { /** Diagram shown whole in each window, whatever its authored textScale. */ fit?:boolean; scale?:number; line?:number; panelId?:string; side?:'before'|'after'; day?:number|'all'; reading?:ReadingState; page:number; query:string; highlight:string; match:number; scroll:{x:number;y:number}; focus?:{text?:string;region?:{x:number;y:number;width:number;height:number};zoom:number} }
export const initialNavigation = (view?:ViewSpec|null):NavigationState => ({page:(view?.template==='iframe'||view?.template==='website')?Number(view.data.index??0):view?.template==='tool-inventory'?Math.max(0,((view.data.groups??[]) as {name:string}[]).findIndex(g=>g.name===view.data.activeGroup)):0,query:'',highlight:'',match:0,scroll:{x:0,y:0},...(view?.template==='itinerary'&&view.data.layout==='map'?{day:'all' as const}:{})});
export function navigationLeaf(view:ViewSpec|null):ViewSpec|null { return view?.template==='presentation' ? (view.data.slides as ViewSpec[])[Number(view.data.index??0)]??null : view; }
const text = (value:unknown):string => value === null || value === undefined ? '' : typeof value === 'object' ? Object.values(value).map(text).join(' ') : String(value);
export function navigationCapabilities(view:ViewSpec|null,state?:NavigationState) {
  const rawLeaf=navigationLeaf(view),leaf=rawLeaf?projectSelection(rawLeaf).view:null, template=leaf?.template, data=leaf?.data??{}, query=(state?.query??'').trim().toLocaleLowerCase();
  const gallery=template==='image-gallery'&&data.mode==='carousel';
  const paged=template==='menu-board'||template==='sing-along'||gallery||template==='table'||template==='list'||(template==='iframe'||template==='website')||template==='log'||template==='inbox'||template==='tool-inventory';
  const items=(template==='menu-board'?(data.sections as {items:unknown[]}[]??[]).flatMap(s=>s.items):template==='sing-along'?data.pages:gallery?data.images:template==='table'?data.rows:template==='list'?data.items:(template==='iframe'||template==='website')?data.pages:template==='log'?logEntries(data as LogData):template==='inbox'?data.items:template==='tool-inventory'?data.groups:[]) as unknown[]|undefined;
  const matching=(items??[]).filter(item=>!query||gallery||(template==='iframe'||template==='website')||template==='log'||template==='tool-inventory'||text(item).toLocaleLowerCase().includes(query)).length;
  const pageSize=template==='sing-along'||gallery||(template==='iframe'||template==='website')||template==='tool-inventory'?1:Number(data.pageSize??(template==='list'||template==='inbox'?1000:template==='log'?100:12));
  const opaque=(template==='iframe'||template==='website')||template==='web'||template==='html'||template==='device-preview'||template==='video';
  return {zoom:Boolean(leaf),template:template??null,gotoLine:template==='code'&&['code','diff','split'].includes(String(data.kind)),codePanels:template==='code'&&data.kind==='split'?((data.panels??[]) as {id:string}[]).map(p=>p.id):undefined,selectDay:template==='itinerary'&&data.layout==='map',dayCount:template==='itinerary'?((data.days??[]) as unknown[]).length:undefined,fit:['org-chart','flowchart','network','architecture'].includes(template??''),reading:template==='markdown'||template==='document'&&data.layout!=='excerpt',paging:paged,pageCount:paged?Math.max(1,Math.ceil(matching/pageSize)):1,matchingItems:paged?matching:undefined,search:!opaque&&Boolean(leaf),highlight:!opaque&&Boolean(leaf),focus:Boolean(leaf)&&!opaque,scroll:Boolean(leaf)&&!opaque,remotePageDom:false,note:opaque?'Cross-origin/frame content cannot be inspected, searched, scrolled or highlighted by KANVAS. Page selection is available for website collections.':'Logical pageCount/matchingItems do not describe viewport fit. Read per-viewer viewport measurements; absent means unknown. Execute explicit navigation requests.'};
}
export function navigate(view:ViewSpec|null, prior:NavigationState, action:NavigationAction):NavigationState {
  const next=structuredClone(prior), caps=navigationCapabilities(view,prior);
  const need=(yes:boolean)=>{if(!yes)throw new Error(`This view does not support ${action.action}. ${caps.note}`);};
  // Fit holds until the person or agent deliberately moves or enlarges the diagram again.
  if(['zoom','scroll','focus'].includes(action.action))delete next.fit;
  switch(action.action){
    case 'zoom':need(caps.zoom);next.scale=action.scale??(action.direction==='reset'?1:Math.max(.25,Math.min(3,Math.round((next.scale??1)*(action.direction==='in'?1.2:1/1.2)*100)/100)));break;
    case 'reading':{need(caps.reading);const r={...READING_DEFAULTS,...next.reading};if(action.command==='start'||action.command==='resume')r.playing=true;if(action.command==='pause')r.playing=false;if(action.command==='faster')r.wpm=READING_SPEEDS.find(v=>v>r.wpm)??320;if(action.command==='slower')r.wpm=[...READING_SPEEDS].reverse().find(v=>v<r.wpm)??120;if(action.fontSize!==undefined)r.fontSize=action.fontSize;if(action.wpm!==undefined)r.wpm=action.wpm;if(action.zoom!==undefined)r.zoom=action.zoom;if(action.position!==undefined)next.scroll.y=action.position;next.reading=r;break;}
    case 'fit':need(caps.fit);return {...initialNavigation(navigationLeaf(view)),fit:true};
    case 'gotoLine':{need(caps.gotoLine);const leaf=navigationLeaf(view)!,panels=(leaf.data.panels??[]) as Record<string,unknown>[],source=leaf.data.kind==='split'?(action.panelId?panels.find(p=>p.id===action.panelId):panels[0]):leaf.data;if(!source)throw new Error('Choose a supplied panelId.');if(action.panelId&&leaf.data.kind!=='split')throw new Error('panelId requires a split code view.');const start=Number(source.startLine??1),text=String(source.kind==='diff'?source[action.side??'after']:source.code??''),count=source.kind==='diff'&&!text?0:text.split('\n').length;if(action.line<start||action.line>=start+count)throw new Error(`Line must be between ${start} and ${start+count-1}.`);next.line=action.line;next.panelId=leaf.data.kind==='split'?String(source.id):undefined;next.side=action.side??'after';next.focus=undefined;next.query='';break;}
    case 'selectDay':{need(caps.selectDay);if(action.day!=='all'&&action.day>(caps.dayCount??0))throw new Error(`Day must be between 1 and ${caps.dayCount}, or all.`);next.day=action.day;next.scroll={x:0,y:0};next.focus=undefined;break;}
    case 'reset':return initialNavigation(navigationLeaf(view));
    case 'page':{need(caps.paging);const page=action.page===undefined?next.page+(action.direction==='next'?1:-1):action.page-1;if(page<0||page>=caps.pageCount)throw new Error(`Page must be between 1 and ${caps.pageCount}.`);next.page=page;next.scroll={x:0,y:0};break;}
    case 'search':need(caps.search);next.line=undefined;next.query=action.query;next.page=0;next.match=0;next.focus=undefined;break;
    case 'match':need(caps.search);next.match=Math.max(0,next.match+(action.direction==='next'?1:-1));break;
    case 'highlight':need(caps.highlight);next.highlight=action.text;break;
    case 'scroll':need(caps.scroll);next.scroll={x:Math.max(0,Math.min(1,action.x??next.scroll.x+(action.deltaX??0))),y:Math.max(0,Math.min(1,action.y??next.scroll.y+(action.deltaY??0)))};break;
    case 'focus':{need(caps.focus);const leaf=navigationLeaf(view);if(action.text&&leaf?.template==='code'&&leaf.data.kind==='code'&&!String(leaf.data.code??'').toLocaleLowerCase().includes(action.text.toLocaleLowerCase()))throw new Error('Focus text is not present in this source.');if(action.text&&caps.fit&&!((leaf?.data.nodes??[]) as {label:string;detail?:string}[]).some(n=>(n.label+' '+(n.detail??'')).toLocaleLowerCase().includes(action.text!.toLocaleLowerCase())))throw new Error('Focus text is not present in a diagram node.');next.line=undefined;next.focus={text:action.text,region:action.region,zoom:action.zoom};break;}
  }
  return next;
}
const slot=z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const navigationInputSchema = z.object({ sessionId: slot, displayId: slot, requestId: slot, expectedRevision: z.number().int().nonnegative().optional(), viewerId: slot.optional().describe("Receiving device-window from kanvas_call with operationId:\"kanvas.viewers.read\" and arguments:{\u2026}. Required for zoom unless exactly one viewer is active; zoom is always per window even in shared/presenter mode."), navigation: navigationActionSchema }).strict();
export const navigationReadSchema=z.object({sessionId:slot,displayId:slot,viewerId:slot.optional()}).strict();
export const pinSaveSchema=z.object({sessionId:slot,displayId:slot,requestId:slot,label:z.string().trim().min(1).max(120),revision:z.number().int().nonnegative().optional()}).strict();
export const pinRecallSchema=z.object({sessionId:slot,displayId:slot,requestId:slot,pinId:slot,expectedRevision:z.number().int().nonnegative().optional()}).strict();
export const pinRemoveSchema=z.object({sessionId:slot,displayId:slot,pinId:slot}).strict();
export interface NavigationSnapshot { action?:NavigationAction['action'];  canSaveReadingDefaults?:boolean; readingDefaults?:ReadingState; revision:number; version:number; commandId?:string; state:NavigationState; mode:'independent'|'presenter'|'shared'; viewerId?:string; canNavigate:boolean; capabilities:ReturnType<typeof navigationCapabilities> }
