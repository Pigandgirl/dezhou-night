// Capacity measurements for the server-authoritative architecture.
// Run: node qa/run-load.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep, serverRssMb, Sampler,
} from './lib/env.mjs';
import { api, Sse } from './lib/client.mjs';

const report = { generatedAt: new Date().toISOString(), phases: {} };
const log = (...a) => console.log(...a);
let PORT = 0;
const call = (method, p, opts) => api(PORT, method, p, opts);
const tok = (u) => `loadtoken_${String(u).padStart(4, '0')}`;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function bench(name, total, concurrency, fn) {
  const latencies = [];
  let errors = 0;
  let index = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < total) {
      const i = index;
      index += 1;
      const t = Date.now();
      try {
        const ok = await fn(i);
        if (!ok) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(Date.now() - t);
    }
  }));
  const elapsed = Date.now() - started;
  const result = {
    total,
    concurrency,
    elapsedMs: elapsed,
    rps: Math.round((total / elapsed) * 1000),
    errors,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: Math.max(...latencies),
  };
  log(`[BENCH] ${name}: ${JSON.stringify(result)}`);
  return result;
}

const ROOMS = 100;
const SEATS = 8;
const USERS = [];
for (let i = 0; i < ROOMS * SEATS; i += 1) {
  const username = `load_${String(i).padStart(4, '0')}`;
  USERS.push(makeUser({
    username, name: `压测${i}`, plays: 10, chips: 100, hash: false,
    tokens: [{ token: tok(i), at: Date.now() }],
  }));
}

const sandbox = createSandbox({ users: USERS, label: 'load' });
let serverRef = null;

