import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animate, easeInOutCubic, easeOutCubic, clamp } from './util.js';
import { getNameplateTexture, getGlowSpriteTexture } from './textures.js';
import { seatPosition, seatFaceYaw, TABLE_Y } from './layout.js';
import { mergeStaticGroup } from './merge.js';
import { QUALITY } from './quality.js';

const LEATHER = new THREE.Color(0x2c1714);
const OUTFITS = [
  { jacket: 0x315f8c, shirt: 0xf3ead8, pants: 0x1e2b39, shoes: 0x17110d, chair: 0x25384a, accent: 0xd7b56f, style: 'classic' },
  { jacket: 0x8c3344, shirt: 0x25242a, pants: 0x2c1c21, shoes: 0x120f0d, chair: 0x4a2428, accent: 0xe2b66c, style: 'bowtie' },
  { jacket: 0x3f7351, shirt: 0xeee2c6, pants: 0x22352b, shoes: 0x1a130d, chair: 0x2c3528, accent: 0xbccfa1, style: 'open' },
  { jacket: 0x8a5a32, shirt: 0xa9d0dc, pants: 0x2c2117, shoes: 0x1a130d, chair: 0x3d291c, accent: 0xf0cf8d, style: 'vest' },
  { jacket: 0x5e467d, shirt: 0xf2e7d2, pants: 0x281f32, shoes: 0x150f12, chair: 0x33263e, accent: 0xd6b36f, style: 'suspenders' },
  { jacket: 0x2e7d85, shirt: 0xebd9b9, pants: 0x183338, shoes: 0x121211, chair: 0x253b3c, accent: 0xd5c28c, style: 'turtleneck' },
  { jacket: 0x9a5235, shirt: 0xf5e3c4, pants: 0x342219, shoes: 0x170f0b, chair: 0x472b1f, accent: 0xe6c98f, style: 'longcoat' },
  { jacket: 0x59616d, shirt: 0xe0c9df, pants: 0x242830, shoes: 0x111214, chair: 0x30343a, accent: 0xc3d2e6, style: 'double' },
];


