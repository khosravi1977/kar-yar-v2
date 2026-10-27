/* kar-yar v4 — service worker
   راهبرد: shell → stale-while-revalidate، فونت/آیکون/تصویر → cache-first، ناوبری → network با fallback کش */
const CACHE_NAME = 'kar-yar-v2-pwa-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/idb.js',
  './js/quota.js',
  './js/logger.js',
  './js/migration.js',
  './js/repository.js',
  './fonts/Vazirmatn-Regular.woff2',
  './fonts/Vazirmatn-Medium.woff2',
  './fonts/Vazirmatn-Bold.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/favicon.ico'
];
const STATIC_RE = /\.(?:png|ico|woff2|woff|svg|jpg|jpeg|webp)$/i;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (STATIC_RE.test(req.url)) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
      }
      return response;
    })));
    return;
  }

  // stale-while-revalidate برای بقیهٔ فایل‌های هم‌مبدأ (html/js/manifest)
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
