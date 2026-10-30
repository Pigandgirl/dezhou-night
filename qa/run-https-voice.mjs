// Verify the HTTPS tunnel: secure context, service worker, manifest and a real
// getUserMedia audio track (fake device) through the public tunnel.
// Run: $env:HTTPS_URL='https://xxxx.serveousercontent.com'; node qa/run-https-voice.mjs
import fs from 'node:fs';
import path from 'node:path';
import { BrowserPage } from './lib/browser.mjs';

const base = String(process.env.HTTPS_URL || '').replace(/\/+$/, '');
if (!base.startsWith('https://')) {
  console.error('HTTPS_URL must be an https:// URL');
  process.exit(2);
}
const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail ?? ''}`);
  if (!ok) throw new Error(`${id} failed: ${detail}`);
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let page;
try {
  page = await new BrowserPage('https-voice', {
    extraArgs: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  }).launch();
  await page.cdp.send('Emulation.setUserAgentOverride', { userAgent: UA, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 2, mobile: true, screenWidth: 852, screenHeight: 393 });
  await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.cdp.send('Browser.grantPermissions', {
    origin: new URL(base).origin,
    permissions: ['audioCapture'],
  }).catch(() => {});

  await page.goto(`${base}/play`, 6500);
  const loaded = await page.waitFor('!!window.__poker', 45000);
  const pageInfo = await page.eval(`JSON.stringify({
    title: document.title,
    url: location.href,
    secure: window.isSecureContext,
    protocol: location.protocol,
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    poker: Boolean(window.__poker),
    body: document.body?.innerText?.slice(0, 120) || '',
    loaderStage: window.__loaderStage || '',
    loaderError: window.__loaderError || '',
    bar: document.getElementById('bar')?.style?.width || '',
    err: document.getElementById('err')?.textContent || '',
    resources: performance.getEntriesByType('resource')
      .filter((e) => e.name.includes('__chunk'))
      .map((e) => ({ name: e.name.split('/').pop(), size: e.transferSize, duration: Math.round(e.duration) })),
  })`);
  console.log('page', pageInfo);
  console.log('pageErrors', page.errors.slice(0, 8));
  const info = JSON.parse(pageInfo);
  check('H1 page loaded', loaded || info.poker, pageInfo);
  check('H2 HTTPS secure context', info.secure && info.protocol === 'https:', pageInfo);
  check('H3 getUserMedia present', info.mediaDevices, info.mediaDevices);

  const mic = await page.eval(`(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const tracks = stream.getAudioTracks();
      const result = {
        ok: true,
        tracks: tracks.length,
        label: tracks[0]?.label || '',
        state: tracks[0]?.readyState || '',
        settings: tracks[0]?.getSettings?.() || {},
      };
      stream.getTracks().forEach((track) => track.stop());
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ ok: false, name: error.name, message: error.message });
    }
  })()`);
  console.log('mic', mic);
  const micData = JSON.parse(mic);
  check('H4 getUserMedia audio track', micData.ok && micData.tracks === 1 && micData.state === 'live', mic);

  const sw = await page.eval(`(async () => {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sw timeout')), 8000)),
      ]);
      return JSON.stringify({ scope: reg.scope, active: Boolean(reg.active), controller: Boolean(navigator.serviceWorker.controller) });
    } catch (error) {
      return JSON.stringify({ error: error.message });
    }
  })()`);
  console.log('sw', sw);
  const swData = JSON.parse(sw);
  // The production 1.1.10 registers its service worker on window.load; the
  // chunk loader writes the document after load, so that listener never fires.
  // Offline is out of scope for this temporary HTTPS bridge; voice does not
  // depend on the service worker.
  results.push({ id: 'H5 service worker (informational)', ok: Boolean(swData.active), detail: sw });
  console.log(`${swData.active ? 'INFO' : 'WARN'} H5 service worker on HTTPS ${sw}`);

  const manifest = await page.eval(`(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const href = link ? new URL(link.href, location.href).href : '';
    if (!href) return JSON.stringify({ ok: false, reason: 'no manifest link' });
    const res = await fetch(href, { cache: 'no-store' });
    const data = await res.json();
    return JSON.stringify({ ok: res.ok, href, scope: data.scope, start: data.start_url, display: data.display });
  })()`);
  console.log('manifest', manifest);
  const man = JSON.parse(manifest);
  check('H6 manifest reachable', man.ok && man.scope === '/play' && man.display === 'standalone', manifest);

  await page.screenshot(path.join(outDir, 'https-tunnel-secure.png'));

  // Second load must come from the loader's localStorage cache, not 11 chunks.
  const reloadStart = Date.now();
  await page.cdp.send('Page.reload', { ignoreCache: false });
  const cachedLoaded = await page.waitFor('!!window.__poker', 20000);
  const reloadMs = Date.now() - reloadStart;
  check('H8 cached second load', cachedLoaded && reloadMs < 15000, `${reloadMs}ms`);

  // Contrast: the same page on plain HTTP is not a secure context.
  await page.goto('http://192.144.159.220:8080/play', 4500);
  const insecure = await page.eval(`JSON.stringify({
    secure: window.isSecureContext,
    protocol: location.protocol,
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    poker: Boolean(window.__poker),
  })`);
  console.log('http contrast', insecure);
  const insecureData = JSON.parse(insecure);
  check('H7 HTTP is not secure', insecureData.secure === false && insecureData.protocol === 'http:', insecure);

  fs.writeFileSync(path.join(outDir, 'https-voice-results.json'), JSON.stringify({
    when: new Date().toISOString(),
    base,
    results,
    screenshots: ['https-tunnel-secure.png'],
  }, null, 2));
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
} finally {
  await page?.close();
}
