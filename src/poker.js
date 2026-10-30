export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_LABELS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const CATEGORY_NAMES = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺',
];

export function cardKey(card) {
  return `${card.rank}${card.suit}`;
}

export function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

export function handDetail(score) {
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

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, key: `${rank}${suit}` });
    }
  }
  return deck;
}

export const FULL_DECK = makeDeck();

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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

export function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function evaluate(cards) {
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

export function evaluateHoldem(hole, board) {
  return evaluate([...hole, ...board]);
}

/** 蒙特卡洛胜率估算 */
export function estimateEquity(hole, board, opponentCount, iterations = 180) {
  if (opponentCount <= 0) return 1;
  const known = new Set([...hole, ...board].map(cardKey));
  const pool = FULL_DECK.filter((c) => !known.has(c.key));
  const needBoard = 5 - board.length;
  const draws = opponentCount * 2 + needBoard;
  let equity = 0;

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < draws; i += 1) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const completeBoard = board.slice();
    for (let i = 0; i < needBoard; i += 1) {
      completeBoard.push(pool[opponentCount * 2 + i]);
    }
    const mine = evaluate([...hole, ...completeBoard]).score;
    let ties = 0;
    let beaten = false;
    for (let o = 0; o < opponentCount; o += 1) {
      const oppHole = [pool[o * 2], pool[o * 2 + 1]];
      const score = evaluate([...oppHole, ...completeBoard]).score;
      const cmp = compareScores(score, mine);
      if (cmp > 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) ties += 1;
    }
    if (!beaten) equity += 1 / (ties + 1);
  }
  return equity / iterations;
}

/** 边池计算：committed 为每位玩家本手总投入 */
export function buildSidePots(players) {
  const levels = [...new Set(players.map((p) => p.committed).filter((v) => v > 0))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = players.filter((p) => p.committed >= level);
    const amount = (level - previous) * contributors.length;
    if (amount > 0) {
      pots.push({
        amount,
        eligible: contributors.filter((p) => !p.folded).map((p) => p.id),
      });
    }
    previous = level;
  }
  return pots;
}

/** 陈氏牌力评估（翻牌前） */
export function chenScore(hole) {
  if (!hole || hole.length < 2) return 0;
  const [a, b] = hole.map((c) => c.rank).sort((x, y) => y - x);
  const high = a;
  let score = high === 14 ? 10 : high === 13 ? 8 : high === 12 ? 7 : high === 11 ? 6 : high / 2;
  if (a === b) score = Math.max(5, score * 2);
  if (hole[0].suit === hole[1].suit) score += 2;
  const gap = a - b - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  if (gap <= 1 && a < 12) score += 1;
  return score;
}

export function describeHole(hole) {
  if (!hole || hole.length < 2) return '';
  const [a, b] = hole.map((c) => c.rank).sort((x, y) => y - x);
  if (a === b) return `口袋 ${a}`;
  return `${a} ${b}${hole[0].suit === hole[1].suit ? ' 同花' : ''}`;
}
