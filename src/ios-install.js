/**
 * iOS install education + standalone detection.
 *
 * iOS has no `beforeinstallprompt`; the only install path is Safari's
 * "Add to Home Screen". This module:
 *  - marks <html> with `ios`, `ios-standalone` or `ios-native`;
 *  - shows a one-time, dismissible guide on iOS Safari;
 *  - tells in-app browsers (WeChat/Chrome/etc.) to reopen in Safari;
 *  - exposes a manual entry in the settings modal.
 */

const LS_NEVER = 'dz_ios_install_never';
const LS_LAST = 'dz_ios_install_last';
const LS_STANDALONE = 'dz_ios_standalone_seen';
const AUTO_DAYS = 3;

function readLS(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode / storage disabled */
  }
}

function detectIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports itself as Macintosh, but has touch points.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function detectSafari(ua) {
  if (!/Safari/.test(ua)) return false;
  return !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|MicroMessenger|QQBrowser|MQQBrowser|UCBrowser|Quark|baiduboxapp|wv\))/i.test(ua);
}

function detectInApp(ua) {
  if (/MicroMessenger/i.test(ua)) return '微信';
  if (/QQ/i.test(ua) && !/MQQBrowser/i.test(ua)) return 'QQ';
  if (/Weibo/i.test(ua)) return '微博';
  if (/DingTalk/i.test(ua)) return '钉钉';
  if (/Alipay/i.test(ua)) return '支付宝';
  if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA/i.test(ua)) return '其他浏览器';
  return '';
}

function detectStandalone() {
  if (window.navigator.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches;
  } catch {
    return false;
  }
}

function svgShare() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0 4 4m-4-4L8 7"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
}

function svgPlus() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
}

function svgCheck() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16 9.2"/></svg>';
}

function svgMore() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
}

function svgSafari() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>';
}

