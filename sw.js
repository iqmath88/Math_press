const BUILD = "__BUILD_ID__";
const ROOT = new URL('./', self.location.href);
const PREFIX = 'mathpress-build:' + ROOT.pathname + ':';
const CACHE = PREFIX + BUILD;
const ASSETS = /*__PRECACHE__*/[];
const INDEX = new URL('index.html', ROOT).href;
// The previous build can leave stable URLs in the browser HTTP cache. Refresh
// those URLs at install so the offline HTML points at this build's hashed assets.
const requests = ASSETS.map(name => new Request(new URL(name, ROOT), {
  cache: name.startsWith("assets/") ? "default" : "reload"
}));
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(requests)));
});
self.addEventListener('activate', event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys()) if(key.startsWith(PREFIX)&&key!==CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event=>{
  const request=event.request, url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)) return;
  if(request.mode==='navigate') {
    event.respondWith((async()=>{
      try { const response=await fetch(request,{cache:'no-store'}); if(response.ok) return response; if(response.status!==404) return response; }
      catch(_) {}
      return await (await caches.open(CACHE)).match(INDEX) || Response.error();
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(request);
    if(hit) return hit;
    return fetch(request);
  })());
});
