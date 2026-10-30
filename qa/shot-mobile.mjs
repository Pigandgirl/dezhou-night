// Mobile viewport smoke: landscape (APK orientation) and portrait screenshots.
// Run: node qa/shot-mobile.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox, startServer, stopServer, freePort, sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const sandbox = createSandbox({ users: [], label: 'mobile-shot' });
let server;
let page;
try {
  const port = await freePort();
  server = await startServer(sandbox, { port });
  page = await new BrowserPage('mobile').launch();

  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 1, mobile: true,
  });
  await page.goto(`http://127.0.0.1:${port}/play`, 4500);
  await page.waitFor(`!!window.__poker`, 8000);
  await sleep(1200);
  const landscape = await page.eval(`JSON.stringify({
    w: innerWidth, h: innerHeight,
    scroll: document.documentElement.scrollHeight,
    stageBottom: Math.round(document.querySelector('.lobby-stage').getBoundingClientRect().bottom),
    cards: document.querySelectorAll('.mode-card').length,
  })`);
  console.log('landscape', landscape);
  await page.screenshot(path.join(outDir, 'lobby-mobile-landscape.png'));

  const mobileSettle = await page.eval(`(() => {
    const gt = window.__poker.hud.guestTable;
    gt.show('');
    gt.youSeat = 0;
    gt.ownHole = [];
    const card = (rank, suit) => ({ rank, suit, key: rank + suit });
    const board = [card(9, 's'), card(7, 'h'), card(7, 'd'), card(11, 'c'), card(8, 's')];
    const rowA = { seat: 0, name: 'A', hole: [card(10, 'c'), card(10, 'd')], bestCards: [card(10, 'c'), card(10, 'd'), card(9, 's'), card(8, 's'), card(11, 'c')], handName: '顺子', handDetail: '顺子 J 高', score: [4, 11], won: 100, rank: 1, winner: true, reason: '顺子 J 高，为全场最大牌型，赢得底池' };
    const rowB = { seat: 1, name: 'B', hole: [card(7, 'c'), card(2, 'c')], bestCards: [card(7, 'c'), card(7, 'h'), card(7, 'd'), card(11, 'c'), card(9, 's')], handName: '三条', handDetail: '三条 7，J 踢脚', score: [3, 7, 11], won: 0, rank: 2, winner: false, reason: '顺子 J 高 大于 三条 7，J 踢脚' };
    gt.applyState({
      roomCode: 'TEST', hand: 1, dealer: 0, street: 'river', pot: 100,
      phase: 'settle', showdown: true, nextHandAt: Date.now() + 15000, board,
      winners: [{ seat: 0, name: 'A', amount: 100 }],
      seats: [
        { seat: 0, name: 'A', stack: 200, folded: false, won: 100, hole: rowA.hole, handName: '顺子', handDetail: '顺子 J 高', bestCards: rowA.bestCards, score: [4, 11], revealed: true },
        { seat: 1, name: 'B', stack: 0, folded: false, won: 0, hole: rowB.hole, handName: '三条', handDetail: '三条 7，J 踢脚', bestCards: rowB.bestCards, score: [3, 7, 11], revealed: true },
      ],
      settlement: { showdown: true, pot: 100, contenders: [rowA, rowB], folded: [], winners: [{ seat: 0, name: 'A', amount: 100 }] },
    });
    const rect = document.getElementById('gtShowdown').getBoundingClientRect();
    return JSON.stringify({ top: Math.round(rect.top), bottom: Math.round(rect.bottom), h: Math.round(rect.height), rows: document.querySelectorAll('#gtShowdownList .gt-show-row').length, win: innerHeight });
  })()`);
  console.log('mobile settle', mobileSettle);
  const mobileCss = await page.eval(`(() => {
    const row = document.querySelector('#gtShowdownList .gt-show-row');
    const main = document.querySelector('#gtShowdownList .gt-show-main');
    const name = document.querySelector('#gtShowdownList .gt-show-name');
    const block = document.querySelector('#gtShowdownList .gt-show-cards-block');
    const r = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
    return JSON.stringify({
      rowClass: row?.className,
      rowDisplay: row ? getComputedStyle(row).display : null,
      rowGrid: row ? getComputedStyle(row).gridTemplateColumns : null,
      mainDisplay: main ? getComputedStyle(main).display : null,
      row: r(row), main: r(main), name: r(name), block: r(block),
      html: row ? row.innerHTML.slice(0, 300) : null,
      children: row ? [...row.children].map((c) => ({ cls: c.className, x: Math.round(c.getBoundingClientRect().x), w: Math.round(c.getBoundingClientRect().width), col: getComputedStyle(c).gridColumn, rowStart: getComputedStyle(c).gridRow })) : null,
    });
  })()`);
  console.log('mobile css', mobileCss);
  const ms = JSON.parse(mobileSettle);
  if (ms.rows !== 2 || ms.top < 0 || ms.bottom > ms.win) throw new Error('mobile settlement overflows');
  await sleep(500);
  await page.screenshot(path.join(outDir, 'lobby-mobile-settle.png'));

  await page.cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await page.goto(`http://127.0.0.1:${port}/play`, 4000);
  await sleep(800);
  const portrait = await page.eval(`JSON.stringify({
    w: innerWidth, h: innerHeight,
    scroll: document.documentElement.scrollHeight,
  })`);
  console.log('portrait', portrait);
  await page.screenshot(path.join(outDir, 'lobby-mobile-portrait.png'));
  console.log('errors', page.errors.filter((e) => !/vibrate|favicon/i.test(e)));
} finally {
  await page?.close();
  stopServer(server);
  await sleep(500);
}
