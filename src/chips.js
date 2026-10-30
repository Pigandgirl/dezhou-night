import * as THREE from 'three';
import { animate, easeInOutCubic, easeOutCubic } from './util.js';
import { getChipTextures, CHIP_DENOMS, getCardBackTexture, createCardFaceTexture } from './textures.js';
import { QUALITY } from './quality.js';
import { mergeStaticGroup } from './merge.js';

export const CARD_WIDTH = 0.105;
export const CARD_HEIGHT = 0.148;
const CARD_GEOMETRY = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

/* ------------------------------ 扑克牌 ------------------------------ */

export class CardManager {
  constructor(scene, tableY) {
    this.scene = scene;
    this.tableY = tableY;
    this.faceTextures = new Map();
    this.backTexture = getCardBackTexture();
  }

  getFaceTexture(card) {
    const key = `${card.rank}${card.suit}`;
    if (!this.faceTextures.has(key)) {
      this.faceTextures.set(key, createCardFaceTexture(card.rank, card.suit));
    }
    return this.faceTextures.get(key);
  }

  createCard(card, faceUp = false) {
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';

    const faceMat = new THREE.MeshBasicMaterial({
      map: this.getFaceTexture(card),
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const backMat = new THREE.MeshBasicMaterial({
      map: this.backTexture,
      color: 0xd0c4ac,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH * 1.06, CARD_HEIGHT * 1.06),
      new THREE.MeshBasicMaterial({ color: 0xd8cbb2, side: THREE.DoubleSide }),
    );
    edge.position.z = -0.0012;
    group.add(edge);

    const face = new THREE.Mesh(CARD_GEOMETRY, faceMat);
    face.position.z = 0.0007;
    face.castShadow = true;
    face.receiveShadow = true;

    const back = new THREE.Mesh(CARD_GEOMETRY, backMat);
    back.position.z = -0.0007;
    back.rotation.y = Math.PI;
    back.castShadow = true;
    back.receiveShadow = true;

    group.add(face, back);
    const baseY = this.tableY + 0.007;
    face.visible = faceUp;
    back.visible = !faceUp;
    group.rotation.x = -Math.PI / 2;
    group.rotation.z = faceUp ? 0 : Math.PI;
    group.userData = {
      card,
      faceMat,
      backMat,
      faceUp,
      baseY,
      faceMesh: face,
      backMesh: back,
    };
    return group;
  }

  clearAll() {
    const doomed = [];
    for (const child of [...this.scene.children]) {
      if (child && child.userData && child.userData.card && child.userData.faceMat) doomed.push(child);
    }
    if (doomed.length) this.cardsRemove(doomed);
    return doomed.length;
  }

  cardsRemove(list) {
    for (const group of list) {
      this.scene.remove(group);
      if (group.userData) {
        group.userData.faceMat?.dispose?.();
        group.userData.backMat?.dispose?.();
      }
    }
  }

  place(group, position, yaw = 0) {
    group.position.set(position.x, this.tableY + 0.007, position.z);
    group.rotation.order = 'YXZ';
    group.rotation.y = yaw;
    group.rotation.x = -Math.PI / 2;
    group.userData.baseY = this.tableY + 0.007;
    group.userData.baseYaw = yaw;
  }

  async deal({ card, from, to, yaw = 0, faceUp = false, duration = 520, arc = 0.2, pan = 0, onLand }) {
    const group = this.createCard(card, false);
    group.position.set(from.x, this.tableY + 0.025, from.z);
    group.rotation.y = yaw + (Math.random() - 0.5) * 0.7;
    group.rotation.x = -Math.PI / 2 + 0.18;
    group.rotation.z = Math.PI;
    this.scene.add(group);

    const start = new THREE.Vector3(from.x, this.tableY + 0.025, from.z);
    const end = new THREE.Vector3(to.x, this.tableY + 0.007, to.z);
    const startYaw = group.rotation.y;
    const startTilt = group.rotation.x;

    await animate(
      duration,
      (t) => {
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        const y = this.tableY + 0.004 + Math.sin(Math.PI * t) * arc;
        group.position.set(x, y, z);
        group.rotation.y = startYaw + (yaw - startYaw) * t;
        group.rotation.x = startTilt + (-Math.PI / 2 - startTilt) * t;
      },
      easeOutCubic,
    );

    group.position.copy(end);
    group.rotation.y = yaw;
    group.rotation.x = -Math.PI / 2;
    group.rotation.z = Math.PI;
    group.userData.baseY = end.y;
    group.userData.baseYaw = yaw;
    if (onLand) onLand();
    if (faceUp) await this.flip(group, true, 260);
    return group;
  }

  async flip(group, faceUp, duration = 300) {
    const from = group.rotation.z;
    const to = faceUp ? 0 : Math.PI;
    const baseY = group.userData.baseY ?? this.tableY + 0.007;
    const { faceMesh, backMesh } = group.userData;
    let swapped = false;
    await animate(
      duration,
      (t) => {
        group.rotation.z = from + (to - from) * t;
        group.position.y = baseY + Math.sin(Math.PI * t) * 0.035;
        if (!swapped && t >= 0.5) {
          swapped = true;
          faceMesh.visible = faceUp;
          backMesh.visible = !faceUp;
        }
      },
      easeInOutCubic,
    );
    group.rotation.z = to;
    group.position.y = baseY;
    group.userData.faceUp = faceUp;
    faceMesh.visible = faceUp;
    backMesh.visible = !faceUp;
  }

  async highlight(group, on) {
    const baseY = group.userData.baseY ?? this.tableY + 0.002;
    await animate(
      420,
      (t) => {
        const amount = on ? t : 1 - t;
        group.position.y = baseY + amount * 0.018;
        const scale = 1 + amount * 0.08;
        group.scale.set(scale, scale, 1);
      },
      easeOutCubic,
    );
  }

  async muck(groups, target, duration = 480) {
    const list = groups.filter(Boolean);
    for (const group of list) {
      group.userData.faceMat.transparent = true;
      group.userData.backMat.transparent = true;
      group.userData.faceMat.needsUpdate = true;
      group.userData.backMat.needsUpdate = true;
    }
    await Promise.all(
      list.map((group, i) =>
        animate(
          duration,
          (t) => {
            const x = group.position.x + (target.x - group.position.x) * t;
            const z = group.position.z + (target.z - group.position.z) * t;
            group.position.x = x;
            group.position.z = z;
            group.position.y = (group.userData.baseY ?? this.tableY) + Math.sin(t * Math.PI) * 0.04;
            group.rotation.y += 0.02 * (i + 1);
            const s = 1 - t * 0.55;
            group.scale.set(s, s, 1);
            group.userData.faceMat.opacity = 1 - t;
            group.userData.backMat.opacity = 1 - t;
            group.userData.faceMat.transparent = true;
            group.userData.backMat.transparent = true;
          },
          easeOutCubic,
        ),
      ),
    );
    for (const group of list) {
      this.scene.remove(group);
      group.userData.faceMat.dispose();
      group.userData.backMat.dispose();
    }
  }

  remove(groups) {
    for (const group of groups.filter(Boolean)) {
      this.scene.remove(group);
      group.userData.faceMat.dispose();
      group.userData.backMat.dispose();
    }
  }
}

/* ------------------------------ 筹码 ------------------------------ */

const CHIP_RADIUS = 0.021;
const CHIP_HEIGHT = 0.0045;
const CHIP_GEOMETRY = new THREE.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_HEIGHT, 36);

const chipMaterialCache = new Map();

function getChipMaterials(value) {
  if (chipMaterialCache.has(value)) return chipMaterialCache.get(value);
  const { top, side } = getChipTextures(value);
  const topMat = new THREE.MeshStandardMaterial({
    map: top,
    roughness: 0.4,
    metalness: 0.04,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    map: side,
    roughness: 0.48,
    metalness: 0.03,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    color: 0x1d1712,
    roughness: 0.7,
    metalness: 0.05,
  });
  const materials = [sideMat, topMat, bottomMat];
  chipMaterialCache.set(value, materials);
  // 中/低画质筹码只用单材质，才能被 mergeStaticGroup 真正合批。
  // 否则 Cylinder 的 3 个材质组会让每一枚筹码固定占 3 个 draw call。
  return QUALITY.tier === 'high' ? materials : topMat;
}

function makeAmountLabel(text, big = false) {
  const W = 320;
  const H = 112;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const pad = big ? 18 : 22;
  ctx.beginPath();
  const r = 26;
  ctx.moveTo(pad + r, pad);
  ctx.arcTo(W - pad, pad, W - pad, H - pad, r);
  ctx.arcTo(W - pad, H - pad, pad, H - pad, r);
  ctx.arcTo(pad, H - pad, pad, pad, r);
  ctx.arcTo(pad, pad, W - pad, pad, r);
  ctx.closePath();
  ctx.fillStyle = big ? 'rgba(8,10,12,0.82)' : 'rgba(7,9,11,0.68)';
  ctx.fill();
  ctx.strokeStyle = big ? 'rgba(217,185,119,0.5)' : 'rgba(217,185,119,0.3)';
  ctx.lineWidth = big ? 3 : 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = big ? '#f4e3bb' : '#eeddb6';
  ctx.font = `${big ? 500 : 500} ${big ? 50 : 44}px Georgia, "Times New Roman", serif`;
  ctx.fillText(text, W / 2, H / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: W / H };
}

export class ChipStack {
  constructor(scene, { spread = false, maxChips = 16, bigLabel = false, labelPrefix = '' } = {}) {
    this.scene = scene;
    this.spread = spread;
    this.maxChips = maxChips;
    this.bigLabel = bigLabel;
    this.labelPrefix = String(labelPrefix || '');
    this.group = new THREE.Group();
    this.labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
    );
    this.labelSprite.visible = false;
    this.labelSprite.renderOrder = 4;
    scene.add(this.group);
    scene.add(this.labelSprite);
    this.amount = 0;
    this.labelVisible = false;
    this.stackTop = 0;
  }

