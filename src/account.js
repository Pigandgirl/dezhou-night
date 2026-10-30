import { onlineBase } from './online.js';
import { audio } from './audio.js';
import { escapeHtml } from './util.js';
import { achievementFor } from './career-data.js';

function chipIntervalLabel(minutes) {
  const value = Math.max(1, Number(minutes) || 60);
  return value % 60 === 0 ? `${value / 60} 小时` : `${value} 分钟`;
}

export class AccountService {
  constructor() {
    this.token = '';
    this.account = null;
    try {
      this.token = localStorage.getItem('pokerToken') || '';
    } catch {
      this.token = '';
    }
  }

  get loggedIn() {
    return Boolean(this.token && this.account);
  }

  get chips() {
    return this.account ? Number(this.account.chips) || 0 : 0;
  }

  async request(path, { method = 'GET', body, auth = true } = {}) {
    const base = onlineBase();
    const payload = body ? { ...body } : {};
    if (auth && this.token && payload.token === undefined) payload.token = this.token;
    const headers = { 'Content-Type': 'application/json' };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(payload),
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

  setSession(data) {
    this.token = data.token || '';
    this.account = data.account || null;
    try {
      localStorage.setItem('pokerToken', this.token);
    } catch {
      /* 存储不可用时忽略 */
    }
  }

  clearSession() {
    this.token = '';
    this.account = null;
    try {
      localStorage.removeItem('pokerToken');
    } catch {
      /* 忽略 */
    }
  }

  async boot() {
    if (!this.token) return false;
    try {
      const data = await this.request('/api/auth/me');
      this.account = data.account || null;
      return Boolean(this.account);
    } catch {
      this.clearSession();
      return false;
    }
  }

  async register(username, password, name) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: { username, password, name },
      auth: false,
    });
    this.setSession(data);
    return this.account;
  }

  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password },
      auth: false,
    });
    this.setSession(data);
    return this.account;
  }

  async logout() {
    if (this.token) {
      try {
        await this.request('/api/auth/logout', { method: 'POST', auth: false, body: { token: this.token } });
      } catch {
        /* 忽略 */
      }
    }
    this.clearSession();
  }

  async refresh() {
    if (!this.token) return null;
    const data = await this.request('/api/auth/me');
    this.account = data.account || this.account;
    return this.account;
  }

  async updateNickname(name) {
    const data = await this.request('/api/account/nickname', {
      method: 'POST',
      body: { name },
    });
    this.account = data.account || this.account;
    return this.account;
  }

  async leaderboard() {
    return this.request('/api/leaderboard');
  }

  async matchRooms() {
    return this.request('/api/match/rooms');
  }

  async openRooms() {
    return this.request('/api/rooms/open', { auth: false });
  }

  async features() {
    return this.request('/api/features', { auth: false });
  }

  async quickMatch() {
    return this.request('/api/match/quick', { method: 'POST', body: {}, auth: false });
  }

  async joinMatch(code) {
    return this.request('/api/match/join', { method: 'POST', body: { code }, auth: false });
  }
}

function maskHandle(value) {
  const handle = String(value || '');
  if (/^\d{7,}$/.test(handle)) {
    return `${handle.slice(0, 3)}****${handle.slice(-4)}`;
  }
  return handle;
}

const LEADER_TABS = [
  { key: 'chips', label: '筹码榜', unit: '筹码' },
];

