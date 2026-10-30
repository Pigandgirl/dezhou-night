import * as THREE from 'three';

export const TABLE_Y = 0.78;
export const FELT = { rx: 1.18, rz: 0.62 };
export const RAIL = { rx: 1.31, rz: 0.735 };
export const SEAT = { rx: 1.62, rz: 1.03 };

export const HERO_SEAT = 0;
export const HERO_CAM = new THREE.Vector3(0, 1.3, 1.22);
export const HERO_TARGET = new THREE.Vector3(0, 0.7, -0.55);
export const HERO_FOV = 62;
// 大厅与牌局同一机位方向、同一 FOV：进入牌局只是一次短距离前推
export const LOBBY_CAM = new THREE.Vector3(0, 1.5, 2.62);
export const LOBBY_TARGET = new THREE.Vector3(0, 0.7, -0.55);
export const LOBBY_FOV = 62;

export function seatAngle(index, count) {
  return Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, count);
}

export function seatPosition(index, count, y = 0) {
  const a = seatAngle(index, count);
  return new THREE.Vector3(SEAT.rx * Math.cos(a), y, SEAT.rz * Math.sin(a));
}

export function seatTangent(index, count) {
  const a = seatAngle(index, count);
  return new THREE.Vector2(-FELT.rx * Math.sin(a), FELT.rz * Math.cos(a)).normalize();
}

export function seatFaceYaw(index, count) {
  const p = seatPosition(index, count);
  return Math.atan2(-p.x, -p.z);
}

export function cardYaw(index, count) {
  const p = seatPosition(index, count);
  return Math.atan2(p.x, p.z);
}

export function holeCardSpots(index, count, tableY, heroSeat = HERO_SEAT) {
  const p = seatPosition(index, count);
  const isHero = index === heroSeat;
  const factor = isHero ? 0.34 : 0.43;
  const inner = new THREE.Vector3(p.x * factor, tableY + 0.002, p.z * factor);
  const t = seatTangent(index, count);
  const gap = isHero ? 0.063 : 0.062;
  return [
    new THREE.Vector3(inner.x - t.x * gap, inner.y, inner.z - t.y * gap),
    new THREE.Vector3(inner.x + t.x * gap, inner.y, inner.z + t.y * gap),
  ];
}

export function holeCardCenter(index, count, tableY, heroSeat = HERO_SEAT) {
  const p = seatPosition(index, count);
  const factor = index === heroSeat ? 0.34 : 0.43;
  return new THREE.Vector3(p.x * factor, tableY, p.z * factor);
}

function rotateHeroSpot(spot, index, count) {
  const delta = seatAngle(index, count) - Math.PI / 2;
  return spot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), delta);
}

export function betSpot(index, count, tableY, heroSeat = HERO_SEAT) {
  const p = seatPosition(index, count);
  const t = seatTangent(index, count);
  if (index === heroSeat) {
    return rotateHeroSpot(new THREE.Vector3(-0.3, tableY + 0.001, 0.25), index, count);
  }
  return new THREE.Vector3(
    p.x * 0.4 + t.x * 0.16,
    tableY + 0.001,
    p.z * 0.4 + t.y * 0.16,
  );
}

export function stackSpot(index, count, tableY, heroSeat = HERO_SEAT) {
  const p = seatPosition(index, count);
  const t = seatTangent(index, count);
  if (index === heroSeat) {
    return rotateHeroSpot(new THREE.Vector3(0.62, tableY + 0.002, 0.38), index, count);
  }
  return new THREE.Vector3(
    p.x * 0.72 - t.x * 0.15,
    tableY + 0.002,
    p.z * 0.72 - t.y * 0.15,
  );
}

export function communitySpots(tableY) {
  const spots = [];
  for (let i = 0; i < 5; i += 1) {
    spots.push(new THREE.Vector3((i - 2) * 0.118, tableY + 0.002, -0.06));
  }
  return spots;
}

export function dealerButtonSpot(index, count, tableY) {
  const p = seatPosition(index, count);
  return new THREE.Vector3(p.x * 0.66, tableY, p.z * 0.66);
}

// Keep the pot in front of the community cards (z=-0.06) and behind the
// hero's hole cards (z≈0.35). The old z=-0.235 put the pot behind the board;
// its label was projected under the board-rail HUD and covered by the cards.
export const POT_SPOT = new THREE.Vector3(0, TABLE_Y + 0.002, 0.3);
export const DEAL_SPOT = new THREE.Vector3(0.02, TABLE_Y + 0.02, -0.16);
export const HERO_STACK_SPOT = new THREE.Vector3(0.62, TABLE_Y + 0.002, 0.38);
export const HERO_GLASS_SPOT = new THREE.Vector3(-0.62, TABLE_Y + 0.002, 0.4);
