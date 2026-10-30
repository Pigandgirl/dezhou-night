// Minimal CDP helper for headless Edge.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { freePort, sleep, TMP_ROOT } from './env.mjs';

const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

class CDP {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', () => reject(new Error('websocket error')));
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
      const r = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error(`timeout ${url}`);
}

export class BrowserPage {
  constructor(label, options = {}) {
    this.label = label;
    this.extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];
    this.errors = [];
    this.logs = [];
    this.child = null;
    this.cdp = null;
    this.debugPort = 0;
    this.profileDir = '';
  }

  async launch() {
    this.debugPort = await freePort();
    this.profileDir = path.join(TMP_ROOT, `edge-${this.label}-${Date.now()}`);
    fs.mkdirSync(this.profileDir, { recursive: true });
    this.child = spawn(EDGE, [
      '--headless=new',
      `--remote-debugging-port=${this.debugPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
      '--mute-audio',
      ...this.extraArgs,
      'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    await waitHttp(`http://127.0.0.1:${this.debugPort}/json/version`);
    const targets = await waitHttp(`http://127.0.0.1:${this.debugPort}/json/list`);
    const target = targets.find((t) => t.type === 'page');
    if (!target) throw new Error('no page target');
    this.cdp = new CDP(target.webSocketDebuggerUrl);
    await this.cdp.ready;
    this.cdp.on('Runtime.exceptionThrown', (p) => {
      this.errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
    });
    this.cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      this.logs.push(`${p.type}: ${text}`);
      if (p.type === 'error') this.errors.push(text);
    });
    this.cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') this.errors.push(`${p.entry.source}: ${p.entry.text}`);
    });
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    await this.cdp.send('Log.enable');
    return this;
  }

  async initScript(source) {
    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  async goto(url, waitMs = 2500) {
    await this.cdp.send('Page.navigate', { url });
    await sleep(waitMs);
  }

  async eval(expression) {
    const result = await this.cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async waitFor(expression, timeoutMs = 10000, interval = 150) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.eval(expression).catch(() => null);
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  async screenshot(file) {
    const shot = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return file;
  }

  async close() {
    this.cdp?.close();
    try { this.child?.kill(); } catch { /* */ }
    if (this.child) {
      execFile('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    }
  }
}
