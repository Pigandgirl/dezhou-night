function makeSessionId() {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return `s_${Array.from(bytes, (b) => b.toString(36)).join('')}`;
  } catch {
    return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

export class ProgressTracker {
  constructor({ account, accountUI, game, online, hud }) {
    this.account = account;
    this.accountUI = accountUI;
    this.game = game;
    this.online = online;
    this.hud = hud;
    this.sessionId = makeSessionId();
    this.timer = null;
    this.pending = false;
    this.lastMode = '';
    this.lastNotice = 0;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 15000);
    setTimeout(() => this.tick(), 1200);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(() => this.tick(), 300);
    });
  }

  mode() {
    if (!this.account?.loggedIn || document.visibilityState !== 'visible') return '';
    if (this.game?.running && this.hud?.mode === 'single') return 'single';
    if (this.game?.running) return '';
    if (this.online?.room || this.hud?.online3d?.active) return '';
    return 'lobby';
  }

  async tick() {
    if (this.pending) return;
    const mode = this.mode();
    if (!mode) return;
    this.pending = true;
    try {
      const data = await this.account.request('/api/progress/tick', {
        method: 'POST',
        body: { mode, sessionId: this.sessionId },
      });
      if (!data?.ok) return;
      const current = this.account.account || {};
      this.account.account = { ...current, chips: data.chips };
      this.accountUI?.notifyAccount?.({ chips: data.chips });
      if (data.notice?.message && data.notice.minutes !== this.lastNotice) {
        this.lastNotice = data.notice.minutes;
        this.hud?.toast?.(data.notice.message, { kind: 'success', title: '练习奖励' });
      }
    } catch {
      // 网络失败不提示，下一轮自动重试。
    } finally {
      this.pending = false;
    }
  }
}
