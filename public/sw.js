// Offline: the page and the files it has used stay on the device, so a field opened once opens again without a network.
// Only this site's own files are cached; NASA POWER, SoilGrids and the other live sources keep their own cache in
// localStorage (src/lib/api.ts). Each build registers sw.js?v=<build>: its cache replaces the previous build's once
// no tab runs the old one (no skipWaiting - an open tab keeps the lazy chunks it was built with).
const CACHE = `zixtaro-${new URL(location.href).searchParams.get('v') ?? 'dev'}`
const scope = new URL(self.registration.scope)
const ASSETS = `${scope.pathname}assets/`

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('zixtaro-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const keep = (cache, key, res) => {
  // a partial (206) or failed response is never stored
  if (res.status === 200) cache.put(key, res.clone()).catch(() => {})
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // media seeks ask for byte ranges: left to the network
  if (req.method !== 'GET' || url.origin !== scope.origin || req.headers.has('range')) return
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // build files carry a content hash and never change: cache first
      if (url.pathname.startsWith(ASSETS)) return (await cache.match(req)) ?? keep(cache, req, await fetch(req))
      // the page (one index.html for every ?page=… link), data and translations: network first, the copy offline
      const key = req.mode === 'navigate' ? scope.href : req
      try {
        return keep(cache, key, await fetch(req))
      } catch (err) {
        const hit = await cache.match(key)
        if (hit) return hit
        throw err
      }
    }),
  )
})
