import { Vec3 } from '../../core/math/vec.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { BonePose } from '../skeleton/skeletal-animation.js';
export interface MotionCompilerConfig {
    /** Total IK arm chain length (metres). If 0, auto-measured from skeleton. */
    armChainLength: number;
    /** Total IK leg chain length (metres). If 0, auto-measured from skeleton. */
    legChainLength: number;
    /** Default cross-fade time in seconds for blend transitions. */
    defaultBlendDuration: number;
    /** Maximum look-at angle in degrees before clamping. */
    lookAtMaxAngleDeg: number;
    /** Walk cycle stride length in metres. */
    walkStrideLength: number;
    /** Walk cycle step period in seconds. */
    walkStepPeriod: number;
}
export type MotionKind = 'raiseHand' | 'lookAtCamera' | 'neutral' | 'unknown' | 'gesture' | 'walk' | 'transition';
export interface MotionPlan {
    kind: MotionKind;
    confidence: number;
    poses: BonePose[];
    reason?: string;
    /** When present, signals a transition blend: caller should nlerp from previous plan over this many seconds. */
    blendDuration?: number;
}
/** Deterministic behavior compiler from small semantic commands to bone poses. */
export declare class MotionCompiler {
    private config;
    private chainLengths;
    constructor(config?: Partial<MotionCompilerConfig>);
    compile(command: string, skeleton: BoneDef[]): MotionPlan;
    /** Legacy static entry-point preserved for backwards compatibility. */
    static compile(command: string, skeleton: BoneDef[]): MotionPlan;
    /** Measure chain lengths from skeleton once and cache them. */
    private getConfig;
}
export declare function compileMotionCommand(command: string, skeleton: BoneDef[]): MotionPlan;
export interface IKChain {
    /** Bone names from root to effector (inclusive). */
    bones: string[];
    /** World-space target position for the effector. */
    target: Vec3;
    /** Optional world-space pole-vector target (elbow / knee direction hint). */
    poleVector?: Vec3;
}
/**
 * 2-bone analytical IK solver. Works on a two-segment chain (e.g. upperarmâ†’forearm
 * or thighâ†’shin). Returns local-space rotation quaternions for each bone in the
 * chain (length 2). Fully deterministic, zero-allocation-friendly.
 */
export declare function solveIK2Bone(chain: IKChain, skeleton: BoneDef[], config: MotionCompilerConfig): BonePose[];
export interface LookAtParams {
    target: Vec3;
    maxAngleDeg?: number;
}
/**
 * Compute head + neck rotations to orient the face toward `target`.
 * Also produces a subtle eye-direction hint via the head bone.
 */
export declare function solveLookAt(skeleton: BoneDef[], target: Vec3, config: MotionCompilerConfig): BonePose[];
export type GestureName = 'wave' | 'point' | 'thumbsUp' | 'crossArms' | 'hipHands' | 'shrug' | 'headNod' | 'headShake';
export interface RetargetMapping {
    /** Source skeleton that produced the motion. */
    sourceSkeleton: BoneDef[];
    /** Target skeleton to retarget onto. */
    targetSkeleton: BoneDef[];
}
/**
 * Retarget a list of BonePoses from a source skeleton proportion to a target
 * skeleton. Scales local positions by the ratio of segment lengths and
 * preserves rotations.
 */
export declare function retargetPoses(poses: BonePose[], mapping: RetargetMapping): BonePose[];
/**
 * Procedural walk cycle. `phase` is 0â€¦1 through one full stride (0 = contact,
 * 0.5 = mid-stance). `speed` scales the cycle time.
 * Returns a full-body pose set for the given phase.
 */
export declare function compileWalk(skeleton: BoneDef[], phase: number, speed: number, _config: MotionCompilerConfig): MotionPlan;
/**
 * Blend two MotionPlans together. Returns a new plan whose poses are
 * element-wise nlerp of `from` and `to` at blend weight `t` (0â€¦1).
 */
export declare function blendMotions(from: MotionPlan, to: MotionPlan, t: number): MotionPlan;
/**
 * Create a transition plan: the output `to` plan with a recommended
 * `blendDuration` for smooth cross-fading.
 */
export declare function transitionTo(to: MotionPlan, duration?: number, config?: Partial<MotionCompilerConfig>): MotionPlan;
export interface ValidationResult {
    valid: boolean;
    violations: string[];
}
/**
 * Validate that every bone pose in a plan is within that bone's joint limits.
 * Bones without limits are considered unconstrained.
 */
export declare function validateMotion(plan: MotionPlan, skeleton: BoneDef[]): ValidationResult;
/** High-level look-at that produces a MotionPlan. */
export declare function compileLookAt(skeleton: BoneDef[], target: Vec3, config?: Partial<MotionCompilerConfig>): MotionPlan;
/** High-level IK entry point that produces a MotionPlan. */
export declare function compileIKArm(skeleton: BoneDef[], side: 'l' | 'r', target: Vec3, poleVector?: Vec3, config?: Partial<MotionCompilerConfig>): MotionPlan;
/** High-level IK entry point for legs. */
export declare function compileIKLeg(skeleton: BoneDef[], side: 'l' | 'r', target: Vec3, poleVector?: Vec3, config?: Partial<MotionCompilerConfig>): MotionPlan;
//# sourceMappingURL=motion-compiler.d.ts.map