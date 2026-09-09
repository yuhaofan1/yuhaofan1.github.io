const CACHE_NAME = 'siteflow-app-shell-v1';
const APP_ROOT = new URL('./', self.registration.scope).href;

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(APP_ROOT, { cache: 'reload' });
  if (!response.ok) throw new Error('Could not cache SiteFlow.');
  const html = await response.clone().text();
  await cache.put(APP_ROOT, response);
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], APP_ROOT).href)
    .filter((url) => url.startsWith(self.registration.scope));
  await Promise.all(assets.map(async (url) => {
    const asset = await fetch(url, { cache: 'reload' });
    if (asset.ok) await cache.put(url, asset);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('siteflow-app-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) await (await caches.open(CACHE_NAME)).put(APP_ROOT, response.clone());
      return response;
    }).catch(() => caches.match(APP_ROOT)));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
    if (response.ok && response.status === 200) await (await caches.open(CACHE_NAME)).put(request, response.clone());
    return response;
  })));
});
