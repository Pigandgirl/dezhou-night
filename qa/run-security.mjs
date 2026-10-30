// Availability / abuse regression for the hardened server.
// Run: node qa/run-security.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep,
} from './lib/env.mjs';
import { api, rawRequest, Sse } from './lib/client.mjs';

const results = [];
const observations = [];
let PORT = 0;
const call = (method, p, opts) => api(PORT, method, p, opts);
const tok = (u) => `seedtoken_${u}`;

function expect(condition, message) { if (!condition) throw new Error(message); }
function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '' });
    console.log(`[PASS] ${name}${detail ? ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`[FAIL] ${name} :: ${error.message}`);
  }
}
function obs(name, value) {
  observations.push({ name, value });
  console.log(`[OBS] ${name} = ${value}`);
}

const USERS = [];
for (let i = 0; i < 40; i += 1) {
  const username = `sec_${String(i).padStart(2, '0')}`;
  USERS.push(makeUser({
    username, name: `安全${i}`, plays: 10, chips: 100,
    tokens: [{ token: tok(username), at: Date.now() }],
  }));
}

const sandbox = createSandbox({ users: USERS, label: 'security' });
let server;

async function openSse(code, token) {
  const sse = new Sse(PORT, `/api/rooms/${code}/events?token=${token}`);
  await sse.open();
  await sse.waitFor('hello', 5000);
  return sse;
}

async function main() {
  PORT = await freePort();
  server = await startServer(sandbox, { port: PORT, env: { TURN_MS: '8000', NEXT_HAND_MS: '60000' } });

  await check('invalid Host header does not crash the server', async () => {
    const raw = await rawRequest(PORT, 'GET /api/health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');
    expect(raw.data.startsWith('HTTP/1.1'), `raw ${raw.data.slice(0, 60)}`);
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'alive');
    return raw.data.split('\r\n')[0];
  });

  await check('async scrypt keeps the event loop responsive', async () => {
    const baseline = [];
    for (let i = 0; i < 10; i += 1) baseline.push((await call('GET', '/api/health')).ms);
    const probes = [];
    const timer = setInterval(async () => {
      try {
        const r = await call('GET', '/api/health', { timeout: 5000 });
        probes.push(r.ms);
      } catch {
        probes.push(-1);
      }
    }, 100);
    const started = Date.now();
    const attempts = await Promise.all(Array.from({ length: 32 }, (_, i) => call('POST', '/api/auth/login', {
      body: { username: `sec_${String(i).padStart(2, '0')}`, password: 'wrong-pass' },
      timeout: 30000,
    }).then((r) => r.status).catch(() => -1)));
    const elapsed = Date.now() - started;
    await sleep(500);
    clearInterval(timer);
    probes.sort((a, b) => a - b);
    const p95 = probes[Math.floor(probes.length * 0.95)] || 0;
    obs('32-concurrent-logins-ms', elapsed);
    obs('health-p95-during-logins-ms', p95);
    obs('health-max-during-logins-ms', probes[probes.length - 1]);
    expect(attempts.every((status) => status === 401), `statuses ${attempts}`);
    expect(p95 < 500, `event loop blocked, p95 ${p95}ms`);
    return { elapsed, p95, max: probes[probes.length - 1] };
  });

  await check('five failed logins lock the account', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await call('POST', '/api/auth/login', { body: { username: 'sec_01', password: `bad-${i}` } });
      statuses.push(r.status);
    }
    expect(statuses.includes(429), `statuses ${statuses}`);
    return statuses;
  });

  await check('one account can only host 3 rooms', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await call('POST', '/api/rooms', {
        body: { token: tok('sec_02'), name: `q${i}`, seats: 8, password: '123' },
      });
      statuses.push(r.status);
    }
    expectEqual(statuses.filter((s) => s === 201).length, 3, 'created');
    expectEqual(statuses[3], 429, 'fourth');
    return statuses;
  });

  await check('duplicate SSE replaces the old stream', async () => {
    const created = await call('POST', '/api/rooms', {
      body: { token: tok('sec_03'), name: 'sse', seats: 8, password: '123' },
    });
    expectEqual(created.status, 201, 'room');
    const first = await openSse(created.json.code, created.json.token);
    const second = await openSse(created.json.code, created.json.token);
    await sleep(400);
    expect(first.closed, 'old stream closed');
    const health = await call('GET', '/api/health');
    expectEqual(health.json.connections, 1, 'one live connection');
    second.close();
    await sleep(300);
    return 'replaced';
  });

  await check('action flood is rate limited and server stays healthy', async () => {
    const host = await call('POST', '/api/rooms', {
      body: { token: tok('sec_04'), name: 'flood', seats: 8, password: '123' },
    });
    const guest = await call('POST', `/api/rooms/${host.json.code}/join`, {
      body: { token: tok('sec_05'), password: '123', name: 'g' },
    });
    const hostSse = await openSse(host.json.code, host.json.token);
    const guestSse = await openSse(host.json.code, guest.json.token);
    const start = await call('POST', `/api/rooms/${host.json.code}/start`, { body: { token: host.json.token } });
    expectEqual(start.status, 200, 'start');
    await sleep(400);
    const statuses = await Promise.all(Array.from({ length: 220 }, (_, i) => call('POST', `/api/rooms/${host.json.code}/action`, {
      body: { token: host.json.token, action: { type: i % 2 ? 'call' : 'check' } },
      timeout: 15000,
    }).then((r) => r.status).catch(() => -1)));
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'alive');
    const limited = statuses.filter((s) => s === 429).length;
    obs('action-flood-429', limited);
    expect(limited > 0, `no 429: ${statuses.slice(0, 20)}`);
    hostSse.close();
    guestSse.close();
    return { limited, ok: statuses.filter((s) => s === 200).length };
  });

  await check('oversized body is rejected without crashing', async () => {
    try {
      await call('POST', '/api/auth/login', {
        rawBody: JSON.stringify({ username: 'sec_00', password: 'x'.repeat(100 * 1024) }),
      });
    } catch {
      /* connection reset is acceptable */
    }
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'alive');
  });

  await check('SSE connection count is exposed and accurate', async () => {
    const health = await call('GET', '/api/health');
    expect(Number.isInteger(health.json.connections), 'connections');
    return health.json.connections;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
  fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, 'out', 'security-results.json'), JSON.stringify({ results, observations }, null, 2));
}

main()
  .catch((error) => { console.error('FATAL', error); process.exitCode = 1; })
  .finally(async () => { stopServer(server); await sleep(500); });
