import { escapeHtml } from './util.js';
import { ACHIEVEMENTS, achievementFor, handTypeName, HAND_TYPES } from './career-data.js';

const TABS = [
  ['overview', '总览'],
  ['hands', '牌型'],
  ['friends', '好友'],
  ['titles', '称号'],
  ['ledger', '筹码记录'],
];

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export class CareerPanel {
  constructor({ account, accountUI, hud, audio }) {
    this.account = account;
    this.accountUI = accountUI;
    this.hud = hud;
    this.audio = audio;
    this.root = null;
    this.data = null;
    this.openState = false;
    this.tab = 'overview';
    this.loading = false;
    this.unlockQueue = [];
    this.unlockTimer = null;
    this.unlockActive = false;
    this.titlePage = 0;
    this.titlePageSize = 48;
    this.titleFilter = 'all';
    this.titleStar = 0;
    this.unlockSeen = new Map();
  }

  ensureDom() {
    if (this.root) return;
    const root = document.createElement('section');
    root.id = 'careerScreen';
    root.className = 'career-screen hidden';
    root.innerHTML = `
      <div class="career-shell">
        <header class="career-head">
          <div><em>CAREER · 德扑之夜</em><h2>生涯</h2></div>
          <button type="button" class="career-close" data-career-close aria-label="关闭">×</button>
        </header>
        <div class="career-hero" data-career-hero></div>
        <nav class="career-tabs">
          ${TABS.map(([key, label]) => `<button type="button" data-career-tab="${key}" class="${key === 'overview' ? 'active' : ''}">${label}</button>`).join('')}
        </nav>
        <div class="career-body">
          <section data-career-panel="overview"></section>
          <section data-career-panel="hands" class="hidden"></section>
          <section data-career-panel="friends" class="hidden"></section>
          <section data-career-panel="titles" class="hidden"></section>
          <section data-career-panel="ledger" class="hidden"></section>
        </div>
      </div>
      <div class="career-unlock hidden" data-career-unlock>
        <div class="career-unlock-glow"></div>
        <div class="career-unlock-card">
          <span class="career-unlock-kicker">荣耀解锁 · HONOR UNLOCKED</span>
          <div class="career-unlock-mark">✦</div>
          <h3 data-career-unlock-title>称号</h3>
          <p data-career-unlock-player></p>
          <strong data-career-unlock-star></strong>
          <em data-career-unlock-quote></em>
          <button type="button" class="career-unlock-skip" data-career-unlock-skip>继续</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    // 解锁层挂在 body 上，生涯页关闭时也能显示。
    const unlockLayer = root.querySelector('[data-career-unlock]');
    if (unlockLayer) document.body.appendChild(unlockLayer);
    this.root = root;
    this.el = {
      hero: root.querySelector('[data-career-hero]'),
      panels: Object.fromEntries(TABS.map(([key]) => [key, root.querySelector(`[data-career-panel="${key}"]`)])),
      unlock: unlockLayer,
      unlockTitle: unlockLayer?.querySelector('[data-career-unlock-title]'),
      unlockPlayer: unlockLayer?.querySelector('[data-career-unlock-player]'),
      unlockQuote: unlockLayer?.querySelector('[data-career-unlock-quote]'),
      unlockStar: unlockLayer?.querySelector('[data-career-unlock-star]'),
    };
    root.querySelectorAll('[data-career-close]').forEach((btn) => btn.addEventListener('click', () => this.close()));
    root.querySelectorAll('[data-career-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.careerTab;
        root.querySelectorAll('[data-career-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        Object.entries(this.el.panels).forEach(([key, panel]) => panel.classList.toggle('hidden', key !== this.tab));
      });
    });
    unlockLayer?.querySelector('[data-career-unlock-skip]')?.addEventListener('click', () => this.skipUnlock());
    root.addEventListener('click', (event) => {
      const filter = event.target.closest('[data-career-title-filter]');
      if (filter) {
        this.titleFilter = filter.dataset.careerTitleFilter;
        this.titlePage = 0;
        this.renderTitles();
        return;
      }
      const star = event.target.closest('[data-career-star-filter]');
      if (star) {
        this.titleStar = Number(star.dataset.careerStarFilter) || 0;
        this.titlePage = 0;
        this.renderTitles();
        return;
      }
      const page = event.target.closest('[data-career-title-page]');
      if (page) {
        this.titlePage = Math.max(0, this.titlePage + Number(page.dataset.careerTitlePage));
        this.renderTitles();
        return;
      }
      const title = event.target.closest('[data-career-equip]');
      if (title) this.equipTitle(title.dataset.careerEquip);
    });
  }

  async open() {
    if (!this.account?.loggedIn) {
      this.accountUI?.openLogin?.('login');
      return;
    }
    this.ensureDom();
    this.openState = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('career-open');
    await this.load();
  }

  close() {
    this.openState = false;
    this.root?.classList.add('hidden');
    document.body.classList.remove('career-open');
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const data = await this.account.request('/api/career');
      this.data = data.career;
      if (data.account && this.accountUI) this.accountUI.notifyAccount(data.account);
      this.render();
    } catch (error) {
      this.hud?.toast?.(error.message || '生涯加载失败', { kind: 'warn', title: '生涯' });
      this.close();
    } finally {
      this.loading = false;
    }
  }

  updateCareer(data) {
    if (!data) return;
    this.data = data;
    if (this.openState) this.render();
  }

  render() {
    if (!this.root || !this.data) return;
    const d = this.data;
    const s = d.stats || {};
    const titles = d.titles || [];
    const active = d.activeTitle ? achievementFor(d.activeTitle).title : '尚未装备';
    this.el.hero.innerHTML = `
      <div class="career-identity"><span>牌手</span><b>${escapeHtml(d.name || d.username || '玩家')}</b><em>${escapeHtml(active)}</em></div>
      <div class="career-hero-stats">
        <div><span>当前大厅筹码</span><b>${fmt(d.chips)}</b></div>
        <div><span>历史最高筹码</span><b>${fmt(d.highestChips)}</b></div>
        <div><span>已获称号</span><b>${titles.length}</b></div>
      </div>
    `;
    this.el.panels.overview.innerHTML = `
      <div class="career-grid">
        ${this.statCard('总对局', fmt(s.hands), '所有好友房 / 在线匹配')}
        ${this.statCard('胜场', fmt(s.wins), `胜率 ${s.winRate || 0}%`)}
        ${this.statCard('平局', fmt(s.ties), '分池对局计入胜场')}
        ${this.statCard('当前连胜', fmt(s.currentStreak), '连续赢下牌局')}
        ${this.statCard('最高连胜', fmt(s.bestStreak), '生涯最佳纪录')}
        ${this.statCard('最大底池', fmt(s.biggestPot), '单手底池纪录')}
        ${this.statCard('好友房胜场', fmt(s.friendWins), '好友房战绩')}
        ${this.statCard('在线匹配胜场', fmt(s.onlineWins), '匹配战绩')}
        ${this.statCard('弃牌获胜', fmt(s.foldWins), '未摊牌赢下底池')}
        ${this.statCard('全下获胜', fmt(s.allInWins), '全下并赢下底池')}
        ${this.statCard('翻盘获胜', fmt(s.comebackWins), '10筹码以下起步')}
        ${this.statCard('在线手数', fmt(s.onlineHands), '在线匹配参与')}
        ${this.statCard('好友手数', fmt(s.friendHands), '好友房参与')}
        ${this.statCard('累计获得', fmt(s.totalChipsEarned), '生涯筹码收入')}
        ${this.statCard('游戏天数', fmt(s.daysPlayed), '有对局的自然日')}
        ${this.statCard('称号解锁', fmt((d.achievements || []).length), '含1-5星')}
      </div>
      <div class="career-card">
        <div class="career-card-head"><b>今日获取进度</b><span>每日上限</span></div>
        <div class="career-daily">
          ${this.dailyRow('好友房筹码', d.daily?.friendChips, d.daily?.friendChipCap, 'chip')}
          ${this.dailyRow('单机筹码', d.daily?.singleChips, d.daily?.singleChipCap, 'chip')}
          ${this.dailyRow('大厅筹码', d.daily?.lobbyChips, d.daily?.lobbyChipCap, 'chip')}
        </div>
      </div>
    `;
    this.el.panels.hands.innerHTML = `
      <div class="career-card">
        <div class="career-card-head"><b>获胜牌型</b><span>摊牌与弃牌获胜分开统计</span></div>
        <div class="career-hand-list">
          <div class="career-hand-row"><span>弃牌获胜</span><b>${fmt(s.foldWins)}</b><i><u style="width:${this.barWidth(s.foldWins, d.handTypes)}%"></u></i></div>
          ${HAND_TYPES.map((type) => `<div class="career-hand-row"><span>${type.name}</span><b>${fmt(d.handTypes?.[type.key])}</b><i><u style="width:${this.barWidth(d.handTypes?.[type.key], d.handTypes)}%"></u></i></div>`).join('')}
        </div>
      </div>
    `;
    const companions = d.companions || [];
    this.el.panels.friends.innerHTML = `
      <div class="career-card">
        <div class="career-card-head"><b>最常一起玩的玩家</b><span>亲密度最高 3 人</span></div>
        <div class="career-friends">${companions.length ? companions.map((p, i) => `
          <div class="career-friend">
            <span class="career-friend-rank">${i + 1}</span>
            <div><b>${escapeHtml(p.name || p.username)}</b><em>共同 ${p.hands} 手 · 共同获胜 ${p.winsTogether} 手</em></div>
            <strong>${p.intimacy}<small>亲密</small></strong>
          </div>`).join('') : '<p class="career-empty">还没有一起打牌的好友，去好友房约一局吧。</p>'}</div>
      </div>
    `;
    const unlocked = new Set(d.achievements || []);
    this.el.panels.titles.innerHTML = this.titlesHtml(d, unlocked);
    const ledger = d.chipLedger || [];
    this.el.panels.ledger.innerHTML = `
      <div class="career-card">
        <div class="career-card-head"><b>筹码记录</b><span>最近 ${ledger.length} 条</span></div>
        <div class="career-ledger">${ledger.length ? ledger.map((row) => `
          <div><span>${fmtTime(row.at)}</span><b class="${row.delta >= 0 ? 'plus' : 'minus'}">${row.delta >= 0 ? '+' : ''}${fmt(row.delta)}</b><em>${this.sourceName(row.source)}</em><strong>${fmt(row.balance)}</strong></div>`).join('') : '<p class="career-empty">暂无筹码变化记录。</p>'}</div>
      </div>
    `;
  }

  titlesHtml(d, unlocked) {
    const filter = this.titleFilter;
    let list = ACHIEVEMENTS.filter((item) => {
      if (this.titleStar && item.star !== this.titleStar) return false;
      if (filter === 'unlocked' && !unlocked.has(item.id)) return false;
      if (filter === 'online' && item.scope !== 'online') return false;
      if (filter === 'friend' && item.scope !== 'friend') return false;
      return true;
    });
    const pages = Math.max(1, Math.ceil(list.length / this.titlePageSize));
    this.titlePage = Math.min(this.titlePage, pages - 1);
    const pageItems = list.slice(this.titlePage * this.titlePageSize, (this.titlePage + 1) * this.titlePageSize);
    const filters = [['all','全部'],['unlocked','已解锁'],['online','在线限定'],['friend','好友房']];
    return `<div class="career-card">
      <div class="career-card-head"><b>称号墙</b><span>${ACHIEVEMENTS.length} 项 · 已解锁 ${unlocked.size}</span></div>
      <div class="career-title-filters">
        <div class="career-title-filter-row">${filters.map(([key,label]) => `<button type="button" data-career-title-filter="${key}" class="${this.titleFilter===key?'active':''}">${label}</button>`).join('')}</div>
        <div class="career-title-filter-row stars">${[0,1,2,3,4,5].map((n) => `<button type="button" data-career-star-filter="${n}" class="${this.titleStar===n?'active':''}">${n?`${'★'.repeat(n)}`:'全部星级'}</button>`).join('')}</div>
      </div>
      <div class="career-titles">${pageItems.map((item) => {
        const isUnlocked = unlocked.has(item.id);
        return `<button type="button" class="career-title star-${item.star}${isUnlocked ? ' unlocked' : ''}${d.activeTitle === item.id ? ' equipped' : ''}" ${isUnlocked ? `data-career-equip="${item.id}"` : 'disabled'}>
          <span>${isUnlocked ? '✦' : '◇'} <em class="career-stars">${'★'.repeat(item.star)}</em></span>
          <b>${isUnlocked ? escapeHtml(item.title) : (item.secret ? '？？？' : '未解锁')}</b>
          <em>${escapeHtml(item.category)} · ${isUnlocked ? escapeHtml(item.desc) : (item.secret ? '隐藏条件' : escapeHtml(item.desc))}</em>
          <small>+${item.rewardChips} 筹码</small>
        </button>`;
      }).join('')}</div>
      <div class="career-title-pager"><button type="button" class="adm-btn" data-career-title-page="-1" ${this.titlePage===0?'disabled':''}>上一页</button><span>第 ${this.titlePage+1} / ${pages} 页 · ${list.length} 项</span><button type="button" class="adm-btn" data-career-title-page="1" ${this.titlePage>=pages-1?'disabled':''}>下一页</button></div>
    </div>`;
  }

  renderTitles() {
    if (!this.root || !this.data) return;
    const unlocked = new Set(this.data.achievements || []);
    this.el.panels.titles.innerHTML = this.titlesHtml(this.data, unlocked);
  }

  statCard(label, value, note) {
    return `<div class="career-stat"><span>${label}</span><b>${value}</b><em>${note}</em></div>`;
  }

  dailyRow(label, value, cap, kind) {
    const v = Number(value) || 0;
    const c = Number(cap) || 1;
    return `<div class="career-daily-row"><div><span>${label}</span><b>${v} / ${c}</b></div><i><u style="width:${Math.min(100, (v / c) * 100)}%"></u></i></div>`;
  }

  barWidth(value, all) {
    const max = Math.max(1, ...Object.values(all || {}).map((n) => Number(n) || 0));
    return Math.max(2, Math.round((Number(value) || 0) / max * 100));
  }

  sourceName(source) {
    const map = {
      friend_win: '好友房获胜',
      friend_tie: '好友房打平',
      table_result: '牌桌结算',
      match_result: '在线匹配结算',
      single_play: '单机练习',
      lobby_stay: '大厅停留',
      title_reward: '称号解锁',
      five_star_reward: '五星荣耀奖励',
      five_star_share: '五星同庆',
      refill: '每小时补给',
      admin: '管理员调整',
      event: '活动奖励',
    };
    return map[source] || '其他';
  }

  async equipTitle(id) {
    try {
      const data = await this.account.request('/api/career/title', { method: 'POST', body: { title: id } });
      this.data = data.career;
      this.accountUI?.notifyAccount?.(data.account);
      this.render();
      this.hud?.toast?.('称号已装备', { kind: 'success', title: '生涯' });
    } catch (error) {
      this.hud?.toast?.(error.message || '装备失败', { kind: 'warn', title: '生涯' });
    }
  }

  showUnlock(event) {
    if (!event) return;
    this.ensureDom();
    const key = String(event.id || event.title || '');
    const now = Date.now();
    for (const [id, at] of this.unlockSeen) {
      if (now - at > 15000) this.unlockSeen.delete(id);
    }
    if (key && this.unlockSeen.has(key)) return;
    if (this.unlockQueue.length >= 3) return;
    if (key) this.unlockSeen.set(key, now);
    this.unlockQueue.push(event);
    if (!this.unlockActive) this.nextUnlock();
  }

  nextUnlock() {
    if (this.unlockActive || !this.unlockQueue.length) return;
    this.unlockActive = true;
    const event = this.unlockQueue.shift();
    const item = achievementFor(event.id || event.title);
    this.el.unlockTitle.textContent = item.title;
    this.el.unlockPlayer.textContent = `恭喜 ${event.playerName || this.data?.name || '玩家'}`;
    const star = Number(event.star || item.star) || 1;
    const reward = Number(event.reward ?? item.rewardChips) || 0;
    if (this.el.unlockStar) {
      this.el.unlockStar.textContent = `${'★'.repeat(star)} · +${reward} 筹码${event.share ? ` · 全场同庆 +${event.share}` : ''}`;
    }
    this.el.unlockQuote.textContent = item.quote;
    this.el.unlock.classList.remove('hidden');
    this.audio?.achievementUnlock?.();
    this.audio?.speakText?.(`恭喜${event.playerName || '玩家'}解锁称号${item.title}`);
    if (this.unlockTimer) clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => this.skipUnlock(), 4500);
  }

  skipUnlock() {
    if (this.unlockTimer) clearTimeout(this.unlockTimer);
    this.unlockTimer = null;
    this.el?.unlock?.classList.add('hidden');
    this.unlockActive = false;
    setTimeout(() => this.nextUnlock(), 350);
  }
}
