import { onlineBase } from './online.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function fmtTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function uptimeText(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s >= 86400) return `${Math.floor(s / 86400)}天 ${Math.floor((s % 86400) / 3600)}小时`;
  if (s >= 3600) return `${Math.floor(s / 3600)}小时 ${Math.floor((s % 3600) / 60)}分`;
  return `${Math.floor(s / 60)}分 ${s % 60}秒`;
}

const VIEW_META = {
  overview: ['概览', '服务器运行状态、在线人数与当前牌桌'],
  users: ['用户管理', '搜索、修改玩家资料或删除账户'],
  history: ['对局记录', '最近的对局与房间历史'],
  rooms: ['房间管理', '查看并关闭匹配房 / 好友房'],
  features: ['权限开关', '统一控制在线匹配、好友房和筹码补给'],
};

export class AdminConsole {
  constructor({ hud, account, scene }) {
    this.hud = hud;
    this.account = account;
    this.scene = scene;
    this.root = null;
    this.openState = false;
    this.view = 'overview';
    this.timer = null;
    this.users = { page: 1, total: 0, size: 20, q: '', cache: [], status: '', sort: 'createdAt', order: 'desc' };
    this.history = { page: 1, total: 0, size: 20 };
    this.features = { matchEnabled: true, lanEnabled: true, chipRefillMinutes: 60, chipGrant: 100 };
    this.editing = '';
    this.lastOverview = null;
  }

  get token() {
    return this.account?.token || '';
  }

  get allowed() {
    return Boolean(this.account?.account?.isAdmin && this.token);
  }

