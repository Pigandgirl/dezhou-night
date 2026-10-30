// End-to-end integration tests for the hardened server + authoritative engine.
// Run: node qa/run-integration.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep, dayKey,
} from './lib/env.mjs';
import { api, rawRequest, Sse } from './lib/client.mjs';

const results = [];
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

const admin = { user: 'qaadmin', password: 'QaAdmin!2345' };
const USERS = [
  makeUser({
    username: 'e2e_host', name: '房主', plays: 10, chips: 100,
    tokens: [{ token: tok('e2e_host'), at: Date.now() }],
  }),
  makeUser({
    username: 'e2e_guest', name: '客人', plays: 10, chips: 100,
    tokens: [{ token: tok('e2e_guest'), at: Date.now() }],
  }),
  makeUser({
    username: 'e2e_watch', name: '观战者', plays: 10, chips: 100,
    tokens: [{ token: tok('e2e_watch'), at: Date.now() }],
  }),
];

const sandbox = createSandbox({ users: USERS, label: 'e2e' });
let server;

async function openSse(code, token) {
  const sse = new Sse(PORT, `/api/rooms/${code}/events?token=${token}`);
  await sse.open();
  await sse.waitFor('hello', 5000);
  return sse;
}

function actFor(state, hostToken, guestToken) {
  if (!state || !state.turn || state.phase !== 'play') return null;
  const seat = state.turn.seat;
  const token = seat === 0 ? hostToken : guestToken;
  const legal = state.turn.legal || {};
  const type = legal.canCheck ? 'check' : 'call';
  return { token, action: { type } };
}

async function playOneHand({ stateRef, hostToken, guestToken, settledRef }) {
  const started = Date.now();
  let lastKey = '';
  while (Date.now() - started < 20000) {
    const state = stateRef.value;
    if (state && state.phase === 'settle') return true;
    const intent = actFor(state, hostToken, guestToken);
    if (intent) {
      const key = `${state.hand}:${state.turn.seat}:${state.street}:${state.turn.legal.toCall}`;
      if (key !== lastKey) {
        lastKey = key;
        await call('POST', `/api/rooms/${state.roomCode}/action`, { body: { token: intent.token, action: intent.action } });
      }
    }
    await sleep(120);
  }
  return false;
}

