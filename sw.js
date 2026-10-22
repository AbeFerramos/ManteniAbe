const CACHE = 'urvabe-mantenimiento-v7';
const FILES = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg', './logo-abri-recortado.png', './logo-icon-192.png', './logo-icon-512.png', './logo-icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Always ask GitHub Pages first, so a published version appears on the next visit.
  // Keep the last successful response for offline use.
  event.respondWith(
    fetch(request, { cache: 'no-cache' }).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
