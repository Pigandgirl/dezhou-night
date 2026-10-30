/**
 * PWA lifecycle for the /play client.
 *
 * - registers the service worker with the `/play` scope (not `/play/`, so the
 *   canonical start URL itself is controlled and can boot offline);
 * - unregisters the old `/play/`-scoped worker shipped before 1.2.0;
 * - shows a non-blocking "new version ready" banner instead of silently
 *   swapping the service worker under a running hand.
 *
 * Service workers only run in a secure context: HTTPS or localhost. The
 * current production origin is plain HTTP, so the banner is dormant there
 * until TLS is enabled.
 */

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const SW_URL = '/play/sw.js';
const SW_SCOPE = '/play';

let banner = null;
let bannerText = null;
let bannerAction = null;
let refreshing = false;

function ensureBanner() {
  if (banner) return banner;
  const el = document.createElement('div');
  el.id = 'pwaUpdateBanner';
  el.className = 'pwa-update-banner hidden';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="pwa-update-dot" aria-hidden="true"></span>'
    + '<div class="pwa-update-copy"><b>新版本已就绪</b><em>更新后重新进入牌桌</em></div>'
    + '<button class="pwa-update-action" type="button">更新</button>'
    + '<button class="pwa-update-close" type="button" aria-label="稍后更新">×</button>';
  document.body.appendChild(el);
  banner = el;
  bannerText = el.querySelector('.pwa-update-copy b');
  bannerAction = el.querySelector('.pwa-update-action');
  el.querySelector('.pwa-update-close').addEventListener('click', hideBanner);
  bannerAction.addEventListener('click', () => {
    const reg = window.__PWA__?.registration;
    if (reg?.waiting) {
      refreshing = true;
      bannerAction.disabled = true;
      bannerAction.textContent = '更新中…';
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.setTimeout(() => window.location.reload(), 1600);
      return;
    }
    refreshing = true;
    window.location.reload();
  });
  return el;
}

export function showUpdateBanner(text = '新版本已就绪') {
  ensureBanner();
  if (bannerText) bannerText.textContent = text;
  banner?.classList.remove('hidden');
}

export function hideBanner() {
  banner?.classList.add('hidden');
}

export function initPWA() {
  const supported = 'serviceWorker' in navigator;
  const secure = window.isSecureContext === true;
  const api = {
    supported,
    secure,
    registration: null,
    showUpdateBanner,
    check: () => api.registration?.update?.(),
  };
  window.__PWA__ = api;

  if (!supported || !secure) return;
  if (!window.location.pathname.startsWith('/play')) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let lastCheck = Date.now();

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      window.location.reload();
      return;
    }
    // A worker activated without our banner flow (e.g. an older SW that
    // called skipWaiting itself). Tell the player instead of swapping state.
    if (hadController) showUpdateBanner();
  });

  const watchRegistration = (reg) => {
    api.registration = reg;
    // The first install also ends in state=installed/controller=claimed, so
    // only an already-controlled page should be told that an update exists.
    if (reg.waiting && hadController) {
      window.setTimeout(() => showUpdateBanner(), 2500);
    }
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && hadController) {
          showUpdateBanner();
        }
      });
    });
  };

  const register = async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(async (reg) => {
        try {
          const path = new URL(reg.scope).pathname;
          if (path === '/play/') await reg.unregister();
        } catch {
          /* ignore malformed scope */
        }
      }));
      const reg = await navigator.serviceWorker.register(SW_URL, {
        scope: SW_SCOPE,
        updateViaCache: 'none',
      });
      watchRegistration(reg);
      reg.update().catch(() => {});
    } catch (error) {
      console.warn('[pwa] service worker registration failed:', error?.message || error);
    }
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastCheck < UPDATE_INTERVAL_MS) return;
    lastCheck = Date.now();
    api.registration?.update?.().catch?.(() => {});
  });
}

export default initPWA;
