import {
  makeDeck, shuffle, evaluate, compareScores, buildSidePots, describeHole, rankLabel, handDetail,
} from './poker.js';
import { decideBotAction, botThinkTime } from './bots.js';
import { audio } from './audio.js';
import { delay, fmt } from './util.js';

const SUIT_MARKS = { s: '♠', h: '♥', d: '♦', c: '♣' };

export const PROFILES = [
  {
    name: '你',
    avatar: {
      skin: 0xe3b18e, jacket: 0x1c2228, shirt: 0xf1e8d6, hair: 0x1c1917,
      hairStyle: 'short', pocketSquare: true,
    },
    ai: { aggression: 1, tight: 1, bluff: 0.1, speed: 1 },
  },
  {
    name: '沈爷',
    avatar: {
      skin: 0xe9ddc8, jacket: 0x2b2320, shirt: 0xf0e6d2, hair: 0x171717,
      hairStyle: 'short', mustache: false, pocketSquare: true,
      species: 'panda', gender: 'male',
      model: 0,    },
    ai: { aggression: 0.9, tight: 1.08, bluff: 0.05, speed: 1.1 },
  },
  {
    name: '苏小姐',
    avatar: {
      skin: 0xf0c8a6, jacket: 0x3b1f28, shirt: 0x1b1b1e, hair: 0x2b1d18,
      hairStyle: 'long', earring: true, gender: 'female',
      species: 'cat',
      model: 1,    },
    ai: { aggression: 1.08, tight: 0.94, bluff: 0.12, speed: 0.95 },
  },
  {
    name: '阿凯',
    avatar: {
      skin: 0x9aa0a6, jacket: 0x1f3340, shirt: 0xe8dfc8, hair: 0x4d555c,
      hairStyle: 'short', shades: true, bowtie: true,
      species: 'wolf', gender: 'male',
      model: 2,    },
    ai: { aggression: 1.18, tight: 0.88, bluff: 0.16, speed: 0.85 },
  },
  {
    name: '牛头',
    avatar: {
      skin: 0x9a6747, jacket: 0x3a2e22, shirt: 0xd9cbb2, hair: 0x111111,
      hairStyle: 'bald', mustache: true, sleeves: 'rolled',
      species: 'bull', gender: 'male',
      model: 3,    },
    ai: { aggression: 0.82, tight: 1.16, bluff: 0.035, speed: 1.2 },
  },
  {
    name: '狐仙',
    avatar: {
      skin: 0xd98a4f, jacket: 0x2c2a3a, shirt: 0xf2ead9, hair: 0x5a2f22,
      hairStyle: 'bun', pocketSquare: true, earring: true,
      species: 'fox', gender: 'female',
      model: 4,    },
    ai: { aggression: 1.04, tight: 0.96, bluff: 0.1, speed: 0.92 },
  },
  {
    name: '马面',
    avatar: {
      skin: 0x8a5f42, jacket: 0x232323, shirt: 0x202020, hair: 0x2b1d18,
      hairStyle: 'short', shades: true,
      species: 'horse', gender: 'male',
      model: 5,    },
    ai: { aggression: 1.22, tight: 0.82, bluff: 0.18, speed: 0.8 },
  },
  {
    name: '小马',
    avatar: {
      skin: 0x8a5f42, jacket: 0x2f3a2a, shirt: 0xefe6d2, hair: 0x2b1d18,
      hairStyle: 'short', sleeves: 'rolled',
      species: 'horse', gender: 'male',
      model: 6,    },
    ai: { aggression: 0.96, tight: 1, bluff: 0.08, speed: 1.05 },
  },
];

function cardText(card) {
  return `${rankLabel(card.rank)}${SUIT_MARKS[card.suit]}`;
}

export class Game {
  constructor({ scene, hud }) {
    this.scene = scene;
    this.hud = hud;
    this.players = [];
    this.config = null;
    this.session = 0;
    this.running = false;
    this.dealerIndex = 0;
    this.handNumber = 0;
    this.biggestPot = 0;
    this.rebuyResolver = null;
    this.online = null;
  }

  isActive(session) {
    return this.running && session === this.session;
  }

