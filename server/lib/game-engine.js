'use strict';

/**
 * Server-authoritative no-limit Hold'em engine for one room.
 *
 * The server owns the deck, the betting state and the settlement. Clients only
 * render snapshots and send intents; the host client has no special authority.
 */

const {
  makeDeck, shuffle, evaluate, compareScores, buildPots, handDetail, rankLabel,
} = require('./poker');

const TURN_MS = Math.max(3000, Number(process.env.TURN_MS || 15000));
const NEXT_HAND_MS = Math.max(1000, Number(process.env.NEXT_HAND_MS || 15000));
const RUNOUT_MS = Math.max(200, Number(process.env.RUNOUT_MS || 900));
const CHIPS_MAX = 100000;
const SB = 1;
const BB = 2;
const MAX_SEATS = 8;

const ACTIONS = new Set(['fold', 'check', 'call', 'raise', 'allin']);

class GameEngine {
  constructor(room, deps) {
    this.room = room;
    this.deps = deps;
    this.phase = 'idle';
    this.handNo = 0;
    this.dealerSeat = -1;
    this.players = [];
    this.board = [];
    this.deck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.sb = Math.max(1, Math.floor(Number(room.sb) || SB));
    this.bb = Math.max(this.sb * 2, Math.floor(Number(room.bb) || this.sb * 2));
    this.lastRaise = this.bb;
    this.turnSeat = -1;
    this.turnDeadline = 0;
    this.lastActorSeat = -1;
    this.street = 'preflop';
    this.winners = [];
    this.showdown = false;
    this.nextHandAt = 0;
    this.nextReady = new Set();
    this.settlement = null;
    this.gameOverGrace = false;
    this.turnTimer = null;
    this.nextTimer = null;
    this.runoutTimer = null;
    this.disposed = false;
  }

