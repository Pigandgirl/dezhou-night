/* 德扑之夜 PWA shell. API/SSE/WebRTC are never cached.
 *
 * Scope is /play (not /play/) so the canonical start URL itself is controlled
 * and can boot offline. The server must send Service-Worker-Allowed: /play
 * for this script; server.js does that on the /play/sw.js route.
 */
const CACHE = 'dezhou-shell-v37';
const SHELL = [
  '/play',
  '/play/manifest.webmanifest',
  '/play/icons/icon-192.png',
  '/play/icons/icon-512.png',
  '/play/icons/icon-1024.png',
  '/play/icons/icon-512-maskable.png',
  '/play/icons/apple-touch-icon.png',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090b"><title>德扑之夜 · 离线</title>
<style>
  html,body{height:100%;margin:0;background:#08090b;color:#f4ecdd;
    font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;
    display:grid;place-items:center;text-align:center}
  .wrap{padding:28px;max-width:320px}
  .mark{width:76px;height:76px;margin:0 auto 18px;border:1px solid rgba(217,185,119,.5);
    border-radius:50%;display:grid;place-items:center;color:#f3dda8;font-size:34px}
  h1{font-size:19px;font-weight:600;letter-spacing:.04em;margin:0 0 8px}
  p{font-size:12px;line-height:1.7;color:rgba(244,236,221,.55);margin:0 0 20px}
  button{height:42px;padding:0 22px;border:1px solid rgba(243,221,168,.5);
    border-radius:12px;background:linear-gradient(180deg,#e7cc96,#c9a766);
    color:#14100a;font-size:13px;font-weight:700}
</style></head>
<body><div class="wrap"><div class="mark">德</div>
<h1>牌桌在等网络</h1>
<p>当前处于离线状态。恢复网络后点下方按钮重新进入牌桌。</p>
<button onclick="location.reload()">重新连接</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => null)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function cachePut(request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/download/')) return;

  // The game shell: network first, cache fallback, then a small offline page.
  if (request.mode === 'navigate' && url.pathname.startsWith('/play')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/play', copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/play');
          if (cached) return cached;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }),
    );
    return;
  }

  // Icons/splash/manifest: cache first, then network and fill the cache.
  if (url.pathname.startsWith('/play/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        cachePut(request, response);
        return response;
      })),
    );
  }
});
