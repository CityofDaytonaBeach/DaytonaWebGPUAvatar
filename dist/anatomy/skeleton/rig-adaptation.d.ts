import type { BoneDef } from './skeleton.js';
import type { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { HumanShapeSpace } from '../shape-space/human-shape-space.js';
import { boneWorldPositions, type SkeletonAdaptationOptions, type SkeletonAdaptationReport } from './skeleton-adaptation.js';
import { type SkinWeightOptions, type SkinWeightReport, type SkinWeightSet, type SkinWeightValidation } from './skin-weight-solver.js';
/**
 * Phase C — rig adaptation.
 *
 * Single entry point that makes the shape space *movable*: given a canonical
 * base mesh, its rest skeleton, and a set of shape coefficients, it produces
 *
 *   1. deformed vertex positions (linear shape space evaluation),
 *   2. a skeleton re-registered to those positions,
 *   3. skin weights rebound to that skeleton, and
 *   4. a validation report (bind-pose stability, weight budget, joint shifts).
 *
 * The existing FK/skinning path is untouched: the adapted skeleton is an
 * ordinary `BoneDef[]`, so `buildBoneMatrices`/`combinedSkinMatrices`,
 * `SkeletalAnimation`, and the GPU skinning pipeline consume it unchanged.
 */
export interface RigAdaptationOptions extends SkeletonAdaptationOptions {
    weights?: SkinWeightOptions;
    /** Skip weight rebinding (skeleton-only adaptation). */
    skipWeights?: boolean;
    /** Write the solved weights onto the mesh vertices. */
    applyToMesh?: boolean;
}
export interface RigAdaptationResult {
    bones: BoneDef[];
    positions: Float32Array;
    weights: SkinWeightSet | null;
    skeleton: SkeletonAdaptationReport;
    skinning: SkinWeightReport | null;
    validation: SkinWeightValidation | null;
    /** Rest pose still yields identity skin matrices (no drift at bind time). */
    bindPoseStable: boolean;
    maxBindError: number;
}
/** Apply a flat xyz delta array to a base mesh, producing world positions. */
export declare function deformedPositions(base: CanonicalHuman, delta?: Float32Array): Float32Array;
/**
 * Bind-pose check: at the rest pose every combined skin matrix must be the
 * identity, otherwise the adapted skeleton would shift the mesh the moment
 * skinning is enabled.
 */
export declare function bindPoseError(bones: BoneDef[]): number;
export declare class RigAdapter {
    readonly base: CanonicalHuman;
    readonly restBones: BoneDef[];
    private readonly options;
    constructor(base: CanonicalHuman, restBones: BoneDef[], options?: RigAdaptationOptions);
    /** Rest joint positions in world space (diagnostics / comparisons). */
    restWorld(): ReturnType<typeof boneWorldPositions>;
    /** Adapt against an explicit deformation delta (vertexCount * 3 floats). */
    adaptToDelta(delta?: Float32Array): RigAdaptationResult;
    /** Adapt against the current coefficients of a shape space. */
    adaptToShapeSpace(space: HumanShapeSpace): RigAdaptationResult;
    /** Adapt against already-deformed positions. */
    adaptToPositions(positions: Float32Array): RigAdaptationResult;
    /** Deterministic textual report for CI/diagnostics. */
    static describe(result: RigAdaptationResult): string[];
}
//# sourceMappingURL=rig-adaptation.d.ts.map