import { PROFILES } from './game.js';
import { audio } from './audio.js';

const SUITS = ['s', 'h', 'd', 'c'];

function placeholderCard(index) {
  return { rank: 2 + (index % 13), suit: SUITS[index % 4] };
}

function cardKey(card) {
  return card ? `${card.rank}${card.suit}` : '';
}

/**
 * Online tables use the same 3D room/table as single-player.
 * The server remains authoritative; this class only mirrors its state into
 * PokerScene + the existing single-player HUD controls.
 */
export class OnlineTable3D {
  constructor({ scene, hud, online, account }) {
    this.scene = scene;
    this.hud = hud;
    this.online = online;
    this.account = account;
    this.active = false;
    this.state = null;
    this.room = null;
    this.heroSeat = -1;
    this.heroDisplay = -1;
    this.pendingEnter = false;
    this.displayByServer = new Map();
    this.serverByDisplay = [];
    this.currentHand = -1;
    this.currentStreet = '';
    this.boardCount = 0;
    this.heroHole = [];
    this.heroHoleHand = 0;
    this.heroHandShown = '';
    this.holeVisualKey = '';
    this.folded = new Set();
    this.lastBetSignature = '';
    this.turnKey = '';
    this.pendingAction = false;
    this.settlementKey = '';
    this.settlementPendingHand = 0;
    this.settlementAudioReadyHand = 0;
    this.settlementCardsHand = 0;
    this.settlementAnnounced = 0;
    this.lastActionKeys = new Map();
    this.nextTimer = null;
    this.spectator = false;
  }

  show() {
    if (this.active) {
      if (this.state) this.applyState(this.state);
      return;
    }
    this.active = true;
    this.spectator = false;
    this.scene.setSpectatorMode?.(false);
    this.hud.setSpectatorMode?.(false);
    this.room = this.online.room;
    this.hud.hideRoom();
    this.hud.guestTable?.hide();
    this.hud.enterGame();
    this.hud.setVoiceAvailable(true);
    this.hud.hideSettlement();
    this.hud.hideActionBar();
    this.hud.setPot(0);
    this.hud.setBoardCards([]);
    this.hud.setHeroHand(null);
    this.hud.clearFeed?.();
    // 在线牌局与单机同一套音频：背景音乐、牌桌音效、女声术语播报
    audio.init();
    const config = this.hud.config || {};
    audio.setMusic(config.music !== false);
    audio.setSfx(config.sfx !== false);
    audio.setVoice(config.voice !== false);
    // 先按真实座位建立牌桌，再进场，避免所有玩家都从北面同一个机位出现
    if (this.state) {
      this.applyState(this.state);
      if (this.spectator) this.scene.setSpectatorMode?.(true);
      else this.scene.enterTable(1200);
    } else {
      this.pendingEnter = true;
    }
  }

  hide() {
    this.active = false;
    this.stopNextTimer();
    this.hud.setVoiceAvailable(false);
    this.hud.hideActionBar();
    this.hud.cancelAction?.();
    this.hud.hideSettlement();
    this.hud.hideOnlineGameOver?.();
    this.hud.guestTable?.hide();
    this.spectator = false;
    this.scene.setSpectatorMode?.(false);
    this.hud.setSpectatorMode?.(false);
    this.scene.clearPlayers?.();
    this.scene.toLobby?.(900);
    this.hud.backToLobby?.();
    this.state = null;
    this.room = null;
    this.heroSeat = -1;
    this.heroDisplay = -1;
    this.pendingEnter = false;
    this.currentHand = -1;
    this.reactionHand = 0;
    this.boardCount = 0;
    this.heroHole = [];
    this.holeVisualKey = '';
    this.settlementKey = '';
    this.settlementCardsHand = 0;
    this.folded.clear();
  }

