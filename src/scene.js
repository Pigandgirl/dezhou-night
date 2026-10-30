import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import {
  animate, delay, updateAnimations, clamp, easeInOutCubic, easeOutCubic, lerp,
} from './util.js';
import * as TEX from './textures.js';
import {
  CardManager, ChipStack, DealerButton, createFlyingChip, CARD_WIDTH, CARD_HEIGHT,
} from './chips.js';
import { PlayerRig } from './players.js';
import { PROFILES } from './game.js';
import * as L from './layout.js';
import { audio } from './audio.js';
import { QUALITY } from './quality.js';
import { mergeStaticGroup } from './merge.js';
import { SCENES, getScene } from './scene-presets.js';

function ellipseShape(rx, rz) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  return shape;
}

function ellipseHole(rx, rz) {
  const path = new THREE.Path();
  path.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true, 0);
  return path;
}

function ellipseCurve(rx, rz, y = 0) {
  const points = [];
  const segments = 140;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(rx * Math.cos(a), y, rz * Math.sin(a)));
  }
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.0);
}

function cloneRepeatTexture(base, repeatX, repeatY) {
  const texture = base.clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export class PokerScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050607);
    this.scene.fog = new THREE.FogExp2(0x080b0e, 0.023);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: QUALITY.antialias,
      powerPreference: 'default',
    });
    this.renderDpr = Math.min(window.devicePixelRatio || 1, QUALITY.dprCap);
    this.renderer.setPixelRatio(this.renderDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = QUALITY.shadows;
    this.renderer.shadowMap.type = QUALITY.shadowType === 'soft'
      ? THREE.PCFSoftShadowMap
      : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = QUALITY.tier === 'high' ? 1.26 : 1.48;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(
      L.LOBBY_FOV,
      window.innerWidth / window.innerHeight,
      0.05,
      45,
    );
    this.camera.position.copy(L.LOBBY_CAM);
    this.camLook = L.LOBBY_TARGET.clone();
    this.camera.lookAt(this.camLook);

    this.pointerTarget = { x: 0, y: 0 };
    this.pointerSmooth = { x: 0, y: 0 };
    this.dragging = false;
    this.lookIdleAt = 0;
    this.lookReturnStart = 0;
    this.lookReturnFrom = { x: 0, y: 0 };
    this.mode = 'lobby';
    this.shakeUntil = 0;
    this.shakeAmount = 0;
    this.lastTime = 0;
    this.paused = false;
    this.cameraTransitionToken = 0;
    this.transitionPromise = null;
    this.actorFocusSeat = -1;
    this.actorLookOffset = new THREE.Vector3(0, 0, 0);
    this.spectatorMode = false;
    this.spectatorYaw = 0;
    this.spectatorPitch = 0.35;
    this.spectatorRadius = 2.35;
    // 双指缩放：1=正常坐姿，2.8=接近自由视角的远景。
    this.userZoom = 1;
    this.pointers = new Map();
    this.pinch = null;
    this.lowMotion = false;
    this.viewMode = localStorage.getItem('poker_view_mode') === 'third' ? 'third' : 'first';
    this.currentScene = 'private';
    this.sceneBackdrop = null;
    this.sceneBackdropTexture = null;
    this.perfAcc = 0;
    this.perfFrames = 0;
    this.fpsCap = QUALITY.fpsCap || 60;
    this.lastRenderAt = 0;
    this.renderedFrames = 0;

    this.players = [];
    this.playerCount = 8;
    this.heroSeatIndex = 0;
    this.heroViewCount = 8;
    this.heroCamBase = L.HERO_CAM.clone();
    this.heroLookBase = L.HERO_TARGET.clone();
    this.rigs = [];
    this.chipStacks = [];
    this.betStacks = [];
    this.holeCards = new Map();
    this.boardCards = [];
    this.onBoardCardClick = null;
    this.boardPointerStart = null;
    this.cardEpoch = 0;
    this.potAmount = 0;

    this.setupEnvironment();
    this.buildRoom();
    this.buildTable();
    this.buildLobbyScene();
    this.buildHeroProps();
    this.buildLights();
    this.buildAtmosphere();

    this.cards = new CardManager(this.scene, L.TABLE_Y);
    this.dealerButton = new DealerButton(this.scene, L.TABLE_Y);

    this.potStack = new ChipStack(this.scene, {
      spread: true,
      maxChips: QUALITY.maxPotChips,
      bigLabel: true,
      labelPrefix: '底池 ',
    });
    this.potStack.setPosition(L.POT_SPOT);
    this.potStack.hide();

    this.setupComposer();
    this.bindEvents();
    this.renderer.setAnimationLoop((time) => this.render(time));
  }

  setupEnvironment() {
    if (!QUALITY.environment) {
      this.scene.environment = null;
      return;
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.envRT = pmrem.fromScene(envScene, 0.04);
    this.scene.environment = this.envRT.texture;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.24;
  }

  setupComposer() {
    if (!QUALITY.bloom) {
      this.composer = null;
      this.bloom = null;
      return;
    }
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(
        window.innerWidth * QUALITY.bloomScale,
        window.innerHeight * QUALITY.bloomScale,
      ),
      QUALITY.bloomStrength,
      0.62,
      QUALITY.bloomThreshold,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  bindEvents() {
    const canvas = this.canvas;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom: this.userZoom,
          radius: this.spectatorRadius,
        };
      }
      this.dragging = true;
      this.lookIdleAt = 0;
      this.lookReturnStart = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch { /* 忽略 */ }
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size >= 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const ratio = this.pinch.distance / distance;
        if (this.mode === 'spectator') {
          this.spectatorRadius = clamp(this.pinch.radius * ratio, 1.6, 3.8);
        } else if (this.mode === 'hero') {
          this.userZoom = clamp(this.pinch.zoom * ratio, 1, 2.8);
        }
        this.lookIdleAt = 0;
        return;
      }
      if (!this.dragging) {
        if (this.mode === 'lobby' && event.pointerType === 'mouse' && event.buttons === 0) {
          this.pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
          this.pointerTarget.y = (event.clientY / window.innerHeight) * 2 - 1;
        }
        return;
      }
      const dx = (event.clientX - lastX) / Math.max(1, window.innerWidth);
      const dy = (event.clientY - lastY) / Math.max(1, window.innerHeight);
      lastX = event.clientX;
      lastY = event.clientY;
      if (this.mode === 'spectator') {
        this.spectatorYaw -= dx * 2.8;
        this.spectatorPitch = clamp(this.spectatorPitch + dy * 1.8, 0.08, 0.9);
        return;
      }
      this.pointerTarget.x = clamp(this.pointerTarget.x + dx * 2.4, -1, 1);
      this.pointerTarget.y = clamp(this.pointerTarget.y + dy * 2.4, -1, 1);
    });

    const endDrag = (event) => {
      if (event && this.pointers.has(event.pointerId)) this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!this.dragging) return;
      this.dragging = false;
      // 不立刻回正：保留当前视角，2 秒后再缓慢扭头回到牌桌
      this.lookIdleAt = performance.now();
      this.lookReturnStart = 0;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerdown', (event) => {
      if (this.pointers.size > 1) return;
      this.boardPointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      const start = this.boardPointerStart;
      this.boardPointerStart = null;
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) return;
      this.hitBoardCard(event);
    });

    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') endDrag(event);
    });

    canvas.addEventListener('wheel', (event) => {
      if (this.mode !== 'spectator' && this.mode !== 'hero') return;
      event.preventDefault();
      if (this.mode === 'spectator') {
        this.spectatorRadius = clamp(this.spectatorRadius + event.deltaY * 0.002, 1.6, 3.8);
      } else {
        this.userZoom = clamp(this.userZoom + event.deltaY * 0.0014, 1, 2.8);
      }
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      endDrag();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true;
        this.renderer.setAnimationLoop(null);
      } else if (this.paused) {
        this.paused = false;
        this.lastTime = 0;
        this.lastRenderAt = 0;
        this.renderer.setAnimationLoop((time) => this.render(time));
      }
    });
  }

  applyRenderSize(w, h) {
    this.renderer.setPixelRatio(this.renderDpr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderDpr);
      this.composer.setSize(w, h);
      if (this.bloom) {
        this.bloom.setSize(w * QUALITY.bloomScale, h * QUALITY.bloomScale);
      }
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyRenderSize(w, h);
  }

  /* -------------------------------------------------------------------------- */
  /*                                  房间                                       */
  /* -------------------------------------------------------------------------- */

  buildRoom() {
    const scene = this.scene;
    const before = new Set(scene.children);
    const woodBase = TEX.getWoodTexture();
    const leatherBase = TEX.getLeatherTexture();

    const floorMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 7, 6),
      color: 0xa08a72,
      roughness: 0.38,
      metalness: 0.04,
      envMapIntensity: 0.5,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 17), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -1.2);
    floor.receiveShadow = true;
    scene.add(floor);

    const rugMat = new THREE.MeshStandardMaterial({
      map: TEX.getCarpetTexture(),
      roughness: 0.96,
      metalness: 0,
    });
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 96), rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(3.35, 2.5, 1);
    rug.position.set(0, 0.007, -0.1);
    rug.receiveShadow = true;
    scene.add(rug);

    const wallBump = cloneRepeatTexture(leatherBase, 9, 4);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1b2a23,
      roughness: 0.9,
      metalness: 0.02,
      bumpMap: wallBump,
      bumpScale: 0.02,
    });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), wallMat);
    backWall.position.set(0, 2.5, -5.65);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const sideWallMat = wallMat.clone();
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(13, 5), sideWallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-7.6, 2.5, -1.2);
    scene.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(13, 5), sideWallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(7.6, 2.5, -1.2);
    scene.add(rightWall);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 14),
      new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.8, -1.2);
    scene.add(ceiling);

    // 护墙板
    const wainscotMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 4, 1),
      color: 0x9e7b5d,
      roughness: 0.5,
      metalness: 0.06,
      envMapIntensity: 0.5,
    });
    const wainscot = new THREE.Mesh(new THREE.BoxGeometry(16, 1.55, 0.14), wainscotMat);
    wainscot.position.set(0, 0.78, -5.55);
    wainscot.receiveShadow = true;
    scene.add(wainscot);

    const panelMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 1.4, 1),
      color: 0x76563f,
      roughness: 0.6,
    });
    const panelTrimMat = new THREE.MeshStandardMaterial({
      color: 0x8f6f45,
      roughness: 0.35,
      metalness: 0.55,
    });
    for (let i = 0; i < 9; i += 1) {
      const x = -7 + i * 1.75;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.08, 0.035), panelMat);
      panel.position.set(x, 0.75, -5.47);
      scene.add(panel);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 0.025, 0.02),
        panelTrimMat,
      );
      trim.position.set(x, 1.32, -5.44);
      scene.add(trim);
    }

    const railTrim = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.07, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x3e2b1d, roughness: 0.4, metalness: 0.25 }),
    );
    railTrim.position.set(0, 1.57, -5.5);
    scene.add(railTrim);

    const baseboard = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.16, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.5 }),
    );
    baseboard.position.set(0, 0.08, -5.48);
    scene.add(baseboard);

    // 霓虹招牌
    const signBacking = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 1.65, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x11100e, roughness: 0.4, metalness: 0.4 }),
    );
    signBacking.position.set(0, 2.55, -5.56);
    scene.add(signBacking);
    const goldFrameMat = new THREE.MeshStandardMaterial({
      color: 0x9a7a45,
      roughness: 0.35,
      metalness: 0.7,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.24, 1.79, 0.06), goldFrameMat);
    frame.position.set(0, 2.55, -5.6);
    scene.add(frame);
    this.neonMaterial = new THREE.MeshBasicMaterial({
      map: TEX.getNeonTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.86, 1.43), this.neonMaterial);
    neon.position.set(0, 2.55, -5.47);
    scene.add(neon);

    const neonLight = new THREE.PointLight(0xffb066, 9, 7, 2);
    neonLight.position.set(0, 2.4, -4.75);
    scene.add(neonLight);

    // 背景矮柜与酒瓶
    const credenzaMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 2, 1),
      color: 0x8c6b4e,
      roughness: 0.45,
      metalness: 0.1,
    });
    const credenza = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.74, 0.52), credenzaMat);
    credenza.position.set(0, 0.42, -5.3);
    credenza.castShadow = true;
    credenza.receiveShadow = true;
    scene.add(credenza);
    const topSlab = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.05, 0.58),
      new THREE.MeshStandardMaterial({ color: 0x221710, roughness: 0.35, metalness: 0.15 }),
    );
    topSlab.position.set(0, 0.81, -5.3);
    scene.add(topSlab);
    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 0.016, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.55 }),
    );
    ledStrip.position.set(0, 0.775, -5.02);
    scene.add(ledStrip);

    const bottleColors = [0x223c2b, 0x4a2415, 0x1c2d3b, 0x3d2f12, 0x2a1730, 0x1d3524, 0x4a3420];
    const bottleCapMat = new THREE.MeshStandardMaterial({
      color: 0x131313,
      roughness: 0.3,
      metalness: 0.6,
    });
    for (let i = 0; i < 7; i += 1) {
      const x = -1.35 + i * 0.45;
      const h = 0.28 + (i % 3) * 0.035;
      const bottleMat = new THREE.MeshStandardMaterial({
        color: bottleColors[i],
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.037, h, 16), bottleMat);
      body.position.set(x, 0.835 + h / 2, -5.32);
      body.castShadow = true;
      scene.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.021, 0.1, 12), bottleMat);
      neck.position.set(x, 0.835 + h + 0.05, -5.32);
      scene.add(neck);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10),
        bottleCapMat,
      );
      cap.position.set(x, 0.835 + h + 0.11, -5.32);
      scene.add(cap);
      if (i % 2 === 0) {
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(0.062, 0.085),
          new THREE.MeshBasicMaterial({ map: TEX.getBottleLabelTexture(i + 1), transparent: true }),
        );
        label.position.set(x, 0.835 + h * 0.52, -5.28);
        scene.add(label);
      }
    }

    // 装饰画
    this.addArtwork(-4.2, 2.2, 1.55, 1.1, 1);
    this.addArtwork(4.2, 2.2, 1.55, 1.1, 2);

    // 壁灯
    this.addSconce(-5.75, 2.0, -5.45);
    this.addSconce(5.75, 2.0, -5.45);

    // 角柱
    const pillarMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 0.3, 2),
      color: 0x6f5138,
      roughness: 0.5,
    });
    for (const x of [-7.3, 7.3]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.8, 0.35), pillarMat);
      pillar.position.set(x, 2.4, -5.45);
      scene.add(pillar);
    }

    // 合并静态房间装饰，降低移动端 draw call
    this.roomStatic = new THREE.Group();
    for (const child of scene.children.filter((item) => !before.has(item))) {
      this.roomStatic.add(child);
    }
    scene.add(this.roomStatic);
    mergeStaticGroup(this.roomStatic);
  }

  addArtwork(x, y, w, h, seed) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0x8e6c3c,
        roughness: 0.32,
        metalness: 0.55,
      }),
    );
    frame.position.set(x, y, -5.51);
    this.scene.add(frame);

    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: TEX.getWallArtTexture(seed),
        roughness: 0.7,
        metalness: 0.05,
        emissive: 0xffffff,
        emissiveMap: TEX.getWallArtTexture(seed),
        emissiveIntensity: 0.22,
      }),
    );
    art.position.set(x, y, -5.47);
    this.scene.add(art);
  }

  addSconce(x, y, z) {
    const brass = new THREE.MeshStandardMaterial({ color: 0x8d6c3d, roughness: 0.3, metalness: 0.75 });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.045), brass);
    bracket.position.set(x, y, z + 0.02);
    this.scene.add(bracket);

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.055, 0.16, 18, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffe6bd,
        emissive: 0xffb266,
        emissiveIntensity: 1.5,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    shade.position.set(x, y + 0.13, z + 0.04);
    this.scene.add(shade);

    const light = new THREE.PointLight(0xffb478, 5, 5, 2);
    light.position.set(x, y + 0.16, z + 0.16);
    if (QUALITY.tier === 'high') this.scene.add(light);
  }

  /* -------------------------------------------------------------------------- */
  /*                                  牌桌                                       */
  /* -------------------------------------------------------------------------- */

  buildTable() {
    const scene = this.scene;
    const before = new Set(scene.children);
    const woodBase = TEX.getWoodTexture();
    const leatherBase = TEX.getLeatherTexture();

    const woodMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 2.2, 1.1),
      color: 0x8a674b,
      roughness: 0.38,
      metalness: 0.1,
      envMapIntensity: 0.6,
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(woodBase, 1.3, 0.8),
      color: 0x4a3324,
      roughness: 0.5,
      metalness: 0.08,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xb08b4e,
      roughness: 0.26,
      metalness: 0.85,
      envMapIntensity: 1.2,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      map: cloneRepeatTexture(leatherBase, 7, 1.6),
      color: 0x8a5a41,
      roughness: 0.62,
      metalness: 0.04,
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: TEX.getFeltTexture(),
      roughness: 0.94,
      metalness: 0,
    });
    this.tableMats = { feltMat, woodMat, darkWoodMat, leatherMat };

    // 桌体
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 96), darkWoodMat);
    body.scale.set(1.225, 1, 0.655);
    body.position.y = 0.718;
    body.castShadow = true;
    body.receiveShadow = true;
    scene.add(body);

    const felt = new THREE.Mesh(new THREE.CircleGeometry(1, 128), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.scale.set(L.FELT.rx, L.FELT.rz, 1);
    felt.position.y = L.TABLE_Y + 0.002;
    felt.receiveShadow = true;
    scene.add(felt);

    // 环形皮边
    const railShape = ellipseShape(L.RAIL.rx, L.RAIL.rz);
    railShape.holes.push(ellipseHole(1.145, 0.585));
    const railGeo = new THREE.ExtrudeGeometry(railShape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.011,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 96,
    });
    railGeo.rotateX(-Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, leatherMat);
    rail.position.y = L.TABLE_Y + 0.008;
    rail.castShadow = true;
    rail.receiveShadow = true;
    scene.add(rail);

    for (const [rx, rz] of [[1.258, 0.685], [L.RAIL.rx - 0.006, L.RAIL.rz - 0.004]]) {
      const pipe = new THREE.Mesh(
        new THREE.TubeGeometry(ellipseCurve(rx, rz, 0), 180, 0.0038, 8, true),
        goldMat,
      );
      pipe.position.y = L.TABLE_Y + 0.054;
      scene.add(pipe);
    }

    // 桌沿金线
    const edgeLine = new THREE.Mesh(
      new THREE.TubeGeometry(ellipseCurve(1.247, 0.665, 0), 180, 0.0035, 8, true),
      goldMat,
    );
    edgeLine.position.y = L.TABLE_Y - 0.148;
    scene.add(edgeLine);

    // 底部灯带
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xdba65c,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const underGlow = new THREE.Mesh(
      new THREE.TubeGeometry(ellipseCurve(1.245, 0.67, 0), 180, 0.006, 8, true),
      glowMat,
    );
    underGlow.position.y = L.TABLE_Y - 0.195;
    scene.add(underGlow);

    // 桌裙
    const apron = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.2, 96, 1, true),
      woodMat,
    );
    apron.scale.set(1.235, 1, 0.665);
    apron.position.y = 0.605;
    apron.castShadow = true;
    apron.receiveShadow = true;
    scene.add(apron);

    // 桌腿
    for (const x of [-0.74, 0.74]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.06, 32), darkWoodMat);
      foot.position.set(x, 0.03, 0);
      foot.castShadow = true;
      foot.receiveShadow = true;
      scene.add(foot);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.46, 24), woodMat);
      column.position.set(x, 0.29, 0);
      column.castShadow = true;
      scene.add(column);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.06, 24), darkWoodMat);
      collar.position.set(x, 0.54, 0);
      collar.castShadow = true;
      scene.add(collar);
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.05, 32), darkWoodMat);
      mount.position.set(x, 0.575, 0);
      scene.add(mount);
    }

    // 中央金环
    for (const [rIn, rOut] of [[0.5, 0.512], [0.53, 0.538]]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 96),
        new THREE.MeshStandardMaterial({
          color: 0xae8a4e,
          roughness: 0.35,
          metalness: 0.6,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = L.TABLE_Y + 0.004;
      scene.add(ring);
    }

    // 杯托
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.5, metalness: 0.2 });
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const x = Math.cos(angle) * 1.245;
      const z = Math.sin(angle) * 0.665;
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.049, 0.049, 0.006, 28),
        cupMat,
      );
      cup.position.set(x, L.TABLE_Y + 0.057, z);
      scene.add(cup);
      const cupRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.049, 0.0026, 6, 28),
        goldMat,
      );
      cupRim.rotation.x = Math.PI / 2;
      cupRim.position.set(x, L.TABLE_Y + 0.061, z);
      scene.add(cupRim);
    }

    this.tableStatic = new THREE.Group();
    for (const child of scene.children.filter((item) => !before.has(item))) {
      this.tableStatic.add(child);
    }
    scene.add(this.tableStatic);
    mergeStaticGroup(this.tableStatic);
  }

  // 大厅背景：复用牌局同一套 PlayerRig、同一座位布局与机位，进入牌局只需镜头前推
  buildLobbyScene() {
    this.lobbyScene = new THREE.Group();
    this.lobbyRigs = [];

    const count = 8;
    const cardGeo = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
    const cardMat = new THREE.MeshBasicMaterial({
      map: TEX.getCardBackTexture(),
      toneMapped: false,
    });
    // 大厅只保留少量陪玩：中画质 4 人、低画质 2 人。
    // 牌背合并成一个 Mesh，避免 14 个装饰牌各占一个 draw call。
    const actorSeats = QUALITY.tier === 'high'
      ? [1, 2, 3, 4, 5, 6, 7]
      : (QUALITY.tier === 'mid' ? [1, 3, 5, 7] : [2, 5]);
    const cardGroup = new THREE.Group();

    for (const seat of actorSeats) {
      const profile = PROFILES[seat] || PROFILES[PROFILES.length - 1];
      const rig = new PlayerRig(
        this.lobbyScene,
        { name: profile.name, avatar: profile.avatar, stack: 100 },
        seat,
        count,
      );
      this.lobbyRigs.push(rig);

      for (const spot of L.holeCardSpots(seat, count, L.TABLE_Y)) {
        const card = new THREE.Mesh(cardGeo, cardMat);
        card.rotation.order = 'YXZ';
        card.rotation.set(-Math.PI / 2, L.cardYaw(seat, count), Math.PI);
        card.position.set(spot.x, L.TABLE_Y + 0.007, spot.z);
        cardGroup.add(card);
      }
    }
    mergeStaticGroup(cardGroup);
    this.lobbyScene.add(cardGroup);

    this.lobbyScene.visible = true;
    this.scene.add(this.lobbyScene);
  }

  setLobbyActorsVisible(visible) {
    if (this.lobbyScene) this.lobbyScene.visible = visible;
  }

  updateLobbyActors(now) {
    if (!this.lobbyScene || !this.lobbyScene.visible) return;
    for (const rig of this.lobbyRigs) rig.update(now);
  }

  buildHeroProps() {
    const scene = this.scene;
    const base = L.HERO_GLASS_SPOT;

    const coaster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.078, 0.007, 32),
      new THREE.MeshStandardMaterial({
        map: TEX.getLeatherTexture(),
        color: 0x6a4a34,
        roughness: 0.7,
      }),
    );
    coaster.position.set(base.x, L.TABLE_Y + 0.006, base.z);
    coaster.castShadow = true;
    coaster.receiveShadow = true;
    scene.add(coaster);

    const glassGroup = new THREE.Group();
    glassGroup.position.set(base.x, L.TABLE_Y + 0.01, base.z);
    scene.add(glassGroup);

    // transmission 会额外触发一次场景透射 Pass，网页/手机上非常贵。
    // 中低画质改用普通透明材质，视觉几乎一致，draw call 却少一整轮。
    const glassMat = QUALITY.tier === 'high'
      ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.06,
        metalness: 0,
        transmission: 0.9,
        thickness: 0.18,
        ior: 1.46,
        transparent: true,
        opacity: 0.96,
        envMapIntensity: 1.3,
        side: THREE.DoubleSide,
      })
      : new THREE.MeshStandardMaterial({
        color: 0xd9e2dc,
        roughness: 0.18,
        metalness: 0.05,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.046, 0.125, 40, 1, true),
      glassMat,
    );
    glass.position.y = 0.062;
    glass.castShadow = true;
    glassGroup.add(glass);

    const glassBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 0.008, 40),
      glassMat,
    );
    glassBottom.position.y = 0.004;
    glassGroup.add(glassBottom);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.054, 0.0022, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 0.25, metalness: 0.55 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1245;
    glassGroup.add(rim);

    const whiskey = new THREE.Mesh(
      new THREE.CylinderGeometry(0.043, 0.041, 0.045, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8f4312,
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: 0.92,
        emissive: 0x2a0e02,
        emissiveIntensity: 0.35,
      }),
    );
    whiskey.position.y = 0.033;
    glassGroup.add(whiskey);

    const iceMat = QUALITY.tier === 'high'
      ? new THREE.MeshPhysicalMaterial({
        color: 0xdfeef0,
        roughness: 0.05,
        transmission: 0.55,
        thickness: 0.08,
        transparent: true,
        opacity: 0.85,
      })
      : new THREE.MeshStandardMaterial({
        color: 0xe8f2f0,
        roughness: 0.3,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
    for (let i = 0; i < 3; i += 1) {
      const ice = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.018, 0.022),
        iceMat,
      );
      ice.position.set((i - 1) * 0.014, 0.055, (i % 2) * 0.012 - 0.006);
      ice.rotation.set(i * 0.7, i * 0.5, i * 0.3);
      glassGroup.add(ice);
    }

    mergeStaticGroup(glassGroup);
    this.glassGroup = glassGroup;
  }

  buildLights() {
    const scene = this.scene;
    const hemi = new THREE.HemisphereLight(0x62789a, 0x2a190e, QUALITY.tier === 'high' ? 0.82 : 1.36);
    scene.add(hemi);
    this.hemiLight = hemi;
    // 一个便宜的环境补光，替代中低画质关掉的壁灯/侧灯
    const ambient = new THREE.AmbientLight(0xffd9b6, QUALITY.tier === 'high' ? 0.06 : 0.44);
    scene.add(ambient);
    this.ambientLight = ambient;

    const key = new THREE.SpotLight(0xffd8aa, QUALITY.tier === 'high' ? 70 : 86, 9.8, 0.74, 0.72, 1.55);
    key.position.set(0, 3.4, 0.15);
    key.target.position.set(0, L.TABLE_Y, 0);
    key.castShadow = QUALITY.shadows;
    key.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
    key.shadow.camera.near = 0.6;
    key.shadow.camera.far = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    scene.add(key);
    scene.add(key.target);
    this.keyLight = key;

    const left = new THREE.SpotLight(0xffc892, 25, 8.5, 0.6, 0.85, 1.55);
    left.position.set(-1.35, 3.1, 0.45);
    left.target.position.set(-0.6, L.TABLE_Y, -0.05);
    if (QUALITY.tier === 'high') {
      scene.add(left);
      scene.add(left.target);
    }

    const right = new THREE.SpotLight(0xffc892, 25, 8.5, 0.6, 0.85, 1.55);
    right.position.set(1.35, 3.1, 0.45);
    right.target.position.set(0.6, L.TABLE_Y, -0.05);
    if (QUALITY.tier === 'high') {
      scene.add(right);
      scene.add(right.target);
    }

    const rim = new THREE.SpotLight(0x93accd, 34, 14, 0.86, 0.75, 1.5);
    rim.position.set(0, 2.8, -4.0);
    rim.target.position.set(0, 0.9, 0);
    if (QUALITY.tier === 'high') {
      scene.add(rim);
      scene.add(rim.target);
    }

    if (QUALITY.tier === 'high') {
      const fill = new THREE.DirectionalLight(0xd0ddec, 0.64);
      fill.position.set(-2.5, 2.6, 4);
      fill.target.position.set(0, 0.8, 0);
      scene.add(fill);
      scene.add(fill.target);

      const warmBounce = new THREE.PointLight(0xffa25c, 1.6, 3.5, 2);
      warmBounce.position.set(0, 1.9, 1.1);
      scene.add(warmBounce);
    }
  }

  buildAtmosphere() {
    const dustTex = TEX.getDustTexture();
    const count = QUALITY.dustCount;
    if (count > 0) {
      const positions = new Float32Array(count * 3);
      this.dustSpeed = new Float32Array(count);
      this.dustPhase = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        positions[i * 3] = (Math.random() - 0.5) * 5.4;
        positions[i * 3 + 1] = 0.8 + Math.random() * 2.5;
        positions[i * 3 + 2] = -2.5 + Math.random() * 4.2;
        this.dustSpeed[i] = 0.012 + Math.random() * 0.035;
        this.dustPhase[i] = Math.random() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.014,
        map: dustTex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffdfb2,
        sizeAttenuation: true,
      });
      this.dust = new THREE.Points(geo, mat);
      this.scene.add(this.dust);
    }

    // 背景暖色光斑
    for (let i = 0; i < QUALITY.bokehCount; i += 1) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dustTex,
          color: i % 3 === 0 ? 0xffc078 : 0xd8b078,
          transparent: true,
          opacity: 0.22 + Math.random() * 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.position.set(-5 + Math.random() * 10, 0.9 + Math.random() * 2.4, -4.6 - Math.random() * 0.8);
      const s = 0.2 + Math.random() * 0.45;
      sprite.scale.set(s, s, 1);
      this.scene.add(sprite);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                  牌局对象                                   */
  /* -------------------------------------------------------------------------- */

  setHeroSeat(seat, count) {
    const n = Math.max(2, Number(count) || this.playerCount || 8);
    const raw = Number(seat);
    const index = raw < 0 ? -1 : Math.max(0, Math.min(n - 1, raw));
    this.heroSeatIndex = index;
    this.heroViewCount = n;
    // 3/4人桌的座位在对侧，默认近景会把另一名对手放到镜头背后；
    // 开局先拉远到能同时看到两侧对手的距离。用户仍可双指缩放。
    if (index >= 0) {
      const active = this.activePlayerCount || n;
      if (this.viewMode === 'third') {
        // 第三人称：自己的模型也坐在桌边，镜头后退到能看到自己。
        const minZoom = active <= 3 ? 2.2 : (active === 4 ? 2.0 : 1.8);
        this.userZoom = Math.max(this.userZoom || 1, minZoom);
      } else {
        this.userZoom = 1;
      }
    }
    const axis = new THREE.Vector3(0, 1, 0);
    if (index < 0) {
      // 观战：不隐藏任何座位，机位保持默认桌边视角
      this.heroCamBase = L.HERO_CAM.clone();
      this.heroLookBase = L.HERO_TARGET.clone();
      return;
    }
    // 机位跟着自己的固定座位旋转；注意旋转方向必须与 seatPosition 一致，
    // 否则第三人视角会跑到对面座位（例如3号位看到8号位上方）。
    const delta = Math.PI / 2 - L.seatAngle(index, n);
    this.heroCamBase = L.HERO_CAM.clone().applyAxisAngle(axis, delta);
    if (this.viewMode === 'third') this.heroCamBase.y += 1.2;
    this.heroLookBase = L.HERO_TARGET.clone().applyAxisAngle(axis, delta);
  }

  applyViewVisibility() {
    const heroRig = this.rigs?.[this.heroSeatIndex];
    if (heroRig) heroRig.root.visible = this.viewMode === 'third';
  }

  setViewMode(mode) {
    this.viewMode = mode === 'third' ? 'third' : 'first';
    try { localStorage.setItem('poker_view_mode', this.viewMode); } catch { /* ignore */ }
    this.applyViewVisibility();
    this.setHeroSeat(this.heroSeatIndex, this.playerCount || 8);
  }

  setupPlayers(defs, seatCount = defs.length) {
    this.clearPlayers();
    this.setLobbyActorsVisible(false);
    const total = Math.max(Number(seatCount) || 0, defs.length);
    this.players = defs;
    this.playerCount = total;
    this.activePlayerCount = defs.filter(Boolean).length;
    this.heroSeatIndex = Math.max(-1, Math.min(total - 1, this.heroSeatIndex));
    this.setHeroSeat(this.heroSeatIndex, total);
    this.rigs = Array.from({ length: total }, (_, index) => {
      const player = defs[index];
      if (!player) return null;
      return new PlayerRig(this.scene, player, index, total);
    });

    this.chipStacks = Array.from({ length: total }, (_, index) => {
      const player = defs[index];
      if (!player) return null;
      const stack = new ChipStack(this.scene, { maxChips: QUALITY.maxStackChips });
      const pos = L.stackSpot(index, total, L.TABLE_Y, this.heroSeatIndex);
      stack.setPosition(pos);
      stack.setAmount(player.stack, { label: index !== this.heroSeatIndex });
      return stack;
    });

    this.betStacks = Array.from({ length: total }, (_, index) => {
      const player = defs[index];
      if (!player) return null;
      const stack = new ChipStack(this.scene, { maxChips: QUALITY.maxStackChips });
      stack.setPosition(L.betSpot(index, total, L.TABLE_Y, this.heroSeatIndex));
      stack.hide();
      return stack;
    });

    this.holeCards = new Map();
    this.boardCards = [];
    this.potAmount = 0;
    this.potStack.hide();
    this.potStack.setAmount(0);
    this.applyViewVisibility();
  }

  clearPlayers() {
    if (this.rigs) {
      for (const rig of this.rigs) if (rig) rig.destroy();
    }
    if (this.chipStacks) {
      for (const stack of this.chipStacks) stack?.dispose?.();
    }
    if (this.betStacks) {
      for (const stack of this.betStacks) stack?.dispose?.();
    }
    this.rigs = [];
    this.chipStacks = [];
    this.betStacks = [];
  }

  clearCards() {
    this.cardEpoch += 1;
    // 只靠 holeCards/boardCards 追踪会漏掉动画中尚未入表的牌；
    // 直接清掉场景中所有 CardManager 创建的牌，彻底避免上一手残留。
    this.cards.clearAll();
    this.holeCards.clear();
    this.boardCards = [];
  }

  clearBoardCards() {
    const old = this.boardCards.filter(Boolean);
    if (old.length) this.cards.remove(old);
    this.boardCards = [];
  }

  updateStack(seat, stack) {
    const chips = this.chipStacks[seat];
    if (chips) chips.setAmount(stack, { label: seat !== 0 });
    const rig = this.rigs[seat];
    if (rig) rig.setStack(stack);
  }

  setPot(amount, pulse = true) {
    const changed = amount !== this.potAmount;
    this.potAmount = amount;
    // 底池数字只放在 HUD 里，3D 筹码堆不生成大号数字，避免和公共牌抢位置。
    this.potStack.setAmount(amount, { label: false, pulse: pulse && changed });
    if (amount <= 0) this.potStack.hide();
    else this.potStack.show();
  }

  setDealer(seat, animateMove = true) {
    const target = L.dealerButtonSpot(seat, this.playerCount, L.TABLE_Y);
    if (!animateMove) {
      this.dealerButton.mesh.position.set(target.x, L.TABLE_Y + 0.0045, target.z);
      return Promise.resolve();
    }
    audio.buttonSlide();
    return this.dealerButton.moveTo(target, { duration: 520 });
  }

  clearSceneBackdrop() {
    if (this.sceneBackdrop) {
      this.scene.remove(this.sceneBackdrop);
      this.sceneBackdrop.traverse((obj) => {
        if (obj.isMesh) obj.geometry?.dispose?.();
      });
      this.sceneBackdrop = null;
    }
    if (this.sceneBackdropTexture) {
      this.sceneBackdropTexture.dispose?.();
      this.sceneBackdropTexture = null;
    }
  }

  makeSceneBackdropTexture(preset) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, `#${Number(preset.background).toString(16).padStart(6, '0')}`);
    grad.addColorStop(1, `#${Number(preset.fog).toString(16).padStart(6, '0')}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);
    const id = preset === SCENES.yacht ? 'yacht' : preset === SCENES.bus ? 'bus'
      : preset === SCENES.grassland ? 'grassland' : preset === SCENES.airplane ? 'airplane' : 'night_market';
    ctx.save();
    if (id === 'yacht') {
      const sea = ctx.createLinearGradient(0, 280, 0, 512);
      sea.addColorStop(0, '#2f8ea2'); sea.addColorStop(1, '#0a3f59');
      ctx.fillStyle = sea; ctx.fillRect(0, 280, 1024, 232);
      ctx.fillStyle = 'rgba(255,224,160,0.9)'; ctx.beginPath(); ctx.arc(790, 170, 62, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 3;
      for (let i = 0; i < 7; i += 1) { ctx.beginPath(); ctx.moveTo(60 + i * 120, 330 + i * 12); ctx.quadraticCurveTo(150 + i * 120, 315 + i * 12, 250 + i * 120, 330 + i * 12); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(200, 120); ctx.quadraticCurveTo(230, 95, 260, 120); ctx.stroke();
    } else if (id === 'bus') {
      ctx.fillStyle = '#101726'; ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 7; i += 1) {
        const x = 30 + i * 145;
        ctx.fillStyle = i % 2 ? 'rgba(255,180,80,0.35)' : 'rgba(100,190,255,0.22)';
        ctx.fillRect(x, 95, 105, 190);
        ctx.fillStyle = 'rgba(6,10,15,0.8)'; ctx.fillRect(x + 7, 110, 91, 160);
      }
      ctx.fillStyle = 'rgba(255,200,90,0.85)'; ctx.fillRect(0, 355, 1024, 8);
      ctx.fillStyle = 'rgba(30,40,52,0.95)'; ctx.fillRect(0, 390, 1024, 122);
    } else if (id === 'grassland') {
      const sky = ctx.createLinearGradient(0, 0, 0, 300);
      sky.addColorStop(0, '#77b8dc'); sky.addColorStop(1, '#cfe4d9');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, 1024, 300);
      ctx.fillStyle = '#6e9d61'; ctx.beginPath(); ctx.moveTo(0, 300); ctx.quadraticCurveTo(300, 220, 620, 300); ctx.quadraticCurveTo(830, 240, 1024, 300); ctx.lineTo(1024, 512); ctx.lineTo(0, 512); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [x, y, r] of [[180,90,44],[260,80,32],[760,120,56],[850,105,38]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(40,85,50,0.35)'; for (let i = 0; i < 60; i += 1) { const x = (i * 97) % 1024; const y = 320 + (i * 53) % 170; ctx.fillRect(x, y, 3, 10); }
    } else if (id === 'airplane') {
      ctx.fillStyle = '#b9d7e7'; ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [x, y, r] of [[220,150,78],[620,110,105],[850,220,60]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e9e2d3'; ctx.fillRect(0, 0, 1024, 72); ctx.fillRect(0, 430, 1024, 82);
      for (let i = 0; i < 6; i += 1) { ctx.fillStyle = i % 2 ? '#283540' : '#202c36'; ctx.fillRect(70 + i * 155, 110, 105, 210); ctx.fillStyle = 'rgba(190,225,245,0.5)'; ctx.fillRect(82 + i * 155, 130, 81, 150); }
    } else {
      ctx.fillStyle = '#1a1018'; ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 10; i += 1) { ctx.fillStyle = i % 2 ? '#31162a' : '#25132a'; ctx.fillRect(i * 110, 80, 95, 280); }
      for (let i = 0; i < 8; i += 1) {
        const x = 60 + i * 130; const y = 80 + (i % 3) * 28;
        ctx.fillStyle = '#d83b3b'; ctx.beginPath(); ctx.arc(x, y, 19, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd36b'; ctx.fillRect(x - 2, y - 28, 4, 8);
      }
      ctx.fillStyle = 'rgba(255,175,60,0.28)'; ctx.fillRect(0, 340, 1024, 7);
      ctx.fillStyle = 'rgba(30,10,18,0.8)'; ctx.fillRect(0, 390, 1024, 122);
    }
    ctx.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  applyScene(sceneId = 'private') {
    const preset = getScene(sceneId);
    const id = SCENES[sceneId] ? sceneId : 'private';
    this.currentScene = id;
    this.scene.background = new THREE.Color(preset.background);
    this.scene.fog = new THREE.FogExp2(preset.fog, preset.fogDensity);
    if (this.roomStatic) this.roomStatic.visible = id === 'private';
    if (this.tableMats) {
      this.tableMats.feltMat.color.set(preset.felt);
      this.tableMats.woodMat.color.set(preset.wood);
      this.tableMats.darkWoodMat.color.set(preset.wood).multiplyScalar(0.58);
      this.tableMats.leatherMat.color.set(preset.leather);
    }
    if (this.hemiLight) this.hemiLight.color.set(preset.hemi);
    if (this.ambientLight) this.ambientLight.color.set(preset.light);
    if (this.keyLight) this.keyLight.color.set(preset.light);
    this.clearSceneBackdrop();
    if (id !== 'private') {
      const group = new THREE.Group();
      const texture = this.makeSceneBackdropTexture(preset);
      this.sceneBackdropTexture = texture;
      const backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(17, 8),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
      );
      backdrop.position.set(0, 3.0, -5.5);
      group.add(backdrop);
      const sideMat = new THREE.MeshBasicMaterial({ color: preset.background, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const sidePlane = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), sideMat);
        sidePlane.rotation.y = side * Math.PI / 2;
        sidePlane.position.set(side * 7.45, 2.8, -0.5);
        group.add(sidePlane);
      }
      const addBox = (w, h, d, x, y, z, color, rotY = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
        mesh.position.set(x, y, z); mesh.rotation.y = rotY; group.add(mesh); return mesh;
      };
      const addSphere = (r, x, y, z, color) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
        mesh.position.set(x, y, z); group.add(mesh); return mesh;
      };
      if (id === 'yacht') {
        for (const side of [-1, 1]) {
          addBox(0.08, 0.08, 1.5, side * 1.75, 1.25, 0.2, 0xd7dfe2);
          addBox(0.08, 1.2, 0.08, side * 1.75, 0.65, 0.92, 0xcfd8dc);
        }
        addBox(2.2, 0.03, 0.7, 0, 0.05, -2.0, 0x8f6d4e);
        for (let i = 0; i < 5; i += 1) addSphere(0.09, -2.8 + i * 1.3, 1.4, -1.8, 0xffd9a0);
      } else if (id === 'bus') {
        for (const side of [-1, 1]) {
          addBox(0.08, 2.2, 0.08, side * 1.8, 1.1, 0.4, 0xb8c5cd);
          addBox(0.8, 0.4, 0.5, side * 1.4, 0.25, -1.2, 0x294654);
        }
        addBox(3.2, 0.05, 0.22, 0, 2.35, -1.2, 0x91a5b2);
      } else if (id === 'grassland') {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x4d8753, roughness: 1 }));
        grass.rotation.x = -Math.PI / 2; grass.position.y = 0.01; group.add(grass);
        for (let i = 0; i < 8; i += 1) addBox(0.07, 0.7, 0.07, -3.5 + i * 1, 0.35, -2.2, 0x8b6847);
        for (let i = 0; i < 3; i += 1) {
          const x = -2.2 + i * 2.2;
          addSphere(0.22, x, 0.35, -2.8, 0xf2efe3);
          addSphere(0.13, x + 0.2, 0.52, -2.8, 0xe9e3d4);
          addSphere(0.1, x + 0.3, 0.6, -2.8, 0x45423c);
        }
      } else if (id === 'airplane') {
        addBox(5.2, 0.16, 0.8, 0, 2.5, -1.3, 0xbfc7c2);
        addBox(5.2, 0.16, 0.8, 0, 2.5, 1.0, 0xbfc7c2);
        for (const side of [-1, 1]) {
          addBox(0.12, 2.4, 2.4, side * 1.9, 1.2, -0.5, 0xd8d4c9);
          for (let i = 0; i < 2; i += 1) addBox(0.03, 0.55, 0.32, side * 1.84, 1.45, -1.0 + i * 0.8, 0x8fb6cd);
        }
      } else if (id === 'night_market') {
        for (const [x, z, color] of [[-2.8,-1.6,0xff5a47],[2.8,-1.6,0xff5a47],[-2.4,-2.3,0xffc95a],[2.4,-2.3,0xffc95a]]) {
          addSphere(0.18, x, 2.25, z, color);
          addBox(0.03, 0.4, 0.03, x, 2.6, z, 0x6d3d2c);
        }
        addBox(4.8, 0.12, 1.0, 0, 2.15, -1.7, 0x6f2c38);
      }
      this.scene.add(group);
      this.sceneBackdrop = group;
    }
    this.onSceneChange?.(id, preset);
  }

  setLowMotion(enabled) {
    this.lowMotion = Boolean(enabled);
    if (this.lowMotion) this.actorLookOffset.set(0, 0, 0);
  }

  setSpectatorMode(enabled) {
    if (enabled) {
      this.spectatorMode = true;
      this.mode = 'spectator';
      this.spectatorPitch = 0.38;
      this.spectatorRadius = 2.35;
    } else {
      this.spectatorMode = false;
      if (this.mode === 'spectator') this.mode = 'hero';
    }
  }

  resetSpectatorView() {
    this.spectatorYaw = 0;
    this.spectatorPitch = 0.38;
    this.spectatorRadius = 2.35;
  }

  setTurn(seat) {
    this.actorFocusSeat = seat;
    for (let i = 0; i < this.rigs.length; i += 1) {
      const rig = this.rigs[i];
      if (rig) rig.setTurn(i === seat);
    }
    const focus = new THREE.Vector3(0, 0, 0);
    if (!this.lowMotion && seat >= 0 && this.playerCount > 1) {
      const actor = L.seatPosition(seat, this.playerCount);
      const hero = L.seatPosition(this.heroSeatIndex, this.playerCount);
      // 只做轻微的视线偏移，绝不绕到玩家身后，避免晕动。
      focus.set(
        Math.max(-0.34, Math.min(0.34, (actor.x - hero.x) * 0.22)),
        0.02,
        Math.max(-0.3, Math.min(0.3, (actor.z - hero.z) * 0.22)),
      );
    }
    this.actorLookOffset.copy(focus);
  }

  setActorFocus(seat) {
    this.setTurn(seat);
  }

  panFor(x) {
    return clamp(x / 1.7, -1, 1) * 0.85;
  }

  async dealHoleCards(sequence) {
    const epoch = this.cardEpoch;
    const previous = [];
    for (const list of this.holeCards.values()) previous.push(...list.filter(Boolean));
    if (previous.length) this.cards.remove(previous);
    this.holeCards.clear();
    for (const entry of sequence) {
      if (!this.holeCards.has(entry.seat)) this.holeCards.set(entry.seat, []);
    }

    const landed = new Array(sequence.length);
    const jobs = sequence.map((entry, index) => delay(index * 55).then(async () => {
      if (epoch !== this.cardEpoch) return;
      const spots = L.holeCardSpots(entry.seat, this.playerCount, L.TABLE_Y, this.heroSeatIndex);
      const spot = spots[entry.cardIndex];
      const yaw = L.cardYaw(entry.seat, this.playerCount);
      const mesh = await this.cards.deal({
        card: entry.card,
        from: L.DEAL_SPOT,
        to: spot,
        yaw,
        faceUp: Boolean(entry.faceUp),
        duration: 420,
        arc: 0.24,
        pan: this.panFor(spot.x),
        onLand: () => audio.deal(this.panFor(spot.x), 0.55),
      });
      if (epoch !== this.cardEpoch) {
        this.cards.remove([mesh]);
        return;
      }
      landed[index] = mesh;
    }));

    let timedOut = false;
    await Promise.race([
      Promise.all(jobs),
      delay(1900).then(() => { timedOut = true; }),
    ]);
    if (timedOut && epoch === this.cardEpoch) {
      // 极慢设备兜底：取消旧协程，直接把缺少的牌补到桌面。
      this.cardEpoch += 1;
    }
    for (let index = 0; index < sequence.length; index += 1) {
      const entry = sequence[index];
      const mesh = landed[index];
      if (!mesh) continue;
      const list = this.holeCards.get(entry.seat) || [];
      list[entry.cardIndex] = mesh;
      this.holeCards.set(entry.seat, list);
    }
    if (timedOut) {
      for (const entry of sequence) {
        const list = this.holeCards.get(entry.seat) || [];
        if (list[entry.cardIndex]) continue;
        const spots = L.holeCardSpots(entry.seat, this.playerCount, L.TABLE_Y, this.heroSeatIndex);
        const mesh = this.cards.createCard(entry.card, Boolean(entry.faceUp));
        this.cards.place(mesh, spots[entry.cardIndex], L.cardYaw(entry.seat, this.playerCount));
        this.scene.add(mesh);
        list[entry.cardIndex] = mesh;
        this.holeCards.set(entry.seat, list);
      }
    }
    return this.holeCards;
  }

  hideHeroHoleCards() {
    const cards = (this.holeCards.get(this.heroSeatIndex) || []).filter(Boolean);
    if (cards.length) this.cards.remove(cards);
    this.holeCards.set(this.heroSeatIndex, []);
  }

  async revealHero() {
    const cards = (this.holeCards.get(this.heroSeatIndex) || []).filter(Boolean);
    for (let i = 0; i < cards.length; i += 1) {
      if (i > 0) await delay(110);
      audio.flip(this.panFor(cards[i].position.x));
      await this.cards.flip(cards[i], true, 300);
    }
  }

  async dealBoard(cards, startIndex) {
    const epoch = this.cardEpoch;
    const spots = L.communitySpots(L.TABLE_Y);
    const dealt = [];
    const jobs = cards.map((card, i) => delay(i * 75).then(async () => {
      if (epoch !== this.cardEpoch) return;
      const spot = spots[startIndex + i];
      const mesh = await this.cards.deal({
        card,
        from: L.DEAL_SPOT,
        to: spot,
        yaw: 0,
        faceUp: false,
        duration: 360,
        arc: 0.13,
        pan: this.panFor(spot.x),
        onLand: () => audio.deal(this.panFor(spot.x), 0.45),
      });
      if (epoch !== this.cardEpoch) {
        this.cards.remove([mesh]);
        return;
      }
      dealt[i] = mesh;
    }));
    await Promise.all(jobs);
    if (epoch !== this.cardEpoch) {
      this.cards.remove(dealt.filter(Boolean));
      return [];
    }
    for (let i = 0; i < dealt.length; i += 1) {
      if (!dealt[i]) continue;
      if (i > 0) await delay(90);
      audio.flip(this.panFor(dealt[i].position.x));
      await this.cards.flip(dealt[i], true, 280);
    }
    if (epoch !== this.cardEpoch) {
      this.cards.remove(dealt.filter(Boolean));
      return [];
    }
    for (let i = 0; i < dealt.length; i += 1) {
      if (dealt[i]) this.boardCards[startIndex + i] = dealt[i];
    }
    return dealt.filter(Boolean);
  }

  async revealSeat(seat) {
    const cards = (this.holeCards.get(seat) || []).filter(Boolean);
    for (let i = 0; i < cards.length; i += 1) {
      if (i > 0) await delay(110);
      audio.flip(this.panFor(cards[i].position.x));
      await this.cards.flip(cards[i], true, 320);
    }
    const rig = this.rigs[seat];
    if (rig) rig.setAction('摊牌', 'neutral');
  }

  async highlightSeat(seat, on) {
    const cards = (this.holeCards.get(seat) || []).filter(Boolean);
    await Promise.all(cards.map((card) => this.cards.highlight(card, on)));
  }

  discardHoleCards(seat) {
    const cards = (this.holeCards.get(seat) || []).filter(Boolean);
    if (cards.length) this.cards.remove(cards);
    this.holeCards.set(seat, []);
  }

  async foldSeat(seat) {
    const cards = (this.holeCards.get(seat) || []).filter(Boolean);
    const rig = this.rigs[seat];
    if (rig) {
      rig.setFolded(true, this.playerCount > 2);
      rig.shrug();
    }
    audio.fold();
    // 弃牌立即从桌面移除，不再等待 muck 动画；否则状态更新后还会残留。
    if (cards.length) this.cards.remove(cards);
    this.holeCards.set(seat, []);
  }

  async muckAll() {
    this.cardEpoch += 1;
    const all = [];
    for (const list of this.holeCards.values()) all.push(...list.filter(Boolean));
    all.push(...this.boardCards.filter(Boolean));
    this.holeCards.clear();
    this.boardCards = [];
    if (all.length) {
      await this.cards.muck(all, new THREE.Vector3(0.42, L.TABLE_Y, -0.12), 460);
    }
  }

  async bet(seat, amount, totalBet) {
    const stack = this.betStacks[seat];
    if (!stack) return;
    const pos = L.betSpot(seat, this.playerCount, L.TABLE_Y, this.heroSeatIndex);
    stack.setPosition(pos);
    stack.show();
    stack.setAmount(totalBet, { label: true, pulse: true });

    const from = this.chipStacks[seat]
      ? this.chipStacks[seat].group.position.clone()
      : new THREE.Vector3(pos.x, L.TABLE_Y, pos.z);
    from.y = L.TABLE_Y + 0.08;
    const count = Math.min(5, 2 + Math.floor(amount / 250));
    for (let i = 0; i < count; i += 1) {
      const chip = createFlyingChip([25, 100, 100, 500, 1000][i % 5]);
      chip.position.set(
        from.x + (Math.random() - 0.5) * 0.06,
        from.y + Math.random() * 0.03,
        from.z + (Math.random() - 0.5) * 0.06,
      );
      this.scene.add(chip);
      const end = pos.clone();
      const start = chip.position.clone();
      delay(i * 45).then(() => animate(360, (t) => {
        chip.position.x = start.x + (end.x - start.x) * t;
        chip.position.z = start.z + (end.z - start.z) * t;
        chip.position.y = start.y + (end.y - start.y) * t + Math.sin(t * Math.PI) * 0.09;
        chip.rotation.x += 0.06;
        chip.rotation.z += 0.04;
      }, easeOutCubic)).then(() => this.scene.remove(chip));
    }
    audio.bet(this.panFor(pos.x), amount);
  }

  async collectBets(seats, potTotal) {
    const tasks = [];
    for (const seat of seats) {
      const stack = this.betStacks[seat];
      if (!stack || stack.amount <= 0) continue;
      stack.labelSprite.visible = false;
      const start = stack.group.position.clone();
      const end = L.POT_SPOT.clone();
      end.x += (Math.random() - 0.5) * 0.04;
      end.z += (Math.random() - 0.5) * 0.04;
      tasks.push(animate(540, (t) => {
        stack.group.position.set(
          lerp(start.x, end.x, t),
          L.TABLE_Y + Math.sin(t * Math.PI) * 0.08,
          lerp(start.z, end.z, t),
        );
      }, easeInOutCubic).then(() => {
        stack.hide();
        stack.setAmount(0);
      }));
    }
    if (tasks.length) {
      audio.chip(0, 6, 0.9);
      await Promise.all(tasks);
    }
    this.setPot(potTotal, true);
  }

  clearBets() {
    for (const stack of this.betStacks) {
      if (!stack) continue;
      stack.hide();
      stack.setAmount(0);
    }
  }

  reactSettlement(winnerDisplays) {
    const winners = winnerDisplays instanceof Set ? winnerDisplays : new Set(winnerDisplays);
    for (let i = 0; i < (this.rigs?.length || 0); i += 1) {
      const rig = this.rigs[i];
      if (!rig) continue;
      rig.settleReaction?.(winners.has(i), 120 + i * 90);
    }
  }

  setPlayerAction(seat, text, tone = 'neutral') {
    const rig = this.rigs[seat];
    if (rig) rig.setAction(text, tone);
  }

  resetHandVisuals(stacks) {
    this.clearBets();
    this.setPot(0, false);
    this.setTurn(-1);
    for (let i = 0; i < this.rigs.length; i += 1) {
      const rig = this.rigs[i];
      if (!rig) continue;
      rig.setStatus({
        stack: stacks ? stacks[i] : rig.stack,
        action: '',
        tone: 'neutral',
        folded: false,
      });
      rig.setTurn(false);
      rig.setDimmed(false);
    }
  }

  clearFoldsDim() {
    for (const rig of this.rigs) if (rig) rig.setDimmed(false);
  }

  async celebrate(seat, amount) {
    const rig = this.rigs[seat];
    if (rig) await rig.celebrate(amount);
  }

  async scoopPot(winnerSeats) {
    this.potStack.labelSprite.visible = false;
    if (this.potStack.amount > 0 && winnerSeats.length === 1) {
      const from = this.potStack.group.position.clone();
      const to = L.stackSpot(winnerSeats[0], this.playerCount, L.TABLE_Y, this.heroSeatIndex);
      await animate(680, (t) => {
        this.potStack.group.position.set(
          lerp(from.x, to.x, t),
          L.TABLE_Y + Math.sin(t * Math.PI) * 0.1,
          lerp(from.z, to.z, t),
        );
        const s = 1 - t * 0.35;
        this.potStack.group.scale.set(s, s, s);
      }, easeInOutCubic);
    } else if (this.potStack.amount > 0) {
      await animate(420, (t) => {
        const s = 1 - t * 0.55;
        this.potStack.group.scale.set(s, s, s);
        this.potStack.group.position.y = L.TABLE_Y + t * 0.05;
      }, easeOutCubic);
    }
    this.potStack.group.scale.set(1, 1, 1);
    this.potStack.setPosition(L.POT_SPOT);
    this.potStack.setAmount(0);
    this.potStack.hide();
    this.potAmount = 0;
  }


  async bust(seat) {
    const rig = this.rigs[seat];
    if (rig) rig.setStatus({ action: '补充买入', tone: 'neutral' });
  }

  /* -------------------------------------------------------------------------- */
  /*                                  相机                                       */
  /* -------------------------------------------------------------------------- */

  toLobby(duration = 1900) {
    this.mode = 'intro';
    this.clearCards();
    // 收起上一局的人偶与筹码，避免与大厅陪玩重叠
    this.clearPlayers();
    this.setLobbyActorsVisible(true);
    const fromPos = this.camera.position.clone();
    const fromLook = this.camLook.clone();
    const fromFov = this.camera.fov;
    // 新的相机转场必须取消旧转场，否则“退出单机后立刻再进单机”
    // 的新 enterTable 会被上一段 toLobby 的 transitionPromise 拦截。
    const token = ++this.cameraTransitionToken;
    this.transitionPromise = animate(duration, (t) => {
      if (token !== this.cameraTransitionToken) return;
      this.camera.position.lerpVectors(fromPos, L.LOBBY_CAM, t);
      this.camLook.lerpVectors(fromLook, L.LOBBY_TARGET, t);
      this.camera.fov = lerp(fromFov, L.LOBBY_FOV, t);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
    }, easeInOutCubic).then(() => {
      if (token !== this.cameraTransitionToken) return;
      this.camera.position.copy(L.LOBBY_CAM);
      this.camLook.copy(L.LOBBY_TARGET);
      this.camera.fov = L.LOBBY_FOV;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
      this.mode = 'lobby';
      this.transitionPromise = null;
    });
    return this.transitionPromise;
  }

  enterTable(duration = 2600) {
    this.mode = 'intro';
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
    this.pointerSmooth.x = 0;
    this.pointerSmooth.y = 0;
    this.lookIdleAt = 0;
    this.lookReturnStart = 0;
    const fromPos = this.camera.position.clone();
    const fromLook = this.camLook.clone();
    const fromFov = this.camera.fov;
    // 重新进桌时取消尚未结束的 toLobby，避免相机停在远景。
    const token = ++this.cameraTransitionToken;
    this.transitionPromise = animate(duration, (t) => {
      if (token !== this.cameraTransitionToken) return;
      this.camera.position.lerpVectors(fromPos, this.heroCamBase, t);
      this.camLook.lerpVectors(fromLook, this.heroLookBase, t);
      this.camera.fov = lerp(fromFov, L.HERO_FOV, t);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
    }, easeInOutCubic).then(() => {
      if (token !== this.cameraTransitionToken) return;
      this.camera.position.copy(this.heroCamBase);
      this.camLook.copy(this.heroLookBase);
      this.camera.fov = L.HERO_FOV;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
      this.mode = 'hero';
      this.transitionPromise = null;
    });
    return this.transitionPromise;
  }

  shake(amount = 0.008, duration = 380) {
    this.shakeAmount = amount;
    this.shakeUntil = performance.now() + duration;
  }

  updateCamera(now) {
    // 松手 2 秒后自动回正；用 650ms 的缓入缓出模拟人扭头，
    // 既不会闪回，也不会慢悠悠地拖很久。
    if (!this.dragging && this.lookIdleAt && !this.lookReturnStart && now - this.lookIdleAt >= 2000) {
      this.lookReturnStart = now;
      this.lookReturnFrom.x = this.pointerTarget.x;
      this.lookReturnFrom.y = this.pointerTarget.y;
    }
    if (this.lookReturnStart) {
      const t = clamp((now - this.lookReturnStart) / 650, 0, 1);
      const e = easeInOutCubic(t);
      this.pointerTarget.x = lerp(this.lookReturnFrom.x, 0, e);
      this.pointerTarget.y = lerp(this.lookReturnFrom.y, 0, e);
      if (t >= 1) {
        this.pointerTarget.x = 0;
        this.pointerTarget.y = 0;
        this.lookReturnStart = 0;
        this.lookIdleAt = 0;
      }
    }

    this.pointerSmooth.x += (this.pointerTarget.x - this.pointerSmooth.x) * 0.12;
    this.pointerSmooth.y += (this.pointerTarget.y - this.pointerSmooth.y) * 0.12;

    if (this.mode === 'lobby' && this.lowMotion) {
      this.camera.position.lerp(L.LOBBY_CAM, 0.08);
      this.camLook.lerp(L.LOBBY_TARGET, 0.08);
      this.camera.lookAt(this.camLook);
    } else if (this.mode === 'lobby') {
      const driftX = Math.sin(now * 0.00009) * 0.055;
      const driftY = Math.sin(now * 0.00013 + 1) * 0.025;
      const desired = L.LOBBY_CAM.clone();
      desired.x += driftX + this.pointerSmooth.x * 0.06;
      desired.y += driftY - this.pointerSmooth.y * 0.03;
      this.camera.position.lerp(desired, 0.04);
      const look = L.LOBBY_TARGET.clone();
      look.x += this.pointerSmooth.x * 0.18;
      look.y -= this.pointerSmooth.y * 0.08;
      this.camLook.lerp(look, 0.05);
      this.camera.lookAt(this.camLook);
    } else if (this.mode === 'spectator') {
      const r = this.spectatorRadius;
      const y = 0.95 + this.spectatorPitch * 1.4;
      const desired = new THREE.Vector3(Math.sin(this.spectatorYaw) * r, y, Math.cos(this.spectatorYaw) * r);
      this.camera.position.lerp(desired, 0.14);
      const look = new THREE.Vector3(0, L.TABLE_Y + 0.12, 0);
      this.camLook.lerp(look, 0.16);
      this.camera.lookAt(this.camLook);
    } else if (this.mode === 'hero' && this.lowMotion) {
      const anchor = this.heroLookBase;
      const desired = anchor.clone().add(this.heroCamBase.clone().sub(anchor).multiplyScalar(this.userZoom));
      this.camera.position.lerp(desired, 0.14);
      this.camLook.lerp(anchor, 0.14);
      this.camera.lookAt(this.camLook);
    } else if (this.mode === 'hero') {
      const breathe = Math.sin(now * 0.0011) * 0.005;
      const axis = new THREE.Vector3(0, 1, 0);
      const yaw = -this.pointerSmooth.x * 0.85;
      const pitch = this.pointerSmooth.y * 0.42;
      const anchor = this.heroLookBase;
      const desired = anchor.clone()
        .add(this.heroCamBase.clone().sub(anchor).multiplyScalar(this.userZoom))
        .sub(anchor)
        .applyAxisAngle(axis, yaw * 0.14)
        .add(anchor);
      desired.y += -pitch * 0.16 + breathe;
      this.camera.position.lerp(desired, 0.2);
      const look = this.heroLookBase.clone().applyAxisAngle(axis, yaw);
      look.y += -pitch * 0.32 + Math.sin(now * 0.0007) * 0.006;
      look.add(this.actorLookOffset || { x: 0, y: 0, z: 0 });
      this.camLook.lerp(look, 0.16);
      this.camera.lookAt(this.camLook);
    }

    if (now < this.shakeUntil) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.lookAt(this.camLook);
    }
  }

  updateDust(dt, now) {
    if (!this.dust) return;
    const positions = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < this.dustSpeed.length; i += 1) {
      positions[i * 3 + 1] += this.dustSpeed[i] * dt;
      positions[i * 3] += Math.sin(now * 0.0003 + this.dustPhase[i]) * 0.0009;
      if (positions[i * 3 + 1] > 3.5) positions[i * 3 + 1] = 0.75;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  trackPerformance(frameMs) {
    this.perfAcc += frameMs;
    this.perfFrames += 1;
    if (this.perfFrames < 45) return;
    const avg = this.perfAcc / this.perfFrames;
    this.perfAcc = 0;
    this.perfFrames = 0;
    const budget = 1000 / Math.max(1, this.fpsCap);
    const floorDpr = QUALITY.isMobile ? 0.72 : 0.8;

    // 先降分辨率，再降帧率；始终保留可玩的流畅度。
    if (avg > budget * 1.45 && this.renderDpr > floorDpr) {
      this.renderDpr = Math.max(floorDpr, this.renderDpr - (QUALITY.isMobile ? 0.1 : 0.12));
      this.applyRenderSize(window.innerWidth, window.innerHeight);
      console.info('[quality] dpr ->', this.renderDpr.toFixed(2), avg.toFixed(1));
      return;
    }
    if (QUALITY.isMobile && avg > 42 && this.fpsCap > 24) {
      this.fpsCap = 24;
      console.info('[quality] mobile fps -> 24', avg.toFixed(1));
      return;
    }
    if (!QUALITY.isMobile && avg > 28 && this.bloom && this.bloom.enabled) {
      this.bloom.enabled = false;
      console.info('[quality] bloom disabled', avg.toFixed(1));
    }
  }

  hitBoardCard(event) {
    if (!this.onBoardCardClick || !this.boardCards.length) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    const hits = raycaster.intersectObjects(this.boardCards, true);
    if (hits.length) this.onBoardCardClick();
  }

  render(now) {
    if (this.paused) return;
    const targetFps = this.mode === 'lobby'
      ? Math.min(this.fpsCap, QUALITY.lobbyFpsCap || 24)
      : this.fpsCap;
    if (targetFps < 60) {
      const minInterval = 1000 / targetFps - 1;
      if (this.lastRenderAt && now - this.lastRenderAt < minInterval) return;
    }
    this.lastRenderAt = now;

    const raw = this.lastTime ? now - this.lastTime : 0;
    const dt = Math.min(0.05, (raw || 0) / 1000);
    this.lastTime = now;
    if (raw > 0 && raw < 200 && this.mode !== 'lobby') this.trackPerformance(raw);
    this.renderedFrames += 1;

    updateAnimations(now);
    for (const rig of this.rigs) if (rig) rig.update(now, this.camera);
    this.updateDust(dt, now);
    this.updateLobbyActors(now);
    this.updateCamera(now);

    if (this.neonMaterial) {
      this.neonMaterial.opacity = 0.93 + Math.sin(now * 0.0035) * 0.05;
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
