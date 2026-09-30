import { SaxesParser } from 'saxes';
import { RenderingError } from './errors.js';
const SVG='http://www.w3.org/2000/svg';
const tags=new Set('svg g path rect circle ellipse polygon polyline line text tspan title desc defs linearGradient radialGradient stop clipPath'.split(' '));
const attributes=new Set('id x y x1 x2 y1 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color font-family font-size font-weight font-style text-anchor dominant-baseline dx dy rotate letter-spacing word-spacing gradientUnits gradientTransform offset stop-color stop-opacity clip-path clip-rule'.split(' '));
const styles=new Set('fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing word-spacing stop-color stop-opacity clip-path clip-rule'.split(' '));
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const reject=():never=>{throw new RenderingError('INVALID_MEDIA','SVG must be a bounded, passive drawing: shapes, text and local gradients/clips only. Scripts, embedded/external content, DTDs, animation and unknown attributes are not supported.');};
/** Reconstruct a static namespace-aware subset, never serve unchecked XML. */
export function passiveSvg(bytes:Buffer){
  if(bytes.length>512*1024)reject();
  const text=(()=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return reject();}})();
  const parser=new SaxesParser({xmlns:true});
  const output:string[]=[],stack:string[]=[],ids=new Map<string,string>(),refs:{property:string;id:string}[]=[];
  let nodes=0,width=300,height=150,root=false;
  parser.on('error',reject);parser.on('doctype',reject);parser.on('processinginstruction',reject);
  parser.on('xmldecl',v=>{if(v.encoding&&!/^utf-?8$/i.test(v.encoding))reject();});
  parser.on('opentag',node=>{
    if(++nodes>4000||stack.length>=24||node.uri!==SVG||!tags.has(node.local)||node.local==='svg'&&root||!root&&node.local!=='svg')reject();
    const attrs:Record<string,string>={};
    for(const a of Object.values(node.attributes)){
      if(a.uri==='http://www.w3.org/2000/xmlns/'){if(a.name!=='xmlns'||a.value!==SVG)reject();continue;}
      if(a.uri||a.prefix)reject();
      if(a.local==='style'){
        for(const declaration of a.value.split(';').filter(x=>x.trim())){const i=declaration.indexOf(':');if(i<1)reject();const key=declaration.slice(0,i).trim(),value=declaration.slice(i+1).trim();if(!styles.has(key))reject();attrs[key]=value;}
      }else{if(!attributes.has(a.local))reject();attrs[a.local]=a.value;}
    }
    for(const [key,value] of Object.entries(attrs)){
      if(value.length>100000||/[\\\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||/expression|javascript|data:|https?:|@import|var\(|env\(/i.test(value))reject();
      if(/url\s*\(/i.test(value)){const match=/^url\(#([A-Za-z_][\w.-]{0,99})\)$/.exec(value);if(!match||!['fill','stroke','clip-path'].includes(key)||node.local==='clipPath'||stack.includes('clipPath'))reject();refs.push({property:key,id:match![1]});}
      if(key==='id'){if(!/^[A-Za-z_][\w.-]{0,99}$/.test(value)||ids.has(value))reject();ids.set(value,node.local);}
    }
    if(!root){
      root=true;const vb=attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
      if(vb&&(vb.length!==4||vb.some(x=>!Number.isFinite(x))||vb[2]<=0||vb[3]<=0))reject();
      const dimension=(v:string|undefined,fallback:number)=>{if(v===undefined||v==='100%')return fallback;if(!/^\d+(?:\.\d+)?(?:px)?$/.test(v))reject();return parseFloat(v);};
      width=dimension(attrs.width,vb?.[2]??300);height=dimension(attrs.height,vb?.[3]??150);
      if(width<=0||height<=0||width>20000||height>20000||width*height>64000000)reject();
      attrs.xmlns=SVG;
    }
    output.push(`<${node.local}${Object.entries(attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>`);stack.push(node.local);
  });
  parser.on('closetag',()=>{output.push(`</${stack.pop()}>`);});
  const content=(value:string)=>{if(!stack.length){if(value.trim())reject();return;}output.push(escape(value));};
  parser.on('text',content);parser.on('cdata',content);
  try{parser.write(text).close();}catch{reject();}
  if(!root||stack.length)reject();
  for(const ref of refs){const tag=ids.get(ref.id);if(ref.property==='clip-path'?tag!=='clipPath':tag!=='linearGradient'&&tag!=='radialGradient')reject();}
  return {bytes:Buffer.from(output.join('')),width,height};
}
