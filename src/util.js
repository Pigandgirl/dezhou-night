import * as THREE from 'three';
import { QUALITY } from './quality.js';

const activeAnimations = [];

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function animate(duration, update, easing = easeOutCubic) {
  return new Promise((resolve) => {
    activeAnimations.push({
      start: performance.now(),
      duration: Math.max(1, duration),
      update,
      easing,
      resolve,
    });
  });
}

export function updateAnimations(now) {
  for (let i = activeAnimations.length - 1; i >= 0; i -= 1) {
    const a = activeAnimations[i];
    let t = (now - a.start) / a.duration;
    if (t > 1) t = 1;
    a.update(a.easing(t), t);
    if (t >= 1) {
      activeAnimations.splice(i, 1);
      a.resolve();
    }
  }
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function canvasTexture(canvas, { srgb = true, anisotropy = QUALITY.anisotropy } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
