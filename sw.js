// Offline support: network first so a deploy shows up on the next load, cache as fallback.
/** @type {any} ServiceWorkerGlobalScope; the webworker lib clashes with dom in one tsconfig */
const sw = self
const CACHE = 'flatplan-v5'
const SHELL = [
  './',
  'index.html',
  'tokens.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'src/main.js',
  'src/model.js',
  'src/store.js',
  'src/geom.js',
  'src/history.js',
  'src/debug.js',
  'src/editor.js',
  'src/ui.js',
  'src/feedback.js',
  'observe.js',
]

self.addEventListener('install', (/** @type {any} */ e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
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
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(
        async () =>
          (await caches.match(req)) ?? /** @type {Response} */ (await caches.match('index.html')),
      ),
  )
})
