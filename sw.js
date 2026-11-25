const BUILD = "__BUILD_ID__";
const ROOT = new URL('./', self.location.href);
const PREFIX = 'mathpress-build:' + ROOT.pathname + ':';
const CACHE = PREFIX + BUILD;
const ASSETS = /*__PRECACHE__*/[];
const INDEX = new URL('index.html', ROOT).href;
async function precache() {
  const cache = await caches.open(CACHE);
  const hashed = ASSETS.filter(name => name.startsWith("assets/"));
  const stable = ASSETS.filter(name => !name.startsWith("assets/"));
  await cache.addAll(hashed.map(name => new URL(name, ROOT).href));
  await Promise.all(stable.map(async name => {
    const canonical = new URL(name, ROOT);
    const revision = new URL(canonical);
    // A fresh worker can still receive a stable URL from the previous HTTP cache.
    revision.searchParams.set("mp-build", BUILD);
    const response = await fetch(revision, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not precache ${name}: ${response.status}`);
    await cache.put(canonical, response);
  }));
}
self.addEventListener("install", event => {
  event.waitUntil(precache());
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
