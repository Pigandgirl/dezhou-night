import { BrowserPage } from './lib/browser.mjs';
import { sleep } from './lib/env.mjs';

const page = await new BrowserPage('loader-local').launch();
try {
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 1, mobile: true, screenWidth: 852, screenHeight: 393 });
  await page.goto('http://127.0.0.1:18080/play', 3000);
  const ok = await page.waitFor('!!window.__poker', 20000);
  const info = await page.eval(`JSON.stringify({
    title: document.title,
    poker: Boolean(window.__poker),
    stage: window.__loaderStage || '',
    error: window.__loaderError || '',
    body: document.body?.innerText?.slice(0, 100) || '',
  })`);
  console.log(info);
  console.log('errors', page.errors.slice(0, 5));
  await page.screenshot('qa/out/loader-local.png');
  if (!ok) process.exitCode = 1;
} finally {
  await page.close();
  await sleep(200);
}