  setPosition(position) {
    this.group.position.copy(position);
    this.updateLabelPosition();
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.isMesh && obj.geometry && obj.geometry !== CHIP_GEOMETRY) obj.geometry.dispose();
    });
    this.labelSprite.material?.map?.dispose();
    this.labelSprite.material?.dispose();
    this.scene.remove(this.group);
    this.scene.remove(this.labelSprite);
  }

  disposeMergedChips() {
    this.group.traverse((obj) => {
      if (obj.isMesh && obj.geometry !== CHIP_GEOMETRY) obj.geometry.dispose();
    });
  }

  decompose(amount) {
    const total = Math.max(0, Math.round(amount));
    if (total === 0) return [];
    // 视觉筹码数量随金额增加，直到达到性能上限；不能因为用大面额
    // 把 1000 显示得比 500 还少。
    const count = Math.min(this.maxChips, Math.max(2, 2 + Math.ceil(total / 200)));
    const chips = [];
    let remaining = total;
    for (let i = 0; i < count; i += 1) {
      const slots = count - i;
      const share = remaining / slots;
      const denom = CHIP_DENOMS.find((d) => d.value <= share)
        || CHIP_DENOMS[CHIP_DENOMS.length - 1];
      chips.push(denom.value);
      remaining -= denom.value;
    }
    return chips;
  }

  setAmount(amount, { label = true, pulse = false } = {}) {
    const visibleLabel = Boolean(label && amount > 0);
    if (this.amount === amount && this.labelVisible === visibleLabel) {
      if (pulse) {
        this.group.scale.set(1, 1, 1);
        animate(360, (t) => {
          const s = 1 + Math.sin(t * Math.PI) * 0.08;
          this.group.scale.set(s, 1 + Math.sin(t * Math.PI) * 0.05, s);
        });
      }
      return;
    }
    this.amount = amount;
    this.disposeMergedChips();
    this.group.clear();
    const chips = this.decompose(amount);
    this.visualChips = chips.length;
    const columns = this.spread ? Math.min(3, Math.ceil(chips.length / 5)) : 1;
    const columnOffsets = columns > 1
      ? [
          [-0.026, -0.012],
          [0.027, 0.015],
          [0.002, -0.045],
        ]
      : [[0, 0]];
    const heights = new Array(columns).fill(0);

    chips.forEach((value, index) => {
      const mesh = new THREE.Mesh(CHIP_GEOMETRY, getChipMaterials(value));
      mesh.castShadow = QUALITY.tier === 'high';
      mesh.receiveShadow = true;
      const col = index % columns;
      const level = heights[col];
      heights[col] += 1;
      const [ox, oz] = columnOffsets[col];
      mesh.position.set(
        ox + (Math.random() - 0.5) * 0.002,
        CHIP_HEIGHT / 2 + level * CHIP_HEIGHT + 0.001,
        oz + (Math.random() - 0.5) * 0.002,
      );
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.015;
      this.group.add(mesh);
    });

    mergeStaticGroup(this.group);

    this.stackTop = Math.max(...heights, 1) * CHIP_HEIGHT;
    this.setLabel(amount, label);

    if (pulse) {
      this.group.scale.set(1, 1, 1);
      animate(360, (t) => {
        const s = 1 + Math.sin(t * Math.PI) * 0.08;
        this.group.scale.set(s, 1 + Math.sin(t * Math.PI) * 0.05, s);
      });
    }
  }

  setLabel(amount, visible = true) {
    if (!visible || amount <= 0) {
      this.labelSprite.visible = false;
      this.labelVisible = false;
      if (this.labelSprite.material.map) {
        this.labelSprite.material.map.dispose();
        this.labelSprite.material.map = null;
      }
      return;
    }
    const text = `${this.labelPrefix}${amount.toLocaleString('en-US')}`;
    const { texture, aspect } = makeAmountLabel(text, this.bigLabel);
    if (this.labelSprite.material.map && this.labelSprite.material.map !== texture) {
      this.labelSprite.material.map.dispose();
    }
    this.labelSprite.material.map = texture;
    this.labelSprite.material.needsUpdate = true;
    const height = this.bigLabel ? 0.18 : 0.1;
    this.labelSprite.scale.set(height * aspect, height, 1);
    this.labelSprite.visible = true;
    this.labelVisible = true;
    this.updateLabelPosition();
  }

  updateLabelPosition() {
    this.labelSprite.position.set(
      this.group.position.x,
      this.group.position.y + this.stackTop + (this.bigLabel ? 0.14 : 0.085),
      this.group.position.z,
    );
  }

  show() {
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
    this.labelSprite.visible = false;
  }
}

