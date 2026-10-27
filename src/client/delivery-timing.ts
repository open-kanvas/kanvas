const timings=new Map<string,{received:number;rendered?:number}>();
const key=(sessionId:string,displayId:string,revision:number)=>`${sessionId}:${displayId}:${revision}`;
export function receivedView(sessionId:string,displayId:string,revision:number){const k=key(sessionId,displayId,revision);if(!timings.has(k))timings.set(k,{received:performance.now()});if(timings.size>100)timings.delete(timings.keys().next().value!);}
export function renderedView(sessionId:string,displayId:string,revision:number){const t=timings.get(key(sessionId,displayId,revision));if(t&&!t.rendered)t.rendered=performance.now();}
export function paintedView(sessionId:string,displayId:string,revision:number){const t=timings.get(key(sessionId,displayId,revision));if(!t?.rendered)return;return {...t,rendered:t.rendered,painted:performance.now(),clientPaintedAt:new Date().toISOString(),visible:!document.hidden,width:innerWidth,height:innerHeight,pixelRatio:devicePixelRatio};}
