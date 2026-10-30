// Private room / SSE regression for the hardened server.
// Run: node qa/run-rooms.mjs
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
for (let i = 0; i < 55; i += 1) {
  const username = `room_${String(i).padStart(2, '0')}`;
  USERS.push(makeUser({
    username, name: `房间${i}`, plays: 10, chips: 100,
    tokens: [{ token: tok(username), at: Date.now() }],
  }));
}
const sandbox = createSandbox({ users: USERS, label: 'rooms2' });
let server;

async function openSse(code, token) {
  const sse = new Sse(PORT, `/api/rooms/${code}/events?token=${token}`);
  await sse.open();
  await sse.waitFor('hello', 5000);
  return sse;
}

async function main() {
  PORT = await freePort();
  server = await startServer(sandbox, { port: PORT, env: { NEXT_HAND_MS: '60000' } });

  let room;
  await check('create / list room without password leak', async () => {
    const r = await call('POST', '/api/rooms', {
      body: {
        token: tok('room_00'), name: '房间A', seats: 8, password: '123',
        startingChips: 240, sb: 5, bb: 10, loserSpectate: true,
      },
    });
    expectEqual(r.status, 201, 'status');
    expect(/^\d{3}$/.test(r.json.code), 'code');
    expectEqual(r.json.startingChips, 240, 'startingChips');
    expectEqual(r.json.sb, 5, 'sb');
    expectEqual(r.json.bb, 10, 'bb');
    expectEqual(r.json.loserSpectate, true, 'loserSpectate');
    room = r.json;
    const list = await call('GET', '/api/rooms');
    const item = list.json.rooms.find((x) => x.code === room.code);
    expect(item, 'listed');
    expectEqual(item.players, 1, 'players');
    expect(!('password' in item), 'password leak');
  });

  await check('host can edit room chips/blinds/spectate; guest cannot', async () => {
    const guestTry = await call('POST', `/api/rooms/${room.code}/config`, {
      body: { token: tok('room_01'), startingChips: 500, sb: 10, bb: 20 },
    });
    expectEqual(guestTry.status, 401, 'guest is not in room yet');
    const host = await call('POST', `/api/rooms/${room.code}/config`, {
      body: { token: room.token, startingChips: 500, sb: 10, bb: 20, loserSpectate: false },
    });
    expectEqual(host.status, 200, 'host config');
    expectEqual(host.json.startingChips, 500, 'chips');
    expectEqual(host.json.sb, 10, 'sb');
    expectEqual(host.json.bb, 20, 'bb');
    expectEqual(host.json.loserSpectate, false, 'spectate');
  });

  await check('wrong password denied, correct accepted', async () => {
    const bad = await call('POST', `/api/rooms/${room.code}/join`, {
      body: { token: tok('room_01'), password: '999' },
    });
    expectEqual(bad.status, 403, 'wrong');
    const ok = await call('POST', `/api/rooms/${room.code}/join`, {
      body: { token: tok('room_01'), password: '123', name: '客人' },
    });
    expectEqual(ok.status, 200, 'correct');
  });

  await check('password brute force is throttled', async () => {
    const statuses = [];
    for (let i = 0; i < 14; i += 1) {
      const r = await call('POST', `/api/rooms/${room.code}/join`, {
        body: { token: tok(`room_${String(10 + (i % 10)).padStart(2, '0')}`), password: String(i).padStart(3, '0') },
      });
      statuses.push(r.status);
    }
    expect(statuses.includes(429), `statuses ${statuses}`);
    return statuses;
  });

  await check('8 seats + 32 spectators, then rejected', async () => {
    // 6 more players to fill the 8 seats (host + room_01 already seated).
    for (let i = 2; i <= 7; i += 1) {
      const r = await call('POST', `/api/rooms/${room.code}/join`, {
        body: { token: tok(`room_${String(i).padStart(2, '0')}`), password: '123' },
      });
      expectEqual(r.status, 200, `seat ${i}`);
      expectEqual(r.json.spectator, false, `seat ${i} spectator`);
    }
    let spectators = 0;
    for (let i = 8; i < 40; i += 1) {
      const r = await call('POST', `/api/rooms/${room.code}/join`, {
        body: { token: tok(`room_${String(i).padStart(2, '0')}`), password: '123' },
      });
      expectEqual(r.status, 200, `spectator ${i}`);
      expectEqual(r.json.spectator, true, `spectator ${i} flag`);
      spectators += 1;
    }
    expectEqual(spectators, 32, 'spectators');
    const over = await call('POST', `/api/rooms/${room.code}/join`, {
      body: { token: tok('room_40'), password: '123' },
    });
    expectEqual(over.status, 409, 'over cap');
    return `${spectators} spectators + 8 players`;
  });

  await check('cross-room player token is rejected', async () => {
    const other = await call('POST', '/api/rooms', {
      body: { token: tok('room_41'), name: '房间B', seats: 8, password: '222' },
    });
    expectEqual(other.status, 201, 'room B');
    const r = await call('POST', `/api/rooms/${other.json.code}/state`, {
      body: { token: room.token, state: {} },
    });
    expectEqual(r.status, 401, 'status');
  });

  await check('host leaving transfers ownership', async () => {
    const created = await call('POST', '/api/rooms', {
      body: { token: tok('room_42'), name: '房间C', seats: 8, password: '333' },
    });
    const guest = await call('POST', `/api/rooms/${created.json.code}/join`, {
      body: { token: tok('room_43'), password: '333', name: '继承人' },
    });
    const hostSse = await openSse(created.json.code, created.json.token);
    const guestSse = await openSse(created.json.code, guest.json.token);
    const leave = await call('POST', `/api/rooms/${created.json.code}/leave`, {
      body: { token: created.json.token },
    });
    expectEqual(leave.status, 200, 'leave');
    const hostEvent = await guestSse.waitFor('host', 5000);
    expect(hostEvent, 'host event');
    expectEqual(hostEvent.pid, guest.json.pid, 'new host pid');
    hostSse.close();
    guestSse.close();
    return `${hostEvent.name} became host`;
  });

  await check('duplicate SSE closes the old stream', async () => {
    const first = await openSse(room.code, room.token);
    const second = await openSse(room.code, room.token);
    await sleep(300);
    expect(first.closed, 'old closed');
    second.close();
    first.close();
  });

  await check('one account can host at most 3 rooms', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await call('POST', '/api/rooms', {
        body: { token: tok('room_44'), name: `h${i}`, seats: 8, password: '444' },
      });
      statuses.push(r.status);
    }
    expectEqual(statuses.filter((s) => s === 201).length, 3, 'created');
    expectEqual(statuses[3], 429, 'fourth');
    return statuses;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
  fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, 'out', 'rooms-results.json'), JSON.stringify(results, null, 2));
}

main()
  .catch((error) => { console.error('FATAL', error); process.exitCode = 1; })
  .finally(async () => { stopServer(server); await sleep(500); });
