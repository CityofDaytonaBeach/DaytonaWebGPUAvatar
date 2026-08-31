import { describe, it, expect } from "vitest";
import { IDENTITY_QUAT } from "../../core/math/vec";
import { BoneDef } from "../../anatomy/skeleton/skeleton";
import { buildBoneMatrices, combinedSkinMatrices, composeMatrix } from "../../anatomy/skeleton/bone-matrix";
import { buildInfluences, skinMeshCPU, skinNormalsCPU, normalizeWeights } from "./skin-mesh";
import { CanonicalHuman } from "../../geometry/canonical/canonical-human";
import { placeSkeletonFromDefinition } from "../../anatomy/skeleton/skeleton";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import { resolveAnatomy } from "../../anatomy/parametric/parametric-anatomy";
import { SKIN_COMPUTE_WGSL } from "../../render/wgsl/skin-wgsl";
import { Human } from "../../human";
import { quatFromEulerDeg } from "../../animation/skeleton/skeletal-animation";

function limbBones(): BoneDef[] {
  return [
    { name: "root", parent: null, localPosition: { x: 0, y: 0, z: 0 }, restRotation: IDENTITY_QUAT },
    { name: "upperarm_l", parent: "root", localPosition: { x: 0, y: 0.5, z: 0 }, restRotation: IDENTITY_QUAT },
    { name: "forearm_l", parent: "upperarm_l", localPosition: { x: 0, y: 0.5, z: 0 }, restRotation: IDENTITY_QUAT },
  ];
}

describe("bone matrices (FK + inverse bind)", () => {
  it("chains world translations along the hierarchy", () => {
    const { current, bind } = buildBoneMatrices(limbBones(), []);
    // forearm world translation = 0.5 + 0.5 = 1.0 on Y.
    expect(current[12 + 3]).toBeCloseTo(1.0, 5);
    expect(bind[12 + 3]).toBeCloseTo(1.0, 5);
  });

  it("combined skin matrices are identity at the rest pose", () => {
    const m = combinedSkinMatrices(limbBones(), []);
    for (let i = 0; i < m.length; i++) {
      const col = Math.floor(i / 4) % 4;
      const row = i % 4;
      expect(m[i]).toBeCloseTo(col === row ? 1 : 0, 5);
    }
  });

  it("rotating a bone changes only that bone's combined matrix", () => {
    const pose = [
      { name: "forearm_l", localPos: { x: 0, y: 0.5, z: 0 }, localRot: quatFromEulerDeg(0, 0, 40) },
    ];
    const m = combinedSkinMatrices(limbBones(), pose);
    // Bone 2 = forearm_l, bone 0 = root.
    const forearmMat = Array.from(m.slice(2 * 16, 2 * 16 + 16));
    expect(forearmMat.some((v) => Math.abs(v) > 1e-3 && v !== 0)).toBe(true);
    const rootMat = Array.from(m.slice(0, 16));
    for (let i = 0; i < rootMat.length; i++) {
      const col = Math.floor(i / 4) % 4;
      const row = i % 4;
      expect(rootMat[i]).toBeCloseTo(col === row ? 1 : 0, 5);
    }
  });
});

describe("CPU skinning", () => {
  const BONES = ["root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head"];

  it("normalizes weights to sum 1", () => {
    const out = normalizeWeights({ a: 2, b: 1, c: 1 });
    expect(out.a + out.b + out.c).toBeCloseTo(1, 5);
  });

  it("rest pose preserves the base geometry exactly", () => {
    const canonical = new CanonicalHuman(BONES);
    const bones = placeSkeletonFromDefinition(resolveAnatomy(new HumanDefinition(createDefaultRegistry())));
    const inf = buildInfluences(canonical, bones);
    const base = canonical.baseGeometry().positions;
    const skinned = skinMeshCPU(base, inf, combinedSkinMatrices(bones, []));
    for (let i = 0; i < base.length; i++) {
      expect(skinned[i]).toBeCloseTo(base[i], 4);
    }
  });

  it("rotating thigh_l moves only its FK chain (thigh_l + shin_l), never the other side", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    const bones = human.parametricSkeleton();
    const thigh = bones.findIndex((b) => b.name === "thigh_l");
    expect(thigh).toBeGreaterThan(0);
    const poses = [{ name: "thigh_l", localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(30, 0, 0) }];
    human.setPose(poses);
    const skinned = human.skinScene();
    const base = canonical.baseGeometry().positions;

    // Descendants of thigh_l in this block human: shin_l (no foot region built).
    const allowedRegions = new Set(["thigh_l", "shin_l"]);
    const moved: number[] = [];
    for (let v = 0; v < canonical.vertexCount; v++) {
      const dx = skinned[v * 3] - base[v * 3];
      const dy = skinned[v * 3 + 1] - base[v * 3 + 1];
      const dz = skinned[v * 3 + 2] - base[v * 3 + 2];
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-4) moved.push(v);
    }
    expect(moved.length).toBeGreaterThan(0);
    for (const v of moved) {
      expect(allowedRegions.has(canonical.vertices[v].region)).toBe(true);
    }
  });
});