export class AccountUI {
  constructor({ service, toast, onChange, onOpenHelp, onBeforeLogin }) {
    this.service = service;
    this.toast = toast;
    this.onChange = onChange;
    this.onOpenHelp = onOpenHelp;
    this.onBeforeLogin = onBeforeLogin;
    this.mode = 'login';
    this.loginDismissed = false;
    this.leaderTab = 'chips';

    this.el = {
      loginOverlay: document.getElementById('loginOverlay'),
      loginTitle: document.getElementById('loginTitle'),
      loginUser: document.getElementById('loginUser'),
      loginPass: document.getElementById('loginPass'),
      loginName: document.getElementById('loginName'),
      loginNameLabel: document.getElementById('loginNameLabel'),
      loginError: document.getElementById('loginError'),
      loginSubmit: document.getElementById('btnLoginSubmit'),
      loginSkip: document.getElementById('btnLoginSkip'),
      loginTabs: document.querySelectorAll('.login-tab'),

      leaderModal: document.getElementById('leaderModal'),
      leaderTabs: document.getElementById('leaderTabs'),
      leaderList: document.getElementById('leaderList'),
      leaderHonor: document.getElementById('leaderHonor'),
      btnLeaderClose: document.getElementById('btnLeaderClose'),

      lobbySettings: document.getElementById('lobbySettingsModal'),
      lobbyProfile: document.getElementById('lobbyProfile'),
      btnLobbySettingsClose: document.getElementById('btnLobbySettingsClose'),
      btnLobbySettingsBack: document.getElementById('btnLobbySettingsBack'),
      btnLobbyLogin: document.getElementById('btnLobbyLogin'),
      btnLobbyNickname: document.getElementById('btnLobbyNickname'),
      btnLobbyLeaderboard: document.getElementById('btnLobbyLeaderboard'),
      btnLobbyHelp: document.getElementById('btnLobbyHelp'),
      btnLobbyExit: document.getElementById('btnLobbyExit'),
      btnLobbyLogout: document.getElementById('btnLobbyLogout'),
      btnPlayerChip: document.getElementById('btnPlayerChip'),

      nicknameModal: document.getElementById('nicknameModal'),
      nicknameInput: document.getElementById('nicknameInput'),
      nicknameError: document.getElementById('nicknameError'),
      btnNicknameCancel: document.getElementById('btnNicknameCancel'),
      btnNicknameSave: document.getElementById('btnNicknameSave'),
      lobbySetMusic: document.getElementById('lobbySetMusic'),
      lobbySetSfx: document.getElementById('lobbySetSfx'),
      lobbySetVoice: document.getElementById('lobbySetVoice'),
      lobbySetLowMotion: document.getElementById('lobbySetLowMotion'),
      lobbyVoiceProfile: document.getElementById('lobbyVoiceProfile'),

      playerName: document.getElementById('playerName'),
      playerLevel: document.getElementById('playerLevel'),
      playerAvatar: document.getElementById('playerAvatar'),
      resChips: document.getElementById('resChips'),
    };

    this.exitArmed = false;
    this.exitTimer = null;
    this.init();
  }