export function initIosInstall() {
  const ua = navigator.userAgent || '';
  const isIOS = detectIOS();
  const isSafari = detectSafari(ua);
  const inApp = detectInApp(ua);
  const isNative = window.__DZ_SHELL__ === 'ios-native';
  let standalone = detectStandalone();

  const root = document.documentElement;
  if (isIOS) root.classList.add('ios');
  if (isNative) root.classList.add('ios-native');
  if (isNative || standalone) root.classList.add('ios-standalone');

  const entry = document.getElementById('btnInstallApp');
  const state = document.getElementById('iosInstallState');

  let sheet = null;
  let lastFocus = null;
  let autoTimer = 0;

  const api = {
    isIOS,
    isSafari,
    inApp,
    isNative,
    get standalone() { return standalone; },
    secure: window.isSecureContext === true,
    open: () => openSheet({ auto: false }),
    close: () => closeSheet(),
  };
  window.__DZ_IOS_INSTALL__ = api;

  function buildSheet() {
    if (sheet) return sheet;
    const el = document.createElement('div');
    el.id = 'iosInstallSheet';
    el.className = 'ios-install-sheet hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'iosInstallTitle');
    el.innerHTML = `
      <div class="ios-install-backdrop" data-ios-close="1"></div>
      <div class="ios-install-panel" role="document">
        <div class="ios-install-grip" aria-hidden="true"></div>
        <button class="ios-install-close" type="button" data-ios-close="1" aria-label="关闭安装提示">×</button>
        <div class="ios-install-head">
          <img class="ios-install-icon" src="/play/icons/apple-touch-icon.png" width="56" height="56" alt="" decoding="async">
          <div class="ios-install-copy">
            <span id="iosInstallEyebrow">DEZHOU NIGHT · iOS</span>
            <h2 id="iosInstallTitle">把德扑之夜装到桌面</h2>
            <p id="iosInstallLead">全屏启动 · 独立图标 · 登录状态保留</p>
          </div>
        </div>
        <ol id="iosInstallSteps" class="ios-install-steps"></ol>
        <p id="iosInstallNote" class="ios-install-note"></p>
        <div class="ios-install-actions">
          <button id="iosInstallDone" class="ios-install-primary" type="button">我知道了</button>
          <button id="iosInstallNever" class="ios-install-secondary" type="button">不再自动提示</button>
        </div>
        <p class="ios-install-foot">安装后从主屏幕图标启动，即可进入无浏览器边框的全屏牌桌。</p>
      </div>`;
    document.body.appendChild(el);
    sheet = el;
    el.querySelectorAll('[data-ios-close]').forEach((node) => {
      node.addEventListener('click', () => closeSheet());
    });
    el.querySelector('#iosInstallDone').addEventListener('click', () => {
      if (!isSafari && inApp) {
        copyLink();
        return;
      }
      writeLS(LS_LAST, Date.now());
      closeSheet();
    });
    el.querySelector('#iosInstallNever').addEventListener('click', () => {
      writeLS(LS_NEVER, '1');
      writeLS(LS_LAST, Date.now());
      closeSheet();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sheet && !sheet.classList.contains('hidden')) closeSheet();
    });
    return el;
  }

  function stepHtml(index, title, detail, icon) {
    return `<li><span class="ios-install-step-no">${index}</span><span class="ios-install-step-copy"><b>${title}</b><em>${detail}</em></span><i class="ios-install-step-icon">${icon}</i></li>`;
  }

  function render() {
    const el = buildSheet();
    const title = el.querySelector('#iosInstallTitle');
    const lead = el.querySelector('#iosInstallLead');
    const eyebrow = el.querySelector('#iosInstallEyebrow');
    const steps = el.querySelector('#iosInstallSteps');
    const note = el.querySelector('#iosInstallNote');
    const done = el.querySelector('#iosInstallDone');
    const never = el.querySelector('#iosInstallNever');
    const icon = el.querySelector('.ios-install-icon');

    if (!isSafari) {
      eyebrow.textContent = 'OPEN IN SAFARI · iOS';
      title.textContent = '请用 Safari 打开';
      lead.textContent = inApp ? `${inApp}内置浏览器不能添加到主屏幕` : '只有 Safari 才能添加到主屏幕';
      steps.innerHTML = [
        stepHtml(1, '点右上角 ···', '打开浏览器菜单', svgMore()),
        stepHtml(2, '选择「在 Safari 中打开」', '如果没有，复制链接到 Safari', svgSafari()),
        stepHtml(3, '再用 Safari 的分享按钮安装', '分享 → 添加到主屏幕', svgShare()),
      ].join('');
      note.textContent = '微信、QQ、Chrome、抖音等内置浏览器都不支持“添加到主屏幕”。';
      note.className = 'ios-install-note is-warn';
      done.textContent = '复制链接';
      never.textContent = '关闭';
      icon.src = '/play/icons/apple-touch-icon.png';
      return;
    }

    eyebrow.textContent = 'SAFARI · ADD TO HOME SCREEN';
    title.textContent = '把德扑之夜装到桌面';
    lead.textContent = '全屏启动 · 独立图标 · 登录状态保留';
    steps.innerHTML = [
      stepHtml(1, '点 Safari 底部的分享按钮', '方形带向上箭头', svgShare()),
      stepHtml(2, '选择「添加到主屏幕」', '在菜单里向下滑一点', svgPlus()),
      stepHtml(3, '点右上角「添加」', '回到桌面启动全屏牌桌', svgCheck()),
    ].join('');
    if (window.isSecureContext === true) {
      note.textContent = '已启用安全连接：安装后可离线打开，麦克风语音也可用。';
      note.className = 'ios-install-note';
    } else {
      note.textContent = '当前是 HTTP 地址：可以安装并游玩；离线缓存与麦克风语音需要 HTTPS。';
      note.className = 'ios-install-note is-warn';
    }
    done.textContent = '我知道了';
    never.textContent = '不再自动提示';
  }

  async function copyLink() {
    const text = window.location.href;
    try {
      await navigator.clipboard.writeText(text);
      const done = sheet?.querySelector('#iosInstallDone');
      if (done) {
        done.textContent = '已复制 ✓';
        setTimeout(() => { if (done) done.textContent = '复制链接'; }, 1800);
      }
      return;
    } catch {
      /* fall through */
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* */ }
    area.remove();
    const done = sheet?.querySelector('#iosInstallDone');
    if (done) {
      done.textContent = '已复制 ✓';
      setTimeout(() => { if (done) done.textContent = '复制链接'; }, 1800);
    }
  }

  function openSheet({ auto = false } = {}) {
    if (isNative || standalone) return;
    render();
    if (!sheet) return;
    lastFocus = document.activeElement;
    sheet.classList.remove('hidden');
    root.classList.add('ios-install-open');
    window.setTimeout(() => sheet?.querySelector('.ios-install-close')?.focus(), 80);
    if (auto) writeLS(LS_LAST, Date.now());
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.add('hidden');
    root.classList.remove('ios-install-open');
    writeLS(LS_LAST, Date.now());
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch { /* */ }
    }
    lastFocus = null;
  }

  function syncEntry() {
    if (!entry) return;
    if (isIOS && !isNative && !standalone) {
      entry.classList.remove('hidden');
      entry.textContent = isSafari ? '安装到主屏幕' : '用 Safari 安装';
    } else {
      entry.classList.add('hidden');
    }
    if (!state) return;
    if (isNative) {
      state.classList.remove('hidden');
      state.textContent = '当前为 iOS 原生 App 模式。';
    } else if (standalone) {
      state.classList.remove('hidden');
      state.textContent = '已从主屏幕启动 · 全屏 App 模式。';
    } else {
      state.classList.add('hidden');
    }
  }

  entry?.addEventListener('click', () => openSheet({ auto: false }));

  if (isIOS && !isNative && !standalone) {
    const never = readLS(LS_NEVER) === '1';
    const last = Number(readLS(LS_LAST) || 0);
    const fresh = !last || Date.now() - last > AUTO_DAYS * 86400000;
    if (!never && fresh) {
      autoTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && !standalone) openSheet({ auto: true });
      }, 2600);
    }
  }

  if (standalone && !isNative) {
    const seen = readLS(LS_STANDALONE);
    if (!seen) {
      writeLS(LS_STANDALONE, '1');
      window.setTimeout(() => {
        window.__poker?.hud?.toast?.('桌面 App 模式 · 全屏运行', { kind: 'success', title: '德扑之夜' });
      }, 3200);
    }
  }

  // Safari can change display-mode when the user launches the installed app;
  // matchMedia changes are rare but cheap to observe.
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', (event) => {
      standalone = Boolean(event.matches) || window.navigator.standalone === true;
      root.classList.toggle('ios-standalone', standalone);
      syncEntry();
    });
  } catch { /* */ }

  syncEntry();
}

export default initIosInstall;
