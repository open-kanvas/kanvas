import { pointingTextKey,type PointingAnchor,type PointingTarget } from '../../shared/pointing';
import type { ViewSpec } from '../../shared/types';
import { navigationLeaf } from '../../shared/navigation';
const units='p,li,h1,h2,h3,h4,h5,pre,blockquote,.number-value,.json-line,.code-line';
const visible=(el:Element)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden],[aria-hidden="true"]');};
function textUnits(root:Element){return [...root.querySelectorAll<HTMLElement>(units)].filter(el=>!el.querySelector(units)&&!el.closest('nav,button,textarea,input,.source-footer,.view-information,.table-content')&&visible(el));}
function textIdentity(root:Element,el:Element){const text=el.textContent??'',key=pointingTextKey(text),matches=textUnits(root).filter(x=>pointingTextKey(x.textContent??'')===key);return {text,key,occurrence:matches.indexOf(el as HTMLElement)};}
function caretAt(x:number,y:number){const doc=document as Document&{caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null;caretRangeFromPoint?:(x:number,y:number)=>Range|null};const pos=doc.caretPositionFromPoint?.(x,y);if(pos)return{node:pos.offsetNode,offset:pos.offset};const r=doc.caretRangeFromPoint?.(x,y);return r?{node:r.startContainer,offset:r.startOffset}:undefined;}
function charOffset(el:Element,node:Node,offset:number){try{const r=document.createRange();r.setStart(el,0);r.setEnd(node,offset);return r.toString().length;}catch{return undefined;}}
function wordRange(text:string,offset:number){offset=Math.min(Math.max(0,offset),Math.max(0,text.length-1));const segmenter=new Intl.Segmenter(undefined,{granularity:'word'});for(const s of segmenter.segment(text)){if(offset>=s.index&&offset<s.index+s.segment.length)return{start:s.index,end:s.index+s.segment.length};}return{start:offset,end:offset+1};}
function imageRect(image:HTMLImageElement){const r=image.getBoundingClientRect();if(!image.naturalWidth||!image.naturalHeight)return;const style=getComputedStyle(image),scale=style.objectFit==='cover'?Math.max(r.width/image.naturalWidth,r.height/image.naturalHeight):Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;return{left:r.left+(r.width-width)/2,top:r.top+(r.height-height)/2,width,height};}
/** Adapter reads existing semantic renderer output; it does not insert wrappers or mutate templates. */
export function anchorAt(root:HTMLElement,view:ViewSpec,x:number,y:number,tolerance=0):PointingAnchor|undefined{
  const leaf=navigationLeaf(view),target=document.elementFromPoint(x,y);if(!target||!root.contains(target)||!leaf)return;
  if(['website','iframe','html','web','video'].includes(leaf.template))return;
  if(leaf.template==='table'){const td=target.closest('td'),row=td?.closest<HTMLTableRowElement>('tr[data-source-row]');if(td&&row){const column=(leaf.data.columns as string[])[(td as HTMLTableCellElement).cellIndex];if(column)return{kind:'cell',row:Number(row.dataset.sourceRow),column};}}
  if(leaf.template==='chart'){
    let mark=target.closest<HTMLElement>('[data-chart-series][data-chart-x][data-chart-y]');
    // A series stroke represents its supplied observations. Select the nearest
    // real observation, never an interpolated or invented x/y pair.
    const line=target.closest<SVGElement>('[data-chart-line]');
    const svg=target.closest('svg'),plot=svg?.querySelector('[data-chart-snap-plot]')?.getBoundingClientRect();
    const inPlot=plot&&x>=plot.left&&x<=plot.right&&y>=plot.top&&y<=plot.bottom&&!target.closest('text,tspan');
    if(!mark&&(line||inPlot)){
      mark=[...root.querySelectorAll<HTMLElement>('[data-chart-series][data-chart-x][data-chart-y]')]
        .filter(el=>(!line||el.dataset.chartSeries===line.dataset.chartLine)&&el.closest('svg')===svg&&visible(el))
        .map(el=>{const r=el.getBoundingClientRect();return {el,distance:Math.hypot(r.left+r.width/2-x,r.top+r.height/2-y)};})
        .sort((a,b)=>a.distance-b.distance)[0]?.el??null;
    }
    // Touch contact is imprecise; select only a nearby supplied mark, never a
    // series path or an invented interpolated point. Screen pixels respect zoom.
    if(!mark&&tolerance>0){
      const ranked=[...root.querySelectorAll<HTMLElement>('[data-chart-series][data-chart-x][data-chart-y]')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {el,distance:Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom))};}).filter(v=>v.distance<=tolerance).sort((a,b)=>a.distance-b.distance);
      if(ranked.length&&(ranked.length===1||ranked[1].distance-ranked[0].distance>1))mark=ranked[0].el;
    }
    if(mark)return{kind:'chart',series:mark.dataset.chartSeries!,x:mark.dataset.chartX!,y:mark.dataset.chartY!};return;
  }
  if(['image','image-gallery'].includes(leaf.template)){const img=target.closest('img');if(img){const r=imageRect(img),index=Number(img.closest<HTMLElement>('[data-image-index]')?.dataset.imageIndex??0);if(r&&x>=r.left&&x<=r.left+r.width&&y>=r.top&&y<=r.top+r.height)return{kind:'image',index,x:(x-r.left)/r.width,y:(y-r.top)/r.height};}return;}
  const caret=caretAt(x,y);if(!caret||!root.contains(caret.node))return;
  const el=(caret.node.nodeType===Node.ELEMENT_NODE?caret.node as Element:caret.node.parentElement)?.closest(units);if(!el||!root.contains(el)||!textUnits(root).includes(el as HTMLElement))return;
  const identity=textIdentity(root,el),offset=charOffset(el,caret.node,caret.offset);if(identity.occurrence<0||offset===undefined||!identity.text.length)return;
  return {kind:'text',key:identity.key,occurrence:identity.occurrence,...wordRange(identity.text,offset)};
}
function textRange(el:Element,start:number,end:number){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),r=document.createRange();let at=0,started=false;for(let n=walker.nextNode();n;n=walker.nextNode()){const length=n.textContent?.length??0;if(!started&&start>=at&&start<at+length){r.setStart(n,start-at);started=true;}if(started&&end<=at+length){r.setEnd(n,Math.max(0,end-at));return r;}at+=length;}return undefined;}
function clipped(rect:DOMRect|{left:number;top:number;width:number;height:number},el:Element,root:HTMLElement){let l=rect.left,t=rect.top,r=l+rect.width,b=t+rect.height;for(let p:Element|null=el;p;p=p.parentElement){if(p===root||/auto|scroll|hidden|clip/.test(`${getComputedStyle(p).overflowX} ${getComputedStyle(p).overflowY}`)){const box=p.getBoundingClientRect();l=Math.max(l,box.left);t=Math.max(t,box.top);r=Math.min(r,box.right);b=Math.min(b,box.bottom);}if(p===root)break;}return r>l&&b>t?{left:l,top:t,width:r-l,height:b-t}:undefined;}
/** Coordinates as a fraction of the visible view, the fallback for anything without a semantic target. */
export function pointAt(root:HTMLElement,x:number,y:number){const r=root.getBoundingClientRect();if(!r.width||!r.height)return undefined;return {x:Math.min(1,Math.max(0,(x-r.left)/r.width)),y:Math.min(1,Math.max(0,(y-r.top)/r.height))};}
const squeeze=(value:string|null|undefined,max:number)=>{const text=(value??'').replace(/\s+/g,' ').trim();return text?text.length>max?`${text.slice(0,max-1)}…`:text:undefined;};
const roles:[string,string][]=[['h1,h2,h3,h4,h5','heading'],['td,th','table cell'],['li','list item'],['figure,img,picture','image'],['[data-chart-series]','chart mark'],['svg','graphic'],['blockquote','quote'],['pre,code,.code-line','code'],['p','paragraph']];
/** What the rendered view shows under a point: display text only, read from the DOM that is already on screen.
 * `doc` is the pane document inside a split screen. */
