// Single-player settlement regression: play a real 3D hand, verify the
// in-place first-person settlement list, and ensure the camera does not move.
// Run: node qa/run-single-settle.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox, startServer, stopServer, freePort, sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const sandbox = createSandbox({ users: [], label: 'single-settle' });
let server;
let page;
try {
  const port = await freePort();
  server = await startServer(sandbox, { port });
  page = await new BrowserPage('single-settle').launch();
  await page.goto(`http://127.0.0.1:${port}/play`, 4500);
  await page.waitFor(`!!window.__poker`, 8000);
  await sleep(800);

  const started = await page.eval(`(() => {
    document.querySelector('.mode-card[data-mode="single"]')?.click();
    document.querySelector('#seatSegs button[data-value="2"]')?.click();
    const stack = document.getElementById('stackInput');
    if (stack) {
      stack.value = '100';
      stack.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('btnStart')?.click();
    return JSON.stringify({ running: window.__poker.game.running, seats: window.__poker.game.players.length });
  })()`);
  console.log('start', started);
  await sleep(3800);

  const audioState = await page.eval(`(() => {
    const a = window.__poker.audio;
    a.init();
    return JSON.stringify({ ctx: a.ctx ? a.ctx.state : null, music: Boolean(a.musicTimer), ambience: Boolean(a.ambienceSource) });
  })()`);
  const idle1 = await page.eval(`window.__poker.scene.rigs[1]?.headGroup.rotation.y ?? 0`);
  await sleep(700);
  const idle2 = await page.eval(`window.__poker.scene.rigs[1]?.headGroup.rotation.y ?? 0`);
  console.log('audio', audioState, 'idle', idle1, idle2);
  if (Math.abs(idle2 - idle1) < 0.0005) throw new Error('3D player idle animation is not moving');

  const cameraBefore = await page.eval(`JSON.stringify(window.__poker.scene.camera ? {
    x: window.__poker.scene.camera.position.x,
    y: window.__poker.scene.camera.position.y,
    z: window.__poker.scene.camera.position.z,
  } : null)`);
  console.log('camera before', cameraBefore);

  let sawSettle = false;
  let snap = null;
  for (let i = 0; i < 180; i += 1) {
    const state = JSON.parse(await page.eval(`JSON.stringify({
      visible: !document.getElementById('singleSettle')?.classList.contains('hidden'),
      hand: window.__poker.game.handNumber,
      running: window.__poker.game.running,
      actionVisible: !document.getElementById('actionbar')?.classList.contains('hidden'),
    })`));
    if (state.visible) {
      sawSettle = true;
      snap = await page.eval(`JSON.stringify({
        title: document.getElementById('singleSettleTitle')?.textContent,
        timer: document.getElementById('singleSettleTimer')?.textContent,
        rows: document.querySelectorAll('#singleSettleList .gt-show-row').length,
        cards: document.querySelectorAll('#singleSettleList .gt-show-cards .card-tile').length,
        best: document.querySelectorAll('#singleSettleList .gt-show-cards.best .card-tile').length,
        reasons: [...document.querySelectorAll('#singleSettleList .gt-show-reason')].map((el) => el.textContent),
        details: [...document.querySelectorAll('#singleSettleList .gt-show-name em')].map((el) => el.textContent),
        won: [...document.querySelectorAll('#singleSettleList .gt-show-won')].map((el) => el.textContent),
        rect: (() => { const r = document.getElementById('singleSettle').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; })(),
        next: (() => { const b = document.getElementById('btnSettleNext'); const r = b.getBoundingClientRect(); return { top: Math.round(r.top), text: b.textContent.trim() }; })(),
        camera: window.__poker.scene.camera ? {
          x: window.__poker.scene.camera.position.x,
          y: window.__poker.scene.camera.position.y,
          z: window.__poker.scene.camera.position.z,
        } : null,
      })`);
      break;
    }
    if (!state.running) break;
    if (state.actionVisible) {
      await page.eval(`(() => { const b = document.getElementById('btnCall'); if (b && !b.disabled) b.click(); return true; })()`);
    }
    await sleep(350);
  }

  console.log('settlement', snap);
  if (!sawSettle) throw new Error('single-player settlement panel did not appear');
  const data = JSON.parse(snap);
  if (!data.rows || !data.reasons.every(Boolean)) throw new Error('settlement rows/reasons missing');
  if (data.rect.top < 0 || data.rect.bottom > 900) throw new Error('settlement panel outside viewport');
  if (!data.next || data.next.top > data.rect.top + 90) throw new Error('settlement continue is not top-right');
  const exitButton = await page.eval(`Boolean(document.getElementById('btnSettleExit'))`);
  if (exitButton) throw new Error('settlement must not have an exit button');
  const before = JSON.parse(cameraBefore);
  if (before && data.camera) {
    const drift = Math.abs(before.x - data.camera.x) + Math.abs(before.y - data.camera.y) + Math.abs(before.z - data.camera.z);
    if (drift > 0.02) throw new Error(`camera moved during settlement: ${drift}`);
  }
  await page.screenshot(path.join(outDir, 'single-settle.png'));

  await page.eval(`document.getElementById('btnSettleNext')?.click()`);
  let after = null;
  for (let i = 0; i < 40; i += 1) {
    after = JSON.parse(await page.eval(`JSON.stringify({ hidden: document.getElementById('singleSettle').classList.contains('hidden'), hand: window.__poker.game.handNumber, running: window.__poker.game.running })`));
    if (after.hand > 1) break;
    await sleep(300);
  }
  console.log('after next', after);
  if (!after || after.hand < 2) throw new Error('next hand did not start after continue');

  // Second hand: hero folds, so the settlement must still reveal the winner's hole cards.
  let foldSnap = null;
  for (let i = 0; i < 100; i += 1) {
    const state = JSON.parse(await page.eval(`JSON.stringify({
      visible: !document.getElementById('singleSettle')?.classList.contains('hidden'),
      actionVisible: !document.getElementById('actionbar')?.classList.contains('hidden'),
      hand: window.__poker.game.handNumber,
    })`));
    if (state.visible) {
      foldSnap = await page.eval(`JSON.stringify({
        title: document.getElementById('singleSettleTitle')?.textContent,
        rows: document.querySelectorAll('#singleSettleList .gt-show-row').length,
        cards: document.querySelectorAll('#singleSettleList .gt-show-cards .card-tile').length,
        reason: document.querySelector('#singleSettleList .gt-show-reason')?.textContent,
        won: document.querySelector('#singleSettleList .gt-show-won')?.textContent,
        noshow: document.querySelector('#singleSettleList .gt-show-noshow')?.textContent,
        hand: window.__poker.game.handNumber,
      })`);
      break;
    }
    if (state.actionVisible) {
      await page.eval(`(() => { const b = document.getElementById('btnFold'); if (b && !b.disabled) b.click(); return true; })()`);
    }
    await sleep(300);
  }
  console.log('fold settlement', foldSnap);
  const foldData = foldSnap ? JSON.parse(foldSnap) : null;
  if (!foldData || foldData.rows !== 1 || foldData.cards !== 2 || !String(foldData.title).includes('弃牌')) {
    throw new Error('single-player fold-win settlement missing winner hole cards');
  }
  await page.screenshot(path.join(outDir, 'single-fold-settle.png'));

  fs.writeFileSync(path.join(outDir, 'single-settle-results.json'), JSON.stringify({
    started: JSON.parse(started), audio: JSON.parse(audioState), idle: { first: idle1, second: idle2 },
    cameraBefore: before, settlement: data, after,
    foldSettlement: foldData,
    errors: page.errors.filter((e) => !/vibrate|favicon/i.test(e)),
    logs: page.logs.slice(-30),
  }, null, 2));
} finally {
  await page?.close();
  stopServer(server);
  await sleep(500);
}
