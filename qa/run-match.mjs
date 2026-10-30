// Matchmaking integration: countdown, auto-start, capacity and host transfer.
// The countdown is shortened in the sandbox copy so the test runs quickly.
// Run: node qa/run-match2.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep,
} from './lib/env.mjs';
import { api, Sse } from './lib/client.mjs';

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

const USERS = [];
for (let i = 0; i < 70; i += 1) {
  const username = `m2_${String(i).padStart(2, '0')}`;
  USERS.push(makeUser({
    username, name: `匹配${i}`, plays: 10, chips: 100,
    tokens: [{ token: tok(username), at: Date.now() }],
  }));
}
const sandbox = createSandbox({
  users: USERS,
  label: 'match2',
  patches: [{
    find: 'const MATCH_COUNTDOWN_MS = 60 * 1000;',
    replace: 'const MATCH_COUNTDOWN_MS = 1200;',
  }],
});
let server;

async function openSse(code, token) {
  const sse = new Sse(PORT, `/api/rooms/${code}/events?token=${token}`);
  await sse.open();
  await sse.waitFor('hello', 5000);
  return sse;
}

async function main() {
  PORT = await freePort();
  server = await startServer(sandbox, {
    port: PORT,
    admin: { user: 'm2admin', password: 'M2Admin!2345' },
    env: { NEXT_HAND_MS: '60000' },
  });

  await check('4 match rooms', async () => {
    const r = await call('GET', '/api/match/rooms');
    expectEqual(r.status, 200, 'status');
    expectEqual(r.json.rooms.length, 4, 'rooms');
    expectEqual(r.json.rooms[0].code, '801', 'first code');
    expectEqual(r.json.rooms[3].code, '804', 'last code');
    return r.json.rooms.map((x) => x.code);
  });

  let code = '';
  await check('two players quick match and auto-start', async () => {
    const a = await call('POST', '/api/match/quick', { body: { token: tok('m2_00') } });
    const b = await call('POST', '/api/match/quick', { body: { token: tok('m2_01') } });
    expectEqual(a.status, 200, 'A');
    expectEqual(b.status, 200, 'B');
    expectEqual(a.json.code, '801', 'first room');
    expectEqual(a.json.code, b.json.code, 'same room');
    code = a.json.code;
    globalThis.a = a.json;
    globalThis.b = b.json;
    globalThis.sseA = await openSse(code, a.json.token);
    globalThis.sseB = await openSse(code, b.json.token);
    const started = await globalThis.sseA.waitFor('started', 6000);
    expect(started, 'started event');
    const state = await globalThis.sseA.waitFor('state', 5000);
    expect(state, 'state event');
    expectEqual(state.seats.length, 2, 'seats');
    expectEqual(state.turn.seat, 0, 'heads-up SB acts first');
    const holes = await globalThis.sseB.waitFor('direct', 3000);
    expect(Array.isArray(holes.hole) && holes.hole.length === 2, 'private hole');
    return { code, pot: state.pot };
  });

  await check('all-ready starts immediately in room 802', async () => {
    const a = await call('POST', '/api/match/quick', { body: { token: tok('m2_02') } });
    const b = await call('POST', '/api/match/quick', { body: { token: tok('m2_03') } });
    expectEqual(a.status, 200, 'A');
    expectEqual(b.status, 200, 'B');
    expectEqual(a.json.code, '802', 'second room');
    expectEqual(a.json.code, b.json.code, 'same second room');
    const sseA = await openSse(a.json.code, a.json.token);
    const sseB = await openSse(b.json.code, b.json.token);
    const r1 = await call('POST', `/api/rooms/${a.json.code}/action`, { body: { token: a.json.token, action: 'ready', ready: true } });
    const r2 = await call('POST', `/api/rooms/${a.json.code}/action`, { body: { token: b.json.token, action: 'ready', ready: true } });
    expectEqual(r1.status, 200, 'ready A');
    expectEqual(r2.status, 200, 'ready B');
    expectEqual(r2.json.started, true, 'all-ready response started');
    const started = await sseA.waitFor('started', 3000);
    expect(started, 'started event');
    expectEqual(started.auto, false, 'started by ready, not countdown');
    const state = await sseA.waitFor('state', 3000);
    expectEqual(state.seats.length, 2, 'ready seats');
    await sseA.close();
    await sseB.close();
    const login = await call('POST', '/api/admin/login', {
      body: { username: 'm2admin', password: 'M2Admin!2345' },
    });
    await call('POST', '/api/admin/rooms/close', {
      body: { token: login.json.token, code: a.json.code },
    });
    await sleep(250);
    return 'ready start ok';
  });

  await check('seated player can rejoin the started room', async () => {
    const r = await call('POST', '/api/match/join', { body: { token: tok('m2_00'), code } });
    expectEqual(r.status, 200, 'status');
    expectEqual(r.json.token, globalThis.a.token, 'same seat token');
    return 'reconnect ok';
  });

  await check('third player is rejected after start', async () => {
    const r = await call('POST', '/api/match/join', { body: { token: tok('m2_02'), code } });
    expectEqual(r.status, 409, 'status');
    return r.json.error;
  });

  await check('host transfer when host stream closes', async () => {
    globalThis.sseA.close();
    const players = await globalThis.sseB.waitFor('players', 5000, (data) => {
      const host = data.players.find((p) => p.host);
      return host && host.pid === globalThis.b.pid;
    });
    expect(players, 'host transferred');
    const host = players.players.find((p) => p.host);
    expectEqual(host.pid, globalThis.b.pid, 'new host');
    return `${host.name} is the new host`;
  });

  await check('admin can reset the started room', async () => {
    const login = await call('POST', '/api/admin/login', {
      body: { username: 'm2admin', password: 'M2Admin!2345' },
    });
    expectEqual(login.status, 200, 'admin login');
    const r = await call('POST', '/api/admin/rooms/close', {
      body: { token: login.json.token, code },
    });
    expectEqual(r.status, 200, 'close');
    globalThis.sseB.close();
    await sleep(300);
    const rooms = await call('GET', '/api/match/rooms');
    const room = rooms.json.rooms.find((x) => x.code === code);
    expectEqual(room.started, false, 'reset');
  });

  await check('32-seat capacity (4 rooms x 8)', async () => {
    let joined = 0;
    for (let i = 3; i < 35; i += 1) {
      const r = await call('POST', '/api/match/quick', { body: { token: tok(`m2_${String(i).padStart(2, '0')}`) } });
      if (r.status !== 200) throw new Error(`join ${i}: ${r.status} ${r.json?.error}`);
      joined += 1;
    }
    const rooms = await call('GET', '/api/match/rooms');
    const total = rooms.json.rooms.reduce((sum, room) => sum + room.players, 0);
    expectEqual(total, 32, 'total seats');
    expect(rooms.json.rooms.every((room) => room.players === 8), JSON.stringify(rooms.json.rooms.map((r) => r.players)));
    return `joined ${joined}, total ${total}`;
  });

  await check('33rd player is rejected', async () => {
    const r = await call('POST', '/api/match/quick', { body: { token: tok('m2_35') } });
    expectEqual(r.status, 409, 'status');
    return r.json.error;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
  fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, 'out', 'match-results.json'), JSON.stringify(results, null, 2));
}

main()
  .catch((error) => { console.error('FATAL', error); process.exitCode = 1; })
  .finally(async () => {
    try { globalThis.sseA?.close(); globalThis.sseB?.close(); } catch { /* */ }
    stopServer(server);
    await sleep(500);
  });
