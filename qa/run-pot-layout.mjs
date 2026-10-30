// Reproduce pot/community-card overlap and capture before/after screenshots.
// Run: node qa/run-pot-layout.mjs [label]
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox, startServer, stopServer, freePort, sleep } from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const label = process.argv[2] || 'before';
const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const sandbox = createSandbox({ users: [], label: `pot-${label}` });
const port = await freePort();
const server = await startServer(sandbox, { port });

async function run(name, width, height, dpr) {
  const page = await new BrowserPage(`pot-${name}`).launch();
  try {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: true, screenWidth: width, screenHeight: height });
    await page.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.goto(`http://127.0.0.1:${port}/play`, 4500);
    await page.waitFor('!!window.__poker', 15000);
    await page.eval(`document.getElementById('btnLoginSkip')?.click()`);
    await sleep(300);
    await page.eval(`document.querySelector('.mode-card[data-mode="single"]')?.click()`);
    await sleep(400);
    await page.eval(`document.getElementById('btnStart')?.click()`);
    await sleep(1800);
    await page.eval(`(() => {
      const board = [
        { rank: 11, suit: 's' },
        { rank: 13, suit: 'h' },
        { rank: 2, suit: 'd' },
        { rank: 4, suit: 'h' },
        { rank: 9, suit: 'c' },
      ];
      window.__poker.hud.setPot(234);
      window.__poker.hud.setBoardCards(board);
      window.__poker.scene.setPot(234, false);
    })()`);
    await sleep(700);
    const metrics = await page.eval(`(() => {
      const rail = document.getElementById('boardRail')?.getBoundingClientRect();
      const pot = document.querySelector('.potbox');
      const potRect = pot?.getBoundingClientRect();
      const potStyle = pot ? getComputedStyle(pot) : null;
      const s = window.__poker.scene;
      const sprite = s.potStack.labelSprite;
      let spriteScreen = null;
      if (sprite) {
        s.camera.updateMatrixWorld();
        sprite.updateMatrixWorld();
        const v = sprite.position.clone().applyMatrix4(sprite.matrixWorld);
        v.project(s.camera);
        spriteScreen = {
          x: Math.round((v.x * 0.5 + 0.5) * innerWidth),
          y: Math.round((-v.y * 0.5 + 0.5) * innerHeight),
          visible: Boolean(sprite.visible),
          scaleY: Number(sprite.scale?.y?.toFixed?.(3) || 0),
        };
      }
      return JSON.stringify({
        viewport: { w: innerWidth, h: innerHeight },
        rail: rail ? { x: Math.round(rail.x), y: Math.round(rail.y), w: Math.round(rail.width), h: Math.round(rail.height), bottom: Math.round(rail.bottom) } : null,
        potbox: potRect ? { display: potStyle.display, x: Math.round(potRect.x), y: Math.round(potRect.y), w: Math.round(potRect.width), h: Math.round(potRect.height), bottom: Math.round(potRect.bottom), text: document.getElementById('potValue')?.textContent } : null,
        potValue: document.getElementById('potValue')?.textContent,
        potSpot: { x: Number(s.potStack.group.position.x.toFixed(3)), y: Number(s.potStack.group.position.y.toFixed(3)), z: Number(s.potStack.group.position.z.toFixed(3)) },
        spriteScreen,
      });
    })()`);
    const data = JSON.parse(metrics);
    const potTop = data.potbox?.display === 'none' ? -1 : data.potbox?.y;
    const overlap = Boolean(data.rail && data.potbox && data.potbox.display !== 'none'
      && potTop < data.rail.bottom);
    const spriteVisible = Boolean(data.spriteScreen?.visible);
    const ok = Boolean(data.potbox && data.potbox.display !== 'none' && data.potValue === '234'
      && !overlap && !spriteVisible);
    console.log(name, metrics, `overlap=${overlap} spriteVisible=${spriteVisible} ok=${ok}`);
    if (!ok) process.exitCode = 1;
    await page.screenshot(path.join(outDir, `pot-${label}-${name}.png`));
  } finally {
    await page.close();
  }
}

try {
  await run('desktop', 1440, 900, 1);
  await run('web-1200x540', 1200, 540, 1);
  await run('mobile-landscape', 852, 393, 2);
  await run('portrait', 390, 844, 2);
} finally {
  stopServer(server);
  await sleep(300);
}
