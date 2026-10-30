// Admin console smoke after removing redeem-code management.
// Run: node qa/shot-admin.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox, startServer, stopServer, freePort, sleep, makeUser } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const sandbox = createSandbox({
  users: [makeUser({ username: 'admin_view', name: '后台用户', plays: 10, chips: 100 })],
  label: 'admin-shot',
});
let server;
let page;
try {
  const port = await freePort();
  server = await startServer(sandbox, {
    port,
    admin: { user: 'shotadmin', password: 'ShotAdmin!2345' },
  });
  page = await new BrowserPage('admin').launch();
  await page.goto(`http://127.0.0.1:${port}/admin`, 2500);
  await page.eval(`(() => {
    document.getElementById('loginUser').value = 'shotadmin';
    document.getElementById('loginPass').value = 'ShotAdmin!2345';
    document.getElementById('loginForm').requestSubmit();
    return true;
  })()`);
  const logged = await page.waitFor(`!document.getElementById('appView').classList.contains('hidden')`, 8000);
  await sleep(1200);
  const info = await page.eval(`JSON.stringify({
    logged: !document.getElementById('appView').classList.contains('hidden'),
    nav: [...document.querySelectorAll('.nav-btn[data-view]')].map((b) => b.dataset.view),
    stats: document.getElementById('overviewStats')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120),
    codes: !!document.getElementById('viewCodes'),
    redeem: !!document.getElementById('codeRows'),
  })`);
  console.log('logged', logged, info);
  await page.screenshot(path.join(outDir, 'admin-overview.png'));
  await page.eval(`document.querySelector('.nav-btn[data-view="features"]').click()`);
  await sleep(900);
  const features = await page.eval(`JSON.stringify({
    visible: !document.getElementById('viewFeatures').classList.contains('hidden'),
    match: document.getElementById('featureMatch')?.checked,
    lan: document.getElementById('featureLan')?.checked,
    state: document.getElementById('featureState')?.textContent,
  })`);
  console.log('features', features);
  await page.screenshot(path.join(outDir, 'admin-features.png'));
  console.log('errors', page.errors.filter((e) => !/vibrate|favicon|404/i.test(e)));
} finally {
  await page?.close();
  stopServer(server);
  await sleep(500);
}