export function describeTarget(root:Element,x:number,y:number,anchor:PointingAnchor|undefined,doc:Document=document):PointingTarget|undefined{
  const hit=doc.elementFromPoint(x,y);if(!hit||!root.contains(hit))return undefined;
  const target:PointingTarget={};
  for(const [selector,role] of roles){if(hit.closest(selector)){target.role=role;break;}}
  if(anchor?.kind==='chart'){target.role='chart mark';target.label=squeeze(`${anchor.series?`${anchor.series}: `:''}${anchor.x} = ${anchor.y}`,200);return target;}
  if(anchor?.kind==='text'){const unit=hit.closest(units)??hit,text=unit.textContent??'';target.label=squeeze(text.slice(anchor.start,anchor.end),200);target.context=squeeze(text,300);return target;}
  const legend=hit.closest('.chart-legend,.advanced-chart-legend,.advanced-chart-key');
  if(legend){const item=hit.closest('li,button,.chart-legend > span');target.role='chart legend';target.label=squeeze(item?.textContent??[...legend.children].map(child=>child.textContent?.trim()).filter(Boolean).join(' · '),200);return target;}
  const labelled=hit.closest<HTMLElement>('[data-point-label],[aria-label],[title],[alt]');
  const own=hit.closest('td,th,li,h1,h2,h3,h4,h5,p,button,figcaption,blockquote,[data-chart-series],text,tspan')??hit;
  target.label=squeeze(labelled?.dataset.pointLabel,200)??squeeze((own.textContent??'').length<=400?own.textContent:undefined,200)??squeeze(labelled?.getAttribute('aria-label')??labelled?.getAttribute('alt')??labelled?.getAttribute('title'),200);
  const block=own.closest('section,article,li,tr,figure,[data-pane-id]');if(block&&block!==own)target.context=squeeze((block.textContent??'').length<=600?block.textContent:undefined,300);
  if(target.context===target.label)delete target.context;
  return target.role||target.label?target:undefined;
}
export function anchorRects(root:HTMLElement,view:ViewSpec,anchor:PointingAnchor){let el:Element|undefined,rects:({left:number;top:number;width:number;height:number}|DOMRect)[]=[];
  if(anchor.kind==='point'){const r=root.getBoundingClientRect();return r.width&&r.height?[{left:r.left+anchor.x*r.width-14,top:r.top+anchor.y*r.height-14,width:28,height:28}]:[];}
  if(anchor.kind==='text'){el=textUnits(root).filter(x=>pointingTextKey(x.textContent??'')===anchor.key)[anchor.occurrence];if(el){const r=textRange(el,anchor.start,anchor.end);if(r)rects=[...r.getClientRects()];}}
  else if(anchor.kind==='cell'){const columns=navigationLeaf(view)?.data.columns as string[]|undefined,index=columns?.indexOf(anchor.column)??-1;const row=[...root.querySelectorAll<HTMLElement>('tr[data-source-row]')].find(x=>Number(x.dataset.sourceRow)===anchor.row);if(index>=0)el=row?.children[index];if(el)rects=[el.getBoundingClientRect()];}
  else if(anchor.kind==='chart'){el=[...root.querySelectorAll<HTMLElement>('[data-chart-series][data-chart-x][data-chart-y]')].find(x=>x.dataset.chartSeries===anchor.series&&x.dataset.chartX===anchor.x&&x.dataset.chartY===anchor.y);if(el){const r=el.getBoundingClientRect();rects=[{left:r.left-3,top:r.top-3,width:Math.max(8,r.width+6),height:Math.max(8,r.height+6)}];}}
  else if(anchor.kind==='image'){const img=[...root.querySelectorAll<HTMLImageElement>('img')].find(x=>Number(x.closest<HTMLElement>('[data-image-index]')?.dataset.imageIndex??0)===anchor.index&&visible(x));if(img){el=img;const r=imageRect(img);if(r)rects=[{left:r.left+anchor.x*r.width-9,top:r.top+anchor.y*r.height-9,width:18,height:18}];}}
  if(!el||!visible(el))return[];return rects.map(r=>clipped(r,el!,root)).filter((r):r is NonNullable<typeof r>=>!!r);
}

