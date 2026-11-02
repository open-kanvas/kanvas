// Thin install shell. Never cache account pages, OAuth traffic, API results or
// rendered source content. Offline mode is an honest reconnect page only.
const CACHE='kanvas-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icons/kanvas-192.png','/icons/kanvas-512.png','/brand/kanvas-logo-white.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kanvas-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname==='/brand/kanvas-logo-white.svg'){event.respondWith(fetch(event.request).catch(()=>caches.match('/brand/kanvas-logo-white.svg')));return;}
  if(event.request.mode!=='navigate')return;event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});

// Push payloads are fixed preview-free messages. Never use a supplied external URL.
self.addEventListener('push',event=>{event.waitUntil((async()=>{
 let data;try{data=event.data?.json();}catch{return;}
 if(!data||!/^\/view\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}$/.test(data.url))return;
 await self.registration.showNotification('Kanvas is ready',{body:'Open your new session.',icon:'/icons/kanvas-192.png',badge:'/icons/kanvas-192.png',tag:'kanvas-'+data.url,data:{url:data.url}});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();const path=event.notification.data?.url;
 if(typeof path!=='string'||!/^\/view\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}$/.test(path))return;
 event.waitUntil((async()=>{
  const url=new URL(path,self.location.origin).href;
  // Installed apps may reuse an existing root window for openWindow(). Navigate
  // the returned WindowClient explicitly; focusing alone preserves its old URL.
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url===url);
  const opened=existing??await self.clients.openWindow(url);
  if(!opened)return;
  const target=opened.url===url?opened:await opened.navigate(url);
  await target?.focus();
 })());
});
