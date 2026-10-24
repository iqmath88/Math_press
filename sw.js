// الصفحة الرئيسية: الشبكة أولًا (لتصل التحديثات فور النشر)، ثم النسخة المخزنة دون اتصال.
// الملفات المُجزَّأة (assets) والخطوط: المخزن أولًا لأن أسماءها تتغير مع كل إصدار.
const CACHE = "mathpress-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (url.pathname === "/sw.js") return;

  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
    )
  );
});
