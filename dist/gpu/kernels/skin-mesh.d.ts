import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
/** Maximum number of bone influences per vertex (GPU kernel matches this). */
export declare const MAX_INFLUENCES = 4;
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
export declare function buildInfluences(canonical: CanonicalHuman, bones: BoneDef[]): SkinInfluences;
/**
 * CPU skinning reference. Transforms base positions by the weighted average of
 * their bone skin matrices. `boneMatrices` is `numBones*16` floats; index order
 * matches `influences.indices`. Output is a Float32Array of positions.
 */
export declare function skinMeshCPU(basePositions: Float32Array, influences: SkinInfluences, boneMatrices: Float32Array): Float32Array;
/**
 * CPU skinning reference for normals: transforms each base normal by the
 * weighted rotation (upper 3x3) of its bone skin matrices and renormalizes.
 * Matrices are rigid (rotation+translation), so the 3x3 is the correct normal
 * transform. Output is a Float32Array of normals.
 */
export declare function skinNormalsCPU(baseNormals: Float32Array, influences: SkinInfluences, boneMatrices: Float32Array): Float32Array;
/**
 * Convenience: re-normalize a loosely-authored weights map (e.g. region weights)
 * so the vertex influences sum to 1 (defensive; buildInfluences already does).
 */
export declare function normalizeWeights(w: Record<string, number>): Record<string, number>;
//# sourceMappingURL=skin-mesh.d.ts.map