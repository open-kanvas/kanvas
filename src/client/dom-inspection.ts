import type {InspectionOptions} from '../shared/dom-inspection';
const properties=['display','position','box-sizing','width','height','min-width','max-width','min-height','max-height','padding','margin','gap','grid-template-columns','grid-template-rows','flex-direction','flex-wrap','align-items','justify-content','overflow','overflow-x','overflow-y','font-family','font-size','font-weight','line-height','letter-spacing','text-align','color','background-color','border','border-radius','opacity','visibility','transform','zoom','white-space'];
/** Read-only allowlisted serialization of the visible view, never the surrounding login/settings UI.
 * Values in form controls, URLs, data attributes, scripts and opaque frames are excluded. */
export function inspectDom(shell:HTMLElement,options:InspectionOptions&{requestId:string}){
 const stage=[...shell.querySelectorAll<HTMLElement>('.viewer-candidate,.viewer-last-good')].find(x=>{const b=x.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(x).visibility!=='hidden';});
 const surface=stage?.querySelector<HTMLElement>('.render-surface');let root:Element|null=surface??null,reason:string|undefined;
 if(options.selector&&root){try{root=root.matches(options.selector)?root:root.querySelector(options.selector);}catch{root=null;reason='Invalid CSS selector.';}}
 if(!root)reason??='No matching element in the current rendered view.';
 let truncated=false,budget=24000,css='',count=0;const elements:Array<{path:string;tag:string;rect:{x:number;y:number;width:number;height:number};overflow:boolean;hidden:boolean;offscreen:boolean;styles:Record<string,string>}>=[];
 const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const walk=(el:Element,depth:number,path:string):string=>{
  if(count>=options.maxNodes||depth>options.maxDepth||budget<300){truncated=true;return '';}
  if(['SCRIPT','STYLE','INPUT','TEXTAREA','SELECT','OPTION','FORM','IFRAME','OBJECT','EMBED','LINK','META'].includes(el.tagName.toUpperCase())){if(el.tagName.toUpperCase()==='IFRAME')reason='Sandboxed/cross-origin frame internals are unavailable; frame boundary only.';return '';}
  const index=count++,tag=el.tagName.toLowerCase(),computed=getComputedStyle(el),b=el.getBoundingClientRect(),styles:Record<string,string>={};
  for(const property of properties){const value=computed.getPropertyValue(property);if(value&&!/url\(|https?:|data:/i.test(value))styles[property]=value.slice(0,300);}
  const rule=`[data-inspect-node="${index}"]{${Object.entries(styles).map(([k,v])=>`${k}:${v}`).join(';')}}\n`;if(css.length+rule.length<=24000)css+=rule;else truncated=true;
  elements.push({path,tag,rect:{x:b.x,y:b.y,width:b.width,height:b.height},overflow:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1,hidden:computed.display==='none'||computed.visibility==='hidden'||computed.opacity==='0',offscreen:b.bottom<0||b.right<0||b.top>innerHeight||b.left>innerWidth,styles});
  const attributes=[...el.attributes].filter(a=>['viewBox','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','d','points','transform','fill','stroke','stroke-width','stroke-dasharray','text-anchor','dominant-baseline','colspan','rowspan','role','aria-label'].includes(a.name)&&a.value.length<=2000&&!/url\(|https?:|data:/i.test(a.value)).map(a=>` ${a.name}="${escape(a.value)}"`).join('');
  let html=`<${tag} data-inspect-node="${index}"${attributes}>`;budget-=html.length+tag.length+3;
  for(const [i,child] of [...el.childNodes].entries()){
   if(budget<300){truncated=true;break;}
   if(child instanceof Element)html+=walk(child,depth+1,`${path}/${child.tagName.toLowerCase()}[${i}]`.slice(0,300));
   else if(child.nodeType===Node.TEXT_NODE){const text=escape(child.textContent??'');if(text.length>budget){truncated=true;break;}html+=text;budget-=text.length;}
  }return html+`</${tag}>`;
 };
 const html=root?walk(root,0,'root'):'';
 return {requestId:options.requestId,html:html.slice(0,24000),css,truncated,reason,pixelRatio:devicePixelRatio,theme:surface?.className.includes('theme-dark')?'dark':'light',scale:surface?.style.zoom||'1',elements};
}