  async start(config) {
    const session = ++this.session;
    this.running = false;
    this.config = config;
    this.story = config.story || null;
    this.storyWon = false;
    this.handNumber = 0;
    this.biggestPot = 0;

    if (this.rebuyResolver) {
      const resolve = this.rebuyResolver;
      this.rebuyResolver = null;
      resolve();
    }

    const humans = config.online?.humans || [];
    const rosters = [{ ...PROFILES[0], human: true, pid: 0 }];
    humans.forEach((human, index) => {
      const base = PROFILES[(index + 1) % PROFILES.length];
      rosters.push({ ...base, name: human.name, human: true, pid: human.pid });
    });
    for (let i = rosters.length; i < config.seats; i += 1) {
      rosters.push({ ...PROFILES[i % PROFILES.length], human: false, pid: 0 });
    }
    this.players = rosters.slice(0, config.seats).map((profile) => ({
      ...profile,
      stack: config.stack,
    }));
    if (config.online) this.players[0].name = config.online.hostName || '房主';
    if (this.story) {
      this.players = this.players.slice(0, 2);
      const rival = this.players[1];
      rival.name = this.story.opponent;
      rival.displayName = this.story.opponent;
      rival.avatar = {
        ...rival.avatar,
        species: this.story.theme === 'menu' ? 'bull' : 'fox',
      };
    }
    this.online = config.online?.service || null;
    this.dealerIndex = this.players.length - 1;

    this.scene.clearCards();
    this.scene.setHeroSeat(0, this.players.length);
    this.scene.setupPlayers(this.players);
    for (const player of this.players) audio.preloadName?.(player.name);
    if (this.config?.playerName) audio.preloadName?.(this.config.playerName);
    const sceneId = this.config?.scene || 'private';
    this.scene.applyScene?.(sceneId);
    this.hud.setScene?.(sceneId);
    audio.setScene?.(sceneId);
    this.scene.setDealer(this.dealerIndex, false);

    this.hud.enterGame();
    this.hud.hideBanner();
    this.hud.hideGameOver();
    this.hud.clearFeed();
    this.hud.setPot(0);
    this.hud.setHeroStack(config.stack);
    this.hud.setHeroHand(null);
    this.hud.resetCards();
    this.hud.setHandInfo(1, config.sb, config.bb);
    this.hud.thinking(false);
    this.hud.turnTag(false);
    this.hud.hideActionBar();

    if (this.story) this.hud.setStoryChallenge(this.story);
    else this.hud.clearStoryChallenge();

    this.running = true;

    await this.scene.enterTable(1350);
    if (!this.isActive(session)) return;
    await delay(220);
    if (!this.isActive(session)) return;
    this.runLoop(session);
  }

  async runLoop(session) {
    while (this.isActive(session)) {
      let completed = false;
      try {
        completed = await this.playHand(session);
      } catch (error) {
        console.error('[game] hand failed', error?.stack || error);
        completed = true;
      }
      if (!this.isActive(session)) return;
      if (!completed) return;
      await delay(1300);
    }
  }

