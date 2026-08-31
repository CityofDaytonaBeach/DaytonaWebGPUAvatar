import { CanonicalHuman } from "../../geometry/canonical/canonical-human";
import { BoneDef } from "../../anatomy/skeleton/skeleton";

/** Maximum number of bone influences per vertex (GPU kernel matches this). */
export const MAX_INFLUENCES = 4;

export interface SkinInfluences {
  /** Per vertex: MAX_INFLUENCES bone indices (into the skeleton order). */
  indices: Uint16Array;
  /** Per vertex: MAX_INFLUENCES weights (normalized, sum ~1 over included). */
  weights: Float32Array;
}

/**
 * Build a compact per-vertex influence list from the canonical mesh's region
 * weights. Each vertex contributes up to MAX_INFLUENCES bones; weights are
 * normalized to 1. Bones are indexed by position in `bones` (skeleton order),
 * which matches `combinedSkinMatrices`.
 */
export function buildInfluences(
  canonical: CanonicalHuman,
  bones: BoneDef[]
): SkinInfluences {
  const indexByName = new Map<string, number>();
  bones.forEach((b, i) => indexByName.set(b.name, i));
  const n = canonical.vertexCount;
  const indices = new Uint16Array(n * MAX_INFLUENCES);
  const weights = new Float32Array(n * MAX_INFLUENCES);

  for (let v = 0; v < n; v++) {
    const wmap = canonical.vertices[v].weights;
    // Collect (index, weight) for every referenced bone, keep only those with a
    // valid skeleton index.
    const entries: Array<[number, number]> = [];
    for (const [name, w] of Object.entries(wmap)) {
      const idx = indexByName.get(name);
      if (idx === undefined || w <= 0) continue;
      entries.push([idx, w]);
    }
    entries.sort((a, b) => b[1] - a[1]);
    const used = entries.slice(0, MAX_INFLUENCES);
    // Normalize.
    let sum = 0;
    for (const [, w] of used) sum += w;
    const inv = sum > 0 ? 1 / sum : 0;
    for (let k = 0; k < MAX_INFLUENCES; k++) {
      const base = v * MAX_INFLUENCES + k;
      if (k < used.length) {
        indices[base] = used[k][0];
        weights[base] = used[k][1] * inv;
      } else {
        indices[base] = 0;
        weights[base] = 0;
      }
    }
  }
  return { indices, weights };
}

/**
 * CPU skinning reference. Transforms base positions by the weighted average of
 * their bone skin matrices. `boneMatrices` is `numBones*16` floats; index order
 * matches `influences.indices`. Output is a Float32Array of positions.
 */
export function skinMeshCPU(
  basePositions: Float32Array,
  influences: SkinInfluences,
  boneMatrices: Float32Array
): Float32Array {
  const n = basePositions.length / 3;
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const px = basePositions[v * 3 + 0];
    const py = basePositions[v * 3 + 1];
    const pz = basePositions[v * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < MAX_INFLUENCES; k++) {
      const w = influences.weights[v * MAX_INFLUENCES + k];
      if (w === 0) continue;
      const bi = influences.indices[v * MAX_INFLUENCES + k] * 16;
      const m = boneMatrices;
      // Column-major mat4 applied to (x,y,z,1).
      const sx = m[bi + 0] * px + m[bi + 4] * py + m[bi + 8] * pz + m[bi + 12];
      const sy = m[bi + 1] * px + m[bi + 5] * py + m[bi + 9] * pz + m[bi + 13];
      const sz = m[bi + 2] * px + m[bi + 6] * py + m[bi + 10] * pz + m[bi + 14];
      x += w * sx;
      y += w * sy;
      z += w * sz;
    }
    out[v * 3 + 0] = x;
    out[v * 3 + 1] = y;
    out[v * 3 + 2] = z;
  }
  return out;
}

/**
 * CPU skinning reference for normals: transforms each base normal by the
 * weighted rotation (upper 3x3) of its bone skin matrices and renormalizes.
 * Matrices are rigid (rotation+translation), so the 3x3 is the correct normal
 * transform. Output is a Float32Array of normals.
 */
export function skinNormalsCPU(
  baseNormals: Float32Array,
  influences: SkinInfluences,
  boneMatrices: Float32Array
): Float32Array {
  const n = baseNormals.length / 3;
  const out = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    const nx = baseNormals[v * 3 + 0];
    const ny = baseNormals[v * 3 + 1];
    const nz = baseNormals[v * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < MAX_INFLUENCES; k++) {
      const w = influences.weights[v * MAX_INFLUENCES + k];
      if (w === 0) continue;
      const bi = influences.indices[v * MAX_INFLUENCES + k] * 16;
      const m = boneMatrices;
      const sx = m[bi + 0] * nx + m[bi + 4] * ny + m[bi + 8] * nz;
      const sy = m[bi + 1] * nx + m[bi + 5] * ny + m[bi + 9] * nz;
      const sz = m[bi + 2] * nx + m[bi + 6] * ny + m[bi + 10] * nz;
      x += w * sx; y += w * sy; z += w * sz;
    }
    const len = Math.hypot(x, y, z) || 1;
    out[v * 3 + 0] = x / len;
    out[v * 3 + 1] = y / len;
    out[v * 3 + 2] = z / len;
  }
  return out;
}

/**
 * Convenience: re-normalize a loosely-authored weights map (e.g. region weights)
 * so the vertex influences sum to 1 (defensive; buildInfluences already does).
 */
export function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const k of Object.keys(w)) sum += w[k];
  if (sum === 0) return w;
  for (const k of Object.keys(w)) out[k] = w[k] / sum;
  return out;
}