  init() {
    this.el.loginTabs.forEach((tab) => {
      tab.addEventListener('click', () => this.setLoginMode(tab.dataset.tab));
    });
    this.el.loginSubmit.addEventListener('click', () => this.submitLogin());
    this.el.loginUser.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submitLogin();
    });
    this.el.loginPass.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submitLogin();
    });
    this.el.loginSkip.addEventListener('click', () => this.closeLogin());

    this.el.btnLeaderClose.addEventListener('click', () => this.el.leaderModal.classList.add('hidden'));
    this.el.leaderTabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');
      if (!button) return;
      this.leaderTab = button.dataset.tab;
      this.el.leaderTabs.querySelectorAll('button').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      this.renderLeaderboard();
    });

    if (this.el.btnLobbySettingsClose) {
      this.el.btnLobbySettingsClose.addEventListener('click', () => this.closeSettings());
    }
    if (this.el.btnLobbySettingsBack) {
      this.el.btnLobbySettingsBack.addEventListener('click', () => this.closeSettings());
    }
    this.bindLobbyAudio('lobbySetMusic', 'setMusic');
    this.bindLobbyAudio('lobbySetSfx', 'setSfx');
    this.bindLobbyAudio('lobbySetVoice', 'setVoice');
    this.bindLobbyAudio('lobbySetLowMotion', 'optLowMotion');
    if (this.el.lobbyVoiceProfile) {
      this.el.lobbyVoiceProfile.value = audio.voiceProfile;
      this.el.lobbyVoiceProfile.addEventListener('change', () => {
        audio.setVoiceProfile(this.el.lobbyVoiceProfile.value);
      });
    }
    if (this.el.btnLobbyLogin) {
      this.el.btnLobbyLogin.addEventListener('click', () => this.openLogin('login'));
    }
    if (this.el.btnPlayerChip) {
      this.el.btnPlayerChip.addEventListener('click', () => {
        // 游客直接弹登录；已登录才进入资料/设置
        if (this.service.loggedIn) this.openSettings();
        else this.openLogin('login');
      });
    }
    if (this.el.btnLobbyHelp) {
      this.el.btnLobbyHelp.addEventListener('click', () => {
        if (this.onOpenHelp) this.onOpenHelp();
        else document.getElementById('btnSettingsHelp')?.click();
      });
    }
    if (this.el.btnLobbyNickname) {
      this.el.btnLobbyNickname.addEventListener('click', () => this.openNickname());
    }
    if (this.el.btnLobbyLeaderboard) {
      this.el.btnLobbyLeaderboard.addEventListener('click', () => {
        this.closeSettings();
        this.openLeaderboard();
      });
    }
    if (this.el.btnLobbyExit) {
      this.el.btnLobbyExit.addEventListener('click', () => this.exitGame());
    }
    if (this.el.btnNicknameCancel) {
      this.el.btnNicknameCancel.addEventListener('click', () => this.closeNickname());
    }
    if (this.el.btnNicknameSave) {
      this.el.btnNicknameSave.addEventListener('click', () => this.submitNickname());
    }
    if (this.el.nicknameInput) {
      this.el.nicknameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this.submitNickname();
      });
    }
    if (this.el.btnLobbyLogout) {
      this.el.btnLobbyLogout.addEventListener('click', async () => {
        await this.logout();
        this.closeSettings();
      });
    }

    [this.el.loginOverlay, this.el.leaderModal, this.el.lobbySettings, this.el.nicknameModal].forEach((modal) => {
      if (!modal) return;
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          if (modal === this.el.loginOverlay) this.closeLogin();
          else modal.classList.add('hidden');
        }
      });
    });
  }

  resetExitConfirm() {
    if (this.exitTimer) {
      clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    this.exitArmed = false;
    const button = this.el.btnLobbyExit;
    if (!button) return;
    button.classList.remove('confirming');
    const title = button.querySelector('b');
    const note = button.querySelector('em');
    if (title) title.textContent = '退出游戏';
    if (note) note.textContent = '关闭应用';
  }

  exitGame() {
    const button = this.el.btnLobbyExit;
    // 退出放在设置里，并且必须点两次确认，避免误触直接退出。
    if (!this.exitArmed) {
      this.exitArmed = true;
      if (button) {
        button.classList.add('confirming');
        const title = button.querySelector('b');
        const note = button.querySelector('em');
        if (title) title.textContent = '再点一次确认退出';
        if (note) note.textContent = '3 秒内再次点击才会退出';
      }
      if (this.exitTimer) clearTimeout(this.exitTimer);
      this.exitTimer = setTimeout(() => this.resetExitConfirm(), 3000);
      return;
    }
    this.resetExitConfirm();
    if (window.NativeBridge && typeof window.NativeBridge.exitApp === 'function') {
      window.NativeBridge.exitApp();
      return;
    }
    this.toast('网页版直接关闭浏览器标签页即可退出');
  }

  setLoginMode(mode) {
    this.mode = mode === 'register' ? 'register' : 'login';
    this.el.loginTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === this.mode);
    });
    this.el.loginTitle.textContent = this.mode === 'register' ? '注册账户' : '登录账户';
    this.el.loginName.classList.toggle('hidden', this.mode !== 'register');
    if (this.el.loginNameLabel) this.el.loginNameLabel.classList.toggle('hidden', this.mode !== 'register');
    this.el.loginSubmit.textContent = this.mode === 'register' ? '注册并登录' : '登录';
    this.el.loginError.textContent = '';
  }

  openLogin(mode = 'login') {
    this.loginDismissed = false;
    // 登录弹窗必须在设置页之上：先关掉大厅设置/HUD 设置，避免用户还要手动关设置
    this.closeSettings();
    this.el.leaderModal?.classList.add('hidden');
    this.el.nicknameModal?.classList.add('hidden');
    const hudSettings = document.getElementById('settingsModal');
    if (hudSettings) hudSettings.classList.add('hidden');
    if (this.onBeforeLogin) this.onBeforeLogin();
    this.setLoginMode(mode);
    this.el.loginPass.value = '';
    this.el.loginError.textContent = '';
    this.el.loginOverlay.classList.remove('hidden');
    setTimeout(() => this.el.loginUser.focus(), 60);
  }

  closeLogin() {
    this.loginDismissed = true;
    this.el.loginOverlay.classList.add('hidden');
  }

  async submitLogin() {
    const username = this.el.loginUser.value.trim();
    const password = this.el.loginPass.value;
    const name = this.el.loginName.value.trim();
    this.el.loginError.textContent = '';
    if (!/^[\w\u4e00-\u9fa5]{3,16}$/.test(username)) {
      this.el.loginError.textContent = '用户名需为 3-16 位字母、数字、下划线或中文';
      return;
    }
    if (password.length < 6) {
      this.el.loginError.textContent = '密码至少 6 位';
      return;
    }
    if (this.mode === 'register' && (name.length < 1 || name.length > 12)) {
      this.el.loginError.textContent = '昵称需 1-12 个字符';
      return;
    }
    if (this.mode === 'register' && name === password) {
      this.el.loginError.textContent = '昵称不能与密码相同';
      return;
    }
    if (this.mode === 'register' && name.toLowerCase() === username.toLowerCase()) {
      this.el.loginError.textContent = '昵称不能与用户名相同';
      return;
    }
    if (this.mode === 'register' && /^\d{7,}$/.test(name)) {
      this.el.loginError.textContent = '昵称不要使用手机号';
      return;
    }
    this.el.loginSubmit.disabled = true;
    try {
      if (this.mode === 'register') await this.service.register(username, password, name);
      else await this.service.login(username, password);
      this.el.loginPass.value = '';
      this.closeLogin();
      this.renderAccount();
      this.toast(this.mode === 'register' ? '注册成功，赠送 100 筹码' : `欢迎回来，${this.service.account.name}`);
      if (this.onChange) this.onChange(this.service.account);
    } catch (error) {
      this.el.loginError.textContent = error.message;
    } finally {
      this.el.loginSubmit.disabled = false;
    }
  }

  renderAccount() {
    const account = this.service.account;
    const loggedIn = Boolean(account);
    if (this.el.playerName) this.el.playerName.textContent = loggedIn ? (account.name || '玩家') : '游客';
    if (this.el.playerLevel) {
      const title = loggedIn && account.activeTitle ? achievementFor(account.activeTitle).title : '';
      this.el.playerLevel.textContent = loggedIn
        ? (title ? `称号 · ${title}` : '查看资料 / 设置')
        : '点击登录';
    }
    if (this.el.playerAvatar) {
      this.el.playerAvatar.textContent = loggedIn ? String(account.name || '玩').trim().slice(0, 1) : '?';
    }
    if (this.el.resChips) this.el.resChips.textContent = loggedIn ? String(Number(account.chips) || 0) : '—';
    if (this.el.btnLobbyLogin) this.el.btnLobbyLogin.classList.toggle('hidden', loggedIn);
    if (this.el.btnLobbyNickname) this.el.btnLobbyNickname.classList.toggle('hidden', !loggedIn);
    if (this.el.btnLobbyLogout) this.el.btnLobbyLogout.classList.toggle('hidden', !loggedIn);
    if (this.el.lobbyProfile) this.renderProfile();
  }

  renderProfile() {
    const account = this.service.account;
    if (!this.el.lobbyProfile) return;
    if (!account) {
      this.el.lobbyProfile.innerHTML = `
        <div class="profile-guest">
          <span class="profile-avatar">?</span>
          <div>
            <b>游客模式</b>
            <p>登录后可参与在线匹配、记录战绩、领取定期筹码。</p>
          </div>
        </div>`;
      if (this.el.btnLobbyLogout) this.el.btnLobbyLogout.classList.add('hidden');
      if (this.el.btnLobbyLogin) this.el.btnLobbyLogin.classList.remove('hidden');
      return;
    }
    if (this.el.btnLobbyLogout) this.el.btnLobbyLogout.classList.remove('hidden');
    if (this.el.btnLobbyLogin) this.el.btnLobbyLogin.classList.add('hidden');
    const refill = account.chipsRefillAt
      ? new Date(account.chipsRefillAt).toLocaleString('zh-CN', { hour12: false })
      : '—';
    const refillInterval = chipIntervalLabel(account.chipRefillMinutes);
    const refillGrant = Number(account.chipGrant) || 100;
    this.el.lobbyProfile.innerHTML = `
      <div class="profile-card">
        <span class="profile-avatar">${escapeHtml(String(account.name || '玩').trim().slice(0, 1))}</span>
        <div class="profile-main">
          <b>${escapeHtml(account.name || '玩家')}${account.activeTitle ? `<span class="profile-title">${escapeHtml(achievementFor(account.activeTitle).title)}</span>` : ''}</b>
          <em>账号 ${escapeHtml(maskHandle(account.username || ''))}</em>
        </div>
        <span class="profile-level">LV.1</span>
      </div>
      <div class="profile-stats">
        <span><em>筹码</em><b>${Number(account.chips) || 0}</b></span>
        <span><em>对局</em><b>${Number(account.rounds) || 0}</b></span>
      </div>
      <p class="profile-note">每 ${refillInterval}赠送 ${refillGrant} 筹码 · 下次 ${refill}</p>`;
  }

  bindLobbyAudio(inputKey, targetId) {
    const input = this.el[inputKey];
    const target = document.getElementById(targetId);
    if (!input) return;
    if (target) input.checked = Boolean(target.checked);
    input.addEventListener('change', () => {
      if (!target) return;
      target.checked = input.checked;
      target.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  syncLobbyAudio() {
    const pairs = [
      ['lobbySetMusic', 'setMusic'],
      ['lobbySetSfx', 'setSfx'],
      ['lobbySetVoice', 'setVoice'],
      ['lobbySetLowMotion', 'optLowMotion'],
    ];
    for (const [inputKey, targetId] of pairs) {
      const input = this.el[inputKey];
      const target = document.getElementById(targetId);
      if (input && target) input.checked = Boolean(target.checked);
    }
    if (this.el.lobbyVoiceProfile) this.el.lobbyVoiceProfile.value = audio.voiceProfile;
  }

  openNickname() {
    if (!this.service.loggedIn) {
      this.openLogin('login');
      return;
    }
    this.closeSettings();
    this.el.nicknameInput.value = this.service.account.name || '';
    this.el.nicknameError.textContent = '';
    this.el.nicknameModal.classList.remove('hidden');
    setTimeout(() => this.el.nicknameInput.focus(), 60);
  }

  closeNickname() {
    if (this.el.nicknameModal) this.el.nicknameModal.classList.add('hidden');
  }

  async submitNickname() {
    const name = this.el.nicknameInput.value.trim();
    this.el.nicknameError.textContent = '';
    if (name.length < 1 || name.length > 12) {
      this.el.nicknameError.textContent = '昵称需 1-12 个字符';
      return;
    }
    if (/^\d{7,}$/.test(name)) {
      this.el.nicknameError.textContent = '昵称不要使用手机号';
      return;
    }
    if (/[<>&"']/.test(name)) {
      this.el.nicknameError.textContent = '昵称不能包含特殊字符';
      return;
    }
    this.el.btnNicknameSave.disabled = true;
    try {
      const account = await this.service.updateNickname(name);
      this.closeNickname();
      this.renderAccount();
      this.toast(`昵称已改为 ${account.name}`);
      if (this.onChange) this.onChange(this.service.account);
    } catch (error) {
      this.el.nicknameError.textContent = error.message;
    } finally {
      this.el.btnNicknameSave.disabled = false;
    }
  }

  openSettings() {
    if (!this.el.lobbySettings) return;
    this.resetExitConfirm();
    this.syncLobbyAudio();
    this.renderProfile();
    this.el.lobbySettings.classList.remove('hidden');
  }

  closeSettings() {
    this.resetExitConfirm();
    if (this.el.lobbySettings) this.el.lobbySettings.classList.add('hidden');
  }

  notifyAccount(account) {
    if (account && this.service.account) {
      this.service.account = { ...this.service.account, ...account };
      this.renderAccount();
      if (this.onChange) this.onChange(this.service.account);
    }
  }

  async logout() {
    await this.service.logout();
    this.renderAccount();
    this.toast('已退出账户');
    if (this.onChange) this.onChange(null);
  }

  async openLeaderboard() {
    this.el.leaderModal.classList.remove('hidden');
    this.renderLeaderboard(true);
  }

  async renderLeaderboard(loading = false) {
    if (loading) {
      this.el.leaderList.innerHTML = '<div class="leader-empty">正在加载榜单…</div>';
    }
    try {
      this.data = await this.service.leaderboard();
    } catch (error) {
      this.el.leaderList.innerHTML = `<div class="leader-empty">${escapeHtml(error.message)}</div>`;
      return;
    }
    const tab = LEADER_TABS.find((item) => item.key === this.leaderTab) || LEADER_TABS[0];
    const rows = this.data[tab.key] || [];
    this.el.leaderList.innerHTML = rows.length
      ? rows.map((row) => (
        `<div class="leader-row${row.rank <= 3 ? ` top${row.rank}` : ''}">`
        + `<span class="leader-rank">${Number(row.rank) || 0}</span>`
        + `<b>${escapeHtml(row.name)}</b>`
        + `<em>${Number(row.value) || 0} ${tab.unit}</em>`
        + '</div>'
      )).join('')
      : '<div class="leader-empty">榜单还没有数据，快去上榜吧</div>';

    this.el.leaderHonor.innerHTML = `<div class="leader-honor-main">筹码榜 · 每 ${chipIntervalLabel(this.service.account?.chipRefillMinutes)}赠送 ${Number(this.service.account?.chipGrant) || 100} 筹码</div>`;
  }
}
