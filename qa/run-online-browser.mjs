// Two real browser clients on the server-authoritative online 3D table.
// Run: node qa/run-online-browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep,
} from './lib/env.mjs';
import { api } from './lib/client.mjs';
import { BrowserPage } from './lib/browser.mjs';

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const tok = (u) => `seedtoken_${u}`;

const sandbox = createSandbox({
  users: [
    makeUser({ username: 'ob_a', name: '浏览器A', plays: 10, chips: 100, tokens: [{ token: tok('ob_a'), at: Date.now() }] }),
    makeUser({ username: 'ob_b', name: '浏览器B', plays: 10, chips: 100, tokens: [{ token: tok('ob_b'), at: Date.now() }] }),
  ],
  label: 'online-browser',
  patches: [{
    find: 'const MATCH_COUNTDOWN_MS = 60 * 1000;',
    replace: 'const MATCH_COUNTDOWN_MS = 1400;',
  }],
});
let server;
let pageA;
let pageB;

async function main() {
  const port = await freePort();
  server = await startServer(sandbox, { port, env: { NEXT_HAND_MS: '60000' } });
  console.log('server', port);

  pageA = await new BrowserPage('a').launch();
  pageB = await new BrowserPage('b').launch();

  for (const [page, token, label] of [[pageA, tok('ob_a'), 'A'], [pageB, tok('ob_b'), 'B']]) {
    await page.goto(`http://127.0.0.1:${port}/play`, 3500);
    const booted = await page.waitFor(`typeof window.__poker === 'object'`, 8000);
    if (!booted) throw new Error(`${label}: client did not boot`);
    await page.eval(`localStorage.setItem('pokerToken', ${JSON.stringify(token)}); location.reload(); true`);
    await sleep(3000);
    const logged = await page.waitFor(`!!(window.__poker && window.__poker.hud.accountUI.service.account)`, 8000);
    if (!logged) throw new Error(`${label}: not logged in`);
  }

  await pageA.eval(`window.__poker.hud.setLobbyMode('match'); window.__poker.hud.quickMatch(); true`);
  await sleep(350);
  await pageB.eval(`window.__poker.hud.setLobbyMode('match'); window.__poker.hud.quickMatch(); true`);

  const roomA = await pageA.waitFor(`window.__poker.online.room && window.__poker.online.room.code`, 8000);
  const roomB = await pageB.waitFor(`window.__poker.online.room && window.__poker.online.room.code`, 8000);
  console.log('rooms', roomA, roomB);
  if (!roomA || roomA !== roomB) throw new Error(`rooms differ: ${roomA}/${roomB}`);

  const activeA = await pageA.waitFor(`window.__poker.online3d.active`, 12000);
  const activeB = await pageB.waitFor(`window.__poker.online3d.active`, 12000);
  if (!activeA || !activeB) throw new Error('3D table did not open');
  await sleep(1800);

  const layout = await pageA.eval(`JSON.stringify({
    guest: getComputedStyle(document.getElementById('guestTable')).display,
    hud: document.getElementById('hud').className,
    players: window.__poker.scene.playerCount,
    hero: window.__poker.online3d.heroSeat,
    hand: window.__poker.online3d.state?.hand,
    hole: document.getElementById('heroHand').innerText,
    canvas: document.getElementById('scene').width > 0,
  })`);
  console.log('3d layout', layout);
  const ui = JSON.parse(layout);
  if (ui.guest !== 'none') throw new Error('2D online table still visible');
  if (ui.players < 2 || ui.hero !== 0 || !ui.canvas) throw new Error(`bad 3D table: ${layout}`);
  if (!ui.hole) throw new Error('hero hole cards missing in HUD');
  await pageA.screenshot(path.join(outDir, 'online-3d-table.png'));

  // Drive a hand to showdown with the same HUD buttons single-player uses.
  let sawAction = false;
  for (let i = 0; i < 80; i += 1) {
    for (const page of [pageA, pageB]) {
      const canAct = await page.eval(`!document.getElementById('actionbar').classList.contains('hidden')`);
      if (canAct) {
        const before = await page.eval(`window.__poker.online3d.state?.turn?.seat`);
        await page.eval(`document.getElementById('btnCall').click()`);
        sawAction = true;
        await sleep(80);
        const after = await page.eval(`window.__poker.online3d.state?.turn?.seat`);
        if (before === after) await sleep(200);
        break;
      }
    }
    const phase = await pageA.eval(`window.__poker.online3d.state?.phase`);
    if (phase === 'settle') break;
    await sleep(380);
  }
  if (!sawAction) throw new Error('no online action bar appeared');
  const settleState = await pageA.waitFor(`window.__poker.online3d.state?.phase === 'settle'`, 10000);
  if (!settleState) throw new Error('hand did not reach settlement');

  const settle = await pageA.eval(`JSON.stringify({
    overlay: !document.getElementById('singleSettle').classList.contains('hidden'),
    guest: getComputedStyle(document.getElementById('guestTable')).display,
    rows: document.querySelectorAll('#singleSettleList .settle-row').length,
    board: document.querySelectorAll('#singleSettleBoard .card-tile').length,
    nextText: document.getElementById('btnSettleNext').textContent,
    ready: document.getElementById('singleSettleTimer').textContent,
    online: window.__poker.online3d.active,
  })`);
  console.log('settlement', settle);
  const s = JSON.parse(settle);
  if (!s.overlay || s.guest !== 'none' || s.rows < 2 || !s.online) throw new Error(`bad 3D settlement: ${settle}`);
  if (!/继续下一把|已准备/.test(s.nextText)) throw new Error(`bad next button: ${s.nextText}`);
  await pageA.screenshot(path.join(outDir, 'online-3d-settle.png'));

  await pageA.eval(`document.getElementById('btnSettleNext').click()`);
  await pageB.eval(`document.getElementById('btnSettleNext').click()`);
  const next = await pageA.waitFor(`window.__poker.online3d.state?.hand >= 2`, 5000);
  if (!next) throw new Error('next hand did not start');
  const nextState = await pageA.eval(`JSON.stringify({
    hand: window.__poker.online3d.state?.hand,
    phase: window.__poker.online3d.state?.phase,
    settle: !document.getElementById('singleSettle').classList.contains('hidden'),
  })`);
  console.log('next hand', nextState);
  const n = JSON.parse(nextState);
  if (n.hand < 2 || n.phase === 'settle' || n.settle) throw new Error(`next hand failed: ${nextState}`);

  const errors = [...pageA.errors, ...pageB.errors].filter((e) => !/vibrate|favicon|404/i.test(e));
  console.log('errors', errors.length ? errors.slice(0, 6) : 'none');
  if (errors.length) throw new Error(errors[0]);
  fs.writeFileSync(path.join(outDir, 'online-3d-results.json'), JSON.stringify({
    roomA, roomB, layout: ui, settlement: s, next: n, errors,
  }, null, 2));
}

try {
  await main();
  console.log('ONLINE 3D OK');
} catch (error) {
  console.error('ONLINE 3D FAILED', error.stack || error.message);
  process.exitCode = 1;
} finally {
  if (pageA) await pageA.close();
  if (pageB) await pageB.close();
  if (server) await stopServer(server);
}