  async playHand(session) {
    if (!this.isActive(session)) return false;
    audio.cancelSettlement?.();
    this.hud.hideSettlement();

    const { sb, bb } = this.config;
    this.handNumber += 1;
    this.hud.setHandInfo(this.handNumber, sb, bb);

    // 在线牌局：每手推进一次，回写结算筹码（已取消次数限制）
    if (this.online) {
      let round = null;
      try {
        round = await this.online.beginRound();
      } catch (error) {
        console.warn('[game] beginRound failed', error.message);
      }
      if (!this.isActive(session)) return false;
      if (round && round.hostOut) {
        this.hud.toast('筹码已用尽，已退出房间');
        await this.returnToLobby();
        return false;
      }
      if (round && Array.isArray(round.out) && round.out.length) {
        const outSet = new Set(round.out);
        this.players = this.players.filter((player) => !outSet.has(player.pid));
        const otherHumans = this.players.filter((player) => player.human && player.pid);
        if (!otherHumans.length) {
          this.hud.toast('其他玩家筹码用尽，牌局结束');
          await this.returnToLobby();
          return false;
        }
        this.dealerIndex = Math.min(this.dealerIndex, this.players.length - 1);
        this.scene.setHeroSeat(0, this.players.length);
        this.scene.setupPlayers(this.players);
        this.scene.setDealer(this.dealerIndex, false);
        this.hud.feed('有玩家筹码用尽，已离开牌桌', '');
      }
    }

    const n = this.players.length;

    // 机器人补充买入
    for (let i = 1; i < n; i += 1) {
      if (this.players[i].stack < bb) {
        this.players[i].stack = this.config.stack;
        this.scene.updateStack(i, this.players[i].stack);
        this.hud.feed(`${this.players[i].name} 补充买入`, '');
      }
    }
    if (this.players[0].stack <= 0) {
      this.players[0].stack = this.config.stack;
      this.scene.updateStack(0, this.players[0].stack);
    }

    const dealer = (this.dealerIndex + 1) % n;
    this.dealerIndex = dealer;

    const hp = this.players.map((player, seat) => ({
      id: seat,
      seat,
      name: player.name,
      displayName: player.name,
      avatar: player.avatar,
      ai: player.ai,
      human: Boolean(player.human),
      pid: player.pid || 0,
      stack: player.stack,
      hole: [],
      folded: false,
      allIn: false,
      bet: 0,
      committed: 0,
      acted: false,
      position: ((seat - (dealer + 1) + n) % n) / Math.max(1, n - 1),
      lastAction: '',
    }));

    this.scene.clearCards();
    this.scene.resetHandVisuals(hp.map((p) => p.stack));
    this.hud.setHeroStack(hp[0].stack);
    this.hud.setHeroHand(null);
    this.hud.resetCards();
    this.hud.setPot(0);
    this.hud.hideBanner();
    this.hud.turnTag(false);
    this.hud.hideActionBar();
    this.hud.thinking(false);
    this.scene.setTurn(-1);

    let currentBet = bb;
    let lastRaiseSize = bb;
    const potTotal = () => hp.reduce((sum, player) => sum + player.committed, 0);
    const refreshPot = () => this.hud.setPot(potTotal());
    const state = { street: 'preflop', board: [] };

    const publish = (extra = {}) => {
      if (!this.online) return;
      this.online.publish({
        hand: this.handNumber,
        dealer,
        street: state.street,
        board: state.board,
        pot: potTotal(),
        seats: hp.map((player) => ({
          seat: player.seat,
          name: player.displayName,
          stack: player.stack,
          folded: player.folded,
          allIn: player.allIn,
          bet: player.bet,
          action: player.lastAction || '',
          human: Boolean(player.human),
          hole: extra.reveal && !player.folded && player.hole.length ? player.hole : undefined,
          revealed: Boolean(extra.reveal),
        })),
        turn: extra.turn || null,
        phase: extra.phase || 'play',
        winners: extra.winners || [],
      });
    };

    await this.scene.setDealer(dealer, true);
    if (!this.isActive(session)) return false;

    const deck = shuffle(makeDeck());
    const sequence = [];
    for (let round = 0; round < 2; round += 1) {
      for (let step = 1; step <= n; step += 1) {
        const seat = (dealer + step) % n;
        const card = deck.pop();
        hp[seat].hole[round] = card;
        sequence.push({ seat, cardIndex: round, card });
      }
    }

    await this.scene.dealHoleCards(sequence);
    if (!this.isActive(session)) return false;
    this.hud.setHeroStack(hp[0].stack);
    this.hud.setHeroHand(hp[0].hole, describeHole(hp[0].hole));
    this.hud.setHeroCards(hp[0].hole, describeHole(hp[0].hole));

    if (this.online) {
      for (const player of hp) {
        if (player.seat !== 0 && player.human && player.pid) {
          this.online.direct(player.pid, 'direct', {
            seat: player.seat,
            hole: player.hole,
            hand: this.handNumber,
          });
        }
      }
      publish({ phase: 'deal' });
    }

    const sbSeat = n === 2 ? dealer : (dealer + 1) % n;
    const bbSeat = n === 2 ? (dealer + 1) % n : (dealer + 2) % n;

    const commit = (player, amount) => {
      const paid = Math.min(Math.max(0, amount), player.stack);
      player.stack -= paid;
      player.bet += paid;
      player.committed += paid;
      if (player.stack <= 0) player.allIn = true;
      return paid;
    };

    const updatePlayerUI = (player) => {
      this.scene.updateStack(player.seat, player.stack);
      if (player.seat === 0) this.hud.setHeroStack(player.stack);
      refreshPot();
    };

    const postBlind = async (seat, amount, label) => {
      const player = hp[seat];
      const paid = commit(player, amount);
      if (paid <= 0) return;
      this.scene.setPlayerAction(seat, `${label} ${fmt(paid)}`, 'call');
      await this.scene.bet(seat, paid, player.bet);
      updatePlayerUI(player);
      this.hud.feedAction(seat === 0 ? '你' : player.displayName, label, paid, seat === 0 ? 'hero' : '');
    };

    await Promise.all([
      postBlind(sbSeat, sb, '小盲'),
      postBlind(bbSeat, bb, '大盲'),
    ]);
    if (!this.isActive(session)) return false;
    currentBet = Math.max(bb, hp[sbSeat].bet, hp[bbSeat].bet);
    lastRaiseSize = bb;
    publish({ phase: 'play' });

    const getLegal = (player) => {
      const owed = Math.max(0, currentBet - player.bet);
      const toCall = Math.min(owed, player.stack);
      const canCheck = owed === 0;
      const maxRaiseTo = player.bet + player.stack;
      const minRaiseTo = currentBet === 0
        ? Math.min(maxRaiseTo, bb)
        : Math.min(maxRaiseTo, currentBet + lastRaiseSize);
      const canRaise = player.stack > owed && maxRaiseTo > currentBet;
      return {
        owed,
        toCall,
        canCheck,
        canRaise,
        minRaiseTo,
        maxRaiseTo,
        currentBet,
        stack: player.stack,
      };
    };

    const applyAction = async (player, action, legal) => {
      if (!this.isActive(session)) return;
      const speaker = player.seat === 0 ? '你' : player.displayName;
      const voiceSpeaker = player.seat === 0
        ? (String(this.config?.playerName || '').trim() || player.displayName || '你')
        : player.displayName;
      let type = action?.type || 'fold';

      if (type === 'check' && !legal.canCheck) type = 'fold';
      if ((type === 'raise' || type === 'allin') && !legal.canRaise) {
        type = legal.toCall > 0 ? 'call' : 'check';
      }
      if (type === 'call' && legal.toCall <= 0) type = 'check';

      if (type === 'fold') {
        player.folded = true;
        player.acted = true;
        player.lastAction = '弃牌';
        if (player.seat === 0) {
          this.hud.setHeroHand(null);
          this.hud.setHeroCards(null);
        }
        this.hud.feedAction(speaker, '弃牌', 0, player.seat === 0 ? 'hero' : '');
        audio.speak('fold', 0, voiceSpeaker);
        await this.scene.foldSeat(player.seat);
        return;
      }

      if (type === 'check') {
        player.acted = true;
        player.lastAction = '过牌';
        this.scene.setPlayerAction(player.seat, '过牌', 'call');
        this.hud.feedAction(speaker, '过牌', 0, player.seat === 0 ? 'hero' : '');
        audio.check();
        audio.speak('check', 0, voiceSpeaker);
        return;
      }

      const doCall = async () => {
        const owed = currentBet - player.bet;
        const paid = commit(player, owed);
        player.acted = true;
        if (paid > 0) {
          player.lastAction = player.allIn ? `全下 ${fmt(player.bet)}` : `跟注 ${fmt(paid)}`;
          this.scene.setPlayerAction(
            player.seat,
            player.allIn ? `全下 ${fmt(player.bet)}` : `跟注 ${fmt(paid)}`,
            player.allIn ? 'allin' : 'call',
          );
          await this.scene.bet(player.seat, paid, player.bet);
          updatePlayerUI(player);
          this.hud.feedAction(
            player.seat === 0 ? '你' : player.displayName,
            player.allIn ? '全下' : '跟注',
            paid,
            player.seat === 0 ? 'hero' : '',
          );
          audio.speak(player.allIn ? 'allin' : 'call', paid, voiceSpeaker);
        } else {
          player.lastAction = '过牌';
          this.scene.setPlayerAction(player.seat, '过牌', 'call');
          this.hud.feedAction(player.seat === 0 ? '你' : player.displayName, '过牌', 0, player.seat === 0 ? 'hero' : '');
          audio.speak('check', 0, voiceSpeaker);
        }
      };

      if (type === 'call') {
        await doCall();
        return;
      }

      const maxTarget = player.bet + player.stack;
      let target = maxTarget;
      if (type === 'raise') {
        const minTarget = currentBet === 0 ? bb : currentBet + lastRaiseSize;
        const requested = Math.round(Number(action.amount) || 0);
        target = Math.min(maxTarget, Math.max(minTarget, requested));
      }

      if (target <= currentBet) {
        await doCall();
        return;
      }

      const wasBetOpen = currentBet === 0;
      const previousBet = currentBet;
      const paid = commit(player, target - player.bet);
      const isRaise = player.bet > currentBet;

      if (isRaise) {
        const raiseSize = player.bet - currentBet;
        if (raiseSize >= lastRaiseSize) lastRaiseSize = raiseSize;
        currentBet = player.bet;
        for (const other of hp) {
          if (other !== player && !other.folded && !other.allIn) other.acted = false;
        }
      }
      player.acted = true;

      const text = player.allIn
        ? `全下 ${fmt(player.bet)}`
        : wasBetOpen
          ? `下注 ${fmt(player.bet)}`
          : `加注到 ${fmt(player.bet)}`;
      player.lastAction = text;
      this.scene.setPlayerAction(
        player.seat,
        text,
        player.allIn ? 'allin' : 'raise',
      );
      await this.scene.bet(player.seat, paid, player.bet);
      updatePlayerUI(player);
      this.hud.feedAction(
        player.seat === 0 ? '你' : player.displayName,
        player.allIn ? '全下' : (wasBetOpen ? '下注' : '加注'),
        player.bet,
        player.seat === 0 ? 'hero' : '',
      );
      audio.speak(
        player.allIn ? 'allin' : wasBetOpen ? 'bet' : 'raise',
        player.bet,
        voiceSpeaker,
      );
      if (player.allIn) {
        audio.allIn();
        this.scene.shake(0.006, 340);
      }
      if (previousBet > 0 && player.allIn && player.seat === 0) {
        this.hud.toast('你已全下，等待摊牌');
      }
    };

    const runBettingRound = async (startIndex) => {
      let index = startIndex;
      let guard = 0;
      while (guard < 260) {
        guard += 1;
        if (!this.isActive(session)) return;
        const alive = hp.filter((player) => !player.folded);
        if (alive.length <= 1) return;
        const actionable = hp.filter((player) => !player.folded && !player.allIn && player.stack > 0);
        if (actionable.length === 0) return;

        let actor = null;
        for (let step = 0; step < n; step += 1) {
          const candidate = hp[(index + step) % n];
          if (!candidate.folded && !candidate.allIn && candidate.stack > 0
            && (!candidate.acted || candidate.bet < currentBet)) {
            actor = candidate;
            index = (index + step) % n;
            break;
          }
        }
        if (!actor) return;

        const legal = getLegal(actor);
        if (actionable.length === 1 && actor.bet >= currentBet) return;

        this.scene.setTurn(actor.seat);
        let action;

        if (actor.seat === 0) {
          this.hud.turnTag(true);
          this.hud.beginAction({ ...legal, pot: potTotal() });
          action = await this.hud.waitForAction();
          this.hud.turnTag(false);
          if (!this.isActive(session)) return;
        } else if (actor.human && this.online && this.online.isOnline(actor.pid)) {
          this.hud.thinking(true, actor.displayName);
          this.online.direct(actor.pid, 'direct', {
            seat: actor.seat,
            hole: actor.hole,
            hand: this.handNumber,
          });
          publish({ phase: 'play', turn: { seat: actor.seat, legal } });
          const remote = await this.online.waitAction(actor.pid);
          this.hud.thinking(false);
          if (!this.isActive(session)) return;
          action = remote || (legal.canCheck ? { type: 'check' } : { type: 'fold' });
        } else {
          this.hud.thinking(true, actor.displayName);
          await delay(botThinkTime(actor));
          if (!this.isActive(session)) {
            this.hud.thinking(false);
            return;
          }
          this.hud.thinking(false);
          action = decideBotAction({
            street: state.street,
            board: state.board,
            pot: potTotal(),
            currentBet,
            bigBlind: bb,
            activeCount: alive.length,
          }, actor, { ...legal, currentBet });
        }

        this.scene.setTurn(-1);
        await applyAction(actor, action, legal);
        if (!this.isActive(session)) return;
        publish({ phase: 'play' });
        index = (actor.seat + 1) % n;
      }
    };

    const collectStreet = async () => {
      const withBets = hp.filter((player) => player.bet > 0);
      if (withBets.length) {
        await this.scene.collectBets(withBets.map((player) => player.seat), potTotal());
        withBets.forEach((player) => { player.bet = 0; });
        publish({ phase: 'play' });
      }
      if (!this.isActive(session)) return;
    };

    const firstActiveAfterDealer = () => {
      for (let step = 1; step <= n; step += 1) {
        const player = hp[(dealer + step) % n];
        if (!player.folded && !player.allIn && player.stack > 0) {
          return (dealer + step) % n;
        }
      }
      return (dealer + 1) % n;
    };

    const aliveCount = () => hp.filter((player) => !player.folded).length;

    const settle = async (winnerSeats, amounts, banner, isShowdown) => {
      this.biggestPot = Math.max(this.biggestPot, potTotal());
      for (const [seat, amount] of amounts.entries()) {
        hp[seat].stack += amount;
      }

      const heroWon = amounts.has(0);
      // 本手结束，弃牌玩家重新亮起
      this.scene.clearFoldsDim?.();
      // 结算面板出现前先把桌面筹码模型更新到最新，避免看到旧筹码
      for (let i = 0; i < hp.length; i += 1) {
        this.players[i].stack = hp[i].stack;
        this.scene.updateStack(i, hp[i].stack);
      }
      this.hud.setHeroStack(hp[0].stack);
      const settlement = this.online
        ? null
        : this.buildSettlement(hp, amounts, state.board, isShowdown, potTotal());
      // 结算语音先于结算面板入队，不再等 UI 出现后才开始。
      const spokenWinners = winnerSeatsArr
        .map((seat) => (seat === 0 ? (this.config?.playerName || '你') : hp[seat].displayName))
        .join('、');
      const spokenHand = isShowdown && headlineName ? `以${headlineName}` : '';
      let settlementShown = false;
      const revealSettlement = () => {
        if (settlementShown || this.online || !settlement || !this.running) return;
        settlementShown = true;
        this.hud.showSettlement(settlement);
      };
      audio.speakSettlementNow?.(
        `恭喜${spokenWinners}${spokenHand}赢得底池`,
        revealSettlement,
      );
      if (!audio.settings?.voice) revealSettlement();
      setTimeout(revealSettlement, 3500);

      this.scene.reactSettlement?.(new Set(winnerSeats));
      if (this.online) this.hud.showBanner(banner);

      if (heroWon) {
        audio.win();
        this.scene.shake(0.0035, 320);
      } else if (isShowdown) {
        audio.lose();
      }

      for (const seat of winnerSeats) {
        const amount = amounts.get(seat) || 0;
        const name = seat === 0 ? '你' : hp[seat].displayName;
        this.scene.setPlayerAction(seat, `赢得 ${fmt(amount)}`, 'win');
        this.hud.feedAction(name, '赢得底池', amount, 'win');
        if (seat !== 0) this.scene.celebrate(seat, amount);
      }
      if (heroWon) this.hud.toast(`本手赢得 ${fmt(amounts.get(0) || 0)} 筹码`);

      if (this.online) {
        const winners = [...amounts.entries()].map(([seat, amount]) => ({
          seat,
          name: seat === 0 ? this.players[0].name : hp[seat].displayName,
          amount,
        }));
        publish({ phase: 'settle', reveal: isShowdown, winners });
      }

      await delay(1650);
      if (!this.isActive(session)) return false;
      await this.scene.scoopPot(winnerSeats);
      if (!this.isActive(session)) return false;

      for (let i = 0; i < n; i += 1) {
        this.players[i].stack = hp[i].stack;
        this.scene.updateStack(i, hp[i].stack);
      }
      this.hud.setHeroStack(hp[0].stack);
      this.hud.setPot(0);
      await delay(800);
      if (!this.isActive(session)) return false;
      await this.scene.muckAll();
      if (!this.isActive(session)) return false;

      this.scene.resetHandVisuals(this.players.map((player) => player.stack));
      this.hud.setHeroHand(null);
      this.hud.hideBanner();
      this.hud.turnTag(false);
      publish({ phase: 'idle' });

      if (this.config?.story) {
        this.storyWon = heroWon;
        this.hud.hideActionBar();
        this.hud.hideSettlement();
        this.hud.clearStoryChallenge();
        this.running = false;
        this.hud.storyController?.showResult({
          won: Boolean(heroWon),
          chapter: this.config.story,
        });
        return false;
      }

      if (hp[0].stack <= 0) {
        this.hud.hideSettlement();
        await this.handleBust(session);
      }
      if (!this.isActive(session)) return false;

      if (hp[0].stack > 0) {
        const keepPlaying = this.online
          ? await this.hud.waitReady(15)
          : await this.hud.waitSettlement(15);
        if (!keepPlaying) {
          if (this.isActive(session)) await this.returnToLobby();
          return false;
        }
      }
      return this.isActive(session);
    };

    // 翻牌前
    await runBettingRound(n === 2 ? dealer : (bbSeat + 1) % n);
    if (!this.isActive(session)) return false;
    await collectStreet();
    if (!this.isActive(session)) return false;

    if (aliveCount() <= 1) {
      const winner = hp.find((player) => !player.folded);
      const amount = potTotal();
      const winnerSeats = [winner.seat];
      const amounts = new Map([[winner.seat, amount]]);
      const name = winner.seat === 0 ? '你' : winner.displayName;
      return settle(winnerSeats, amounts, {
        kicker: '本手结束',
        main: winner.seat === 0 ? '你赢得底池' : `${name} 赢得底池`,
        sub: `+${fmt(amount)} 筹码`,
        gold: winner.seat === 0,
        duration: 3200,
      }, false);
    }

    const boardPlan = [
      { street: 'flop', label: '翻牌', count: 3, startIndex: 0 },
      { street: 'turn', label: '转牌', count: 1, startIndex: 3 },
      { street: 'river', label: '河牌', count: 1, startIndex: 4 },
    ];

    for (const plan of boardPlan) {
      if (aliveCount() <= 1) break;
      const cards = [];
      for (let i = 0; i < plan.count; i += 1) cards.push(deck.pop());
      await this.scene.dealBoard(cards, plan.startIndex);
      if (!this.isActive(session)) return false;
      state.board.push(...cards);
      this.hud.setBoardCards(state.board);
      state.street = plan.street;
      this.hud.feed(`${plan.label} ${cards.map(cardText).join(' ')}`, '');
      if (!hp[0].folded && hp[0].hole.length === 2) {
        const heroEval = evaluate([...hp[0].hole, ...state.board]);
        this.hud.setHeroHand(hp[0].hole, heroEval.name);
        this.hud.setHeroCards(hp[0].hole, heroEval.name);
      }

      hp.forEach((player) => {
        player.bet = 0;
        if (!player.folded && !player.allIn) player.acted = false;
      });
      currentBet = 0;
      lastRaiseSize = bb;
      publish({ phase: 'street' });

      const canAct = hp.filter((player) => !player.folded && !player.allIn && player.stack > 0).length;
      if (canAct >= 2) {
        await runBettingRound(firstActiveAfterDealer());
        if (!this.isActive(session)) return false;
      } else {
        await delay(620);
        if (!this.isActive(session)) return false;
      }
      await collectStreet();
      if (!this.isActive(session)) return false;
    }

    if (aliveCount() <= 1) {
      const winner = hp.find((player) => !player.folded);
      const amount = potTotal();
      const amounts = new Map([[winner.seat, amount]]);
      return settle([winner.seat], amounts, {
        kicker: '本手结束',
        main: winner.seat === 0 ? '你赢得底池' : `${winner.displayName} 赢得底池`,
        sub: `+${fmt(amount)} 筹码`,
        gold: winner.seat === 0,
        duration: 3200,
      }, false);
    }

    // 摊牌
    const contenders = hp.filter((player) => !player.folded);
    audio.speak('showdown');
    const revealJobs = contenders
      .filter((player) => player.seat !== 0)
      .map((player, i) => delay(i * 170).then(() => this.scene.revealSeat(player.seat)));
    await Promise.all(revealJobs);
    if (!hp[0].folded) await this.scene.revealHero();
    if (!this.isActive(session)) return false;
    await delay(450);
    if (!this.isActive(session)) return false;

    const pots = buildSidePots(hp);
    const amounts = new Map();
    const winnerSeats = new Set();
    let headlineName = '';
    let headlineScore = null;

    for (const pot of pots) {
      const eligible = hp.filter((player) => !player.folded && pot.eligible.includes(player.id));
      if (!eligible.length) continue;
      let bestScore = null;
      let bestName = '';
      let winners = [];
      for (const player of eligible) {
        const result = evaluate([...player.hole, ...state.board]);
        const cmp = bestScore ? compareScores(result.score, bestScore) : 1;
        if (cmp > 0) {
          bestScore = result.score;
          bestName = result.name;
          winners = [player];
        } else if (cmp === 0) {
          winners.push(player);
        }
      }
      if (!winners.length) continue;
      if (!headlineScore || compareScores(bestScore, headlineScore) > 0) {
        headlineScore = bestScore;
        headlineName = bestName;
      }
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      const ordered = winners
        .slice()
        .sort((a, b) => ((a.seat - dealer + n) % n) - ((b.seat - dealer + n) % n));
      for (const player of ordered) {
        const bonus = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder -= 1;
        amounts.set(player.seat, (amounts.get(player.seat) || 0) + share + bonus);
        winnerSeats.add(player.seat);
      }
    }

    if (!amounts.size) {
      const fallback = contenders[0];
      amounts.set(fallback.seat, potTotal());
      winnerSeats.add(fallback.seat);
    }

    const winnerSeatsArr = [...winnerSeats];
    Promise.all(winnerSeatsArr.map((seat) => this.scene.highlightSeat(seat, true)));
    const winnersText = winnerSeatsArr
      .map((seat) => (seat === 0 ? '你' : hp[seat].displayName))
      .join('、');
    const heroWon = amounts.has(0);
    const mainAmount = amounts.get([...winnerSeats].sort((a, b) => (amounts.get(b) || 0) - (amounts.get(a) || 0))[0]) || 0;

    const banner = {
      kicker: '摊牌结算',
      main: heroWon
        ? (winnerSeats.size > 1 ? '你平分底池' : '你赢了')
        : (winnerSeats.size > 1 ? `${winnersText} 平分底池` : `${winnersText} 获胜`),
      sub: heroWon
        ? `+${fmt(amounts.get(0) || 0)} 筹码${headlineName ? ` · ${headlineName}` : ''}`
        : `${headlineName} · ${fmt(mainAmount)} 筹码`,
      gold: heroWon,
      duration: 3600,
    };

    void mainAmount;
    return settle(winnerSeatsArr, amounts, banner, true);
  }