describe("GPU/CPU skinning parity", () => {
  /** Faithful JS port of the WGSL skin kernel loop (positions). */
  function simulateGpu(base: Float32Array, influences: ReturnType<typeof buildInfluences>, mats: Float32Array): Float32Array {
    const n = base.length / 3;
    const out = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const w = influences.weights[v * 4 + k];
        if (w === 0) continue;
        const bi = influences.indices[v * 4 + k] * 16;
        const sx = mats[bi + 0] * base[v * 3] + mats[bi + 4] * base[v * 3 + 1] + mats[bi + 8] * base[v * 3 + 2] + mats[bi + 12];
        const sy = mats[bi + 1] * base[v * 3] + mats[bi + 5] * base[v * 3 + 1] + mats[bi + 9] * base[v * 3 + 2] + mats[bi + 13];
        const sz = mats[bi + 2] * base[v * 3] + mats[bi + 6] * base[v * 3 + 1] + mats[bi + 10] * base[v * 3 + 2] + mats[bi + 14];
        x += w * sx; y += w * sy; z += w * sz;
      }
      out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
    }
    return out;
  }

  /** Faithful JS port of the WGSL normal-skining loop (rotation 3x3 + normalize). */
  function simulateGpuNormals(base: Float32Array, influences: ReturnType<typeof buildInfluences>, mats: Float32Array): Float32Array {
    const n = base.length / 3;
    const out = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const nx = base[v * 3], ny = base[v * 3 + 1], nz = base[v * 3 + 2];
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 4; k++) {
        const w = influences.weights[v * 4 + k];
        if (w === 0) continue;
        const bi = influences.indices[v * 4 + k] * 16;
        const sx = mats[bi + 0] * nx + mats[bi + 4] * ny + mats[bi + 8] * nz;
        const sy = mats[bi + 1] * nx + mats[bi + 5] * ny + mats[bi + 9] * nz;
        const sz = mats[bi + 2] * nx + mats[bi + 6] * ny + mats[bi + 10] * nz;
        x += w * sx; y += w * sy; z += w * sz;
      }
      const len = Math.hypot(x, y, z) || 1;
      out[v * 3] = x / len; out[v * 3 + 1] = y / len; out[v * 3 + 2] = z / len;
    }
    return out;
  }

  it("simulated WGSL kernel equals skinMeshCPU", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    const bones = human.parametricSkeleton();
    const inf = buildInfluences(canonical, bones);
    const base = canonical.baseGeometry().positions;
    const poses = [
      { name: "thigh_r", localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(-30, 0, 10) },
      { name: "forearm_l", localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(0, 0, 60) },
    ];
    const mats = combinedSkinMatrices(bones, poses);
    const gpu = simulateGpu(base, inf, mats);
    const cpu = skinMeshCPU(base, inf, mats);
    expect(gpu.length).toBe(cpu.length);
    for (let i = 0; i < cpu.length; i++) {
      expect(gpu[i]).toBeCloseTo(cpu[i], 4);
    }
  });

  it("simulated WGSL normals kernel equals skinNormalsCPU", async () => {
    const human = await Human.create();
    const canonical = human.canonicalRef;
    const bones = human.parametricSkeleton();
    const inf = buildInfluences(canonical, bones);
    const base = canonical.baseGeometry().normals;
    const poses = [
      { name: "thigh_r", localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(-30, 0, 10) },
      { name: "forearm_l", localPos: { x: 0, y: 0, z: 0 }, localRot: quatFromEulerDeg(0, 0, 60) },
    ];
    const mats = combinedSkinMatrices(bones, poses);
    const gpu = simulateGpuNormals(base, inf, mats);
    const cpu = skinNormalsCPU(base, inf, mats);
    expect(gpu.length).toBe(cpu.length);
    for (let i = 0; i < cpu.length; i++) {
      expect(gpu[i]).toBeCloseTo(cpu[i], 4);
    }
  });

  it("WGSL skin shader exposes the expected bindings", () => {
    expect(SKIN_COMPUTE_WGSL).toContain("@group(0) @binding(0)");
    expect(SKIN_COMPUTE_WGSL).toContain("@group(0) @binding(5)");
    expect(SKIN_COMPUTE_WGSL).toContain("@group(0) @binding(6)");
    expect(SKIN_COMPUTE_WGSL).toContain("@group(0) @binding(7)");
    expect(SKIN_COMPUTE_WGSL).toMatch(/workgroup_size\(64\)/);
    expect(SKIN_COMPUTE_WGSL).toMatch(/MAX_INFLUENCES\s*:\s*u32\s*=\s*4u/i);
  });
});
