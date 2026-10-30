import * as THREE from 'three';

const TMP_COLOR = new THREE.Color();

function glowTexture(inner = 'rgba(255,224,174,1)', outer = 'rgba(255,142,68,0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/1\)$/, '0.65)'));
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function person({
  coat = 0x192027,
  shirt = 0xd9c8ae,
  skin = 0xc99a78,
  hair = 0x161311,
  seated = true,
  facing = 0,
  tall = false,
} = {}) {
  const group = new THREE.Group();
  group.rotation.y = facing;
  const coatMat = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.75, metalness: 0.02 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.72 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.88 });
  const height = tall ? 1.12 : 1;
  const hipY = seated ? 0.5 : 0.72;
  const torsoY = seated ? 1.0 : 1.32;
  const headY = seated ? 1.56 : 1.84;

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.4), coatMat);
  hips.position.y = hipY * height;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.48, 4, 10), coatMat);
  torso.position.y = torsoY * height;
  group.add(torso);

  const shirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.02), shirtMat);
  shirtPanel.position.set(0, torsoY * height + 0.06, 0.27);
  group.add(shirtPanel);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 8), skinMat);
  neck.position.y = (headY - 0.2) * height;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skinMat);
  head.scale.set(0.92, 1.05, 0.95);
  head.position.y = headY * height;
  group.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
  hairMesh.position.y = headY * height + 0.02;
  hairMesh.rotation.x = -0.08;
  group.add(hairMesh);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b0908 });
  for (const x of [-0.065, 0.065]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeMat);
    eye.position.set(x, headY * height + 0.015, 0.176);
    group.add(eye);
  }

  const armGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.46, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, coatMat);
    arm.position.set(side * 0.36, torsoY * height, seated ? 0.17 : 0.04);
    arm.rotation.z = side * (seated ? -1.02 : -0.14);
    arm.rotation.x = seated ? 0.9 : 0.04;
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    hand.position.set(side * 0.53, seated ? 0.93 : 0.8, seated ? 0.52 : 0.06);
    group.add(hand);
  }

  if (!seated) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.78, 8), coatMat);
      leg.position.set(side * 0.13, 0.38, 0);
      group.add(leg);
    }
  }

  group.userData.head = head;
  group.userData.hair = hairMesh;
  group.userData.phase = Math.random() * Math.PI * 2;
  return group;
}

function chair() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3c2720, roughness: 0.68 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.48), mat);
  seat.position.y = 0.46;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.07), mat);
  back.position.set(0, 0.78, -0.22);
  group.add(back);
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.45, 6), mat);
      leg.position.set(x, 0.22, z);
      group.add(leg);
    }
  }
  return group;
}

function tableRound(radius = 1.45) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xe2d6c0, roughness: 0.94 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2118, roughness: 0.55 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 48), cloth);
  top.position.y = 0.76;
  group.add(top);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 0.55, 32, 1, true), cloth);
  skirt.position.y = 0.48;
  group.add(skirt);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.65, 16), wood);
  base.position.y = 0.25;
  group.add(base);
  return group;
}

function tableLong() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xdad0c0, roughness: 0.92 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.1, 1.55), cloth);
  top.position.y = 0.78;
  group.add(top);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2d1c14, roughness: 0.6 });
  for (const x of [-2.35, 2.35]) {
    for (const z of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.74, 8), legMat);
      leg.position.set(x, 0.37, z);
      group.add(leg);
    }
  }
  return group;
}

function candle(parent, x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const wax = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0xf0e5cc, roughness: 0.8 }),
  );
  wax.position.y = 0.11;
  group.add(wax);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.95 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), flameMat);
  flame.position.y = 0.28;
  group.add(flame);
  const light = new THREE.PointLight(0xff9d55, 3.2, 4.5, 2);
  light.position.y = 0.3;
  group.add(light);
  group.userData.light = light;
  group.userData.flame = flame;
  parent.add(group);
  return group;
}

