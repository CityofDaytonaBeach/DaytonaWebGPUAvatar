import type { Vec3 } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
/**
 * ik-solver — FK-verified inverse kinematics for arbitrary-length bone chains.
 *
 * The previous `solveIK2Bone` produced a plausible-looking two-bone pose but
 * nothing could check it: there was no forward-kinematics evaluator, so "did the
 * hand reach the target?" was unanswerable. That is why `motionCompiler` stayed
 * PROTOTYPE. This solver closes the loop:
 *
 *   1. FABRIK (position-space, backward/forward reaching) moves the chain's joint
 *      positions onto the target while preserving each segment's rest length.
 *   2. An optional pole vector rotates the interior joints about the root→target
 *      axis so elbows/knees bend in a chosen direction instead of arbitrarily.
 *   3. Positions are converted back into *local* bone rotations through the same
 *      FK convention the renderer/skinning path uses, then clamped to the bone's
 *      authored joint limits.
 *   4. Because clamping can pull the effector off-target, the whole thing runs as
 *      an outer loop and the final result is measured with real FK — the returned
 *      `error`/`reached` come from the evaluated skeleton, not from the solver's
 *      internal guess.
 *
 * Fully deterministic: no randomness, no time dependence, fixed iteration counts.
 * Existing exports (`solveIK2Bone`, gesture/walk compilation) are untouched.
 */
export interface IKSolveOptions {
    /** World-space effector target. */
    target: Vec3;
    /** Optional bend-direction hint for interior joints (elbow/knee). */
    poleVector?: Vec3;
    /** FABRIK position iterations per outer pass. */
    iterations?: number;
    /** Outer passes (FABRIK -> rotations -> FK re-measure). */
    passes?: number;
    /** Distance (metres) at which the effector counts as having reached the target. */
    tolerance?: number;
    /** Respect authored joint limits (default true). */
    respectLimits?: boolean;
    /** Base pose the chain starts from (ancestors + untouched bones). */
    basePoses?: readonly BonePose[];
}
export interface IKSolveResult {
    /** Local poses for the chain bones (excludes the effector's own rotation). */
    poses: BonePose[];
    /** Full pose set: base poses with the chain's solution merged in. */
    mergedPoses: BonePose[];
    /** FK-measured distance from the effector joint to the target, in metres. */
    error: number;
    reached: boolean;
    /** True when the target lies outside the chain's total reach. */
    targetUnreachable: boolean;
    /** Chain reach (sum of rest segment lengths) in metres. */
    reach: number;
    iterations: number;
    chain: BoneName[];
    /** FK world position of the effector after solving. */
    effectorPosition: Vec3;
}
/**
 * Solve a chain from `root` to `effector` so the effector joint reaches `target`.
 * Returns an FK-measured result; never throws on a bad chain (reports instead).
 */
export declare function solveChainIK(skeleton: BoneDef[], root: BoneName, effector: BoneName, options: IKSolveOptions): IKSolveResult;
/**
 * Convenience wrapper: solve an arm (`upperarm_* -> hand_*`) or leg
 * (`thigh_* -> foot_*`) chain with a sensible default pole vector.
 */
export declare function solveLimbIK(skeleton: BoneDef[], limb: 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r', target: Vec3, options?: Omit<IKSolveOptions, 'target'>): IKSolveResult;
/** In-place FABRIK. Returns the number of iterations actually run. */
export declare function fabrik(positions: Vec3[], lengths: number[], target: Vec3, iterations: number, tolerance: number): number;
/**
 * Rotate interior joints about the root→effector axis so the bend points at the
 * pole vector. Segment lengths are preserved because the rotation is rigid about
 * an axis through the joint's own projection onto the root→effector line.
 */
export declare function applyPoleVector(positions: Vec3[], poleVector: Vec3, lengths: number[]): void;
export declare function mergePoses(base: readonly BonePose[], overrides: readonly BonePose[]): BonePose[];
//# sourceMappingURL=ik-solver.d.ts.map