import { readingDefaults } from '../../shared/reading';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { initialNavigation, navigate, navigationCapabilities, navigationLeaf, type NavigationAction, type NavigationSnapshot, type NavigationState } from '../../shared/navigation';
import type { SessionConfig, ViewSpec } from '../../shared/types';
import { ApiError, api, displayPath, errorMessage, requestId } from '../api';

import { viewerTabId } from '../window-identity';
export { viewerTabId } from '../window-identity';
interface Browsing {registerInternal:(handler:(direction:-1|1)=>boolean)=>()=>void;readingDefaults?:NavigationState['reading'];canSaveReadingDefaults?:boolean;hasPosition:boolean;state:NavigationState;canNavigate:boolean;send:(action:NavigationAction)=>void;seedPage:(page:number)=>void}
const NavigationContext=createContext<Browsing|null>(null);
export const useNavigation=()=>useContext(NavigationContext);

/** A template consumes a gesture only while it has an internal next position.
 * Nested renderers register before containers, so the most granular handler wins. */
export function useInternalNavigation(handler: (direction: -1 | 1) => boolean) {
  const navigation = useNavigation(), current = useRef(handler); current.current = handler;
  useLayoutEffect(() => navigation?.registerInternal(direction => current.current(direction)), [navigation?.registerInternal]);
}

// Firefox fractional endpoints and WebKit rubber-band overscroll can exceed
// the nominal extent. Browser physics must never become an invalid API input.
export const normalizedScroll=(position:number,extent:number)=>Number.isFinite(position)&&Number.isFinite(extent)?Math.max(0,Math.min(1,position/Math.max(1,extent))):0;