  isActive() {
    return !this.disposed && (this.phase === 'play' || this.phase === 'deal');
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  start(options = {}) {
    if (this.disposed) return { ok: false, error: '牌局已关闭' };
    if (this.phase !== 'idle') return { ok: false, error: '牌局已经开始' };
    this.clearTimers();

    const allowOfflineReady = Boolean(options.allowOfflineReady);
    const candidates = [...this.room.players.values()]
      .filter((p) => !p.spectator && p.userKey
        && (p.online || (allowOfflineReady && this.nextReady.has(p.token))))
      .map((p) => ({ player: p, user: this.deps.getUser(p.userKey) }))
      .filter(({ player, user }) => user && (this.room.match === false
        ? player.playChips === undefined || Number(player.playChips) >= 1
        : Number(user.chips) >= 1))
      .slice(0, MAX_SEATS);

    if (candidates.length < 2) {
      return { ok: false, error: '至少需要 2 位在线玩家' };
    }

    this.handNo += 1;
    if (this.dealerSeat < 0) this.dealerSeat = 0;
    else this.dealerSeat = (this.dealerSeat + 1) % candidates.length;

    for (const { player } of candidates) {
      player.waitingNext = false;
      player.ready = false;
    }
    this.deps.playersChanged?.();
    this.players = candidates.map(({ player, user }, seat) => ({
      token: player.token,
      pid: player.pid,
      seat,
      seatNo: Number.isInteger(player.seatNo) && player.seatNo >= 0 ? player.seatNo : seat,
      name: player.name,
      userKey: player.userKey,
      user,
      online: true,
      stack: Math.max(0, Math.round(this.room.match === false
        ? (player.playChips === undefined ? Number(this.room.startingChips) || 100 : Number(player.playChips))
        : Number(user.chips) || 0)),
      hole: [],
      folded: false,
      allIn: false,
      bet: 0,
      committed: 0,
      acted: false,
      action: '',
      handName: '',
      handCategory: -1,
      won: 0,
      startStack: 0,
    }));
    for (const p of this.players) p.startStack = p.stack;
    this.deps.save();

    this.phase = 'deal';
    this.board = [];
    this.deck = shuffle(makeDeck());
    this.winners = [];
    this.showdown = false;
    this.nextHandAt = 0;
    this.nextReady = new Set();
    this.settlement = null;
    this.pot = 0;
    this.currentBet = 0;
    this.lastRaise = this.bb;
    this.turnSeat = -1;
    this.lastActorSeat = -1;
    this.street = 'preflop';

    // Deal two cards to each player, starting left of the button.
    const n = this.players.length;
    for (let round = 0; round < 2; round += 1) {
      for (let step = 1; step <= n; step += 1) {
        const p = this.players[(this.dealerSeat + step) % n];
        p.hole.push(this.deck.pop());
      }
    }

    const sbSeat = n === 2 ? this.dealerSeat : (this.dealerSeat + 1) % n;
    const bbSeat = n === 2 ? (this.dealerSeat + 1) % n : (this.dealerSeat + 2) % n;
    this.postBlind(this.players[sbSeat], this.sb, '小盲');
    this.postBlind(this.players[bbSeat], this.bb, '大盲');
    this.currentBet = Math.max(this.bb, ...this.players.map((p) => p.bet));
    this.lastRaise = this.bb;
    this.pot = this.totalCommitted();

    this.phase = 'play';
    this.sendHoles();
    this.broadcastState();

    let first;
    if (n === 2) {
      // Heads-up: the button posts the small blind and acts first preflop.
      first = this.players[this.dealerSeat].allIn ? this.firstActor(this.dealerSeat) : this.dealerSeat;
    } else {
      first = this.firstActor(bbSeat);
    }
    if (first === -1) {
      this.runout();
      return { ok: true };
    }
    this.turnSeat = first;
    this.scheduleTurn();
    this.broadcastState();
    return { ok: true };
  }

  postBlind(player, amount, label) {
    const paid = this.pay(player, amount);
    player.action = label;
    if (paid > 0) player.lastBlind = label;
  }

  pay(player, amount) {
    const paid = Math.min(Math.max(0, Math.round(amount)), player.stack);
    player.stack -= paid;
    player.bet += paid;
    player.committed += paid;
    if (player.stack <= 0) {
      player.stack = 0;
      player.allIn = true;
    }
    return paid;
  }

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */

  action(token, rawAction) {
    if (!this.isActive()) return { status: 409, error: '当前没有进行中的牌局' };
    const player = this.players.find((p) => p.token === token);
    if (!player) return { status: 403, error: '你不在本局牌桌上' };
    if (this.turnSeat !== player.seat) return { status: 409, error: '还没轮到你行动' };
    if (player.folded || player.allIn) return { status: 409, error: '你当前无法行动' };
    const action = rawAction && typeof rawAction === 'object' ? rawAction : {};
    const type = String(action.type || '');
    if (!ACTIONS.has(type)) return { status: 400, error: '未知操作' };
    const legal = this.getLegal(player);
    if (type === 'check' && !legal.canCheck) return { status: 409, error: '当前不能过牌' };
    this.applyAction(player, { ...action, type }, legal, false);
    return { ok: true };
  }

  applyAction(player, action, legal, auto) {
    if (!this.isActive()) return;
    let type = action.type;
    if (type === 'call' && legal.toCall <= 0) type = 'check';
    if ((type === 'raise' || type === 'allin') && !legal.canRaise) {
      type = legal.toCall > 0 ? 'call' : 'check';
    }

    this.turnSeat = -1;
    this.turnDeadline = 0;
    this.clearTurnTimer();
    this.lastActorSeat = player.seat;

    if (type === 'fold') {
      player.folded = true;
      player.acted = true;
      player.action = auto ? '超时弃牌' : '弃牌';
    } else if (type === 'check') {
      player.acted = true;
      player.action = '过牌';
    } else if (type === 'call') {
      const paid = this.pay(player, legal.toCall);
      player.acted = true;
      player.action = player.allIn ? '全下' : (paid > 0 ? '跟注' : '过牌');
    } else {
      let target = player.bet + player.stack;
      let invalidRaise = false;
      if (type === 'raise') {
        const requested = Math.round(Number(action.amount));
        if (!Number.isFinite(requested) || requested <= 0) {
          invalidRaise = true;
        } else {
          target = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, requested));
        }
      }
      if (invalidRaise || target <= this.currentBet) {
        const paid = this.pay(player, legal.toCall);
        player.acted = true;
        player.action = player.allIn ? '全下' : (paid > 0 ? '跟注' : '过牌');
      } else {
        const previousBet = this.currentBet;
        this.pay(player, target - player.bet);
        player.acted = true;
        const raiseSize = player.bet - previousBet;
        if (raiseSize >= this.lastRaise) {
          this.lastRaise = raiseSize;
          for (const other of this.players) {
            if (other !== player && !other.folded && !other.allIn) other.acted = false;
          }
        }
        this.currentBet = player.bet;
        player.action = player.allIn
          ? '全下'
          : (previousBet === 0 ? `下注 ${player.bet}` : `加注到 ${player.bet}`);
      }
    }