function stringLights(scene, points, color = 0xffc278) {
  const texture = glowTexture('rgba(255,222,164,1)', 'rgba(255,145,60,0)');
  const material = new THREE.PointsMaterial({
    map: texture,
    color,
    size: 0.18,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const dots = new THREE.Points(geometry, material);
  scene.add(dots);
  return dots;
}

function makeOcean(colorA, colorB, calm = 0) {
  const geometry = new THREE.PlaneGeometry(220, 220, 80, 80);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uCalm: { value: calm },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uCalm;
      varying float vWave;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.22 + uTime * 0.9) * 0.16
          + sin(p.y * 0.31 - uTime * 0.65) * 0.11
          + sin((p.x + p.y) * 0.11 + uTime * 0.4) * 0.08;
        p.z += w * (1.0 - uCalm * 0.55);
        vWave = w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vWave;
      varying vec3 vWorld;
      void main() {
        float bands = smoothstep(-0.18, 0.26, vWave);
        vec3 color = mix(uColorA, uColorB, bands * 0.7 + 0.15);
        float glint = smoothstep(0.16, 0.3, vWave) * 0.35;
        color += vec3(glint * 0.75, glint * 0.56, glint * 0.35);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.75;
  return mesh;
}

function makeSky(top, horizon, bottom, sunColor, sunDir) {
  const geometry = new THREE.SphereGeometry(160, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBottom: { value: new THREE.Color(bottom) },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 color = mix(uBottom, uHorizon, smoothstep(-0.18, 0.08, h));
        color = mix(color, uTop, smoothstep(0.08, 0.7, h));
        float sun = pow(max(dot(vDir, uSunDir), 0.0), 22.0);
        float halo = pow(max(dot(vDir, uSunDir), 0.0), 4.0);
        color += uSunColor * (sun * 1.4 + halo * 0.22);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  return sky;
}

function makeSunSprite(color = 'rgba(255,216,164,1)') {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(color, 'rgba(255,140,62,0)'),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(10, 10, 1);
  return sprite;
}

function makeWindowPanel(width, height, color = 0xffb877) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x0b1114, roughness: 0.5 }),
  );
  group.add(frame);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.9, height * 0.85),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
  glass.position.z = 0.05;
  group.add(glass);
  return group;
}

function tableProps(parent, y, z, spread = 1.4, long = false) {
  const cardMat = new THREE.MeshStandardMaterial({ color: 0xf2eadc, roughness: 0.9 });
  const chipMats = [0x7d2024, 0x1d2427, 0xd2b16d].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbfd8d6, metalness: 0.05, roughness: 0.06, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf0e7d7, roughness: 0.5 });
  const count = long ? 3 : 2;
  for (let i = 0; i < count; i += 1) {
    const x = long ? (i - 1) * 1.55 : (i - 0.5) * 0.9;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.025, 22), plateMat);
    plate.position.set(x, y + 0.03, z + (i % 2 ? 0.25 : -0.16));
    parent.add(plate);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 10), glassMat);
    glass.position.set(x + 0.18, y + 0.14, z - 0.27);
    parent.add(glass);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), glassMat);
    stem.position.set(x + 0.18, y + 0.05, z - 0.27);
    parent.add(stem);
  }
  for (let i = 0; i < 5; i += 1) {
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.19), cardMat);
    card.position.set(-spread + i * 0.07, y + 0.012, z + 0.48 + (i % 2) * 0.04);
    card.rotation.y = (i - 2) * 0.22;
    parent.add(card);
  }
  for (let i = 0; i < 3; i += 1) {
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 14), chipMats[i % chipMats.length]);
    chip.position.set(spread - 0.15 + i * 0.04, y + 0.012 + i * 0.021, z + 0.38);
    parent.add(chip);
  }
}

