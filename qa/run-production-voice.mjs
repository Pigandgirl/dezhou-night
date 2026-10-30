// Production web TTS check with Android Chrome UA and trusted clicks.
import { sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const page = await new BrowserPage('web-voice-production').launch();
async function clickAt(selector) {
  const raw = await page.eval(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return ''; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0 }); })()`);
  if (!raw) return false;
  const r = JSON.parse(raw);
  if (!r.visible) return false;
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}
try {
  await page.cdp.send('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l', acceptLanguage: 'zh-CN,zh;q=0.9' });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenWidth: 412, screenHeight: 915 });
  await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto('http://192.144.159.220:8080/play', 5000);
  await page.waitFor('!!window.__poker', 15000);
  await sleep(600);
  console.log('skip', await clickAt('#btnLoginSkip'));
  await sleep(400);
  console.log('single', await clickAt('.mode-card[data-mode="single"]'));
  await sleep(500);
  console.log('start', await clickAt('#btnStart'));
  await sleep(1500);
  const samples = [];
  for (let i = 0; i < 14; i += 1) {
    samples.push(JSON.parse(await page.eval(`(() => {
      const a = window.__poker?.audio;
      return JSON.stringify({
        t: ${i},
        running: Boolean(window.__poker?.game?.running),
        ctx: a?.ctx?.state,
        buffers: a?.voiceBuffers?.size,
        queue: a?.speechQueue?.length,
        busy: a?.speechBusy,
        sources: a?.voiceSources?.length,
        resources: performance.getEntriesByType('resource').filter((e) => e.name.includes('/voice/')).length,
      });
    })()`)));
    await sleep(500);
  }
  console.log('samples', JSON.stringify(samples));
  console.log('logs', page.logs.filter((line) => /voice|audio/i.test(line)).slice(-10));
  console.log('errors', page.errors.slice(-5));
  await page.screenshot('qa/out/web-voice-production.png');
} finally {
  await page.close();
  await sleep(300);
}