export function scrollElement(root:HTMLElement){
  const candidates=[...root.querySelectorAll<HTMLElement>('[data-navigation-scroll],.work-scroll,.table-scroll,.document-content,.code-lines,.transcription-lines,.translation-content,.advanced-chart-body,.product-comparison-scroll,.plain-list-scroll,.render-body')];
  // Pick the real overflowing reader, never its clipped outer layout box.
  const overflows=(x:HTMLElement)=>{if(!x.clientHeight||!x.clientWidth)return false;const css=getComputedStyle(x);return (x.scrollHeight>x.clientHeight+1&&['auto','scroll'].includes(css.overflowY))||(x.scrollWidth>x.clientWidth+1&&['auto','scroll'].includes(css.overflowX));};
  return candidates.find(overflows)??[...root.querySelectorAll<HTMLElement>('*')].find(overflows)??candidates.find(x=>x.hasAttribute('data-navigation-scroll')&&x.clientHeight>0)??root;
}
function textRanges(root:HTMLElement,query:string){
  const ranges:Range[]=[];if(!query)return ranges;
  for(const target of root.querySelectorAll('[data-navigation-target],.code-line')){const value=target.getAttribute('data-navigation-target')??target.querySelector('.code-text')?.textContent??target.textContent??'';if(value.toLocaleLowerCase().includes(query.toLocaleLowerCase())){const range=document.createRange();range.selectNodeContents(target);ranges.push(range);}}
  if(ranges.length)return ranges;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null;
  while((node=walker.nextNode())&&ranges.length<1000){const parent=node.parentElement;if(!parent||parent.closest('button,input,textarea,select,script,style,[aria-hidden="true"]'))continue;const value=node.textContent??'',lower=value.toLocaleLowerCase(),needle=query.toLocaleLowerCase();let start=0,index:number;while((index=lower.indexOf(needle,start))>=0&&index<value.length&&ranges.length<1000){const range=document.createRange();range.setStart(node,index);range.setEnd(node,Math.min(value.length,index+needle.length));ranges.push(range);start=index+needle.length;}}
  return ranges;
}
export type PublicNavigation=Pick<NavigationSnapshot,'revision'|'version'|'state'>;
export interface PositionalNavigation{step:(direction:-1|1)=>void;home:()=>void;end:()=>void;overview:()=>void}
export function BrowsingProvider({view,sessionId,displayId,revision,config,enabled,children,local=false,initialPage=0,positional,remoteNavigation}:{view:ViewSpec;sessionId:string;displayId:string;revision:number;config?:SessionConfig;enabled:boolean;children:ReactNode;local?:boolean;initialPage?:number;positional?:PositionalNavigation;remoteNavigation?:PublicNavigation}){
  const initial=():NavigationState=>remoteNavigation?.revision===revision?structuredClone(remoteNavigation.state):({...initialNavigation(navigationLeaf(view)),...(local?{page:initialPage<0?navigationCapabilities(view).pageCount-1:initialPage}:{}),reading:readingDefaults(config??{})}),[state,setState]=useState<NavigationState>(initial),[snapshot,setSnapshot]=useState<NavigationSnapshot|null>(null),[error,setError]=useState('');
  const handlers=useRef(new Set<(direction:-1|1)=>boolean>());
  const [registerInternal]=useState(()=>(handler:(direction:-1|1)=>boolean)=>{handlers.current.add(handler);return()=>{handlers.current.delete(handler);};});
  const root=useRef<HTMLDivElement>(null),latest=useRef({view,revision,state,enabled});latest.current={view,revision,state,enabled};
  const anchor=useRef<{text:string;offset:number;top:number;left:number}|null>(null);
  useLayoutEffect(()=>{
    const el=root.current;if(!el)return;
    const capture=()=>{const scroller=scrollElement(el);if(scroller.dataset.readingAuto==='true')return;const box=scroller.getBoundingClientRect();const block=[...scroller.querySelectorAll<HTMLElement>('p,li,h1,h2,h3,h4,pre,tr,[data-code-line]')].find(node=>node.getBoundingClientRect().bottom>box.top+2&&node.getBoundingClientRect().top<box.bottom&&Boolean(node.textContent?.trim()));anchor.current={text:block?.textContent?.trim()??'',offset:block?block.getBoundingClientRect().top-box.top:0,top:scroller.scrollTop,left:scroller.scrollLeft};};
    el.addEventListener('scroll',capture,true);return()=>el.removeEventListener('scroll',capture,true);
  },[]);
  useLayoutEffect(()=>{
    const el=root.current,saved=anchor.current;if(!el||!saved)return;
    const scroller=scrollElement(el);if(scroller.dataset.readingAuto==='true')return;
    const matches=saved.text?[...scroller.querySelectorAll<HTMLElement>('p,li,h1,h2,h3,h4,pre,tr,[data-code-line]')].filter(node=>node.textContent?.trim()===saved.text):[];
    scroller.scrollTop=matches.length===1?scroller.scrollTop+matches[0].getBoundingClientRect().top-scroller.getBoundingClientRect().top-saved.offset:saved.top;
    scroller.scrollLeft=saved.left;
  },[revision]);
  const version=useRef(-1),busy=useRef(false),pendingRevision=useRef<number|null>(null),suppress=useRef(0),lastCommand=useRef(''),inputEpoch=useRef(0),nativeScrollPending=useRef(false);
  const queue=useRef<{action:NavigationAction;id:string;revision:number}[]>([]),lastFocus=useRef(''),lastScroll=useRef('');
  const viewKey=JSON.stringify(view);
  const [tabId]=useState(viewerTabId);
  const mode=local?'independent':config?.syncMode??'independent',canNavigate=enabled&&(mode!=='presenter'||snapshot?.canNavigate===true);
  useLayoutEffect(()=>{version.current=-1;lastCommand.current='';queue.current=[];pendingRevision.current=null;setState(previous=>({...previous,page:Math.min(previous.page,Math.max(0,navigationCapabilities(view,previous).pageCount-1)),...(previous.reading?{reading:{...previous.reading,playing:false}}:{})}));setSnapshot(null);setError('');},[revision,sessionId,displayId]);
  useLayoutEffect(()=>{
    if(!local||!remoteNavigation||remoteNavigation.revision!==revision||version.current===remoteNavigation.version)return;
    version.current=remoteNavigation.version;const next=structuredClone(remoteNavigation.state);latest.current.state=next;setState(next);lastScroll.current='';lastFocus.current='';
  },[local,remoteNavigation?.version,remoteNavigation?.revision,revision,sessionId,displayId]);
  useEffect(()=>{
    if(!enabled||local)return;let live=true;const poll=async()=>{if(busy.current||nativeScrollPending.current)return;const expected=latest.current.revision,epoch=inputEpoch.current;try{const result=await api<NavigationSnapshot>(`${displayPath(sessionId,displayId)}/navigation?tabId=${encodeURIComponent(tabId)}`);if(!live||latest.current.revision!==expected||result.revision!==expected||inputEpoch.current!==epoch||busy.current||nativeScrollPending.current)return;setSnapshot(result);if(result.version!==version.current){version.current=result.version;setState(result.state);}}catch{/* The session connection UI owns disconnect/revocation. */}};
    void poll();const timer=setInterval(()=>void poll(),900);return()=>{live=false;clearInterval(timer);};
  },[enabled,revision,sessionId,displayId,tabId,mode,config?.presenterViewerId]);
  const send=(action:NavigationAction)=>{
    if(!canNavigate)return;
    inputEpoch.current++;
    let next:NavigationState;try{next=navigate(latest.current.view,latest.current.state,action);}catch(e){setError(errorMessage(e));return;}
    if(local){latest.current.state=next;setState(next);setError('');return;}
    if(queue.current.length>=40){setError('Wait for the queued navigation to finish.');return;}
    if((snapshot?.version??0)===0&&!busy.current&&latest.current.state.page!==initialNavigation(navigationLeaf(view)).page&&!['page','search','reset'].includes(action.action))queue.current.push({action:{action:'page',page:latest.current.state.page+1},id:requestId(),revision});
    latest.current.state=next;pendingRevision.current=revision;setState(next);setError('');queue.current.push({action,id:requestId(),revision});
    if(busy.current)return;busy.current=true;
    void (async()=>{try{while(queue.current.length){const item=queue.current.shift()!;if(item.revision!==latest.current.revision||!latest.current.enabled)continue;
      try{
        const result=await api<NavigationSnapshot>(`${displayPath(sessionId,displayId)}/navigation`,{method:'POST',body:{tabId,requestId:item.id,expectedRevision:item.revision,navigation:item.action}});
        if(item.revision!==latest.current.revision||result.revision!==latest.current.revision||!latest.current.enabled)continue;
        version.current=result.version;setSnapshot(result);if(!queue.current.length&&!nativeScrollPending.current){latest.current.state=result.state;setState(result.state);}
      }catch(e){
        // Pointer/scroll input belongs to the view on which it occurred. A new
        // publication may win while the request is in flight; never replay that
        // input on its replacement or attach the old view's error to the new one.
        if(item.revision!==latest.current.revision||!latest.current.enabled)continue;
        queue.current=queue.current.filter(queued=>queued.revision!==item.revision);version.current=-1;
        if(!(e instanceof ApiError&&e.status===409&&e.code==='REVISION_CONFLICT'))setError(errorMessage(e));
      }
    }}finally{busy.current=false;}})();
  };
  const sendRef=useRef(send);sendRef.current=send;
  const positionalRef=useRef(positional);positionalRef.current=positional;
  const hasPaging=navigationCapabilities(view).paging;
  useLayoutEffect(()=>{
    // Public readers can page locally without a session-history controller.
    if(!enabled||!canNavigate||(!positional&&!hasPaging))return;
    const excluded=(target:EventTarget|null)=>!(target instanceof HTMLElement)||Boolean(target.closest('input,textarea,select,button,a,[contenteditable="true"],.multi-image-gallery:not(.carousel),.board-surface,.map-surface,[role="tree"],[role="treeitem"],video,iframe,[role="dialog"]'));
    const step=(direction:-1|1)=>{const caps=navigationCapabilities(latest.current.view,latest.current.state),page=latest.current.state.page;
      if(caps.paging&&(direction<0?page>0:page+1<caps.pageCount))sendRef.current({action:'page',direction:direction<0?'previous':'next'});
      else if(![...handlers.current].some(handler=>handler(direction)))positionalRef.current?.step(direction);
    };
    const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||excluded(event.target)||window.getSelection()?.toString())return;
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const el=root.current;if(el){const scroll=scrollElement(el),max=scroll.scrollWidth-scroll.clientWidth;if(max>2&&(event.key==='ArrowRight'?scroll.scrollLeft<max-2:scroll.scrollLeft>2))return;}event.preventDefault();step(event.key==='ArrowLeft'?-1:1);}
      else if(positionalRef.current&&(event.key==='Home'||event.key==='End')){event.preventDefault();if(event.key==='Home')positionalRef.current?.home();else positionalRef.current?.end();}
    };
    let start:{x:number;y:number;at:number}|undefined;
    const touchStart=(event:TouchEvent)=>{if(event.touches.length!==1||excluded(event.target)){start=undefined;return;}start={x:event.touches[0].clientX,y:event.touches[0].clientY,at:Date.now()};};
    const touchEnd=(event:TouchEvent)=>{const from=start;start=undefined;if(!from||!event.changedTouches.length||Date.now()-from.at>700||window.getSelection()?.toString())return;const dx=event.changedTouches[0].clientX-from.x,dy=event.changedTouches[0].clientY-from.y;
      if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.8)return;const rootElement=root.current;if(!rootElement)return;const scroll=scrollElement(rootElement),max=scroll.scrollWidth-scroll.clientWidth;
      if(max>2&&(dx<0?scroll.scrollLeft<max-2:scroll.scrollLeft>2))return;
      if(event.cancelable)event.preventDefault();step(dx<0?1:-1);
    };
    window.addEventListener('keydown',key);const el=root.current;el?.addEventListener('touchstart',touchStart,{passive:true});el?.addEventListener('touchend',touchEnd,{passive:false});
    return()=>{window.removeEventListener('keydown',key);el?.removeEventListener('touchstart',touchStart);el?.removeEventListener('touchend',touchEnd);};
  },[enabled,canNavigate,Boolean(positional),hasPaging]);

  useEffect(()=>{const el=root.current;if(!el||!enabled)return;let timer:ReturnType<typeof setTimeout>|undefined;
    const scroll=(event:Event)=>{if((event.target as HTMLElement)?.dataset.readingAuto==='true')return;
      // Native scrolling in embedded/unsupported views stays local and silent.
      // Explicit agent commands retain their capability errors.
      if(!navigationCapabilities(latest.current.view,latest.current.state).scroll)return;if(Date.now()<suppress.current||!canNavigate)return;const target=event.target;if(!(target instanceof HTMLElement)||!el.contains(target)||target!==scrollElement(el))return;inputEpoch.current++;nativeScrollPending.current=true;clearTimeout(timer);timer=setTimeout(()=>{nativeScrollPending.current=false;if(latest.current.revision===revision&&target.isConnected&&el.contains(target))sendRef.current({action:'scroll',x:normalizedScroll(target.scrollLeft,target.scrollWidth-target.clientWidth),y:normalizedScroll(target.scrollTop,target.scrollHeight-target.clientHeight)});},160);};
    const prevent=(event:Event)=>{if(!canNavigate)event.preventDefault();};
    const key=(event:KeyboardEvent)=>{if(!canNavigate&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(event.key)&&!(event.target as HTMLElement).closest('input,textarea,select,button,a'))event.preventDefault();};
    el.addEventListener('keydown',key);el.addEventListener('scroll',scroll,true);el.addEventListener('wheel',prevent,{passive:false});el.addEventListener('touchmove',prevent,{passive:false});return()=>{el.removeEventListener('keydown',key);el.removeEventListener('scroll',scroll,true);el.removeEventListener('wheel',prevent);el.removeEventListener('touchmove',prevent);clearTimeout(timer);nativeScrollPending.current=false;};
  },[enabled,canNavigate,revision]);
  useEffect(()=>{
    const el=root.current;if(!el||!enabled)return;let cancelled=false;
    const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(cancelled||!el.isConnected)return;
      const caps=navigationCapabilities(view,state),panel=state.panelId?[...el.querySelectorAll<HTMLElement>('[data-code-panel]')].find(p=>p.getAttribute('data-code-panel')===state.panelId):el;let scroll=scrollElement(panel??el);
      const scrollKey=JSON.stringify([state.scroll,state.page,revision,snapshot?.commandId]);
      // Only this revision's navigation can move a retained reader. An old
      // request may still be draining while the new revision starts at defaults.
      if(caps.scroll&&!nativeScrollPending.current&&scroll.dataset.readingAuto!=='true'&&scrollKey!==lastScroll.current&&((snapshot?.revision===revision&&snapshot.version>0)||(busy.current&&pendingRevision.current===revision)||local)){const x=state.scroll.x*Math.max(0,scroll.scrollWidth-scroll.clientWidth),y=state.scroll.y*Math.max(0,scroll.scrollHeight-scroll.clientHeight);if(Math.abs(scroll.scrollLeft-x)>1||Math.abs(scroll.scrollTop-y)>1){suppress.current=Date.now()+150;scroll.scrollLeft=x;scroll.scrollTop=y;}}
      lastScroll.current=scrollKey;
      const ranges=caps.search?textRanges(el,state.query):[],highlights=caps.highlight?textRanges(el,state.highlight):[];
      const css=CSS as typeof CSS&{highlights?:Map<string,unknown>},HighlightClass=(globalThis as unknown as {Highlight?:new(...ranges:Range[])=>unknown}).Highlight;
      if(css.highlights&&HighlightClass){css.highlights.set('kanvas-search',new HighlightClass(...ranges));css.highlights.set('kanvas-highlight',new HighlightClass(...highlights));}
      const line=state.line?panel?.querySelector(`[data-code-${state.side==='before'?'before':'after'}="${state.line}"], [data-code-line="${state.line}"]`):null;if(line?.closest<HTMLElement>('[data-navigation-scroll]'))scroll=line.closest<HTMLElement>('[data-navigation-scroll]')!;const lineRange=line?document.createRange():undefined;if(line&&lineRange)lineRange.selectNodeContents(line);
      const focus=lineRange??(state.focus?.text?textRanges(el,state.focus.text)[0]:ranges.length?ranges[state.match%ranges.length]:undefined);
      const focusKey=JSON.stringify([state.query,state.match,state.focus,state.line,state.panelId,state.side,state.page]);
      if(focus&&focusKey!==lastFocus.current){const rect=focus.getBoundingClientRect(),box=scroll.getBoundingClientRect();suppress.current=Date.now()+200;scroll.scrollTop+=rect.top-box.top+rect.height/2-scroll.clientHeight/2;scroll.scrollLeft+=rect.left-box.left+rect.width/2-scroll.clientWidth/2;if(state.panelId&&line instanceof HTMLElement)line.scrollIntoView({block:'nearest',inline:'nearest'});}
      const changedFocus=focusKey!==lastFocus.current;lastFocus.current=focusKey;
      const surface=el.querySelector<HTMLElement>('.render-surface');if(surface&&el.querySelector('.relationship-diagram')){surface.style.transform='';const region=state.focus?.region;if(changedFocus&&region){suppress.current=Date.now()+200;scroll.scrollLeft=(region.x+region.width/2)*scroll.scrollWidth-scroll.clientWidth/2;scroll.scrollTop=(region.y+region.height/2)*scroll.scrollHeight-scroll.clientHeight/2;}}if(surface&&changedFocus&&!el.querySelector('.relationship-diagram')){const zoom=state.focus?.zoom??1,region=state.focus?.region;surface.style.transform='';
        if(region){scroll.scrollLeft=Math.max(0,(region.x+region.width/2)*scroll.scrollWidth-scroll.clientWidth/2);scroll.scrollTop=Math.max(0,(region.y+region.height/2)*scroll.scrollHeight-scroll.clientHeight/2);surface.style.transformOrigin=`${(region.x+region.width/2)*100}% ${(region.y+region.height/2)*100}%`;}
        else if(focus){const target=focus.getBoundingClientRect(),box=surface.getBoundingClientRect();surface.style.transformOrigin=`${target.left-box.left+target.width/2}px ${target.top-box.top+target.height/2}px`;}else surface.style.transformOrigin='center';
        surface.style.transform=zoom===1?'':`scale(${zoom})`;}
      const command=snapshot?.commandId;if(enabled&&!local&&!busy.current&&!queue.current.length&&command&&lastCommand.current!==command&&snapshot?.revision===revision&&JSON.stringify(state)===JSON.stringify(snapshot.state)){lastCommand.current=command;void api(`${displayPath(sessionId,displayId)}/navigation/ack`,{method:'POST',body:{tabId,revision,commandId:command,status:(state.focus?.text||state.line)&&!focus||snapshot.action==='scroll'&&((state.scroll.y>0&&scroll.scrollHeight<=scroll.clientHeight+1)||(state.scroll.x>0&&scroll.scrollWidth<=scroll.clientWidth+1))?'unsupported':snapshot.action==='scroll'&&(Math.abs(scroll.scrollTop-state.scroll.y*Math.max(0,scroll.scrollHeight-scroll.clientHeight))>2||Math.abs(scroll.scrollLeft-state.scroll.x*Math.max(0,scroll.scrollWidth-scroll.clientWidth))>2)?'failed':'applied',matches:state.focus?.text?textRanges(el,state.focus.text).length:state.line&&line?1:ranges.length,scroll:{x:normalizedScroll(scroll.scrollLeft,scroll.scrollWidth-scroll.clientWidth),y:normalizedScroll(scroll.scrollTop,scroll.scrollHeight-scroll.clientHeight),maxX:Math.max(0,scroll.scrollWidth-scroll.clientWidth),maxY:Math.max(0,scroll.scrollHeight-scroll.clientHeight)}}}).catch(()=>{lastCommand.current='';});}
    }));return()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[state,snapshot?.commandId,enabled,revision,viewKey,sessionId,displayId,tabId]);
  useEffect(()=>{
    const el=root.current;if(!el||!enabled||local)return;
    let stopped=false,inFlight=false;
    const measure=async()=>{if(stopped||inFlight||busy.current||!el.isConnected)return;const scroll=scrollElement(el);if(!scroll.clientWidth||!scroll.clientHeight)return;inFlight=true;
      try{await api(`${displayPath(sessionId,displayId)}/navigation/viewport`,{method:'POST',body:{tabId,revision,version:Math.max(0,version.current),width:scroll.clientWidth,height:scroll.clientHeight,maxX:Math.max(0,scroll.scrollWidth-scroll.clientWidth),maxY:Math.max(0,scroll.scrollHeight-scroll.clientHeight)}});}catch{/* Unknown remains unknown until a fresh measurement succeeds. */}finally{inFlight=false;}
    };
    const frame=requestAnimationFrame(()=>void measure()),timer=setInterval(()=>void measure(),2000);
    return()=>{stopped=true;cancelAnimationFrame(frame);clearInterval(timer);};
  },[enabled,local,revision,state.page,viewKey,sessionId,displayId,tabId]);
  useEffect(()=>()=>{if(!enabled)return;const css=CSS as typeof CSS&{highlights?:Map<string,unknown>};css.highlights?.delete('kanvas-search');css.highlights?.delete('kanvas-highlight');},[enabled]);
  // An old request may still be draining after publication. It must not turn
  // the replacement's initial page into an authoritative position and overwrite
  // a retained table's locally reconciled reading position.
  const hasPosition=local||(snapshot?.revision===revision&&snapshot.version>0)||(busy.current&&pendingRevision.current===revision);
  return <NavigationContext.Provider value={{registerInternal,readingDefaults:snapshot?.readingDefaults,canSaveReadingDefaults:snapshot?.canSaveReadingDefaults,state,canNavigate,send,seedPage:page=>{if(!hasPosition)latest.current.state={...latest.current.state,page};},hasPosition}}><div ref={root} className="browsing-root" data-navigation-viewer={snapshot?.viewerId} data-navigation-mode={mode} data-navigation-version={snapshot?.version??0}>{children}{error&&<button className="navigation-error" onClick={()=>setError('')} aria-label="Dismiss navigation error">{error}</button>}</div></NavigationContext.Provider>;
}
