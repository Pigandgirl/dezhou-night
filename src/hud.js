import { audio } from './audio.js';
import { getScene } from './scene-presets.js';
import { fmt } from './util.js';
import { rankLabel } from './poker.js';
import { OnlineService, GuestTable, onlineBase } from './online.js';

const SEAT_LABELS = {
  2: '单挑局',
  3: '三人桌',
  4: '四人桌',
  5: '五人桌',
  6: '六人桌',
  7: '七人桌',
  8: '八人满座',
};

function chipIntervalLabel(minutes) {
  const value = Math.max(1, Number(minutes) || 60);
  return value % 60 === 0 ? `${value / 60} 小时` : `${value} 分钟`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function makeSegGroup(container, values, labels, selected, onSelect) {
  container.innerHTML = '';
  values.forEach((value, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `seg${value === selected ? ' active' : ''}`;
    button.textContent = labels[i];
    button.dataset.value = String(value);
    button.addEventListener('click', () => {
      container.querySelectorAll('.seg').forEach((el) => el.classList.remove('active'));
      button.classList.add('active');
      onSelect(value);
    });
    container.appendChild(button);
  });
}

export class HUD {
  constructor({ onStart, onReturnLobby, onRebuy, online, account }) {
    this.onStart = onStart;
    this.onReturnLobby = onReturnLobby;
    this.onRebuy = onRebuy;
    this.online = online || new OnlineService();
    this.account = account || null;
    this.features = { matchEnabled: true, lanEnabled: true };
    this.accountUI = null;
    this.matchRooms = [];
    this.lanRooms = [];
    this.selectedLanRoom = null;
    this.pendingJoinRoom = null;
    this.joinLoadingTimer = null;
    this.joinLoadingProgress = 0;
    this.lanPending = false;
    this.matchPending = false;
    this.quickMatchLabel = '';
    this.connectionLost = false;
    this.connectionLostTimer = null;
    this.updateRequired = false;
    this.onlineGameOverHand = 0;
    this.onlineGameOverDismissed = 0;
    this.onlineGameOverOpen = false;
    this.onlineGameOverTimer = null;
    this.onlineGameOverPendingHand = 0;
    this.onlineGameOverPendingRoom = '';
    this.onlineGameOverPendingState = null;
    this.onlineGameOverPendingMe = null;
    this.lastRoomRoster = new Map();
    this.rosterRoomCode = '';
    this.roomHadOther = false;
    this.roomAutoReturnTimer = null;
    this.rosterOpen = false;
    this.voiceSpeakers = new Map();
    this.updateChecked = false;
    this.socialFetching = false;
    this.socialHideUntil = 0;
    this.socialLastKey = '';
    this.socialLastAt = 0;
    this.socialTimer = null;
    this.updateWatchdog = null;
    this.voicePanelTimer = null;
    this.guestTable = new GuestTable(this.online);
    this.mode = 'single';
    this.actionResolver = null;
    this.keyHandler = null;
    this.bannerTimer = null;
    this.settlementData = null;
    this.settleResolver = null;
    this.settleTimer = null;
    this.settleDeadline = 0;
    this.settlementDone = null;
    this.onlineNextHandler = null;
    this.viewerMode = 'hole';
    this.heroCards = [];
    this.boardCards = [];
    this.boardZoomTimer = null;
    this.timerId = null;
    this.timerPaused = false;
    this.timerDeadline = 0;
    this.timerTotal = 15;
    this.timerPausedRemaining = 0;
    this.countdownTimer = null;

    this.config = {
      seats: 8,
      stack: 100,
      blind: '1/2',
      music: true,
      sfx: true,
      voice: true,
      lowMotion: false,
      scene: 'private',
    };
    try { this.config.lowMotion = localStorage.getItem('pokerLowMotion') === '1'; } catch { /* ignore */ }
    this.config.voiceVolume = (() => { try { return localStorage.getItem('pokerVoiceVolume') || 'large'; } catch { return 'large'; } })();

    this.el = {
      hud: document.getElementById('hud'),
      lobby: document.getElementById('lobby'),
      handNo: document.getElementById('handNo'),
      blindInfo: document.getElementById('blindInfo'),
      potValue: document.getElementById('potValue'),
      boardRail: document.getElementById('boardRail'),
      boardRailCards: document.getElementById('boardRailCards'),
      boardStreet: document.getElementById('boardStreet'),
      boardZoom: document.getElementById('boardZoom'),
      boardZoomCards: document.getElementById('boardZoomCards'),
      boardZoomStreet: document.getElementById('boardZoomStreet'),
      btnBoardZoomClose: document.getElementById('btnBoardZoomClose'),
      cardViewer: document.getElementById('cardViewer'),
      viewerTitle: document.getElementById('viewerTitle'),
      viewerCards: document.getElementById('viewerCards'),
      btnCardToggle: document.getElementById('btnCardToggle'),
      actionTimer: document.getElementById('actionTimer'),
      actionTimerText: document.getElementById('actionTimerText'),
      feed: document.getElementById('feed'),
      btnFeedCollapse: document.getElementById('btnFeedCollapse'),
      btnFeedExpand: document.getElementById('btnFeedExpand'),
      turnTag: document.getElementById('turnTag'),
      heroStack: document.getElementById('heroStack'),
      heroHand: document.getElementById('heroHand'),
      actionbar: document.getElementById('actionbar'),
      raiseLabel: document.getElementById('raiseLabel'),
      raiseValue: document.getElementById('raiseValue'),
      raiseRange: document.getElementById('raiseRange'),
      btnRaiseMinus: document.getElementById('btnRaiseMinus'),
      btnRaisePlus: document.getElementById('btnRaisePlus'),
      presets: document.querySelector('.presets'),
      btnFold: document.getElementById('btnFold'),
      foldConfirm: document.getElementById('foldConfirm'),
      btnFoldCancel: document.getElementById('btnFoldCancel'),
      btnFoldConfirm: document.getElementById('btnFoldConfirm'),
      btnCall: document.getElementById('btnCall'),
      btnRaise: document.getElementById('btnRaise'),
      btnSettings: document.getElementById('btnSettings'),
      btnVoice: document.getElementById('btnVoice'),
      btnVoicePanel: document.getElementById('btnVoicePanel'),
      voiceMuteBadge: document.getElementById('voiceMuteBadge'),
      voiceLabel: document.getElementById('voiceLabel'),
      btnSettingsVoice: document.getElementById('btnSettingsVoice'),
      setVoiceReceive: document.getElementById('setVoiceReceive'),
      voicePanelModal: document.getElementById('voicePanelModal'),
      btnVoicePanelClose: document.getElementById('btnVoicePanelClose'),
      btnVoicePanelDone: document.getElementById('btnVoicePanelDone'),
      btnMicTest: document.getElementById('btnMicTest'),
      micTestLevel: document.getElementById('micTestLevel'),
      micTestStatus: document.getElementById('micTestStatus'),
      micTestHint: document.getElementById('micTestHint'),
      voicePlayerList: document.getElementById('voicePlayerList'),
      btnVoiceMuteAll: document.getElementById('btnVoiceMuteAll'),
      voiceDiag: document.getElementById('voiceDiag'),
      btnVoiceMaster: document.getElementById('btnVoiceMaster'),
      voiceMasterTitle: document.getElementById('voiceMasterTitle'),
      voiceMasterText: document.getElementById('voiceMasterText'),
      voiceMasterState: document.getElementById('voiceMasterState'),
      btnVoiceListenOnly: document.getElementById('btnVoiceListenOnly'),
      btnCardCollapse: document.getElementById('btnCardCollapse'),
      btnCardExpand: document.getElementById('btnCardExpand'),
      banner: document.getElementById('banner'),
      singleSettle: document.getElementById('singleSettle'),
      singleSettleTitle: document.getElementById('singleSettleTitle'),
      singleSettleTimer: document.getElementById('singleSettleTimer'),
      singleSettleBoard: document.getElementById('singleSettleBoard'),
      singleSettleList: document.getElementById('singleSettleList'),
      singleSettleTotal: document.getElementById('singleSettleTotal'),
      btnSettleNext: document.getElementById('btnSettleNext'),
      thinking: document.getElementById('thinking'),
      spectatorBadge: document.getElementById('spectatorBadge'),
      btnSpectatorReset: document.getElementById('btnSpectatorReset'),
      toastHost: document.getElementById('toastHost'),
      btnStart: document.getElementById('btnStart'),
      btnStoryMode: document.getElementById('btnStoryMode'),
      storyFilter: document.getElementById('storyFilter'),
      cinemaBars: document.getElementById('cinemaBars'),
      storyChallenge: document.getElementById('storyChallenge'),
      storyChallengeKicker: document.getElementById('storyChallengeKicker'),
      storyChallengeTitle: document.getElementById('storyChallengeTitle'),
      storyChallengeObjective: document.getElementById('storyChallengeObjective'),
      socialInvite: document.getElementById('socialInvite'),
      socialInviteTitle: document.getElementById('socialInviteTitle'),
      socialInviteSub: document.getElementById('socialInviteSub'),
      btnSocialJoin: document.getElementById('btnSocialJoin'),
      btnSocialClose: document.getElementById('btnSocialClose'),
      singlePanel: document.getElementById('singlePanel'),
      lanPanel: document.getElementById('lanPanel'),
      onlinePanel: document.getElementById('onlinePanel'),
      btnCreateRoom: document.getElementById('btnCreateRoom'),
      btnJoinRoom: document.getElementById('btnJoinRoom'),
      btnLobbyGear: document.getElementById('btnLobbyGear'),
      btnAdminConsole: document.getElementById('btnAdminConsole'),
      btnCareer: document.getElementById('btnCareer'),
      sceneBadge: document.getElementById('sceneBadge'),
      adminScenePicker: document.getElementById('adminScenePicker'),
      adminSceneSelect: document.getElementById('adminSceneSelect'),
      onlineCount: document.getElementById('onlineCount'),
      btnLobbySettings: document.getElementById('btnLobbySettings'),
      btnLobbyUpdate: document.getElementById('btnLobbyUpdate'),
      lobbyVersionInline: document.getElementById('lobbyVersionInline'),
      cardMatchStatus: document.getElementById('cardMatchStatus'),
      stackInput: document.getElementById('stackInput'),
      createForm: document.getElementById('createForm'),
      createName: document.getElementById('createName'),
      createPass: document.getElementById('createPass'),
      createSeats: document.getElementById('createSeats'),
      createChips: document.getElementById('createChips'),
      createBlind: document.getElementById('createBlind'),
      createLoserSpectate: document.getElementById('createLoserSpectate'),
      createConfirm: document.getElementById('btnCreateConfirm'),
      btnRefreshLan: document.getElementById('btnRefreshLan'),
      lanRooms: document.getElementById('lanRooms'),
      lanPanel: document.getElementById('lanPanel'),
      joinRoomModal: document.getElementById('joinRoomModal'),
      joinRoomTitle: document.getElementById('joinRoomTitle'),
      joinRoomMeta: document.getElementById('joinRoomMeta'),
      joinRoomPass: document.getElementById('joinRoomPass'),
      joinRoomError: document.getElementById('joinRoomError'),
      joinLoading: document.getElementById('joinLoading'),
      joinLoadingTitle: document.getElementById('joinLoadingTitle'),
      joinLoadingText: document.getElementById('joinLoadingText'),
      joinLoadingBar: document.getElementById('joinLoadingBar'),
      joinLoadingPlayers: document.getElementById('joinLoadingPlayers'),
      btnJoinLoadingLeave: document.getElementById('btnJoinLoadingLeave'),
      btnJoinRoomCancel: document.getElementById('btnJoinRoomCancel'),
      btnJoinRoomConfirm: document.getElementById('btnJoinRoomConfirm'),
      onlineGameOver: document.getElementById('onlineGameOver'),
      onlineRoster: document.getElementById('onlineRoster'),
      btnOnlineRoster: document.getElementById('btnOnlineRoster'),
      onlineRosterPanel: document.getElementById('onlineRosterPanel'),
      onlineRosterCount: document.getElementById('onlineRosterCount'),
      onlineRosterVoice: document.getElementById('onlineRosterVoice'),
      onlineGameOverTitle: document.getElementById('onlineGameOverTitle'),
      onlineGameOverText: document.getElementById('onlineGameOverText'),
      btnGameOverRestart: document.getElementById('btnGameOverRestart'),
      btnGameOverWatch: document.getElementById('btnGameOverWatch'),
      btnGameOverExit: document.getElementById('btnGameOverExit'),
      onlineNote: document.getElementById('onlineNote'),
      matchRooms: document.getElementById('matchRooms'),
      matchHint: document.getElementById('matchHint'),
      lanHint: document.getElementById('lanHint'),
      btnQuickMatch: document.getElementById('btnQuickMatch'),
      btnRefreshMatch: document.getElementById('btnRefreshMatch'),
      roomOverlay: document.getElementById('roomOverlay'),
      roomTitle: document.getElementById('roomTitle'),
      roomHint: document.getElementById('roomHint'),
      roomCode: document.getElementById('roomCode'),
      roomPass: document.getElementById('roomPass'),
      roomCount: document.getElementById('roomCount'),
      roomRole: document.getElementById('roomRole'),
      roomPlayers: document.getElementById('roomPlayers'),
      hostRoomSettings: document.getElementById('hostRoomSettings'),
      hostRoomChips: document.getElementById('hostRoomChips'),
      hostRoomBlind: document.getElementById('hostRoomBlind'),
      hostRoomSpectate: document.getElementById('hostRoomSpectate'),
      btnHostRoomSave: document.getElementById('btnHostRoomSave'),
      btnRoomLeave: document.getElementById('btnRoomLeave'),
      btnRoomStart: document.getElementById('btnRoomStart'),
      btnRoomReady: document.getElementById('btnRoomReady'),
      btnVoiceTest: document.getElementById('btnVoiceTest'),
      btnCheckUpdate: document.getElementById('btnCheckUpdate'),
      updateModal: document.getElementById('updateModal'),
      updateTitle: document.getElementById('updateTitle'),
      updateNotes: document.getElementById('updateNotes'),
      updateCurrent: document.getElementById('updateCurrent'),
      updateLatest: document.getElementById('updateLatest'),
      updateProgress: document.getElementById('updateProgress'),
      updateProgressText: document.getElementById('updateProgressText'),
      updateProgressBar: document.getElementById('updateProgressBar'),
      updateProgressBytes: document.getElementById('updateProgressBytes'),
      btnUpdateNow: document.getElementById('btnUpdateNow'),
      btnUpdateBrowser: document.getElementById('btnUpdateBrowser'),
      btnUpdateLater: document.getElementById('btnUpdateLater'),
      helpModal: document.getElementById('helpModal'),
      settingsModal: document.getElementById('settingsModal'),
      setMusic: document.getElementById('setMusic'),
      setSfx: document.getElementById('setSfx'),
      setVoice: document.getElementById('setVoice'),
      setLowMotion: document.getElementById('setLowMotion'),
      optLowMotion: document.getElementById('optLowMotion'),
      setVoiceProfile: document.getElementById('setVoiceProfile'),
      setVoiceVolume: document.getElementById('setVoiceVolume'),
      lobbyVoiceVolume: document.getElementById('lobbyVoiceVolume'),
      setViewMode: document.getElementById('setViewMode'),
      btnSettingsClose: document.getElementById('btnSettingsClose'),
      btnSettingsHelp: document.getElementById('btnSettingsHelp'),
      btnSettingsLobby: document.getElementById('btnSettingsLobby'),
      ready: document.getElementById('ready'),
      readyCount: document.getElementById('readyCount'),
      btnReadyGo: document.getElementById('btnReadyGo'),
      btnReadyExit: document.getElementById('btnReadyExit'),
      btnHelpClose: document.getElementById('btnHelpClose'),
      btnResume: document.getElementById('btnResume'),
      btnBackLobby: document.getElementById('btnBackLobby'),
      gameover: document.getElementById('gameover'),
      statHands: document.getElementById('statHands'),
      statPot: document.getElementById('statPot'),
      btnRebuy: document.getElementById('btnRebuy'),
      btnGameoverLobby: document.getElementById('btnGameoverLobby'),
      gameoverCopy: document.getElementById('gameoverCopy'),
    };

    this.setupLobby();
    this.setupGameHUD();
    this.setupOnline();
    this.syncSettings();
    try {
      this.presenceId = sessionStorage.getItem('pokerPresence')
        || (crypto.randomUUID ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
      sessionStorage.setItem('pokerPresence', this.presenceId);
    } catch {
      this.presenceId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    this.refreshStats();
    this.loadFeatures();
    this.statsTimer = setInterval(() => {
      this.refreshStats();
      this.loadFeatures();
    }, 15000);
    this.startSocialInvites();
  }

  async loadFeatures() {
    if (!this.account) return;
    try {
      const data = await this.account.features();
      this.features = {
        matchEnabled: data.matchEnabled !== false,
        lanEnabled: data.lanEnabled !== false,
      };
      this.applyFeatureState();
    } catch {
      /* 网络抖动时保留上一次状态 */
    }
  }

  setActionAvailable(el, available, reason = '') {
    if (!el) return;
    el.disabled = false;
    el.setAttribute('aria-disabled', available ? 'false' : 'true');
    el.classList.toggle('is-disabled', !available);
    el.title = available ? '' : reason;
  }

  applyFeatureState() {
    const matchOn = this.features.matchEnabled;
    const lanOn = this.features.lanEnabled;
    this.setActionAvailable(this.el.btnQuickMatch, matchOn, '在线匹配暂未开放');
    this.setActionAvailable(this.el.btnCreateRoom, lanOn, '好友房暂未开放');
    this.setActionAvailable(this.el.btnRefreshLan, lanOn, '好友房暂未开放');
    if (!matchOn && this.el.cardMatchStatus) {
      this.el.cardMatchStatus.textContent = '在线匹配暂未开放';
      this.el.cardMatchStatus.dataset.tone = 'warn';
    } else {
      this.updateMatchStatus();
    }
    this.updateLanHint();
    this.renderMatchRooms();
  }

  async refreshStats() {
    if (!this.el.onlineCount) return;
    const show = (data) => {
      const online = Number(data.online) || 0;
      this.el.onlineCount.textContent = online > 999 ? `${(online / 1000).toFixed(1)}k` : String(online);
    };
    try {
      const account = this.account && this.account.account;
      const res = await fetch(`${onlineBase()}/api/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.presenceId,
          user: (account && account.username) || '',
        }),
      });
      if (res.ok) {
        show(await res.json());
        return;
      }
    } catch {
      /* 回退到只读统计 */
    }
    try {
      const res = await fetch(`${onlineBase()}/api/stats`, { cache: 'no-store' });
      if (res.ok) show(await res.json());
    } catch {
      /* 离线或服务不可达时保留上一次显示 */
    }
  }

  setupLobby() {
    const seatSegs = document.getElementById('seatSegs');
    const blindSegs = document.getElementById('blindSegs');
    const seatNote = document.getElementById('seatNote');
    const stackInput = document.getElementById('stackInput');

    const seats = [2, 3, 4, 5, 6, 7, 8];
    makeSegGroup(seatSegs, seats, seats.map(String), this.config.seats, (value) => {
      this.config.seats = value;
      seatNote.textContent = SEAT_LABELS[value];
    });

    if (stackInput) {
      stackInput.value = String(this.config.stack);
      const applyStack = (value) => {
        const next = Math.max(20, Math.min(100000, Math.round(Number(value) || 100)));
        this.config.stack = next;
        stackInput.value = String(next);
      };
      stackInput.addEventListener('change', () => applyStack(stackInput.value));
      stackInput.addEventListener('blur', () => applyStack(stackInput.value));
      const step = (delta) => {
        audio.click();
        applyStack(Number(stackInput.value) + delta);
      };
      document.getElementById('btnStackMinus').addEventListener('click', () => step(-10));
      document.getElementById('btnStackPlus').addEventListener('click', () => step(10));
    }

    const blinds = [1, 2, 5];
    makeSegGroup(
      blindSegs,
      blinds,
      blinds.map((v) => `${v}/${v * 2}`),
      Number(this.config.blind.split('/')[0]),
      (value) => {
        this.config.blind = `${value}/${value * 2}`;
      },
    );

    const optMusic = document.getElementById('optMusic');
    const optSfx = document.getElementById('optSfx');
    const optVoice = document.getElementById('optVoice');
    optMusic.addEventListener('change', () => {
      this.config.music = optMusic.checked;
      audio.setMusic(optMusic.checked);
      this.syncSettings();
    });
    optSfx.addEventListener('change', () => {
      this.config.sfx = optSfx.checked;
      audio.setSfx(optSfx.checked);
      this.syncSettings();
    });
    optVoice.addEventListener('change', () => {
      this.config.voice = optVoice.checked;
      audio.setVoice(optVoice.checked);
      this.syncSettings();
    });
    const optLowMotion = document.getElementById('optLowMotion');
    optLowMotion?.addEventListener('change', () => this.applyLowMotion(optLowMotion.checked));

    document.getElementById('btnStart').addEventListener('click', () => {
      audio.init();
      audio.click();
      audio.setMusic(this.config.music);
      audio.setSfx(this.config.sfx);
      audio.setVoice(this.config.voice);
      const [sb, bb] = this.config.blind.split('/').map(Number);
      this.onStart({
        scene: this.account?.account?.isAdmin ? (this.config.scene || 'private') : 'private',
        playerName: this.account?.account?.name || '',
        seats: this.config.seats,
        stack: this.config.stack,
        sb,
        bb,
        music: this.config.music,
        sfx: this.config.sfx,
        voice: this.config.voice,
      });
    });

    if (this.el.btnStoryMode) {
      this.el.btnStoryMode.addEventListener('click', () => {
        audio.click();
        this.onOpenStory?.();
      });
    }
    if (this.el.btnSocialJoin) {
      this.el.btnSocialJoin.addEventListener('click', () => {
        audio.click();
        this.hideSocialInvite(60 * 1000);
        this.onSocialJoin?.();
      });
    }
    if (this.el.btnSocialClose) {
      this.el.btnSocialClose.addEventListener('click', () => {
        audio.click();
        this.hideSocialInvite(3 * 60 * 1000);
      });
    }

    document.querySelectorAll('.mode-card').forEach((card) => {
      card.addEventListener('click', () => {
        audio.click();
        const mode = card.dataset.mode;
        if (mode === 'story') {
          this.onOpenStory?.();
          return;
        }
        this.setLobbyMode(mode);
      });
    });

    if (this.el.btnRefreshMatch) {
      this.el.btnRefreshMatch.addEventListener('click', () => this.refreshMatchRooms());
    }
    if (this.el.btnLobbyGear) {
      this.el.btnLobbyGear.addEventListener('click', () => this.openLobbySettings());
    }
    if (this.el.btnAdminConsole) {
      this.el.btnAdminConsole.addEventListener('click', () => this.openAdminConsole());
    }
    if (this.el.btnCareer) {
      this.el.btnCareer.addEventListener('click', () => this.openCareer());
    }
    this.el.adminSceneSelect?.addEventListener('change', () => {
      this.config.scene = this.el.adminSceneSelect.value;
      this.setScene(this.config.scene);
    });
    if (this.el.btnSpectatorReset) {
      this.el.btnSpectatorReset.addEventListener('click', () => {
        this.online3d?.scene?.resetSpectatorView?.();
      });
    }
    if (this.el.btnLobbySettings) {
      this.el.btnLobbySettings.addEventListener('click', () => this.openLobbySettings());
    }
    if (this.el.btnLobbyUpdate) {
      this.el.btnLobbyUpdate.addEventListener('click', () => {
        if (this.accountUI) this.accountUI.closeSettings();
        this.checkForUpdate();
      });
    }
    if (this.el.btnSettings) {
      this.el.btnSettings.addEventListener('click', () => this.openSettings());
    }
    if (this.el.btnVoice) {
      this.el.btnVoice.addEventListener('click', async () => {
        audio.init();
        const chat = this.voiceChat;
        if (!this.online.room) {
          this.toast('进入在线牌桌后才能使用房间语音', { kind: 'info', title: '语音' });
          return;
        }
        if (!chat || chat.pending) return;
        if (chat.enabled) await chat.disable();
        else await chat.enable();
      });
    }
    this.el.btnSettingsVoice?.addEventListener('click', () => {
      this.closeSettings();
      this.openVoicePanel();
    });
    this.el.setVoiceReceive?.addEventListener('change', () => {
      this.voiceChat?.setAllMuted(!this.el.setVoiceReceive.checked);
    });
    this.el.btnSettingsClose.addEventListener('click', () => this.closeSettings());
    this.el.btnSettingsHelp.addEventListener('click', () => {
      this.closeSettings();
      this.openHelp();
    });
    this.el.btnSettingsLobby.addEventListener('click', () => {
      this.closeSettings();
      this.onReturnLobby();
    });
    this.el.settingsModal.addEventListener('click', (event) => {
      if (event.target === this.el.settingsModal) this.closeSettings();
    });
    this.el.setMusic.addEventListener('change', () => {
      this.config.music = this.el.setMusic.checked;
      audio.setMusic(this.config.music);
      this.syncSettings();
    });
    this.el.setSfx.addEventListener('change', () => {
      this.config.sfx = this.el.setSfx.checked;
      audio.setSfx(this.config.sfx);
      if (this.config.sfx) audio.click();
      this.syncSettings();
    });
    this.el.setVoice.addEventListener('change', () => {
      this.config.voice = this.el.setVoice.checked;
      audio.setVoice(this.config.voice);
      this.syncSettings();
    });
    this.el.setLowMotion?.addEventListener('change', () => this.applyLowMotion(this.el.setLowMotion.checked));
    if (this.el.setViewMode) {
      this.el.setViewMode.value = localStorage.getItem('poker_view_mode') === 'third' ? 'third' : 'first';
      this.el.setViewMode.addEventListener('change', () => {
        const mode = this.el.setViewMode.value;
        this.scene?.setViewMode?.(mode);
        this.online3d?.scene?.setViewMode?.(mode);
        this.toast(mode === 'third' ? '已切换到第三人称视角' : '已切换到第一人称视角', { kind: 'info', title: '视角' });
      });
    }
    if (this.el.setVoiceProfile) {
      this.el.setVoiceProfile.addEventListener('change', () => {
        audio.setVoiceProfile(this.el.setVoiceProfile.value);
        this.syncSettings();
        audio.speakVoiceDemo();
      });
    }
    const applyVoiceVolume = (value) => {
      const level = ['small', 'medium', 'large', 'extraLarge', 'huge'].includes(value) ? value : 'large';
      this.config.voiceVolume = level;
      try { localStorage.setItem('pokerVoiceVolume', level); } catch { /* ignore */ }
      this.voiceChat?.setOutputVolume?.(level);
      this.syncSettings();
    };
    this.el.setVoiceVolume?.addEventListener('change', () => applyVoiceVolume(this.el.setVoiceVolume.value));
    this.el.lobbyVoiceVolume?.addEventListener('change', () => applyVoiceVolume(this.el.lobbyVoiceVolume.value));

    this.el.btnHelpClose.addEventListener('click', () => this.closeHelp());
    this.el.btnVoiceTest.addEventListener('click', () => {
      this.toast('正在试听语音播报');
      audio.speakText('试听播报，阿凯加注到一百五十');
    });
    this.el.btnCheckUpdate.addEventListener('click', () => this.checkForUpdate());
    this.el.btnUpdateLater.addEventListener('click', () => {
      if (this.updateRequired) {
        this.toast('当前版本必须更新后才能继续联机', { kind: 'warn', title: '必须更新' });
        return;
      }
      this.el.updateModal.classList.add('hidden');
    });
    window.__updateDownloadProgress = (percent, bytes, total) => {
      this.setUpdateProgress(percent, bytes, total);
    };
    window.__updateDownloadError = () => this.setUpdateProgress(-1, 0, 0);
    this.el.btnUpdateNow.addEventListener('click', () => {
      const info = this.updateInfo;
      if (!this.updateRequired) this.el.updateModal.classList.add('hidden');
      if (!info || !info.url) return;
      if (!window.NativeBridge || typeof window.NativeBridge.downloadAndInstall !== 'function') {
        if (/^https?:/.test(location.protocol)) {
          this.toast('页面已更新，正在刷新…', { kind: 'success', title: '更新' });
          setTimeout(() => location.reload(), 350);
          return;
        }
        this.toast(`请手动下载新版本 ${info.versionName}`);
        return;
      }
      this.setUpdateProgress(0, 0, info.size || 0);
      this.el.btnUpdateNow.disabled = true;
      this.startUpdateWatchdog();
      this.toast('开始下载更新…');
      if (typeof window.NativeBridge.beginWebUpdate === 'function') {
        this.downloadApkInWebView(info).catch((error) => {
          console.warn('[update] WebView download failed', error);
          try { window.NativeBridge.abortWebUpdate?.(); } catch { /* 忽略 */ }
          this.setUpdateProgress(-1, 0, 0);
          this.toast(`下载失败：${error?.message || '网络异常'}，可点「浏览器下载」`, {
            kind: 'warn', title: '更新失败',
          });
        });
      } else {
        window.NativeBridge.downloadAndInstall(info.url);
      }
    });
    this.el.btnUpdateBrowser?.addEventListener('click', () => {
      const url = this.updateInfo?.url;
      if (!url) return;
      audio.click();
      if (window.NativeBridge && typeof window.NativeBridge.openUrl === 'function') {
        window.NativeBridge.openUrl(url);
      } else {
        window.open(url, '_blank');
      }
    });
    this.el.btnResume.addEventListener('click', () => this.closeHelp());
    this.el.btnBackLobby.addEventListener('click', () => {
      this.closeHelp();
      this.onReturnLobby();
    });
    this.el.helpModal.addEventListener('click', (event) => {
      if (event.target === this.el.helpModal) this.closeHelp();
    });

    this.el.btnRebuy.addEventListener('click', () => {
      this.hideGameOver();
      this.onRebuy();
    });
    this.el.btnGameoverLobby.addEventListener('click', () => {
      this.hideGameOver();
      this.onReturnLobby();
    });


    this.el.btnVoiceMaster?.addEventListener('click', async () => {
      audio.click();
      const chat = this.voiceChat;
      if (!chat || chat.pending) return;
      if (chat.enabled) await chat.disable();
      else await chat.enable();
      this.renderVoiceMaster();
    });
    this.el.btnVoiceListenOnly?.addEventListener('click', async () => {
      audio.click();
      const chat = this.voiceChat;
      if (!chat || chat.pending) return;
      if (chat.enabled) await chat.disable();
      await chat.armPlayback().catch(() => {});
      this.renderVoiceMaster();
    });
    this.el.btnVoicePanelClose?.addEventListener('click', () => this.closeVoicePanel());
    this.el.btnVoicePanelDone?.addEventListener('click', () => this.closeVoicePanel());
    this.el.voicePanelModal?.addEventListener('click', (event) => {
      if (event.target === this.el.voicePanelModal) this.closeVoicePanel();
    });
    this.el.btnMicTest?.addEventListener('click', () => {
      audio.click();
      this.voiceChat?.toggleMicTest();
    });
    this.el.btnVoiceMuteAll?.addEventListener('click', () => {
      audio.click();
      this.voiceChat?.setAllMuted(!this.voiceChat.isGlobalMuted());
    });
    this.el.voicePlayerList?.addEventListener('click', (event) => {
      const mute = event.target.closest('[data-voice-mute]');
      if (mute) {
        audio.click();
        this.voiceChat?.toggleMute(Number(mute.dataset.voiceMute));
        return;
      }
      const solo = event.target.closest('[data-voice-solo]');
      if (solo) {
        audio.click();
        this.voiceChat?.toggleSolo(Number(solo.dataset.voiceSolo));
      }
    });
  }

  setupGameHUD() {
    this.el.btnFeedCollapse?.addEventListener('click', () => this.setFeedCollapsed(true));
    this.el.btnFeedExpand?.addEventListener('click', () => this.setFeedCollapsed(false));
    this.setFeedCollapsed(localStorage.getItem('poker_feed_collapsed') === '1', false);
    this.el.btnFold.addEventListener('click', () => this.openFoldConfirm());
    this.el.btnFoldCancel?.addEventListener('click', () => this.closeFoldConfirm());
    this.el.btnFoldConfirm?.addEventListener('click', () => {
      this.closeFoldConfirm();
      this.resolveAction({ type: 'fold' });
    });
    this.el.foldConfirm?.addEventListener('click', (event) => {
      if (event.target === this.el.foldConfirm) this.closeFoldConfirm();
    });
    this.el.btnCall.addEventListener('click', () => {
      const action = this.el.btnCall.dataset.action === 'check'
        ? { type: 'check' }
        : { type: 'call' };
      this.resolveAction(action);
    });
    this.el.btnRaise.addEventListener('click', () => {
      const value = Number(this.el.raiseRange.value);
      const max = Number(this.el.raiseRange.max);
      audio.click();
      if (value >= max) this.resolveAction({ type: 'allin' });
      else this.resolveAction({ type: 'raise', amount: value });
    });

    this.el.raiseRange.addEventListener('input', () => this.updateRaiseDisplay());
    if (this.el.btnSettleNext) {
      this.el.btnSettleNext.addEventListener('click', () => {
        if (this.onlineNextHandler) {
          this.onlineNextHandler();
          return;
        }
        this.finishSettlement(true);
      });
    }

    const stepRaise = (direction) => {
      if (!this.currentLegal || !this.currentLegal.canRaise) return;
      const bb = Math.max(5, Number(this.config.blind.split('/')[1]) || 50);
      audio.click();
      this.vibrate(8);
      this.setRaiseValue(Number(this.el.raiseRange.value) + direction * bb);
    };
    this.el.btnRaiseMinus.addEventListener('click', () => stepRaise(-1));
    this.el.btnRaisePlus.addEventListener('click', () => stepRaise(1));

    this.el.btnCardToggle.addEventListener('click', () => {
      audio.click();
      this.toggleCardViewer();
    });
    this.el.btnCardCollapse.addEventListener('click', () => {
      audio.click();
      this.setCardsCollapsed(true);
    });
    this.el.btnCardExpand.addEventListener('click', () => {
      audio.click();
      this.setCardsCollapsed(false);
    });

    this.el.btnReadyGo.addEventListener('click', () => this.finishReady(true));
    this.el.btnReadyExit.addEventListener('click', () => this.finishReady(false));

    let collapsed = false;
    try {
      collapsed = localStorage.getItem('pokerCardsCollapsed') === '1';
    } catch {
      collapsed = false;
    }
    this.setCardsCollapsed(collapsed);

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swiping = false;
    this.el.boardRail?.addEventListener('click', () => this.showBoardZoom());
    this.el.viewerCards?.addEventListener('click', () => {
      if (this.viewerMode === 'board') this.showBoardZoom();
    });
    this.el.btnBoardZoomClose?.addEventListener('click', () => this.hideBoardZoom());
    this.el.boardZoom?.addEventListener('click', (event) => {
      if (event.target === this.el.boardZoom) this.hideBoardZoom();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.el.boardZoom && !this.el.boardZoom.classList.contains('hidden')) this.hideBoardZoom();
    });
    this.el.cardViewer.addEventListener('pointerdown', (event) => {
      // 按钮点击不能被“左右滑动切换牌面”的 pointer capture 吞掉。
      if (event.target instanceof Element && event.target.closest('button')) return;
      swipeStartX = event.clientX;
      swipeStartY = event.clientY;
      swiping = true;
      try { this.el.cardViewer.setPointerCapture(event.pointerId); } catch { /* 忽略 */ }
    });
    this.el.cardViewer.addEventListener('pointerup', (event) => {
      if (!swiping) return;
      swiping = false;
      const dx = event.clientX - swipeStartX;
      const dy = event.clientY - swipeStartY;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
        this.toggleCardViewer();
      }
    });
    this.el.cardViewer.addEventListener('pointercancel', () => { swiping = false; });
    this.el.presets.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !this.currentLegal || !this.currentLegal.canRaise) return;
      audio.click();
      const legal = this.currentLegal;
      if (button.dataset.allin) {
        this.setRaiseValue(legal.maxRaiseTo);
      } else {
        const frac = Number(button.dataset.frac);
        const target = legal.currentBet + (legal.pot + legal.toCall) * frac;
        this.setRaiseValue(target);
      }
    });
  }

  setupOnline() {
    const service = this.online;
    this.el.btnCreateRoom.addEventListener('click', () => {
      if (!this.ensureLanReady()) return;
      audio.click();
      this.el.createForm.classList.remove('hidden');
      if (!this.el.createName.value.trim() || this.el.createName.value === '房主') {
        const name = this.account?.account?.name;
        if (name) this.el.createName.value = `${name}的牌桌`;
      }
      setTimeout(() => {
        this.el.createForm.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        this.el.createPass.focus();
      }, 60);
    });
    this.el.btnRefreshLan?.addEventListener('click', () => {
      audio.click();
      this.refreshLanRooms();
    });

    this.el.createConfirm.addEventListener('click', async () => {
      if (!this.ensureLanReady()) return;
      const password = this.el.createPass.value.trim();
      if (!/^\d{3}$/.test(password)) {
        this.el.createPass.focus();
        this.setLanHint('房间口令必须是 3 位数字，例如 123。', 'warn');
        this.toast('房间口令需为 3 位数字，请检查后再创建。', { kind: 'warn', title: '口令格式不对' });
        return;
      }
      const [sb, bb] = String(this.el.createBlind.value || '1/2').split('/').map((n) => Number(n) || 1);
      this.el.createConfirm.disabled = true;
      try {
        await service.createRoom({
          name: this.el.createName.value.trim() || '好友牌桌',
          seats: Number(this.el.createSeats.value) || 8,
          password,
          startingChips: Number(this.el.createChips.value) || 100,
          sb,
          bb,
          loserSpectate: Boolean(this.el.createLoserSpectate.checked),
        });
        this.showRoom();
        this.setLanHint('');
        this.toast('房间已创建，把房间号和口令发给好友即可。', { kind: 'success', title: '创建成功' });
        this.refreshLanRooms();
      } catch (error) {
        this.setLanHint(error.message || '创建房间失败，请稍后重试。', 'error');
        this.toast(`创建房间失败：${error.message || '请稍后重试'}`, { kind: 'error', title: '创建失败' });
      } finally {
        this.el.createConfirm.disabled = false;
      }
    });

    this.el.lanRooms?.addEventListener('click', (event) => {
      const card = event.target.closest('.lan-room-card');
      if (!card) return;
      if (card.classList.contains('full')) {
        this.toast('这个房间已经满员，换一间或自己创建一间。', { kind: 'warn', title: '房间已满' });
        return;
      }
      const room = {
        code: card.dataset.code,
        name: card.dataset.name,
        creator: card.dataset.creator,
        players: Number(card.dataset.players) || 0,
        seats: Number(card.dataset.seats) || 8,
      };
      if (!this.ensureLanReady()) {
        this.pendingJoinRoom = room;
        return;
      }
      this.openJoinRoomModal(room);
    });
    this.el.btnJoinRoomCancel?.addEventListener('click', () => this.closeJoinRoomModal());
    this.el.btnJoinLoadingLeave?.addEventListener('click', async () => {
      this.hideJoinLoading();
      await this.online.leave?.().catch(() => {});
      this.backToLobby();
    });
    this.el.btnJoinRoomConfirm?.addEventListener('click', () => this.confirmJoinRoom());
    this.el.joinRoomPass?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.confirmJoinRoom();
    });
    this.el.joinRoomModal?.addEventListener('click', (event) => {
      if (event.target === this.el.joinRoomModal) this.closeJoinRoomModal();
    });
    this.el.btnGameOverRestart?.addEventListener('click', () => this.restartOnlineGame());
    this.el.btnGameOverExit?.addEventListener('click', () => this.exitOnlineGame());
    this.el.btnGameOverWatch?.addEventListener('click', () => {
      this.onlineGameOverDismissed = this.onlineGameOverHand;
      this.hideOnlineGameOver();
    });
    this.el.btnOnlineRoster?.addEventListener('click', () => {
      this.setRosterOpen(!this.rosterOpen);
    });
    document.addEventListener('click', (event) => {
      if (!this.rosterOpen || !this.el.onlineRoster) return;
      if (!this.el.onlineRoster.contains(event.target)) this.setRosterOpen(false);
    });

    if (this.el.btnQuickMatch) {
      this.el.btnQuickMatch.addEventListener('click', () => this.quickMatch());
    }

    if (this.el.btnRefreshMatch) {
      this.el.btnRefreshMatch.addEventListener('click', () => this.refreshMatchRooms());
    }

    this.el.matchRooms.addEventListener('click', async (event) => {
      const card = event.target.closest('.match-card');
      if (!card) return;
      if (card.classList.contains('full')) {
        this.toast('这个房间已经满员，换一间或点「在线匹配」自动开桌。', {
          kind: 'warn', title: '房间已满',
        });
        return;
      }
      if (!this.ensureOnlineReady()) return;
      try {
        await service.joinMatch(card.dataset.code);
        this.showRoom();
        const waiting = Boolean(this.online.room?.waiting);
        this.toast(waiting ? '已加入，本手结束后自动入座。' : '已加入匹配房间，等待开局。', {
          kind: 'success', title: waiting ? '等待下一手' : '加入成功',
        });
      } catch (error) {
        const friendly = this.friendlyMatchError(error);
        this.toast(friendly.message, { kind: friendly.kind, title: friendly.title });
        this.refreshMatchRooms();
      }
    });

    this.el.btnRoomStart.addEventListener('click', async () => {
      if (this.el.btnRoomStart.getAttribute('aria-disabled') === 'true') {
        const room = this.online.room;
        const min = Number(room?.minPlayers) || 2;
        const online = this.online.players.filter((p) => !p.spectator && p.online === true).length;
        this.toast(`还需要 ${Math.max(1, min - online)} 位在线玩家才能开始牌局。`, {
          kind: 'info', title: '人还不够',
        });
        return;
      }
      audio.init();
      this.el.btnRoomStart.setAttribute('aria-busy', 'true');
      try {
        await service.startGame();
      } catch (error) {
        this.toast(`开始失败：${error.message || '请稍后重试'}`, { kind: 'error', title: '开局失败' });
      } finally {
        this.el.btnRoomStart.removeAttribute('aria-busy');
      }
    });

    this.el.btnRoomLeave.addEventListener('click', () => service.leave());

    if (this.el.btnRoomReady) {
      this.el.btnRoomReady.addEventListener('click', async () => {
        const room = service.room;
        if (!room || !room.match) return;
        const me = service.players.find((player) => player.pid === room.pid);
        const nextReady = !Boolean(me && me.ready);
        this.el.btnRoomReady.disabled = true;
        try {
          await service.setReady(nextReady);
          this.toast(nextReady ? '已准备，等人齐后自动开局' : '已取消准备');
        } catch (error) {
          this.toast(`准备失败：${error.message}`);
        } finally {
          this.el.btnRoomReady.disabled = false;
          this.renderRoom();
        }
      });
    }
    if (this.el.btnHostRoomSave) {
      this.el.btnHostRoomSave.addEventListener('click', async () => {
        if (this.online.mode !== 'host' || !this.online.room) return;
        const [sb, bb] = String(this.el.hostRoomBlind.value || '1/2').split('/').map((n) => Number(n) || 1);
        this.el.btnHostRoomSave.disabled = true;
        try {
          await service.updateRoomConfig({
            startingChips: Number(this.el.hostRoomChips.value) || 100,
            sb,
            bb,
            loserSpectate: Boolean(this.el.hostRoomSpectate.checked),
          });
          this.toast('房主设置已保存');
          this.renderRoom();
        } catch (error) {
          this.toast(`保存失败：${error.message}`);
        } finally {
          this.el.btnHostRoomSave.disabled = false;
        }
      });
    }

    service.on('players', (data) => {
      this.handleRoomRoster(data && Array.isArray(data.players) ? data.players : []);
      this.renderRoom();
      // 如果 started 事件在断线期间错过，players 里的 started 也能把玩家带回牌桌
      if (data && data.started && this.mode !== 'single' && !this.online.room?.waiting) this.handleOnlineStarted();
    });
    service.on('host', (data) => {
      if (this.mode === 'single') return;
      if (this.online.room && data && data.pid === this.online.room.pid) {
        this.online.mode = 'host';
        this.toast('房主已离开，你已成为新房主', { kind: 'success', title: '身份变更' });
      }
      this.renderRoom();
    });
    service.on('account', (account) => {
      if (this.accountUI) this.accountUI.notifyAccount(account);
      this.renderRoom();
    });
    service.on('connection', ({ ok }) => {
      if (!this.online.room) return;
      if (!ok) {
        if (this.connectionLost) return;
        this.connectionLost = true;
        if (this.connectionLostTimer) clearTimeout(this.connectionLostTimer);
        // 后台切换/瞬时网络抖动 5 秒内不打扰玩家。
        this.connectionLostTimer = setTimeout(() => {
          this.connectionLostTimer = null;
          if (this.connectionLost) {
            this.toast('正在恢复牌桌连接；座位和筹码会保留。', { kind: 'warn', title: '正在重连' });
          }
        }, 5000);
      } else if (this.connectionLost) {
        this.connectionLost = false;
        if (this.connectionLostTimer) clearTimeout(this.connectionLostTimer);
        this.connectionLostTimer = null;
        this.toast('牌桌连接已恢复，可以继续操作。', { kind: 'success', title: '已重连' });
      }
    });
    window.addEventListener('offline', () => {
      this.toast('网络已断开。单机不受影响；联机操作会在网络恢复后继续。', {
        kind: 'warn', title: '网络未连接', duration: 5200,
      });
    });
    window.addEventListener('online', () => {
      this.toast('网络已恢复。', { kind: 'success', title: '已联网' });
    });
    service.on('evicted', (data) => {
      if (this.mode === 'single') return;
      this.el.onlineRoster?.classList.add('hidden');
      this.online3d?.hide();
      this.guestTable.hide();
      this.hideRoom();
      this.toast((data && data.message) || '已退出房间', { kind: 'warn' });
      service.leave();
      this.backToLobby();
      if (this.accountUI) this.accountUI.renderAccount();
    });
    service.on('started', () => {
      if (this.mode === 'single') return;
      this.handleOnlineStarted();
    });
    service.on('state', (state) => {
      if (this.mode === 'single') return;
      const room = this.online.room;
      const meInHand = Boolean(room && state.seats?.some((seat) => seat.pid === room.pid));
      if (room?.waiting && !meInHand) {
        // Keep the latest state for the upcoming hand, but show a real
        // progress/waiting screen instead of leaving the player stuck in
        // the lobby overlay.
        this.online3d?.applyState(state);
        this.updateJoinLoading(
          `本手进行中 · 当前 ${state.seats?.length || 0} 人在座 · 已为你保留座位，结束后自动入座`,
          58,
        );
        this.renderOnlineRoster();
        return;
      }
      if (room?.waiting && meInHand) {
        room.waiting = false;
        this.hideJoinLoading();
        this.handleOnlineStarted();
      }
      this.hideRoom();
      if (this.online3d) this.online3d.applyState(state);
      else this.guestTable.applyState(state);
    });
    service.on('direct', (data) => {
      if (this.mode === 'single') return;
      if (this.online3d) {
        this.online3d.setHole(data);
        return;
      }
      if (data && Number.isInteger(data.seat)) this.guestTable.setYou(data);
    });
    service.on('closed', (data) => {
      if (this.mode === 'single') return;
      this.el.onlineRoster?.classList.add('hidden');
      this.online3d?.hide();
      this.guestTable.hide();
      this.hideRoom();
      const reason = data && data.reason;
      this.toast(reason || '房间已关闭', { kind: 'info' });
      this.hideOnlineGameOver();
      service.leave();
      this.backToLobby();
    });
    service.on('gameover', (data) => {
      if (this.mode === 'single') return;
      // 结算确认框已经弹出时，服务端结束牌局也不要立刻掀桌，
      // 让玩家保留结算画面并自行选择重开或退出。
      if (this.onlineGameOverOpen) {
        this.toast((data && data.reason) || '本局结束，请选择重开或退出', { kind: 'info', title: '牌局结束' });
        return;
      }
      // 好友房全下/清池后仍保留牌桌和结算，不要掀桌把人送回大厅。
      if (service.room && !service.room.match) {
        this.toast((data && data.reason) || '本局结束，仍可留在房间查看结算', { kind: 'info', title: '牌局结束' });
        return;
      }
      this.online3d?.hide();
      this.guestTable.hide();
      this.hideRoom();
      this.toast((data && data.reason) || '本局结束', { kind: 'info', title: '牌局结束' });
    });
    service.on('voice-active', (data) => {
      if (this.mode === 'single') return;
      const speakers = Array.isArray(data?.speakers)
        ? data.speakers.filter((item) => item && item.name)
        : (data?.name ? [{ pid: data.pid, name: data.name }] : []);
      this.setVoiceSpeakers(speakers);
    });
    service.on('notice', (data) => {
      if (this.mode === 'single') return;
      if (data && data.message) this.toast(data.message, { kind: 'info' });
    });
    window.addEventListener('poker-version-mismatch', (event) => {
      this.updateRequired = true;
      const message = event?.detail?.error
        || '版本不一致，请更新后再联机';
      this.toast(message, { kind: 'warn', title: '版本不一致' });
      this.checkForUpdate({ silent: true });
    });
    service.on('actionError', (data) => {
      if (this.mode === 'single') return;
      if (data && data.message) this.toast(data.message, { kind: 'warn', title: '操作未完成' });
    });
    service.on('left', () => {
      this.clearRoomRoster();
      this.el.onlineRoster?.classList.add('hidden');
      if (this.online3d?.active) this.online3d.hide();
      this.guestTable.hide();
      this.hideRoom();
    });
  }

  setLobbyMode(mode) {
    const next = ['match', 'friend', 'single'].includes(mode) ? mode : 'single';
    this.mode = next;
    document.querySelectorAll('.mode-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.mode === next);
    });
    const single = next === 'single';
    this.el.singlePanel.classList.toggle('hidden', !single);
    // 进入好友房直接展开全部创建参数，不再让用户在一个两行高的区域里挤着滚。
    if (next === 'friend' && !this.online.room) {
      this.el.createForm.classList.remove('hidden');
      if (!this.el.createName.value.trim() || this.el.createName.value === '房主') {
        const name = this.account?.account?.name;
        if (name) this.el.createName.value = `${name}的牌桌`;
      }
    }
    this.el.lanPanel.classList.toggle('hidden', next !== 'friend');
    this.el.onlinePanel.classList.toggle('hidden', next !== 'match');
    this.el.btnStart.classList.toggle('hidden', !single);
    if (next === 'match') this.refreshMatchRooms();
    if (next === 'friend') this.refreshLanRooms();
  }

  chipsRefillHint() {
    const account = this.account?.account;
    const grant = Number(account?.chipGrant) || 100;
    const interval = chipIntervalLabel(account?.chipRefillMinutes);
    const at = Number(account?.chipsRefillAt) || 0;
    if (at > Date.now()) {
      const mins = Math.max(1, Math.ceil((at - Date.now()) / 60000));
      return `约 ${mins} 分钟后检测：低于 ${grant} 补足到 ${grant}`;
    }
    return `每 ${interval} 检测一次：低于 ${grant} 补足到 ${grant}`;
  }

  matchBlockReason() {
    if (!this.features.matchEnabled) {
      return {
        kind: 'warn',
        title: '在线匹配暂未开放',
        message: '管理员暂时关闭了在线匹配。你仍可以玩单机牌桌或好友房间。',
        status: '在线匹配暂未开放',
      };
    }
    if (!this.account || !this.account.loggedIn) {
      return {
        kind: 'info',
        title: '在线匹配需要登录',
        message: '登录后系统会自动为你寻找真实玩家；游客也可以先玩单机牌桌。',
        status: '登录后可在线匹配',
        login: true,
      };
    }
    if (navigator.onLine === false) {
      return {
        kind: 'warn',
        title: '网络未连接',
        message: '当前设备没有网络，请连接 Wi-Fi 或移动网络后再试。',
        status: '网络未连接',
      };
    }
    const chips = Number(this.account.chips) || 0;
    if (chips < 1) {
      return {
        kind: 'warn',
        title: '筹码不足，暂时无法匹配',
        message: `在线匹配至少需要 1 筹码，当前 ${chips}。${this.chipsRefillHint()}；也可以先玩单机牌桌。`,
        status: `筹码不足 · 每 ${chipIntervalLabel(this.account?.account?.chipRefillMinutes)}检测，低于 ${Number(this.account?.account?.chipGrant) || 100} 补足`,
      };
    }
    return null;
  }

  setMatchHint(text, tone = 'info') {
    if (!this.el.matchHint) return;
    this.el.matchHint.textContent = text || '';
    this.el.matchHint.dataset.tone = tone;
    this.el.matchHint.classList.toggle('hidden', !text);
  }

  setLanHint(text, tone = 'info') {
    if (!this.el.lanHint) return;
    this.el.lanHint.textContent = text || '';
    this.el.lanHint.dataset.tone = tone;
    this.el.lanHint.classList.toggle('hidden', !text);
  }

  showMatchBlocked(reason) {
    if (!reason) return;
    if (this.el.cardMatchStatus) {
      this.el.cardMatchStatus.textContent = reason.status;
      this.el.cardMatchStatus.dataset.tone = reason.kind;
    }
    this.setMatchHint(reason.message, reason.kind);
    this.toast(reason.message, { kind: reason.kind, title: reason.title });
    if (reason.login && this.accountUI) this.accountUI.openLogin('login');
  }

  setQuickMatchBusy(busy) {
    const btn = this.el.btnQuickMatch;
    if (!btn) return;
    if (busy) {
      if (!this.quickMatchLabel) this.quickMatchLabel = btn.innerHTML;
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('is-busy');
      btn.innerHTML = '<span>正在匹配…</span><small>正在寻找牌桌</small>';
    } else {
      btn.removeAttribute('aria-busy');
      btn.classList.remove('is-busy');
      if (this.quickMatchLabel) {
        btn.innerHTML = this.quickMatchLabel;
        this.quickMatchLabel = '';
      }
    }
  }

  friendlyMatchError(error) {
    const status = Number(error?.status) || 0;
    if (status === 401) {
      return {
        kind: 'warn', title: '登录状态已失效', login: true,
        message: '登录已过期，请重新登录后再在线匹配。',
      };
    }
    if (status === 403) {
      return {
        kind: 'warn', title: '暂时无法匹配',
        message: error?.message || '当前账号暂时不能参与在线匹配。',
      };
    }
    if (status === 429) {
      return {
        kind: 'warn', title: '操作太频繁',
        message: '请求太频繁了，请等几秒再点一次在线匹配。',
      };
    }
    if (navigator.onLine === false || /failed to fetch|networkerror|load failed/i.test(error?.message || '')) {
      return {
        kind: 'error', title: '连不上匹配服务',
        message: '网络或服务器暂时不可达，请检查网络后重试。',
      };
    }
    return {
      kind: 'error', title: '匹配失败',
      message: `暂时无法在线匹配：${error?.message || '未知错误'}`,
    };
  }

  async quickMatch() {
    if (this.matchPending) {
      this.toast('正在匹配中，请稍候，不需要重复点击。', { kind: 'info', title: '正在匹配' });
      return;
    }
    const blocked = this.matchBlockReason();
    if (blocked) {
      this.showMatchBlocked(blocked);
      return;
    }
    audio.init();
    audio.click();
    this.matchPending = true;
    this.setQuickMatchBusy(true);
    this.setMatchHint('正在为你寻找牌桌，请稍候…', 'info');
    if (this.el.cardMatchStatus) {
      this.el.cardMatchStatus.textContent = '正在匹配…';
      this.el.cardMatchStatus.dataset.tone = 'info';
    }
    try {
      await this.online.quickMatch();
      const code = this.online.room?.code;
      const waiting = Boolean(this.online.room?.waiting);
      this.showRoom();
      this.setMatchHint(code
        ? (waiting ? `已进入匹配房间 ${code}，本手结束后自动入座。` : `已进入匹配房间 ${code}，等待其他玩家。`)
        : '已进入匹配房间，等待其他玩家。', 'success');
      this.toast(code
        ? (waiting ? `已进入匹配房间 ${code}，本手结束后自动入座。` : `已进入匹配房间 ${code}，等待其他玩家加入。`)
        : '已进入匹配房间，等待其他玩家加入。', {
        kind: 'success', title: waiting ? '等待下一手' : '匹配成功',
      });
    } catch (error) {
      const friendly = this.friendlyMatchError(error);
      this.setMatchHint(friendly.message, friendly.kind);
      this.toast(friendly.message, { kind: friendly.kind, title: friendly.title });
      if (friendly.login && this.accountUI) this.accountUI.openLogin('login');
      this.updateMatchStatus();
    } finally {
      this.matchPending = false;
      this.setQuickMatchBusy(false);
      this.refreshMatchRooms();
    }
  }

  setScene(sceneId) {
    const preset = getScene(sceneId);
    if (this.el.sceneBadge) {
      this.el.sceneBadge.classList.remove('hidden');
      this.el.sceneBadge.querySelector('b').textContent = preset.name;
      this.el.sceneBadge.dataset.scene = sceneId;
    }
  }

  syncAdminButton() {
    const admin = Boolean(this.account?.account?.isAdmin);
    this.el.btnAdminConsole?.classList.toggle('hidden', !admin);
    this.el.adminScenePicker?.classList.toggle('hidden', !admin);
    if (admin && this.el.adminSceneSelect) this.el.adminSceneSelect.value = this.config.scene || 'private';
    const loggedIn = Boolean(this.account?.loggedIn);
    this.el.btnCareer?.classList.toggle('hidden', !loggedIn);
    if (!admin) this.adminConsole?.close?.();
  }

  openCareer() {
    if (!this.account?.loggedIn) {
      this.accountUI?.openLogin?.('login');
      return;
    }
    if (this.careerPanel?.open) {
      this.careerPanel.open();
      return;
    }
    this.toast('生涯界面尚未加载，请稍后再试', { kind: 'warn', title: '生涯' });
  }

  openAdminConsole() {
    const token = this.account?.token;
    if (!this.account?.account?.isAdmin || !token) {
      this.toast('当前账号没有后台管理权限', { kind: 'warn', title: '权限不足' });
      return;
    }
    if (this.adminConsole?.open) {
      this.adminConsole.open();
      this.el.btnAdminConsole?.blur();
      return;
    }
    this.toast('后台管理界面尚未加载，请重新进入大厅', { kind: 'warn', title: '后台管理' });
  }

  openLobbySettings() {
    if (this.accountUI) this.accountUI.openSettings();
  }

  showRoom() {
    const room = this.online.room;
    if (!room) return;
    if (this.rosterRoomCode !== room.code) {
      this.rosterRoomCode = room.code;
      this.lastRoomRoster = new Map();
      this.roomHadOther = false;
    }
    this.el.roomOverlay.classList.remove('hidden');
    this.renderOnlineRoster();
    this.el.roomTitle.textContent = room.match ? (room.name || '匹配房间') : `房间 ${room.code}`;
    this.el.roomCode.textContent = room.code;
    this.el.roomPass.textContent = room.match ? '自动匹配' : (room.password || '---');
    const passLabel = this.el.roomPass.previousElementSibling;
    if (passLabel) passLabel.classList.toggle('hidden', Boolean(room.match));
    this.el.roomPass.classList.toggle('hidden', Boolean(room.match));
    this.el.btnRoomStart.classList.toggle('hidden', this.online.mode !== 'host');
    this.el.roomHint.textContent = room.waiting
      ? '已加入房间，本手结束后自动入座；现在可以等待，不需要重新输入口令。'
      : (room.match
        ? '匹配房间：满 2 人在线后开始 1 分钟倒计时，倒计时结束立即开局；最多 8 人。'
        : (this.online.mode === 'host'
          ? `把房间号与口令告诉好友 · 初始 ${room.startingChips || 100} 筹码 · 盲注 ${room.sb || 1}/${room.bb || 2}${room.loserSpectate ? ' · 输家观战' : ''}`
          : `已加入房间，等待房主开始 · 初始 ${room.startingChips || 100} 筹码 · 盲注 ${room.sb || 1}/${room.bb || 2}`));
    this.renderRoom();
    this.refreshMatchRooms();
  }

  ensureLoggedIn() {
    if (!this.account || !this.account.loggedIn) {
      this.toast('在线房间需要先登录账号；登录后即可在线匹配或加入好友房。', {
        kind: 'info', title: '需要登录',
      });
      if (this.accountUI) this.accountUI.openLogin('login');
      return false;
    }
    return true;
  }

  ensureOnlineReady() {
    if (this.updateRequired) {
      this.el.updateModal.classList.remove('hidden');
      this.toast('请先更新到最新版本再联机', { kind: 'warn', title: '必须更新' });
      return false;
    }
    const blocked = this.matchBlockReason();
    if (blocked) {
      this.showMatchBlocked(blocked);
      return false;
    }
    return true;
  }

  ensureLanReady() {
    if (this.updateRequired) {
      this.el.updateModal.classList.remove('hidden');
      this.toast('请先更新到最新版本再联机', { kind: 'warn', title: '必须更新' });
      return false;
    }
    if (!this.features.lanEnabled) {
      const message = '好友房间暂未开放；你仍可以玩单机牌桌。';
      this.setLanHint(message, 'warn');
      this.toast(message, { kind: 'warn', title: '好友房暂未开放' });
      return false;
    }
    if (!this.account || !this.account.loggedIn) {
      const message = '创建或加入好友房需要先登录账号；登录后会保留你的好友房记录。';
      this.setLanHint(message, 'info');
      this.toast(message, { kind: 'info', title: '好友房需要登录' });
      if (this.accountUI) this.accountUI.openLogin('login');
      return false;
    }
    this.setLanHint('', 'info');
    return true;
  }

  updateMatchStatus() {
    if (!this.el.cardMatchStatus) return;
    const blocked = this.matchBlockReason();
    if (blocked) {
      this.el.cardMatchStatus.textContent = blocked.status;
      this.el.cardMatchStatus.dataset.tone = blocked.kind;
      if (!this.matchPending) this.setMatchHint(blocked.message, blocked.kind);
      return;
    }
    const online = Number(this.el.onlineCount?.textContent) || 0;
    this.el.cardMatchStatus.textContent = online > 0
      ? `当前 ${online} 人在线 · 有筹码即可匹配`
      : '有筹码即可匹配';
    this.el.cardMatchStatus.dataset.tone = 'ok';
    if (!this.matchPending) this.setMatchHint('', 'info');
  }

  clearRoomRoster() {
    if (this.roomAutoReturnTimer) {
      clearTimeout(this.roomAutoReturnTimer);
      this.roomAutoReturnTimer = null;
    }
    this.lastRoomRoster = new Map();
    this.rosterRoomCode = '';
    this.roomHadOther = false;
  }

  scheduleEmptyRoomReturn(leftName = '') {
    if (this.roomAutoReturnTimer) return;
    const check = () => {
      const room = this.online.room;
      if (!room) return;
      const present = (this.online.players || []).filter((player) => player.online !== false);
      if (present.length > 1) {
        this.roomAutoReturnTimer = null;
        return;
      }
      if (this.el.onlineGameOver && !this.el.onlineGameOver.classList.contains('hidden')) {
        this.roomAutoReturnTimer = null;
        return;
      }
      const phase = this.online3d?.state?.phase;
      if (room.started && this.online3d?.active && phase !== 'settle') {
        this.roomAutoReturnTimer = setTimeout(check, 1500);
        return;
      }
      this.roomAutoReturnTimer = null;
      this.toast('房间已没有其他玩家，已返回大厅。', { kind: 'info', title: '房间已空' });
      this.exitOnlineGame();
    };
    this.toast(`${leftName ? `${leftName} 已离开，` : ''}房间只剩你一个人；2.5 秒后返回大厅。`, {
      kind: 'warn', title: '玩家离开',
    });
    this.roomAutoReturnTimer = setTimeout(check, 2500);
  }

  setRosterOpen(open) {
    this.rosterOpen = Boolean(open);
    this.el.btnOnlineRoster?.setAttribute('aria-expanded', this.rosterOpen ? 'true' : 'false');
    this.el.onlineRoster?.classList.toggle('is-open', this.rosterOpen);
    this.el.onlineRosterPanel?.classList.toggle('hidden', !this.rosterOpen);
  }

  renderOnlineRoster() {
    const el = this.el.onlineRoster;
    if (!el) return;
    const room = this.online.room;
    const players = this.online.players || [];
    const roomOverlayVisible = this.el.roomOverlay && !this.el.roomOverlay.classList.contains('hidden');
    if (!room || !players.length || roomOverlayVisible) {
      el.classList.add('hidden');
      this.setRosterOpen(false);
      return;
    }
    const onlineCount = players.filter((player) => player.online !== false).length;
    if (this.el.onlineRosterCount) this.el.onlineRosterCount.textContent = String(onlineCount);
    if (this.el.onlineRosterVoice) {
      const speakingCount = this.voiceSpeakers.size;
      this.el.onlineRosterVoice.classList.toggle('hidden', !speakingCount);
      const em = this.el.onlineRosterVoice.querySelector('em');
      if (em) em.textContent = String(speakingCount);
      this.el.onlineRosterVoice.title = speakingCount ? `${speakingCount} 人正在发言` : '';
    }
    if (this.el.btnOnlineRoster) {
      this.el.btnOnlineRoster.title = `在线 ${onlineCount} 人 · ${this.voiceSpeakers.size} 人发言，点击${this.rosterOpen ? '收起' : '展开'}`;
    }
    const statusOf = (player) => {
      if (player.online === false) return { cls: 'offline', label: '离线' };
      if (player.spectator) return { cls: 'spectator', label: '观战中' };
      if (player.waitingNext) return { cls: 'waiting', label: '等待入座' };
      if (room.started) return { cls: 'playing', label: '游玩中' };
      if (player.ready) return { cls: 'ready', label: '已准备' };
      return { cls: 'not-ready', label: '未准备' };
    };
    const speakingCount = this.voiceSpeakers.size;
    this.el.onlineRosterPanel.innerHTML = `<div class="roster-table-head"><span>玩家</span><span>状态</span><span>发言</span></div>` + players.map((player) => {
      const { cls, label } = statusOf(player);
      const self = player.pid === room.pid;
      const speaking = this.voiceSpeakers.has(Number(player.pid)) ? '发言中' : '';
      return `<span class="roster-chip ${cls}${self ? ' self' : ''}" title="${escapeHtml(`${player.name} · ${label}${speaking ? ' · ' + speaking : ''}`)}">`
        + `<i class="roster-dot ${cls}"></i>`
        + `<span class="roster-name">${player.host ? '<b>♛</b>' : ''}${escapeHtml(player.name)}${self ? '（你）' : ''}</span>`
        + `<em>${label}</em>`
        + `<b class="roster-speaking${speaking ? ' on' : ''}">${speaking}</b>`
        + '</span>';
    }).join('');
    el.classList.remove('hidden');
    this.el.onlineRosterPanel.classList.toggle('hidden', !this.rosterOpen);
    this.el.btnOnlineRoster?.setAttribute('aria-expanded', this.rosterOpen ? 'true' : 'false');
  }

  handleRoomRoster(players) {
    const room = this.online.room;
    if (!room) return;
    if (this.rosterRoomCode !== room.code) {
      this.rosterRoomCode = room.code;
      this.lastRoomRoster = new Map();
      this.roomHadOther = false;
    }
    const previous = this.lastRoomRoster;
    const current = new Map((players || []).map((player) => [player.pid, player]));
    const departed = [];
    for (const [pid, old] of previous) {
      if (pid === room.pid || old.spectator) continue;
      const now = current.get(pid);
      if (!now) {
        departed.push(old.name || '玩家');
        this.toast(`${old.name || '玩家'} 已离开房间`, { kind: 'warn', title: '玩家离开' });
        continue;
      }
      if (old.online !== false && now.online === false) {
        this.toast(`${now.name || '玩家'} 已离线，正在等待重新连接。`, { kind: 'warn', title: '玩家离线' });
      }
      if (!old.ready && now.ready && now.online !== false) {
        this.toast(`${now.name || '玩家'} 已准备`, { kind: 'success', title: '准备状态' });
      } else if (old.ready && !now.ready && now.online !== false) {
        this.toast(`${now.name || '玩家'} 取消了准备`, { kind: 'info', title: '准备状态' });
      }
    }
    this.lastRoomRoster = current;
    this.renderOnlineRoster();
    this.renderJoinLoadingPlayers();
    if (this.isVoicePanelOpen()) this.renderVoicePanel();
    const present = (players || []).filter((player) => player.online !== false);
    if (present.length >= 2) this.roomHadOther = true;
    if (departed.length && present.length <= 1) {
      this.scheduleEmptyRoomReturn(departed[0]);
    } else if (present.length > 1 && this.roomAutoReturnTimer) {
      clearTimeout(this.roomAutoReturnTimer);
      this.roomAutoReturnTimer = null;
    }
  }

  maybeReturnAbandonedRoom(state) {
    if (!state || state.phase !== 'settle' || this.onlineGameOverOpen) return;
    const present = (this.online.players || []).filter((player) => player.online !== false);
    if (present.length <= 1 && this.roomHadOther) {
      this.scheduleEmptyRoomReturn('');
    }
  }

  maybeShowOnlineGameOver(state, me) {
    if (!state || state.phase !== 'settle' || !me || !this.el.onlineGameOver) return;
    const players = Array.isArray(state.seats) ? state.seats : [];
    const active = players.filter((seat) => Number(seat.stack) > 0);
    const headsUp = players.length <= 2;
    const onlyOne = active.length <= 1;
    const someoneBusted = players.some((seat) => Number(seat.stack) <= 0);
    const busted = Number(me.stack) <= 0;
    if (!busted && !(onlyOne && someoneBusted)) {
      if (!this.onlineGameOverOpen) this.clearOnlineGameOverDelay();
      return;
    }
    const hand = Number(state.hand) || 1;
    if (this.onlineGameOverDismissed === hand) return;
    if (this.onlineGameOverOpen && this.onlineGameOverHand === hand) return;
    // 一手结束后先让结算面板完整展示 15 秒，再弹重开/退出确认。
    // 服务端在结算后也保留牌桌 15 秒宽限，避免确认框刚出现房间就被重置。
    const roomCode = this.online.room?.code || '';
    if (this.onlineGameOverPendingHand === hand && this.onlineGameOverPendingRoom === roomCode) return;
    this.onlineGameOverPendingHand = hand;
    this.onlineGameOverPendingRoom = roomCode;
    this.onlineGameOverPendingState = state;
    this.onlineGameOverPendingMe = me;
    if (this.onlineGameOverTimer) clearTimeout(this.onlineGameOverTimer);
    this.onlineGameOverTimer = setTimeout(() => {
      this.onlineGameOverTimer = null;
      if (!this.online || (this.online.room?.code || '') !== roomCode) return;
      const latestHand = Number(this.online3d?.state?.hand || hand) || hand;
      if (latestHand !== hand) return;
      const latest = this.online3d?.state || this.onlineGameOverPendingState;
      const latestMe = latest?.seats?.find((seat) => seat.pid === this.online.room?.pid) || this.onlineGameOverPendingMe;
      if (!latest || latest.phase !== 'settle' || !latestMe) return;
      this.renderOnlineGameOver(latest, latestMe);
    }, 15000);
  }

  clearOnlineGameOverDelay() {
    if (this.onlineGameOverTimer) clearTimeout(this.onlineGameOverTimer);
    this.onlineGameOverTimer = null;
    this.onlineGameOverPendingHand = 0;
    this.onlineGameOverPendingRoom = '';
    this.onlineGameOverPendingState = null;
    this.onlineGameOverPendingMe = null;
  }

  renderOnlineGameOver(state, me) {
    const players = Array.isArray(state.seats) ? state.seats : [];
    const active = players.filter((seat) => Number(seat.stack) > 0);
    const headsUp = players.length <= 2;
    const onlyOne = active.length <= 1;
    const busted = Number(me.stack) <= 0;
    const hand = Number(state.hand) || 1;
    this.onlineGameOverHand = hand;
    const room = this.online.room;
    const isMatch = Boolean(room?.match);
    const isHost = this.online.mode === 'host';
    const canRestart = !isMatch && isHost && onlyOne;
    const canWatch = !headsUp && !onlyOne;
    this.el.btnGameOverRestart.classList.toggle('hidden', !canRestart);
    this.el.btnGameOverWatch.classList.toggle('hidden', !canWatch);
    if (isMatch) {
      this.el.onlineGameOverTitle.textContent = busted ? '筹码不足，本局结束' : '牌局结束';
      this.el.onlineGameOverText.textContent = busted
        ? `你的筹码已经用完，在线匹配不会补充筹码。请退出房间；每小时检测一次，低于 ${Number(this.account?.account?.chipGrant) || 100} 会补足到 ${Number(this.account?.account?.chipGrant) || 100} 筹码。`
        : '当前牌局已经结束，请退出房间重新匹配。';
    } else if (canRestart) {
      this.el.onlineGameOverTitle.textContent = '本局结束';
      this.el.onlineGameOverText.textContent = `是否继续游戏？继续会把所有玩家筹码重新分配为初始 ${Number(room?.startingChips) || 100}，然后重新发牌。`;
    } else if (busted && !onlyOne) {
      this.el.onlineGameOverTitle.textContent = '你的筹码已用完';
      this.el.onlineGameOverText.textContent = '本手结束后你将不能再行动。可以继续观战，或退出房间。';
    } else {
      this.el.onlineGameOverTitle.textContent = '本局结束';
      this.el.onlineGameOverText.textContent = '有玩家筹码已经用完。等待房主重新分配筹码继续，或退出房间。';
    }
    this.el.onlineGameOver.classList.remove('hidden');
    this.onlineGameOverOpen = true;
    this.clearOnlineGameOverDelay();
  }

  hideOnlineGameOver() {
    this.clearOnlineGameOverDelay();
    this.el.onlineGameOver?.classList.add('hidden');
    this.onlineGameOverOpen = false;
  }

  async restartOnlineGame() {
    if (!this.online.room) return;
    this.el.btnGameOverRestart.disabled = true;
    try {
      await this.online.restartRoom();
      this.hideOnlineGameOver();
      this.toast('筹码已重新分配，新一手开始。', { kind: 'success', title: '继续游戏' });
    } catch (error) {
      this.toast(`重新开始失败：${error.message || '请稍后重试'}`, { kind: 'error', title: '操作失败' });
    } finally {
      this.el.btnGameOverRestart.disabled = false;
    }
  }

  exitOnlineGame() {
    this.hideOnlineGameOver();
    this.hideSettlement();
    this.online3d?.hide();
    this.online.leave();
    this.hideRoom();
    this.backToLobby();
  }

  updateLanHint() {
    if (!this.features.lanEnabled) {
      this.setLanHint('好友房间暂未开放；你仍可以玩单机牌桌。', 'warn');
      return;
    }
    if (!this.account || !this.account.loggedIn) {
      this.setLanHint('登录后点击下方房间即可加入；昵称会自动使用当前账号昵称。', 'info');
      return;
    }
    this.setLanHint('', 'info');
  }

  async refreshLanRooms() {
    if (!this.el.lanRooms) return;
    if (!this.features.lanEnabled) {
      this.el.lanRooms.innerHTML = '<div class="match-empty">好友房间暂未开放，仍可玩单机牌桌。</div>';
      this.setLanHint('好友房间暂未开放。', 'warn');
      return;
    }
    this.updateLanHint();
    if (!this.lanRooms.length) {
      this.el.lanRooms.innerHTML = '<div class="match-empty">正在读取好友房间…</div>';
    }
    this.lanPending = true;
    try {
      const data = await this.account.openRooms();
      if (data.features) {
        this.features = {
          matchEnabled: data.features.matchEnabled !== false,
          lanEnabled: data.features.lanEnabled !== false,
        };
      }
      this.lanRooms = Array.isArray(data.rooms) ? data.rooms : [];
      this.renderLanRooms();
    } catch (error) {
      this.el.lanRooms.innerHTML = '<div class="match-empty">好友房间暂时连不上，请检查网络后点「刷新房间」。</div>';
      this.setLanHint('暂时无法读取好友房间，请稍后刷新。', 'warn');
    } finally {
      this.lanPending = false;
    }
  }

  renderLanRooms() {
    if (!this.el.lanRooms) return;
    if (!this.features.lanEnabled) {
      this.el.lanRooms.innerHTML = '<div class="match-empty">好友房间暂未开放，仍可玩单机牌桌。</div>';
      return;
    }
    if (!this.lanRooms.length) {
      this.el.lanRooms.innerHTML = '<div class="match-empty">暂时没有等待加入的房间。点「创建房间」开一桌，好友就能直接看到。</div>';
      this.updateLanHint();
      return;
    }
    this.el.lanRooms.innerHTML = this.lanRooms.map((room) => {
      const full = !room.joinable || Number(room.players) >= Number(room.seats);
      const status = full ? '已满员' : (room.started ? '进行中 · 等下一手' : '输入口令加入');
      return `<button type="button" class="match-card lan-room-card${full ? ' full' : ''}${room.started ? ' running' : ''}"`
        + ` data-code="${Number(room.code)}" data-name="${escapeHtml(room.name)}"`
        + ` data-creator="${escapeHtml(room.creator || '房主')}"`
        + ` data-players="${Number(room.players) || 0}" data-seats="${Number(room.seats) || 8}"`
        + ` title="${status}">`
        + `<b>${escapeHtml(room.name)}</b>`
        + `<span>房主 ${escapeHtml(room.creator || '房主')} · 房间 ${Number(room.code)} · ${Number(room.players) || 0} / ${Number(room.seats) || 8} 人</span>`
        + `<em>${status}</em>`
        + '</button>';
    }).join('');
  }

  openJoinRoomModal(room) {
    if (!room || !this.el.joinRoomModal) return;
    this.selectedLanRoom = room;
    const me = this.account?.account?.name || '当前账号';
    this.el.joinRoomTitle.textContent = `加入「${room.name || `房间 ${room.code}`}」`;
    this.el.joinRoomMeta.textContent = `房主 ${room.creator || '房主'} · 房间 ${room.code} · ${room.players || 0}/${room.seats || 8} 人 · 昵称自动使用「${me}」`;
    this.el.joinRoomPass.value = '';
    this.el.joinRoomError.textContent = '';
    this.el.joinRoomModal.classList.remove('hidden');
    setTimeout(() => this.el.joinRoomPass.focus(), 60);
  }

  closeJoinRoomModal() {
    this.el.joinRoomModal?.classList.add('hidden');
    this.selectedLanRoom = null;
  }

  showJoinLoading(title, text, progress = 12) {
    if (!this.el.joinLoading) return;
    this.joinLoadingProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    this.el.joinLoading.classList.remove('hidden');
    if (this.el.joinLoadingTitle) this.el.joinLoadingTitle.textContent = title || '正在加入房间';
    if (this.el.joinLoadingText) this.el.joinLoadingText.textContent = text || '';
    if (this.el.joinLoadingBar) this.el.joinLoadingBar.style.width = `${this.joinLoadingProgress}%`;
    this.renderJoinLoadingPlayers();
    if (this.joinLoadingTimer) clearInterval(this.joinLoadingTimer);
    this.joinLoadingTimer = setInterval(() => {
      if (!this.el.joinLoading || this.el.joinLoading.classList.contains('hidden')) return;
      this.joinLoadingProgress = Math.min(88, this.joinLoadingProgress + Math.max(1, (90 - this.joinLoadingProgress) * 0.08));
      if (this.el.joinLoadingBar) this.el.joinLoadingBar.style.width = `${this.joinLoadingProgress.toFixed(1)}%`;
    }, 700);
  }

  updateJoinLoading(text, progress) {
    if (!this.el.joinLoading || this.el.joinLoading.classList.contains('hidden')) {
      this.showJoinLoading('正在进入牌桌', text, progress);
      return;
    }
    if (text && this.el.joinLoadingText) this.el.joinLoadingText.textContent = text;
    if (Number.isFinite(Number(progress))) {
      this.joinLoadingProgress = Math.max(this.joinLoadingProgress, Math.min(95, Number(progress)));
      if (this.el.joinLoadingBar) this.el.joinLoadingBar.style.width = `${this.joinLoadingProgress}%`;
    }
    this.renderJoinLoadingPlayers();
  }

  hideJoinLoading() {
    if (this.joinLoadingTimer) clearInterval(this.joinLoadingTimer);
    this.joinLoadingTimer = null;
    this.el.joinLoading?.classList.add('hidden');
  }

  renderJoinLoadingPlayers() {
    const box = this.el.joinLoadingPlayers;
    if (!box) return;
    const room = this.online.room;
    const players = this.online.players || [];
    if (!room || !players.length) {
      box.innerHTML = '<span class="join-loading-player">正在同步玩家…</span>';
      return;
    }
    box.innerHTML = players.map((player) => {
      const status = player.spectator ? '观战' : (player.waitingNext ? '等待入座' : (player.online === false ? '离线' : '在座'));
      return `<span class="join-loading-player${player.pid === room.pid ? ' self' : ''}">${escapeHtml(player.name)}<em>${status}</em></span>`;
    }).join('');
  }

  async confirmJoinRoom() {
    const room = this.selectedLanRoom;
    if (!room) return;
    if (!this.ensureLanReady()) return;
    const password = this.el.joinRoomPass.value.trim();
    if (!/^\d{3}$/.test(password)) {
      this.el.joinRoomError.textContent = '请输入 3 位数字口令，例如 123。';
      this.el.joinRoomPass.focus();
      return;
    }
    this.el.btnJoinRoomConfirm.disabled = true;
    this.el.joinRoomError.textContent = '';
    audio.init();
    audio.click();
    this.showJoinLoading('正在加入房间', `正在验证口令并连接「${room.name || `房间 ${room.code}`}」…`, 12);
    try {
      const joined = await this.online.joinRoom({ code: room.code, password, roomName: room.name });
      this.closeJoinRoomModal();
      this.updateJoinLoading('已连接房间，正在同步牌桌…', 55);
      const waiting = Boolean(this.online.room?.waiting);
      const spectator = Boolean(joined?.spectator || this.online.room?.spectator);
      if (waiting) {
        this.updateJoinLoading('已加入房间', '本手正在进行，已为你保留座位，结束后自动入座…', 58);
      } else if (spectator) {
        this.updateJoinLoading('已进入观战', '房间已满或你选择观战，正在载入牌桌…', 72);
        this.hideJoinLoading();
        this.handleOnlineStarted();
      } else {
        this.hideJoinLoading();
        this.showRoom();
        this.toast(`已加入「${room.name || `房间 ${room.code}`}」，等待房主开始。`, {
          kind: 'success', title: '加入成功',
        });
      }
      this.refreshLanRooms();
    } catch (error) {
      this.hideJoinLoading();
      this.el.joinRoomError.textContent = error.message || '加入失败，请检查口令。';
      this.toast(`加入失败：${error.message || '请检查口令'}`, { kind: 'error', title: '加入失败' });
    } finally {
      this.el.btnJoinRoomConfirm.disabled = false;
    }
  }

  onAccountChanged() {
    if (this.pendingJoinRoom && this.account?.loggedIn) {
      const room = this.pendingJoinRoom;
      this.pendingJoinRoom = null;
      this.openJoinRoomModal(room);
    }
    this.refreshLanRooms();
  }

  async refreshMatchRooms() {
    if (!this.el.matchRooms) return;
    if (!this.account || !this.account.loggedIn) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">登录后可以查看正在等待的牌桌；点上方「在线匹配」会自动寻找。</div>';
      this.updateMatchStatus();
      return;
    }
    this.updateMatchStatus();
    if (!this.features.matchEnabled) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">在线匹配暂未开放，你仍可以玩单机牌桌或好友房。</div>';
      return;
    }
    if (!this.matchRooms.length) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">正在读取匹配房间…</div>';
    }
    try {
      const data = await this.account.matchRooms();
      if (data.features) {
        this.features = {
          matchEnabled: data.features.matchEnabled !== false,
          lanEnabled: data.features.lanEnabled !== false,
        };
      }
      this.matchRooms = data.rooms || [];
      this.renderMatchRooms();
    } catch (error) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">匹配服务暂时连不上，请检查网络后点「刷新」。</div>';
      this.setMatchHint('暂时无法读取匹配房间，请检查网络后刷新。', 'warn');
    }
  }

  renderMatchRooms() {
    if (!this.el.matchRooms) return;
    if (!this.features.matchEnabled) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">在线匹配暂未开放，你仍可以玩单机牌桌或好友房。</div>';
      return;
    }
    if (!this.matchRooms.length) {
      this.el.matchRooms.innerHTML = '<div class="match-empty">暂无等待中的牌桌。点上方「在线匹配」会自动开一桌。</div>';
      return;
    }
    this.el.matchRooms.innerHTML = this.matchRooms.map((room) => {
      const full = room.joinable === false || Number(room.players) >= Number(room.seats);
      const status = room.started
        ? (full ? '进行中 · 已满员' : '进行中 · 可等下一手')
        : (full ? '已满员' : room.players >= 2 ? '人齐可开局' : '等待加入');
      return `<button type="button" class="match-card${room.started ? ' running' : ''}${full ? ' full' : ''}" data-code="${Number(room.code)}" title="${status}">`
        + `<b>${escapeHtml(room.name)}</b>`
        + `<span>${Number(room.players) || 0} / ${Number(room.seats) || 8} 人</span>`
        + `<em>${status}</em>`
        + '</button>';
    }).join('');
  }

  countdownText(room) {
    if (!room || !room.match || !room.countdownEnd) return '';
    const left = Math.max(0, Math.ceil((room.countdownEnd - Date.now()) / 1000));
    return `开局倒计时 ${left} 秒`;
  }

  startCountdownTicker() {
    if (this.countdownTimer) return;
    this.countdownTimer = setInterval(() => {
      const room = this.online.room;
      const text = this.countdownText(room);
      if (!text) {
        this.stopCountdownTicker();
        this.renderRoom();
        return;
      }
      // 倒计时到 0 后若还没收到开局，主动重连一次，服务端会用 players.started 把牌桌拉回来
      if (room && room.countdownEnd && Date.now() >= room.countdownEnd + 1500 && !this.online.started) {
        if (!this.countdownRecoverAt || Date.now() - this.countdownRecoverAt > 6000) {
          this.countdownRecoverAt = Date.now();
          this.online.connect();
        }
      }
      if (this.el.roomRole) this.el.roomRole.textContent = text;
    }, 1000);
  }

  stopCountdownTicker() {
    if (!this.countdownTimer) return;
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  hideRoom() {
    this.el.roomOverlay.classList.add('hidden');
  }

  renderRoom() {
    const room = this.online.room;
    if (!room) return;
    const seats = Math.min(8, Math.max(2, Number(room.seats) || 8));
    const players = this.online.players.filter((player) => !player.spectator);
    const ordered = [
      ...players.filter((player) => player.host),
      ...players.filter((player) => !player.host),
    ];
    const onlineCount = players.filter((player) => player.online === true).length;
    const me = players.find((player) => player.pid === room.pid);
    const readyCount = players.filter((player) => player.ready && player.online === true).length;
    const minPlayers = Number(room.minPlayers) || 2;
    const chips = this.account && this.account.account ? this.account.account.chips : null;
    const isMatch = Boolean(room.match);
    this.el.roomHint.textContent = room.waiting
      ? '已加入房间，本手结束后自动入座；现在可以等待，不需要重新输入口令。'
      : (isMatch
        ? '匹配房间：全员点「准备」立即开局；未全员准备则满 2 人后等 1 分钟倒计时。最多 8 人。'
        : (this.online.mode === 'host'
          ? `把房间号与口令告诉好友 · 初始 ${room.startingChips || 100} 筹码 · 盲注 ${room.sb || 1}/${room.bb || 2}${room.loserSpectate ? ' · 输家观战' : ''}`
          : `已加入房间，等待房主开始 · 初始 ${room.startingChips || 100} 筹码 · 盲注 ${room.sb || 1}/${room.bb || 2}`));
    const canEditRoom = !isMatch && !room.started && this.online.mode === 'host';
    if (this.el.hostRoomSettings) {
      this.el.hostRoomSettings.classList.toggle('hidden', !canEditRoom);
      if (canEditRoom) {
        if (document.activeElement !== this.el.hostRoomChips) this.el.hostRoomChips.value = String(room.startingChips || 100);
        if (document.activeElement !== this.el.hostRoomBlind) {
          this.el.hostRoomBlind.value = `${room.sb || 1}/${room.bb || 2}`;
        }
        this.el.hostRoomSpectate.checked = Boolean(room.loserSpectate);
      }
    }
    this.el.roomCount.textContent = `在线 ${onlineCount} / ${seats}`
      + (isMatch && chips !== null ? ` · 筹码 ${chips}` : '')
      + (!isMatch ? ` · 初始 ${room.startingChips || 100} · 盲注 ${room.sb || 1}/${room.bb || 2}` : '');
    const countdown = this.countdownText(room);
    this.el.roomRole.textContent = isMatch
      ? (countdown
        ? `${countdown} · 已准备 ${readyCount}/${Math.max(onlineCount, minPlayers)}`
        : (onlineCount >= minPlayers ? `已准备 ${readyCount}/${onlineCount}，全员准备立即开局` : `还需 ${minPlayers - onlineCount} 人匹配`))
      : (this.online.mode === 'host'
        ? (onlineCount >= minPlayers ? '你是房主，可以开始' : `还需 ${minPlayers - onlineCount} 人`)
        : '等待房主开始');
    if (countdown) this.startCountdownTicker();
    else this.stopCountdownTicker();
    const cells = [];
    for (let i = 0; i < seats; i += 1) {
      const player = ordered[i];
      if (player) {
        const status = player.online === true ? '在线' : '离线';
        const roleText = player.host
          ? (player.online === false ? '房主 · 离线' : (player.ready ? '房主 · 已准备' : '房主'))
          : (player.online === false ? (player.ready ? '离线 · 已准备' : '离线') : (player.ready ? '已准备' : status));
        const presence = player.online === false ? 'offline' : (player.ready ? 'ready' : 'not-ready');
        const presenceTitle = player.online === false
          ? `${player.name} 已离线`
          : (player.ready ? `${player.name} 已准备` : `${player.name} 在线，未准备`);
        cells.push(
          `<div class="room-seat filled${player.host ? ' host' : ''}${player.online === true ? '' : ' offline'}${player.ready ? ' is-ready' : ''}">`
          + `<span class="room-seat-index">${i + 1}</span>`
          + `<span class="room-presence ${presence}" title="${escapeHtml(presenceTitle)}"></span>`
          + `<b>${escapeHtml(player.name)}</b>`
          + `<em>${roleText}</em>`
          + '</div>',
        );
      } else {
        cells.push(
          `<div class="room-seat empty"><span class="room-seat-index">${i + 1}</span>`
          + '<b>等待加入</b><em>空位</em></div>',
        );
      }
    }
    this.el.roomPlayers.innerHTML = cells.join('');
    if (this.el.btnRoomReady) {
      this.el.btnRoomReady.classList.toggle('hidden', !isMatch || room.started);
      this.el.btnRoomReady.disabled = !me || me.online !== true;
      this.el.btnRoomReady.textContent = me && me.ready ? '取消准备' : '准备';
      this.el.btnRoomReady.classList.toggle('is-ready', Boolean(me && me.ready));
    }
    this.el.btnRoomStart.classList.toggle('hidden', isMatch || this.online.mode !== 'host');
    const canStart = onlineCount >= minPlayers;
    this.el.btnRoomStart.disabled = false;
    this.el.btnRoomStart.setAttribute('aria-disabled', canStart ? 'false' : 'true');
    this.el.btnRoomStart.title = canStart ? '开始牌局' : `还需要 ${minPlayers - onlineCount} 位在线玩家`;
    this.el.btnRoomStart.textContent = canStart
      ? '开始牌局'
      : `还需 ${minPlayers - onlineCount} 人`;
  }

  handleOnlineStarted() {
    const service = this.online;
    this.hideJoinLoading();
    if (!service.room || this.mode === 'single') return;
    this.hideRoom();
    this.hideOnlineGameOver();
    this.renderOnlineRoster();
    audio.init();
    audio.setMusic(this.config.music !== false);
    audio.setSfx(this.config.sfx !== false);
    audio.setVoice(this.config.voice !== false);
    // Online tables use the same 3D room/table and HUD as single-player.
    if (this.online3d) {
      this.online3d.show();
      return;
    }
    if (!this.guestTable.showing) this.guestTable.show(service.room.code);
  }

  setVoiceAvailable(available) {
    if (!this.el.btnVoice) return;
    this.el.btnVoice.classList.toggle('hidden', !available);
    if (available) {
      this.voiceChat?.armPlayback?.().catch(() => {});
    } else {
      this.closeVoicePanel();
      this.voiceChat?.reset();
      this.setVoiceInputLevel(0);
    }
  }

  isVoicePanelOpen() {
    return Boolean(this.el.voicePanelModal && !this.el.voicePanelModal.classList.contains('hidden'));
  }

  openVoicePanel() {
    if (!this.online.room) {
      this.toast('进入在线牌桌后才能使用房间语音', { kind: 'info', title: '语音' });
      return;
    }
    this.voiceChat?.armPlayback?.().catch(() => {});
    this.el.voicePanelModal.classList.remove('hidden');
    this.renderVoiceMaster();
    this.renderVoicePanel();
    if (this.voicePanelTimer) clearInterval(this.voicePanelTimer);
    this.voicePanelTimer = setInterval(() => this.updateVoicePanelLevels(), 110);
  }

  closeVoicePanel() {
    this.el.voicePanelModal?.classList.add('hidden');
    if (this.voicePanelTimer) {
      clearInterval(this.voicePanelTimer);
      this.voicePanelTimer = null;
    }
    this.voiceChat?.stopMicTest?.('未测试');
  }

  renderVoiceMaster() {
    const chat = this.voiceChat;
    if (!chat || !this.el.btnVoiceMaster) return;
    const enabled = Boolean(chat.enabled);
    const listening = Boolean(chat.listening);
    this.el.btnVoiceMaster.classList.toggle('on', enabled);
    this.el.btnVoiceMaster.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    if (this.el.voiceMasterTitle) {
      this.el.voiceMasterTitle.textContent = enabled
        ? '语音已开启'
        : listening ? '开启麦克风' : '开启语音';
    }
    if (this.el.voiceMasterText) {
      this.el.voiceMasterText.textContent = enabled
        ? '可说话，同时接收所有人 · 点此关闭麦克风'
        : listening
          ? '当前仅接收，点此开启麦克风说话'
          : '点击后开启麦克风，同时接收所有人';
    }
    if (this.el.voiceMasterState) {
      this.el.voiceMasterState.textContent = enabled ? 'ON' : (listening ? 'LISTEN' : 'OFF');
    }
    if (this.el.btnVoiceListenOnly) {
      this.el.btnVoiceListenOnly.classList.toggle('active', listening && !enabled);
    }
    if (this.el.setVoiceReceive) this.el.setVoiceReceive.checked = !chat.isGlobalMuted?.();
  }

  setMicTestState({ running = false, level = 0, status = '未测试', error = false } = {}) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(level) * 100)));
    if (this.el.micTestLevel) this.el.micTestLevel.style.width = `${pct}%`;
    if (this.el.micTestStatus) {
      this.el.micTestStatus.textContent = status || '未测试';
      this.el.micTestStatus.classList.toggle('is-error', Boolean(error));
      this.el.micTestStatus.classList.toggle('is-live', Boolean(running));
    }
    if (this.el.btnMicTest) this.el.btnMicTest.textContent = running ? '停止测试' : '开始测试';
    if (this.el.micTestHint) {
      this.el.micTestHint.textContent = running
        ? '对着麦克风说话，电平条和顶部麦克风图标会随声音变化'
        : '说话时电平条会实时跳动';
    }
    if (running) this.setVoiceInputLevel(level);
  }

  setVoiceInputLevel(level = 0) {
    const value = Math.max(0, Math.min(1, Number(level) || 0));
    if (!this.el.btnVoice) return;
    this.el.btnVoice.style.setProperty('--voice-level', value.toFixed(3));
    this.el.btnVoice.classList.toggle('speaking', value > 0.12);
  }

  voicePlayerRows() {
    const players = (this.online.players || []).filter((player) => !player.spectator);
    const selfPid = Number(this.online.room?.pid) || 0;
    return players
      .slice()
      .sort((a, b) => (a.pid === selfPid ? -1 : b.pid === selfPid ? 1 : Number(a.pid) - Number(b.pid)))
      .map((player) => {
        const pid = Number(player.pid);
        const self = pid === selfPid;
        const level = self
          ? Number(this.voiceChat?.localVisualLevel) || 0
          : Number(this.voiceChat?.remoteLevels?.get(pid)) || 0;
        return { ...player, pid, self, level };
      });
  }

  renderVoicePanel() {
    if (!this.isVoicePanelOpen()) return;
    this.renderVoiceMaster();
    const chat = this.voiceChat;
    const rows = this.voicePlayerRows();
    if (this.el.btnVoiceMuteAll) {
      this.el.btnVoiceMuteAll.textContent = chat?.isGlobalMuted() ? '恢复全部' : '全部静音';
      this.el.btnVoiceMuteAll.classList.toggle('active', Boolean(chat?.isGlobalMuted()));
    }
    if (this.el.voiceDiag) {
      this.el.voiceDiag.textContent = `语音上传 ${chat?.packetsSent || 0} 包 · 接收 ${chat?.packetsReceived || 0} 包`;
    }
    if (!this.el.voicePlayerList) return;
    if (!rows.length) {
      this.el.voicePlayerList.innerHTML = '<p class="voice-empty">房间里暂时没有可显示语音的玩家。</p>';
      return;
    }
    this.el.voicePlayerList.innerHTML = rows.map((player) => {
      const muted = !player.self && chat?.isMuted(player.pid);
      const solo = !player.self && chat?.isSolo(player.pid);
      const speaking = player.level > 0.1;
      const status = player.self
        ? (chat?.micTesting ? '正在测试麦克风' : (chat?.enabled ? '麦克风已开' : '麦克风已关'))
        : (muted ? '已禁音' : (speaking ? '正在说话' : (player.online === false ? '离线' : '在房间内')));
      const initial = escapeHtml(String(player.name || '玩').slice(0, 1));
      const actions = player.self
        ? '<span class="voice-self-tag">我</span>'
        : `<button class="voice-chip ${muted ? 'active' : ''}" type="button" data-voice-mute="${player.pid}">${muted ? '取消禁音' : '禁音'}</button>`
          + `<button class="voice-chip ${solo ? 'solo' : ''}" type="button" data-voice-solo="${player.pid}">${solo ? '取消只听' : '只听'}</button>`;
      return `<div class="voice-player-row ${muted ? 'muted' : ''} ${solo ? 'solo' : ''}" data-voice-row="${player.pid}" style="--level:${Math.min(1, player.level)}">`
        + `<span class="voice-avatar">${initial}</span>`
        + `<span class="voice-player-copy"><b>${escapeHtml(player.name || '玩家')}${player.self ? ' · 我' : ''}</b>`
        + `<small data-voice-status>${status}</small></span>`
        + `<span class="voice-speaker-level" aria-hidden="true"><i></i></span>`
        + `<span class="voice-player-actions">${actions}</span>`
        + '</div>';
    }).join('');
    this.updateVoicePanelLevels();
  }

  updateVoicePanelLevels() {
    if (!this.isVoicePanelOpen() || !this.el.voicePlayerList) return;
    const chat = this.voiceChat;
    for (const row of this.el.voicePlayerList.querySelectorAll('[data-voice-row]')) {
      const pid = Number(row.dataset.voiceRow);
      const isSelf = pid === Number(this.online.room?.pid);
      const level = isSelf
        ? Number(chat?.localVisualLevel) || 0
        : Number(chat?.remoteLevels?.get(pid)) || 0;
      row.style.setProperty('--level', Math.min(1, level).toFixed(3));
      row.classList.toggle('speaking', level > 0.1);
      const status = row.querySelector('[data-voice-status]');
      if (!status) continue;
      if (isSelf) {
        status.textContent = chat?.micTesting
          ? '正在测试麦克风'
          : (chat?.enabled ? '麦克风已开' : '麦克风已关');
      } else if (chat?.isMuted(pid)) {
        status.textContent = '已禁音';
      } else if (chat?.isGlobalMuted()) {
        status.textContent = '全部静音中';
      } else {
        status.textContent = level > 0.1 ? '正在说话' : '在房间内';
      }
    }
    if (this.el.voiceDiag) {
      this.el.voiceDiag.textContent = `语音上传 ${chat?.packetsSent || 0} 包 · 接收 ${chat?.packetsReceived || 0} 包`;
    }
    if (this.el.btnVoiceMuteAll) {
      this.el.btnVoiceMuteAll.textContent = chat?.isGlobalMuted() ? '恢复全部' : '全部静音';
      this.el.btnVoiceMuteAll.classList.toggle('active', Boolean(chat?.isGlobalMuted()));
    }
    if (this.el.voiceMuteBadge) {
      const filtering = chat?.isGlobalMuted() || chat?.soloPid != null
        || (chat?.mutedPids?.size || 0) > 0;
      this.el.voiceMuteBadge.classList.toggle('hidden', !filtering);
    }
  }

  setStoryChallenge(chapter) {
    if (!chapter) return;
    this.el.storyFilter?.classList.remove('hidden');
    this.el.cinemaBars?.classList.remove('hidden');
    this.el.storyChallenge?.classList.remove('hidden');
    this.el.hud?.classList.add('story-playing');
    this.el.hud?.setAttribute('data-story-theme', chapter.theme || 'tide');
    if (this.el.storyChallengeKicker) this.el.storyChallengeKicker.textContent = `CHAPTER ${chapter.index || ''} · STORY MODE`;
    if (this.el.storyChallengeTitle) this.el.storyChallengeTitle.textContent = chapter.title || '';
    if (this.el.storyChallengeObjective) this.el.storyChallengeObjective.textContent = chapter.objective || '';
  }

  clearStoryChallenge() {
    this.el.storyFilter?.classList.add('hidden');
    this.el.cinemaBars?.classList.add('hidden');
    this.el.storyChallenge?.classList.add('hidden');
    this.el.hud?.classList.remove('story-playing');
    this.el.hud?.removeAttribute('data-story-theme');
  }

  setVoiceSpeakers(speakers = []) {
    this.voiceSpeakers = new Map(
      (Array.isArray(speakers) ? speakers : [])
        .filter((item) => item && item.name)
        .map((item) => [Number(item.pid) || 0, item.name]),
    );
    this.renderOnlineRoster();
  }

  showVoiceSpeaking() {
    // 发言状态已集中到右侧“在线”名单，不再占用顶部横条。
  }

  setVoiceState({ enabled = false, pending = false, peers = 0, connected = 0, listening = false } = {}) {
    const btn = this.el.btnVoice;
    if (!btn) return;
    btn.classList.toggle('active', Boolean(enabled));
    btn.classList.toggle('listening', Boolean(listening) && !enabled);
    btn.classList.toggle('connecting', Boolean(pending));
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.title = '语音';
    this.renderVoiceMaster();
    if (this.el.voiceLabel) {
      this.el.voiceLabel.textContent = pending
        ? '连接中'
        : enabled
          ? (connected > 0 ? `语音 ${connected}` : '语音中')
          : listening ? '听语音' : '语音';
    }
    if (this.el.voiceMuteBadge) {
      const filtering = this.voiceChat?.isGlobalMuted?.() || this.voiceChat?.soloPid != null
        || (this.voiceChat?.mutedPids?.size || 0) > 0;
      this.el.voiceMuteBadge.classList.toggle('hidden', !filtering);
    }
  }

  applyLowMotion(enabled) {
    this.config.lowMotion = Boolean(enabled);
    try { localStorage.setItem('pokerLowMotion', enabled ? '1' : '0'); } catch { /* ignore */ }
    document.documentElement.classList.toggle('low-motion', this.config.lowMotion);
    this.scene?.setLowMotion?.(this.config.lowMotion);
    this.online3d?.scene?.setLowMotion?.(this.config.lowMotion);
    if (this.el.setLowMotion) this.el.setLowMotion.checked = this.config.lowMotion;
    if (this.el.optLowMotion) this.el.optLowMotion.checked = this.config.lowMotion;
  }

  syncSettings() {
    const optMusic = document.getElementById('optMusic');
    const optSfx = document.getElementById('optSfx');
    const optVoice = document.getElementById('optVoice');
    if (optMusic) optMusic.checked = this.config.music;
    if (optSfx) optSfx.checked = this.config.sfx;
    if (optVoice) optVoice.checked = this.config.voice;
    if (this.el.setMusic) this.el.setMusic.checked = this.config.music;
    if (this.el.setSfx) this.el.setSfx.checked = this.config.sfx;
    if (this.el.setVoice) this.el.setVoice.checked = this.config.voice;
    if (this.el.setLowMotion) this.el.setLowMotion.checked = this.config.lowMotion;
    if (this.el.optLowMotion) this.el.optLowMotion.checked = this.config.lowMotion;
    document.documentElement.classList.toggle('low-motion', Boolean(this.config.lowMotion));
    if (this.el.setVoiceProfile) this.el.setVoiceProfile.value = audio.voiceProfile;
    if (this.el.setVoiceVolume) this.el.setVoiceVolume.value = this.config.voiceVolume || 'large';
    if (this.el.lobbyVoiceVolume) this.el.lobbyVoiceVolume.value = this.config.voiceVolume || 'large';
  }

  enterGame() {
    for (const scene of [this.scene, this.online3d?.scene]) {
      if (scene) scene.onBoardCardClick = () => this.showBoardZoom();
    }
    this.tryLandscapeLock();
    this.hideSettlement();
    this.resetCards();
    this.el.lobby.classList.add('leaving');
    if (this.lobbyTimer) clearTimeout(this.lobbyTimer);
    this.lobbyTimer = setTimeout(() => {
      this.el.lobby.style.display = 'none';
      this.lobbyTimer = null;
    }, 700);
    this.el.hud.classList.remove('hidden');
  }

  backToLobby() {
    this.hideJoinLoading();
    this.clearStoryChallenge();
    this.el.sceneBadge?.classList.add('hidden');
    this.scene?.applyScene?.('private');
    this.online3d?.scene?.applyScene?.('private');
    audio.setScene?.('private');
    this.clearRoomRoster();
    this.el.onlineRoster?.classList.add('hidden');
    this.stopActionTimer();
    this.finishReady(false);
    this.hideSettlement();
    this.hideOnlineGameOver();
    this.closeSettings();
    this.resetCards();
    if (this.lobbyTimer) {
      clearTimeout(this.lobbyTimer);
      this.lobbyTimer = null;
    }
    this.hideActionBar();
    this.hideBanner();
    this.el.hud.classList.add('hidden');
    this.el.lobby.style.display = '';
    requestAnimationFrame(() => this.el.lobby.classList.remove('leaving'));
    this.el.thinking.classList.add('hidden');
  }

  setSpectatorMode(enabled) {
    this.el.hud?.classList.toggle('spectator-mode', Boolean(enabled));
    this.el.spectatorBadge?.classList.toggle('hidden', !enabled);
    if (enabled) {
      this.hideActionBar();
      this.setHeroHand(null);
      this.setHeroCards([]);
      this.setCardViewerTurnHidden(true);
      // 观战默认关闭麦克风，仍可收听（disable 保留收听通道）。
      if (this.voiceChat?.enabled) this.voiceChat.disable?.().catch(() => {});
    }
  }

  setHandInfo(handNo, sb, bb) {
    this.el.handNo.textContent = `第 ${handNo} 手`;
    this.el.blindInfo.textContent = `盲注 ${fmt(sb)} / ${fmt(bb)}`;
  }

  setPot(value) {
    if (this.el.potValue.textContent === fmt(value)) return;
    this.el.potValue.textContent = fmt(value);
    this.el.potValue.classList.remove('bump');
    void this.el.potValue.offsetWidth;
    this.el.potValue.classList.add('bump');
  }

  setHeroStack(value) {
    this.el.heroStack.textContent = fmt(value);
  }

  setHeroHand(hole, handName = '') {
    if (!hole || hole.length < 2) {
      this.el.heroHand.classList.remove('show');
      this.el.heroHand.innerHTML = '';
      return;
    }
    const suitMarks = { s: '♠', h: '♥', d: '♦', c: '♣' };
    const cards = hole
      .map((card) => {
        const red = card.suit === 'h' || card.suit === 'd';
        return `<span style="color:${red ? '#e08b80' : '#f2ead9'}">${rankLabel(card.rank)}${suitMarks[card.suit]}</span>`;
      })
      .join(' ');
    this.el.heroHand.innerHTML = `<span class="mini-cards">${cards}</span>${handName ? `<span class="hand-name">${handName}</span>` : ''}`;
    this.el.heroHand.classList.add('show');
  }

  sortBestFive(cards) {
    const list = (cards || []).filter(Boolean);
    if (list.length < 2) return list;
    const groups = new Map();
    for (const card of list) {
      const rank = Number(card.rank) || 0;
      if (!groups.has(rank)) groups.set(rank, []);
      groups.get(rank).push(card);
    }
    const ranks = [...groups.keys()].sort((a, b) => b - a);
    // A-2-3-4-5 的轮子顺子按 5-4-3-2-A 展示，A 作为低牌放最后。
    const wheel = list.length === 5
      && groups.size === 5
      && ranks.join(',') === '14,5,4,3,2';
    if (wheel) {
      return [5, 4, 3, 2, 14].flatMap((rank) => groups.get(rank) || []);
    }
    if (groups.size === list.length) {
      return ranks.flatMap((rank) => groups.get(rank) || []);
    }
    // 对子/两对/三条/葫芦/四条：同点数永远挨在一起，先按组大小，再按点数。
    const ordered = [...groups.entries()]
      .sort((a, b) => (b[1].length - a[1].length) || (b[0] - a[0]))
      .flatMap(([, group]) => group);
    return ordered;
  }

  cardTile(card, compact = false) {
    if (!card) {
      return `<div class="card-tile empty${compact ? ' compact' : ''}"><b>·</b></div>`;
    }
    const red = card.suit === 'h' || card.suit === 'd';
    const mark = { s: '♠', h: '♥', d: '♦', c: '♣' }[card.suit] || '';
    const cornerCn = card.suit === 'c' ? '梅' : card.suit === 'h' ? '桃' : '';
    return `<div class="card-tile${red ? ' red' : ''}${compact ? ' compact' : ''}" data-suit="${mark}"><b>${rankLabel(card.rank)}</b><i>${mark}</i>${cornerCn ? `<em class="card-corner-cn">${cornerCn}</em>` : ''}</div>`;
  }

  setHeroCards(hole, handName = '') {
    this.heroCards = (hole || []).slice(0, 2);
    this.heroHandName = handName || '';
    if (this.viewerMode === 'hole') this.renderCardViewer();
  }

  setBoardCards(board) {
    this.boardCards = board || [];
    this.renderBoardRail();
    if (this.boardCards.length) {
      if (this.el.boardZoom && !this.el.boardZoom.classList.contains('hidden')) this.showBoardZoom();
    } else {
      this.hideBoardZoom();
    }
    if (this.viewerMode === 'board') this.renderCardViewer();
  }

  renderBoardRail() {
    const count = this.boardCards.length;
    // 翻牌前一张公共牌都不该在台面/HUD 出现；只渲染已经发出的牌，
    // 不再用 5 张背面占位牌冒充公共牌。
    this.el.boardRail.classList.toggle('hidden', count === 0);
    this.el.boardRailCards.innerHTML = this.boardCards
      .slice(0, 5)
      .map((card) => this.cardTile(card, true))
      .join('');
    this.el.boardStreet.textContent = count === 0
      ? '翻牌前'
      : count <= 3
        ? '翻牌'
        : count === 4
          ? '转牌'
          : '河牌';
  }

  showBoardZoom() {
    if (!this.el.boardZoom || !this.boardCards.length) return;
    this.el.boardZoomCards.innerHTML = this.boardCards.slice(0, 5).map((card) => this.cardTile(card, false)).join('');
    const count = this.boardCards.length;
    this.el.boardZoomStreet.textContent = count <= 3 ? '翻牌圈' : count === 4 ? '转牌圈' : '河牌圈';
    this.el.boardZoom.classList.remove('hidden');
    if (this.boardZoomTimer) clearTimeout(this.boardZoomTimer);
    this.boardZoomTimer = setTimeout(() => this.hideBoardZoom(), 3000);
    audio.click?.();
    this.vibrate?.(8);
  }

  hideBoardZoom() {
    if (this.boardZoomTimer) {
      clearTimeout(this.boardZoomTimer);
      this.boardZoomTimer = null;
    }
    this.el.boardZoom?.classList.add('hidden');
  }

  renderCardViewer() {
    const boardMode = this.viewerMode === 'board';
    this.el.viewerTitle.textContent = boardMode
      ? '公共牌'
      : `你的底牌${this.heroHandName ? ` · ${this.heroHandName}` : ''}`;
    if (boardMode) {
      const tiles = [];
      for (let i = 0; i < 5; i += 1) tiles.push(this.cardTile(this.boardCards[i], true));
      this.el.viewerCards.innerHTML = tiles.join('');
    } else {
      const tiles = [0, 1].map((i) => this.cardTile(this.heroCards[i]));
      this.el.viewerCards.innerHTML = tiles.join('');
    }
    this.el.cardViewer.classList.toggle('board-mode', boardMode);
  }

  toggleCardViewer() {
    this.viewerMode = this.viewerMode === 'hole' ? 'board' : 'hole';
    this.vibrate(8);
    this.renderCardViewer();
  }

  tryLandscapeLock() {
    if (!window.matchMedia?.('(pointer: coarse)')?.matches) return;
    try {
      const lock = screen.orientation?.lock?.('landscape');
      if (lock && typeof lock.catch === 'function') lock.catch(() => {});
    } catch { /* browser may require fullscreen */ }
  }

  setCardsCollapsed(collapsed) {
    this.cardCollapsed = collapsed;
    this.el.cardViewer.classList.toggle('collapsed', collapsed);
    this.el.btnCardExpand.classList.toggle('hidden', !collapsed);
    try {
      localStorage.setItem('pokerCardsCollapsed', collapsed ? '1' : '0');
    } catch {
      /* 存储不可用时忽略 */
    }
    if (!collapsed) this.renderCardViewer();
  }

  openSettings() {
    audio.click();
    this.pauseActionTimer();
    this.syncSettings();
    document.body.classList.add('settings-open');
    const modal = this.el.settingsModal?.querySelector('.settings-modal-v2');
    if (modal) {
      const themes = Array.from({ length: 8 }, (_, i) => `settings-theme-${i + 1}`);
      let next = 1 + Math.floor(Math.random() * 8);
      // 避免连续两次完全重复；仍然保持随机。
      if (next === this.lastSettingsTheme) next = (next % 8) + 1;
      this.lastSettingsTheme = next;
      modal.classList.remove(...themes);
      modal.classList.add(`settings-theme-${next}`);
      modal.dataset.settingsTheme = String(next);
    }
    this.el.settingsModal.classList.remove('hidden');
  }

  async checkForUpdate({ silent = false } = {}) {
    const base = window.__UPDATE_BASE__
      || (/^https?:/.test(location.protocol) ? location.origin : '');
    const currentCode = Number(window.__APP_VERSION_CODE__) || 0;
    const currentName = window.__APP_VERSION__ || 'dev';
    if (!base) {
      if (!silent) this.toast('未配置更新服务地址');
      return;
    }
    if (!silent) this.toast('正在检查更新…');
    try {
      const response = await fetch(`${base}/api/app/latest`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const info = await response.json();
      if (Number(info.versionCode) <= currentCode) {
        this.updateRequired = false;
        this.el.updateModal.classList.remove('force-update');
        this.el.btnUpdateLater.classList.remove('hidden');
        if (!silent) this.toast(`已是最新版本 ${currentName}`);
        return;
      }
      this.updateInfo = info;
      this.updateRequired = true;
      this.resetUpdateProgress();
      this.el.updateTitle.textContent = `必须更新到 ${info.versionName}`;
      this.el.updateNotes.textContent = `当前 v${currentName} 与最新 v${info.versionName} 不一致，必须更新后才能继续联机。`;
      this.el.updateCurrent.textContent = currentName;
      this.el.updateLatest.textContent = info.versionName;
      this.el.updateModal.classList.add('force-update');
      this.el.btnUpdateLater.classList.add('hidden');
      this.el.updateModal.classList.remove('hidden');
    } catch (error) {
      console.warn('[update] check failed', error);
      if (!silent) this.toast('检查更新失败，请检查网络');
    }
  }

  startSocialInvites() {
    if (this.socialTimer) return;
    setTimeout(() => this.pollSocialInvites(), 5000);
    this.socialTimer = setInterval(() => this.pollSocialInvites(), 25000);
  }

  canShowSocialInvite() {
    if (document.hidden) return false;
    if (this.online.room) return false;
    if (this.updateRequired) return false;
    if (Date.now() < this.socialHideUntil) return false;
    const story = document.getElementById('storyScreen');
    if (story && !story.classList.contains('hidden')) return false;
    const login = document.getElementById('loginOverlay');
    if (login && !login.classList.contains('hidden')) return false;
    if (this.el.updateModal && !this.el.updateModal.classList.contains('hidden')) return false;
    if (this.el.settingsModal && !this.el.settingsModal.classList.contains('hidden')) return false;
    if (this.el.singleSettle && !this.el.singleSettle.classList.contains('hidden')) return false;
    const lobbySettings = document.getElementById('lobbySettings');
    if (lobbySettings && !lobbySettings.classList.contains('hidden')) return false;
    const inGame = this.el.hud && !this.el.hud.classList.contains('hidden');
    if (inGame && this.mode !== 'single') return false;
    return true;
  }

  async pollSocialInvites() {
    if (this.socialFetching || !this.canShowSocialInvite()) return;
    this.socialFetching = true;
    try {
      const response = await fetch(`${onlineBase()}/api/match/rooms`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const rooms = (Array.isArray(data.rooms) ? data.rooms : [])
        .filter((room) => Number(room.online) > 0 && room.joinable !== false);
      const waiting = rooms.filter((room) => !room.started);
      const active = rooms.filter((room) => room.started);
      let invite = null;
      if (waiting.length) {
        const total = waiting.reduce((sum, room) => sum + (Number(room.online) || 0), 0);
        const codes = waiting.map((room) => String(room.code)).slice(0, 2).join('、');
        invite = {
          kind: 'waiting',
          key: `waiting:${codes}:${total}`,
          title: total === 1
            ? '在线匹配有 1 位玩家正在等你'
            : `在线匹配已有 ${total} 位玩家在等`,
          sub: `匹配 ${codes} · 点「去匹配」加入`,
        };
      } else if (active.length) {
        const room = active.sort((a, b) => (Number(b.online) || 0) - (Number(a.online) || 0))[0];
        const online = Number(room.online) || 0;
        invite = {
          kind: 'active',
          key: `active:${room.code}:${online}`,
          title: `${room.name || `匹配 ${room.code}`} 有 ${online} 人正在打牌`,
          sub: '下一手可以加入 · 点「去匹配」查看',
        };
      }
      if (!invite) {
        this.hideSocialInvite();
        return;
      }
      const now = Date.now();
      if (invite.key === this.socialLastKey && now - this.socialLastAt < 120000) return;
      if (now - this.socialLastAt < 45000) return;
      this.socialLastKey = invite.key;
      this.socialLastAt = now;
      this.showSocialInvite(invite);
    } catch {
      /* 邀请是增强体验，请求失败静默 */
    } finally {
      this.socialFetching = false;
    }
  }

  showSocialInvite(invite) {
    if (!this.el.socialInvite) return;
    this.el.socialInviteTitle.textContent = invite.title || '';
    this.el.socialInviteSub.textContent = invite.sub || '';
    this.el.socialInvite.dataset.kind = invite.kind || 'waiting';
    this.el.socialInvite.classList.toggle('in-game', Boolean(this.el.hud && !this.el.hud.classList.contains('hidden')));
    this.el.socialInvite.classList.remove('hidden');
  }

  hideSocialInvite(cooldown = 0) {
    this.el.socialInvite?.classList.add('hidden');
    if (cooldown > 0) this.socialHideUntil = Date.now() + cooldown;
  }

  setUpdateProgress(percent = 0, bytes = 0, total = 0) {
    const box = this.el.updateProgress;
    if (!box) return;
    box.classList.remove('hidden');
    const raw = Number(percent) || 0;
    const pct = raw < 0 ? -1 : Math.max(0, Math.min(100, raw));
    if (this.el.updateProgressText) this.el.updateProgressText.textContent = pct < 0 ? '失败' : `${pct}%`;
    if (this.el.updateProgressBar) this.el.updateProgressBar.style.width = pct < 0 ? '0%' : `${pct}%`;
    if (this.el.updateProgressBytes) {
      const mb = (value) => `${(Number(value) / 1024 / 1024).toFixed(1)} MB`;
      if (percent < 0) this.el.updateProgressBytes.textContent = '下载失败，请重试';
      else if (pct >= 100) this.el.updateProgressBytes.textContent = '下载完成，正在打开安装程序…';
      else if (total > 0) this.el.updateProgressBytes.textContent = `${mb(bytes)} / ${mb(total)}`;
      else this.el.updateProgressBytes.textContent = bytes > 0 ? `已下载 ${mb(bytes)}` : '准备下载…';
    }
    if (this.el.btnUpdateNow) {
      this.el.btnUpdateNow.disabled = pct > 0 && pct < 100;
      this.el.btnUpdateNow.textContent = pct >= 100 ? '正在安装…' : (pct < 0 ? '重试下载' : '下载中…');
    }
    this.el.btnUpdateBrowser?.classList.toggle('hidden', pct >= 0);
  }

  bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async downloadApkInWebView(info) {
    const bridge = window.NativeBridge;
    if (!bridge || typeof bridge.beginWebUpdate !== 'function') {
      throw new Error('当前 App 不支持内嵌下载');
    }
    const response = await fetch(info.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || Number(info.size) || 0;
    if (!bridge.beginWebUpdate(total)) throw new Error('无法创建更新文件');
    let received = 0;
    const push = (bytes) => {
      if (!bytes || !bytes.length) return;
      const step = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += step) {
        const part = bytes.subarray(offset, Math.min(bytes.length, offset + step));
        const base64 = this.bytesToBase64(part);
        if (!bridge.appendWebUpdate(base64)) throw new Error('写入更新包失败');
        received += part.length;
        const percent = total > 0 ? Math.min(99, Math.floor(received * 100 / total)) : 0;
        this.setUpdateProgress(percent, received, total);
      }
    };
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        push(value);
      }
    } else {
      push(new Uint8Array(await response.arrayBuffer()));
    }
    if (!received) throw new Error('下载内容为空');
    bridge.finishWebUpdate();
    this.setUpdateProgress(100, received, total || received);
  }

  startUpdateWatchdog() {
    if (this.updateWatchdog) clearTimeout(this.updateWatchdog);
    this.updateWatchdog = setTimeout(() => {
      const text = this.el.updateProgressText?.textContent || '0%';
      const percent = Number.parseInt(text, 10) || 0;
      if (percent < 1) {
        this.setUpdateProgress(-1, 0, 0);
        this.toast('下载没有开始，可点「浏览器下载」', { kind: 'warn', title: '下载超时' });
      }
    }, 15000);
  }

  resetUpdateProgress() {
    if (this.updateWatchdog) clearTimeout(this.updateWatchdog);
    this.updateWatchdog = null;
    this.el.updateProgress?.classList.add('hidden');
    if (this.el.updateProgressBar) this.el.updateProgressBar.style.width = '0%';
    if (this.el.btnUpdateNow) {
      this.el.btnUpdateNow.disabled = false;
      this.el.btnUpdateNow.textContent = '立即更新';
    }
    this.el.btnUpdateBrowser?.classList.add('hidden');
  }

  autoCheckUpdate() {
    if (this.updateChecked) return;
    this.updateChecked = true;
    setTimeout(() => this.checkForUpdate({ silent: true }), 1600);
  }

  closeSettings() {
    document.body.classList.remove('settings-open');
    this.el.settingsModal.classList.add('hidden');
    this.resumeActionTimer();
  }

  showSettlement(data) {
    if (!this.el.singleSettle || !data) return;
    this.settlementData = data;
    this.settlementDone = null;
    this.hideBanner();

    const showdown = Boolean(data.showdown);
    this.el.singleSettleTitle.textContent = showdown ? '本手结算' : '本手结束 · 弃牌获胜';
    this.el.singleSettleTimer.textContent = '15s';
    this.el.btnSettleNext.classList.remove('hidden');

    // 公共牌置顶，固定 5 个牌位，空位不写额外说明
    const board = Array.isArray(data.board) ? data.board : [];
    this.el.singleSettleBoard.innerHTML = Array.from({ length: 5 }, (_, i) => this.cardTile(board[i], true)).join('');

    // 一名玩家一行：序号 / 名称 / 底牌 / 赢面或踢脚 / 获得奖池
    const contenders = Array.isArray(data.contenders) ? data.contenders : [];
    const folded = Array.isArray(data.folded) ? data.folded : [];
    const rows = [
      ...contenders.map((row) => ({ ...row, folded: false })),
      ...folded.map((name) => ({ name, folded: true, hole: [], won: 0, handDetail: '弃牌' })),
    ];

    this.el.singleSettleList.innerHTML = rows.map((row, index) => {
      const holeHtml = showdown && Array.isArray(row.hole) && row.hole.length
        ? row.hole.map((card) => this.cardTile(card, true)).join('')
        : '';
      const finalName = row.folded ? '弃牌' : (row.handName || '—');
      const handText = row.folded ? '' : (row.handDetail || '');
      const wonText = Number(row.won) > 0 ? `+${fmt(row.won)}` : '0';
      const best = Array.isArray(row.bestCards) ? this.sortBestFive(row.bestCards.slice(0, 5)) : [];
      const bestHtml = best.length
        ? best.map((card) => this.cardTile(card, true)).join('')
        : '<em class="settle-best-empty">—</em>';
      return `
        <div class="settle-row${row.winner ? ' is-winner' : ''}${row.folded ? ' is-folded' : ''}">
          <span class="settle-index">${index + 1}</span>
          <span class="settle-name">${escapeHtml(row.name || '玩家')}</span>
          <span class="settle-hole">${holeHtml}</span>
          <span class="settle-hand settle-final" title="${escapeHtml(`${finalName} ${handText}`.trim())}">
            <b>${escapeHtml(finalName)}</b>
            ${handText ? `<em>${escapeHtml(handText)}</em>` : ''}
          </span>
          <span class="settle-best" title="最终成牌的五张牌">${bestHtml}</span>
          <span class="settle-won">${wonText}</span>
        </div>
      `;
    }).join('');

    this.el.singleSettleList.innerHTML = `
      <div class="settle-row settle-header">
        <span>序号</span><span>玩家</span><span>底牌</span><span>最终牌型</span><span>最终五张</span><span>获得筹码</span>
      </div>
      ${this.el.singleSettleList.innerHTML}
    `;

    const tablePlayers = Array.isArray(data.players) ? data.players : [];
    if (this.el.singleSettleTotal) {
      if (tablePlayers.length) {
        const totalChips = tablePlayers.reduce((sum, player) => sum + (Number(player.stack) || 0), 0);
        const busted = tablePlayers.filter((player) => Number(player.stack) <= 0).map((player) => player.name).filter(Boolean);
        this.el.singleSettleTotal.textContent = `全桌总筹码 ${fmt(totalChips)} · 本手底池 ${fmt(data.pot)}${busted.length ? ` · 筹码归零：${busted.join('、')}` : ''}`;
      } else {
        this.el.singleSettleTotal.textContent = `本手底池 ${fmt(data.pot)}`;
      }
    }
    this.el.singleSettle.classList.remove('hidden');
    this.el.hud?.classList.add('settle-open');
    this.setCardViewerTurnHidden(true);
  }

  showOnlineSettlement(data, onNext) {
    this.showSettlement(data);
    if (!this.el.singleSettle) return;
    this.onlineNextHandler = onNext || null;
    this.el.singleSettle.classList.remove('hidden');
    this.el.singleSettleTimer.textContent = '等待继续';
    this.el.btnSettleNext.classList.remove('hidden');
    this.el.btnSettleNext.disabled = true;
    const foot = this.el.singleSettle.querySelector('.single-settle-foot .settle-note');
    if (foot) foot.textContent = '所有在线玩家点击「继续下一把」后立即发牌';
    this.hideActionBar();
    this.setCardViewerTurnHidden(true);
  }

  setOnlineNextState({ ready = 0, total = 0, readyMe = false, canClick = false, onNext = null } = {}) {
    if (!this.el.singleSettle || this.el.singleSettle.classList.contains('hidden')) return;
    if (onNext) this.onlineNextHandler = onNext;
    this.onlineNextCounts = { ready, total };
    if (this.el.singleSettleTimer) {
      this.el.singleSettleTimer.textContent = `已准备 ${ready}/${total}`;
    }
    if (this.el.btnSettleNext) {
      this.el.btnSettleNext.disabled = !canClick;
      this.el.btnSettleNext.textContent = readyMe ? '已准备，等其他人' : '继续下一把';
    }
  }

  setOnlineNextTimer(left = 0) {
    if (!this.el.singleSettle || this.el.singleSettle.classList.contains('hidden')) return;
    const counts = this.onlineNextCounts || { ready: 0, total: 0 };
    if (this.el.singleSettleTimer) {
      this.el.singleSettleTimer.textContent = left > 0
        ? `已准备 ${counts.ready}/${counts.total} · 下一手 ${left}s`
        : `已准备 ${counts.ready}/${counts.total} · 等待其他玩家`;
    }
  }

  waitSettlement(seconds = 15) {
    if (!this.el.singleSettle || !this.settlementData) return this.waitReady(seconds);
    if (this.settlementDone !== null) return Promise.resolve(this.settlementDone);
    this.el.singleSettle.classList.remove('hidden');
    this.settleDeadline = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((this.settleDeadline - Date.now()) / 1000));
      this.el.singleSettleTimer.textContent = left > 0 ? `下一手 ${left}s` : '即将继续';
      if (left <= 0) this.finishSettlement(true);
    };
    if (this.settleTimer) clearInterval(this.settleTimer);
    tick();
    this.settleTimer = setInterval(tick, 250);
    return new Promise((resolve) => {
      this.settleResolver = resolve;
    });
  }

  finishSettlement(keepPlaying) {
    if (this.settleTimer) {
      clearInterval(this.settleTimer);
      this.settleTimer = null;
    }
    this.settlementDone = Boolean(keepPlaying);
    this.el.singleSettle?.classList.add('hidden');
    const resolver = this.settleResolver;
    this.settleResolver = null;
    if (resolver) {
      this.vibrate(10);
      resolver(Boolean(keepPlaying));
    }
  }

  hideSettlement() {
    if (this.settleTimer) {
      clearInterval(this.settleTimer);
      this.settleTimer = null;
    }
    this.el.singleSettle?.classList.add('hidden');
    this.el.hud?.classList.remove('settle-open');
    if (this.el.singleSettleList) this.el.singleSettleList.innerHTML = '';
    this.setCardViewerTurnHidden(false);
    const resolver = this.settleResolver;
    this.settleResolver = null;
    this.settlementData = null;
    this.onlineNextHandler = null;
    if (resolver) resolver(false);
  }

  waitReady(seconds = 15) {
    if (this.readyResolver) this.finishReady(true);
    this.el.ready.classList.remove('hidden');
    this.readyRemaining = seconds;
    this.el.readyCount.textContent = String(seconds);
    this.readyTimer = setInterval(() => {
      this.readyRemaining -= 1;
      if (this.readyRemaining <= 0) {
        this.finishReady(true);
      } else {
        this.el.readyCount.textContent = String(this.readyRemaining);
      }
    }, 1000);
    return new Promise((resolve) => {
      this.readyResolver = resolve;
    });
  }

  finishReady(keepPlaying) {
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
      this.readyTimer = null;
    }
    this.el.ready.classList.add('hidden');
    const resolver = this.readyResolver;
    this.readyResolver = null;
    if (resolver) {
      this.vibrate(10);
      resolver(Boolean(keepPlaying));
    }
  }

  resetCards() {
    this.viewerMode = 'hole';
    this.heroCards = [];
    this.boardCards = [];
    this.heroHandName = '';
    this.hideBoardZoom();
    this.renderBoardRail();
    this.renderCardViewer();
  }

  feed(text, tone = '') {
    const item = document.createElement('div');
    item.className = `feed-item ${tone}`;
    item.textContent = text;
    this.appendFeed(item);
  }

  actionEnglish(action) {
    const text = String(action || '');
    if (text.includes('全下')) return 'ALL IN';
    if (text.includes('加注')) return 'RAISE';
    if (text.includes('下注')) return 'BET';
    if (text.includes('跟注')) return 'CALL';
    if (text.includes('过牌')) return 'CHECK';
    if (text.includes('弃牌')) return 'FOLD';
    return '';
  }

  feedAction(name, action, amount = 0, tone = '') {
    const english = this.actionEnglish(action);
    const actionHtml = escapeHtml(String(action || '').trim())
      + (english ? ` <small class="feed-en">${english}</small>` : '');
    const fullName = String(name || '玩家').trim() || '玩家';
    const shortName = fullName.length > 4 ? `${fullName.slice(0, 4)}…` : fullName;
    const item = document.createElement('div');
    item.className = `feed-item feed-action ${tone}`;
    item.innerHTML = `<b class="feed-name" title="${escapeHtml(fullName)}">${escapeHtml(shortName)}</b>`
      + `<span class="feed-move">${actionHtml}</span>`
      + `<em class="feed-amount">${Number(amount) > 0 ? fmt(amount) : ''}</em>`;
    this.appendFeed(item);
  }

  appendFeed(item) {
    this.el.feed.appendChild(item);
    const items = [...this.el.feed.children];
    if (items.length > 10) items[0].remove();
    // 保留更长的牌桌动态；只把较早记录降到次要亮度，不自动消失。
    const all = [...this.el.feed.children];
    for (let i = 0; i < all.length; i += 1) {
      all[i].style.opacity = i < all.length - 4 ? '0.45' : '1';
    }
  }

  clearFeed() {
    this.el.feed.innerHTML = '';
  }

  thinking(on, name = '') {
    this.el.thinking.classList.toggle('hidden', !on);
    if (on) {
      this.el.thinking.querySelector('span').textContent = name ? `${name} 正在思考` : '对手思考中';
    }
  }

  turnTag(on) {
    this.el.turnTag.classList.toggle('hidden', !on);
  }

  setCardViewerTurnHidden() {
    // 底牌固定在左上角，不再随行动条/结算隐藏。
    this.el.hud?.classList.remove('hero-action-open');
    this.el.cardViewer?.classList.remove('turn-hidden');
    this.el.btnCardExpand?.classList.remove('turn-hidden');
  }

  beginAction(legal) {
    this.currentLegal = legal;
    this.setCardViewerTurnHidden(true);
    this.el.actionbar.classList.remove('hidden');
    this.turnTag(false);
    this.el.btnCall.dataset.action = legal.canCheck ? 'check' : 'call';
    const callText = legal.canCheck
      ? '过牌'
      : `跟注 ${fmt(Math.min(legal.toCall, legal.stack))}`;
    this.el.btnCall.querySelector('span').textContent = callText;
    this.el.btnFold.disabled = false;
    this.el.btnCall.disabled = false;
    this.el.btnRaise.disabled = !legal.canRaise;
    this.el.raiseRange.disabled = !legal.canRaise;
    this.el.btnRaiseMinus.disabled = !legal.canRaise;
    this.el.btnRaisePlus.disabled = !legal.canRaise;
    this.el.raiseLabel.textContent = legal.currentBet > 0 ? '加注到' : '下注';
    this.el.presets.querySelectorAll('button').forEach((b) => {
      b.disabled = !legal.canRaise;
    });

    if (legal.canRaise) {
      this.el.raiseRange.min = String(Math.min(legal.minRaiseTo, legal.maxRaiseTo));
      this.el.raiseRange.max = String(legal.maxRaiseTo);
      this.el.raiseRange.step = '5';
      const preferred = Math.min(
        legal.maxRaiseTo,
        Math.max(legal.minRaiseTo, legal.currentBet + Math.round((legal.pot * 0.6) / 5) * 5),
      );
      this.el.raiseRange.value = String(preferred);
      this.updateRaiseDisplay();
    } else {
      this.el.raiseRange.min = '0';
      this.el.raiseRange.max = '0';
      this.el.raiseRange.value = '0';
      this.updateRaiseDisplay();
    }

    this.el.btnRaise.querySelector('span').textContent = '加注';
    this.attachKeys();
    audio.turn();
    this.startActionTimer(15);
  }

  updateRaiseDisplay() {
    const value = Number(this.el.raiseRange.value);
    const max = Number(this.el.raiseRange.max);
    const min = Number(this.el.raiseRange.min);
    this.el.raiseValue.textContent = fmt(value);
    const ratio = max > min ? (value - min) / (max - min) : 0;
    this.el.raiseRange.style.setProperty('--fill', `${18 + ratio * 82}%`);
    const isAllIn = value >= max && max > 0;
    this.el.btnRaise.querySelector('span').textContent = isAllIn ? '全下' : '加注';
  }

  setRaiseValue(value) {
    const min = Number(this.el.raiseRange.min);
    const max = Number(this.el.raiseRange.max);
    const rounded = Math.round(value / 5) * 5;
    this.el.raiseRange.value = String(Math.max(min, Math.min(max, rounded)));
    this.updateRaiseDisplay();
  }

  attachKeys() {
    this.detachKeys();
    this.keyHandler = (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return;
      const key = event.key.toLowerCase();
      if (key === 'escape' && this.el.foldConfirm && !this.el.foldConfirm.classList.contains('hidden')) {
        this.closeFoldConfirm();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        this.openFoldConfirm();
      } else if (key === 'c') {
        event.preventDefault();
        this.resolveAction({
          type: this.el.btnCall.dataset.action === 'check' ? 'check' : 'call',
        });
      } else if (key === 'r' && !this.el.btnRaise.disabled) {
        event.preventDefault();
        const value = Number(this.el.raiseRange.value);
        const max = Number(this.el.raiseRange.max);
        this.resolveAction(value >= max ? { type: 'allin' } : { type: 'raise', amount: value });
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  detachKeys() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  waitForAction() {
    if (this.actionResolver) return Promise.resolve({ type: 'fold' });
    return new Promise((resolve) => {
      this.actionResolver = resolve;
    });
  }

  setFeedCollapsed(collapsed, persist = true) {
    const hidden = Boolean(collapsed);
    this.el.feed?.classList.toggle('feed-collapsed', hidden);
    this.el.btnFeedCollapse?.classList.toggle('hidden', hidden);
    this.el.btnFeedExpand?.classList.toggle('hidden', !hidden);
    if (persist) {
      try { localStorage.setItem('poker_feed_collapsed', hidden ? '1' : '0'); } catch { /* ignore */ }
    }
  }

  openFoldConfirm() {
    if (!this.el.foldConfirm || this.el.actionbar.classList.contains('hidden')) return;
    this.el.foldConfirm.classList.remove('hidden');
    this.el.btnFoldConfirm.focus?.();
  }

  closeFoldConfirm() {
    this.el.foldConfirm?.classList.add('hidden');
  }

  resolveAction(action) {
    this.stopActionTimer();
    if (!this.actionResolver) return;
    const resolve = this.actionResolver;
    this.actionResolver = null;
    this.currentLegal = null;
    this.detachKeys();
    this.hideActionBar();
    this.vibrate(10);
    resolve(action);
  }

  vibrate(ms) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* 设备不支持震动时忽略 */
    }
  }

  hideActionBar() {
    this.stopActionTimer();
    this.el.actionbar.classList.add('hidden');
    this.setCardViewerTurnHidden(false);
    this.currentLegal = null;
  }

  cancelAction() {
    if (this.actionResolver) this.actionResolver = null;
    this.stopActionTimer();
    this.detachKeys();
    this.hideActionBar();
  }

  startActionTimer(seconds = 15) {
    this.stopActionTimer();
    this.timerTotal = seconds;
    this.timerDeadline = performance.now() + seconds * 1000;
    this.timerPaused = false;
    this.timerPausedRemaining = 0;
    this.el.actionTimer.classList.remove('hidden', 'urgent');
    this.updateActionTimer(seconds);
    this.timerId = setInterval(() => this.tickActionTimer(), 100);
  }

  tickActionTimer() {
    if (this.timerPaused) return;
    const remain = Math.max(0, (this.timerDeadline - performance.now()) / 1000);
    this.updateActionTimer(remain);
    if (remain <= 0) {
      const legal = this.currentLegal;
      const action = legal && legal.canCheck ? { type: 'check' } : { type: 'fold' };
      this.stopActionTimer();
      this.toast(action.type === 'check' ? '思考超时，已自动过牌' : '思考超时，已自动弃牌');
      this.resolveAction(action);
    }
  }

  updateActionTimer(remain) {
    const ratio = Math.max(0, Math.min(1, remain / this.timerTotal));
    const bar = this.el.actionTimer.querySelector('i');
    if (bar) bar.style.transform = `scaleX(${ratio})`;
    this.el.actionTimerText.textContent = `${Math.ceil(remain)}s`;
    this.el.actionTimer.classList.toggle('urgent', remain <= 5);
  }

  stopActionTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.timerPaused = false;
    this.el.actionTimer.classList.add('hidden');
  }

  pauseActionTimer() {
    if (!this.timerId || this.timerPaused) return;
    this.timerPaused = true;
    this.timerPausedRemaining = Math.max(0, this.timerDeadline - performance.now());
  }

  resumeActionTimer() {
    if (!this.timerId || !this.timerPaused) return;
    this.timerDeadline = performance.now() + this.timerPausedRemaining;
    this.timerPaused = false;
  }

  showBanner({ kicker = '', main = '', sub = '', gold = false, duration = 2600 } = {}) {
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.el.banner.innerHTML = `
      ${kicker ? `<div class="banner-kicker">${kicker}</div>` : ''}
      <div class="banner-main${gold ? ' goldtext' : ''}">${main}</div>
      ${sub ? `<div class="banner-sub">${sub}</div>` : ''}
    `;
    this.el.banner.classList.add('show');
    if (duration > 0) {
      this.bannerTimer = setTimeout(() => this.hideBanner(), duration);
    }
  }

  hideBanner() {
    this.el.banner.classList.remove('show');
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
  }

  toast(text, { title = '', kind = 'info', duration = 0 } = {}) {
    if (!text && !title) return;
    const item = document.createElement('div');
    const tone = ['info', 'success', 'warn', 'error'].includes(kind) ? kind : 'info';
    item.className = `toast toast-${tone}`;
    item.setAttribute('role', tone === 'error' || tone === 'warn' ? 'alert' : 'status');
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warn' ? '!' : 'i';
    const body = document.createElement('div');
    body.className = 'toast-body';
    if (title) {
      const head = document.createElement('b');
      head.textContent = title;
      body.appendChild(head);
    }
    const line = document.createElement('p');
    line.textContent = text || title;
    body.appendChild(line);
    item.append(icon, body);
    item.addEventListener('click', () => this.dismissToast(item));
    while (this.el.toastHost.children.length >= 4) {
      this.el.toastHost.firstElementChild?.remove();
    }
    this.el.toastHost.appendChild(item);
    const life = duration || (tone === 'error' ? 5200 : tone === 'warn' ? 4200 : 3000);
    const timer = setTimeout(() => this.dismissToast(item), life);
    item._timer = timer;
  }

  dismissToast(item) {
    if (!item || item.dataset.leaving === '1') return;
    item.dataset.leaving = '1';
    if (item._timer) clearTimeout(item._timer);
    item.style.opacity = '0';
    item.style.transform = 'translateY(-6px)';
    item.style.transition = 'all .28s ease';
    setTimeout(() => item.remove(), 300);
  }

  openHelp() {
    this.pauseActionTimer();
    this.el.helpModal.classList.remove('hidden');
  }

  closeHelp() {
    this.el.helpModal.classList.add('hidden');
    this.resumeActionTimer();
  }

  showGameOver({ hands, biggestPot, text } = {}) {
    this.el.statHands.textContent = String(hands || 0);
    this.el.statPot.textContent = fmt(biggestPot || 0);
    if (text) this.el.gameoverCopy.textContent = text;
    this.el.gameover.classList.remove('hidden');
  }

  hideGameOver() {
    this.el.gameover.classList.add('hidden');
  }

  isLobbyVisible() {
    return this.el.lobby.style.display !== 'none'
      && !this.el.lobby.classList.contains('leaving');
  }

  hasBlockingModal() {
    const login = document.getElementById('loginOverlay');
    const lobbySettings = document.getElementById('lobbySettingsModal');
    const onlineOver = document.getElementById('onlineGameOver');
    return this.isVoicePanelOpen()
      || !this.el.helpModal.classList.contains('hidden')
      || !this.el.settingsModal.classList.contains('hidden')
      || !this.el.updateModal.classList.contains('hidden')
      || !this.el.gameover.classList.contains('hidden')
      || Boolean(login && !login.classList.contains('hidden'))
      || Boolean(lobbySettings && !lobbySettings.classList.contains('hidden'))
      || Boolean(onlineOver && !onlineOver.classList.contains('hidden'));
  }

  closeBlockingModal() {
    if (this.isVoicePanelOpen()) {
      this.closeVoicePanel();
      return true;
    }
    const onlineOver = document.getElementById('onlineGameOver');
    if (onlineOver && !onlineOver.classList.contains('hidden')) {
      this.exitOnlineGame();
      return true;
    }
    const login = document.getElementById('loginOverlay');
    if (login && !login.classList.contains('hidden')) {
      this.accountUI?.closeLogin();
      return true;
    }
    const lobbySettings = document.getElementById('lobbySettingsModal');
    if (lobbySettings && !lobbySettings.classList.contains('hidden')) {
      this.accountUI?.closeSettings();
      return true;
    }
    if (!this.el.updateModal.classList.contains('hidden')) {
      if (!this.updateRequired) this.el.updateModal.classList.add('hidden');
      return true;
    }
    if (!this.el.settingsModal.classList.contains('hidden')) {
      this.closeSettings();
      return true;
    }
    if (!this.el.helpModal.classList.contains('hidden')) {
      this.closeHelp();
      return true;
    }
    return false;
  }
}