  async api(path, options = {}) {
    const method = options.method || 'GET';
    const base = onlineBase() || location.origin;
    const res = await fetch(`${base}/api/admin${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) {
      this.close();
      throw new Error('后台登录已失效，请重新用 admin 账号登录');
    }
    if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
    return data;
  }

  ensureDom() {
    if (this.root) return;
    const root = document.createElement('section');
    root.id = 'adminConsoleScreen';
    root.className = 'adm-screen hidden';
    root.setAttribute('aria-label', '后台管理');
    root.innerHTML = `
      <aside class="adm-side">
        <div class="adm-brand"><b>德扑<span>之夜</span></b><em>ADMIN CONSOLE</em></div>
        <nav class="adm-nav">
          ${Object.entries(VIEW_META).map(([key, meta]) => `<button type="button" data-adm-view="${key}" class="${key === 'overview' ? 'active' : ''}">${meta[0]}</button>`).join('')}
        </nav>
        <div class="adm-side-foot">
          <button type="button" class="adm-ghost" data-adm-refresh>刷新数据</button>
          <button type="button" class="adm-ghost" data-adm-close>返回游戏</button>
        </div>
      </aside>
      <main class="adm-main">
        <header class="adm-head">
          <div><h2 data-adm-title>概览</h2><p data-adm-sub>服务器运行状态、在线人数与当前牌桌</p></div>
          <div class="adm-head-actions">
            <span class="adm-live">● 5s 实时刷新</span>
            <button type="button" class="adm-icon" data-adm-close aria-label="关闭">×</button>
          </div>
        </header>
        <div class="adm-scroll">
          <section data-adm-section="overview">
            <div class="adm-stats" data-adm-stats></div>
            <div class="adm-card">
              <div class="adm-card-head"><b>当前房间</b><span data-adm-room-count></span></div>
              <div class="adm-table-wrap"><table><thead><tr><th>房间</th><th>类型</th><th>状态</th><th>在线 / 座位</th><th>操作</th></tr></thead><tbody data-adm-overview-rooms></tbody></table></div>
            </div>
            <div class="adm-card">
              <div class="adm-card-head"><b>在线玩家</b><span data-adm-online-count></span></div>
              <div class="adm-table-wrap"><table><thead><tr><th>玩家</th><th>状态</th><th>房间 / 座位</th><th>当前对局</th><th>最后活跃</th></tr></thead><tbody data-adm-online></tbody></table></div>
            </div>
            <div class="adm-card">
              <div class="adm-card-head"><b>进行中游戏</b><span data-adm-games-count></span></div>
              <div class="adm-table-wrap"><table><thead><tr><th>房间</th><th>类型</th><th>阶段</th><th>手数</th><th>在线玩家</th></tr></thead><tbody data-adm-games></tbody></table></div>
            </div>
            <div class="adm-card adm-ops-card">
              <div class="adm-card-head"><b>基础运维</b><span>服务器资源与连接</span></div>
              <div class="adm-ops" data-adm-ops></div>
            </div>
          </section>
          <section data-adm-section="users" class="hidden">
            <div class="adm-card">
              <div class="adm-card-head"><b>用户列表</b><div class="adm-toolbar"><input data-adm-search placeholder="搜索用户名 / 昵称" /><select data-adm-status><option value="">全部状态</option><option value="online">在线</option><option value="offline">离线</option></select><select data-adm-sort><option value="createdAt">注册时间</option><option value="lastSeen">最后活跃</option><option value="name">昵称</option><option value="username">用户名</option><option value="chips">筹码</option><option value="points">积分</option><option value="plays">游玩次数</option><option value="rounds">对局</option></select><button type="button" class="adm-btn" data-adm-order>降序</button><button type="button" class="adm-btn" data-adm-search-btn>搜索</button></div></div>
              <div class="adm-table-wrap"><table><thead><tr><th>用户名</th><th>昵称</th><th>积分</th><th>筹码</th><th>对局</th><th>在线状态</th><th>当前房间</th><th>最后活跃</th><th>注册时间</th><th>操作</th></tr></thead><tbody data-adm-users></tbody></table></div>
              <div class="adm-pager"><span data-adm-users-page></span><button type="button" class="adm-btn" data-adm-users-prev>上一页</button><button type="button" class="adm-btn" data-adm-users-next>下一页</button></div>
            </div>
          </section>
          <section data-adm-section="history" class="hidden">
            <div class="adm-card">
              <div class="adm-card-head"><b>对局记录</b><span>最近 500 场</span></div>
              <div class="adm-table-wrap"><table><thead><tr><th>房间</th><th>类型</th><th>开始</th><th>结束</th><th>手数</th><th>玩家</th><th>结束原因</th></tr></thead><tbody data-adm-history></tbody></table></div>
              <div class="adm-pager"><span data-adm-history-page></span><button type="button" class="adm-btn" data-adm-history-prev>上一页</button><button type="button" class="adm-btn" data-adm-history-next>下一页</button></div>
            </div>
          </section>
          <section data-adm-section="rooms" class="hidden">
            <div class="adm-card">
              <div class="adm-card-head"><b>房间管理</b><span>关闭后房间会被重置</span></div>
              <div class="adm-table-wrap"><table><thead><tr><th>房间</th><th>类型</th><th>状态</th><th>在线 / 座位</th><th>操作</th></tr></thead><tbody data-adm-rooms></tbody></table></div>
            </div>
          </section>
          <section data-adm-section="features" class="hidden">
            <div class="adm-card">
              <div class="adm-card-head"><b>在线权限开关</b><span>对所有用户即时生效</span></div>
              <div class="adm-features">
                <label class="adm-feature master"><span><b>在线游戏总开关</b><em>关闭后只保留单机模式，已开局对局不受影响</em></span><input type="checkbox" data-adm-feature="online" /><i></i></label>
                <label class="adm-feature"><span><b>在线快速匹配</b><em>控制玩家是否可以进入匹配房</em></span><input type="checkbox" data-adm-feature="match" /><i></i></label>
                <label class="adm-feature"><span><b>好友房 / 局域网</b><em>控制创建和加入好友房</em></span><input type="checkbox" data-adm-feature="lan" /><i></i></label>
                <div class="adm-feature-inputs">
                  <label><em>筹码补给间隔（分钟）</em><input type="number" min="1" max="1440" step="1" data-adm-feature="refill" /></label>
                  <label><em>补足目标</em><input type="number" min="1" max="100" step="1" data-adm-feature="grant" /></label>
                  <button type="button" class="adm-btn primary" data-adm-save-features>保存权限</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <div class="adm-modal hidden" data-adm-user-modal>
        <form class="adm-modal-card" data-adm-user-form>
          <div class="adm-card-head"><b data-adm-user-title>编辑用户</b><button type="button" class="adm-icon" data-adm-user-cancel>×</button></div>
          <div class="adm-modal-body">
            <label class="adm-field"><em>昵称</em><input data-adm-edit="name" /></label>
            <div class="adm-grid2">
              <label class="adm-field"><em>积分</em><input type="number" min="0" data-adm-edit="points" /></label>
              <label class="adm-field"><em>筹码</em><input type="number" min="0" data-adm-edit="chips" /></label>
            </div>
            <label class="adm-field"><em>重置密码（留空不改）</em><input type="password" autocomplete="new-password" data-adm-edit="password" /></label>
            <p class="adm-error" data-adm-user-error></p>
          </div>
          <div class="adm-modal-foot"><button type="button" class="adm-btn" data-adm-user-cancel>取消</button><button type="submit" class="adm-btn primary">保存</button></div>
        </form>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.el = {
      title: root.querySelector('[data-adm-title]'),
      sub: root.querySelector('[data-adm-sub]'),
      stats: root.querySelector('[data-adm-stats]'),
      overviewRooms: root.querySelector('[data-adm-overview-rooms]'),
      roomCount: root.querySelector('[data-adm-room-count]'),
      ops: root.querySelector('[data-adm-ops]'),
      users: root.querySelector('[data-adm-users]'),
      usersPage: root.querySelector('[data-adm-users-page]'),
      history: root.querySelector('[data-adm-history]'),
      historyPage: root.querySelector('[data-adm-history-page]'),
      rooms: root.querySelector('[data-adm-rooms]'),
      online: root.querySelector('[data-adm-online]'),
      onlineCount: root.querySelector('[data-adm-online-count]'),
      games: root.querySelector('[data-adm-games]'),
      gamesCount: root.querySelector('[data-adm-games-count]'),
      statusFilter: root.querySelector('[data-adm-status]'),
      sortSelect: root.querySelector('[data-adm-sort]'),
      orderBtn: root.querySelector('[data-adm-order]'),
      search: root.querySelector('[data-adm-search]'),
      userModal: root.querySelector('[data-adm-user-modal]'),
      userTitle: root.querySelector('[data-adm-user-title]'),
      userError: root.querySelector('[data-adm-user-error]'),
      edit: {
        name: root.querySelector('[data-adm-edit="name"]'),
        points: root.querySelector('[data-adm-edit="points"]'),
        chips: root.querySelector('[data-adm-edit="chips"]'),
        password: root.querySelector('[data-adm-edit="password"]'),
      },
    };
    this.bind();
  }

  bind() {
    const root = this.root;
    root.querySelectorAll('[data-adm-view]').forEach((btn) => {
      btn.addEventListener('click', () => this.setView(btn.dataset.admView));
    });
    root.querySelectorAll('[data-adm-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });
    root.querySelector('[data-adm-refresh]')?.addEventListener('click', () => this.refresh(true));
    root.querySelector('[data-adm-search-btn]')?.addEventListener('click', () => {
      this.users.page = 1;
      this.users.q = this.el.search.value.trim();
      this.loadUsers().catch((e) => this.toast(e.message));
    });
    this.el.search?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.users.page = 1;
      this.users.q = this.el.search.value.trim();
      this.loadUsers().catch((e) => this.toast(e.message));
    });
    const reloadUsers = () => {
      this.users.page = 1;
      this.loadUsers().catch((e) => this.toast(e.message));
    };
    this.el.statusFilter?.addEventListener('change', () => {
      this.users.status = this.el.statusFilter.value;
      reloadUsers();
    });
    this.el.sortSelect?.addEventListener('change', () => {
      this.users.sort = this.el.sortSelect.value;
      reloadUsers();
    });
    this.el.orderBtn?.addEventListener('click', () => {
      this.users.order = this.users.order === 'asc' ? 'desc' : 'asc';
      this.el.orderBtn.textContent = this.users.order === 'asc' ? '升序' : '降序';
      reloadUsers();
    });
    root.querySelector('[data-adm-users-prev]')?.addEventListener('click', () => {
      this.users.page = Math.max(1, this.users.page - 1);
      this.loadUsers().catch((e) => this.toast(e.message));
    });
    root.querySelector('[data-adm-users-next]')?.addEventListener('click', () => {
      this.users.page += 1;
      this.loadUsers().catch((e) => this.toast(e.message));
    });
    root.querySelector('[data-adm-history-prev]')?.addEventListener('click', () => {
      this.history.page = Math.max(1, this.history.page - 1);
      this.loadHistory().catch((e) => this.toast(e.message));
    });
    root.querySelector('[data-adm-history-next]')?.addEventListener('click', () => {
      this.history.page += 1;
      this.loadHistory().catch((e) => this.toast(e.message));
    });
    root.querySelector('[data-adm-save-features]')?.addEventListener('click', () => this.saveFeatures().catch((e) => this.toast(e.message)));
    root.querySelectorAll('[data-adm-user-cancel]').forEach((btn) => btn.addEventListener('click', () => this.closeUserModal()));
    root.querySelector('[data-adm-user-form]')?.addEventListener('submit', (event) => this.saveUser(event));
    root.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-adm-edit-user]');
      if (edit) { this.openUserModal(edit.dataset.admEditUser); return; }
      const del = event.target.closest('[data-adm-del-user]');
      if (del) { this.deleteUser(del.dataset.admDelUser); return; }
      const closeRoom = event.target.closest('[data-adm-close-room]');
      if (closeRoom) this.closeRoom(closeRoom.dataset.admCloseRoom);
    });
    document.addEventListener('keydown', (event) => {
      if (!this.openState) return;
      if (event.key === 'Escape') {
        if (!this.el.userModal.classList.contains('hidden')) this.closeUserModal();
        else this.close();
      }
    });
  }

  async open() {
    if (!this.allowed) {
      this.toast('当前账号没有后台管理权限');
      return;
    }
    this.ensureDom();
    this.closeUserModal();
    this.openState = true;
    if (this.scene) this.scene.paused = true;
    this.root.classList.remove('hidden');
    document.body.classList.add('adm-open');
    this.hud?.closeVoicePanel?.();
    try {
      await this.refresh(true);
    } catch (error) {
      this.toast(error.message || '后台加载失败');
    }
    this.startPoll();
  }

  close() {
    this.openState = false;
    this.stopPoll();
    this.root?.classList.add('hidden');
    document.body.classList.remove('adm-open');
    if (this.scene) this.scene.paused = false;
  }

  startPoll() {
    this.stopPoll();
    this.timer = setInterval(() => {
      if (!this.openState || document.hidden) return;
      if (this.view === 'overview' || this.view === 'rooms') {
        this.loadOverview().catch(() => {});
      }
    }, 5000);
  }

  stopPoll() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  toast(message) {
    this.hud?.toast?.(message, { kind: 'warn', title: '后台管理' });
  }

  async setView(view) {
    if (!VIEW_META[view]) return;
    this.view = view;
    const root = this.root;
    Object.keys(VIEW_META).forEach((key) => {
      root.querySelectorAll(`[data-adm-view="${key}"]`).forEach((b) => b.classList.toggle('active', key === view));
      root.querySelector(`[data-adm-section="${key}"]`)?.classList.toggle('hidden', key !== view);
    });
    this.el.title.textContent = VIEW_META[view][0];
    this.el.sub.textContent = VIEW_META[view][1];
    try {
      if (view === 'overview' || view === 'rooms') await this.loadOverview();
      if (view === 'users') await this.loadUsers();
      if (view === 'history') await this.loadHistory();
      if (view === 'features') await this.loadFeatures();
    } catch (error) {
      this.toast(error.message);
    }
  }

  async refresh(force) {
    if (this.view === 'overview' || this.view === 'rooms') await this.loadOverview();
    else if (this.view === 'users') await this.loadUsers();
    else if (this.view === 'history') await this.loadHistory();
    else if (this.view === 'features') await this.loadFeatures();
    if (force) this.hud?.toast?.('后台数据已刷新', { kind: 'success', title: '后台管理' });
  }

  async loadOverview() {
    const data = await this.api('/overview');
    this.lastOverview = data;
    const uptime = uptimeText(data.uptime);
    const stats = [
      ['注册用户', data.users, `在线账号 ${data.onlineUsers}`],
      ['在线玩家', data.onlinePlayers ?? 0, `房间 ${data.onlineRoomPlayers ?? 0} · 大厅 ${data.onlineLobby ?? 0}`],
      ['进行中游戏', data.activeGames ?? 0, `房间 ${data.rooms.length} · 观战 ${data.spectators ?? 0}`],
      ['服务器连接', data.connections ?? 0, `运行 ${uptime}`],
      ['服务器内存', `${data.memoryMb ?? 0} MB`, 'Node 进程 RSS'],
      ['累计对局', data.todayRounds, `历史 ${data.history} 条`],
    ];
    this.el.stats.innerHTML = stats.map(([label, value, note]) => `<div class="adm-stat"><em>${escapeHtml(label)}</em><b>${escapeHtml(value)}</b><small>${escapeHtml(note)}</small></div>`).join('');
    this.el.roomCount.textContent = `${data.rooms.length} 个房间`;

    const online = Array.isArray(data.onlineList) ? data.onlineList : [];
    this.el.onlineCount.textContent = `${online.length} 人在线`;
    this.el.online.innerHTML = online.length
      ? online.map((item) => {
        const where = item.inRoom
          ? `${escapeHtml(item.roomCode || '')}${item.seatNo >= 0 ? ` · ${item.seatNo + 1}号位` : ''}${item.spectator ? ' · 观战' : ''}`
          : '大厅';
        const phase = item.inRoom
          ? `${escapeHtml(item.phase || '等待')}${item.hand ? ` · 第${item.hand}手` : ''}`
          : '—';
        return `<tr>
          <td><b>${escapeHtml(item.name || item.username)}</b> <small class="adm-user-main">@${escapeHtml(item.username)}</small></td>
          <td><span class="adm-pill on">在线</span></td>
          <td>${where}</td>
          <td>${phase}</td>
          <td>${escapeHtml(fmtTime(item.lastSeen))}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="5" class="adm-empty">当前没有在线玩家</td></tr>';

    const games = Array.isArray(data.games) ? data.games : [];
    this.el.gamesCount.textContent = `${games.length} 局进行中`;
    this.el.games.innerHTML = games.length
      ? games.map((game) => `<tr>
        <td>${escapeHtml(game.name || game.code)} <span class="adm-chip">${escapeHtml(game.code)}</span></td>
        <td>${game.match ? '匹配房' : '好友房'}</td>
        <td>${escapeHtml(game.phase || '进行中')}${game.hand ? ` · 第${game.hand}手` : ''}</td>
        <td class="num">${game.hand || 0}</td>
        <td>${(game.players || []).map((name) => escapeHtml(name)).join('、') || '—'}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="adm-empty">当前没有进行中的游戏</td></tr>';

    const rows = data.rooms.map((room) => this.roomRow(room)).join('');
    const empty = '<tr><td colspan="5" class="adm-empty">当前没有在线房间</td></tr>';
    this.el.overviewRooms.innerHTML = rows || empty;
    this.el.rooms.innerHTML = rows || empty;
    this.el.ops.innerHTML = `
      <div><span>运行时长</span><b>${escapeHtml(uptime)}</b></div>
      <div><span>Node 进程内存</span><b>${data.memoryMb ?? 0} MB</b></div>
      <div><span>SSE 连接</span><b>${data.connections ?? 0}</b></div>
      <div><span>未结束历史</span><b>${data.openHistory ?? 0}</b></div>
      <div><span>服务器时间</span><b>${data.serverTime ? new Date(data.serverTime).toLocaleString('zh-CN', { hour12: false }) : '—'}</b></div>
      <div><span>管理端</span><b>${data.adminConfigured ? '已配置' : '未配置'}</b></div>`;
    this.renderFeaturesFromData(data);
  }

  roomRow(room) {
    const names = Array.isArray(room.playerNames) ? room.playerNames.join('、') : '';
    return `<tr>
      <td>${escapeHtml(room.name || room.code)} <span class="adm-chip">${escapeHtml(room.code)}</span>${names ? `<small class="adm-user-main">${escapeHtml(names)}</small>` : ''}</td>
      <td>${room.match ? '匹配房' : '好友房'}</td>
      <td>${room.started ? '<span class="adm-pill run">已开局</span>' : '<span class="adm-pill">等待中</span>'}${room.phase ? ` <small class="adm-user-main">${escapeHtml(room.phase)}</small>` : ''}</td>
      <td class="num">${room.online} / ${room.seats}</td>
      <td><button type="button" class="adm-btn danger" data-adm-close-room="${escapeHtml(room.code)}">关闭</button></td>
    </tr>`;
  }

  async loadUsers() {
    const query = new URLSearchParams({
      page: String(this.users.page),
      q: this.users.q,
      status: this.users.status || '',
      sort: this.users.sort || 'createdAt',
      order: this.users.order || 'desc',
    });
    const data = await this.api(`/users?${query.toString()}`);
    this.users.total = data.total;
    this.users.size = data.size;
    this.users.cache = data.users || [];
    this.el.users.innerHTML = this.users.cache.length
      ? this.users.cache.map((user) => {
        const where = user.inRoom
          ? `${escapeHtml(user.roomCode || '')}${user.seatNo >= 0 ? ` · ${user.seatNo + 1}号位` : ''}${user.spectator ? ' · 观战' : ''}`
          : (user.online ? '大厅' : '—');
        return `<tr>
          <td><b>${escapeHtml(user.username)}</b></td><td>${escapeHtml(user.name)}</td>
          <td class="num">${user.points}</td><td class="num">${user.chips}</td><td class="num">${user.rounds}</td>
          <td>${user.online ? '<span class="adm-pill on">在线</span>' : '<span class="adm-pill">离线</span>'}</td>
          <td>${where}</td><td>${user.lastSeen ? escapeHtml(fmtTime(user.lastSeen)) : '—'}</td>
          <td>${escapeHtml(fmtTime(user.createdAt))}</td>
          <td><button type="button" class="adm-btn" data-adm-edit-user="${escapeHtml(user.username)}">编辑</button>
          <button type="button" class="adm-btn danger" data-adm-del-user="${escapeHtml(user.username)}">删除</button></td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="10" class="adm-empty">没有匹配用户</td></tr>';
    this.el.usersPage.textContent = `第 ${this.users.page} 页 / 共 ${this.users.total} 人 · 在线 ${data.onlineCount ?? 0} / 离线 ${data.offlineCount ?? 0}`;
  }

  async loadHistory() {
    const data = await this.api(`/history?page=${this.history.page}`);
    this.history.total = data.total;
    this.el.history.innerHTML = data.history.length
      ? data.history.map((item) => `<tr>
          <td>${escapeHtml(item.name || item.code)} <span class="adm-chip">${escapeHtml(item.code)}</span></td>
          <td>${item.match ? '匹配房' : '好友房'}</td>
          <td>${fmtTime(item.startedAt)}</td>
          <td>${item.endedAt ? fmtTime(item.endedAt) : '<span class="adm-pill run">进行中</span>'}</td>
          <td class="num">${item.hands || 0}</td>
          <td>${Array.isArray(item.players) ? item.players.map((p) => escapeHtml(p.name || p)).join('、') : (item.players || '')}</td>
          <td>${escapeHtml(item.reason || '—')}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="adm-empty">暂无对局记录</td></tr>';
    this.el.historyPage.textContent = `第 ${this.history.page} 页 / 共 ${this.history.total} 条`;
  }

  renderFeaturesFromData(data) {
    this.features = data.features || this.features;
    this.renderFeatures();
  }

  async loadFeatures() {
    const data = await this.api('/features');
    this.features = data.features || this.features;
    this.renderFeatures();
  }

  renderFeatures() {
    const f = this.features;
    const online = f.matchEnabled !== false && f.lanEnabled !== false;
    this.root.querySelector('[data-adm-feature="online"]').checked = online;
    this.root.querySelector('[data-adm-feature="match"]').checked = f.matchEnabled !== false;
    this.root.querySelector('[data-adm-feature="lan"]').checked = f.lanEnabled !== false;
    this.root.querySelector('[data-adm-feature="refill"]').value = f.chipRefillMinutes || 60;
    this.root.querySelector('[data-adm-feature="grant"]').value = f.chipGrant || 100;
  }

  async saveFeatures() {
    const body = {
      onlineEnabled: this.root.querySelector('[data-adm-feature="online"]').checked,
      matchEnabled: this.root.querySelector('[data-adm-feature="match"]').checked,
      lanEnabled: this.root.querySelector('[data-adm-feature="lan"]').checked,
      chipRefillMinutes: Number(this.root.querySelector('[data-adm-feature="refill"]').value) || 60,
      chipGrant: Number(this.root.querySelector('[data-adm-feature="grant"]').value) || 100,
    };
    const data = await this.api('/features', { method: 'POST', body });
    this.features = data.features || this.features;
    this.renderFeatures();
    this.hud?.toast?.('权限设置已保存', { kind: 'success', title: '后台管理' });
  }

  openUserModal(username) {
    const user = this.users.cache.find((item) => item.username === username);
    if (!user) return;
    this.editing = username;
    this.el.userTitle.textContent = `编辑用户 · ${username}`;
    this.el.edit.name.value = user.name || '';
    this.el.edit.points.value = user.points;
    this.el.edit.chips.value = user.chips;
    this.el.edit.password.value = '';
    this.el.userError.textContent = '';
    this.el.userModal.classList.remove('hidden');
  }

  closeUserModal() {
    this.el?.userModal?.classList.add('hidden');
    this.editing = '';
  }

  async saveUser(event) {
    event.preventDefault();
    if (!this.editing) return;
    const editing = this.editing;
    this.el.userError.textContent = '';
    try {
      await this.api('/users/update', {
        method: 'POST',
        body: {
          username: editing,
          name: this.el.edit.name.value.trim(),
          points: Number(this.el.edit.points.value) || 0,
          chips: Number(this.el.edit.chips.value) || 0,
          password: this.el.edit.password.value.trim() || undefined,
        },
      });
      this.closeUserModal();
      await this.loadUsers();
      this.hud?.toast?.(`用户 ${editing} 已保存`, { kind: 'success', title: '后台管理' });
    } catch (error) {
      this.el.userError.textContent = error.message;
    }
  }

  async deleteUser(username) {
    if (!username) return;
    if (!window.confirm(`确定删除用户 ${username}？该操作不可恢复。`)) return;
    try {
      await this.api('/users/delete', { method: 'POST', body: { username } });
      await this.loadUsers();
      this.hud?.toast?.('用户已删除', { kind: 'success', title: '后台管理' });
    } catch (error) { this.toast(error.message); }
  }

  async closeRoom(code) {
    if (!code) return;
    if (!window.confirm(`关闭房间 ${code}？在线玩家会回到房间等待。`)) return;
    try {
      await this.api('/rooms/close', { method: 'POST', body: { code } });
      await this.loadOverview();
      this.hud?.toast?.(`房间 ${code} 已关闭`, { kind: 'success', title: '后台管理' });
    } catch (error) { this.toast(error.message); }
  }
}
