import type { Vec3 } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
/**
 * look-at — FK-verified gaze aiming across a bone chain.
 *
 * The compiler's original `solveLookAt` computed yaw/pitch from *rest* positions
 * and wrote fixed 60/40 neck/head splits, so the actual gaze direction after
 * skinning was never measured and any parent rotation (a torso twist, a walk
 * cycle) silently broke it. This solver drives the chain through real forward
 * kinematics: each bone is aimed at the target in its own parent space, weighted
 * along the chain, clamped to authored joint limits, and then the resulting gaze
 * direction is *re-measured* with FK so callers get a real angular error.
 *
 * Deterministic and additive: it consumes a base pose set (whatever the motion
 * runtime produced this frame) and returns that set with the gaze chain merged in.
 */
export interface LookAtOptions {
    /** World-space point to look at. */
    target: Vec3;
    /** Chain to distribute the gaze across, root-first. Defaults to neck -> head. */
    chain?: BoneName[];
    /** Per-bone share of the total rotation, root-first. Normalized if it doesn't sum to 1. */
    weights?: number[];
    /** Maximum total deviation from the rest forward direction, in degrees. */
    maxAngleDeg?: number;
    /** 0..1 blend of the gaze over the base pose (0 = base pose untouched). */
    intensity?: number;
    /** Local-space forward axis of the gaze bone. Defaults to +Z. */
    forwardAxis?: Vec3;
    /** Solver refinement passes (FK re-measure between passes). */
    passes?: number;
    /** Respect authored joint limits (default true). */
    respectLimits?: boolean;
    basePoses?: readonly BonePose[];
}
export interface LookAtResult {
    poses: BonePose[];
    mergedPoses: BonePose[];
    /** FK-measured angle between the gaze bone's forward axis and the target, in degrees. */
    angleErrorDeg: number;
    /** True when the target sat outside `maxAngleDeg` and the gaze was clamped. */
    clamped: boolean;
    /** Requested deviation from rest forward, in degrees (pre-clamp). */
    requestedAngleDeg: number;
    chain: BoneName[];
    passes: number;
    /** FK world position of the gaze (last chain) bone. */
    gazeOrigin: Vec3;
}
export declare function solveLookAtChain(skeleton: BoneDef[], options: LookAtOptions): LookAtResult;
/** FK-measured angle between a bone's forward axis and the direction to `target`. */
export declare function measureGazeError(skeleton: BoneDef[], poses: readonly BonePose[], bone: BoneName | undefined, forwardAxis: Vec3, target: Vec3): number;
export declare function worldPointFromBone(skeleton: BoneDef[], poses: readonly BonePose[], bone: BoneName, localOffset: Vec3): Vec3 | null;
//# sourceMappingURL=look-at.d.ts.map