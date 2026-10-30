// QA harness: sandbox copy of the server + process helpers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';

export const PROJECT = path.resolve(import.meta.dirname, '..', '..');
export const SERVER_SRC = path.join(PROJECT, 'server');
export const TMP_ROOT = path.join(os.tmpdir(), 'dezhou-qa');

export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function pwdHash(password) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function makeUser({
  username, password = 'pass1234', name = '', points = 1000, todayPoints = 100,
  plays = 50, chips = 100, totalRecharge = 0, rounds = 0, tokens = [],
  createdAt = Date.now(), hash = true,
} = {}) {
  if (!username) throw new Error('username required');
  return {
    username,
    name: name || username,
    pwdHash: hash ? pwdHash(password) : 'seed:00',
    points,
    todayPoints,
    todayDate: dayKey(),
    plays,
    chips,
    chipsAt: Date.now(),
    totalRecharge,
    rounds,
    honors: [],
    tokens,
    createdAt,
  };
}

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function createSandbox({ users = [], codes = [], label = 'run', patches = [] } = {}) {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const dir = path.join(TMP_ROOT, `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  fs.cpSync(SERVER_SRC, dir, { recursive: true });
  for (const patch of patches) {
    const target = path.join(dir, patch.file || 'server.js');
    const source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    if (!source.includes(patch.find)) throw new Error(`patch target not found: ${patch.find.slice(0, 60)}`);
    fs.writeFileSync(target, source.replace(patch.find, patch.replace));
  }
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const store = {
    users,
    codes,
    history: [],
    meta: { currentDay: dayKey(), lastHonor: null },
  };
  fs.writeFileSync(path.join(dir, 'data', 'store.json'), JSON.stringify(store));
  return { dir, storePath: path.join(dir, 'data', 'store.json') };
}

export function readStore(sandbox) {
  try {
    return JSON.parse(fs.readFileSync(sandbox.storePath, 'utf8'));
  } catch {
    return null;
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer(sandbox, { port, env = {}, admin = null } = {}) {
  const logFile = path.join(sandbox.dir, `server-${port}.log`);
  const out = fs.openSync(logFile, 'a');
  const childEnv = { ...process.env, PORT: String(port), ...env };
  if (admin) {
    childEnv.ADMIN_USER = admin.user;
    childEnv.ADMIN_PASSWORD = admin.password;
  }
  const child = spawn(process.execPath, ['server.js'], {
    cwd: sandbox.dir,
    env: childEnv,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.__logFile = logFile;
  child.__port = port;
  child.on('exit', () => { try { fs.closeSync(out); } catch { /* */ } });
  const ok = await waitForHealth(port, 12000).catch(() => false);
  if (!ok) {
    const log = safeRead(logFile);
    stopServer(child);
    throw new Error(`server did not start on ${port}\n${log}`);
  }
  return child;
}

export function safeRead(file, max = 6000) {
  try {
    return fs.readFileSync(file, 'utf8').slice(-max);
  } catch {
    return '';
  }
}

export async function waitForHealth(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await sleep(120);
  }
  throw new Error('health timeout');
}

export function waitExit(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

export function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  try { child.kill(); } catch { /* */ }
  setTimeout(() => {
    if (child.exitCode === null) {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    }
  }, 1500).unref?.();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Server RSS in MB via tasklist (Windows). Returns null when unavailable. */
export function serverRssMb(pid) {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = /"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/.exec(stdout);
      if (!match) return resolve(null);
      const mem = Number(String(match[5]).replace(/[^\d]/g, ''));
      resolve(Number.isFinite(mem) ? Math.round((mem / 1024) * 10) / 10 : null);
    });
  });
}

export class Sampler {
  constructor(pid, intervalMs = 1000) {
    this.pid = pid;
    this.intervalMs = intervalMs;
    this.samples = [];
    this.timer = null;
  }

  start() {
    const tick = async () => {
      const t = Date.now();
      const mb = await serverRssMb(this.pid).catch(() => null);
      if (mb !== null) this.samples.push({ t, mb });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    if (this.timer.unref) this.timer.unref();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this;
  }

  get peakMb() {
    return this.samples.reduce((max, s) => Math.max(max, s.mb), 0);
  }

  get firstMb() {
    return this.samples.length ? this.samples[0].mb : 0;
  }

  get lastMb() {
    return this.samples.length ? this.samples[this.samples.length - 1].mb : 0;
  }
}