  buildSettlement(hp, amounts, board, showdown, pot) {
    const contenders = hp
      .filter((player) => !player.folded)
      .map((player) => {
        const result = showdown ? evaluate([...player.hole, ...board]) : null;
        return {
          seat: player.seat,
          name: player.seat === 0 ? '你' : player.displayName,
          hole: player.hole.slice(),
          bestCards: result ? result.best.slice() : [],
          handName: result ? result.name : '弃牌获胜',
          handDetail: result ? handDetail(result.score) : '其他玩家全部弃牌',
          score: result ? result.score.slice() : [],
          won: amounts.get(player.seat) || 0,
          rank: 1,
          winner: false,
          reason: '',
        };
      });

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
    const reasonFor = (row) => {
      if (!showdown) return row.winner ? '其他玩家全部弃牌，直接赢得底池' : '已弃牌';
      if (row.winner) {
        if (row.rank === 1) {
          return topWinners > 1
            ? '牌型相同，与并列赢家平分底池'
            : `${row.handDetail}，为全场最大牌型，赢得底池`;
        }
        return `${row.handDetail}，赢得边池`;
      }
      if (!top) return '';
      if (compareScores(row.score, top.score) === 0) return '牌型相同，但底池由并列赢家平分';
      if (top.handName !== row.handName) return `${top.handDetail} 大于 ${row.handDetail}`;
      const len = Math.max(top.score.length, row.score.length);
      for (let i = 1; i < len; i += 1) {
        const a = top.score[i] ?? 0;
        const b = row.score[i] ?? 0;
        if (a !== b) return `同为${top.handName}，${rankLabel(a)} 大于 ${rankLabel(b)}`;
      }
      return `${top.handDetail} 大于 ${row.handDetail}`;
    };
    for (const row of contenders) row.reason = reasonFor(row);

    return {
      showdown: Boolean(showdown),
      pot,
      board: board.slice(),
      contenders,
      folded: hp.filter((player) => player.folded).map((player) => (player.seat === 0 ? '你' : player.displayName)),
      winners: [...amounts.entries()].map(([seat, amount]) => ({
        seat,
        name: seat === 0 ? '你' : hp[seat].displayName,
        amount,
      })),
    };
  }

