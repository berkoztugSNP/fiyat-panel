// Uygulama kabuğu önbelleği. Şifreli veri paketi ve kullanıcı dosyası ASLA önbelleğe alınmaz: her zaman ağdan gelir.
const CACHE = 'fiyat-takip-v14';
const NEVER = /(data\.enc|users\.json)(\?|$)/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || NEVER.test(url.pathname) || url.pathname.includes('/_img/')) return;
  // Kod ve sayfa: önce ağ (güncellemeler hemen gelsin), ağ yoksa önbellek. Kütüphane ve görseller: önce önbellek.
  const staticAsset = /\/(vendor|img)\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (staticAsset) { const hit = await cache.match(req); if (hit) return hit; }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
