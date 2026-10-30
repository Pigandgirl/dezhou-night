// Engine unit tests (server-authoritative Hold'em).
// Run: node qa/engine-test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

process.env.TURN_MS = '200';
process.env.NEXT_HAND_MS = '20';
process.env.RUNOUT_MS = '5';

const require = createRequire(import.meta.url);
const { GameEngine } = require('../server/lib/game-engine.js');
const serverPoker = require('../server/lib/poker.js');

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      results.push({ name, ok: true, detail: detail ?? '' });
      console.log(`[PASS] ${name}${detail ? ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    })
    .catch((error) => {
      results.push({ name, ok: false, detail: error.message });
      console.log(`[FAIL] ${name} :: ${error.message}`);
    });
}
function expect(condition, message) { if (!condition) throw new Error(message); }
function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function makeTable(seats) {
  const room = {
    code: '900', name: 'test', seats: seats.length, hostToken: '', started: true,
    players: new Map(), clients: new Map(), game: null,
  };
  const users = new Map();
  const holes = [];
  const states = [];
  const settled = [];
  let over = null;
  seats.forEach((chips, index) => {
    const key = `u${index}`;
    const user = { username: key, name: key, chips, plays: 99, points: 1000, rounds: 0, chipsAt: Date.now() };
    users.set(key, user);
    const token = `tok${index}`;
    room.players.set(token, { token, pid: index + 1, name: key, userKey: key, spectator: false, online: true, joinedAt: Date.now() });
  });
  const deps = {
    getUser: (key) => users.get(key),
    save: () => {},
    broadcast: (event, data) => { if (event === 'state') states.push(data); },
    direct: (player, data) => {
      if (data && Array.isArray(data.hole)) holes.push({ token: player.token, seat: data.seat, hole: data.hole, hand: data.hand });
    },
    playersChanged: () => {},
    onSettle: (summary) => settled.push(summary),
    onGameOver: (reason) => { over = reason; },
    log: () => {},
  };
  const engine = new GameEngine(room, deps);
  room.game = engine;
  return { room, users, engine, holes, states, settled, getOver: () => over };
}

async function playToEnd(table, strategy = 'call') {
  const { engine } = table;
  let guard = 0;
  while ((engine.phase === 'play' || engine.phase === 'deal') && guard < 300) {
    guard += 1;
    if (engine.turnSeat < 0) {
      await sleep(5);
      continue;
    }
    const player = engine.players.find((p) => p.seat === engine.turnSeat);
    if (!player) throw new Error('no player for turn');
    const legal = engine.getLegal(player);
    let type = 'check';
    if (strategy === 'call') type = legal.canCheck ? 'check' : 'call';
    else if (strategy === 'raise') type = legal.canRaise ? 'raise' : (legal.canCheck ? 'check' : 'call');
    const result = engine.action(player.token, {
      type,
      amount: legal.canRaise ? Math.min(legal.maxRaiseTo, legal.currentBet + 10) : undefined,
    });
    if (result.error) throw new Error(`action failed: ${result.error}`);
    await sleep(2);
  }
  for (let i = 0; i < 100 && engine.phase !== 'settle'; i += 1) await sleep(5);
  if (engine.phase !== 'settle') throw new Error(`hand did not settle (phase ${engine.phase})`);
}

const all = [];

await check('heads-up: blinds, hole cards and first actor', async () => {
  const table = makeTable([100, 100]);
  const result = table.engine.start();
  expect(result.ok, result.error);
  const { engine } = table;
  expectEqual(engine.players.length, 2, 'players');
  expectEqual(engine.pot, 3, 'pot after blinds');
  expectEqual(engine.players[0].committed, 1, 'SB');
  expectEqual(engine.players[1].committed, 2, 'BB');
  // Heads-up: button/SB (seat 0) acts first preflop.
  expectEqual(engine.turnSeat, 0, 'first actor');
  const cards = [...engine.players[0].hole, ...engine.players[1].hole].map((c) => c.key);
  expectEqual(new Set(cards).size, 4, 'unique hole cards');
  expectEqual(table.holes.length, 2, 'private hole events');
  all.push(table);
  return { pot: engine.pot, turnSeat: engine.turnSeat };
});

await check('heads-up: one hand settles and conserves chips', async () => {
  const table = all[0];
  await playToEnd(table, 'call');
  const total = table.engine.players.reduce((sum, p) => sum + p.stack, 0);
  expectEqual(total, 200, 'chip conservation');
  expectEqual(table.engine.board.length, 5, 'board');
  const boardKeys = table.engine.board.map((c) => c.key);
  expectEqual(new Set(boardKeys).size, 5, 'unique board');
  const allKeys = [...boardKeys, ...table.engine.players.flatMap((p) => p.hole.map((c) => c.key))];
  expectEqual(new Set(allKeys).size, allKeys.length, 'no duplicate cards');
  expect(table.settled.length === 1, 'settled once');
  const snapshot = table.states[table.states.length - 1];
  expectEqual(snapshot.phase, 'settle', 'snapshot phase');
  const settlement = snapshot.settlement;
  expect(settlement, 'settlement list');
  expectEqual(settlement.contenders.length, 2, 'settlement contenders');
  expect(settlement.contenders.every((row) => row.hole.length === 2), 'all hole cards');
  expect(settlement.contenders.every((row) => row.bestCards.length === 5), 'best five');
  expect(settlement.contenders.every((row) => row.reason), 'reason for every player');
  expectEqual(settlement.contenders[0].rank, 1, 'winner rank');
  return {
    winners: table.engine.winners,
    order: settlement.contenders.map((row) => `${row.name}:${row.handDetail}:${row.reason}`),
  };
});

await check('next hand rotates the button and keeps chips', async () => {
  const table = all[0];
  table.engine.clearTimers();
  table.engine.nextHand();
  expectEqual(table.engine.handNo, 2, 'hand number');
  expectEqual(table.engine.turnSeat, table.engine.dealerSeat, 'heads-up SB acts first');
  const total = table.engine.players.reduce((sum, p) => sum + p.stack, 0) + table.engine.totalCommitted();
  expectEqual(total, 200, 'chip conservation including blinds');
  await playToEnd(table, 'call');
  expectEqual(table.engine.players.reduce((sum, p) => sum + p.stack, 0), 200, 'chip conservation after hand');
  return { dealer: table.engine.dealerSeat };
});

await check('3-way all-in builds side pots', async () => {
  const table = makeTable([5, 20, 100]);
  const result = table.engine.start();
  expect(result.ok, result.error);
  // Shove everyone in.
  let guard = 0;
  while ((table.engine.phase === 'play' || table.engine.phase === 'deal') && guard < 50) {
    guard += 1;
    if (table.engine.turnSeat < 0) { await sleep(5); continue; }
    const p = table.engine.players.find((x) => x.seat === table.engine.turnSeat);
    const legal = table.engine.getLegal(p);
    const r = table.engine.action(p.token, legal.canRaise ? { type: 'allin' } : { type: legal.canCheck ? 'check' : 'call' });
    if (r.error) throw new Error(r.error);
    await sleep(2);
  }
  for (let i = 0; i < 100 && table.engine.phase !== 'settle'; i += 1) await sleep(5);
  expectEqual(table.engine.phase, 'settle', 'settle');
  const total = table.engine.players.reduce((s, p) => s + p.stack, 0);
  expectEqual(total, 125, 'chip conservation');
  expect(table.engine.winners.length >= 1, 'winners');
  const paid = table.engine.winners.reduce((s, w) => s + w.amount, 0);
  expectEqual(paid, 125, 'all committed chips awarded');
  expectEqual(table.engine.settlement.contenders.length, 3, 'all remaining players listed');
  expect(table.engine.settlement.contenders.every((row) => row.bestCards.length === 5), 'best five for all');
  expect(table.engine.settlement.contenders.every((row) => row.reason), 'reasons for all');
  return table.engine.winners;
});

await check('fold wins the pot without showdown', async () => {
  const table = makeTable([100, 100]);
  table.engine.start();
  const first = table.engine.players.find((p) => p.seat === table.engine.turnSeat);
  const r = table.engine.action(first.token, { type: 'fold' });
  expect(r.ok, r.error);
  expectEqual(table.engine.phase, 'settle', 'settle after fold');
  expectEqual(table.engine.winners.length, 1, 'single winner');
  expectEqual(table.engine.players.reduce((s, p) => s + p.stack, 0), 200, 'conservation');
  const settlement = table.engine.settlement;
  expectEqual(settlement.contenders.length, 1, 'only remaining player');
  expectEqual(settlement.contenders[0].hole.length, 2, 'winner hole revealed');
  expect(settlement.contenders[0].reason.includes('弃牌'), 'fold reason');
  const snapshot = table.states[table.states.length - 1];
  const winner = snapshot.seats.find((seat) => !seat.folded);
  expectEqual(winner.hole.length, 2, 'winner hole in snapshot');
  return { winner: settlement.contenders[0].name, reason: settlement.contenders[0].reason };
});

await check('turn timeout auto-checks or folds', async () => {
  const table = makeTable([100, 100]);
  table.engine.start();
  const seat = table.engine.turnSeat;
  await sleep(3400);
  expect(table.engine.turnSeat !== seat || table.engine.phase === 'settle', 'turn advanced');
  table.engine.dispose();
  return `seat ${seat} auto-acted`;
});

await check('leaving mid-hand folds the player and ends heads-up', async () => {
  const table = makeTable([100, 100]);
  table.engine.start();
  const first = table.engine.players.find((p) => p.seat === table.engine.turnSeat);
  table.engine.removePlayer(first.token);
  expectEqual(table.engine.phase, 'settle', 'hand settled');
  expectEqual(table.engine.winners.length, 1, 'remaining player wins');
  expectEqual(table.engine.players.reduce((s, p) => s + p.stack, 0), 200, 'conservation');
  table.engine.dispose();
  return table.engine.winners;
});

await check('game ends when fewer than 2 players can continue', async () => {
  const table = makeTable([2, 100]);
  table.engine.start();
  await playToEnd(table, 'call');
  for (const p of table.engine.players) p.user.chips = 0;
  table.engine.clearTimers();
  table.engine.nextHand();
  expect(table.getOver() !== null, 'onGameOver fired');
  return table.getOver();
});

await check('dealer position and blinds for 3+ players', async () => {
  const table = makeTable([100, 100, 100]);
  table.engine.start();
  const dealer = table.engine.dealerSeat;
  const sb = (dealer + 1) % 3;
  const bb = (dealer + 2) % 3;
  expectEqual(table.engine.players[sb].committed, 1, 'SB');
  expectEqual(table.engine.players[bb].committed, 2, 'BB');
  // First to act is the seat after BB.
  expectEqual(table.engine.turnSeat, (bb + 1) % 3, 'UTG');
  table.engine.dispose();
  return { dealer, sb, bb };
});

await check('private room uses host custom chips and blinds without account chips', async () => {
  const table = makeTable([0, 0]);
  table.room.match = false;
  table.room.startingChips = 240;
  table.room.sb = 5;
  table.room.bb = 10;
  table.room.loserSpectate = true;
  table.engine.sb = 5;
  table.engine.bb = 10;
  const result = table.engine.start();
  expect(result.ok, result.error || 'start failed');
  expectEqual(table.engine.sb, 5, 'sb');
  expectEqual(table.engine.bb, 10, 'bb');
  expectEqual(table.engine.players[0].stack, 235, 'stack after small blind');
  table.engine.dispose();
  return '240 chips / 5-10 blinds';
});

await check('private room marks a busted player as spectator', async () => {
  const table = makeTable([100, 100]);
  table.room.match = false;
  table.room.startingChips = 100;
  table.room.loserSpectate = true;
  const result = table.engine.start();
  expect(result.ok, result.error || 'start failed');
  table.engine.players[0].stack = 0;
  table.engine.players[0].folded = true;
  table.engine.finish(false);
  expectEqual(table.room.players.get('tok0').spectator, true, 'busted spectator');
  expectEqual(table.room.players.get('tok1').spectator, false, 'winner still playing');
  table.engine.dispose();
  return 'busted player -> spectator';
});

await check('server evaluator matches the audited client evaluator', async () => {
  const clientPoker = await import('../src/poker.js');
  const deck = serverPoker.makeDeck();
  let mismatches = 0;
  for (let i = 0; i < 20000; i += 1) {
    const copy = [...deck];
    for (let j = 0; j < 7; j += 1) {
      const k = j + Math.floor(Math.random() * (52 - j));
      [copy[j], copy[k]] = [copy[k], copy[j]];
    }
    const hand = copy.slice(0, 7);
    const a = serverPoker.evaluate(hand);
    const b = clientPoker.evaluate(hand);
    if (serverPoker.compareScores(a.score, b.score) !== 0) mismatches += 1;
    if (mismatches > 2) break;
  }
  expectEqual(mismatches, 0, 'mismatches');
  return '20000 hands, 0 mismatches';
});

const failed = results.filter((r) => !r.ok);
console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, 'out', 'engine-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