async function main() {
  PORT = await freePort();
  server = await startServer(sandbox, {
    port: PORT,
    admin,
    env: { PUBLIC_ORIGIN: 'https://poker.example', TURN_MS: '8000', NEXT_HAND_MS: '60000' },
  });

  await check('health endpoint', async () => {
    const r = await call('GET', '/api/health');
    expectEqual(r.status, 200, 'status');
    expectEqual(r.json.service, 'dezhounight', 'service');
    expect(r.json.connections === 0, 'connections');
  });

  await check('host header with space does not crash', async () => {
    const raw = await rawRequest(PORT, 'GET /api/health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n');
    expect(raw.data.startsWith('HTTP/1.1'), `raw: ${raw.data.slice(0, 80)}`);
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'server alive');
    return raw.data.split('\r\n')[0];
  });

  await check('security headers', async () => {
    const r = await call('GET', '/api/health');
    expectEqual(r.headers['x-content-type-options'], 'nosniff', 'nosniff');
    expectEqual(r.headers['x-frame-options'], 'DENY', 'frame');
  });

  await check('async register + 10 plays', async () => {
    const r = await call('POST', '/api/auth/register', {
      body: { username: 'e2e_new', password: 'pass1234', name: '新人' },
    });
    expectEqual(r.status, 201, 'status');
    expectEqual(r.json.account.plays, 10, 'plays');
    expectEqual(r.json.account.chips, 100, 'chips');
    globalThis.newToken = r.json.token;
    return r.json.account;
  });

  await check('login lockout after repeated failures', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await call('POST', '/api/auth/login', { body: { username: 'e2e_guest', password: `bad${i}` } });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401), `early: ${statuses}`);
    expectEqual(statuses[5], 429, 'locked');
    return statuses;
  });

  await check('password change revokes old sessions', async () => {
    const r = await call('POST', '/api/auth/password', {
      body: { token: tok('e2e_host'), oldPassword: 'pass1234', newPassword: 'newpass123' },
    });
    expectEqual(r.status, 200, 'change');
    const me = await call('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${tok('e2e_host')}` } });
    expectEqual(me.status, 401, 'old token');
    const login = await call('POST', '/api/auth/login', { body: { username: 'e2e_host', password: 'newpass123' } });
    expectEqual(login.status, 200, 'new password');
    globalThis.hostAccountToken = login.json.token;
  });

  await check('manifest ignores forged Host when PUBLIC_ORIGIN is set', async () => {
    const r = await call('GET', '/api/app/latest', { headers: { Host: 'evil.example' } });
    expectEqual(r.status, 200, 'status');
    expect(r.json.url.startsWith('https://poker.example/'), r.json.url);
    return r.json.url;
  });

  await check('latest APK is downloadable', async () => {
    const manifest = await call('GET', '/api/app/latest');
    const url = new URL(manifest.json.url);
    const r = await call('GET', url.pathname);
    expectEqual(r.status, 200, 'status');
    expectEqual(r.headers['content-length'], String(manifest.json.size), 'size');
    return `${manifest.json.versionName} ${manifest.json.size}`;
  });

  await check('private room creation works (no ghost rooms)', async () => {
    const created = await call('POST', '/api/rooms', {
      body: {
        token: globalThis.hostAccountToken, name: '好友房', seats: 8, password: '123',
        startingChips: 240, sb: 5, bb: 10, loserSpectate: true,
      },
    });
    expectEqual(created.status, 201, 'status');
    expect(/^\d{3}$/.test(created.json.code), 'code');
    globalThis.room = created.json;
    const list = await call('GET', '/api/rooms');
    expectEqual(list.json.rooms.length, 1, 'room count');
    expectEqual(list.json.rooms[0].players, 1, 'players');
    // A failed create must not leak a room.
    const bad = await call('POST', '/api/rooms', {
      body: { token: globalThis.hostAccountToken, name: 'bad', password: '12' },
    });
    expectEqual(bad.status, 400, 'bad password');
    const list2 = await call('GET', '/api/rooms');
    expectEqual(list2.json.rooms.length, 1, 'no ghost room');
    return globalThis.room;
  });

  await check('guest joins and both receive authoritative state', async () => {
    const join = await call('POST', `/api/rooms/${globalThis.room.code}/join`, {
      body: { token: tok('e2e_guest'), password: '123', name: '客人' },
    });
    expectEqual(join.status, 200, 'join');
    globalThis.guest = join.json;
    globalThis.hostSse = await openSse(globalThis.room.code, globalThis.room.token);
    globalThis.guestSse = await openSse(globalThis.room.code, join.json.token);
    globalThis.stateRef = { value: null };
    globalThis.hostSse.on('state', (state) => { globalThis.stateRef.value = state; });
    globalThis.guestSse.on('state', (state) => { globalThis.stateRef.value = state; });
    const start = await call('POST', `/api/rooms/${globalThis.room.code}/start`, {
      body: { token: globalThis.room.token },
    });
    expectEqual(start.status, 200, 'start');
    for (let i = 0; i < 40 && !globalThis.stateRef.value; i += 1) await sleep(100);
    const state = globalThis.stateRef.value;
    expect(state, 'state received');
    expectEqual(state.seats.length, 2, 'seats');
    expectEqual(state.pot, 15, 'blinds');
    expectEqual(state.turn.seat, 0, 'heads-up SB acts first');
    expect(state.seats.every((seat) => seat.stack <= 240), 'custom starting chips');
    const hole = await globalThis.hostSse.waitFor('direct', 3000);
    expect(Array.isArray(hole.hole) && hole.hole.length === 2, 'private hole cards');
    return { seats: state.seats.length, pot: state.pot, turn: state.turn.seat };
  });

  await check('spectator cannot see any hole cards or settlement', async () => {
    const join = await call('POST', `/api/rooms/${globalThis.room.code}/join`, {
      body: { token: tok('e2e_watch'), password: '123', name: '观战者' },
    });
    expectEqual(join.status, 200, 'spectator join');
    expectEqual(join.json.spectator, true, 'spectator flag');
    const sse = await openSse(globalThis.room.code, join.json.token);
    const state = await sse.waitFor('state', 5000);
    expectEqual(state.spectator, true, 'redacted state');
    expectEqual(state.settlement, null, 'no settlement');
    expect(state.seats.every((seat) => !Array.isArray(seat.hole) || !seat.hole.length), 'no hole cards');
    expect(state.seats.every((seat) => !seat.bestCards || !seat.bestCards.length), 'no best cards');
    sse.close();
    return 'spectator redacted';
  });

  await check('client cannot publish state / round', async () => {
    for (const action of ['state', 'round', 'direct']) {
      const r = await call('POST', `/api/rooms/${globalThis.room.code}/${action}`, {
        body: { token: globalThis.room.token, state: { hacked: true }, stacks: [{ pid: 1, chips: 800 }] },
      });
      expectEqual(r.status, 403, action);
    }
  });

  await check('authoritative hand plays and settles chips', async () => {
    const ok = await playOneHand({
      stateRef: globalThis.stateRef,
      hostToken: globalThis.room.token,
      guestToken: globalThis.guest.token,
    });
    expect(ok, 'hand settled');
    const host = await call('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${globalThis.hostAccountToken}` } });
    const guest = await call('GET', '/api/auth/me', { headers: { Authorization: `Bearer ${tok('e2e_guest')}` } });
    expectEqual(host.json.account.chips + guest.json.account.chips, 200, 'chips conserved');
    expectEqual(host.json.account.rounds, 1, 'host rounds');
    expectEqual(guest.json.account.rounds, 1, 'guest rounds');
    const state = globalThis.stateRef.value;
    expectEqual(state.phase, 'settle', 'settle state');
    expect(state.winners.length >= 1, 'winners');
    return { chips: [host.json.account.chips, guest.json.account.chips], winners: state.winners };
  });

  await check('duplicate SSE replaces the old stream', async () => {
    const first = await openSse(globalThis.room.code, globalThis.room.token);
    const second = await openSse(globalThis.room.code, globalThis.room.token);
    await sleep(300);
    expect(first.closed, 'old stream closed');
    second.close();
    first.close();
    return 'replaced';
  });

  await check('leaving closes the private room and clears the lobby', async () => {
    const leaveGuest = await call('POST', `/api/rooms/${globalThis.room.code}/leave`, {
      body: { token: globalThis.guest.token },
    });
    expectEqual(leaveGuest.status, 200, 'guest leave');
    const leaveHost = await call('POST', `/api/rooms/${globalThis.room.code}/leave`, {
      body: { token: globalThis.room.token },
    });
    expectEqual(leaveHost.status, 200, 'host leave');
    const list = await call('GET', '/api/rooms');
    expectEqual(list.json.rooms.length, 0, 'lobby empty');
    globalThis.hostSse.close();
    globalThis.guestSse.close();
  });

  await check('rate limit protects room creation', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      const r = await call('POST', '/api/rooms', {
        body: { token: globalThis.hostAccountToken, name: `r${i}`, password: '123' },
      });
      statuses.push(r.status);
    }
    expect(statuses.includes(429), `statuses ${statuses}`);
    return statuses;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
  fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, 'out', 'integration-results.json'), JSON.stringify(results, null, 2));
}

main()
  .catch((error) => { console.error('FATAL', error); process.exitCode = 1; })
  .finally(async () => {
    try { globalThis.hostSse?.close(); globalThis.guestSse?.close(); } catch { /* */ }
    stopServer(server);
    await sleep(500);
  });