  setHole(data) {
    if (!data) return;
    // 等待下一手的玩家可能暂时收到 spectatorState（内有 spectator=true），
    // 但下一手开始时的私牌 direct 会先于正式 state 到达；不能因为
    // spectator 标记把这份私牌丢掉，否则加入后的第一手底牌为空。
    this.heroHole = Array.isArray(data.hole) ? data.hole.slice(0, 2) : [];
    this.heroHoleHand = Number(data.hand) || this.currentHand || 0;
    if (!this.active) return;
    if (this.heroHoleHand && this.currentHand >= 0 && this.heroHoleHand < this.currentHand) return;
    if (this.spectator) return;
    this.hud.setHeroHand(this.heroHole);
    this.hud.setHeroCards(Array.isArray(this.heroHole) ? this.heroHole : []);
    // If the first state was painted before the private hole arrived, replace
    // the two hero backs with the real faces now.
    if (this.heroHole.length === 2) {
      const key = this.holeVisualKey;
      if (!key.includes('hero-real')) this.dealHoleCards();
    }
  }

  serverSeatForDisplay(index) {
    return this.serverByDisplay[index];
  }

  displaySeatForServer(seat) {
    return this.displayByServer.has(seat) ? this.displayByServer.get(seat) : -1;
  }

  buildOrder(state) {
    const seats = Array.isArray(state.seats) ? state.seats : [];
    const me = seats.find((seat) => seat.pid === this.room?.pid);
    this.heroSeat = me ? me.seat : -1;
    // 固定8个座位：seatNo 是房间入场时分配的稳定位置。
    // 新人只占用空闲座位，绝不重排已在座玩家。
    this.serverByDisplay = [];
    this.displayByServer = new Map();
    for (const seat of seats) {
      const display = Number.isInteger(seat.seatNo) ? seat.seatNo : seat.seat;
      if (display < 0 || display >= 8) continue;
      this.serverByDisplay[display] = seat.seat;
      this.displayByServer.set(seat.seat, display);
    }
    this.heroDisplay = this.displaySeatForServer(this.heroSeat);
  }

  setupHand(state) {
    this.buildOrder(state);
    const seats = Array.isArray(state.seats) ? state.seats : [];
    const defs = Array.from({ length: 8 }, (_, display) => {
      const serverSeat = this.serverByDisplay[display];
      const seat = seats.find((item) => item.seat === serverSeat);
      if (!seat) return null;
      const profile = PROFILES[display % PROFILES.length] || PROFILES[0];
      const isHero = display === this.heroDisplay;
      return {
        name: isHero ? '你' : seat.name,
        displayName: isHero ? '你' : seat.name,
        stack: Number(seat.stack) || 0,
        avatar: profile.avatar,
        human: true,
        pid: seat.pid,
      };
    });
    this.scene.heroSeatIndex = this.heroDisplay;
    this.scene.setupPlayers(defs, 8);
    this.scene.setDealer(this.displaySeatForServer(state.dealer), false);
    this.scene.clearCards();
    this.scene.clearBets();
    this.scene.setPot(0, false);
    this.scene.setTurn(-1);
    this.boardCount = 0;
    this.folded.clear();
    this.lastActionKeys.clear();
    this.settlementAnnounced = 0;
    this.lastBetSignature = '';
    this.holeVisualKey = '';
    if (this.heroHoleHand !== Number(state.hand)) this.heroHole = [];
    this.hud.resetCards?.();
    this.hud.setHandInfo(Number(state.hand) || 1, this.room?.sb || 1, this.room?.bb || 2);
    this.hud.setBoardCards([]);
    this.hud.setHeroHand(this.heroHole.length === 2 ? this.heroHole : null);
    this.hud.setHeroCards(this.heroHole.length === 2 ? this.heroHole : []);
    this.hud.hideSettlement();
    this.settlementKey = '';
    this.settlementCardsHand = 0;
    this.dealHoleCards();
  }

