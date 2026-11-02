// Thin install shell. Never cache account pages, OAuth traffic, API results or
// rendered source content. Offline mode is an honest reconnect page only.
const CACHE='kanvas-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icons/kanvas-192.png','/icons/kanvas-512.png','/brand/kanvas-logo-white.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kanvas-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname==='/brand/kanvas-logo-white.svg'){event.respondWith(fetch(event.request).catch(()=>caches.match('/brand/kanvas-logo-white.svg')));return;}
  if(event.request.mode!=='navigate')return;event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});


// Local, bounded, content-free evidence survives a closed app. Two records only;
// no account IDs, destination URLs, notification payloads or exception messages.
// Diagnostic storage is best effort and never gates the user-activation launch.
function pushTrace(kind) {
 const record={version:1,startedAt:Date.now(),steps:[]};let pending=Promise.resolve();
 return {step(stage,error) {
  const item={stage,at:Date.now()};
  if(error)item.error=['InvalidAccessError','SecurityError','NotAllowedError','AbortError','TypeError'].includes(error.name)?error.name:'OtherError';
  record.steps.push(item);
  const body=JSON.stringify(record);
  pending=pending.then(async()=>{const cache=await caches.open('kanvas-push-diagnostics-v1');await cache.put('/__kanvas_push_diagnostics__/'+kind,new Response(body,{headers:{'Content-Type':'application/json'}}));}).catch(()=>{});
 },flush(){return pending;}};
}
const notificationPath=path=>typeof path==='string'&&/^\/view\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}$/.test(path);
// Push payloads are fixed preview-free messages. Never use a supplied external URL.
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 const trace=pushTrace('push');trace.step('push-received');
 try {
  let data;try{data=event.data?.json();}catch{trace.step('payload-invalid');return;}
  if(!data||!notificationPath(data.url)){trace.step('payload-invalid');return;}
  await self.registration.showNotification('Kanvas is ready',{body:'Open your new session.',icon:'/icons/kanvas-192.png',badge:'/icons/kanvas-192.png',tag:'kanvas-'+data.url,data:{url:data.url}});
  trace.step('notification-shown');
 }catch(error){trace.step('notification-failed',error);}finally{await trace.flush();}
})());});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const path=event.notification.data?.url;
 if(!notificationPath(path))return;
 const url=new URL(path,self.location.origin).href;
 // Invoke the launch API in the click task, BEFORE storage or matchAll awaits.
 // Chrome may return a reused app window; always check its destination below.
 let opening;
 try{opening=Promise.resolve(self.clients.openWindow(url)).then(client=>({client}),error=>({error}));}
 catch(error){opening=Promise.resolve({error});}
 const trace=pushTrace('click');trace.step('click-received');trace.step('open-requested');
 event.waitUntil((async()=>{
  try {
   const result=await opening;let target=result.client;
   trace.step(result.error?'open-failed':target?'open-returned-client':'open-no-client',result.error);
   if(!target){
    // Recovery only: enumeration failure must never prevent the primary launch.
    trace.step('fallback-search');
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    target=windows.find(client=>client.url===url)??windows.find(client=>{
     try{const candidate=new URL(client.url);return candidate.origin===self.location.origin&&!candidate.search&&!candidate.hash&&(candidate.pathname==='/'||candidate.pathname==='/start'||notificationPath(candidate.pathname));}catch{return false;}
    });
    trace.step(target?'fallback-client':'no-window-client');
   }
   if(!target)return;
   if(target.url!==url){trace.step('navigate-requested');target=await target.navigate(url);trace.step(target?'navigated':'navigate-no-client');}
   if(!target)return;
   trace.step('focus-requested');await target.focus();trace.step('focused');
  }catch(error){trace.step('activation-failed',error);}finally{await trace.flush();}
 })());
});
