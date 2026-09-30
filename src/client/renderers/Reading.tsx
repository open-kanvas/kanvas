import { useEffect, useRef, useState, type RefObject } from 'react';
import { READING_DEFAULTS } from '../../shared/reading';
import { useNavigation,normalizedScroll } from './Navigation';
import './reading.css';

export function useReading(scroll:RefObject<HTMLDivElement|null>,active:boolean){
  const navigation=useNavigation(),reading=navigation?.state.reading??READING_DEFAULTS,latest=useRef({reading,navigation});latest.current={reading,navigation};
  const [pixelsPerSecond,setPixelsPerSecond]=useState(0);
  useEffect(()=>{
    const el=scroll.current;if(!active||!el)return;
    const article=el.querySelector<HTMLElement>('.document-article');if(!article)return;
    const measure=()=>{const words=article.textContent?.trim().split(/\s+/u).filter(Boolean).length??0;setPixelsPerSecond(words?article.getBoundingClientRect().height/words*reading.wpm/60:0);};
    measure();const observer=new ResizeObserver(measure);observer.observe(article);return()=>observer.disconnect();
  },[active,reading.fontSize,reading.zoom,reading.wpm,scroll]);
  useEffect(()=>{
    const el=scroll.current;if(!active||!el)return;let frame=0,last=0,position=el.scrollTop;
    el.dataset.readingAuto=reading.playing?'true':'false';
    // Chromium quantizes scrollTop assignments. Accumulate fractional pixels
    // outside the DOM so a slow pace still advances at the measured WPM.
    const tick=(time:number)=>{if(last&&document.visibilityState==='visible'){position+=pixelsPerSecond*Math.min(.1,(time-last)/1000);el.scrollTop=position;if(el.scrollTop>=el.scrollHeight-el.clientHeight-1){latest.current.navigation?.send({action:'reading',command:'pause',position:normalizedScroll(el.scrollTop,el.scrollHeight-el.clientHeight),saveDefaults:false});return;}}last=time;frame=requestAnimationFrame(tick);};
    if(reading.playing)frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);el.dataset.readingAuto='false';};
  },[active,reading.playing,pixelsPerSecond,scroll]);
  const pause=()=>{const el=scroll.current;if(reading.playing&&el)navigation?.send({action:'reading',command:'pause',position:normalizedScroll(el.scrollTop,el.scrollHeight-el.clientHeight),saveDefaults:false});};
  return {reading,pixelsPerSecond,pause};
}
export function ReadingControls(){
  const navigation=useNavigation(),r=navigation?.state.reading??READING_DEFAULTS,[saving,setSaving]=useState(false);
  const host=useRef<HTMLElement>(null);
  const send=(patch:Parameters<NonNullable<typeof navigation>['send']>[0])=>{const scroll=host.current?.parentElement?.querySelector<HTMLElement>('.document-content');navigation?.send(patch.action==='reading'&&scroll?{...patch,position:normalizedScroll(scroll.scrollTop,scroll.scrollHeight-scroll.clientHeight)}:patch);};
  const defaults=navigation?.readingDefaults,confirmed=defaults?.fontSize===r.fontSize&&defaults?.wpm===r.wpm&&defaults?.zoom===r.zoom;
  return <nav ref={host} className="reading-controls" aria-label="Reading controls">
    <button disabled={!navigation?.canNavigate||r.fontSize<=16} aria-label="Smaller reading text" onClick={()=>send({action:'reading',command:'configure',fontSize:Math.max(16,r.fontSize-2),saveDefaults:false})}>A−</button><span aria-label="Reading font size">{r.fontSize}px</span><button disabled={!navigation?.canNavigate||r.fontSize>=40} aria-label="Larger reading text" onClick={()=>send({action:'reading',command:'configure',fontSize:Math.min(40,r.fontSize+2),saveDefaults:false})}>A+</button>
    <button disabled={!navigation?.canNavigate||r.wpm<=120} aria-label="Read slower" onClick={()=>send({action:'reading',command:'slower',saveDefaults:false})}>Slower</button><button disabled={!navigation?.canNavigate} aria-label={r.playing?'Pause reading':'Start reading'} onClick={()=>send({action:'reading',command:r.playing?'pause':'start',saveDefaults:false})}>{r.playing?'Pause':'Read ▶'}</button><span aria-label="Reading speed">{r.wpm} wpm</span><button disabled={!navigation?.canNavigate||r.wpm>=320} aria-label="Read faster" onClick={()=>send({action:'reading',command:'faster',saveDefaults:false})}>Faster</button>
    <button disabled={!navigation?.canNavigate||r.zoom<=.75} aria-label="Zoom reading out" onClick={()=>send({action:'reading',command:'configure',zoom:Math.max(.75,Math.round((r.zoom-.1)*100)/100),saveDefaults:false})}>−</button><span aria-label="Reading zoom">{Math.round(r.zoom*100)}%</span><button disabled={!navigation?.canNavigate||r.zoom>=1.75} aria-label="Zoom reading in" onClick={()=>send({action:'reading',command:'configure',zoom:Math.min(1.75,Math.round((r.zoom+.1)*100)/100),saveDefaults:false})}>+</button>
    {navigation?.canSaveReadingDefaults&&<button aria-label="Save personal reading defaults" onClick={()=>{setSaving(true);send({action:'reading',command:'configure',fontSize:r.fontSize,wpm:r.wpm,zoom:r.zoom,saveDefaults:true});}}>Save my defaults</button>}{saving&&<span role="status">{confirmed?'Reading defaults saved.':'Saving reading defaults…'}</span>}
  </nav>;
}
