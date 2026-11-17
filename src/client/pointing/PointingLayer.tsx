import { createElement,useEffect,useRef,useState,type RefObject } from 'react';
import type { DisplayRecord } from '../../shared/types';
import { POINTER_FADE_MS,type PointingAnchor,type PointingState,type PointingTarget } from '../../shared/pointing';
import { api,displayPath,errorMessage } from '../api';
import { anchorAt,anchorRects,chartAnchorShapes,describeTarget,pointAt } from './anchors';
import { navigationLeaf } from '../../shared/navigation';
import './pointing.css';
const empty:PointingState={enabled:false,revision:0,canPoint:false,pointers:[]};
/** Things a tap is meant for already: pointing never competes with them. */
const INTERACTIVE='button,a[href],input,select,textarea,summary,label,video,audio,[role="button"],[role="slider"],[role="tab"],[contenteditable="true"],.leaflet-control,.pointing-tools,[data-no-pointing]';
const TAP_MOVE=10,LONG_PRESS_MS=600,DOUBLE_TAP_MS=350,DOUBLE_TAP_MOVE=30;
interface Gesture {anchor:PointingAnchor;point?:{x:number;y:number};target?:PointingTarget}
/** Pointing is on without a button. A tap or click on the view leaves a mark for
 * everyone in the session that fades after a few seconds; a long press or a double
 * tap pins it until its author points somewhere else. Listening is passive: it
 * never prevents the tap from reaching the view. */
