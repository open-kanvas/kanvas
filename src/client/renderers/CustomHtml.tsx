import {useLayoutEffect,useRef,useState} from 'react';
import './html.css';

/** Theme tokens for agent-authored HTML. The sandboxed frame cannot read the
 * page around it, so the current theme is copied in as CSS custom properties:
 * custom visuals follow the person's theme, light or dark, and accent. Only
 * plain colour and font values pass; nothing here can carry markup. */
const TOKEN_SOURCE:Record<string,string>={'--kanvas-bg':'--surface','--kanvas-fg':'--text','--kanvas-muted':'--muted','--kanvas-accent':'--accent','--kanvas-line':'--line','--kanvas-panel':'--panel'};

const safeColour=(value:string)=>/^[#a-zA-Z0-9(),.%\s/-]{1,80}$/.test(value)?value:undefined;

const safeFont=(value:string)=>/^[a-zA-Z0-9 ,"'_-]{1,300}$/.test(value)?value.replace(/"/g,"'"):undefined;

export function themeTokenCss(element:Element|null):string{
 if(!element||typeof getComputedStyle!=='function')return ':root{--kanvas-bg:#151515;--kanvas-fg:#fafafa;--kanvas-muted:#9a9a9a;--kanvas-accent:#dbdbdb;--kanvas-line:#3d3d3d;--kanvas-panel:#222222;--kanvas-font:system-ui,sans-serif}';
 const style=getComputedStyle(element),fallback:Record<string,string>={'--kanvas-bg':'#151515','--kanvas-fg':'#fafafa','--kanvas-muted':'#9a9a9a','--kanvas-accent':'#dbdbdb','--kanvas-line':'#3d3d3d','--kanvas-panel':'#222222'};
 const tokens=Object.entries(TOKEN_SOURCE).map(([token,source])=>`${token}:${safeColour(style.getPropertyValue(source).trim())??fallback[token]}`);
 tokens.push(`--kanvas-font:${safeFont(style.fontFamily)??'system-ui,sans-serif'}`);
 const dark=!element.closest('.theme-dark,.theme-light')?.classList.contains('theme-light');
 return `:root{${tokens.join(';')};color-scheme:${dark?'dark':'light'}}`;
}

export function CustomHtml({html,css,description,onReady}:{html:string;css?:string;description?:string;onReady?:()=>void}){
 const host=useRef<HTMLDivElement>(null),[tokens,setTokens]=useState(()=>themeTokenCss(null));
 useLayoutEffect(()=>{const element=host.current;if(!element)return;const read=()=>setTokens(themeTokenCss(element));read();
  const observer=new MutationObserver(read);
  for(let parent:Element|null=element;parent;parent=parent.parentElement)observer.observe(parent,{attributes:true,attributeFilter:['class','style']});
  return()=>observer.disconnect();
 },[]);
 const cleaned=(css??'').replace(/<\/style/gi,''),themed=/var\(\s*--kanvas-/.test(cleaned)||/var\(\s*--kanvas-/.test(html);
 // Views written before the tokens existed keep their fixed dark page; a view that uses a token follows the theme.
 const base=themed?'html,body{margin:0;min-height:100%;font-family:var(--kanvas-font);background:var(--kanvas-bg);color:var(--kanvas-fg)}':'html,body{margin:0;min-height:100%;font-family:Inter,system-ui;background:#151515;color:#fafafa}';
 const fontOrigin=typeof window==='undefined'?'':window.location.origin;
 const fontCss=fontOrigin?'@font-face{font-family:Inter;src:url("'+fontOrigin+'/fonts/Inter-Regular-Variable.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap}':'';
 const doc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src ${fontOrigin||"'none'"}; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontCss}${tokens}${base}*{box-sizing:border-box}${cleaned}</style></head><body>${html}</body></html>`;
 return <div ref={host} className="custom-visual-host" data-themed={themed||undefined}><iframe key={doc} className="custom-visual" title={description} sandbox="" referrerPolicy="no-referrer" srcDoc={doc} onLoad={event=>{const frame=event.currentTarget;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(frame.isConnected&&host.current?.contains(frame)&&host.current.clientHeight>0)onReady?.();}));}}/></div>;
}
