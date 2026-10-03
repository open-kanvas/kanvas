import { isSafeUrl } from '../../shared/urls';
/** No selectors, style sheets, URLs, CSS variables, positioning or executable content.
 * Each accepted declaration is scoped to the inert copied element. */
export function safePopupStyle(property:string,value:string):boolean {
  if(!/^[a-z0-9#.,%() \-]+$/i.test(value)||/url|var|expression|image|attr|calc|import/i.test(value))return false;
  if(['color','background-color','border-color'].includes(property))return /^(#[a-f0-9]{3,8}|[a-z]{3,20}|(?:rgb|hsl)a?\([0-9.,% ]+\))$/i.test(value);
  if(['padding','padding-top','padding-bottom','padding-left','padding-right','margin','margin-top','margin-bottom','gap','border-radius','width','max-width','height','max-height','font-size','border-width'].includes(property))return value.split(/\s+/).every(v=>/^(?:0|(?:[0-9]+(?:\.[0-9]+)?)(?:px|em|rem|%))$/.test(v)&&parseFloat(v)<= (v.endsWith('em')?4:320));
  const enums:Record<string,string[]>= {'display':['block','inline','inline-block','flex','grid'],'flex-direction':['row','column'],'flex-wrap':['wrap','nowrap'],'align-items':['start','end','center','stretch'],'justify-content':['start','end','center','space-between'],'font-weight':['normal','bold','400','500','600','700'],'font-style':['normal','italic'],'text-align':['left','center','right'],'white-space':['normal','pre-wrap'],'overflow-wrap':['anywhere','break-word'],'border-style':['solid','dashed','dotted'],'text-decoration':['none','underline'],'line-height':['1','1.2','1.4','1.5','1.6','2']};
  return enums[property]?.includes(value)??false;
}
/** Parse inertly, copy only passive formatting; never attach caller DOM. */
export function safeMapPopup(html: string): HTMLElement {
  const source = document.createElement('template'), root = document.createElement('div');source.innerHTML=html;root.className='safe-map-content';
  const allowed = new Set(['DIV','SPAN','H1','H2','H3','H4','H5','H6','SECTION','ARTICLE','HEADER','FOOTER','DL','DT','DD','TABLE','THEAD','TBODY','TR','TH','TD','BLOCKQUOTE','PRE','HR','B','STRONG','EM','I','P','BR','UL','OL','LI','A','CODE']);
  const copy = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.textContent ?? '')); return; }
    if (!(node instanceof Element) || ['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE','IMG','VIDEO','AUDIO','LINK','META','BASE','FORM','INPUT','BUTTON','EMBED'].includes(node.tagName)) return;
    const target = document.createElement(allowed.has(node.tagName)?node.tagName.toLowerCase():'span');
    if (target instanceof HTMLAnchorElement) { const href = node.getAttribute('href'); if (href && isSafeUrl(href)) { target.href=href; target.target='_blank';target.rel='noopener noreferrer'; } }
    for(const declaration of (node.getAttribute('style')??'').split(';')){const colon=declaration.indexOf(':');if(colon<0)continue;const property=declaration.slice(0,colon).trim().toLowerCase(),value=declaration.slice(colon+1).trim();if(safePopupStyle(property,value))target.style.setProperty(property,value);}
    for (const child of node.childNodes) copy(child,target); parent.appendChild(target);
  };
  for (const child of source.content.childNodes) copy(child,root); return root;
}
