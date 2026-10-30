import * as THREE from 'three';
import { makeCanvas, roundRect, canvasTexture } from './util.js';
import { QUALITY } from './quality.js';

const detail = (count) => Math.max(1, Math.round(count * QUALITY.grain));

const SUITS = {
  s: { glyph: '♠', color: '#1a1f26', name: '黑桃' },
  h: { glyph: '♥', color: '#b02436', name: '红桃' },
  d: { glyph: '♦', color: '#b02436', name: '方块' },
  c: { glyph: '♣', color: '#1a1f26', name: '梅花' },
};

const RANK_TEXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankLabel(rank) {
  return RANK_TEXT[rank] || String(rank);
}

export function suitMeta(suit) {
  return SUITS[suit];
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addPaperGrain(ctx, w, h, count = 1400, alpha = 0.028) {
  const rng = seededRandom(w * 97 + h);
  ctx.save();
  for (let i = 0; i < detail(count); i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.fillStyle = `rgba(${rng() > 0.5 ? '40,32,22' : '255,250,236'},${alpha * rng()})`;
    ctx.fillRect(x, y, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
  ctx.restore();
}

/* ------------------------------ 扑克牌 ------------------------------ */

function drawIndex(ctx, rank, suit, x, y, scale) {
  const meta = SUITS[suit];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = meta.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${rank === 10 ? '600 44px' : '600 54px'} Georgia, "Times New Roman", serif`;
  ctx.fillText(rankLabel(rank), 0, 0);
  ctx.font = '36px Georgia, "Times New Roman", serif';
  ctx.fillText(meta.glyph, 0, 46);
  ctx.restore();
}

const PIP_LAYOUT = {
  2: [[0.5, 0.16], [0.5, 0.84, true]],
  3: [[0.5, 0.16], [0.5, 0.5], [0.5, 0.84, true]],
  4: [[0.3, 0.16], [0.7, 0.16], [0.3, 0.84, true], [0.7, 0.84, true]],
  5: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.5], [0.3, 0.84, true], [0.7, 0.84, true]],
  6: [[0.3, 0.16], [0.7, 0.16], [0.3, 0.5], [0.7, 0.5], [0.3, 0.84, true], [0.7, 0.84, true]],
  7: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.3, 0.84, true], [0.7, 0.84, true]],
  8: [
    [0.3, 0.16], [0.7, 0.16], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5],
    [0.5, 0.68, true], [0.3, 0.84, true], [0.7, 0.84, true],
  ],
  9: [
    [0.3, 0.13], [0.7, 0.13], [0.3, 0.37], [0.7, 0.37], [0.5, 0.5],
    [0.3, 0.63, true], [0.7, 0.63, true], [0.3, 0.87, true], [0.7, 0.87, true],
  ],
  10: [
    [0.3, 0.13], [0.7, 0.13], [0.5, 0.25], [0.3, 0.37], [0.7, 0.37],
    [0.3, 0.63, true], [0.7, 0.63, true], [0.5, 0.75, true], [0.3, 0.87, true], [0.7, 0.87, true],
  ],
};

function drawCourt(ctx, rank, suit, W, H) {
  const meta = SUITS[suit];
  const frameX = W * 0.19;
  const frameY = H * 0.115;
  const frameW = W * 0.62;
  const frameH = H * 0.77;

  ctx.save();
  roundRect(ctx, frameX, frameY, frameW, frameH, 16);
  const grad = ctx.createLinearGradient(0, frameY, 0, frameY + frameH);
  grad.addColorStop(0, 'rgba(255,252,244,0.85)');
  grad.addColorStop(1, 'rgba(238,228,208,0.85)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(186,158,105,0.75)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  roundRect(ctx, frameX + 6, frameY + 6, frameW - 12, frameH - 12, 12);
  ctx.strokeStyle = 'rgba(186,158,105,0.32)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 中心徽章
  const cx = W / 2;
  const cy = H / 2 + 2;
  const radius = W * 0.19;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(249,243,230,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(174,141,84,0.65)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(174,141,84,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = meta.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 118px Georgia, "Times New Roman", serif';
  ctx.fillText(rankLabel(rank), cx, cy + 4);

  ctx.fillStyle = meta.color;
  ctx.globalAlpha = 0.9;
  ctx.font = '30px Georgia, serif';
  ctx.fillText(meta.glyph, cx, frameY + 38);
  ctx.fillText(meta.glyph, cx, frameY + frameH - 38);
  ctx.globalAlpha = 1;

  // 金色小皇冠
  const crownY = cy - radius - 40;
  ctx.beginPath();
  ctx.moveTo(cx - 26, crownY + 20);
  ctx.lineTo(cx - 30, crownY - 2);
  ctx.lineTo(cx - 10, crownY + 10);
  ctx.lineTo(cx, crownY - 10);
  ctx.lineTo(cx + 10, crownY + 10);
  ctx.lineTo(cx + 30, crownY - 2);
  ctx.lineTo(cx + 26, crownY + 20);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(174,141,84,0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 角落花纹
  const flourish = (fx, fy, sx, sy) => {
    ctx.beginPath();
    ctx.moveTo(fx + 16 * sx, fy);
    ctx.lineTo(fx, fy);
    ctx.lineTo(fx, fy + 16 * sy);
    ctx.strokeStyle = 'rgba(174,141,84,0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  };
  flourish(frameX + 18, frameY + 18, 1, 1);
  flourish(frameX + frameW - 18, frameY + 18, -1, 1);
  flourish(frameX + 18, frameY + frameH - 18, 1, -1);
  flourish(frameX + frameW - 18, frameY + frameH - 18, -1, -1);

  ctx.restore();
}

function drawAce(ctx, suit, W, H) {
  const meta = SUITS[suit];
  const cx = W / 2;
  const cy = H / 2 + 8;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 94, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(249,243,230,0.8)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(174,141,84,0.65)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 84, 0, Math.PI * 2);
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = 'rgba(174,141,84,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = meta.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '156px Georgia, "Times New Roman", serif';
  ctx.fillText(meta.glyph, cx, cy + 10);

  ctx.strokeStyle = 'rgba(174,141,84,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 106, cy + Math.sin(a) * 106);
    ctx.lineTo(cx + Math.cos(a) * 118, cy + Math.sin(a) * 118);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPips(ctx, rank, suit, W, H) {
  const meta = SUITS[suit];
  const layout = PIP_LAYOUT[rank] || [];
  ctx.save();
  ctx.fillStyle = meta.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '38px Georgia, "Times New Roman", serif';
  for (const [px, py, flip] of layout) {
    const x = px * W;
    const y = py * H;
    if (flip) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI);
      ctx.fillText(meta.glyph, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(meta.glyph, x, y);
    }
  }
  ctx.restore();
}

const SUIT_LETTERS = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** 数字牌面：不使用扑克牌图案，以大号数字 + 花色图标保证可读性 */
export function createCardFaceTexture(rank, suit) {
  const W = 320;
  const H = 448;
  const scale = Math.max(0.9, QUALITY.textureScale || 1);
  const canvas = makeCanvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const red = suit === 'h' || suit === 'd';
  const ink = red ? '#b02436' : '#161b21';

  const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, '#fdf9ef');
  bg.addColorStop(0.6, '#f6eedd');
  bg.addColorStop(1, '#ece0c9');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  addPaperGrain(ctx, W, H, 700, 0.02);

  ctx.strokeStyle = 'rgba(24, 28, 34, 0.82)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.strokeStyle = red ? 'rgba(176,36,54,0.5)' : 'rgba(178,146,92,0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  const text = rankLabel(rank);
  const suitMark = SUIT_LETTERS[suit];
  // 花色做整张牌的淡色背景，数字左上角放大，实心花色右下角，互不重叠。
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 330px "Segoe UI Symbol", "Noto Sans Symbols 2", "Microsoft YaHei", sans-serif';
  ctx.fillText(suitMark, W / 2, H / 2 + 12);
  ctx.restore();

  const fontSize = text.length > 1 ? 176 : 214;
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.fillText(text, 22, 16);

  ctx.font = '700 118px "Segoe UI Symbol", "Noto Sans Symbols 2", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(suitMark, W - 22, H - 16);

  // 保留原牌面，只在梅花/红桃右上角加中文字标。
  const cornerCn = suit === 'c' ? '梅' : suit === 'h' ? '桃' : '';
  if (cornerCn) {
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '700 58px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillText(cornerCn, W - 24, 26);
  }

  return canvasTexture(canvas, { anisotropy: 16 });
}

let cardBackTextureCache = null;

/** 牌背：纯色几何纹样，不含任何扑克牌符号 */
export function getCardBackTexture() {
  if (cardBackTextureCache) return cardBackTextureCache;
  const W = 320;
  const H = 448;
  const scale = Math.max(0.9, QUALITY.textureScale || 1);
  const canvas = makeCanvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#122019');
  bg.addColorStop(0.55, '#0b1411');
  bg.addColorStop(1, '#050908');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(217,185,119,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(13, 13, W - 26, H - 26);
  ctx.strokeStyle = 'rgba(217,185,119,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(217,185,119,0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-54, -54, 108, 108);
  ctx.strokeStyle = 'rgba(217,185,119,0.18)';
  ctx.strokeRect(-70, -70, 140, 140);
  ctx.fillStyle = 'rgba(217,185,119,0.28)';
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();

  ctx.fillStyle = 'rgba(232,203,142,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 14px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText('德 扑 之 夜', cx, cy + 112);

  addPaperGrain(ctx, W, H, detail(600), 0.02);

  cardBackTextureCache = canvasTexture(canvas, { anisotropy: 16 });
  return cardBackTextureCache;
}

/* ------------------------------ 桌面材质 ------------------------------ */

let feltTextureCache = null;

export function getFeltTexture() {
  if (feltTextureCache) return feltTextureCache;
  const S = Math.max(256, Math.round(1024 * (QUALITY.textureScale || 1)));
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(1428);

  ctx.fillStyle = '#0b4632';
  ctx.fillRect(0, 0, S, S);

  const glow = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.55);
  glow.addColorStop(0, 'rgba(38,122,88,0.5)');
  glow.addColorStop(0.55, 'rgba(15,78,56,0.25)');
  glow.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < detail(26000); i += 1) {
    const x = rng() * S;
    const y = rng() * S;
    const v = rng();
    ctx.fillStyle = v > 0.55
      ? `rgba(120,190,150,${0.015 + rng() * 0.035})`
      : `rgba(0,0,0,${0.02 + rng() * 0.05})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }

  // 纤维
  ctx.save();
  for (let i = 0; i < detail(420); i += 1) {
    const x = rng() * S;
    const y = rng() * S;
    const len = 4 + rng() * 22;
    const angle = rng() * Math.PI;
    ctx.strokeStyle = `rgba(150,205,170,${0.02 + rng() * 0.045})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();

  // 中心暗纹徽章
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = 'rgba(217,185,119,0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.155, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(217,185,119,0.05)';
  ctx.font = '64px "KaiTi", "STKaiti", "Microsoft YaHei", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('德', 0, 0);
  ctx.restore();

  const texture = canvasTexture(canvas, { anisotropy: QUALITY.anisotropy });
  feltTextureCache = texture;
  return texture;
}

let woodTextureCache = null;

export function getWoodTexture() {
  if (woodTextureCache) return woodTextureCache;
  const W = Math.max(256, Math.round(1024 * (QUALITY.textureScale || 1)));
  const H = W;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(778);

  ctx.fillStyle = '#26130c';
  ctx.fillRect(0, 0, W, H);

  const plankH = 128;
  for (let row = 0; row < H / plankH; row += 1) {
    const y = row * plankH;
    const shade = 18 + Math.floor(rng() * 18);
    ctx.fillStyle = `rgb(${shade + 16},${Math.floor(shade * 0.55) + 6},${Math.floor(shade * 0.36) + 3})`;
    ctx.fillRect(0, y, W, plankH - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, y + plankH - 2, W, 2);

    for (let i = 0; i < 46; i += 1) {
      const gy = y + rng() * plankH;
      ctx.strokeStyle = `rgba(0,0,0,${0.08 + rng() * 0.16})`;
      ctx.lineWidth = 0.6 + rng() * 1.8;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= W; x += 48) {
        ctx.lineTo(x, gy + Math.sin(x * 0.012 + rng() * 6) * (1 + rng() * 2));
      }
      ctx.stroke();
    }

    for (let i = 0; i < 3; i += 1) {
      const kx = rng() * W;
      const ky = y + 20 + rng() * (plankH - 40);
      const radial = ctx.createRadialGradient(kx, ky, 1, kx, ky, 16);
      radial.addColorStop(0, 'rgba(0,0,0,0.5)');
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(kx - 18, ky - 18, 36, 36);
    }
  }

  ctx.fillStyle = 'rgba(255,220,180,0.03)';
  for (let i = 0; i < 40; i += 1) {
    ctx.fillRect(rng() * W, rng() * H, 1, 6 + rng() * 40);
  }

  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  woodTextureCache = texture;
  return texture;
}

let leatherTextureCache = null;

export function getLeatherTexture() {
  if (leatherTextureCache) return leatherTextureCache;
  const S = Math.max(192, Math.round(512 * (QUALITY.textureScale || 1)));
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(3301);
  ctx.fillStyle = '#1d120f';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < detail(12000); i += 1) {
    const x = rng() * S;
    const y = rng() * S;
    ctx.fillStyle = rng() > 0.5
      ? `rgba(80,52,40,${rng() * 0.1})`
      : `rgba(0,0,0,${rng() * 0.22})`;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < detail(55); i += 1) {
    ctx.strokeStyle = `rgba(0,0,0,${0.15 + rng() * 0.2})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const x = rng() * S;
    const y = rng() * S;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 30, y + 10, x + 40, y + 40, x + 70 + rng() * 40, y + 30);
    ctx.stroke();
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  leatherTextureCache = texture;
  return texture;
}

let carpetTextureCache = null;

export function getCarpetTexture() {
  if (carpetTextureCache) return carpetTextureCache;
  const S = Math.max(256, Math.round(1024 * (QUALITY.textureScale || 1)));
  const canvas = makeCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(9917);

  ctx.fillStyle = '#25100f';
  ctx.fillRect(0, 0, S, S);

  const radial = ctx.createRadialGradient(S / 2, S / 2, 100, S / 2, S / 2, S * 0.7);
  radial.addColorStop(0, 'rgba(86,32,27,0.55)');
  radial.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, S, S);

  // 装饰边框
  ctx.strokeStyle = 'rgba(186,146,84,0.22)';
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, S - 96, S - 96);
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 70, S - 140, S - 140);

  // 中央菱形纹样
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  for (let i = 0; i < 4; i += 1) {
    const size = 280 - i * 58;
    ctx.strokeStyle = `rgba(186,146,84,${0.12 - i * 0.018})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
  }
  ctx.restore();

  // 细密噪点
  for (let i = 0; i < detail(30000); i += 1) {
    ctx.fillStyle = rng() > 0.5 ? `rgba(255,210,170,${rng() * 0.02})` : `rgba(0,0,0,${rng() * 0.06})`;
    ctx.fillRect(rng() * S, rng() * S, 1, 1);
  }

  const texture = canvasTexture(canvas);
  carpetTextureCache = texture;
  return texture;
}

/* ------------------------------ 筹码 ------------------------------ */

export const CHIP_DENOMS = [
  { value: 1000, base: '#b48a4a', accent: '#f4e8cd', dark: '#6f5222', label: '1K' },
  { value: 500, base: '#5c3a78', accent: '#eee4d2', dark: '#2c1a3b', label: '500' },
  { value: 100, base: '#22262c', accent: '#e9dfcc', dark: '#0c0e11', label: '100' },
  { value: 25, base: '#1c6b4c', accent: '#eae1cd', dark: '#0a2d1f', label: '25' },
];

const chipTextureCache = new Map();

export function getChipTextures(value) {
  if (chipTextureCache.has(value)) return chipTextureCache.get(value);
  const denom = CHIP_DENOMS.find((d) => d.value === value) || CHIP_DENOMS[3];

  const topCanvas = makeCanvas(256, 256);
  const top = topCanvas.getContext('2d');
  const cx = 128;
  const cy = 128;

  top.fillStyle = denom.base;
  top.beginPath();
  top.arc(cx, cy, 127, 0, Math.PI * 2);
  top.fill();

  const rimGrad = top.createRadialGradient(90, 80, 20, cx, cy, 128);
  rimGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
  rimGrad.addColorStop(0.62, 'rgba(0,0,0,0)');
  rimGrad.addColorStop(1, 'rgba(0,0,0,0.42)');
  top.fillStyle = rimGrad;
  top.beginPath();
  top.arc(cx, cy, 127, 0, Math.PI * 2);
  top.fill();

  for (let i = 0; i < 8; i += 1) {
    top.save();
    top.translate(cx, cy);
    top.rotate((i / 8) * Math.PI * 2);
    top.fillStyle = denom.accent;
    top.globalAlpha = 0.92;
    roundRect(top, -14, -124, 28, 26, 5);
    top.fill();
    top.restore();
  }

  top.strokeStyle = 'rgba(0,0,0,0.35)';
  top.lineWidth = 2;
  top.beginPath();
  top.arc(cx, cy, 100, 0, Math.PI * 2);
  top.stroke();

  top.fillStyle = denom.accent;
  top.globalAlpha = 0.95;
  top.beginPath();
  top.arc(cx, cy, 78, 0, Math.PI * 2);
  top.fill();
  top.globalAlpha = 1;

  top.strokeStyle = 'rgba(0,0,0,0.2)';
  top.lineWidth = 2;
  top.beginPath();
  top.arc(cx, cy, 70, 0, Math.PI * 2);
  top.stroke();

  top.fillStyle = denom.dark;
  top.textAlign = 'center';
  top.textBaseline = 'middle';
  top.font = `600 ${denom.value === 1000 ? 50 : 56}px Georgia, "Times New Roman", serif`;
  top.fillText(denom.label, cx, cy + 3);

  const sideCanvas = makeCanvas(512, 64);
  const side = sideCanvas.getContext('2d');
  side.fillStyle = denom.base;
  side.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 8; i += 1) {
    side.fillStyle = denom.accent;
    side.globalAlpha = 0.92;
    side.fillRect(i * 64 + 18, 0, 20, 64);
  }
  side.globalAlpha = 1;
  const shade = side.createLinearGradient(0, 0, 0, 64);
  shade.addColorStop(0, 'rgba(255,255,255,0.16)');
  shade.addColorStop(0.28, 'rgba(255,255,255,0)');
  shade.addColorStop(0.72, 'rgba(0,0,0,0.04)');
  shade.addColorStop(1, 'rgba(0,0,0,0.38)');
  side.fillStyle = shade;
  side.fillRect(0, 0, 512, 64);
  for (let i = 0; i < detail(700); i += 1) {
    side.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    side.fillRect(Math.random() * 512, Math.random() * 64, 1, 1);
  }

  const result = {
    top: canvasTexture(topCanvas),
    side: canvasTexture(sideCanvas),
  };
  chipTextureCache.set(value, result);
  return result;
}

/* ------------------------------ 场景装饰 ------------------------------ */

export function getWallArtTexture(seed = 1) {
  const W = 640;
  const H = 480;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rng = seededRandom(seed * 101 + 17);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (seed % 3 === 0) {
    bg.addColorStop(0, '#1a2327');
    bg.addColorStop(0.5, '#0c1214');
    bg.addColorStop(1, '#242a25');
  } else if (seed % 3 === 1) {
    bg.addColorStop(0, '#2a1c16');
    bg.addColorStop(0.5, '#120b09');
    bg.addColorStop(1, '#30201a');
  } else {
    bg.addColorStop(0, '#1c1a28');
    bg.addColorStop(1, '#0d0c12');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 装饰弧线
  for (let i = 0; i < detail(26); i += 1) {
    const x = rng() * W;
    const y = rng() * H;
    const r = 30 + rng() * 230;
    ctx.strokeStyle = `rgba(200,168,108,${0.04 + rng() * 0.13})`;
    ctx.lineWidth = 0.6 + rng() * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, r, rng() * Math.PI, rng() * Math.PI + 0.7 + rng() * 1.6);
    ctx.stroke();
  }

  // 中央月轮
  const mx = W * (0.35 + rng() * 0.3);
  const my = H * (0.35 + rng() * 0.25);
  const mr = 60 + rng() * 40;
  const moon = ctx.createRadialGradient(mx - 20, my - 20, 8, mx, my, mr);
  moon.addColorStop(0, 'rgba(250,232,194,0.85)');
  moon.addColorStop(0.5, 'rgba(214,176,110,0.4)');
  moon.addColorStop(1, 'rgba(214,176,110,0)');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();

  // 山形剪影
  ctx.fillStyle = 'rgba(6,8,9,0.72)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.72);
  for (let x = 0; x <= W; x += 40) {
    ctx.lineTo(x, H * 0.7 - rng() * 70);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // 金箔颗粒
  for (let i = 0; i < detail(900); i += 1) {
    ctx.fillStyle = `rgba(232,198,132,${rng() * 0.12})`;
    ctx.fillRect(rng() * W, rng() * H, 1 + rng() * 1.6, 1 + rng() * 1.6);
  }

  return canvasTexture(canvas);
}

export function getNeonTexture() {
  const W = 1024;
  const H = 512;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const drawGlowText = (text, x, y, font, core, glow, blur) => {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font;
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.fillStyle = glow;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = blur * 0.45;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = core;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  drawGlowText('德 扑 之 夜', W / 2, H / 2 + 38, '600 118px "KaiTi", "STKaiti", "Microsoft YaHei", serif', '#fff2cf', 'rgba(255,192,104,0.95)', 42);
  drawGlowText('私 人 牌 局', W / 2, H / 2 + 150, '400 34px "Microsoft YaHei", sans-serif', 'rgba(255,230,186,0.9)', 'rgba(255,168,88,0.8)', 22);

  // 标志
  ctx.save();
  ctx.translate(W / 2, H / 2 - 112);
  ctx.shadowColor = 'rgba(255,196,110,0.9)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = '#ffe7b8';
  ctx.font = '600 78px "KaiTi", "STKaiti", "Microsoft YaHei", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('德', 0, 0);
  ctx.restore();

  // 横向霓虹装饰线
  ctx.save();
  ctx.shadowColor = 'rgba(255,190,110,0.8)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = 'rgba(255,224,176,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, H * 0.78);
  ctx.lineTo(W * 0.8, H * 0.78);
  ctx.stroke();
  ctx.restore();

  return canvasTexture(canvas);
}

export function getNameplateTexture(name, stack, action = '', actionTone = 'neutral') {
  const W = 640;
  const H = 208;
  const scale = Math.max(0.68, Math.min(1, (QUALITY.textureScale || 1) + 0.08));
  const canvas = makeCanvas(Math.round(W * scale), Math.round(H * scale));
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, W, H);

  roundRect(ctx, 6, 6, W - 12, H - 12, 40);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(24,28,32,0.9)');
  bg.addColorStop(1, 'rgba(7,9,11,0.94)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,185,119,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2ead9';
  ctx.font = '500 42px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(name, 40, 64);

  ctx.fillStyle = 'rgba(217,185,119,0.62)';
  ctx.font = '400 24px "Microsoft YaHei", sans-serif';
  ctx.fillText('筹码', 42, 130);

  ctx.fillStyle = '#f0d9a3';
  ctx.font = '500 44px Georgia, "Times New Roman", serif';
  ctx.fillText(stack.toLocaleString('en-US'), 108, 132);

  if (action) {
    const tone = {
      fold: ['rgba(93,44,40,0.9)', '#e8b2aa'],
      turn: ['rgba(96,73,30,0.96)', '#ffe2a5'],
      call: ['rgba(58,64,52,0.9)', '#dce8cf'],
      raise: ['rgba(120,92,38,0.92)', '#ffe6ad'],
      allin: ['rgba(134,52,36,0.94)', '#ffe0c4'],
      win: ['rgba(46,96,68,0.94)', '#d8f5e4'],
      neutral: ['rgba(48,52,58,0.9)', '#d8d2c4'],
    }[actionTone] || ['rgba(48,52,58,0.9)', '#d8d2c4'];
    const textW = Math.min(240, 52 + action.length * 26);
    roundRect(ctx, W - textW - 26, H / 2 - 30, textW, 60, 30);
    ctx.fillStyle = tone[0];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = tone[1];
    ctx.textAlign = 'center';
    ctx.font = '500 30px "Microsoft YaHei", sans-serif';
    ctx.fillText(action, W - textW / 2 - 26, H / 2 + 1);
  }

  return canvasTexture(canvas);
}

export function getGlowSpriteTexture(color = 'rgba(255,214,150,1)') {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color.replace('1)', '0.35)'));
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

export function getDustTexture() {
  const canvas = makeCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,238,206,1)');
  grad.addColorStop(0.4, 'rgba(255,220,170,0.35)');
  grad.addColorStop(1, 'rgba(255,210,150,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
}

export function getLightConeTexture() {
  const canvas = makeCanvas(128, 256);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,224,178,0.55)');
  grad.addColorStop(0.4, 'rgba(255,214,160,0.18)');
  grad.addColorStop(1, 'rgba(255,205,150,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  // 两侧淡出
  const side = ctx.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.18, 'rgba(0,0,0,0)');
  side.addColorStop(0.82, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 128, 256);
  ctx.globalCompositeOperation = 'source-over';
  return canvasTexture(canvas);
}

export function getBottleLabelTexture(seed = 1) {
  const canvas = makeCanvas(128, 256);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = seed % 2 ? '#2a1810' : '#0e1c16';
  ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = 'rgba(217,185,119,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 78, 100, 100);
  ctx.fillStyle = 'rgba(232,203,142,0.8)';
  ctx.textAlign = 'center';
  ctx.font = '500 18px Georgia, serif';
  ctx.fillText('RESERVE', 64, 118);
  ctx.font = '400 14px Georgia, serif';
  ctx.fillText(seed % 2 ? 'WHISKY' : 'GIN', 64, 142);
  ctx.beginPath();
  ctx.arc(64, 160, 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,203,142,0.7)';
  ctx.stroke();
  return canvasTexture(canvas);
}
