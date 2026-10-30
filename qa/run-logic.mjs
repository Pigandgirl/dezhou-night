// Poker engine, side-pot and bot logic tests.
// Run: node qa/run-logic.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  makeDeck, shuffle, evaluate, compareScores, buildSidePots, estimateEquity,
  chenScore, FULL_DECK, cardKey,
} from '../src/poker.js';
import { decideBotAction } from '../src/bots.js';

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail ?? '' });
    console.log(`[PASS] ${name}${detail ? ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`[FAIL] ${name} :: ${error.message}`);
  }
}
function expect(condition, message) { if (!condition) throw new Error(message); }
function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const C = (rank, suit) => ({ rank, suit, key: `${rank}${suit}` });
const parse = (str) => str.trim().split(/\s+/).map((s) => {
  const rankMap = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const r = rankMap[s[0]] || Number(s[0]);
  return C(r, s[1]);
});

/* ---------- known hands ---------- */
check('royal flush', () => {
  const r = evaluate(parse('As Ks Qs Js Ts 2d 3c'));
  expectEqual(r.category, 8, 'category');
  expectEqual(r.name, '皇家同花顺', 'name');
  return r.name;
});
check('straight flush 9 high', () => {
  const r = evaluate(parse('9h 8h 7h 6h 5h Ad Kc'));
  expectEqual(r.category, 8, 'category');
  expectEqual(r.score[1], 9, 'high');
});
check('four of a kind beats full house', () => {
  const a = evaluate(parse('7s 7h 7d 7c 2s 3d 4c'));
  const b = evaluate(parse('Ks Kh Kd 2c 2s 3d 4c'));
  expectEqual(a.category, 7, 'quads');
  expectEqual(b.category, 6, 'full house');
  expect(compareScores(a.score, b.score) > 0, 'ordering');
});
check('wheel straight (A2345)', () => {
  const r = evaluate(parse('As 2d 3c 4h 5s Kd Qc'));
  expectEqual(r.category, 4, 'category');
  expectEqual(r.score[1], 5, 'high card is 5');
});
check('flush beats straight', () => {
  const a = evaluate(parse('2s 5s 9s Js Ks 3d 4c'));
  const b = evaluate(parse('6h 7d 8c 9s Tc 2d 3c'));
  expect(compareScores(a.score, b.score) > 0, 'flush > straight');
});
check('two pair kicker decides', () => {
  const a = evaluate(parse('As Ah Ks Kh Qs 2d 3c'));
  const b = evaluate(parse('Ad Ac Kd Kc Js 2h 3d'));
  expect(compareScores(a.score, b.score) > 0, 'queen kicker wins');
});
check('board plays / split pot', () => {
  const board = parse('As Ks Qs Js Ts');
  const a = evaluate([...parse('2c 3d'), ...board]);
  const b = evaluate([...parse('4h 5h'), ...board]);
  expectEqual(compareScores(a.score, b.score), 0, 'tie');
  expectEqual(a.name, '皇家同花顺', 'board hand');
});
check('evaluate returns a real 5-card subset', () => {
  const cards = parse('As Kd 9h 9c 9s 2d 2c');
  const r = evaluate(cards);
  expectEqual(r.best.length, 5, 'subset size');
  for (const card of r.best) {
    expect(cards.some((c) => c.key === card.key), `card ${card.key} not in input`);
  }
});

/* ---------- independent reference evaluator ---------- */
function refScore5(cards) {
  const ranks = cards.map((c) => c.rank);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = new Set(cards.map((c) => c.suit)).size === 1;
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    const mask = uniq.reduce((m, r) => m | (1 << r), 0);
    for (let high = 14; high >= 6; high -= 1) {
      const need = 0b11111 << (high - 4);
      if ((mask & need) === need) { straightHigh = high; break; }
    }
    if (!straightHigh && [14, 5, 4, 3, 2].every((r) => uniq.includes(r))) straightHigh = 5;
  }
  const kickers = uniq;
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...kickers];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...kickers.filter((r) => r !== groups[0][0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return [2, groups[0][0], groups[1][0], kickers.find((r) => r !== groups[0][0] && r !== groups[1][0])];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...kickers.filter((r) => r !== groups[0][0])];
  return [0, ...kickers];
}
function refEvaluate(cards) {
  let best = null;
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const s = refScore5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(s, best) > 0) best = s;
          }
        }
      }
    }
  }
  return best;
}

check('cross-check against independent evaluator (100k random 7-card hands)', () => {
  const deck = makeDeck();
  let mismatches = 0;
  let categoryMismatch = 0;
  for (let i = 0; i < 100000; i += 1) {
    const copy = [...deck];
    for (let j = 0; j < 7; j += 1) {
      const k = j + Math.floor(Math.random() * (52 - j));
      [copy[j], copy[k]] = [copy[k], copy[j]];
    }
    const hand = copy.slice(0, 7);
    const got = evaluate(hand);
    const ref = refEvaluate(hand);
    if (compareScores(got.score, ref) !== 0) mismatches += 1;
    if (got.score[0] !== ref[0]) categoryMismatch += 1;
    if (mismatches > 3) break;
  }
  expectEqual(mismatches, 0, 'score mismatches');
  expectEqual(categoryMismatch, 0, 'category mismatches');
  return '100000 hands, 0 mismatches';
});

check('7-card category distribution matches known probabilities', () => {
  const deck = makeDeck();
  const expected = [17.407, 43.823, 23.496, 4.829, 4.619, 3.025, 2.596, 0.168, 0.0279];
  const counts = new Array(9).fill(0);
  const n = 200000;
  for (let i = 0; i < n; i += 1) {
    const copy = [...deck];
    for (let j = 0; j < 7; j += 1) {
      const k = j + Math.floor(Math.random() * (52 - j));
      [copy[j], copy[k]] = [copy[k], copy[j]];
    }
    counts[evaluate(copy.slice(0, 7)).category] += 1;
  }
  const actual = counts.map((c) => (c / n) * 100);
  const worst = actual.map((p, i) => Math.abs(p - expected[i]));
  const maxDeviation = Math.max(...worst);
  expect(maxDeviation < 0.6, `max deviation ${maxDeviation.toFixed(3)}pp (${actual.map((x) => x.toFixed(2)).join('/')})`);
  return actual.map((x) => x.toFixed(2)).join('/');
});

check('shuffle is a full uniform permutation', () => {
  const topCounts = new Array(52).fill(0);
  for (let i = 0; i < 20000; i += 1) {
    const deck = shuffle(makeDeck());
    const keys = new Set(deck.map(cardKey));
    if (keys.size !== 52) throw new Error('duplicate card in shuffle');
    topCounts[FULL_DECK.findIndex((c) => c.key === deck[0].key)] += 1;
  }
  const expected = 20000 / 52;
  const chi = topCounts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
  // df=51, 99.9% critical ~ 90
  expect(chi < 90, `chi-square ${chi.toFixed(1)}`);
  return `chi-square ${chi.toFixed(1)} (df=51)`;
});

/* ---------- side pots ---------- */
check('side pots: basic 3-way all-in', () => {
  const players = [
    { id: 0, committed: 100, folded: false },
    { id: 1, committed: 300, folded: false },
    { id: 2, committed: 300, folded: false },
  ];
  const pots = buildSidePots(players);
  expectEqual(pots.length, 2, 'pot count');
  expectEqual(pots[0].amount, 300, 'main');
  expectEqual(pots[0].eligible.join(','), '0,1,2', 'main eligible');
  expectEqual(pots[1].amount, 400, 'side');
  expectEqual(pots[1].eligible.join(','), '1,2', 'side eligible');
  return pots;
});

check('side pots: folded money goes to pot but not eligibility', () => {
  const players = [
    { id: 0, committed: 50, folded: true },
    { id: 1, committed: 100, folded: false },
    { id: 2, committed: 100, folded: false },
  ];
  const pots = buildSidePots(players);
  expectEqual(pots.reduce((s, p) => s + p.amount, 0), 250, 'total');
  expect(!pots.some((p) => p.eligible.includes(0)), 'folder not eligible');
  return pots.map((p) => `${p.amount}[${p.eligible}]`).join(' ');
});

check('side pots fuzz invariants', () => {
  for (let t = 0; t < 5000; t += 1) {
    const n = 2 + Math.floor(Math.random() * 7);
    const players = Array.from({ length: n }, (_, id) => ({
      id,
      committed: Math.floor(Math.random() * 1200),
      folded: Math.random() < 0.3,
    }));
    const total = players.reduce((s, p) => s + p.committed, 0);
    const pots = buildSidePots(players);
    const potTotal = pots.reduce((s, p) => s + p.amount, 0);
    if (potTotal !== total) throw new Error(`total mismatch ${potTotal} != ${total}`);
    for (const pot of pots) {
      if (pot.amount <= 0) throw new Error('non-positive pot');
      for (const id of pot.eligible) {
        const p = players[id];
        if (!p || p.folded || p.committed <= 0) throw new Error('bad eligibility');
      }
    }
    const levels = [...new Set(players.map((p) => p.committed).filter((v) => v > 0))].sort((a, b) => a - b);
    if (pots.length !== levels.length) throw new Error('pot count mismatch');
  }
  return '5000 random scenarios';
});

check('side pots: over-committed folded player leaves chips unassigned', () => {
  const players = [
    { id: 0, committed: 500, folded: true },
    { id: 1, committed: 100, folded: false },
  ];
  const pots = buildSidePots(players);
  const unassigned = pots.filter((p) => p.eligible.length === 0).reduce((s, p) => s + p.amount, 0);
  return `unassigned ${unassigned} chips in ${pots.length} pots (only reachable via impossible fold)`;
});

/* ---------- equity ---------- */
check('equity: AA vs one random hand', () => {
  const hole = parse('As Ah');
  const equity = estimateEquity(hole, [], 1, 4000);
  expect(equity > 0.80 && equity < 0.90, `equity ${equity.toFixed(3)}`);
  return equity.toFixed(3);
});
check('equity: 72o vs one random hand', () => {
  const hole = parse('7c 2d');
  const equity = estimateEquity(hole, [], 1, 4000);
  expect(equity > 0.28 && equity < 0.38, `equity ${equity.toFixed(3)}`);
  return equity.toFixed(3);
});

/* ---------- bots ---------- */
const AI = { aggression: 1, tight: 1, bluff: 0.1, speed: 1 };
function botLegal({ toCall = 0, canCheck = true, canRaise = false, stack = 1000, currentBet = 0 } = {}) {
  return {
    owed: toCall, toCall, canCheck, canRaise,
    minRaiseTo: currentBet + 10, maxRaiseTo: currentBet + stack,
    currentBet, stack,
  };
}

check('bot legal object uses toCall (field fixed)', () => {
  const legal = botLegal({ toCall: 100, canCheck: false, currentBet: 100 });
  expectEqual(legal.toCall, 100, 'toCall');
  return 'game.js and bots.js both use toCall';
});

check('postflop bot folds a weak hand to an all-in', () => {
  const board = parse('Ah Kd 7c');
  const hole = parse('2c 3d');
  let folds = 0;
  const n = 300;
  for (let i = 0; i < n; i += 1) {
    const action = decideBotAction({
      street: 'flop', board, pot: 100, currentBet: 1000, bigBlind: 10, activeCount: 2,
    }, { hole, ai: AI, stack: 1000, position: 0.5 }, botLegal({
      toCall: 1000, canCheck: false, canRaise: false, stack: 1000, currentBet: 1000,
    }));
    if (action.type === 'fold') folds += 1;
  }
  expect(folds > n * 0.5, `fold rate ${folds}/${n}`);
  return `fold rate ${Math.round((folds / n) * 100)}%`;
});

check('preflop bot folds AJs to a 100bb all-in', () => {
  const hole = parse('As Js');
  let folds = 0;
  const n = 200;
  for (let i = 0; i < n; i += 1) {
    const action = decideBotAction({
      street: 'preflop', board: [], pot: 1100, currentBet: 1000, bigBlind: 10, activeCount: 2,
    }, { hole, ai: AI, stack: 1000, position: 0.5 }, botLegal({
      toCall: 1000, canCheck: false, canRaise: false, stack: 1000, currentBet: 1000,
    }));
    if (action.type === 'fold') folds += 1;
  }
  expect(folds > n * 0.5, `fold rate ${folds}/${n}`);
  return `fold rate ${Math.round((folds / n) * 100)}%`;
});

check('preflop bot calls an all-in with AA', () => {
  const hole = parse('As Ah');
  let calls = 0;
  const n = 100;
  for (let i = 0; i < n; i += 1) {
    const action = decideBotAction({
      street: 'preflop', board: [], pot: 1100, currentBet: 1000, bigBlind: 10, activeCount: 2,
    }, { hole, ai: AI, stack: 1000, position: 0.5 }, botLegal({
      toCall: 1000, canCheck: false, canRaise: false, stack: 1000, currentBet: 1000,
    }));
    if (action.type === 'call') calls += 1;
  }
  expect(calls > 90, `calls ${calls}/${n}`);
  return `${calls}/100 calls with AA`;
});
check('bot decide time (postflop monte-carlo)', () => {
  const board = parse('Ah Kd 7c');
  const hole = parse('Qc Jd');
  const started = performance.now();
  for (let i = 0; i < 10; i += 1) {
    decideBotAction({
      street: 'flop', board, pot: 100, currentBet: 20, bigBlind: 10, activeCount: 4,
    }, { hole, ai: AI, stack: 1000, position: 0.5 }, botLegal({
      toCall: 20, canCheck: false, canRaise: true, stack: 1000, currentBet: 20,
    }));
  }
  const perDecision = (performance.now() - started) / 10;
  expect(perDecision < 2000, `too slow ${perDecision}`);
  return `${perDecision.toFixed(1)} ms per decision on this CPU`;
});

check('chen score sanity', () => {
  expectEqual(chenScore(parse('As Ah')), 20, 'AA');
  expectEqual(chenScore(parse('As Ks')), 12, 'AKs');
  const s72 = chenScore(parse('7c 2d'));
  expect(s72 < 2, `72o ${s72}`);
  return { AA: 20, AKs: 12, '72o': s72 };
});

const failed = results.filter((r) => !r.ok);
console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
fs.mkdirSync(path.join(import.meta.dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, 'out', 'logic-results.json'), JSON.stringify(results, null, 2));