    this.pot = this.totalCommitted();
    this.afterAction();
  }

  afterAction() {
    if (!this.isActive()) return;
    const active = this.players.filter((p) => !p.folded);
    if (active.length <= 1) {
      this.finish(false);
      return;
    }
    const actors = active.filter((p) => !p.allIn && p.stack > 0);
    if (!actors.length) {
      this.broadcastState();
      this.runout();
      return;
    }
    const complete = actors.every((p) => p.acted && p.bet === this.currentBet);
    if (!complete) {
      const next = this.nextActor(this.lastActorSeat);
      if (next === -1) {
        this.completeStreet();
        return;
      }
      this.turnSeat = next;
      this.broadcastState();
      this.scheduleTurn();
      return;
    }
    this.completeStreet();
  }

  completeStreet() {
    if (!this.isActive()) return;
    this.pot = this.totalCommitted();
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
      p.action = '';
    }
    this.currentBet = 0;
    this.lastRaise = BB;

    if (this.street === 'river') {
      this.finish(true);
      return;
    }

    this.lastRaise = this.bb;
    const nextStreet = this.street === 'preflop' ? 'flop' : this.street === 'flop' ? 'turn' : 'river';
    const count = nextStreet === 'flop' ? 3 : 1;
    for (let i = 0; i < count; i += 1) this.board.push(this.deck.pop());
    this.street = nextStreet;

    const actors = this.players.filter((p) => !p.folded && !p.allIn && p.stack > 0);
    if (!actors.length) {
      this.broadcastState();
      this.runout();
      return;
    }

    const first = this.firstActor(this.dealerSeat);
    this.turnSeat = first;
    this.broadcastState();
    if (first === -1) this.runout();
    else this.scheduleTurn();
  }

  runout() {
    if (!this.isActive()) return;
    this.turnSeat = -1;
    const step = () => {
      if (this.disposed || !this.isActive()) return;
      if (this.board.length >= 5) {
        this.finish(true);
        return;
      }
      const need = this.board.length === 0 ? 3 : 1;
      for (let i = 0; i < need; i += 1) this.board.push(this.deck.pop());
      this.street = this.board.length === 3 ? 'flop' : this.board.length === 4 ? 'turn' : 'river';
      this.broadcastState();
      this.runoutTimer = setTimeout(step, RUNOUT_MS);
      if (this.runoutTimer.unref) this.runoutTimer.unref();
    };
    step();
  }

  /* ------------------------------------------------------------------ */
  /* settlement                                                          */
  /* ------------------------------------------------------------------ */

  finish(showdown) {
    if (this.phase === 'settle' || this.phase === 'idle') return;
    this.phase = 'settle';
    this.clearTurnTimer();
    const total = this.totalCommitted();
    const amounts = new Map();
    const winners = new Map();

    if (!showdown) {
      const winner = this.players.find((p) => !p.folded);
      if (winner) {
        winner.stack += total;
        amounts.set(winner.seat, total);
        winners.set(winner.seat, winner);
      }
    } else {
      const pots = buildPots(
        this.players.map((p) => ({ seat: p.seat, committed: p.committed, folded: p.folded, player: p })),
      );
      for (const pot of pots) {
        if (!pot.eligible.length) {
          // Uncalled excess of a folded player: give it back instead of losing it.
          const contributor = pot.contributors[0];
          if (contributor) {
            contributor.player.stack += pot.amount;
            amounts.set(contributor.player.seat, (amounts.get(contributor.player.seat) || 0) + pot.amount);
          }
          continue;
        }
        let best = null;
        let potWinners = [];
        for (const entry of pot.eligible) {
          const p = entry.player || this.players[entry.seat];
          const result = evaluate([...p.hole, ...this.board]);
          if (!best || compareScores(result.score, best.score) > 0) {
            best = result;
            potWinners = [p];
          } else if (compareScores(result.score, best.score) === 0) {
            potWinners.push(p);
          }
        }
        if (!potWinners.length) continue;
        const share = Math.floor(pot.amount / potWinners.length);
        let remainder = pot.amount - share * potWinners.length;
        const ordered = potWinners
          .slice()
          .sort((a, b) => ((a.seat - this.dealerSeat + 8) % 8) - ((b.seat - this.dealerSeat + 8) % 8));
        for (const p of ordered) {
          const bonus = remainder > 0 ? 1 : 0;
          if (remainder > 0) remainder -= 1;
          p.stack += share + bonus;
          amounts.set(p.seat, (amounts.get(p.seat) || 0) + share + bonus);
          winners.set(p.seat, p);
        }
      }
    }

    this.winners = [...amounts.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([seat, amount]) => ({
        seat,
        name: this.players[seat]?.name || '',
        amount,
      }));

    this.showdown = Boolean(showdown);
    this.nextReady = new Set();
    this.nextHandAt = Date.now() + NEXT_HAND_MS;
    for (const p of this.players) {
      p.won = amounts.get(p.seat) || 0;
      p.handName = '';
      p.handDetail = '';
      p.bestCards = [];
      p.score = [];
      if (p.folded) continue;
      if (showdown) {
        const result = evaluate([...p.hole, ...this.board]);
        p.handName = result.name;
        p.handCategory = result.category;
        p.handDetail = handDetail(result.score);
        p.bestCards = result.best;
        p.score = result.score;
      } else if (p.won > 0) {
        p.handName = '弃牌获胜';
        p.handDetail = '其他玩家全部弃牌';
      }
    }
    this.settlement = this.buildSettlement(total, this.showdown);
    this.gameOverGrace = false;
    if (this.room.loserSpectate) {
      let changed = false;
      for (const p of this.players) {
        if (p.stack > 0) continue;
        const roomPlayer = this.room.players.get(p.token);
        if (roomPlayer && !roomPlayer.spectator) {
          roomPlayer.spectator = true;
          roomPlayer.ready = false;
          changed = true;
        }
      }
      if (changed) this.deps.playersChanged?.();
    }

    for (const p of this.players) {
      if (!p.user) continue;
      if (this.room.match !== false) {
        p.user.chips = Math.max(0, Math.min(CHIPS_MAX, Math.round(p.stack)));
      } else {
        const roomPlayer = this.room.players.get(p.token);
        if (roomPlayer) roomPlayer.playChips = Math.max(0, Math.round(p.stack));
      }
      p.user.rounds = (p.user.rounds || 0) + 1;
    }
    this.deps.save();
    this.pot = total;
    this.broadcastState(Boolean(this.showdown));
    this.deps.onSettle?.({
      room: this.room,
      hand: this.handNo,
      winners: this.winners,
      players: this.players.map((p) => ({
        token: p.token, userKey: p.userKey, seat: p.seat, stack: p.stack, user: p.user,
      })),
    });

    this.nextTimer = setTimeout(() => this.nextHand(), NEXT_HAND_MS);
    if (this.nextTimer.unref) this.nextTimer.unref();
  }

  buildSettlement(total, showdown) {
    const contenders = this.players
      .filter((p) => !p.folded)
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        stack: p.stack || 0,
        // All-fold hands are not showdowns: never expose the winner's hole
        // cards or hand type, otherwise the table leaks that player's play.
        hole: showdown ? (p.hole || []).slice() : undefined,
        bestCards: showdown ? (p.bestCards || []).slice() : [],
        handName: showdown ? (p.handName || '') : '',
        handDetail: showdown ? (p.handDetail || '') : '',
        score: showdown ? (p.score || []).slice() : [],
        won: p.won || 0,
        rank: 1,
        winner: false,
        reason: '',
      }));

    if (showdown) {
      contenders.sort((a, b) => compareScores(b.score, a.score) || a.seat - b.seat);
    } else {
      contenders.sort((a, b) => b.won - a.won || a.seat - b.seat);
    }

    let rank = 0;
    let previous = null;
    contenders.forEach((row, index) => {
      if (showdown) {
        if (!previous || compareScores(row.score, previous) !== 0) {
          rank = index + 1;
          previous = row.score;
        }
        row.rank = rank;
      } else {
        row.rank = 1;
      }
      row.winner = row.won > 0;
    });

    const top = contenders[0];
    const topWinners = contenders.filter((row) => row.rank === 1 && row.winner).length;
    for (const row of contenders) {
      if (!showdown) {
        row.reason = row.winner ? '其他玩家全部弃牌，直接赢得底池' : '已弃牌';
      } else if (row.winner) {
        if (row.rank === 1) {
          row.reason = topWinners > 1
            ? '牌型相同，与并列赢家平分底池'
            : `${row.handDetail}，为全场最大牌型，赢得底池`;
        } else {
          row.reason = `${row.handDetail}，赢得边池`;
        }
      } else {
        row.reason = this.compareReason(top, row);
      }
    }

    return {
      showdown: Boolean(showdown),
      pot: total,
      contenders,
      folded: this.players.filter((p) => p.folded).map((p) => p.name),
      winners: this.winners.map((w) => ({ ...w })),
    };
  }

  compareReason(top, row) {
    if (!top) return '';
    if (compareScores(row.score, top.score) === 0) {
      return '牌型相同，但底池由并列赢家平分';
    }
    if (top.handName !== row.handName) {
      return `${top.handDetail} 大于 ${row.handDetail}`;
    }
    const len = Math.max(top.score.length, row.score.length);
    for (let i = 1; i < len; i += 1) {
      const a = top.score[i] ?? 0;
      const b = row.score[i] ?? 0;
      if (a !== b) {
        return `同为${top.handName}，${rankLabel(a)} 大于 ${rankLabel(b)}`;
      }
    }
    return `${top.handDetail} 大于 ${row.handDetail}`;
  }

  nextReadyCandidates() {
    // 异步房间：只统计仍在房间、在线、未观战且还有资格玩下一手的玩家。
    // 已退出、掉线、观战、筹码不足的人不能继续阻塞其他人。
    return [...this.room.players.values()].filter((p) => {
      if (!p || p.spectator || !p.online || !p.userKey) return false;
      const user = this.deps.getUser(p.userKey);
      if (!user) return false;
      return this.room.match === false
        ? p.playChips === undefined || Number(p.playChips) >= 1
        : Number(user.chips) >= 1;
    });
  }

  isNextReady(token) {
    const roomPlayer = this.room.players.get(token);
    if (!roomPlayer) return false;
    // 中途加入的等下一手玩家默认已准备，避免“人进来了却要求别人再等他点准备”。
    return this.nextReady.has(token) || Boolean(roomPlayer.waitingNext);
  }

  checkNextReady() {
    if (this.phase !== 'settle') return { started: false };
    const candidates = this.nextReadyCandidates();
    const allReady = candidates.length >= 2 && candidates.every((p) => this.isNextReady(p.token));
    if (allReady) {
      this.nextHand();
      return { started: true };
    }
    this.broadcastState(true);
    return { started: false };
  }

  // 结算后继续下一手：所有人点“继续下一把”立即发牌，只有未全员时才等 AFK 计时
  markNextReady(token) {
    if (this.phase !== 'settle') {
      return { ok: false, error: '当前不在结算阶段' };
    }
    const player = this.players.find((p) => p.token === token);
    const roomPlayer = this.room.players.get(token);
    if (!player || !roomPlayer || !roomPlayer.online || roomPlayer.spectator) {
      return { ok: false, error: '你当前不在牌桌上' };
    }
    this.nextReady.add(token);
    const result = this.checkNextReady();
    return { ok: true, started: result.started };
  }

  nextHand() {
    if (this.disposed) return;
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    const ready = [...this.room.players.values()].filter((p) => {
      if (p.spectator || !p.userKey) return false;
      if (!p.online) return false;
      const user = this.deps.getUser(p.userKey);
      return user && (this.room.match === false
        ? p.playChips === undefined || Number(p.playChips) >= 1
        : Number(user.chips) >= 1);
    });
    if (ready.length < 2) {
      // Keep the settlement visible for 15s, then give clients another
      // 15s to show the restart/exit confirmation before ending the game.
      if (!this.gameOverGrace) {
        this.gameOverGrace = true;
        this.nextHandAt = Date.now() + 15000;
        this.broadcastState(true);
        this.nextTimer = setTimeout(() => this.endGame('对局结束'), 15000);
        if (this.nextTimer.unref) this.nextTimer.unref();
        return;
      }
      this.endGame('对局结束');
      return;
    }
    this.phase = 'idle';
    this.winners = [];
    this.settlement = null;
    this.board = [];
    this.pot = 0;
    this.players = [];
    this.deps.playersChanged?.();
    const result = this.start();
    if (!result.ok) this.endGame(result.error || '无法继续牌局');
  }

  endGame(reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.clearTimers();
    this.players = [];
    this.board = [];
    this.winners = [];
    this.settlement = null;
    this.deps.onGameOver?.(reason || '对局结束');
  }

  dispose() {
    this.disposed = true;
    this.phase = 'idle';
    this.clearTimers();
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  clearTimers() {
    this.clearTurnTimer();
    for (const key of ['nextTimer', 'runoutTimer']) {
      if (this[key]) {
        clearTimeout(this[key]);
        this[key] = null;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* players / turn helpers                                              */
  /* ------------------------------------------------------------------ */

  setOnline(token, online) {
    const player = this.players.find((p) => p.token === token);
    if (player) player.online = Boolean(online);
    const roomPlayer = this.room.players.get(token);
    if (roomPlayer) roomPlayer.online = Boolean(online);
    // 已经双方准备后，若某人的 SSE 刚恢复，再检查一次，避免卡在 2/1
    if (this.phase === 'settle') this.checkNextReady();
  }

  removePlayer(token) {
    const player = this.players.find((p) => p.token === token);
    if (!player) return;
    player.online = false;
    if (this.phase === 'settle') {
      this.nextReady.delete(token);
      this.checkNextReady();
      return;
    }
    if (!this.isActive()) return;
    player.folded = true;
    player.action = '离开';
    if (this.turnSeat === player.seat) {
      this.turnSeat = -1;
      this.clearTurnTimer();
      this.lastActorSeat = player.seat;
      this.afterAction();
    } else {
      const active = this.players.filter((p) => !p.folded);
      if (active.length <= 1) this.finish(false);
      else this.broadcastState();
    }
  }

  scheduleTurn() {
    this.clearTurnTimer();
    if (this.turnSeat < 0) return;
    this.turnDeadline = Date.now() + TURN_MS;
    this.turnTimer = setTimeout(() => {
      if (!this.isActive()) return;
      const player = this.players.find((p) => p.seat === this.turnSeat);
      if (!player) return;
      const legal = this.getLegal(player);
      this.applyAction(player, { type: legal.canCheck ? 'check' : 'fold' }, legal, true);
    }, TURN_MS);
    if (this.turnTimer.unref) this.turnTimer.unref();
  }

  firstActor(fromSeat) {
    const n = this.players.length;
    for (let step = 1; step <= n; step += 1) {
      const p = this.players[(fromSeat + step) % n];
      if (!p.folded && !p.allIn && p.stack > 0) return p.seat;
    }
    return -1;
  }

  nextActor(fromSeat) {
    const n = this.players.length;
    for (let step = 1; step <= n; step += 1) {
      const p = this.players[(fromSeat + step) % n];
      if (!p.folded && !p.allIn && p.stack > 0 && (!p.acted || p.bet < this.currentBet)) return p.seat;
    }
    return -1;
  }

  getLegal(player) {
    const owed = Math.max(0, this.currentBet - player.bet);
    const toCall = Math.min(owed, player.stack);
    const canCheck = owed === 0;
    const maxRaiseTo = player.bet + player.stack;
    const minRaiseTo = this.currentBet === 0
      ? Math.min(maxRaiseTo, this.bb)
      : Math.min(maxRaiseTo, this.currentBet + this.lastRaise);
    const canRaise = player.stack > owed && maxRaiseTo > this.currentBet;
    return {
      owed,
      toCall,
      canCheck,
      canRaise,
      minRaiseTo,
      maxRaiseTo,
      currentBet: this.currentBet,
      stack: player.stack,
      pot: this.totalCommitted(),
    };
  }

  totalCommitted() {
    return this.players.reduce((sum, p) => sum + p.committed, 0);
  }

  /* ------------------------------------------------------------------ */
  /* snapshots                                                           */
  /* ------------------------------------------------------------------ */

  sendHoles() {
    for (const p of this.players) {
      const roomPlayer = this.room.players.get(p.token);
      this.deps.direct(roomPlayer || p, {
        seat: p.seat,
        hole: p.hole,
        hand: this.handNo,
      });
    }
  }

  sendHole(playerToken) {
    const p = this.players.find((item) => item.token === playerToken);
    if (!p || !p.hole.length) return;
    const roomPlayer = this.room.players.get(playerToken);
    this.deps.direct(roomPlayer || p, { seat: p.seat, hole: p.hole, hand: this.handNo });
  }

  snapshot(reveal = false) {
    const turnPlayer = this.players.find((p) => p.seat === this.turnSeat);
    return {
      roomCode: this.room.code,
      scene: this.room.scene || 'private',
      hand: this.handNo,
      dealer: this.dealerSeat,
      street: this.street,
      board: this.board,
      pot: this.totalCommitted(),
      phase: this.phase === 'settle' ? 'settle' : (this.phase === 'idle' || this.phase === 'ended' ? 'idle' : 'play'),
      showdown: Boolean(this.showdown),
      nextHandAt: this.nextHandAt,
      nextReadySeats: this.players
        .filter((p) => this.isNextReady(p.token))
        .map((p) => p.seat),
      nextReadyCount: this.phase === 'settle'
        ? this.nextReadyCandidates().filter((p) => this.isNextReady(p.token)).length
        : 0,
      nextReadyTotal: this.phase === 'settle' ? this.nextReadyCandidates().length : 0,
      seats: this.players.map((p) => ({
        seat: p.seat,
        seatNo: p.seatNo,
        pid: p.pid,
        name: p.name,
        stack: p.stack,
        folded: p.folded,
        allIn: p.allIn,
        bet: p.bet,
        action: p.action || '',
        human: true,
        handName: p.handName || '',
        handDetail: p.handDetail || '',
        bestCards: p.bestCards || [],
        score: p.score || [],
        won: p.won || 0,
        hole: reveal && !p.folded && p.hole.length ? p.hole : undefined,
        revealed: Boolean(reveal && !p.folded),
      })),
      settlement: this.phase === 'settle' ? this.settlement : null,
      turn: turnPlayer && this.phase === 'play'
        ? { seat: turnPlayer.seat, legal: this.getLegal(turnPlayer) }
        : null,
      turnDeadline: this.turnDeadline,
      winners: this.winners,
    };
  }

  broadcastState(reveal = false) {
    this.deps.broadcast('state', this.snapshot(reveal));
  }
}

module.exports = { GameEngine, TURN_MS, NEXT_HAND_MS, CHIPS_MAX };
