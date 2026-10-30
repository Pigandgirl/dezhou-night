import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 将容器内材质相同的静态 Mesh 合并，显著降低 draw call。
 * 合并结果仍挂在原容器下，容器的显隐与变换保持不变。
 * 传入的 mesh 可通过 userData.noMerge = true 排除（例如需要单独动画的眼睛）。
 */
export function mergeStaticGroup(container) {
  if (!container) return;
  container.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(container.matrixWorld).invert();

  const meshes = [];
  container.traverse((obj) => {
    if (obj.isMesh && !Array.isArray(obj.material) && !obj.userData.noMerge) {
      meshes.push(obj);
    }
  });
  if (meshes.length < 2) return;

  const buckets = new Map();
  for (const mesh of meshes) {
    const key = mesh.material.uuid;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mesh.material, entries: [] };
      buckets.set(key, bucket);
    }
    bucket.entries.push(mesh);
  }

  for (const bucket of buckets.values()) {
    if (bucket.entries.length < 2) continue;
    const geometries = [];
    for (const mesh of bucket.entries) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      geometries.push(geo);
    }
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geo) => geo.dispose());
    if (!merged) continue;

    for (const mesh of bucket.entries) {
      if (mesh.parent) mesh.parent.remove(mesh);
    }
    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.castShadow = bucket.entries.some((mesh) => mesh.castShadow);
    mergedMesh.receiveShadow = bucket.entries.some((mesh) => mesh.receiveShadow);
    container.add(mergedMesh);
  }

  const prune = (node) => {
    for (const child of node.children.slice()) prune(child);
    if (node !== container && node.isGroup && node.children.length === 0) {
      if (node.parent) node.parent.remove(node);
    }
  };
  prune(container);
}
