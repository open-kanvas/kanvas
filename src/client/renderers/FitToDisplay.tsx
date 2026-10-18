import {useLayoutEffect,useRef,type ReactNode} from 'react';
import './fit-to-display.css';
/** Measure actual laid-out content (including loaded images/fonts), never omit rows.
 * Scaling has no capacity cliff: extreme content stays complete but may be tiny. */
export function FitToDisplay({children}:{children:ReactNode}){
 const outer=useRef<HTMLDivElement>(null),inner=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const box=outer.current!,content=inner.current!;let frame=0,alive=true;
  const fit=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   if(!alive||!box.clientWidth||!box.clientHeight)return;
   const sign=content.querySelector('.venue-sign');box.style.background=sign?getComputedStyle(sign).backgroundColor:'';
   content.style.width=box.clientWidth+'px';content.style.minHeight=box.clientHeight+'px';
   const w=Math.max(box.clientWidth,content.scrollWidth),h=Math.max(box.clientHeight,content.scrollHeight);
   const scale=Math.min(1,box.clientWidth/w,box.clientHeight/h);
   content.style.transform=`scale(${scale})`;content.style.left=(box.clientWidth-w*scale)/2+'px';content.style.top=(box.clientHeight-h*scale)/2+'px';box.dataset.fitScale=String(scale);
  });};
  const resize=new ResizeObserver(fit);resize.observe(box);resize.observe(content);
  const mutation=new MutationObserver(fit);mutation.observe(content,{childList:true,subtree:true,characterData:true});
  content.addEventListener('load',fit,true);document.fonts?.ready.then(()=>{if(alive)fit();});fit();
  return()=>{alive=false;cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();content.removeEventListener('load',fit,true);};
 },[children]);
 return <div className="fit-display" ref={outer}><div className="fit-display-content" ref={inner}>{children}</div></div>;
}