function makeTideScene() {
  const root = new THREE.Group();
  const sky = makeSky(0x0c1624, 0x9b5c47, 0x1c252b, 0xffd19a, [0.65, 0.12, -0.75]);
  root.add(sky);
  const sun = makeSunSprite();
  sun.position.set(42, 14, -85);
  root.add(sun);

  const ocean = makeOcean(0x07141b, 0x436b73, 0.15);
  root.add(ocean);

  const fog = new THREE.FogExp2(0x111923, 0.016);
  root.userData.fog = fog;

  const deckMat = new THREE.MeshStandardMaterial({ color: 0x2b211c, roughness: 0.68 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.35, 10), deckMat);
  deck.position.set(0, 0, -5.6);
  root.add(deck);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x171b1c, roughness: 0.8 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.2, 0.24), wallMat);
  backWall.position.set(0, 2.1, -10.2);
  root.add(backWall);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.22, 9.2), wallMat);
  roof.position.set(0, 4.45, -5.6);
  root.add(roof);

  for (const x of [-5.4, 5.4]) {
    for (const z of [-2, -8.5]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.3, 0.18), wallMat);
      pillar.position.set(x, 2.15, z);
      root.add(pillar);
    }
  }

  for (const x of [-3.1, 0, 3.1]) {
    const window = makeWindowPanel(2.2, 2.35, 0xffa968);
    window.position.set(x, 2.25, -10.04);
    root.add(window);
  }

  const bar = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.15, 0.75), new THREE.MeshStandardMaterial({ color: 0x281a14, roughness: 0.6 }));
  bar.position.set(0, 0.7, -8.45);
  root.add(bar);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x84552f, emissive: 0x2a1004, roughness: 0.3 });
  for (let i = 0; i < 9; i += 1) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.4 + (i % 3) * 0.08, 8), bottleMat);
    bottle.position.set(-3.1 + i * 0.78, 1.45, -8.2);
    root.add(bottle);
  }

  const table = tableRound(1.55);
  table.position.set(0, 0, -3.7);
  root.add(table);
  tableProps(root, 0.82, -3.7, 1.05, false);
  for (const [x, z, ry] of [[0, -5.1, 0], [0, -2.2, Math.PI], [-2.2, -3.7, Math.PI / 2]]) {
    const chairMesh = chair();
    chairMesh.position.set(x, 0, z);
    chairMesh.rotation.y = ry;
    root.add(chairMesh);
  }

  const rival = person({
    coat: 0x2a2026,
    shirt: 0xd9c2a4,
    skin: 0xd2a17e,
    hair: 0x171313,
    seated: true,
    facing: 0,
  });
  rival.position.set(0, 0, -4.92);
  rival.scale.setScalar(0.96);
  root.add(rival);

  const guest = person({
    coat: 0x1e2629,
    shirt: 0xbcae98,
    skin: 0xc49272,
    hair: 0x171514,
    seated: true,
    facing: Math.PI / 2,
  });
  guest.position.set(-2.55, 0, -4.25);
  guest.scale.setScalar(0.92);
  root.add(guest);

  const hero = person({
    coat: 0x1b2228,
    shirt: 0xdbc9ac,
    skin: 0xc89776,
    hair: 0x171312,
    seated: true,
    facing: Math.PI,
  });
  hero.position.set(0.1, 0, -2.48);
  hero.scale.setScalar(0.96);
  root.add(hero);

  const candleA = candle(root, 0.4, 0.82, -3.55);
  const candleB = candle(root, -0.55, 0.82, -3.9);

  const light = new THREE.PointLight(0xffa86a, 28, 22, 2);
  light.position.set(0, 3.1, -6.8);
  root.add(light);

  const tableGlow = new THREE.PointLight(0xffbe86, 16, 9, 2);
  tableGlow.position.set(0, 2.1, -3.9);
  root.add(tableGlow);

  const rim = new THREE.PointLight(0xff7b48, 10, 14, 2);
  rim.position.set(-4.4, 2.4, -2.2);
  root.add(rim);

  const deckLight = new THREE.PointLight(0xffbd83, 6, 12, 2);
  deckLight.position.set(-3.5, 2.7, -3.4);
  root.add(deckLight);

  const stringPoints = [];
  for (let i = 0; i <= 22; i += 1) {
    const t = i / 22;
    const x = -5.2 + t * 10.4;
    const y = 4.1 - Math.sin(t * Math.PI) * 0.55;
    stringPoints.push(new THREE.Vector3(x, y, -2.45));
  }
  stringLights(root, stringPoints);

  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 120;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 16;
    dustPositions[i * 3 + 1] = Math.random() * 4.5;
    dustPositions[i * 3 + 2] = -2 - Math.random() * 9;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0xffd9a1,
    size: 0.035,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }));
  root.add(dust);

  root.userData.people = [rival, guest, hero];
  root.userData.candles = [candleA, candleB];
  root.userData.ocean = ocean;
  root.userData.dust = dust;
  root.userData.light = light;
  return root;
}

