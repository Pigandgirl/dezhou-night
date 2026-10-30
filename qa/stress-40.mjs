import fs from 'node:fs';
const BASE = process.env.BASE || 'http://192.144.159.220:8080';
const accounts = JSON.parse(fs.readFileSync('qa/out/stress-accounts.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stats = { joins: 0, joinErrors: [], events: 0, states: 0, actions: 0, actionErrors: [], latencies: [], hands: new Map(), ready: 0, started: 0 };
const rooms = {};
const byRoom = new Map();
for (let r = 0; r < 4; r += 1) byRoom.set(String(801 + r), accounts.slice(r * 10, r * 10 + 10));

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

async function joinRoom(code, acct, indexInRoom) {
  const res = await fetch(`${BASE}/api/match/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, token: acct.token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { stats.joinErrors.push(`${code} ${acct.username}: ${res.status} ${data.error || ''}`); return null; }
  stats.joins += 1;
  return { ...data, code, acct, indexInRoom, spectator: Boolean(data.spectator) };
}

async function connectSse(joined) {
  const url = `${BASE}/api/rooms/${joined.code}/events?token=${encodeURIComponent(joined.token)}`;
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
  if (!res.ok) throw new Error(`SSE ${res.status}`);
  joined.controller = controller;
  joined.sseReader = res.body.getReader();
  joined.ready = false;
  joined.nextSent = new Set();
  joined.turnKey = '';
  joined.stateCount = 0;
  joined.hands = 0;
  joined.room = rooms[joined.code];
  joined.room.accounts.push(joined);
  joined.room.players.push(joined);
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      while (true) {
        const { done, value } = await joined.sseReader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message';
          let dataLine = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          let data;
          try { data = JSON.parse(dataLine); } catch { continue; }
          stats.events += 1;
          joined.lastEvent = Date.now();
          if (event === 'state') onState(joined, data);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') joined.room.errors.push(`${joined.acct.username} SSE: ${error.message}`);
    }
  })();
}

function onState(joined, state) {
  joined.stateCount += 1;
  stats.states += 1;
  joined.hands = Math.max(joined.hands, Number(state.hand) || 0);
  stats.hands.set(joined.code, Math.max(stats.hands.get(joined.code) || 0, Number(state.hand) || 0));
  if (joined.spectator) return;
  const me = (state.seats || []).find(s => s.pid === joined.pid);
  if (!me) return;
  if (state.phase === 'settle') {
    if (!joined.nextSent.has(state.hand)) {
      joined.nextSent.add(state.hand);
      postAction(joined, 'next', {}).catch(() => {});
    }
    return;
  }
  const turn = state.turn;
  if (!turn || turn.seat !== me.seat || !turn.legal) return;
  const key = `${state.hand}:${state.street}:${turn.seat}:${turn.legal.currentBet}:${turn.legal.toCall}`;
  if (joined.turnKey === key) return;
  joined.turnKey = key;
  const legal = turn.legal;
  const type = legal.canCheck ? 'check' : (Number(legal.toCall) <= Number(legal.stack) ? 'call' : 'fold');
  const startedAt = Date.now();
  postAction(joined, { type }, {}).then(() => {
    stats.latencies.push(Date.now() - startedAt);
    stats.actions += 1;
  }).catch(error => stats.actionErrors.push(`${joined.code} ${joined.acct.username}: ${error.message}`));
}

async function postAction(joined, action, extra) {
  const res = await fetch(`${BASE}/api/rooms/${joined.code}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: joined.token, action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || ''}`);
  return data;
}

async function main() {
  for (const [code, accts] of byRoom) {
    rooms[code] = { code, accounts: [], players: [], errors: [] };
    for (let i = 0; i < accts.length; i += 1) {
      const joined = await joinRoom(code, accts[i], i);
      if (joined) { joined.code = code; await connectSse(joined); }
    }
  }
  await sleep(1200);
  // all SSE on, mark players ready
  for (const room of Object.values(rooms)) {
    for (const joined of room.players) {
      if (joined.spectator) continue;
      try { await postAction(joined, 'ready', { ready: true }); stats.ready += 1; } catch (e) { room.errors.push(`${joined.acct.username} ready: ${e.message}`); }
    }
  }
  await sleep(2500);
  const deadline = Date.now() + 75000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const stateCount = Object.values(rooms).reduce((n, r) => n + r.accounts.reduce((m, a) => m + a.stateCount, 0), 0);
    if (stateCount > 1000) break;
  }
  for (const room of Object.values(rooms)) {
    for (const joined of room.accounts) { try { joined.controller?.abort(); } catch {} }
  }
  await sleep(300);
  const report = {
    base: BASE,
    rooms: Object.values(rooms).map(room => ({
      code: room.code,
      accounts: room.accounts.length,
      players: room.players.filter(p => !p.spectator).length,
      spectators: room.players.filter(p => p.spectator).length,
      states: room.accounts.reduce((n, a) => n + a.stateCount, 0),
      hands: stats.hands.get(room.code) || 0,
      errors: room.errors.slice(0, 5),
    })),
    joins: stats.joins,
    joinErrors: stats.joinErrors.slice(0, 10),
    events: stats.events,
    states: stats.states,
    actions: stats.actions,
    actionErrors: stats.actionErrors.slice(0, 10),
    latencyMs: {
      p50: pct(stats.latencies, 0.5),
      p95: pct(stats.latencies, 0.95),
      max: stats.latencies.length ? Math.max(...stats.latencies) : 0,
      samples: stats.latencies.length,
    },
  };
  fs.writeFileSync('qa/out/stress-40-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
main().catch(error => { console.error('STRESS FAILED', error); process.exit(1); });
