// Offline support: network first so a deploy shows up on the next load, cache as fallback.
/** @type {any} ServiceWorkerGlobalScope; the webworker lib clashes with dom in one tsconfig */
const sw = self
// The deploy (.github/workflows/pages.yml) replaces both: CACHE with the commit, SHELL with every
// shipped file. These values only serve the dev server.
const CACHE = 'flatplan-dev'
const SHELL = ['./', 'index.html']
// only these are written to the cache at runtime
const shellUrls = new Set(SHELL.map((p) => new URL(p, location.href).href))

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // past the HTTP cache: Pages serves with max-age, which would precache the previous deploy
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))),
  )
  sw.skipWaiting()
})

self.addEventListener('activate', (/** @type {any} */ e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  )
})

self.addEventListener('fetch', (/** @type {any} */ e) => {
  const req = /** @type {Request} */ (e.request)
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/version'))
    return
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && shellUrls.has(req.url)) {
          const copy = res.clone()
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)))
        }
        return res
      })
      .catch(
        async () =>
          (await caches.match(req)) ??
          // the HTML shell answers page loads only; a script or image must fail, not get HTML
          (req.mode === 'navigate' ? await caches.match('index.html') : null) ??
          Response.error(),
      ),
  )
})
