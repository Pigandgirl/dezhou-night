// Browser smoke test: boots the real single-file client in headless Edge,
// starts a single-player table, plays for a while and captures errors/screenshot.
// Run: node qa/run-browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep, TMP_ROOT,
} from './lib/env.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

class CDP {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error(`ws error ${e.message || ''}`)));
      this.ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id) {
          const pending = this.pending.get(msg.id);
          if (!pending) return;
          this.pending.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
          return;
        }
        for (const fn of this.handlers.get(msg.method) || []) fn(msg.params);
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  close() { try { this.ws.close(); } catch { /* */ } }
}

async function waitHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function main() {
  const users = [
    makeUser({ username: 'browser_user', name: '浏览器测试', tokens: [{ token: 'btok', at: Date.now() }] }),
  ];
  const sandbox = createSandbox({ users, label: 'browser' });
  const serverPort = await freePort();
  const server = await startServer(sandbox, { port: serverPort });
  const debugPort = await freePort();
  const profileDir = path.join(TMP_ROOT, `edge-profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
    '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  try {
    const version = await waitHttp(`http://127.0.0.1:${debugPort}/json/version`);
    console.log(`edge ${version.Browser}`);
    const targets = await waitHttp(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('no page target');

    const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
    await cdp.ready;
    const errors = [];
    const consoleLines = [];
    cdp.on('Runtime.exceptionThrown', (p) => {
      errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      consoleLines.push(`${p.type}: ${text}`);
      if (p.type === 'error') errors.push(text);
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') errors.push(`${p.entry.source}: ${p.entry.text}`);
    });

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__ONLINE_BASE__='http://127.0.0.1:${serverPort}';`,
    });

    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/play` });
    await Promise.race([loaded, sleep(12000)]);
    await sleep(2500);

    const bootState = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        poker: typeof window.__poker,
        version: window.__APP_VERSION__,
        base: window.__ONLINE_BASE__,
        modeCards: document.querySelectorAll('.mode-card').length,
        lobbyVisible: !document.getElementById('lobby').classList.contains('hidden'),
        canvas: (() => { const c = document.getElementById('scene'); return c ? c.width + 'x' + c.height : 'none'; })(),
        webgl: (() => { try { return !!document.getElementById('scene').getContext('webgl2'); } catch { return false; } })(),
        loginOverlay: !document.getElementById('loginOverlay').classList.contains('hidden'),
      })`,
      returnByValue: true,
    });
    console.log('boot:', bootState.result.value);

    // Dismiss the login modal (single-player needs no account), then start.
    await cdp.send('Runtime.evaluate', {
      expression: `(() => { const b = document.getElementById('btnLoginSkip'); if (b) b.click(); return true; })()`,
      returnByValue: true,
    });
    await sleep(600);
    const clicked = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        document.querySelector('.mode-card[data-mode="single"]')?.click();
        const b = document.getElementById('btnStart');
        if (!b) return 'missing';
        b.click();
        return 'clicked';
      })()`,
      returnByValue: true,
    });
    console.log('start click:', clicked.result.value);
    await sleep(7000);
    const gameState = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        running: window.__poker.game.running,
        hand: window.__poker.game.handNumber,
        players: window.__poker.game.players.length,
        stacks: window.__poker.game.players.map(p => p.stack),
        pot: document.getElementById('potValue') ? document.getElementById('potValue').textContent : null,
      })`,
      returnByValue: true,
    });
    console.log('game:', gameState.result.value);

    // Play a few hero actions so a full hand (and the next one) completes.
    for (let i = 0; i < 10; i += 1) {
      const action = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const b = document.getElementById('btnCall');
          const bar = document.getElementById('actionbar');
          if (!b || b.disabled || !bar || bar.classList.contains('hidden')) return 'idle';
          b.click();
          return 'acted';
        })()`,
        returnByValue: true,
      });
      console.log(`action ${i}:`, action.result.value);
      if (i === 3) {
        const midShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, 'single-player.png'), Buffer.from(midShot.data, 'base64'));
      }
      await sleep(2500);
    }
    await sleep(1500);

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(outDir, 'ready-prompt.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('screenshot:', shotPath);

    const state2 = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ hand: window.__poker.game.handNumber, running: window.__poker.game.running })`,
      returnByValue: true,
    });
    console.log('after 13s:', state2.result.value);

    // Stored-XSS check: a host-controlled card rank goes through innerHTML.
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        window.__xss = 0;
        window.__poker.hud.guestTable.applyState({
          roomCode: '999', hand: 1, pot: 0, street: 'flop', phase: 'play',
          board: [{ rank: '<img src=x onerror=window.__xss=1>', suit: 's' }],
          seats: [], turn: null, winners: [],
        });
        return true;
      })()`,
      returnByValue: true,
    });
    await sleep(1200);
    const xss = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({ executed: window.__xss, injectedImg: !!document.querySelector('#gtBoard img'), html: document.getElementById('gtBoard').innerHTML.slice(0, 160) })`,
      returnByValue: true,
    });
    const xssData = JSON.parse(xss.result.value);
    console.log('xss:', xssData);
    const realErrors = errors.filter((e) => !/vibrate|favicon|404 \(Not Found\)|Failed to load resource/i.test(e));
    console.log('errors:', realErrors.length ? realErrors.slice(0, 10) : 'none');
    console.log('console:', consoleLines.slice(-8));

    cdp.close();
    fs.writeFileSync(path.join(outDir, 'browser-results.json'), JSON.stringify({
      boot: bootState.result.value,
      game: gameState.result.value,
      after13s: state2.result.value,
      xss: xssData,
      errors: realErrors,
      console: consoleLines.slice(-30),
    }, null, 2));
    if (xssData.executed !== 0 || xssData.injectedImg) {
      throw new Error('stored XSS payload executed');
    }
    if (realErrors.length) throw new Error(`client errors: ${realErrors.slice(0, 3).join(' | ')}`);
  } finally {
    try { edge.kill(); } catch { /* */ }
    execFile('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { windowsHide: true }, () => {});
    stopServer(server);
    await sleep(500);
  }
}

main().catch((error) => { console.error('FATAL', error); process.exitCode = 1; });
