'use strict';

/**
 * Server-side poker primitives. Mirrors src/poker.js, but uses crypto RNG for
 * shuffling because the server is now the only dealer.
 */

const crypto = require('crypto');

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const CATEGORY_NAMES = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺',
];

function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, key: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function score5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
      straightHigh = 5;
    }
  }

  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], ...ranks.filter((r) => r !== groups[0][0])];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const kicker = ranks.find((r) => r !== groups[0][0] && r !== groups[1][0]);
    return [2, groups[0][0], groups[1][0], kicker];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...ranks.filter((r) => r !== groups[0][0])];
  return [0, ...ranks];
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

/** Human-readable tie-break detail for the settlement list. */
function handDetail(score) {
  if (!Array.isArray(score) || !score.length || score[0] < 0) return '未摊牌';
  const r = rankLabel;
  switch (score[0]) {
    case 0: return `高牌 ${r(score[1])}`;
    case 1: return `一对 ${r(score[1])}，${r(score[2])} 踢脚`;
    case 2: return `两对 ${r(score[1])}/${r(score[2])}，${r(score[3])} 踢脚`;
    case 3: return `三条 ${r(score[1])}，${r(score[2])} 踢脚`;
    case 4: return `顺子 ${r(score[1])} 高`;
    case 5: return `同花 ${r(score[1])} 高`;
    case 6: return `葫芦 ${r(score[1])} 带 ${r(score[2])}`;
    case 7: return `四条 ${r(score[1])}，${r(score[2])} 踢脚`;
    case 8: return `同花顺 ${r(score[1])} 高`;
    default: return '未摊牌';
  }
}

function evaluate(cards) {
  const n = cards.length;
  if (n < 5) return { score: [-1], best: cards.slice(), name: '高牌', category: 0 };
  let bestScore = null;
  let bestCards = null;
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const score = score5(combo);
            if (!bestScore || compareScores(score, bestScore) > 0) {
              bestScore = score;
              bestCards = combo;
            }
          }
        }
      }
    }
  }
  const category = bestScore[0];
  let name = CATEGORY_NAMES[category];
  if (category === 8 && bestScore[1] === 14) name = '皇家同花顺';
  return { score: bestScore, best: bestCards, name, category };
}

/** Side pots with contributor information (needed for refunds). */
function buildPots(players) {
  const levels = [...new Set(players.map((p) => p.committed).filter((v) => v > 0))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = players.filter((p) => p.committed >= level);
    const amount = (level - previous) * contributors.length;
    if (amount > 0) {
      pots.push({
        amount,
        contributors,
        eligible: contributors.filter((p) => !p.folded),
      });
    }
    previous = level;
  }
  return pots;
}

/** Legacy helper kept for tests/back-compat. */
function buildSidePots(players) {
  return buildPots(players).map((pot) => ({
    amount: pot.amount,
    eligible: pot.eligible.map((p) => p.id),
  }));
}

module.exports = {
  SUITS,
  RANKS,
  CATEGORY_NAMES,
  cardKey,
  makeDeck,
  shuffle,
  score5,
  compareScores,
  rankLabel,
  handDetail,
  evaluate,
  buildPots,
  buildSidePots,
};
