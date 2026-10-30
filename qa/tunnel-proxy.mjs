// Local HTTP/WebSocket proxy: localhost:18080 -> production 192.144.159.220:8080.
//
// Free SSH tunnels (localhost.run / serveo / pinggy) cut a single large HTML
// response around 200-300 KB. The game is a 1.35 MB single-file build, so this
// proxy serves a tiny loader at /play and fetches the real document in Range
// chunks through /__raw/play. Every chunk stays below the tunnel limit; the
// loader concatenates the bytes and document.write()s the real game.
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';

const LISTEN = Number(process.env.LISTEN_PORT || 18080);
const TARGET_HOST = process.env.TARGET_HOST || '192.144.159.220';
const TARGET_PORT = Number(process.env.TARGET_PORT || 8080);
const CHUNK = 128 * 1024;

let gameHtml = null;
let gameChunks = [];
let gameAt = 0;
let gameError = '';
let loading = null;

async function refreshGame() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const response = await fetch(`http://${TARGET_HOST}:${TARGET_PORT}/play`, {
        headers: { accept: 'text/html' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 100_000) throw new Error(`short document ${buffer.length}`);
      gameHtml = buffer;
      gameChunks = [];
      for (let offset = 0; offset < buffer.length; offset += CHUNK) {
        const raw = buffer.subarray(offset, Math.min(buffer.length, offset + CHUNK));
        gameChunks.push({ rawLength: raw.length, gzip: zlib.gzipSync(raw, { level: 9 }) });
      }
      gameAt = Date.now();
      gameError = '';
      const wire = gameChunks.reduce((sum, chunk) => sum + chunk.gzip.length, 0);
      console.log(`game document cached: ${buffer.length} bytes, ${gameChunks.length} chunks, gzip ${wire} bytes`);
    } catch (error) {
      gameError = error.message;
      console.warn('game document refresh failed:', error.message);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function ensureGame() {
  if (gameHtml && Date.now() - gameAt < 60_000) return;
  await refreshGame();
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join('; ');

const LOADER = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090b">
<title>德扑之夜 · 加载中</title>
<style>
html,body{height:100%;margin:0;background:#08090b;color:#f4ecdd;
font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;display:grid;place-items:center}
.box{width:min(320px,80vw);text-align:center}
.mark{width:76px;height:76px;margin:0 auto 18px;border:1px solid rgba(217,185,119,.5);
border-radius:50%;display:grid;place-items:center;color:#f3dda8;font-size:34px}
h1{font-size:18px;font-weight:600;letter-spacing:.06em;margin:0 0 8px}
p{font-size:11px;line-height:1.7;color:rgba(244,236,221,.55);margin:0 0 18px}
.bar{height:3px;border-radius:999px;background:rgba(244,236,221,.1);overflow:hidden}
.bar i{display:block;height:100%;width:0;border-radius:inherit;
background:linear-gradient(90deg,#8c6d34,#f3dda8);transition:width .2s ease}
.err{margin-top:14px;color:#e5a49a;font-size:11px;line-height:1.6;display:none}
</style></head>
<body><div class="box"><div class="mark">德</div>
<h1>正在进入牌桌</h1>
<p>HTTPS 安全连接 · 首次加载会分块拉取牌桌资源</p>
<div class="bar"><i id="bar"></i></div>
<div class="err" id="err"></div></div>
<script>
(async function () {
  var CHUNK = 131072;
  var bar = document.getElementById('bar');
  var err = document.getElementById('err');
  function fail(error) {
    if (err) { err.style.display = 'block'; err.textContent = '加载失败：' + error + '（刷新重试）'; }
    console.error('[tunnel-loader]', error);
  }
  function decode(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  function write(html) {
    document.open();
    document.write(html);
    document.close();
  }
  var CACHE_KEY = 'dz_tunnel_cache_v2';
  try {
    var cached = null;
    try { cached = localStorage.getItem(CACHE_KEY); } catch (e) { cached = null; }
    if (cached) {
      window.__loaderStage = 'cache';
      write(cached);
      return;
    }
  } catch (e) { /* cache read must never block the game */ }

  try {
    window.__loaderStage = 'meta';
    var metaResponse = await fetch('/__chunk/meta', { cache: 'no-store' });
    if (!metaResponse.ok) throw new Error('meta HTTP ' + metaResponse.status);
    var meta = await metaResponse.json();
    var total = Number(meta.total) || 0;
    var count = Number(meta.count) || 0;
    if (!total || !count) throw new Error('empty game document');
    window.__loaderStage = 'chunks';
    var all = new Uint8Array(total);
    var written = 0;
    var BATCH = 4;
    for (var base = 0; base < count; base += BATCH) {
      var batch = [];
      for (var offset = base; offset < Math.min(count, base + BATCH); offset += 1) {
        batch.push((async function (index) {
          var response = await fetch('/__chunk/' + index, { cache: 'no-store' });
          if (!response.ok) throw new Error('chunk ' + index + ' HTTP ' + response.status);
          return new Uint8Array(await response.arrayBuffer());
        })(offset));
      }
      var parts = await Promise.all(batch);
      parts.forEach(function (chunk) {
        all.set(chunk, written);
        written += chunk.length;
      });
      window.__loaderStage = 'batch-' + base + '/' + count;
      if (bar) bar.style.width = Math.min(100, Math.round((written / total) * 100)) + '%';
    }
    if (written < total) throw new Error('incomplete ' + written + '/' + total);
    var html = decode(all);
    try { localStorage.setItem(CACHE_KEY, html); } catch (e) { /* quota/private mode */ }
    window.__loaderStage = 'write';
    write(html);
  } catch (error) {
    window.__loaderError = error && error.message ? error.message : String(error);
    fail(window.__loaderError);
  }
})();
</script></body></html>`;

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

const server = http.createServer(async (req, res) => {
  const pathname = (() => {
    try { return new URL(req.url, 'http://localhost').pathname; } catch { return ''; }
  })();

  if (req.method === 'GET' && pathname === '/__chunk/meta') {
    await ensureGame();
    if (!gameHtml) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: gameError || 'game not ready' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      total: gameHtml.length,
      chunk: CHUNK,
      count: gameChunks.length,
      gzip: true,
    }));
    return;
  }

  const chunkMatch = /^\/__chunk\/(\d+)$/.exec(pathname);
  if (req.method === 'GET' && chunkMatch) {
    await ensureGame();
    if (!gameHtml) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(gameError || 'game not ready');
      return;
    }
    const index = Number(chunkMatch[1]);
    const chunk = gameChunks[index];
    if (!chunk) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('chunk out of range');
      return;
    }
    const gzip = /gzip/i.test(String(req.headers['accept-encoding'] || ''));
    const body = gzip
      ? chunk.gzip
      : gameHtml.subarray(index * CHUNK, index * CHUNK + chunk.rawLength);
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      Vary: 'Accept-Encoding',
    };
    if (gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(body);
    return;
  }

  if (req.method === 'GET' && (pathname === '/play' || pathname === '/play/')
      && /text\/html/i.test(String(req.headers.accept || ''))) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': CSP,
    });
    res.end(LOADER);
    return;
  }

  const upstreamPath = req.url.startsWith('/__raw/') ? req.url.slice('/__raw'.length) : req.url;
  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: upstreamPath,
    headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}`, 'x-forwarded-proto': 'https' },
    agent,
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', (error) => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`tunnel proxy error: ${error.message}`);
  });
  req.pipe(upstream);
});

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  upstream.setTimeout(0);
  socket.setTimeout(0);
});

refreshGame();
setInterval(refreshGame, 5 * 60 * 1000).unref();

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`tunnel proxy listening on 127.0.0.1:${LISTEN} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});
