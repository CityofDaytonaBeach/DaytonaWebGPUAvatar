import type { Vec3 } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from './skeleton.js';
import type { CanonicalHuman, RegionName } from '../../geometry/canonical/canonical-human.js';
/**
 * Phase C — skin weight (re)binding.
 *
 * After the skeleton is adapted to a deformed shape, the vertex->bone binding
 * has to follow: a vertex that now sits below the re-placed knee must be driven
 * by the shin, not the thigh. This solver derives weights deterministically from
 * bone *segments* (parent joint -> child joint) using an inverse-distance
 * falloff, with a semantic-region prior so anatomically unambiguous vertices
 * (a hand vertex, an eye vertex) always keep their correct dominant bone.
 *
 * Properties guaranteed by construction:
 *  - weights per vertex sum to 1 (within 1e-6)
 *  - at most `maxInfluences` bones per vertex (default 4, GPU-friendly)
 *  - no vertex is left unweighted
 *  - deterministic: fixed iteration order, ties broken by bone order
 */
export interface BoneSegment {
    bone: BoneName;
    a: Vec3;
    b: Vec3;
    length: number;
}
export type SkinWeightSet = Map<number, Record<string, number>>;
export interface SkinWeightOptions {
    /** Max bones per vertex (GPU skinning budget). */
    maxInfluences?: number;
    /** Inverse-distance exponent; higher = tighter, more rigid binding. */
    falloff?: number;
    /** Multiplier applied to the bone implied by the vertex's semantic region. */
    regionBoost?: number;
    /** Drop influences below this share of the vertex total before normalizing. */
    pruneBelow?: number;
}
export interface SkinWeightReport {
    vertices: number;
    bonesUsed: number;
    maxInfluences: number;
    meanInfluences: number;
    unweightedVertices: number;
    weightSumErrors: number;
    regionPinnedVertices: number;
}
/** Semantic region -> the bone that must dominate vertices in that region. */
export declare const REGION_BONE_PRIOR: Partial<Record<RegionName, BoneName>>;
/**
 * Bone segments for weighting: each bone owns the segment(s) reaching to its
 * children; leaf bones get a short stub continuing the parent direction so
 * hands/feet/jaw still capture their own vertices.
 */
export declare function buildBoneSegments(bones: BoneDef[]): BoneSegment[];
/** Shortest distance from a point to a finite segment. */
export declare function distanceToSegment(p: Vec3, s: BoneSegment): number;
/**
 * Solve skin weights for a deformed mesh against an adapted skeleton.
 *
 * `positions` defaults to the mesh's own base positions; pass deformed
 * positions when rebinding after a shape-space evaluation.
 */
export declare function solveSkinWeights(mesh: CanonicalHuman, bones: BoneDef[], positions?: Float32Array, options?: SkinWeightOptions): {
    weights: SkinWeightSet;
    report: SkinWeightReport;
};
/** Write solved weights onto the mesh vertices (in place). Returns count. */
export declare function applySkinWeights(mesh: CanonicalHuman, weights: SkinWeightSet): number;
export interface SkinWeightValidation {
    ok: boolean;
    issues: string[];
    unknownBones: string[];
    overBudgetVertices: number;
    badSumVertices: number;
    missingVertices: number;
}
/** Validate a weight set against a skeleton (used by tests and diagnostics). */
export declare function validateSkinWeights(mesh: CanonicalHuman, bones: BoneDef[], weights: SkinWeightSet, maxInfluences?: number): SkinWeightValidation;
//# sourceMappingURL=skin-weight-solver.d.ts.map