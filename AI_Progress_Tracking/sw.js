const CACHE_NAME = 'siteflow-app-shell-v5';
const APP_ROOT = new URL('./', self.registration.scope).href;
const IS_LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(self.location.hostname);

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
  event.waitUntil((IS_LOCAL_PREVIEW ? Promise.resolve() : cacheAppShell()).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('siteflow-app-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_PREVIEW) return;
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
  if (requestUrl.searchParams.has('_siteflow_version')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (!response.ok) throw new Error(`SiteFlow returned HTTP ${response.status}`);
        await cache.put(APP_ROOT, response.clone());
        return response;
      } catch {
        const cached = await cache.match(APP_ROOT);
        if (cached) return cached;
        return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>SiteFlow offline</title><style>body{margin:0;min-height:100vh;display:grid;place-content:center;padding:24px;background:#f4f1ea;color:#17231d;font:16px system-ui;text-align:center}button{margin:18px auto 0;padding:13px 20px;border:0;border-radius:9px;background:#126447;color:white;font-weight:700}</style><h1>Connection timed out</h1><p>SiteFlow has not been cached on this phone yet.<br>Reconnect, then tap retry once.</p><button onclick="location.reload()">Retry</button>`, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
    if (!response.ok) throw new Error(`SiteFlow asset returned HTTP ${response.status}`);
    await (await caches.open(CACHE_NAME)).put(request, response.clone());
    return response;
  })));
});
