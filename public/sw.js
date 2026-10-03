// Thin install shell. Never cache account pages, OAuth traffic, API results or
// rendered source content. Offline mode is an honest reconnect page only.
const CACHE='kanvas-shell-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icons/kanvas-192.png','/icons/kanvas-512.png','/brand/kanvas-logo-white.svg'])));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kanvas-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname==='/brand/kanvas-logo-white.svg'){event.respondWith(fetch(event.request).catch(()=>caches.match('/brand/kanvas-logo-white.svg')));return;}
  if(event.request.mode!=='navigate')return;event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
