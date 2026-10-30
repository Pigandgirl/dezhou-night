// Reproduce web TTS: Android Chrome UA, tap start with a trusted input,
// inspect AudioContext / voice pack / speech queue / voice demo.
// Run: node qa/run-web-voice.mjs
import { createSandbox, startServer, stopServer, freePort, sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const sandbox = createSandbox({ users: [], label: 'web-voice' });
const port = await freePort();
const server = await startServer(sandbox, { port });
const page = await new BrowserPage('web-voice').launch();
try {
  await page.cdp.send('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l', acceptLanguage: 'zh-CN,zh;q=0.9' });
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true, screenWidth: 412, screenHeight: 915 });
  await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.goto(`http://127.0.0.1:${port}/play`, 4500);
  await page.waitFor('!!window.__poker', 15000);
  await sleep(600);

  const skipRect = await page.eval(`(() => { const b = document.getElementById('btnLoginSkip'); if (!b) return ''; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0 }); })()`);
  console.log('skip', skipRect);
  if (skipRect) {
    const r = JSON.parse(skipRect);
    if (r.visible) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(400);
    }
  }

  const modeRect = await page.eval(`(() => { const b = document.querySelector('.mode-card[data-mode="single"]'); if (!b) return ''; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0 }); })()`);
  console.log('single mode', modeRect);
  if (modeRect) {
    const r = JSON.parse(modeRect);
    if (r.visible) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(500);
    }
  }

  const startRect = await page.eval(`(() => { const b = document.getElementById('btnStart'); if (!b) return ''; const r = b.getBoundingClientRect(); return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0 }); })()`);
  console.log('start', startRect);
  if (startRect) {
    const r = JSON.parse(startRect);
    if (r.visible) {
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    }
  }
  await sleep(1500);

  const samples = [];
  for (let i = 0; i < 16; i += 1) {
    samples.push(JSON.parse(await page.eval(`(() => {
      const a = window.__poker?.audio;
      return JSON.stringify({
        t: ${i},
        running: Boolean(window.__poker?.game?.running),
        active: !document.getElementById('hud')?.classList.contains('hidden'),
        ctx: a?.ctx?.state,
        buffers: a?.voiceBuffers?.size,
        queue: a?.speechQueue?.length,
        busy: a?.speechBusy,
        sources: a?.voiceSources?.length,
      });
    })()`)));
    await sleep(500);
  }
  console.log('samples', JSON.stringify(samples));

  const state = await page.eval(`(() => {
    const a = window.__poker?.audio;
    return JSON.stringify({
      audio: Boolean(a),
      settings: a?.settings,
      ctxState: a?.ctx?.state,
      voiceProfile: a?.voiceProfile,
      voiceBuffers: a?.voiceBuffers?.size,
      packProfile: a?.voicePackProfile,
      speechQueue: a?.speechQueue?.length,
      speechBusy: a?.speechBusy,
      voiceSources: a?.voiceSources?.length,
      gameRunning: Boolean(window.__poker?.game?.running),
      panelHidden: document.getElementById('hud')?.classList.contains('hidden'),
      voiceResources: performance.getEntriesByType('resource')
        .filter((e) => e.name.includes('/voice/')).length,
    });
  })()`);
  console.log('state', state);

  await page.eval(`(() => { window.__poker?.audio?.init?.(); window.__poker?.audio?.speakVoiceDemo?.(); })()`);
  await sleep(2500);
  const after = await page.eval(`(() => {
    const a = window.__poker?.audio;
    return JSON.stringify({
      ctxState: a?.ctx?.state,
      voiceBuffers: a?.voiceBuffers?.size,
      packProfile: a?.voicePackProfile,
      queue: a?.speechQueue?.length,
      busy: a?.speechBusy,
      sources: a?.voiceSources?.length,
      demo: a?.voiceBuffers?.get?.('demo')?.duration || 0,
    });
  })()`);
  console.log('after', after);
  console.log('logs', page.logs.filter((line) => /voice|audio/i.test(line)).slice(-8));
  console.log('errors', page.errors.slice(-5));
  await page.screenshot(`qa/out/web-voice-${port}.png`);
} finally {
  await page.close();
  stopServer(server);
  await sleep(300);
}