async function main() {
  PORT = await freePort();
  const server = await startServer(sandbox, {
    port: PORT,
    env: {
      TURN_MS: '30000',
      NEXT_HAND_MS: '60000',
      RL_ROOM_CREATE: '5000',
      RL_ROOM_JOIN: '5000',
    },
  });
  serverRef = server;
  const sampler = new Sampler(server.pid, 900).start();
  const baseRss = await serverRssMb(server.pid);
  log(`server ${PORT}, pid ${server.pid}, baseline ${baseRss} MB`);
  report.baselineRssMb = baseRss;

  report.phases.health = await bench('GET /api/health', 2000, 64, async () => {
    const r = await call('GET', '/api/health', { timeout: 20000 });
    return r.status === 200;
  });
  report.phases.leaderboard = await bench('GET /api/leaderboard', 300, 32, async () => {
    const r = await call('GET', '/api/leaderboard', { timeout: 20000 });
    return r.status === 200;
  });
  report.phases.matchRooms = await bench('GET /api/match/rooms', 1000, 32, async () => {
    const r = await call('GET', '/api/match/rooms', { timeout: 20000 });
    return r.status === 200;
  });

  // Build 100 rooms x 8 players.
  const rooms = [];
  const setupStart = Date.now();
  for (let r = 0; r < ROOMS; r += 1) {
    const base = r * SEATS;
    const created = await call('POST', '/api/rooms', {
      body: { token: tok(base), name: `load${r}`, seats: SEATS, password: '123' },
    });
    if (created.status !== 201) throw new Error(`room ${r}: ${created.status} ${created.text}`);
    const room = {
      code: created.json.code,
      tokens: [created.json.token],
      clients: [],
      states: [],
    };
    for (let s = 1; s < SEATS; s += 1) {
      const joined = await call('POST', `/api/rooms/${room.code}/join`, {
        body: { token: tok(base + s), name: `p${s}`, password: '123' },
      });
      if (joined.status !== 200) throw new Error(`join ${r}/${s}: ${joined.status} ${joined.text}`);
      room.tokens.push(joined.json.token);
    }
    rooms.push(room);
  }
  report.phases.roomSetupMs = Date.now() - setupStart;
  log(`[ROOMS] ${ROOMS} x ${SEATS} in ${report.phases.roomSetupMs}ms`);

  // Open one SSE per player.
  const sseStart = Date.now();
  for (const room of rooms) {
    for (const token of room.tokens) {
      const sse = new Sse(PORT, `/api/rooms/${room.code}/events?token=${token}`);
      // eslint-disable-next-line no-await-in-loop
      await sse.open();
      room.clients.push(sse);
    }
  }
  report.phases.clientConnectMs = Date.now() - sseStart;
  await sleep(1000);
  report.phases.roomsRssMb = await serverRssMb(server.pid);
  log(`[ROOMS] ${ROOMS * SEATS} SSE in ${report.phases.clientConnectMs}ms, rss ${report.phases.roomsRssMb} MB`);

  // Start all games while probing the event loop.
  const healthProbes = [];
  const probeTimer = setInterval(async () => {
    try {
      const r = await call('GET', '/api/health', { timeout: 5000 });
      healthProbes.push(r.ms);
    } catch {
      healthProbes.push(-1);
    }
  }, 120);

  const startStart = Date.now();
  const startStatuses = [];
  for (const room of rooms) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call('POST', `/api/rooms/${room.code}/start`, { body: { token: room.tokens[0] } });
    startStatuses.push(r.status);
  }
  report.phases.startMs = Date.now() - startStart;
  await sleep(1200);
  const started = startStatuses.filter((s) => s === 200).length;
  report.phases.gamesStarted = started;
  log(`[GAMES] started ${started}/${ROOMS} in ${report.phases.startMs}ms`);

  // Five action rounds: 100 actions per round, one per room.
  const actionStart = Date.now();
  let actionsSent = 0;
  for (let round = 0; round < 5; round += 1) {
    await Promise.all(rooms.map(async (room) => {
      const sse = room.clients[0];
      const state = [...sse.frames].reverse().find((frame) => frame.event === 'state')?.data;
      if (!state || !state.turn) return;
      const token = room.tokens[state.turn.seat];
      if (!token) return;
      const legal = state.turn.legal || {};
      actionsSent += 1;
      await call('POST', `/api/rooms/${room.code}/action`, {
        body: { token, action: { type: legal.canCheck ? 'check' : 'call' } },
        timeout: 20000,
      });
    }));
    await sleep(250);
  }
  await sleep(800);
  clearInterval(probeTimer);

  let delivered = 0;
  for (const room of rooms) {
    for (const sse of room.clients) delivered += sse.count('state');
  }
  const actionMs = Date.now() - actionStart;
  report.phases.broadcast = {
    clients: ROOMS * SEATS,
    games: started,
    actionsSent,
    framesDelivered: delivered,
    framesExpected: started * SEATS + actionsSent * SEATS,
    actionPhaseMs: actionMs,
    framesPerSecond: Math.round((delivered / actionMs) * 1000),
    healthP50: percentile(healthProbes, 0.5),
    healthP95: percentile(healthProbes, 0.95),
    healthMax: Math.max(...healthProbes),
    rssMb: await serverRssMb(server.pid),
  };
  log(`[BROADCAST] ${JSON.stringify(report.phases.broadcast)}`);

  for (const room of rooms) for (const sse of room.clients) sse.close();
  await sleep(2000);
  report.phases.afterCloseRssMb = await serverRssMb(server.pid);
  report.phases.peakRssMb = sampler.peakMb;
  report.phases.healthAfterLoad = await bench('GET /api/health after load', 200, 16, async () => {
    const r = await call('GET', '/api/health', { timeout: 20000 });
    return r.status === 200;
  });
  sampler.stop();
  log(`[RSS] ${baseRss} -> peak ${sampler.peakMb} -> after close ${report.phases.afterCloseRssMb} MB`);

  fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(import.meta.dirname, 'out', 'load-results.json'), JSON.stringify(report, null, 2));
  stopServer(server);
  await sleep(500);
}

main().catch((error) => {
  console.error('FATAL', error);
  stopServer(serverRef);
  process.exitCode = 1;
});