function makeMenuScene() {
  const root = new THREE.Group();
  const sky = makeSky(0x030711, 0x1a2d3a, 0x070b10, 0xffa06a, [0.24, 0.06, -0.95]);
  root.add(sky);
  const fog = new THREE.FogExp2(0x0a0d10, 0.026);
  root.userData.fog = fog;

  const ocean = makeOcean(0x03080c, 0x1d333b, 0.65);
  ocean.position.y = -3.4;
  root.add(ocean);

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.96 });
  for (let i = 0; i < 7; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4 + Math.random() * 2.2, 0), rockMat);
    rock.position.set(-8 + Math.random() * 16, -2.4 + Math.random() * 0.5, -9 + Math.random() * 6);
    rock.scale.y = 0.6 + Math.random() * 0.4;
    root.add(rock);
  }

  const platform = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x181719, roughness: 0.66 }));
  platform.position.set(0, 0, -5.3);
  root.add(platform);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x233233,
    metalness: 0.05,
    roughness: 0.16,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const x of [-6.6, 6.6]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 4.3), glassMat);
    pane.position.set(x, 2.1, -5.3);
    pane.rotation.y = Math.PI / 2;
    root.add(pane);
  }
  const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(13.2, 4.3), glassMat);
  backGlass.position.set(0, 2.1, -10.1);
  root.add(backGlass);

  const beamMat = new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.5, metalness: 0.3 });
  for (const x of [-6.6, 6.6]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.5, 0.14), beamMat);
    beam.position.set(x, 2.2, -1.2);
    root.add(beam);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.16, 9.6), beamMat);
  roof.position.set(0, 4.4, -5.2);
  root.add(roof);
  const ceilingGlow = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.025, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffc78f }),
  );
  ceilingGlow.position.set(0, 4.28, -5.4);
  root.add(ceilingGlow);
  const backGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffa665, transparent: true, opacity: 0.16 }),
  );
  backGlow.position.set(0, 2.4, -10.02);
  root.add(backGlow);

  const table = tableLong();
  table.position.set(0, 0, -4.4);
  root.add(table);
  tableProps(root, 0.84, -4.4, 1.75, true);

  const chairPositions = [
    [-2.1, -3.4, Math.PI], [0, -3.4, Math.PI], [2.1, -3.4, Math.PI],
    [-2.1, -5.4, 0], [0, -5.4, 0], [2.1, -5.4, 0],
  ];
  for (const [x, z, ry] of chairPositions) {
    const chairMesh = chair();
    chairMesh.position.set(x, 0, z);
    chairMesh.rotation.y = ry;
    root.add(chairMesh);
  }

  const critic = person({
    coat: 0x11181d,
    shirt: 0xd9cbb8,
    skin: 0xbe8c6d,
    hair: 0x121010,
    seated: true,
    facing: 0,
  });
  critic.position.set(-1.35, 0, -5.9);
  critic.scale.setScalar(0.95);
  root.add(critic);

  const guest = person({
    coat: 0x2b1e24,
    shirt: 0xcab69e,
    skin: 0xc49272,
    hair: 0x1b1414,
    seated: true,
    facing: 0,
  });
  guest.position.set(1.4, 0, -5.9);
  guest.scale.setScalar(0.94);
  root.add(guest);

  const chef = person({
    coat: 0xd8d3c7,
    shirt: 0xe7e1d2,
    skin: 0xc59b7c,
    hair: 0x1a1715,
    seated: false,
    facing: 0,
    tall: true,
  });
  chef.position.set(0, 0, -8.9);
  chef.scale.setScalar(1.02);
  root.add(chef);

  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 0.4, 14),
    new THREE.MeshStandardMaterial({ color: 0xe7e1d2, roughness: 0.85 }),
  );
  hat.position.set(0, 2.2, 0);
  chef.add(hat);

  const candles = [candle(root, -1.6, 0.83, -4.4), candle(root, 1.6, 0.83, -4.4), candle(root, 0, 0.83, -4.4)];

  const fill = new THREE.PointLight(0xffb47b, 48, 22, 2);
  fill.position.set(0, 3.0, -6.2);
  root.add(fill);
  const tableFill = new THREE.PointLight(0xffc899, 26, 10, 2);
  tableFill.position.set(0, 2.1, -4.2);
  root.add(tableFill);
  const floorGlow = new THREE.PointLight(0xff8f51, 18, 14, 2);
  floorGlow.position.set(0, 0.4, -3.4);
  root.add(floorGlow);

  const pendantMat = new THREE.MeshStandardMaterial({ color: 0x0d0f10, roughness: 0.4, metalness: 0.4 });
  for (const x of [-3.7, 0, 3.7]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0x171512 }));
    cable.position.set(x, 3.2, -6.5);
    root.add(cable);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.28, 14, 1, true), pendantMat);
    shade.rotation.x = Math.PI;
    shade.position.set(x, 2.05, -6.5);
    root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffca8b }));
    bulb.position.set(x, 1.94, -6.5);
    root.add(bulb);
    const light = new THREE.PointLight(0xffb373, 10, 8, 2);
    light.position.copy(bulb.position);
    root.add(light);
  }

  const steamGeometry = new THREE.BufferGeometry();
  const steamCount = 80;
  const positions = new Float32Array(steamCount * 3);
  for (let i = 0; i < steamCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = 1 + Math.random() * 2;
    positions[i * 3 + 2] = -4.2 + (Math.random() - 0.5) * 2;
  }
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const steam = new THREE.Points(steamGeometry, new THREE.PointsMaterial({
    color: 0xffe5c4,
    size: 0.05,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  root.add(steam);

  root.userData.people = [critic, guest, chef];
  root.userData.candles = candles;
  root.userData.ocean = ocean;
  root.userData.dust = steam;
  return root;
}

const SHOTS = {
  tide: [
    { pos: [12, 5.2, 17], look: [0, 2.4, -5.2], fov: 38 },
    { pos: [6.4, 3.5, 6.8], look: [0, 2.05, -4.3], fov: 42 },
    { pos: [2.35, 2.12, -0.7], look: [0, 1.78, -4.4], fov: 47 },
    { pos: [2.25, 2.18, -1.65], look: [0, 1.68, -4.95], fov: 42 },
    { pos: [-4.6, 3.5, 8.2], look: [0, 2.2, -4.2], fov: 40 },
  ],
  menu: [
    { pos: [13, 6.2, 16], look: [0, 2.3, -5.2], fov: 40 },
    { pos: [6.8, 3.8, 7.2], look: [0, 2.0, -4.5], fov: 42 },
    { pos: [2.8, 2.22, -1.2], look: [0, 1.8, -4.9], fov: 47 },
    { pos: [1.2, 2.08, -5.0], look: [0, 1.9, -7.6], fov: 44 },
    { pos: [-3.6, 3.0, 4.8], look: [0, 1.9, -5], fov: 42 },
  ],
};

export class StoryCinema3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.clock = new THREE.Clock();
    this.running = false;
    this.raf = 0;
    this.theme = '';
    this.root = null;
    this.shot = 0;
    this.shotAt = 0;
    this.fromPos = new THREE.Vector3();
    this.fromLook = new THREE.Vector3();
    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.look = new THREE.Vector3(0, 2, -4);
    this.selectMode = true;
    this.lastFrame = 0;
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  ensureTheme(theme) {
    if (this.theme === theme && this.root) return;
    this.disposeRoot();
    this.theme = theme;
    this.root = theme === 'menu' ? makeMenuScene() : makeTideScene();
    this.scene.add(this.root);
    this.scene.fog = this.root.userData.fog || null;
    this.scene.background = new THREE.Color(theme === 'menu' ? 0x07090d : 0x0c1520);
    const ambient = new THREE.AmbientLight(0xa9b4bd, 1.05);
    ambient.userData.storyLight = true;
    this.root.add(ambient);
    const hemi = new THREE.HemisphereLight(0x93a6b4, 0x3a2a21, 1.25);
    hemi.userData.storyLight = true;
    this.root.add(hemi);
    const key = new THREE.DirectionalLight(theme === 'menu' ? 0xffc18c : 0xffb47b, 3.0);
    key.position.set(8, 12, 10);
    key.userData.storyLight = true;
    this.root.add(key);
    this.shot = 0;
    this.shotAt = 0;
    this.setCameraImmediate(SHOTS[theme][0]);
  }

  setCameraImmediate(shot) {
    this.camera.position.set(...shot.pos);
    this.look.set(...shot.look);
    this.camera.fov = shot.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
  }

  showSelect() {
    this.ensureTheme('tide');
    this.selectMode = true;
    this.shot = 0;
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.look);
    this.shotAt = performance.now();
    this.start();
  }

  loadChapter(id) {
    const theme = id === 'menu' ? 'menu' : 'tide';
    this.ensureTheme(theme);
    this.selectMode = false;
    this.setShot(0, true);
    this.start();
  }

  setShot(index, immediate = false) {
    if (!this.root) return;
    const shots = SHOTS[this.theme] || SHOTS.tide;
    const shot = shots[Math.min(index, shots.length - 1)];
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.look);
    this.targetPos.set(...shot.pos);
    this.targetLook.set(...shot.look);
    this.targetFov = shot.fov;
    this.shotAt = performance.now();
    if (immediate) {
      this.camera.position.copy(this.targetPos);
      this.look.copy(this.targetLook);
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
      this.fromPos.copy(this.targetPos);
      this.fromLook.copy(this.targetLook);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.lastFrame < 30) return;
    const delta = Math.min(0.06, this.clock.getDelta());
    this.lastFrame = now;
    const time = this.clock.elapsedTime;
    this.updateCamera(now, time);
    this.updateWorld(time, delta);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(now, time) {
    let goalPos;
    let goalLook;
    let goalFov;
    if (this.selectMode) {
      const radius = 20 + Math.sin(time * 0.16) * 1.4;
      const angle = -0.62 + Math.sin(time * 0.08) * 0.1;
      goalPos = new THREE.Vector3(Math.sin(angle) * radius, 4.3 + Math.sin(time * 0.23) * 0.3, Math.cos(angle) * radius);
      goalLook = new THREE.Vector3(0, 2.2, -4.5);
      goalFov = 39;
      this.camera.position.lerp(goalPos, 0.012);
      this.look.lerp(goalLook, 0.02);
    } else {
      const shots = SHOTS[this.theme] || SHOTS.tide;
      const index = Math.min(this.shot, shots.length - 1);
      const shot = shots[index];
      goalPos = this.targetPos.lengthSq() ? this.targetPos : new THREE.Vector3(...shot.pos);
      goalLook = this.targetLook.lengthSq() ? this.targetLook : new THREE.Vector3(...shot.look);
      const t = Math.min(1, (now - this.shotAt) / 2400);
      const eased = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.fromPos, goalPos, eased);
      this.look.lerpVectors(this.fromLook, goalLook, eased);
      goalFov = this.targetFov || shot.fov;
    }
    const shakeX = Math.sin(time * 0.8) * 0.022 + Math.sin(time * 1.9) * 0.008;
    const shakeY = Math.cos(time * 0.67) * 0.016 + Math.sin(time * 1.3) * 0.006;
    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;
    this.camera.fov += ((goalFov || 42) - this.camera.fov) * 0.04;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
  }

  updateWorld(time, delta) {
    if (!this.root) return;
    const ocean = this.root.userData.ocean;
    if (ocean?.material?.uniforms?.uTime) ocean.material.uniforms.uTime.value = time;
    for (const personMesh of this.root.userData.people || []) {
      const head = personMesh.userData.head;
      if (head) {
        head.rotation.y = Math.sin(time * 0.47 + (personMesh.userData.phase || 0)) * 0.08;
        head.rotation.x = Math.sin(time * 0.33 + 1.4) * 0.025;
      }
      personMesh.position.y = Math.sin(time * 0.9 + (personMesh.userData.phase || 0)) * 0.004;
    }
    for (const candleGroup of this.root.userData.candles || []) {
      const light = candleGroup.userData.light;
      const flame = candleGroup.userData.flame;
      const flicker = 0.75 + Math.sin(time * 8 + candleGroup.id) * 0.14 + Math.sin(time * 19.3) * 0.08;
      if (light) light.intensity = 2.1 + flicker * 1.5;
      if (flame) {
        flame.scale.y = 0.8 + flicker * 0.35;
        flame.rotation.z = Math.sin(time * 5 + candleGroup.id) * 0.12;
      }
    }
    const dust = this.root.userData.dust;
    if (dust?.geometry) {
      const attr = dust.geometry.getAttribute('position');
      for (let i = 0; i < attr.count; i += 1) {
        let y = attr.getY(i) + delta * (this.theme === 'menu' ? 0.08 : 0.018);
        if (y > (this.theme === 'menu' ? 3.8 : 4.5)) y = this.theme === 'menu' ? 0.8 : 0;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }
    const light = this.root.userData.light;
    if (light) light.intensity = 16 + Math.sin(time * 3.1) * 1.2;
    if (this.theme === 'tide') {
      if (!this.root.userData.lightningAt || time - this.root.userData.lightningAt > 8) {
        this.root.userData.lightningAt = time;
      }
      const flash = Math.max(0, 1 - Math.abs(time - this.root.userData.lightningAt - 0.12) * 18);
      this.renderer.toneMappingExposure = 1.28 + flash * 0.32;
    }
  }

  disposeRoot() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse((object) => {
      if (object.isMesh || object.isPoints || object.isSprite) {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.map?.dispose?.();
          material.dispose?.();
        }
      }
    });
    this.root = null;
  }
}