  async handleBust(session) {
    while (this.isActive(session) && this.players[0].stack <= 0) {
      this.hud.showGameOver({
        hands: this.handNumber,
        biggestPot: this.biggestPot,
        text: '牌桌还在，位置还热。重新买入，再来一手。',
      });
      await new Promise((resolve) => { this.rebuyResolver = resolve; });
      this.rebuyResolver = null;
      if (!this.isActive(session)) return;
    }
    this.hud.hideGameOver();
  }

  rebuy() {
    if (!this.config) return;
    this.players[0].stack = this.config.stack;
    this.scene.updateStack(0, this.config.stack);
    this.hud.setHeroStack(this.config.stack);
    this.hud.feedAction('你', '重新买入', 0, 'hero');
    this.hud.hideGameOver();
    if (this.rebuyResolver) {
      const resolve = this.rebuyResolver;
      this.rebuyResolver = null;
      resolve();
    }
  }

  async returnToLobby() {
    this.running = false;
    this.session += 1;
    if (this.online) {
      this.online.leave();
      this.online = null;
    }
    if (this.rebuyResolver) {
      const resolve = this.rebuyResolver;
      this.rebuyResolver = null;
      resolve();
    }
    this.hud.resolveAction({ type: 'fold' });
    this.hud.thinking(false);
    this.hud.turnTag(false);
    this.hud.hideBanner();
    this.hud.hideGameOver();
    this.hud.backToLobby();
    this.scene.setTurn(-1);
    this.scene.clearCards();
    if (this.players.length) {
      this.scene.resetHandVisuals(this.players.map((player) => player.stack));
    }
    this.scene.setPot(0, false);
    await this.scene.toLobby(1900);
  }
}
