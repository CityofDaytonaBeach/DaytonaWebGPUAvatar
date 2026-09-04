import type { Vec3, Quat } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from './skeleton.js';
import type { CanonicalHuman, RegionName } from '../../geometry/canonical/canonical-human.js';
/**
 * Phase C — skeleton adaptation.
 *
 * The shape space (`HumanShapeSpace`) deforms canonical vertices, but the rig is
 * placed from `AnatomyDimensions`, so any identity expressed purely as shape
 * coefficients (a longer jaw, wider shoulders, a taller torso) leaves the joints
 * behind and the character deforms incorrectly once it moves.
 *
 * This module re-derives joint positions *from the deformed mesh itself*:
 * each joint declares the semantic regions that anatomically define it and how
 * to read a position out of them (centroid / proximal end / distal end). The
 * result is converted back into parent-local offsets so the existing
 * FK + skinning path (`buildBoneMatrices`, `combinedSkinMatrices`) is unchanged
 * and the rest pose still produces identity skin matrices.
 *
 * Everything here is deterministic: no randomness, no iteration order
 * dependence, same input mesh -> same skeleton.
 */
export type JointAnchorMode = 'centroid' | 'proximal' | 'distal' | 'front';
export interface JointAnchor {
    bone: BoneName;
    /** Candidate regions, in priority order (first non-empty one wins). */
    regions: RegionName[];
    mode: JointAnchorMode;
    /** How strongly the mesh anchor replaces the rest joint (0..1). */
    weight: number;
}
/**
 * Anatomical anchors. `proximal` = closest to the body core along the limb
 * (max Y for legs/arms in T-pose), `distal` = far end.
 */
export declare const JOINT_ANCHORS: JointAnchor[];
/** Left/right bone pairs used for symmetry enforcement. */
export declare const SYMMETRIC_BONE_PAIRS: Array<[BoneName, BoneName]>;
export interface SkeletonAdaptationOptions {
    /** Maximum world-space displacement allowed per joint, in metres. */
    maxJointShift?: number;
    /** Mirror L/R joints so a non-symmetric mesh cannot skew the rig. */
    enforceSymmetry?: boolean;
    /** Override the default anchor table. */
    anchors?: JointAnchor[];
}
export interface JointAdaptation {
    bone: BoneName;
    restWorld: Vec3;
    adaptedWorld: Vec3;
    shift: number;
    source: 'mesh' | 'rest';
    clamped: boolean;
    /** Region the anchor was read from, when any. */
    region: RegionName | null;
    vertexCount: number;
}
export interface SkeletonAdaptationReport {
    joints: JointAdaptation[];
    adaptedJoints: number;
    maxShift: number;
    meanShift: number;
    clampedJoints: number;
    symmetryEnforced: boolean;
}
/** Rotate a vector by a quaternion (v' = q v q*). */
export declare function rotateVec3(q: Quat, v: Vec3): Vec3;
/** World-space joint positions of a rest skeleton (rest rotations included). */
export declare function boneWorldPositions(bones: BoneDef[]): Map<BoneName, Vec3>;
/**
 * Vertex ids belonging to a region. Regions may be non-contiguous, so the
 * per-vertex tag is authoritative; `regionRanges` is only a fallback for coarse
 * aliases synthesized over fine sub-regions.
 */
export declare function regionVertexIds(mesh: CanonicalHuman, region: RegionName): number[];
/**
 * Re-place a rest skeleton onto deformed canonical positions.
 *
 * `positions` is a flat xyz array (vertexCount * 3) — normally
 * `deformedPositions(base, shapeSpace.evaluate())`. The returned bones are new
 * objects; the input skeleton is never mutated.
 */
export declare function adaptSkeletonToPositions(bones: BoneDef[], mesh: CanonicalHuman, positions: Float32Array, options?: SkeletonAdaptationOptions): {
    bones: BoneDef[];
    report: SkeletonAdaptationReport;
};
/** Human-readable adaptation summary (deterministic, for diagnostics/CI). */
export declare function skeletonAdaptationReportLines(report: SkeletonAdaptationReport): string[];
//# sourceMappingURL=skeleton-adaptation.d.ts.map