export function createFlyingChip(value) {
  const mesh = new THREE.Mesh(CHIP_GEOMETRY, getChipMaterials(value));
  mesh.castShadow = QUALITY.tier === 'high';
  mesh.receiveShadow = true;
  return mesh;
}

function getDealerButtonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe5cf';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#8c6a34';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#2a1c0c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 132px Georgia, serif';
  ctx.fillText('D', 128, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class DealerButton {
  constructor(scene, tableY) {
    const geo = new THREE.CylinderGeometry(0.034, 0.034, 0.008, 40);
    const topMat = new THREE.MeshStandardMaterial({
      map: getDealerButtonTexture(),
      roughness: 0.35,
      metalness: 0.05,
    });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x33251a, roughness: 0.5 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x15100b, roughness: 0.6 });
    this.mesh = new THREE.Mesh(geo, [sideMat, topMat, bottomMat]);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.tableY = tableY;
    this.mesh.position.y = tableY + 0.0045;
    scene.add(this.mesh);
  }

  async moveTo(position, { duration = 520, from = null } = {}) {
    const start = from || this.mesh.position.clone();
    if (start.y < this.tableY) start.y = this.tableY + 0.0045;
    await animate(
      duration,
      (t) => {
        this.mesh.position.set(
          start.x + (position.x - start.x) * t,
          this.tableY + 0.0045 + Math.sin(Math.PI * t) * 0.055,
          start.z + (position.z - start.z) * t,
        );
        this.mesh.rotation.y = t * Math.PI * 1.5;
      },
      easeInOutCubic,
    );
    this.mesh.position.set(position.x, this.tableY + 0.0045, position.z);
    this.mesh.rotation.y = 0;
  }
}
