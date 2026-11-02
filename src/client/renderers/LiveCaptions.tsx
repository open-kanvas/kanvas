import { useEffect,useRef,useState } from 'react';
import { sequenceStatus,type CaptionData,type Playback,type TimedItem } from '../../shared/local-sequence';
import './live-captions.css';
/** Server anchor + monotonic elapsed avoids client wall-clock changes. Visibility catch-up is deliberate. */
export function useSequence(items:TimedItem[],playback:Playback,serverNow?:string,preview=false) {
  const anchor=useRef<{source?:string;server:number;mono:number}|null>(null);
  if(!anchor.current||anchor.current.source!==serverNow) anchor.current={source:serverNow,server:serverNow&&Number.isFinite(Date.parse(serverNow))?Date.parse(serverNow):Date.now(),mono:performance.now()};
  const [,tick]=useState(0);
  useEffect(()=>{if(preview)return;const update=()=>tick(v=>v+1);const timer=window.setInterval(update,100);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[preview]);
  return sequenceStatus(items,preview?{state:'paused',positionMs:0}:playback,anchor.current.server+performance.now()-anchor.current.mono);
}
export function LiveCaptions({data,serverNow,preview}:{data:CaptionData;serverNow?:string;preview?:boolean}) {
  const status=useSequence(data.chunks,data.playback,serverNow,preview);
  const visible=data.chunks.slice(Math.max(0,status.index-data.previousChunks),status.index+1);
  return <section className="live-captions" lang={data.language} aria-label="Live captions" data-phase={status.phase} data-active-id={status.activeId??''}>
    <div className="caption-window" aria-live="off">{visible.map(chunk=><p key={chunk.id} className={chunk.id===status.activeId?'caption-current':'caption-recent'}>{chunk.text}</p>)}</div>
  </section>;
}