export function PointingLayer({shell,display,sessionId,ready}:{shell:RefObject<HTMLDivElement|null>;display:DisplayRecord;sessionId:string;ready:boolean}){
  const [state,setState]=useState(empty),[active,setActive]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now()),[,redraw]=useState(0);
  const current=useRef({display,state,active,ready}),skew=useRef(0);current.current={display,state,active,ready};
  const endpoint=`${displayPath(sessionId,display.id)}/pointing`;
  const stage=()=>[...(shell.current?.querySelectorAll<HTMLElement>('.viewer-candidate')??[])].find(el=>getComputedStyle(el).visibility!=='hidden'&&!el.closest('[aria-hidden="true"]'));
  const accept=(next:PointingState)=>{if(typeof next.serverNow==='number')skew.current=next.serverNow-Date.now();setState(next);setClock(Date.now());};
  // Marks arrive with the session's event stream; the slow timer only covers a missed event.
  useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>,controller=new AbortController(),inFlight=false,again=false;
    const load=async()=>{if(inFlight){again=true;return;}inFlight=true;clearTimeout(timer);try{const next=await api<PointingState>(endpoint,{signal:controller.signal});if(live){accept(next);if(!next.enabled||!next.canPoint){setActive(false);setError('');}}}catch{if(live){setState(empty);setActive(false);}}finally{inFlight=false;if(live){if(again){again=false;void load();}else timer=setTimeout(()=>void load(),8000);}}};
    const pointed=(e:Event)=>{const d=(e as CustomEvent<{sessionId?:string;displayId?:string}>).detail;if(d?.sessionId===sessionId&&(!d.displayId||d.displayId===display.id))void load();};
    const changed=(e:Event)=>{const d=(e as CustomEvent<{sessionId?:string;type?:string}>).detail;if(d?.type==='config'&&d.sessionId===sessionId)void load();};
    window.addEventListener('kanvas:pointing',pointed);window.addEventListener('kanvas:session-change',changed);void load();return()=>{live=false;controller.abort();clearTimeout(timer);window.removeEventListener('kanvas:pointing',pointed);window.removeEventListener('kanvas:session-change',changed);};},[endpoint,sessionId,display.id]);
  useEffect(()=>{setActive(false);setError('');},[ready,display.revision]);
  // Gestures are sent one after another: a double tap is a tap and then its pinned repeat, and the pin must land last.
  const sending=useRef<Promise<unknown>>(Promise.resolve());
  const publish=(gesture:Gesture|null,pinned=false)=>{const run=()=>deliver(gesture,pinned);sending.current=sending.current.then(run,run);return sending.current;};
  const deliver=async(gesture:Gesture|null,pinned=false)=>{const revision=current.current.display.revision;try{const next=await api<PointingState>(endpoint,{method:'PUT',body:gesture?{revision,anchor:gesture.anchor,pinned,...(gesture.point?{point:gesture.point}:{}),...(gesture.target?{target:gesture.target}:{})}:{revision,anchor:null}});if(revision===current.current.display.revision){accept(next);setError('');}}catch(e){if(revision===current.current.display.revision&&current.current.active)setError(errorMessage(e));}};
  const disable=async()=>{try{await api(`/api/sessions/${encodeURIComponent(sessionId)}/pointing`,{method:'POST',body:{enabled:false,expectedRevision:state.revision,confirm:true}});setState(empty);setActive(false);}catch(e){setError(errorMessage(e));}};
  const send=useRef(publish);send.current=publish;
  const read=(content:HTMLElement,x:number,y:number,touch:boolean):Gesture|undefined=>{
    const view=current.current.display.view;if(!view)return undefined;
    // Embedded pages, custom HTML and video expose no target: nothing is sent for them.
    const leaf=navigationLeaf(view);if(!leaf||['website','iframe','html','web','video'].includes(leaf.template))return undefined;
    const semantic=anchorAt(content,view,x,y,touch?24:0),point=pointAt(content,x,y);if(!semantic&&!point)return undefined;
    return {anchor:semantic??{kind:'point',...point!},...(point?{point}:{}),target:describeTarget(content,x,y,semantic)};
  };
  // Default: passive taps. Nothing is prevented or captured, so scrolling, links and controls behave as before.
  useEffect(()=>{
    if(active||!state.enabled||!state.canPoint||!ready)return;const root=shell.current;if(!root)return;
    let down:{x:number;y:number;at:number;id:number;touch:boolean;held:boolean}|undefined,hold:ReturnType<typeof setTimeout>|undefined,lastTap:{x:number;y:number;at:number}|undefined;
    const usable=(target:EventTarget|null)=>{const content=stage();return content&&target instanceof Element&&content.contains(target)&&!target.closest(INTERACTIVE)?content:undefined;};
    const cancel=()=>{clearTimeout(hold);down=undefined;};
    const onDown=(e:PointerEvent)=>{cancel();if(!e.isPrimary||e.button!==0||!usable(e.target))return;const touch=e.pointerType!=='mouse';down={x:e.clientX,y:e.clientY,at:Date.now(),id:e.pointerId,touch,held:false};
      hold=setTimeout(()=>{const content=stage();if(!down||!content)return;down.held=true;const gesture=read(content,down.x,down.y,down.touch);if(gesture)void send.current(gesture,true);},LONG_PRESS_MS);};
    const onMove=(e:PointerEvent)=>{if(down&&e.pointerId===down.id&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>TAP_MOVE)cancel();};
    const onUp=(e:PointerEvent)=>{const started=down;clearTimeout(hold);down=undefined;if(!started||e.pointerId!==started.id||started.held)return;const content=usable(e.target);if(!content)return;
      const now=Date.now(),double=!!lastTap&&now-lastTap.at<=DOUBLE_TAP_MS&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=DOUBLE_TAP_MOVE;lastTap=double?undefined:{x:e.clientX,y:e.clientY,at:now};
      const gesture=read(content,e.clientX,e.clientY,started.touch);if(gesture)void send.current(gesture,double);};
    root.addEventListener('pointerdown',onDown,{capture:true,passive:true});root.addEventListener('pointermove',onMove,{capture:true,passive:true});root.addEventListener('pointerup',onUp,{capture:true,passive:true});root.addEventListener('pointercancel',cancel,true);
    // Split-screen panes are their own documents: a tap inside one is reported as a place in the whole view, with the pane named.
    const paneCleanups:(()=>void)[]=[];
    const bindPanes=()=>{while(paneCleanups.length)paneCleanups.pop()!();const content=stage();if(!content)return;
      for(const frame of content.querySelectorAll<HTMLIFrameElement>('iframe.split-pane')){const doc=frame.contentDocument;if(!doc)continue;let start:{x:number;y:number;at:number;held:boolean}|undefined,timer:ReturnType<typeof setTimeout>|undefined,last:{x:number;y:number;at:number}|undefined;
        const gestureAt=(x:number,y:number):Gesture|undefined=>{const paneLeaf=current.current.display.view?navigationLeaf(current.current.display.view):null;if(paneLeaf?.template!=='split-screen')return undefined;const box=frame.getBoundingClientRect(),point=pointAt(content,box.left+x,box.top+y);if(!point)return undefined;const pane=frame.closest<HTMLElement>('[data-pane-id]')?.dataset.paneId;return {anchor:{kind:'point',...point},point,target:{...describeTarget(doc.body,x,y,undefined,doc),...(pane?{pane}:{})}};};
        const ok=(t:EventTarget|null)=>{const element=t as Element|null;return !!element&&typeof element.closest==='function'&&!element.closest(INTERACTIVE);};
        const pd=(e:PointerEvent)=>{clearTimeout(timer);start=undefined;if(!e.isPrimary||e.button!==0||!ok(e.target))return;start={x:e.clientX,y:e.clientY,at:Date.now(),held:false};timer=setTimeout(()=>{if(!start)return;start.held=true;const g=gestureAt(start.x,start.y);if(g)void send.current(g,true);},LONG_PRESS_MS);};
        const pm=(e:PointerEvent)=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>TAP_MOVE){clearTimeout(timer);start=undefined;}};
        const pu=(e:PointerEvent)=>{const s=start;clearTimeout(timer);start=undefined;if(!s||s.held||!ok(e.target))return;const now=Date.now(),double=!!last&&now-last.at<=DOUBLE_TAP_MS&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<=DOUBLE_TAP_MOVE;last=double?undefined:{x:e.clientX,y:e.clientY,at:now};const g=gestureAt(e.clientX,e.clientY);if(g)void send.current(g,double);};
        const pc=()=>{clearTimeout(timer);start=undefined;};
        doc.addEventListener('pointerdown',pd,{capture:true,passive:true});doc.addEventListener('pointermove',pm,{capture:true,passive:true});doc.addEventListener('pointerup',pu,{capture:true,passive:true});doc.addEventListener('pointercancel',pc,true);
        paneCleanups.push(()=>{clearTimeout(timer);doc.removeEventListener('pointerdown',pd,true);doc.removeEventListener('pointermove',pm,true);doc.removeEventListener('pointerup',pu,true);doc.removeEventListener('pointercancel',pc,true);});
      }};
    bindPanes();const content=stage(),observer=new MutationObserver(bindPanes);if(content)observer.observe(content,{subtree:true,childList:true});
    return()=>{cancel();observer.disconnect();while(paneCleanups.length)paneCleanups.pop()!();root.removeEventListener('pointerdown',onDown,true);root.removeEventListener('pointermove',onMove,true);root.removeEventListener('pointerup',onUp,true);root.removeEventListener('pointercancel',cancel,true);};
  },[active,state.enabled,state.canPoint,ready,shell,display.revision]);
  // Optional richer mode behind the on-screen tools (shown only when the session asks for them): exclusive gesture, drag a short span.
  useEffect(()=>{
    if(!active||!state.enabled||!state.canPoint||!ready)return;const root=shell.current;if(!root)return;let initial:PointingAnchor|undefined,started=false,pointerId:number|undefined;root.classList.add('semantic-pointing-active');
    const down=(e:PointerEvent)=>{const content=stage();if(!content||!(e.target instanceof Node)||!content.contains(e.target))return;if(!e.isPrimary)return;started=true;pointerId=e.pointerId;e.preventDefault();e.stopImmediatePropagation();initial=current.current.display.view?anchorAt(content,current.current.display.view,e.clientX,e.clientY,e.pointerType==='touch'?24:0):undefined;root.setPointerCapture?.(e.pointerId);};
    const up=(e:PointerEvent)=>{if(!started||e.pointerId!==pointerId)return;started=false;e.preventDefault();e.stopImmediatePropagation();const content=stage(),view=current.current.display.view;if(!content||!view)return;const end=anchorAt(content,view,e.clientX,e.clientY,e.pointerType==='touch'?24:0);let anchor=initial??end;if(anchor?.kind==='text'&&end?.kind==='text'&&anchor.key===end.key&&anchor.occurrence===end.occurrence)anchor={...anchor,start:Math.min(anchor.start,end.start),end:Math.max(anchor.end,end.end)};if(anchor&&!(anchor.kind==='text'&&anchor.end-anchor.start>2000))void send.current({anchor,point:pointAt(content,e.clientX,e.clientY),target:describeTarget(content,e.clientX,e.clientY,anchor)},true);else setError('Choose a word, short text span, data cell, chart mark or image.');};
    const touch=(e:TouchEvent)=>{const content=stage();if(content&&e.target instanceof Node&&content.contains(e.target)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}};
    const cancel=()=>{started=false;initial=undefined;pointerId=undefined;};
    const click=(e:MouseEvent)=>{const content=stage();if(content&&e.target instanceof Node&&content.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setActive(false);}};
    root.addEventListener('touchstart',touch,{capture:true,passive:false});root.addEventListener('touchend',touch,{capture:true,passive:false});root.addEventListener('pointercancel',cancel,true);root.addEventListener('pointerdown',down,true);root.addEventListener('pointerup',up,true);root.addEventListener('click',click,true);window.addEventListener('keydown',escape,true);
    return()=>{root.classList.remove('semantic-pointing-active');root.removeEventListener('touchstart',touch,true);root.removeEventListener('touchend',touch,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('click',click,true);window.removeEventListener('keydown',escape,true);};
  },[active,state.enabled,state.canPoint,ready,shell]);
  const visibleCount=state.pointers.length;
  useEffect(()=>{if(!state.enabled||!visibleCount)return;let frame=0;const paint=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>redraw(v=>v+1));};const root=stage(),resize=new ResizeObserver(paint),mutation=new MutationObserver(paint);if(root){resize.observe(root);mutation.observe(root,{subtree:true,childList:true,characterData:true});}window.addEventListener('scroll',paint,true);window.addEventListener('resize',paint);const timer=setInterval(()=>setClock(Date.now()),250);return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();window.removeEventListener('scroll',paint,true);window.removeEventListener('resize',paint);clearInterval(timer);};},[state.enabled,visibleCount,display.revision,ready]);
  if(!state.enabled||!ready||!display.view)return null;
  const root=stage(),serverClock=clock+skew.current,markers=state.pointers.filter(p=>p.revision===display.revision&&p.expiresAt>serverClock).map(p=>{let rects=root?anchorRects(root,display.view!,p.anchor):[];if(!rects.length&&root&&p.point)rects=anchorRects(root,display.view!,{kind:'point',...p.point});return {pointer:p,rects,shapes:root?chartAnchorShapes(root,p.anchor):[],spot:p.anchor.kind==='point'||(!!p.point&&root?anchorRects(root,display.view!,p.anchor).length===0:false)};});
  return <><div className="pointing-overlay" aria-hidden="true">{markers.map(({pointer,rects,shapes,spot},i)=>rects.length?<div key={`${pointer.id}:${pointer.createdAt}`} data-pointer-id={pointer.id} data-pointer-kind={pointer.anchor.kind} data-pointer-pinned={pointer.pinned} className={pointer.pinned?'semantic-pointer is-pinned':'semantic-pointer is-fading'} style={pointer.pinned?undefined:{animationDuration:`${POINTER_FADE_MS}ms`}}>{shapes.length?<svg className="semantic-pointer-shapes" width={window.innerWidth} height={window.innerHeight}>{shapes.map((shape,j)=>{const id=`pointer-shape-${i}-${j}`;return <g key={j}><defs><clipPath id={id}><rect x={shape.clip.left-3} y={shape.clip.top-3} width={shape.clip.width+6} height={shape.clip.height+6}/></clipPath></defs><g clipPath={`url(#${id})`}>{createElement(shape.tag,{...shape.attributes,transform:shape.transform,'data-pointer-shape':shape.tag,fill:shape.filled?`${pointer.color}40`:'none',stroke:pointer.color,strokeWidth:pointer.pinned?3:2.5,vectorEffect:'non-scaling-stroke'})}</g></g>;})}</svg>:rects.map((r,j)=><span key={j} className={`semantic-pointer-mark${spot?' is-spot':''}`} style={{...r,borderColor:pointer.color,backgroundColor:`${pointer.color}30`}}/>)}<span className="semantic-pointer-name" style={{left:Math.max(2,Math.min(window.innerWidth-150,rects[0].left)),top:Math.max(0,rects[0].top-24-(i%3)*5),backgroundColor:pointer.color}}>{pointer.name}</span></div>:null)}</div>{state.canPoint&&state.tools&&<div className={`pointing-tools ${active?'pointing-active':''}`}><button aria-label={active?'Stop pointing':'Point together'} aria-pressed={active} onClick={()=>{setActive(x=>!x);setError('');}}>{active?'Done pointing':'Point'}</button>{active&&<><button onClick={()=>void publish(null)}>Clear my pointer</button><>{state.canConfigure&&<button onClick={()=>void disable()}>Disable shared pointing</button>}</><span>Tap a word or mark · drag a short span</span></>}{error&&<span role="status">{error}</span>}</div>}</>;
}