  dealHoleCards() {
    if (!this.active || !this.scene || !this.scene.playerCount) return;
    const seats = this.serverByDisplay.map((serverSeat) => {
      const seat = this.state?.seats?.find((item) => item.seat === serverSeat);
      return seat;
    });
    const sequence = [];
    let placeholderIndex = 0;
    // 只给真实在座的 display 发牌；不能遍历8个稀疏槽位，
    // 否则空座位也会生成牌，表现为“3个人4副牌/弃牌后还留牌”。
    for (let display = 0; display < this.serverByDisplay.length; display += 1) {
      if (this.serverByDisplay[display] === undefined) continue;
      const seat = seats[display];
      if (!seat || seat.folded) continue;
      for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
        const actual = display === this.heroDisplay && this.heroHole[cardIndex] ? this.heroHole[cardIndex] : null;
        sequence.push({
          seat: display,
          cardIndex,
          card: actual || placeholderCard(placeholderIndex++),
        });
      }
    }
    this.holeVisualKey = this.heroHole.length === 2 ? 'hero-real' : 'hero-back';
    this.scene.dealHoleCards(sequence).catch(() => {});
  }

  updateBoard(state) {
    const board = Array.isArray(state.board) ? state.board : [];
    if (!board.length) {
      if (this.boardCount) this.scene.clearBoardCards();
      this.boardCount = 0;
      return;
    }
    if (board.length < this.boardCount) {
      this.scene.clearBoardCards();
      this.boardCount = 0;
    }
    if (board.length <= this.boardCount) return;
    const fresh = board.slice(this.boardCount);
    this.scene.dealBoard(fresh, this.boardCount);
    this.boardCount = board.length;
  }

  rebuildShowdown(state) {
    if (state.phase !== 'settle' || !state.settlement) return;
    // All-fold settlement is not a showdown: keep every hole card hidden.
    if (!state.showdown) return;
    if (this.settlementCardsHand === state.hand) return;
    this.settlementCardsHand = state.hand;
    const board = Array.isArray(state.board) ? state.board : [];
    const sequence = [];
    for (let display = 0; display < this.serverByDisplay.length; display += 1) {
      const serverSeat = this.serverByDisplay[display];
      const seat = state.seats?.find((item) => item.seat === serverSeat);
      if (display === this.heroDisplay) continue;
      if (!seat || seat.folded || !Array.isArray(seat.hole) || seat.hole.length < 2) continue;
      for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
        sequence.push({ seat: display, cardIndex, card: seat.hole[cardIndex] });
      }
    }
    this.scene.clearCards();
    const showdownHand = state.hand;
    this.scene.dealHoleCards(sequence).then(() => {
      if (!this.active || this.currentHand !== showdownHand) return;
      for (const entry of sequence) {
        if (entry.cardIndex === 0) this.scene.revealSeat(entry.seat);
      }
      if (this.heroHole.length === 2 && !this.folded.has(this.heroDisplay)) {
        this.scene.revealHero();
      }
    });
    if (board.length) this.scene.dealBoard(board, 0);
    this.boardCount = board.length;
  }

  announceAction(seat) {
    const text = String(seat.action || '');
    if (!text) return;
    const name = seat.name || '玩家';
    const amount = Number(seat.bet) || 0;
    // 左侧动态条：姓名 / 动作 / 金额分列，长名字由 HUD 截断。
    const match = text.match(/^(.*?)\s*([\d,]+)\s*$/);
    const actionText = (match ? match[1] : text).trim() || text;
    const actionAmount = match ? Number(match[2].replace(/,/g, '')) : amount;
    const tone = seat.folded ? 'fold' : (text.includes('全下') ? 'allin' : '');
    this.hud.feedAction?.(name, actionText, actionAmount, tone);
    if (text.includes('弃牌')) {
      audio.speak('fold', 0, name);
    } else if (text.includes('过牌')) {
      audio.check();
      audio.speak('check', 0, name);
    } else if (text.includes('全下')) {
      audio.allIn();
      audio.speak('allin', amount, name);
    } else if (text.includes('加注') || text.includes('下注')) {
      audio.speak('raise', amount, name);
    } else if (text.includes('跟注')) {
      audio.speak('call', amount, name);
    }
  }

  renderPlayers(state) {
    const seats = Array.isArray(state.seats) ? state.seats : [];
    // Prefetch server-generated name audio for the selected profile so the
    // first action does not wait for the TTS request.
    for (const seat of seats) if (seat.name) audio.preloadName?.(seat.name);
    const serverSeats = new Set(this.serverByDisplay);
    for (let display = 0; display < this.serverByDisplay.length; display += 1) {
      const serverSeat = this.serverByDisplay[display];
      if (serverSeat === undefined || !serverSeats.has(serverSeat)) continue;
      const seat = seats.find((item) => item.seat === serverSeat);
      if (!seat) continue;
      this.scene.updateStack(display, Number(seat.stack) || 0);
      if (seat.folded && !this.folded.has(display)) {
        this.folded.add(display);
        this.scene.discardHoleCards?.(display);
        this.scene.foldSeat(display);
      }
      const isActor = Boolean(state.turn && state.turn.seat === seat.seat);
      const bet = Number(seat.bet) || 0;
      const visualAction = seat.folded
        ? '弃牌'
        : (seat.action || (isActor ? '思考中' : (bet ? `下注 ${bet}` : '')));
      const tone = seat.won > 0 ? 'win' : seat.folded ? 'fold' : isActor ? 'turn' : 'neutral';
      if (visualAction) this.scene.setPlayerAction(display, visualAction, tone);
      if (seat.action) {
        const key = `${state.hand}:${state.street}:${display}:${seat.action}`;
        if (state.phase === 'play' && this.lastActionKeys.get(display) !== key) {
          this.lastActionKeys.set(display, key);
          this.announceAction(seat);
        }
      }
    }

    const betSignature = seats.map((seat) => `${seat.seat}:${seat.bet}`).join('|');
    if (betSignature !== this.lastBetSignature) {
      this.lastBetSignature = betSignature;
      this.scene.clearBets();
      for (const seat of seats) {
        if (!seat.bet) continue;
        const display = this.displaySeatForServer(seat.seat);
        if (display >= 0) this.scene.bet(display, Number(seat.bet) || 0, Number(seat.bet) || 0);
      }
    }
    this.scene.setPot(Number(state.pot) || 0, true);
    const turnDisplay = state.turn ? this.displaySeatForServer(state.turn.seat) : -1;
    this.scene.setTurn(turnDisplay);
  }

  renderHero(state) {
    const me = state.seats?.find((seat) => seat.pid === this.room?.pid);
    if (!me) return;
    this.hud.setHeroStack(Number(me.stack) || 0);
    if (!this.heroHole.length && Array.isArray(me.hole) && me.hole.length === 2) {
      this.heroHole = me.hole.slice(0, 2);
      this.hud.setHeroHand(this.heroHole);
      this.hud.setHeroCards(this.heroHole);
    }
    this.hud.setBoardCards(Array.isArray(state.board) ? state.board : []);
  }

  legalForHud(legal) {
    if (!legal) return null;
    return {
      canCheck: Boolean(legal.canCheck),
      canRaise: Boolean(legal.canRaise),
      toCall: Number(legal.toCall) || 0,
      stack: Number(legal.stack) || 0,
      currentBet: Number(legal.currentBet) || 0,
      minRaiseTo: Number(legal.minRaiseTo) || 0,
      maxRaiseTo: Number(legal.maxRaiseTo) || 0,
      pot: Number(legal.pot) || 0,
    };
  }

  syncActions(state) {
    const turn = state.turn;
    if (state.spectator) {
      this.hud.hideActionBar?.();
      this.hud.turnTag?.(false);
      this.hud.setHeroHand?.(null);
      this.hud.setHeroCards?.([]);
      this.turnKey = '';
      return;
    }
    if (!turn || state.phase !== 'play') {
      if (this.pendingAction) {
        this.pendingAction = false;
        this.hud.cancelAction?.();
      }
      this.hud.hideActionBar();
      this.hud.turnTag(false);
      this.turnKey = '';
      return;
    }
    const isHero = turn.seat === this.heroSeat;
    this.hud.turnTag(isHero);
    if (!isHero) {
      if (this.pendingAction) {
        this.pendingAction = false;
        this.hud.cancelAction?.();
      }
      this.hud.hideActionBar();
      const actor = state.seats?.find((seat) => seat.seat === turn.seat);
      const actorInfo = actor
        ? `${actor.name} · 剩余 ${Number(actor.stack) || 0}${Number(actor.bet) > 0 ? ` · 下注 ${Number(actor.bet)}` : ''}`
        : '对手';
      this.hud.thinking(true, actorInfo);
      this.turnKey = '';
      return;
    }
    this.hud.thinking(false);
    const key = `${state.hand}-${state.street}-${turn.seat}-${state.turnDeadline || 0}`;
    if (key === this.turnKey || this.pendingAction) return;
    this.turnKey = key;
    const legal = this.legalForHud(turn.legal);
    if (!legal) return;
    this.pendingAction = true;
    this.hud.beginAction(legal);
    this.hud.waitForAction().then(async (action) => {
      this.pendingAction = false;
      if (!action || !this.active) return;
      try {
        await this.online.action(action);
      } catch (error) {
        this.hud.toast(`行动失败：${error.message}`);
      }
    }).catch(() => {
      this.pendingAction = false;
    });
  }

  renderSettlement(state) {
    if (state.phase === 'settle' && this.settlementPendingHand === Number(state.hand)
      && this.settlementAudioReadyHand !== Number(state.hand)) return;
    if (state.phase !== 'settle' || !state.settlement) {
      this.hud.hideSettlement();
      this.settlementKey = '';
      this.stopNextTimer();
      return;
    }
    const settlement = state.settlement;
    const key = `${state.hand}-${settlement.pot}-${settlement.contenders?.length || 0}`;
    if (key !== this.settlementKey) {
      this.settlementKey = key;
      this.hud.showOnlineSettlement({
        ...settlement,
        board: state.board,
        players: (state.seats || []).map((seat) => ({
          name: seat.name,
          stack: Number(seat.stack) || 0,
          folded: Boolean(seat.folded),
        })),
      });
      this.updateOnlineSettlement(state);
    } else {
      this.updateOnlineSettlement(state);
    }
    this.hud.hideActionBar();
  }

  updateOnlineSettlement(state) {
    if (!this.active) return;
    const ready = Array.isArray(state.nextReadySeats) ? state.nextReadySeats : [];
    const me = state.seats?.find((seat) => seat.pid === this.room?.pid);
    const readyMe = me ? ready.includes(me.seat) : false;
    const canContinue = Boolean(me && !state.spectator && Number(me.stack) > 0);
    const readyCount = Number.isFinite(Number(state.nextReadyCount))
      ? Number(state.nextReadyCount)
      : ready.length;
    this.hud.maybeShowOnlineGameOver?.(state, me);
    this.hud.maybeReturnAbandonedRoom?.(state);
    this.hud.setOnlineNextState({
      ready: readyCount,
      total: Number(state.nextReadyTotal) || 0,
      readyMe,
      canClick: canContinue && !readyMe,
      onNext: async () => {
        try {
          await this.online.continueNext();
        } catch (error) {
          this.hud.toast(`继续失败：${error.message}`);
          this.updateOnlineSettlement(this.state);
        }
      },
    });
    this.startNextTimer(state);
  }

  startNextTimer(state) {
    this.stopNextTimer();
    const deadline = Number(state.nextHandAt) || 0;
    if (!deadline) return;
    const tick = () => {
      if (!this.active) return;
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.hud.setOnlineNextTimer(left);
    };
    tick();
    this.nextTimer = setInterval(tick, 250);
  }

  stopNextTimer() {
    if (!this.nextTimer) return;
    clearInterval(this.nextTimer);
    this.nextTimer = null;
  }

  announceSettlement(state) {
    const hand = Number(state.hand) || 1;
    if (this.settlementAnnounced === hand) return;
    this.settlementAnnounced = hand;
    const winners = Array.isArray(state.winners) ? state.winners : [];
    if (!winners.length) return;
    const me = state.seats?.find((seat) => seat.pid === this.room?.pid);
    const heroWon = Boolean(me && winners.some((winner) => winner.seat === me.seat));
    if (heroWon) audio.win();
    else audio.lose();
    const winner = winners[0];
    const winnerName = winner?.name || '赢家';
    const total = winners.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const contender = state.settlement?.contenders?.find((row) => row.name === winnerName && row.winner);
    const handName = contender?.handName || contender?.handDetail || '';
    const text = state.showdown && handName
      ? `恭喜${winnerName}以${handName}赢得底池`
      : `恭喜${winnerName}赢得底池`;
    // 结算页等语音就绪后再升起；语音开始的同时页面出现，避免页面先出现、
    // 过两三秒才开始播报。
    this.settlementPendingHand = hand;
    this.settlementAudioReadyHand = 0;
    if (this.reactionHand !== hand) {
      this.reactionHand = hand;
      const winnerDisplays = new Set(winners.map((item) => this.displaySeatForServer(item.seat)).filter((seat) => seat >= 0));
      this.scene.reactSettlement?.(winnerDisplays);
    }
    const reveal = () => {
      if (!this.active || this.settlementPendingHand !== hand) return;
      this.settlementAudioReadyHand = hand;
      this.settlementPendingHand = 0;
      this.renderSettlement(this.state || state);
    };
    if (!audio.settings?.voice) {
      reveal();
      return;
    }
    if (this.active) audio.speakSettlementNow?.(text, reveal);
    setTimeout(reveal, 3500);
  }

  applyState(state) {
    if (!state) return;
    const previousState = this.state;
    this.state = state;
    if (previousState?.phase === 'settle' && state.phase === 'play') audio.cancelSettlement?.();
    this.room = this.online.room || this.room;
    if (!this.active) return;
    if (state.scene && state.scene !== this.sceneId) {
      this.sceneId = state.scene;
      this.scene.applyScene?.(state.scene);
      this.hud.setScene?.(state.scene);
      audio.setScene?.(state.scene);
    }
    const isSpectator = Boolean(state.spectator);
    if (isSpectator !== this.spectator) {
      this.spectator = isSpectator;
      this.scene.setSpectatorMode?.(isSpectator);
      this.hud.setSpectatorMode?.(isSpectator);
    }
    const hand = Number(state.hand) || 1;
    // 房主重新分配筹码会创建“手数从 1 开始”的新牌局；
    // 用 settle -> play 的跳变重置场景，不能只看 hand 编号。
    const restarted = hand === this.currentHand
      && previousState?.phase === 'settle'
      && state.phase === 'play';
    if (hand !== this.currentHand || restarted) {
      this.currentHand = hand;
      this.currentStreet = state.street || '';
      this.setupHand(state);
      this.currentStreet = state.street || '';
    }
    if (state.phase !== 'settle') this.stopNextTimer();
    if (state.phase === 'settle') {
      this.rebuildShowdown(state);
      // 本手结束，弃牌玩家重新亮起
      this.scene.clearFoldsDim?.();
      this.announceSettlement(state);
    }
    this.renderHero(state);
    this.updateBoard(state);
    this.renderPlayers(state);
    this.hud.setPot(Number(state.pot) || 0, true);
    this.syncActions(state);
    this.hud.setBoardCards(Array.isArray(state.board) ? state.board : []);
    this.renderSettlement(state);
    if (state.phase === 'play') {
      this.settlementPendingHand = 0;
      this.settlementAudioReadyHand = 0;
      this.reactionHand = 0;
      this.hud.hideSettlement();
      this.hud.hideOnlineGameOver?.();
    }
    if (this.pendingEnter) {
      this.pendingEnter = false;
      if (this.spectator) this.scene.setSpectatorMode?.(true);
      else this.scene.enterTable(1200);
    }
  }
}
