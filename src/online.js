import { evaluate, describeHole, rankLabel } from './poker.js';
import { fmt } from './util.js';

const SUIT_MARKS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const STREET_LABELS = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};

export function onlineBase() {
  const raw = window.__ONLINE_BASE__ || window.__UPDATE_BASE__ || '';
  return String(raw).replace(/\/+$/, '');
}

function cardTile(card, compact = false) {
  const rank = Number(card && card.rank);
  const suit = String((card && card.suit) || '');
  if (!Number.isInteger(rank) || rank < 2 || rank > 14 || !SUIT_MARKS[suit]) {
    return '<span class="card-tile"><b>?</b></span>';
  }
  const red = suit === 'h' || suit === 'd';
  return `<span class="card-tile${compact ? ' compact' : ''}${red ? ' red' : ''}">`
    + `<b>${rankLabel(rank)}</b><i>${SUIT_MARKS[suit]}</i></span>`;
}

export class OnlineService {
  constructor(account) {
    this.handlers = new Map();
    this.room = null;
    this.players = [];
    this.started = false;
    this.mode = 'idle';
    this.es = null;
    this.pending = new Map();
    this.account = account || null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this.handlers.get(type);
    if (!list) return;
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  }

  emit(type, payload) {
    // 离开房间后，浏览器可能还会派发已经排队的 SSE 事件。
    // 房间已经为空时一律丢弃，绝不能让旧房间把玩家拉回在线牌桌。
    if (type !== 'left' && !this.room) return;
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (error) {
        console.warn('[online] handler failed', type, error);
      }
    }
  }

  async request(path, options = {}) {
    const base = onlineBase();
    const res = await fetch(`${base}${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': String(window.__APP_VERSION_CODE__ || 0),
        'X-Client-Version-Name': String(window.__APP_VERSION__ || 'dev'),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const error = new Error((data && data.error) || `请求失败 (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async createRoom({ name, seats, password, startingChips, sb, bb, loserSpectate }) {
    if (this.room) await this.leave();
    const data = await this.request('/api/rooms', {
      method: 'POST',
      body: { name, seats, password, startingChips, sb, bb, loserSpectate, token: this.accountToken() },
    });
    this.room = {
      ...data,
      name,
      seats,
      password,
      startingChips: data.startingChips ?? startingChips,
      sb: data.sb ?? sb,
      bb: data.bb ?? bb,
      loserSpectate: data.loserSpectate ?? loserSpectate,
    };
    this.mode = 'host';
    this.applyAccount(data.account);
    this.connect();
    return this.room;
  }

  async joinRoom({ code, password, roomName }) {
    if (this.room) await this.leave();
    const data = await this.request(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { password, token: this.accountToken() },
    });
    this.room = {
      ...data, code: data.code || code, name: roomName || `房间 ${code}`, password,
      waiting: Boolean(data.waiting), started: Boolean(data.started),
    };
    this.mode = 'guest';
    this.applyAccount(data.account);
    this.connect();
    return this.room;
  }

  async updateRoomConfig({ startingChips, sb, bb, loserSpectate }) {
    if (!this.room) throw new Error('不在房间中');
    const data = await this.request(`/api/rooms/${this.room.code}/config`, {
      method: 'POST',
      body: { token: this.room.token, startingChips, sb, bb, loserSpectate },
    });
    Object.assign(this.room, data);
    return data;
  }

  async quickMatch() {
    return this.joinMatch('');
  }

  async joinMatch(code) {
    if (this.room) await this.leave();
    const path = code ? '/api/match/join' : '/api/match/quick';
    const data = await this.request(path, {
      method: 'POST',
      body: { code: code || undefined, token: this.accountToken() },
    });
    this.room = {
      ...data,
      code: data.code,
      name: data.match ? `匹配 ${String(data.code).slice(-1)} 号房` : '在线房间',
      password: data.match ? '' : data.password,
      seats: data.seats || 8,
      waiting: Boolean(data.waiting),
      started: Boolean(data.started),
    };
    this.mode = data.host ? 'host' : 'guest';
    this.applyAccount(data.account);
    this.connect();
    return this.room;
  }

  accountToken() {
    return this.account ? this.account.token : '';
  }

  applyAccount(account) {
    if (!account || !this.account) return;
    this.account.account = { ...(this.account.account || {}), ...account };
    this.emit('account', this.account.account);
  }

  connect() {
    if (!this.room) return;
    if (this.es) this.es.close();
    const roomCode = this.room.code;
    const base = onlineBase();
    const url = `${base}/api/rooms/${this.room.code}/events?token=${encodeURIComponent(this.room.token)}&v=${encodeURIComponent(window.__APP_VERSION_CODE__ || 0)}`;
    const es = new EventSource(url);
    this.es = es;
    const listen = (type, handler) => es.addEventListener(type, (event) => {
      if (this.es !== es || this.room?.code !== roomCode) return;
      handler(event);
    });
    listen('hello', (event) => {
      const data = JSON.parse(event.data);
      this.applyAccount(data.account);
      this.emit('hello', data);
    });
    listen('players', (event) => {
      const data = JSON.parse(event.data);
      this.players = data.players || [];
      if (this.room) {
        this.room.minPlayers = data.minPlayers || this.room.minPlayers;
        this.room.countdownEnd = data.countdownEnd || 0;
        this.room.started = Boolean(data.started);
        this.started = Boolean(data.started);
        if (!data.started) this.room.waiting = false;
        const me = this.players.find((player) => player.pid === this.room.pid);
        if (me) this.mode = me.host ? 'host' : 'guest';
      }
      this.emit('players', data);
    });
    listen('account', (event) => {
      const data = JSON.parse(event.data);
      this.applyAccount(data);
    });
    listen('evicted', (event) => {
      const data = JSON.parse(event.data);
      this.emit('evicted', data);
    });
    listen('started', () => {
      this.started = true;
      this.emit('started', {});
    });
    listen('host', (event) => this.emit('host', JSON.parse(event.data)));
    listen('notice', (event) => this.emit('notice', JSON.parse(event.data)));
    listen('gameover', (event) => this.emit('gameover', JSON.parse(event.data)));
    listen('career', (event) => this.emit('career', JSON.parse(event.data)));
    listen('achievement', (event) => this.emit('achievement', JSON.parse(event.data)));
    listen('achievement_broadcast', (event) => this.emit('achievement_broadcast', JSON.parse(event.data)));
    listen('reward', (event) => this.emit('reward', JSON.parse(event.data)));
    listen('state', (event) => this.emit('state', JSON.parse(event.data)));
    listen('action', (event) => {
      const data = JSON.parse(event.data);
      const entry = this.pending.get(data.pid);
      if (entry) {
        this.pending.delete(data.pid);
        entry.resolve(data.action);
      }
      this.emit('action', data);
    });
    listen('direct', (event) => this.emit('direct', JSON.parse(event.data)));
    listen('voice', (event) => this.emit('voice', JSON.parse(event.data)));
  listen('voice-active', (event) => this.emit('voice-active', JSON.parse(event.data)));
    listen('voicepcm', (event) => this.emit('voicepcm', JSON.parse(event.data)));
    listen('closed', (event) => {
      let data = {};
      try { data = JSON.parse(event.data); } catch { /* 忽略 */ }
      this.emit('closed', data);
    });
    listen('error', () => this.emit('connection', { ok: false }));
    listen('open', () => this.emit('connection', { ok: true }));
  }

  async startGame() {
    if (!this.room) return;
    await this.request(`/api/rooms/${this.room.code}/start`, {
      method: 'POST',
      body: { token: this.room.token },
    });
  }

  async setReady(ready) {
    if (!this.room) return null;
    return this.request(`/api/rooms/${this.room.code}/action`, {
      method: 'POST',
      body: { token: this.room.token, action: 'ready', ready: Boolean(ready) },
    });
  }

  async continueNext() {
    if (!this.room) return null;
    return this.request(`/api/rooms/${this.room.code}/action`, {
      method: 'POST',
      body: { token: this.room.token, action: 'next' },
    });
  }

  async restartRoom() {
    if (!this.room) return null;
    return this.request(`/api/rooms/${this.room.code}/action`, {
      method: 'POST',
      body: { token: this.room.token, action: 'restart' },
    });
  }

  async voiceSignal(kind, { targetPid = null, payload = null } = {}) {
    if (!this.room) return null;
    return this.request(`/api/rooms/${this.room.code}/voice`, {
      method: 'POST',
      body: { token: this.room.token, kind, targetPid, payload },
    });
  }

  async beginRound() {
    if (!this.room || this.mode !== 'host') return { hostOut: false, out: [] };
    return this.request(`/api/rooms/${this.room.code}/round`, {
      method: 'POST',
      body: { token: this.room.token },
    });
  }

  publish(state) {
    if (!this.room || this.mode !== 'host') return;
    this.request(`/api/rooms/${this.room.code}/state`, {
      method: 'POST',
      body: { token: this.room.token, state },
    }).catch((error) => console.warn('[online] state failed', error.message));
  }

  direct(pid, event, data) {
    if (!this.room || this.mode !== 'host') return;
    this.request(`/api/rooms/${this.room.code}/direct`, {
      method: 'POST',
      body: { token: this.room.token, targetPid: pid, event, data },
    }).catch((error) => console.warn('[online] direct failed', error.message));
  }

  action(action) {
    if (!this.room) return Promise.resolve({ ok: false });
    return this.request(`/api/rooms/${this.room.code}/action`, {
      method: 'POST',
      body: { token: this.room.token, action },
    }).catch((error) => {
      this.emit('actionError', { message: error.message });
      throw error;
    });
  }

  waitAction(pid, ms = 18000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(pid);
        resolve(null);
      }, ms);
      this.pending.set(pid, {
        resolve: (action) => {
          clearTimeout(timer);
          resolve(action);
        },
      });
    });
  }

  isOnline(pid) {
    return this.players.some((player) => player.pid === pid && !player.spectator && player.online === true);
  }

  humans() {
    return this.players.filter((player) => !player.host && !player.spectator && player.online === true);
  }

  async leave() {
    if (!this.room) return;
    const room = this.room;
    const leavingCode = room.code;
    this.room = null;
    this.players = [];
    this.started = false;
    this.mode = 'idle';
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.pending.clear();
    try {
      await this.request(`/api/rooms/${leavingCode}/leave`, {
        method: 'POST',
        body: { token: room.token },
      });
    } catch {
      /* 房间可能已关闭 */
    }
    // 如果离房请求期间用户已经进入新房间，不能再发 left 把新房间关掉
    if (!this.room) this.emit('left', { code: leavingCode });
  }
}

