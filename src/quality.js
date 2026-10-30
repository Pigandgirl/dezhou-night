/**
 * 设备画质分级：为移动端 WebView 提供可预测的性能档位。
 * 可通过 ?quality=low|mid|high 强制指定，便于调试。
 * 移动端优先续航：30fps、无 Bloom/阴影、DPR 1.0、无粒子。
 */

const params = new URLSearchParams(window.location.search);
const override = params.get('quality');

const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const isMobile = coarsePointer || mobileUA;
const cores = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || (isMobile ? 4 : 8);

// 网页默认走 mid：手机/网页优先流畅、低发热；只有显式 ?quality=high
// 才开启阴影、Bloom、高 DPR。低端设备直接 low。
let tier = 'mid';
if (isMobile) {
  if (cores <= 4 || memory <= 3) tier = 'low';
} else if (cores <= 4 || memory <= 4) {
  tier = 'low';
}
if (override === 'low' || override === 'mid' || override === 'high') tier = override;

const PRESETS = {
  high: {
    dprCap: 1.6,
    antialias: true,
    shadows: true,
    shadowType: 'basic',
    shadowMapSize: 1024,
    bloom: true,
    bloomScale: 0.65,
    bloomStrength: 0.2,
    bloomThreshold: 0.88,
    environment: true,
    dustCount: 90,
    bokehCount: 4,
    maxStackChips: 12,
    maxPotChips: 20,
    anisotropy: 4,
    grain: 0.8,
    fpsCap: 60,
    textureScale: 1,
    simplifyRigs: false,
  },
  mid: {
    dprCap: 1.25,
    antialias: false,
    shadows: false,
    shadowType: 'basic',
    shadowMapSize: 512,
    bloom: false,
    bloomScale: 0.5,
    bloomStrength: 0.18,
    bloomThreshold: 0.9,
    environment: false,
    dustCount: 0,
    bokehCount: 2,
    maxStackChips: 5,
    maxPotChips: 8,
    anisotropy: 2,
    grain: 0.5,
    fpsCap: 45,
    textureScale: 0.75,
    simplifyRigs: true,
  },
  low: {
    dprCap: 1.0,
    antialias: false,
    shadows: false,
    shadowType: 'basic',
    shadowMapSize: 512,
    bloom: false,
    bloomScale: 0.5,
    bloomStrength: 0.16,
    bloomThreshold: 0.95,
    environment: false,
    dustCount: 0,
    bokehCount: 1,
    maxStackChips: 4,
    maxPotChips: 6,
    anisotropy: 1,
    grain: 0.3,
    fpsCap: 30,
    textureScale: 0.55,
    simplifyRigs: true,
  },
};

const preset = PRESETS[tier];
export const QUALITY = Object.freeze({
  tier,
  isMobile,
  ...preset,
  // 手机游戏 30fps，桌面网页 45fps；大厅统一 24fps 降热
  fpsCap: isMobile ? Math.min(preset.fpsCap, 30) : preset.fpsCap,
  lobbyFpsCap: 24,
});
