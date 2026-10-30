import './style.css';
import { PokerScene } from './scene.js';
import { HUD } from './hud.js';
import { Game } from './game.js';
import { audio } from './audio.js';
import { OnlineService } from './online.js';
import { OnlineTable3D } from './online-3d.js';
import { VoiceChat } from './voice.js';
import { AdminConsole } from './admin-console.js';
import { CareerPanel } from './career.js';
import { ProgressTracker } from './progress.js';
import { StoryMode } from './story.js';
import { QUALITY } from './quality.js';
import { AccountService, AccountUI } from './account.js';
import { initPWA } from './pwa.js';
import { initIosInstall } from './ios-install.js';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const APP_VERSION_CODE = typeof __APP_VERSION_CODE__ === 'string' ? __APP_VERSION_CODE__ : '0';
const UPDATE_BASE = typeof __UPDATE_BASE__ === 'string' ? __UPDATE_BASE__ : '';
const VERSION_LABEL = APP_VERSION_CODE === '0'
  ? APP_VERSION
  : `${APP_VERSION} (${APP_VERSION_CODE})`;

window.__APP_VERSION__ = APP_VERSION;
window.__APP_VERSION_CODE__ = Number(APP_VERSION_CODE) || 0;
window.__UPDATE_BASE__ = UPDATE_BASE;

if (QUALITY.isMobile) document.documentElement.classList.add('mobile-perf');
if (QUALITY.tier !== 'high') document.documentElement.classList.add('perf-lite');
if (QUALITY.tier === 'low') document.documentElement.classList.add('mobile-perf-low');

const boot = document.getElementById('boot');

function applyVersionLabel() {
  const lobby = document.getElementById('lobbyVersion');
  if (lobby) lobby.textContent = VERSION_LABEL;
  const inline = document.getElementById('lobbyVersionInline');
  if (inline) inline.textContent = VERSION_LABEL;
  const settings = document.getElementById('settingsVersion');
  if (settings) settings.textContent = VERSION_LABEL;
}

function fadeBoot() {
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 640);
}

function bootGame() {
  applyVersionLabel();
  const canvas = document.getElementById('scene');
  const scene = new PokerScene(canvas);

  let game;
  const account = new AccountService();
  const online = new OnlineService(account);
  const detachOnline = () => {
    if (online.room) online.leave();
    if (online3d?.active) {
      online3d.stopNextTimer?.();
      online3d.active = false;
      online3d.state = null;
      online3d.room = null;
    }
    hud.hideRoom?.();
    hud.hideOnlineGameOver?.();
    hud.el.onlineRoster?.classList.add('hidden');
  };
  const hud = new HUD({
    onStart: (config) => {
      // 进入单机前彻底断开在线房间，避免旧房间的下一次 started/state
      // 把玩家从人机牌桌强行拉回在线牌桌。
      detachOnline();
      game.start(config);
    },
    onReturnLobby: () => {
      if (online3d?.active) online3d.hide();
      detachOnline();
      game.returnToLobby();
    },
    onRebuy: () => {
      game.rebuy();
    },
    online,
    account,
  });
  const accountUI = new AccountUI({
    service: account,
    toast: (message) => hud.toast(message),
    onChange: () => {
      hud.refreshMatchRooms();
      hud.refreshStats();
      hud.syncAdminButton?.();
      hud.onAccountChanged?.();
    },
    onOpenHelp: () => {
      hud.closeSettings?.();
      hud.openHelp();
    },
    onBeforeLogin: () => {
      hud.closeSettings?.();
    },
  });
  hud.accountUI = accountUI;
  hud.scene = scene;
  hud.applyLowMotion?.(hud.config.lowMotion);
  hud.setLobbyMode('match');
  hud.autoCheckUpdate();

  game = new Game({ scene, hud });
  const online3d = new OnlineTable3D({ scene, hud, online, account });
  hud.online3d = online3d;
  const story = new StoryMode({
    hud,
    onStart: (config) => {
      detachOnline();
      game.start(config);
    },
    onExit: async () => {
      await game.returnToLobby();
    },
    onVisibility: (visible) => {
      scene.paused = Boolean(visible);
    },
  });
  hud.onOpenStory = () => story.open();
  hud.onSocialJoin = async () => {
    if (game.running) await game.returnToLobby();
    hud.setLobbyMode('match');
    setTimeout(() => {
      hud.el.btnQuickMatch?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      hud.el.btnQuickMatch?.focus();
    }, 260);
  };
  hud.storyController = story;
  const voice = new VoiceChat({ online, hud });
  hud.voiceChat = voice;
  const adminConsole = new AdminConsole({ hud, account, scene });
  hud.adminConsole = adminConsole;
  const careerPanel = new CareerPanel({ account, accountUI, hud, audio });
  hud.careerPanel = careerPanel;
  online.on('career', (data) => careerPanel.updateCareer(data));
  online.on('achievement', (data) => careerPanel.showUnlock(data));
  online.on('achievement_broadcast', (data) => careerPanel.showUnlock(data));
  online.on('reward', (data) => {
    if (!data?.chips) return;
    const text = data.source === 'five_star_share'
      ? `五星同庆，获得 ${data.chips} 大厅筹码`
      : `好友房获胜，获得 ${data.chips} 大厅筹码`;
    hud.toast(text, { kind: 'success', title: '筹码奖励' });
  });
  const progressTracker = new ProgressTracker({ account, accountUI, game, online, hud });
  progressTracker.start();
  audio.onFallback = (text) => hud.toast(text);

  account.boot().then((ok) => {
    accountUI.renderAccount();
    hud.syncAdminButton?.();
    hud.refreshMatchRooms();
    hud.refreshStats();
    if (!ok) {
      // 直接打开网页/APP 时先弹登录；用户仍可点「游客继续」单机游玩
      setTimeout(() => {
        if (!account.loggedIn && !accountUI.loginDismissed
          && accountUI.el.loginOverlay.classList.contains('hidden')) {
          accountUI.openLogin('login');
        }
      }, 450);
    }
  });

  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audio.init();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // 原生返回键：弹窗 → 关闭；牌局 → 返回大厅；大厅 → 交回原生退出
  window.__nativeBack = () => {
    if (online3d?.active) {
      online3d.hide();
      online.leave();
      return true;
    }
    if (hud.guestTable?.showing) {
      hud.guestTable.hide();
      online.leave();
      return true;
    }
    if (online.room) {
      online.leave();
      return true;
    }
    if (hud.closeBlockingModal()) return true;
    if (hud.hasBlockingModal()) {
      game.returnToLobby();
      return true;
    }
    if (game.running) {
      game.returnToLobby();
      return true;
    }
    return false;
  };

  // 便于调试
  window.__poker = { game, scene, hud, audio, online, online3d, voice, quality: QUALITY };

  requestAnimationFrame(() => requestAnimationFrame(fadeBoot));
}

document.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('error', (event) => {
  console.error('[error]', event.error?.stack || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  console.error('[unhandled]', reason?.stack || String(reason));
});

initIosInstall();
initPWA();

requestAnimationFrame(() => requestAnimationFrame(bootGame));