function limbBetween(start, end, radius, material, scene) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 10);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export class PlayerRig {
  constructor(scene, player, index, count) {
    this.scene = scene;
    this.player = player;
    this.name = player.name;
    this.stack = player.stack;
    this.action = '';
    this.tone = 'neutral';
    this.folded = false;
    this.turnActive = false;
    this.phase = Math.random() * Math.PI * 2;
    this.outfit = OUTFITS[Math.abs(Number(index) || 0) % OUTFITS.length];

    this.root = new THREE.Group();
    const pos = seatPosition(index, count);
    this.root.position.set(pos.x, 0, pos.z);
    this.root.rotation.y = seatFaceYaw(index, count);
    scene.add(this.root);

    this.buildChair();
    this.buildAvatar(player.avatar);
    this.buildPlate();
    this.buildTurnRing(index, count);

    this.baseHeadY = this.headGroup ? this.headGroup.position.y : 0;
    this.blinkSeed = Math.random() * 5000;
    this.lastAnimAt = 0;
  }

  buildChair() {
    const chairColor = new THREE.Color(this.outfit.chair);
    const leatherMat = new THREE.MeshStandardMaterial({
      color: this.outfit.chair,
      emissive: chairColor.clone().multiplyScalar(0.16),
      emissiveIntensity: 0.35,
      roughness: 0.62,
      metalness: 0.02,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: this.outfit.accent,
      roughness: 0.36,
      metalness: 0.65,
    });

    // 按材质合并椅身，单椅从十余个 Mesh 降为两个
    const leatherGeos = [
      new THREE.BoxGeometry(0.58, 0.64, 0.09).translate(0, 1.0, -0.29),
      new THREE.CylinderGeometry(0.045, 0.045, 0.58, 14)
        .rotateZ(Math.PI / 2)
        .translate(0, 1.33, -0.29),
      // 坐垫与扶手：补齐整把椅子
      new THREE.BoxGeometry(0.62, 0.09, 0.54).translate(0, 0.56, -0.02),
      new THREE.BoxGeometry(0.66, 0.06, 0.58).translate(0, 0.50, -0.02),
      new THREE.BoxGeometry(0.065, 0.065, 0.44).translate(-0.31, 0.78, -0.03),
      new THREE.BoxGeometry(0.065, 0.065, 0.44).translate(0.31, 0.78, -0.03),
    ];
    for (const x of [-0.27, 0.27]) {
      for (const z of [-0.22, 0.18]) {
        leatherGeos.push(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 10).translate(x, 0.25, z));
      }
    }
    const goldGeos = [];
    for (const x of [-0.255, 0.255]) {
      goldGeos.push(new THREE.BoxGeometry(0.014, 0.58, 0.012).translate(x, 1.0, -0.243));
      for (let i = 0; i < 4; i += 1) {
        goldGeos.push(new THREE.SphereGeometry(0.007, 6, 6).translate(x, 0.77 + i * 0.15, -0.242));
      }
    }

    const leather = new THREE.Mesh(mergeGeometries(leatherGeos), leatherMat);
    const gold = new THREE.Mesh(mergeGeometries(goldGeos), goldMat);
    for (const mesh of [leather, gold]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  buildAvatar(variant) {
    const v = variant;
    const skinMat = new THREE.MeshStandardMaterial({ color: v.skin, roughness: 0.66 });
    const darkSkinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(v.skin).multiplyScalar(0.72),
      roughness: 0.7,
    });
    const outfit = this.outfit || OUTFITS[0];
    const jacketColor = new THREE.Color(outfit.jacket);
    const jacketMat = new THREE.MeshStandardMaterial({
      color: outfit.jacket,
      emissive: jacketColor.clone().multiplyScalar(0.2),
      emissiveIntensity: 0.32,
      roughness: 0.78,
    });
    const jacketLightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(outfit.jacket).multiplyScalar(1.35),
      roughness: 0.75,
    });
    const shirtMat = new THREE.MeshStandardMaterial({ color: outfit.shirt, emissive: new THREE.Color(outfit.shirt).multiplyScalar(0.1), emissiveIntensity: 0.2, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: outfit.pants, roughness: 0.86 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: outfit.shoes, roughness: 0.58 });
    const hairMat = new THREE.MeshStandardMaterial({ color: v.hair, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.55 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xc6a15e,
      roughness: 0.3,
      metalness: 0.75,
    });
    this.outfitMats = { jacketMat, jacketLightMat, shirtMat, pantsMat, shoeMat };

    const avatar = new THREE.Group();
    this.avatarGroup = avatar;
    this.root.add(avatar);

    // 躯干
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.156, 0.2, 6, 16), jacketMat);
    torso.position.set(0, 1.0, 0);
    torso.scale.set(1, 1, 0.86);
    torso.castShadow = true;
    torso.receiveShadow = true;
    avatar.add(torso);

    // 下半身：髋部、裤腿、鞋；坐在椅子上，腿部朝桌沿弯折
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), pantsMat);
    hip.scale.set(1.08, 0.55, 0.9);
    hip.position.set(0, 0.82, 0.01);
    hip.castShadow = true;
    avatar.add(hip);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.19), darkMat);
    belt.position.set(0, 0.865, 0.025);
    avatar.add(belt);
    for (const side of [-1, 1]) {
      const hipJoint = new THREE.Vector3(side * 0.09, 0.8, 0.02);
      const knee = new THREE.Vector3(side * 0.14, 0.54, 0.29);
      const ankle = new THREE.Vector3(side * 0.15, 0.16, 0.31);
      limbBetween(hipJoint, knee, 0.073, pantsMat, avatar);
      limbBetween(knee, ankle, 0.056, pantsMat, avatar);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 0.24), shoeMat);
      shoe.position.set(side * 0.15, 0.085, 0.37);
      shoe.rotation.x = -0.05;
      shoe.castShadow = true;
      avatar.add(shoe);
    }

    // 衬衫只露一条窄领口，西装前襟盖住大部分，避免一整块白色“木头胸”
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.17, 0.014), shirtMat);
    shirt.position.set(0, 1.08, 0.142);
    shirt.rotation.x = -0.05;
    avatar.add(shirt);

    // 西装前襟
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.23, 0.022), jacketMat);
      front.position.set(side * 0.05, 1.055, 0.142);
      front.rotation.z = side * -0.045;
      avatar.add(front);
    }

    // 领带 / 开放领 / 马甲风格按玩家区分
    const style = outfit.style || 'tie';
    if ((style === 'classic' || style === 'double') && !v.bowtie) {
      const tieMat = new THREE.MeshStandardMaterial({ color: outfit.accent, roughness: 0.55, metalness: 0.15 });
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), tieMat);
      knot.position.set(0, 1.158, 0.158);
      avatar.add(knot);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.082, 0.007), tieMat);
      tie.position.set(0, 1.104, 0.155);
      tie.rotation.x = -0.05;
      avatar.add(tie);
    }

    // 肩部
    for (const side of [-1, 1]) {
      const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), jacketMat);
      shoulderCap.scale.set(1, 0.72, 0.9);
      shoulderCap.position.set(side * 0.16, 1.16, 0.01);
      shoulderCap.castShadow = true;
      avatar.add(shoulderCap);
    }

    // 西装翻领
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.23, 0.024), jacketLightMat);
      lapel.position.set(side * 0.075, 1.08, 0.14);
      lapel.rotation.z = side * 0.26;
      lapel.rotation.x = -0.06;
      avatar.add(lapel);
    }

    // 口袋巾
    if (v.pocketSquare) {
      const square = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.016, 0.012), shirtMat);
      square.position.set(0.105, 1.115, 0.14);
      square.rotation.z = 0.3;
      avatar.add(square);
    }

    // 领结
    if (v.bowtie || style === 'bowtie') {
      const bowMat = new THREE.MeshStandardMaterial({ color: outfit.accent, roughness: 0.5, metalness: 0.2 });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 4), bowMat);
        wing.rotation.z = side * Math.PI / 2;
        wing.position.set(side * 0.024, 1.185, 0.148);
        avatar.add(wing);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), goldMat);
      knot.position.set(0, 1.185, 0.152);
      avatar.add(knot);
    }

    if (style === 'open') {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.018, 8, 18), shirtMat);
      scarf.rotation.x = Math.PI / 2.5;
      scarf.position.set(0, 1.16, 0.04);
      avatar.add(scarf);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.018), shirtMat);
      tail.position.set(0.045, 1.05, 0.15);
      tail.rotation.z = 0.12;
      avatar.add(tail);
    } else if (style === 'vest') {
      const vestMat = new THREE.MeshStandardMaterial({ color: outfit.accent, roughness: 0.7, metalness: 0.05 });
      for (const side of [-1, 1]) {
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.25, 0.028), vestMat);
        vest.position.set(side * 0.065, 1.02, 0.145);
        vest.rotation.z = side * 0.08;
        avatar.add(vest);
      }
    }

    if (style === 'suspenders') {
      const strapMat = new THREE.MeshStandardMaterial({ color: outfit.accent, roughness: 0.55, metalness: 0.2 });
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3, 0.012), strapMat);
        strap.position.set(side * 0.09, 1.0, 0.148);
        strap.rotation.z = side * 0.1;
        avatar.add(strap);
      }
    } else if (style === 'turtleneck') {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.075, 16), shirtMat);
      roll.position.set(0, 1.2, 0.035);
      avatar.add(roll);
    } else if (style === 'longcoat') {
      for (const side of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.3, 0.035), jacketMat);
        flap.position.set(side * 0.1, 0.74, 0.02);
        flap.rotation.z = side * 0.06;
        avatar.add(flap);
      }
    } else if (style === 'double') {
      const accentMat = new THREE.MeshStandardMaterial({ color: outfit.accent, roughness: 0.45, metalness: 0.3 });
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i += 1) {
          const btn = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), accentMat);
          btn.position.set(side * 0.055, 1.12 - i * 0.065, 0.152);
          avatar.add(btn);
        }
      }
    }

    // 脖子
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.09, 12), skinMat);
    neck.position.set(0, 1.275, 0.02);
    avatar.add(neck);

    // 头部
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.4, 0.025);
    avatar.add(headGroup);
    this.headGroup = headGroup;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.098, 22, 18), skinMat);
    head.scale.set(1, 1.1, 0.94);
    head.castShadow = true;
    head.receiveShadow = true;
    headGroup.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), skinMat);
    nose.scale.set(0.8, 1, 1.15);
    nose.position.set(0, -0.006, 0.094);
    headGroup.add(nose);

    // 耳朵
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 8), skinMat);
      ear.scale.set(0.55, 1, 0.8);
      ear.position.set(side * 0.095, 0.005, 0.002);
      headGroup.add(ear);
    }

    // 眼睛
    this.eyes = [];
    if (!v.shades) {
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 8, 8), darkMat);
        eye.scale.set(0.9, 1.15, 0.6);
        eye.position.set(side * 0.036, 0.012, 0.09);
        headGroup.add(eye);
        this.eyes.push(eye);

        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.008), hairMat);
        brow.position.set(side * 0.037, 0.038, 0.089);
        brow.rotation.z = side * -0.12;
        headGroup.add(brow);
      }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0035, 0.006), darkSkinMat);
      mouth.position.set(0, -0.036, 0.093);
      headGroup.add(mouth);
    } else {
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.01), darkMat);
        lens.position.set(side * 0.039, 0.016, 0.093);
        headGroup.add(lens);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.008), goldMat);
      bridge.position.set(0, 0.018, 0.098);
      headGroup.add(bridge);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0035, 0.006), darkSkinMat);
      mouth.position.set(0, -0.036, 0.093);
      headGroup.add(mouth);
    }

    // 胡子
    if (v.mustache) {
      const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.009, 0.008), hairMat);
      mustache.position.set(0, -0.018, 0.096);
      headGroup.add(mustache);
    }

    // 发型
    if (v.hairStyle === 'cap') {
      const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.103, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), darkMat);
      capTop.position.y = 0.012;
      headGroup.add(capTop);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.075), darkMat);
      brim.position.set(0, 0.052, 0.078);
      brim.rotation.x = 0.08;
      headGroup.add(brim);
    } else if (v.hairStyle === 'bald') {
      // no hair
    } else {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.102, 20, 12, 0, Math.PI * 2, 0, Math.PI * (v.hairStyle === 'long' ? 0.58 : 0.44)),
        hairMat,
      );
      cap.position.set(0, 0.004, -0.004);
      cap.scale.set(1, 1.05, 1);
      headGroup.add(cap);
      if (v.hairStyle === 'long') {
        const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), hairMat);
        backHair.scale.set(1.1, 1.25, 0.65);
        backHair.position.set(0, -0.055, -0.045);
        headGroup.add(backHair);
      }
      if (v.hairStyle === 'bun') {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 10), hairMat);
        bun.position.set(0, 0.075, -0.082);
        headGroup.add(bun);
      }
    }

    if (v.earring) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0022, 6, 14), goldMat);
      ring.position.set(0.1, -0.018, 0.006);
      ring.rotation.y = Math.PI / 2;
      headGroup.add(ring);
    }

    // 生肖/卡通头套：牛头、马面、狐仙。保留同一套身体和动画，
    // 只替换头部特征，避免现有低模人脸过于生硬。
    if (v.species) {
      const muzzleColor = v.species === 'fox' ? 0xf3ead8 : new THREE.Color(v.skin).lerp(new THREE.Color(0xf0d3b4), 0.35);
      const muzzleMat = new THREE.MeshStandardMaterial({ color: muzzleColor, roughness: 0.72 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xe7d7b8, roughness: 0.5 });
      const noseMat = new THREE.MeshStandardMaterial({ color: 0x2a1b16, roughness: 0.45 });
      const speciesEars = (mat, height, radius, x, y, z, tilt) => {
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8), mat);
          ear.position.set(side * x, y, z);
          ear.rotation.z = side * tilt;
          headGroup.add(ear);
        }
      };
      if (v.species === 'bull') {
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.12, 10), hornMat);
          horn.position.set(side * 0.083, 0.075, -0.01);
          horn.rotation.z = side * -0.38;
          horn.rotation.x = 0.12;
          headGroup.add(horn);
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), muzzleMat);
          ear.scale.set(0.7, 1, 0.55);
          ear.position.set(side * 0.11, 0.008, 0);
          headGroup.add(ear);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10), muzzleMat);
        muzzle.scale.set(1.35, 0.72, 0.86);
        muzzle.position.set(0, -0.043, 0.085);
        headGroup.add(muzzle);
        for (const side of [-1, 1]) {
          const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 6), noseMat);
          nostril.position.set(side * 0.021, -0.046, 0.139);
          headGroup.add(nostril);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0025, 6, 16), goldMat);
        ring.position.set(0, -0.082, 0.125);
        headGroup.add(ring);
      } else if (v.species === 'horse') {
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 8), skinMat);
          ear.position.set(side * 0.067, 0.098, -0.012);
          ear.rotation.z = side * 0.14;
          headGroup.add(ear);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.054, 14, 10), muzzleMat);
        muzzle.scale.set(0.92, 1.38, 1.08);
        muzzle.position.set(0, -0.04, 0.09);
        headGroup.add(muzzle);
        for (const side of [-1, 1]) {
          const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 6, 6), noseMat);
          nostril.position.set(side * 0.018, -0.045, 0.139);
          headGroup.add(nostril);
        }
        for (let i = 0; i < 5; i += 1) {
          const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.027 - i * 0.002, 7, 6), hairMat);
          tuft.scale.set(0.5, 1.2, 1);
          tuft.position.set((i % 2 ? 1 : -1) * 0.018, 0.115 - i * 0.032, -0.065 - i * 0.012);
          headGroup.add(tuft);
        }
      } else if (v.species === 'fox') {
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.11, 4), hairMat);
          ear.position.set(side * 0.073, 0.105, -0.008);
          ear.rotation.z = side * 0.18;
          headGroup.add(ear);
          const inner = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.075, 4), muzzleMat);
          inner.position.set(side * 0.073, 0.105, 0.004);
          inner.rotation.z = side * 0.18;
          headGroup.add(inner);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 9), muzzleMat);
        muzzle.scale.set(1.12, 0.66, 1.15);
        muzzle.position.set(0, -0.037, 0.092);
        headGroup.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), noseMat);
        nose.position.set(0, -0.029, 0.143);
        headGroup.add(nose);
      } else if (v.species === 'panda') {
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), noseMat);
          ear.scale.set(1, 1, 0.55);
          ear.position.set(side * 0.073, 0.087, -0.018);
          headGroup.add(ear);
          const patch = new THREE.Mesh(new THREE.SphereGeometry(0.037, 10, 8), noseMat);
          patch.scale.set(0.82, 1, 0.36);
          patch.position.set(side * 0.039, 0.012, 0.084);
          headGroup.add(patch);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 9), muzzleMat);
        muzzle.scale.set(1.1, 0.72, 0.95);
        muzzle.position.set(0, -0.043, 0.09);
        headGroup.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 7, 6), noseMat);
        nose.position.set(0, -0.03, 0.138);
        headGroup.add(nose);
      } else if (v.species === 'wolf') {
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.027, 0.095, 7), hairMat);
          ear.position.set(side * 0.065, 0.105, -0.01);
          ear.rotation.z = side * 0.12;
          headGroup.add(ear);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 9), muzzleMat);
        muzzle.scale.set(0.95, 0.8, 1.2);
        muzzle.position.set(0, -0.043, 0.09);
        headGroup.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 7, 6), noseMat);
        nose.position.set(0, -0.034, 0.143);
        headGroup.add(nose);
      } else if (v.species === 'cat') {
        const pinkMat = new THREE.MeshStandardMaterial({ color: 0xd98e95, roughness: 0.72 });
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.105, 3), hairMat);
          ear.position.set(side * 0.07, 0.105, -0.01);
          ear.rotation.z = side * 0.16;
          headGroup.add(ear);
          const inner = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.075, 3), pinkMat);
          inner.position.set(side * 0.07, 0.105, 0.002);
          inner.rotation.z = side * 0.16;
          headGroup.add(inner);
        }
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.043, 10, 8), muzzleMat);
        muzzle.scale.set(1.2, 0.62, 0.9);
        muzzle.position.set(0, -0.04, 0.092);
        headGroup.add(muzzle);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 7, 6), pinkMat);
        nose.position.set(0, -0.032, 0.13);
        headGroup.add(nose);
        for (const side of [-1, 1]) {
          const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.0016, 0.0016), noseMat);
          whisker.position.set(side * 0.045, -0.047, 0.128);
          whisker.rotation.z = side * 0.06;
          headGroup.add(whisker);
        }
      }
    }

    // 手臂搭在桌沿
    const bareArms = style === 'vest' || style === 'suspenders';
    const armColor = bareArms || v.sleeves === 'rolled' ? skinMat : jacketMat;
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.16, 1.16, 0.01);
      const elbow = new THREE.Vector3(side * 0.21, 0.94, 0.18);
      const hand = new THREE.Vector3(side * 0.22, 0.805, 0.29);
      limbBetween(shoulder, elbow, 0.046, armColor, avatar);
      limbBetween(elbow, hand, 0.038, bareArms || v.sleeves === 'rolled' ? skinMat : armColor, avatar);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skinMat);
      palm.scale.set(1.1, 0.55, 1.35);
      palm.position.copy(hand);
      palm.castShadow = true;
      avatar.add(palm);

      if (v.sleeves !== 'rolled') {
        const dir = new THREE.Vector3().subVectors(hand, elbow).normalize();
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.024, 14), shirtMat);
        cuff.position.copy(elbow).lerp(hand, 0.86);
        cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        cuff.castShadow = true;
        avatar.add(cuff);
        if (side === 1) {
          const watch = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.003, 6, 18), goldMat);
          watch.position.copy(elbow).lerp(hand, 0.73);
          watch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          avatar.add(watch);
          const face = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 14), darkMat);
          face.position.copy(elbow).lerp(hand, 0.73);
          face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          avatar.add(face);
        }
      }
      if (side === -1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0018, 6, 12), goldMat);
        ring.position.set(hand.x, hand.y + 0.012, hand.z + 0.012);
        ring.rotation.x = Math.PI / 2.6;
        avatar.add(ring);
      }
    }

    // 衬衫领口与袖扣细节，避免上半身看起来像一整块木头
    for (const side of [-1, 1]) {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.018), shirtMat);
      collar.position.set(side * 0.042, 1.192, 0.135);
      collar.rotation.z = side * 0.34;
      avatar.add(collar);
    }
    for (let i = 0; i < 3; i += 1) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), goldMat);
      button.position.set(0, 1.055 - i * 0.055, 0.146);
      avatar.add(button);
    }

    // 合并静态部件：头部与身体分别处理，眼睛保留独立以便眨眼
    for (const eye of this.eyes) eye.userData.noMerge = true;
    mergeStaticGroup(headGroup);
    avatar.remove(headGroup);
    mergeStaticGroup(avatar);
    avatar.add(headGroup);

    this.buildSettlementGestures(avatar, skinMat, jacketMat, shoeMat);

    // 手边的小筹码，让待机时有一点轻微动作，而不是木头人
    const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 18), goldMat);
    chip.rotation.x = Math.PI / 2;
    chip.position.set(0.225, 0.84, 0.315);
    chip.castShadow = true;
    const chipInset = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.0065, 16), darkMat);
    chipInset.rotation.x = Math.PI / 2;
    chipInset.position.copy(chip.position);
    avatar.add(chip, chipInset);
    this.idleChip = chip;
    this.idleChipInset = chipInset;
    this.idleChipBaseY = chip.position.y;

    // 中/低画质把手和头部一起再合批，少 7~8 个 draw call/人；
    // 代价只是取消幅度极小的头部浮动，换手机帧率和发热。
    if (QUALITY.simplifyRigs) {
      chip.userData.noMerge = true;
      chipInset.userData.noMerge = true;
      this.root.updateMatrixWorld(true);
      mergeStaticGroup(avatar);
      this.simplifiedRig = true;
    }

    this.skinMat = skinMat;
  }

  buildPlate() {
    this.plate = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0.98,
      }),
    );
    this.plate.scale.set(0.64, 0.208, 1);
    this.plate.position.set(0, 1.7, 0.02);
    this.plate.renderOrder = 3;
    this.root.add(this.plate);
    this.setStatus({ stack: this.stack, action: '', tone: 'neutral' });

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowSpriteTexture('rgba(255,207,133,1)'),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.scale.set(1.5, 1.5, 1);
    this.glow.position.set(0, 1.18, 0.02);
    this.root.add(this.glow);
  }

  buildTurnRing(index, count) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.0028, 8, 48),
      new THREE.MeshBasicMaterial({
        color: 0xdfbb78,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    const p = seatPosition(index, count);
    ring.position.set(0, TABLE_Y + 0.002, (p.length() * 0.0 + 0.56));
    this.root.add(ring);
    this.turnRing = ring;
  }

  buildSettlementGestures(avatar, skinMat, jacketMat, shoeMat) {
    this.reactionArms = [];
    this.reactionFeet = [];
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * 0.15, 1.12, 0.11);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.13, 4, 8), jacketMat);
      forearm.position.set(side * 0.035, -0.105, 0.09);
      forearm.rotation.x = -0.9;
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinMat);
      fist.scale.set(1.05, 0.9, 1.1);
      fist.position.set(side * 0.045, -0.19, 0.16);
      group.add(forearm, fist);
      group.visible = false;
      avatar.add(group);
      this.reactionArms.push(group);
    }
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 0.24), shoeMat);
      foot.position.set(side * 0.15, 0.085, 0.37);
      foot.visible = false;
      foot.userData.baseY = foot.position.y;
      avatar.add(foot);
      this.reactionFeet.push(foot);
    }
  }

  async settleReaction(won = true, delay = 0) {
    if (!this.reactionArms?.length) return;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (this.reactionActive) return;
    this.reactionActive = true;
    for (const arm of this.reactionArms) arm.visible = true;
    for (const foot of this.reactionFeet) foot.visible = true;
    const sign = won ? 1 : -1;
    try {
      await animate(1500, (t) => {
        const beat = Math.abs(Math.sin(t * Math.PI * 4));
        this.reactionArms.forEach((arm, index) => {
          arm.rotation.x = -0.25 - beat * 0.75;
          arm.rotation.z = (index === 0 ? -1 : 1) * beat * 0.22;
          arm.position.z = 0.11 + beat * 0.06;
        });
        this.reactionFeet.forEach((foot, index) => {
          const lift = Math.max(0, Math.sin(t * Math.PI * 4 + index * Math.PI));
          foot.position.y = foot.userData.baseY + lift * 0.08;
          foot.rotation.x = -lift * 0.35;
        });
        this.avatarGroup.position.y = (won ? 1 : -1) * beat * 0.022;
        this.headGroup.rotation.x = (won ? -0.12 : 0.22) * beat;
        this.headGroup.rotation.z = sign * beat * 0.05;
      });
    } finally {
      this.reactionActive = false;
      for (const arm of this.reactionArms) { arm.visible = false; arm.rotation.set(0, 0, 0); arm.position.z = 0.11; }
      for (const foot of this.reactionFeet) { foot.visible = false; foot.position.y = foot.userData.baseY; foot.rotation.x = 0; }
      this.avatarGroup.position.y = 0;
      this.headGroup.rotation.x = 0;
    }
  }

  setOutfit(style = {}) {
    if (!this.outfitMats) return;
    if (style.jacket !== undefined) {
      this.outfitMats.jacketMat.color.set(style.jacket);
      this.outfitMats.jacketLightMat.color.set(style.jacket).multiplyScalar(1.35);
    }
    if (style.shirt !== undefined) this.outfitMats.shirtMat.color.set(style.shirt);
  }

  setStatus({ stack = this.stack, action = this.action, tone = this.tone, folded = this.folded } = {}) {
    if (this.plate?.material?.map && stack === this.stack && action === this.action
      && tone === this.tone && folded === this.folded) return;
    this.stack = stack;
    this.action = action;
    this.tone = tone;
    this.folded = folded;
    if (this.plate.material.map) this.plate.material.map.dispose();
    const texture = getNameplateTexture(this.name, Math.max(0, Math.round(stack)), action, tone);
    this.plate.material.map = texture;
    this.plate.material.needsUpdate = true;
    this.plate.material.opacity = folded ? 0.42 : 0.98;
    if (this.idleChip) {
      this.idleChip.visible = !folded;
      if (this.idleChipInset) this.idleChipInset.visible = !folded;
    }
  }

  setStack(stack) {
    if (stack === this.stack) return;
    this.setStatus({ stack });
  }

  setAction(action, tone = 'neutral') {
    this.setStatus({ action, tone });
  }

  setFolded(folded, dim = true) {
    this.setStatus({ folded, action: folded ? '弃牌' : '', tone: folded ? 'fold' : 'neutral' });
    this.setDimmed(Boolean(folded && dim));
  }

  captureDimParts() {
    if (this.dimParts) return;
    this.dimParts = [];
    this.root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = list.map((material) => {
        if (!material || !material.isMeshStandardMaterial) return material;
        const mat = material.clone();
        this.dimParts.push({
          mat,
          color: mat.color.clone(),
          emissive: mat.emissive ? mat.emissive.clone() : null,
          emissiveIntensity: Number(mat.emissiveIntensity) || 0,
        });
        return mat;
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    });
  }

  applyDim(factor) {
    if (!this.dimParts) return;
    const f = clamp(factor, 0, 1);
    this.dimFactor = f;
    for (const part of this.dimParts) {
      part.mat.color.copy(part.color).multiplyScalar(1 - f * 0.72);
      if (part.emissive !== null) {
        part.mat.emissive.copy(part.emissive).multiplyScalar(1 - f * 0.8);
        part.mat.emissiveIntensity = part.emissiveIntensity * (1 - f * 0.8);
      }
      part.mat.needsUpdate = true;
    }
  }

  setDimmed(dim) {
    if (!dim && !this.dimParts) return;
    this.captureDimParts();
    if (!this.dimParts.length) return;
    const target = dim ? 1 : 0;
    if (Math.abs((this.dimFactor || 0) - target) < 0.01) {
      this.applyDim(target);
      return;
    }
    const from = this.dimFactor || 0;
    animate(300, (t) => {
      this.applyDim(from + (target - from) * t);
    });
  }

  setTurn(active) {
    this.turnActive = active;
    this.turnRing.material.opacity = active ? 0.85 : 0;
    if (this.glow) this.glow.material.opacity = active ? 0.22 : 0;
    if (this.plate) this.plate.material.opacity = active ? 1 : (this.folded ? 0.42 : 0.62);
    if (active) {
      animate(280, (t) => {
        this.turnRing.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.3);
      });
    }
  }

  setAttention(active) {
    if (!this.plate) return;
    this.plate.material.opacity = active ? 1 : (this.folded ? 0.42 : 0.62);
  }

  async celebrate(amount) {
    this.setStatus({ action: amount ? `获胜 +${Math.round(amount).toLocaleString('en-US')}` : '获胜', tone: 'win' });
    this.glow.material.opacity = 0;
    await animate(1100, (t) => {
      const pulse = Math.sin(t * Math.PI);
      this.glow.material.opacity = 0.5 * pulse;
      this.avatarGroup.position.y = pulse * 0.035;
    });
    this.glow.material.opacity = 0;
    this.avatarGroup.position.y = 0;
  }

  async shrug() {
    await animate(420, (t) => {
      this.avatarGroup.rotation.z = Math.sin(t * Math.PI) * 0.012;
    });
    this.avatarGroup.rotation.z = 0;
  }

  update(time, camera) {
    const t = time * 0.001;
    if (!this.simplifiedRig && !this.reactionActive) {
      this.headGroup.position.y = this.baseHeadY + Math.sin(t * 1.05 + this.phase) * 0.0026;
      this.headGroup.rotation.z = Math.sin(t * 0.7 + this.phase) * 0.018;
      this.headGroup.rotation.x = Math.sin(t * 0.52 + this.phase) * 0.022;
    }
    // 像骗子酒馆一样，头部跟随玩家镜头左右转向。
    let lookYaw = Math.sin(t * 0.37 + this.phase) * 0.06;
    if (camera && this.headGroup) {
      const headWorld = this.root.localToWorld(new THREE.Vector3(0, 1.4, 0));
      const dx = camera.position.x - headWorld.x;
      const dz = camera.position.z - headWorld.z;
      const worldYaw = Math.atan2(dx, dz);
      let localYaw = worldYaw - this.root.rotation.y;
      while (localYaw > Math.PI) localYaw -= Math.PI * 2;
      while (localYaw < -Math.PI) localYaw += Math.PI * 2;
      lookYaw = clamp(localYaw, -0.7, 0.7);
    }
    this.headGroup.rotation.y += (lookYaw - this.headGroup.rotation.y) * 0.1;
    if (!this.reactionActive) this.avatarGroup.rotation.y = Math.sin(t * 0.27 + this.phase) * 0.012;

    if (this.idleChip) {
      this.idleChip.rotation.z = Math.sin(t * 0.9 + this.phase) * 0.5;
      this.idleChip.position.y = this.idleChipBaseY + Math.sin(t * 1.35 + this.phase) * 0.004;
      if (this.idleChipInset) {
        this.idleChipInset.rotation.z = this.idleChip.rotation.z;
        this.idleChipInset.position.y = this.idleChip.position.y;
      }
    }

    if (this.eyes?.length) {
      const cycle = (time + this.blinkSeed) % 5400;
      const blink = cycle > 5210 ? 0.12 : 1;
      this.eyes.forEach((eye) => { eye.scale.y = blink; });
    }

    if (this.turnActive) {
      this.turnRing.material.opacity = 0.55 + Math.sin(t * 3.2) * 0.3;
      const s = 1 + Math.sin(t * 2.1) * 0.08;
      this.turnRing.scale.setScalar(s);
    }
  }

  destroy() {
    this.root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) material?.dispose?.();
    });
    this.plate.material.map?.dispose();
    this.plate.material.dispose();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
    this.turnRing.geometry.dispose();
    this.turnRing.material.dispose();
    this.scene.remove(this.root);
  }
}

export function createPlayerRigs(scene, players) {
  return players.map((p, i) => {
    if (i === 0) return null;
    return new PlayerRig(scene, p, i, players.length);
  });
}
