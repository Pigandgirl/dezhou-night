// iOS PWA acceptance pass: manifest, service worker, install education,
// standalone/native classes, offline boot and screenshots.
// Run: node qa/run-ios-pwa.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSandbox, startServer, stopServer, freePort, sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

function lanHost() {
  if (process.env.DZ_LAN_HOST) return process.env.DZ_LAN_HOST;
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
  return addresses.find((ip) => ip.startsWith('192.168.')) || addresses[0] || '127.0.0.1';
}

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok: Boolean(ok), detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail ?? ''}`);
  if (!ok) throw new Error(`${id} failed: ${detail}`);
}

async function json(url) {
  const res = await fetch(url);
  const data = await res.json();
  return { res, data };
}

async function main() {
  const sandbox = createSandbox({ users: [], label: 'ios-pwa' });
  const port = await freePort();
  const server = await startServer(sandbox, { port });
  const base = `http://127.0.0.1:${port}`;
  const lan = `http://${lanHost()}:${port}`;
  console.log(`base=${base} lan=${lan}`);
  let page;
  let chromePage;
  let standalonePage;
  let nativePage;
  let insecurePage;
  try {
    // ---------- static assets ----------
    const playRes = await fetch(`${base}/play`);
    const playHtml = await playRes.text();
    check('T1.1 /play 200', playRes.status === 200 && /德扑之夜/.test(playHtml), playRes.status);
    check('T1.2 viewport-fit', playHtml.includes('viewport-fit=cover'), 'viewport-fit=cover');
    check('T1.3 apple meta', playHtml.includes('apple-mobile-web-app-capable') && playHtml.includes('apple-mobile-web-app-status-bar-style'), 'apple meta');
    check('T1.4 splash links', (playHtml.match(/apple-touch-startup-image/g) || []).length === 24, (playHtml.match(/apple-touch-startup-image/g) || []).length);

    const manRes = await fetch(`${base}/play/manifest.webmanifest`);
    const manifest = await manRes.json();
    check('T1.5 manifest type', (manRes.headers.get('content-type') || '').includes('manifest+json'), manRes.headers.get('content-type'));
    check('T1.6 manifest scope', manifest.scope === '/play' && manifest.start_url === '/play' && manifest.display === 'standalone', JSON.stringify({ scope: manifest.scope, start_url: manifest.start_url, display: manifest.display }));
    check('T1.7 manifest icons', manifest.icons.some((i) => i.sizes === '1024x1024') && manifest.icons.some((i) => i.purpose === 'maskable'), manifest.icons.map((i) => `${i.sizes}/${i.purpose}`).join(','));

    const swRes = await fetch(`${base}/play/sw.js`);
    check('T1.8 sw headers', swRes.status === 200 && swRes.headers.get('service-worker-allowed') === '/play', `${swRes.status} ${swRes.headers.get('service-worker-allowed')}`);
    const swText = await swRes.text();
    check('T1.9 sw scope + cache', swText.includes("const CACHE = 'dezhou-shell-v37'") && swText.includes('SKIP_WAITING'), 'v37 + skipWaiting message');

    for (const icon of ['icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-512-maskable.png', 'apple-touch-icon.png']) {
      const res = await fetch(`${base}/play/icons/${icon}`);
      check(`T1.10 icon ${icon}`, res.status === 200 && (res.headers.get('content-type') || '').includes('image/png'), res.status);
    }
    const splashRes = await fetch(`${base}/play/icons/splash-1179x2556.png`);
    check('T1.11 splash 1179x2556', splashRes.status === 200 && splashRes.headers.get('content-type') === 'image/png', splashRes.status);

    // ---------- iPhone Safari install education ----------
    page = await new BrowserPage('ios-safari').launch();
    await page.cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_SAFARI, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 3, mobile: true, screenWidth: 393, screenHeight: 852 });
    await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.goto(`${base}/play`, 5200);
    await page.waitFor('!!window.__poker', 15000);
    const env = await page.eval(`JSON.stringify({
      ios: window.__DZ_IOS_INSTALL__?.isIOS,
      safari: window.__DZ_IOS_INSTALL__?.isSafari,
      standalone: window.__DZ_IOS_INSTALL__?.standalone,
      secure: window.isSecureContext,
      cls: document.documentElement.className,
      ua: navigator.userAgent,
      w: innerWidth, h: innerHeight,
    })`);
    console.log('env', env);
    const envData = JSON.parse(env);
    check('T2.1 iOS detected', envData.ios && envData.safari && !envData.standalone, env);
    check('T2.2 ios class', /(^| )ios( |$)/.test(envData.cls), envData.cls);
    await page.waitFor(`!document.getElementById('iosInstallSheet')?.classList.contains('hidden')`, 6000);
    const sheet = await page.eval(`(() => {
      const el = document.getElementById('iosInstallSheet');
      const steps = [...el.querySelectorAll('#iosInstallSteps li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim());
      return JSON.stringify({
        title: document.getElementById('iosInstallTitle').textContent,
        lead: document.getElementById('iosInstallLead').textContent,
        steps,
        note: document.getElementById('iosInstallNote').textContent,
        rect: (() => { const r = el.querySelector('.ios-install-panel').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      });
    })()`);
    console.log('install sheet', sheet);
    const sheetData = JSON.parse(sheet);
    check('T2.3 install title', sheetData.title.includes('装到桌面'), sheetData.title);
    check('T2.4 install steps', sheetData.steps.length === 3 && sheetData.steps[0].includes('分享'), JSON.stringify(sheetData.steps));
    check('T2.5 sheet fits viewport', sheetData.rect.y >= 0 && sheetData.rect.y + sheetData.rect.h <= 853 && sheetData.rect.w <= 393, JSON.stringify(sheetData.rect));
    await sleep(800);
    await page.screenshot(path.join(outDir, 'ios-pwa-sheet.png'));

    // close + settings entry
    await page.eval(`document.getElementById('iosInstallDone').click()`);
    await sleep(300);
    check('T2.6 sheet closes', await page.eval(`document.getElementById('iosInstallSheet').classList.contains('hidden')`), 'hidden');
    await page.eval(`document.getElementById('btnSettings')?.click()`);
    await sleep(400);
    const entry = await page.eval(`(() => {
      const b = document.getElementById('btnInstallApp');
      const s = getComputedStyle(b);
      return JSON.stringify({ hidden: b.classList.contains('hidden'), display: s.display, text: b.textContent, state: document.getElementById('iosInstallState').textContent });
    })()`);
    console.log('settings entry', entry);
    const entryData = JSON.parse(entry);
    check('T2.7 settings install entry', !entryData.hidden && entryData.display !== 'none' && entryData.text.includes('安装'), entry);
    await sleep(350);
    await page.screenshot(path.join(outDir, 'ios-pwa-settings.png'));
    await page.eval(`document.getElementById('btnInstallApp').click()`);
    await sleep(500);
    check('T2.8 manual reopen', !(await page.eval(`document.getElementById('iosInstallSheet').classList.contains('hidden')`)), 'open');
    await page.eval(`document.getElementById('iosInstallNever').click()`);
    await sleep(250);
    const neverState = await page.eval(`JSON.stringify({
      never: localStorage.getItem('dz_ios_install_never'),
      hidden: document.getElementById('iosInstallSheet').classList.contains('hidden'),
    })`);
    const neverData = JSON.parse(neverState);
    check('T2.9 never persisted', neverData.never === '1' && neverData.hidden, neverState);

    // ---------- service worker + offline ----------
    const swState = await page.eval(`(async () => {
      const reg = await navigator.serviceWorker.ready;
      const cached = await caches.match('/play');
      return JSON.stringify({
        scope: reg.scope,
        active: Boolean(reg.active),
        controller: Boolean(navigator.serviceWorker.controller),
        cached: Boolean(cached),
        size: cached ? (await cached.text()).length : 0,
      });
    })()`);
    console.log('sw', swState);
    const swData = JSON.parse(swState);
    check('T3.1 sw scope /play', swData.scope.endsWith('/play') && swData.active, swState);
    check('T3.2 sw controls page', swData.controller, swData.controller);
    check('T3.3 shell cached', swData.cached && swData.size > 500000, swData.size);

    await page.eval(`window.__PWA__.showUpdateBanner()`);
    await sleep(350);
    check('T3.4 update banner', await page.eval(`!document.getElementById('pwaUpdateBanner').classList.contains('hidden')`), 'visible');
    await page.screenshot(path.join(outDir, 'ios-pwa-update.png'));
    await page.eval(`document.querySelector('.pwa-update-close')?.click()`);

    await page.cdp.send('Network.enable');
    await page.cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.cdp.send('Page.reload', { ignoreCache: false });
    await sleep(4200);
    const offline = await page.eval(`JSON.stringify({
      title: document.title,
      poker: Boolean(window.__poker),
      boot: Boolean(document.getElementById('boot')),
      lobby: (() => { const el = document.querySelector('.lobby'); return el ? getComputedStyle(el).display !== 'none' : false; })(),
      body: document.body.innerText.slice(0, 80),
    })`);
    console.log('offline', offline);
    const offlineData = JSON.parse(offline);
    check('T3.5 offline boot from cache', offlineData.poker && !offlineData.boot, offline);
    check('T3.6 install prompt stays dismissed', await page.eval(`!document.getElementById('iosInstallSheet') || document.getElementById('iosInstallSheet').classList.contains('hidden')`), 'no auto prompt after reload');
    await page.screenshot(path.join(outDir, 'ios-pwa-offline.png'));
    await page.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // ---------- iPhone Chrome: must ask for Safari ----------
    chromePage = await new BrowserPage('ios-chrome').launch();
    await chromePage.cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_CHROME, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
    await chromePage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true, screenWidth: 393, screenHeight: 852 });
    await chromePage.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await chromePage.goto(`${base}/play`, 4200);
    await chromePage.waitFor(`!!window.__poker`, 15000);
    await chromePage.waitFor(`!document.getElementById('iosInstallSheet')?.classList.contains('hidden')`, 6000);
    const chrome = await chromePage.eval(`JSON.stringify({
      safari: window.__DZ_IOS_INSTALL__?.isSafari,
      inApp: window.__DZ_IOS_INSTALL__?.inApp,
      title: document.getElementById('iosInstallTitle').textContent,
      steps: [...document.querySelectorAll('#iosInstallSteps li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
      action: document.getElementById('iosInstallDone').textContent,
    })`);
    console.log('chrome', chrome);
    const chromeData = JSON.parse(chrome);
    check('T4.1 chrome iab detected', chromeData.safari === false && chromeData.inApp, chrome);
    check('T4.2 asks for Safari', chromeData.title.includes('Safari') && chromeData.steps.length === 3, chromeData.title);
    check('T4.3 copy action', chromeData.action.includes('复制'), chromeData.action);
    await sleep(600);
    await chromePage.screenshot(path.join(outDir, 'ios-pwa-chrome.png'));

    // ---------- standalone ----------
    standalonePage = await new BrowserPage('ios-standalone').launch();
    await standalonePage.initScript(`Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });`);
    await standalonePage.cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_SAFARI, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
    await standalonePage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 3, mobile: true, screenWidth: 852, screenHeight: 393 });
    await standalonePage.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await standalonePage.goto(`${base}/play`, 4500);
    await standalonePage.waitFor('!!window.__poker', 15000);
    await sleep(900);
    const standalone = await standalonePage.eval(`JSON.stringify({
      standalone: window.__DZ_IOS_INSTALL__?.standalone,
      cls: document.documentElement.className,
      sheet: Boolean(document.getElementById('iosInstallSheet')),
      entryHidden: document.getElementById('btnInstallApp')?.classList.contains('hidden'),
      state: document.getElementById('iosInstallState')?.textContent,
      w: innerWidth, h: innerHeight,
    })`);
    console.log('standalone', standalone);
    const standaloneData = JSON.parse(standalone);
    check('T5.1 standalone detected', standaloneData.standalone && /ios-standalone/.test(standaloneData.cls), standalone);
    check('T5.2 no install sheet', !standaloneData.sheet, standaloneData.sheet);
    check('T5.3 entry hidden', standaloneData.entryHidden, standaloneData.entryHidden);
    check('T5.4 state copy', String(standaloneData.state).includes('主屏幕'), standaloneData.state);
    await standalonePage.eval(`document.getElementById('btnLoginSkip')?.click()`);
    await sleep(700);
    await standalonePage.screenshot(path.join(outDir, 'ios-pwa-standalone.png'));

    // ---------- native shell injection ----------
    nativePage = await new BrowserPage('ios-native').launch();
    await nativePage.initScript(`window.__DZ_SHELL__ = 'ios-native';`);
    await nativePage.cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_SAFARI, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
    await nativePage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 3, mobile: true, screenWidth: 852, screenHeight: 393 });
    await nativePage.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await nativePage.goto(`${base}/play`, 4500);
    await nativePage.waitFor('!!window.__poker', 15000);
    const native = await nativePage.eval(`JSON.stringify({
      native: window.__DZ_IOS_INSTALL__?.isNative,
      cls: document.documentElement.className,
      sheet: Boolean(document.getElementById('iosInstallSheet')),
      entryHidden: document.getElementById('btnInstallApp')?.classList.contains('hidden'),
      state: document.getElementById('iosInstallState')?.textContent,
    })`);
    console.log('native', native);
    const nativeData = JSON.parse(native);
    check('T6.1 native detected', nativeData.native && /ios-native/.test(nativeData.cls), native);
    check('T6.2 no install sheet', !nativeData.sheet, nativeData.sheet);
    check('T6.3 native state copy', String(nativeData.state).includes('原生'), nativeData.state);

    // ---------- insecure HTTP (production today) ----------
    insecurePage = await new BrowserPage('ios-http').launch();
    await insecurePage.cdp.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_SAFARI, platform: 'iPhone', acceptLanguage: 'zh-CN,zh;q=0.9' });
    await insecurePage.cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true, screenWidth: 393, screenHeight: 852 });
    await insecurePage.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await insecurePage.goto(`${lan}/play`, 5200);
    const insecure = await insecurePage.eval(`JSON.stringify({
      secure: window.isSecureContext,
      pwaSecure: window.__PWA__?.secure,
      swReg: Boolean(window.__PWA__?.registration),
      note: document.getElementById('iosInstallNote')?.textContent || '',
      title: document.getElementById('iosInstallTitle')?.textContent || '',
    })`);
    console.log('insecure', insecure);
    const insecureData = JSON.parse(insecure);
    check('T7.1 insecure detected', insecureData.secure === false && insecureData.pwaSecure === false, insecure);
    check('T7.2 http warning', insecureData.note.includes('HTTP') && insecureData.note.includes('HTTPS'), insecureData.note);
    await insecurePage.screenshot(path.join(outDir, 'ios-pwa-http.png'));

    const errors = [...page.errors, ...chromePage.errors, ...standalonePage.errors, ...nativePage.errors]
      .filter((e) => !/favicon|vibrate|ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|net::/i.test(e));
    check('T8.1 no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));

    fs.writeFileSync(path.join(outDir, 'ios-pwa-results.json'), JSON.stringify({
      when: new Date().toISOString(),
      port,
      results,
      screenshots: ['ios-pwa-sheet.png', 'ios-pwa-settings.png', 'ios-pwa-update.png', 'ios-pwa-offline.png', 'ios-pwa-chrome.png', 'ios-pwa-standalone.png', 'ios-pwa-http.png'],
    }, null, 2));
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  } finally {
    await page?.close();
    await chromePage?.close();
    await standalonePage?.close();
    await nativePage?.close();
    await insecurePage?.close();
    stopServer(server);
    await sleep(500);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