export class GuestTable {
  constructor(service) {
    this.service = service;
    this.youSeat = -1;
    this.state = null;
    this.showing = false;
    this.spectating = false;
    this.turnKey = '';
    this.timer = null;
    this.showdownTimer = null;
    this.raiseValue = 0;
    this.seatNodes = new Map();

    this.el = {
      root: document.getElementById('guestTable'),
      hand: document.getElementById('gtHand'),
      room: document.getElementById('gtRoom'),
      pot: document.getElementById('gtPot'),
      board: document.getElementById('gtBoard'),
      msg: document.getElementById('gtMsg'),
      seats: document.getElementById('gtSeats'),
      hole: document.getElementById('gtHole'),
      handName: document.getElementById('gtHandName'),
      stack: document.getElementById('gtStack'),
      actions: document.getElementById('gtActions'),
      timerBar: document.getElementById('gtTimerBar'),
      timerText: document.getElementById('gtTimerText'),
      range: document.getElementById('gtRange'),
      raiseVal: document.getElementById('gtRaiseVal'),
      presets: document.querySelector('.gt-presets'),
      fold: document.getElementById('gtFold'),
      call: document.getElementById('gtCall'),
      raise: document.getElementById('gtRaise'),
      leave: document.getElementById('gtLeave'),
      showdown: document.getElementById('gtShowdown'),
      showdownTitle: document.getElementById('gtShowdownTitle'),
      showdownTimer: document.getElementById('gtShowdownTimer'),
      showdownBoard: document.getElementById('gtShowdownBoard'),
      showdownList: document.getElementById('gtShowdownList'),
      readyCount: document.getElementById('gtReadyCount'),
      readyNext: document.getElementById('gtReadyNext'),
    };

    this.el.fold.addEventListener('click', () => this.act({ type: 'fold' }));
    this.el.call.addEventListener('click', () => {
      this.act({ type: this.el.call.dataset.action === 'check' ? 'check' : 'call' });
    });
    this.el.raise.addEventListener('click', () => {
      const value = Number(this.el.range.value);
      const max = Number(this.el.range.max);
      this.act(value >= max ? { type: 'allin' } : { type: 'raise', amount: value });
    });
    this.el.range.addEventListener('input', () => this.updateRaiseDisplay());
    this.el.presets.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !this.legal || !this.legal.canRaise) return;
      const legal = this.legal;
      if (button.dataset.allin) this.setRaiseValue(legal.maxRaiseTo);
      else {
        const frac = Number(button.dataset.frac);
        this.setRaiseValue(legal.currentBet + (legal.pot + legal.toCall) * frac);
      }
    });
    this.el.leave.addEventListener('click', () => {
      this.hide();
      this.service.leave();
    });
    if (this.el.readyNext) {
      this.el.readyNext.addEventListener('click', () => this.continueNext());
    }
  }

  async continueNext() {
    if (!this.el.readyNext || this.el.readyNext.disabled) return;
    this.el.readyNext.disabled = true;
    try {
      await this.service.continueNext();
    } catch (error) {
      this.el.readyNext.disabled = false;
      this.el.msg.textContent = `继续失败：${error.message}`;
    }
  }

  show(roomCode) {
    this.showing = true;
    this.state = null;
    this.el.root.classList.remove('hidden');
    this.el.room.textContent = `房间 ${roomCode || '---'}`;
    this.el.msg.textContent = '等待发牌…';
    this.el.hole.innerHTML = '';
    this.el.board.innerHTML = '';
    this.el.handName.textContent = '';
    this.el.seats.innerHTML = '';
    this.seatNodes.clear();
    this.el.actions.classList.add('hidden');
    this.hideShowdown();
  }

  hide() {
    this.showing = false;
    this.youSeat = -1;
    this.spectating = false;
    this.ownHole = [];
    this.stopTimer();
    this.hideShowdown();
    this.el.root.classList.add('hidden');
    this.el.actions.classList.add('hidden');
  }

  setYou(data) {
    if (!data) return;
    this.youSeat = Number(data.seat);
    this.ownHole = data.hole || [];
    this.renderHole();
    if (this.state) {
      this.renderOwn(this.state);
      this.renderTurn(this.state);
      if (this.state.phase === 'settle') this.updateNextReady(this.state);
    }
  }

  applyState(state) {
    if (!state) return;
    this.state = state;
    this.spectating = Boolean(state.spectator);
    if (!this.showing) this.show(state.roomCode || '');
    if (this.spectating) {
      this.youSeat = -1;
      this.ownHole = [];
      this.el.actions.classList.add('hidden');
    } else if (this.youSeat < 0 && Number.isInteger(state.youSeat)) {
      this.youSeat = state.youSeat;
    }

    this.el.hand.textContent = state.hand ? `第 ${state.hand} 手` : '等待开局';
    this.el.pot.textContent = fmt(state.pot || 0);
    this.el.msg.textContent = this.spectating ? '观战中 · 不能查看其他玩家底牌' : this.messageFor(state);

    this.renderBoard(state.board || []);
    this.renderSeats(state.seats || []);
    this.renderOwn(state);
    this.renderTurn(state);
    if (state.phase === 'settle' && !this.spectating) this.renderShowdown(state);
    else this.hideShowdown();
  }

  renderShowdown(state) {
    const list = this.el.showdownList;
    if (!list) return;
    list.innerHTML = '';
    const settlement = state.settlement;
    const showdown = Boolean(settlement ? settlement.showdown : state.showdown);
    if (this.el.showdownTitle) {
      this.el.showdownTitle.textContent = showdown ? '本手结算 · 全部剩余玩家' : '本手结束 · 弃牌获胜';
    }
    if (this.el.showdownBoard) {
      const board = state.board || [];
      this.el.showdownBoard.innerHTML = board.length
        ? board.map((card) => cardTile(card, true)).join('')
        : '<em class="gt-no-board">无公共牌</em>';
    }

    let rows;
    if (settlement && Array.isArray(settlement.contenders)) {
      rows = settlement.contenders;
    } else {
      const winners = new Map((state.winners || []).map((w) => [w.seat, w.amount]));
      rows = (state.seats || [])
        .filter((seat) => !seat.folded)
        .map((seat) => {
          const won = Number(seat.won) || winners.get(seat.seat) || 0;
          return {
            ...seat,
            won,
            rank: won > 0 ? 1 : 2,
            winner: won > 0,
            handDetail: seat.handDetail || seat.handName || '',
            bestCards: seat.bestCards || [],
            reason: won > 0 ? '赢得底池' : '牌型小于赢家',
          };
        });
    }

    const addLabel = (text) => {
      const span = document.createElement('span');
      span.className = 'gt-cards-label';
      span.textContent = text;
      return span;
    };

    for (const row of rows) {
      const el = document.createElement('div');
      el.className = `gt-show-row${row.winner ? ' winner' : ''}`;

      const rank = document.createElement('span');
      rank.className = 'gt-show-rank';
      rank.textContent = row.rank ? `#${row.rank}` : '—';

      const main = document.createElement('div');
      main.className = 'gt-show-main';

      const nameLine = document.createElement('div');
      nameLine.className = 'gt-show-name';
      const name = document.createElement('b');
      name.textContent = row.seat === this.youSeat ? `${row.name}（你）` : row.name;
      nameLine.append(name);
      if (row.winner) {
        const badge = document.createElement('span');
        badge.className = 'gt-show-badge';
        badge.textContent = '赢';
        nameLine.append(badge);
      }
      const detail = document.createElement('em');
      detail.textContent = row.handDetail || row.handName || '';
      nameLine.append(detail);

      const cardsBlock = document.createElement('div');
      cardsBlock.className = 'gt-show-cards-block';
      cardsBlock.append(addLabel('底牌'));
      const hole = document.createElement('span');
      hole.className = 'gt-show-cards';
      hole.innerHTML = (row.hole || []).map((card) => cardTile(card, true)).join('') || '<i class="gt-no-card">?</i>';
      cardsBlock.append(hole);
      if (Array.isArray(row.bestCards) && row.bestCards.length) {
        cardsBlock.append(addLabel('成牌'));
        const best = document.createElement('span');
        best.className = 'gt-show-cards best';
        best.innerHTML = row.bestCards.map((card) => cardTile(card, true)).join('');
        cardsBlock.append(best);
      } else if (!showdown) {
        const noShow = document.createElement('span');
        noShow.className = 'gt-show-noshow';
        noShow.textContent = '未摊牌（其余玩家弃牌）';
        cardsBlock.append(noShow);
      }

      const reason = document.createElement('p');
      reason.className = 'gt-show-reason';
      reason.textContent = row.reason || '';

      main.append(nameLine, cardsBlock, reason);

      const won = document.createElement('span');
      won.className = 'gt-show-won';
      won.textContent = row.won > 0 ? `+${fmt(row.won)}` : '未赢';

      el.append(rank, main, won);
      list.append(el);
    }

    const folded = settlement?.folded
      || (state.seats || []).filter((seat) => seat.folded).map((seat) => seat.name);
    if (folded.length) {
      const note = document.createElement('div');
      note.className = 'gt-show-folded';
      note.textContent = `已弃牌：${folded.join('、')}`;
      list.append(note);
    }

    this.el.showdown.classList.remove('hidden');
    this.updateNextReady(state);
    this.startShowdownTimer(state);
  }

  updateNextReady(state) {
    if (!this.el.readyNext) return;
    const readySeats = Array.isArray(state.nextReadySeats) ? state.nextReadySeats : [];
    const total = Math.max(0, Number(state.nextReadyTotal) || 0);
    const ready = readySeats.includes(this.youSeat);
    const canContinue = state.phase === 'settle' && !this.spectating && this.youSeat >= 0;
    this.el.readyNext.classList.toggle('hidden', !canContinue);
    this.el.readyNext.disabled = !canContinue || ready;
    this.el.readyNext.textContent = ready ? '已准备，等其他人' : '继续下一把';
    if (this.el.readyCount) {
      this.el.readyCount.textContent = `${readySeats.length}/${total} 已准备`;
    }
  }

  startShowdownTimer(state) {
    this.stopShowdownTimer();
    const deadline = Number(state.nextHandAt) || (Date.now() + 15000);
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (this.el.showdownTimer) {
        this.el.showdownTimer.textContent = left > 0 ? `下一手 ${left}s` : '下一手即将开始';
      }
    };
    tick();
    this.showdownTimer = setInterval(tick, 250);
  }

  stopShowdownTimer() {
    if (this.showdownTimer) {
      clearInterval(this.showdownTimer);
      this.showdownTimer = null;
    }
  }

  hideShowdown() {
    this.stopShowdownTimer();
    if (this.el.showdown) this.el.showdown.classList.add('hidden');
    if (this.el.showdownBoard) this.el.showdownBoard.innerHTML = '';
    if (this.el.showdownList) this.el.showdownList.innerHTML = '';
    if (this.el.readyNext) {
      this.el.readyNext.classList.add('hidden');
      this.el.readyNext.disabled = false;
    }
  }

  messageFor(state) {
    if (state.phase === 'settle' && state.winners?.length) {
      return state.winners
        .map((w) => `${w.name} 赢得 ${fmt(w.amount)}`)
        .join(' · ');
    }
    if (state.phase === 'idle') return '下一手准备中…';
    if (state.phase === 'deal') return '正在发牌…';
    if (state.turn) {
      const actor = (state.seats || []).find((s) => s.seat === state.turn.seat);
      const name = state.turn.seat === this.youSeat ? '你' : (actor?.name || '玩家');
      return `轮到 ${name} 行动 · ${STREET_LABELS[state.street] || ''}`;
    }
    return STREET_LABELS[state.street] || '牌局进行中';
  }

  renderBoard(board) {
    this.el.board.innerHTML = board.map((card) => cardTile(card)).join('');
  }

  renderHole() {
    const hole = this.ownHole || [];
    this.el.hole.innerHTML = hole.length
      ? hole.map((card) => cardTile(card)).join('')
      : '<span class="gt-empty">等待发牌</span>';
    if (hole.length === 2 && this.state) {
      const board = this.state.board || [];
      const name = board.length >= 3 ? evaluate([...hole, ...board]).name : describeHole(hole);
      this.el.handName.textContent = name;
    } else {
      this.el.handName.textContent = '';
    }
  }

  renderOwn(state) {
    const own = (state.seats || []).find((seat) => seat.seat === this.youSeat);
    if (own) this.el.stack.textContent = fmt(own.stack);
    if (!this.ownHole?.length) {
      const revealed = own?.hole || [];
      if (revealed.length) {
        this.ownHole = revealed;
      }
    }
    this.renderHole();
  }

  renderSeats(seats) {
    const n = seats.length || 1;
    const existing = new Set();
    for (const seat of seats) {
      existing.add(seat.seat);
      let node = this.seatNodes.get(seat.seat);
      if (!node) {
        node = document.createElement('div');
        node.className = 'gt-seat';
        node.innerHTML = '<span class="gt-seat-name"></span><span class="gt-seat-stack"></span>'
          + '<span class="gt-seat-action"></span><span class="gt-seat-bet"></span>'
          + '<span class="gt-seat-cards"></span>';
        this.el.seats.appendChild(node);
        this.seatNodes.set(seat.seat, node);
      }
      const relative = this.youSeat >= 0 ? ((seat.seat - this.youSeat + n) % n) : seat.seat;
      const angle = (90 + (relative * 360) / n) * (Math.PI / 180);
      node.style.left = `${50 + 46 * Math.cos(angle)}%`;
      node.style.top = `${50 + 44 * Math.sin(angle)}%`;
      node.classList.toggle('you', seat.seat === this.youSeat);
      node.classList.toggle('folded', Boolean(seat.folded));
      node.classList.toggle('turn', Boolean(this.state?.turn && this.state.turn.seat === seat.seat));
      node.querySelector('.gt-seat-name').textContent = seat.name;
      node.querySelector('.gt-seat-stack').textContent = fmt(seat.stack);
      node.querySelector('.gt-seat-action').textContent = seat.action || '';
      node.querySelector('.gt-seat-bet').textContent = seat.bet > 0 ? fmt(seat.bet) : '';
      const showCards = seat.hole?.length && (seat.seat === this.youSeat || seat.revealed);
      node.querySelector('.gt-seat-cards').innerHTML = showCards
        ? seat.hole.map((card) => cardTile(card, true)).join('')
        : '';
    }
    for (const [seat, node] of this.seatNodes) {
      if (!existing.has(seat)) {
        node.remove();
        this.seatNodes.delete(seat);
      }
    }
  }

  renderTurn(state) {
    const turn = state.turn;
    if (!turn || turn.seat !== this.youSeat) {
      if (this.turnKey) {
        this.turnKey = '';
        this.legal = null;
        this.stopTimer();
        this.el.actions.classList.add('hidden');
      }
      return;
    }
    const key = `${state.hand}:${state.street}:${turn.seat}:${turn.legal?.currentBet}:${turn.legal?.stack}`;
    if (key === this.turnKey) return;
    this.turnKey = key;
    const legal = turn.legal || {};
    this.legal = legal;
    this.el.actions.classList.remove('hidden');
    this.el.call.dataset.action = legal.canCheck ? 'check' : 'call';
    this.el.call.textContent = legal.canCheck ? '过牌' : `跟注 ${fmt(legal.toCall)}`;
    this.el.fold.disabled = false;
    this.el.call.disabled = false;
    this.el.raise.disabled = !legal.canRaise;
    this.el.range.disabled = !legal.canRaise;
    this.el.presets.querySelectorAll('button').forEach((b) => { b.disabled = !legal.canRaise; });
    this.el.range.min = String(legal.minRaiseTo || 0);
    this.el.range.max = String(legal.maxRaiseTo || 0);
    const preferred = Math.min(
      legal.maxRaiseTo || 0,
      Math.max(legal.minRaiseTo || 0, (legal.currentBet || 0) + Math.round(((legal.pot || 0) * 0.6) / 5) * 5),
    );
    this.el.range.value = String(preferred);
    this.updateRaiseDisplay();
    this.startTimer(13);
  }

  updateRaiseDisplay() {
    const value = Number(this.el.range.value);
    const max = Number(this.el.range.max);
    this.raiseValue = value;
    this.el.raiseVal.textContent = fmt(value);
    this.el.raise.textContent = value >= max && max > 0 ? '全下' : '加注';
  }

  setRaiseValue(value) {
    const min = Number(this.el.range.min);
    const max = Number(this.el.range.max);
    const rounded = Math.round(value / 5) * 5;
    this.el.range.value = String(Math.max(min, Math.min(max, rounded)));
    this.updateRaiseDisplay();
  }

  startTimer(seconds) {
    this.stopTimer();
    this.timerLeft = seconds;
    this.el.timerText.textContent = `${seconds}s`;
    this.el.timerBar.style.width = '100%';
    this.timer = setInterval(() => {
      this.timerLeft -= 1;
      const left = Math.max(0, this.timerLeft);
      this.el.timerText.textContent = `${left}s`;
      this.el.timerBar.style.width = `${(left / seconds) * 100}%`;
      if (this.timerLeft <= 0) {
        this.stopTimer();
        this.act({ type: this.legal?.canCheck ? 'check' : 'fold' });
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  act(action) {
    if (!this.legal) return;
    this.legal = null;
    this.turnKey = '';
    this.stopTimer();
    this.el.actions.classList.add('hidden');
    this.service.action({ ...action, seat: this.youSeat })
      .catch((error) => { this.el.msg.textContent = `操作失败：${error.message}`; });
    if (this.state) this.el.msg.textContent = '已行动，等待牌桌…';
  }
}
