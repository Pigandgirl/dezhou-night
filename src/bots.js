import { chenScore, estimateEquity } from './poker.js';

function roundTo(value, step) {
  return Math.max(step, Math.round(value / step) * step);
}

function clampRaise(target, legal) {
  const amount = Math.round(Math.min(Math.max(target, legal.minRaiseTo), legal.maxRaiseTo));
  if (amount >= legal.maxRaiseTo) return { type: 'allin' };
  return { type: 'raise', amount };
}

function preflopDecision(state, player, legal) {
  const ai = player.ai;
  const r = Math.random();
  const bb = state.bigBlind;
  const chen = chenScore(player.hole);
  const styleShift = (ai.aggression - 1) * 2.2 + (ai.tight - 1) * -1.4;
  const roll = chen + styleShift + (player.position || 0) * 2.2 + (r - 0.5) * 3;

  if (legal.canCheck) {
    if (roll >= 10.5 && legal.canRaise && r < 0.8) {
      return clampRaise(state.currentBet + bb * 2.5, legal);
    }
    return { type: 'check' };
  }

  const allInCall = legal.toCall >= player.stack;
  const stackRatio = legal.toCall / Math.max(1, player.stack);

  if (allInCall) {
    // Calling a full stack off: only premium holdings are worth it.
    return chen >= 11 ? { type: 'call' } : { type: 'fold' };
  }

  if (roll >= 9.6 && legal.canRaise) {
    if (roll >= 14 && r < 0.24 && legal.maxRaiseTo > state.pot * 0.9) {
      return { type: 'allin' };
    }
    return clampRaise(
      state.currentBet + Math.max(bb * 2, state.currentBet * 0.85 + state.pot * 0.3),
      legal,
    );
  }

  if (roll >= 6.8 || (roll >= 5.4 && r < 0.5)) {
    if (stackRatio < 0.55) return { type: 'call' };
    if (roll >= 9) return { type: 'call' };
  }

  if (roll >= 4.2 && legal.toCall <= bb * 1.2 && r < 0.35) {
    return { type: 'call' };
  }

  if (legal.canRaise && r < ai.bluff * 0.55 && legal.toCall <= bb * 2) {
    return clampRaise(state.currentBet + bb * 2, legal);
  }

  return { type: 'fold' };
}

function postflopDecision(state, player, legal) {
  const ai = player.ai;
  const opponents = Math.max(1, state.activeCount - 1);
  const iterations = opponents <= 2 ? 240 : opponents <= 4 ? 170 : 120;
  const equity = estimateEquity(player.hole, state.board, opponents, iterations);
  const noise = (Math.random() - 0.5) * 0.06;
  const strength = equity + noise;
  const pot = Math.max(state.pot, state.bigBlind * 2);
  const potOdds = legal.toCall > 0 ? legal.toCall / (state.pot + legal.toCall) : 0;
  const r = Math.random();

  if (legal.canCheck) {
    if (strength > 0.74 && legal.canRaise) {
      if (strength > 0.9 && r < 0.3) return { type: 'allin' };
      return clampRaise(state.currentBet + pot * (0.55 + r * 0.3), legal);
    }
    if (strength > 0.56 && r < 0.32) {
      return clampRaise(state.currentBet + pot * 0.45, legal);
    }
    if (r < ai.bluff * 0.5) {
      return clampRaise(state.currentBet + pot * (0.35 + r * 0.25), legal);
    }
    return { type: 'check' };
  }

  const allInCall = legal.toCall >= player.stack;
  const commitment = legal.toCall / Math.max(1, player.stack);

  if (strength > 0.86 && legal.canRaise && !allInCall && r < 0.42) {
    return clampRaise(state.currentBet + pot * 0.65, legal);
  }

  const callMargin = allInCall || commitment > 0.6 ? 0.12 : 0.035;
  if (strength > potOdds + callMargin) {
    return { type: 'call' };
  }
  if (strength > potOdds + 0.01 && r < 0.25) {
    return { type: 'call' };
  }

  if (!allInCall && legal.canRaise && r < ai.bluff * 0.18 && legal.toCall < pot * 0.2) {
    return clampRaise(legal.currentBet + pot * 0.6, legal);
  }

  return { type: 'fold' };
}

export function decideBotAction(state, player, legal) {
  if (!legal.canCheck && legal.toCall <= 0) return { type: 'check' };
  if (!player.hole || player.hole.length < 2) return { type: 'fold' };
  if (state.street === 'preflop') return preflopDecision(state, player, legal);
  return postflopDecision(state, player, legal);
}

export function botThinkTime(player) {
  const base = 520 + Math.random() * 620;
  return base * (player.ai.speed || 1);
}