export interface ChartAnchorShape {
  tag: 'path'|'rect'|'circle'|'ellipse'|'polygon'|'polyline'|'line';
  attributes: Record<string,string>;
  transform: string;
  filled: boolean;
  clip: {left:number;top:number;width:number;height:number};
}
const shapeAttributes: Record<ChartAnchorShape['tag'],string[]> = {
  path:['d','fill-rule'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],
  ellipse:['cx','cy','rx','ry'],polygon:['points'],polyline:['points'],line:['x1','y1','x2','y2'],
};
/** Copy geometry only from the existing, visible chart mark. No HTML, event
 * handlers, URLs or arbitrary SVG attributes enter the pointing overlay. */
export function chartAnchorShapes(root:HTMLElement,anchor:PointingAnchor):ChartAnchorShape[]{
  if(anchor.kind!=='chart')return[];
  const mark=[...root.querySelectorAll<SVGGraphicsElement>('[data-chart-series][data-chart-x][data-chart-y]')]
    .find(el=>el.dataset.chartSeries===anchor.series&&el.dataset.chartX===anchor.x&&el.dataset.chartY===anchor.y);
  if(!mark||!visible(mark))return[];
  const nodes=mark.tagName.toLowerCase()==='g'?[...mark.querySelectorAll<SVGGraphicsElement>('path,rect,circle,ellipse,polygon,polyline,line')]:[mark];
  return nodes.flatMap(el=>{
    const tag=el.tagName.toLowerCase() as ChartAnchorShape['tag'],allowed=shapeAttributes[tag];if(!allowed)return[];
    const style=getComputedStyle(el),painted=(value:string)=>value!=='none'&&value!=='transparent'&&!/^rgba\([^)]*,\s*0\)$/.test(value);
    if(Number(style.opacity)===0||(!painted(style.fill)&&!painted(style.stroke)))return[];
    const matrix=el.getScreenCTM(),clip=clipped(el.getBoundingClientRect(),el,root);
    if(!matrix||!clip||![matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].every(Number.isFinite))return[];
    const attributes:Record<string,string>={};for(const key of allowed){const value=el.getAttribute(key);if(value!==null)attributes[key==='fill-rule'?'fillRule':key]=value;}
    return [{tag,attributes,transform:`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f})`,filled:painted(style.fill)&&tag!=='line',clip}];
  });
}
