import type { Vec3 } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
import { type LookAtOptions } from '../ik/look-at.js';
import { type MotionCompilerConfig, type MotionPlan, type ValidationResult } from './motion-compiler.js';
/**
 * MotionRuntime — the integration layer that puts the (previously standalone)
 * motion compiler *inside* the animation path.
 *
 * The compiler is a pure command -> `MotionPlan` function: it has no notion of
 * time, of the pose currently on the character, or of what happens when a second
 * command arrives mid-gesture. That is exactly the gap that kept `motionCompiler`
 * at PROTOTYPE. This runtime supplies the missing frame loop:
 *
 *   - `push(command)` compiles + validates a command and queues it,
 *   - `tick(dt)` advances a deterministic clock, cross-fades from the outgoing
 *     pose into the new plan over `blendDuration`, and returns the pose to apply,
 *   - continuous plans (walk) are re-compiled per frame with an advancing phase,
 *   - invalid or unknown plans are rejected without disturbing the current pose.
 *
 * Deterministic by construction: the only state is the accumulated clock, so the
 * same command sequence and the same dt sequence always produce identical poses.
 * Nothing here changes the compiler or `SkeletalAnimation`; both are consumed
 * as-is, which keeps clip playback and `Human.perform()` working unchanged.
 */
export interface MotionRuntimeConfig {
    /** Fallback cross-fade seconds when a plan carries no blendDuration. */
    defaultBlendDuration: number;
    /** Reject plans whose confidence falls below this. */
    minConfidence: number;
    /** Reject plans that fail `validateMotion` (joint limits, unknown bones). */
    requireValidation: boolean;
    /** Walk cycle seconds per full stride, used to advance the walk phase. */
    walkCycleSeconds: number;
    /** Compiler configuration forwarded to the underlying MotionCompiler. */
    compiler?: Partial<MotionCompilerConfig>;
}
export declare const DEFAULT_MOTION_RUNTIME_CONFIG: MotionRuntimeConfig;
export interface MotionRejection {
    command: string;
    reason: string;
    kind: MotionPlan['kind'];
    confidence: number;
    validation: ValidationResult | null;
}
export interface MotionRuntimeFrame {
    /** Accumulated runtime clock in seconds. */
    time: number;
    poses: BonePose[];
    /** Command driving the frame, or null while at rest. */
    command: string | null;
    kind: MotionPlan['kind'] | 'rest';
    /** 0..1 progress of the active cross-fade (1 = fully blended in). */
    blend: number;
    blending: boolean;
    continuous: boolean;
    /** Bones written this frame (stable, sorted). */
    bones: string[];
    /** Per-limb IK outcome for this frame (FK-measured), empty when no IK is active. */
    ik: MotionIkFrame[];
    /** Gaze outcome for this frame (FK-measured), or null when no gaze target is set. */
    lookAt: MotionLookAtFrame | null;
}
/** IK layered onto a frame, with the FK-measured result. */
export interface MotionIkFrame {
    id: string;
    chain: BoneName[];
    target: Vec3;
    error: number;
    reached: boolean;
    targetUnreachable: boolean;
}
/** Gaze layered onto a frame, with the FK-measured result. */
export interface MotionLookAtFrame {
    target: Vec3;
    chain: BoneName[];
    angleErrorDeg: number;
    clamped: boolean;
}
export type MotionIkLimb = 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';
export interface MotionIkRequest {
    /** Stable id; re-using an id replaces that constraint. Defaults to the limb/chain. */
    id?: string;
    /** Named limb shorthand, or an explicit root/effector pair. */
    limb?: MotionIkLimb;
    root?: BoneName;
    effector?: BoneName;
    target: Vec3;
    poleVector?: Vec3;
    tolerance?: number;
    iterations?: number;
    passes?: number;
    respectLimits?: boolean;
}
export interface MotionRuntimeStatus {
    time: number;
    activeCommand: string | null;
    activeKind: MotionPlan['kind'] | 'rest';
    blending: boolean;
    blend: number;
    accepted: number;
    rejected: number;
    frames: number;
    rejections: MotionRejection[];
    /** IK constraints currently layered on every frame. */
    ikConstraints: MotionIkFrame[];
    /** Gaze constraint currently layered on every frame, if any. */
    lookAt: MotionLookAtFrame | null;
}
export declare class MotionRuntime {
    private readonly skeleton;
    private readonly compiler;
    private readonly config;
    private clock;
    private frames;
    private accepted;
    private rejections;
    /** Pose the runtime is fading away from (the last fully applied pose). */
    private fromPoses;
    private activePlan;
    private activeCommand;
    private blendElapsed;
    private blendDuration;
    private walkPhase;
    /** IK constraints layered on top of the blended motion pose, in insertion order. */
    private ikRequests;
    private lastIkFrames;
    /** Persistent gaze constraint, layered last so it wins over motion. */
    private lookAtRequest;
    private lastLookAtFrame;
    constructor(skeleton: BoneDef[], config?: Partial<MotionRuntimeConfig>);
    get time(): number;
    /** Compile, validate, and install a command as the new target motion. */
    push(command: string): {
        accepted: boolean;
        plan: MotionPlan;
        rejection?: MotionRejection;
    };
    /** Return to rest, cross-fading out of the active motion. */
    release(): void;
    /**
     * Install (or replace) an IK constraint. Constraints are persistent: every
     * subsequent `tick` re-solves them against that frame's blended motion pose, so
     * a hand can stay pinned to a world point while the body walks.
     */
    setIkTarget(request: MotionIkRequest): string;
    clearIkTarget(id: string): boolean;
    clearIkTargets(): void;
    /** Install a persistent gaze target; the head/neck chain tracks it every frame. */
    setLookAtTarget(target: Vec3, options?: Omit<LookAtOptions, 'target' | 'basePoses'>): void;
    clearLookAtTarget(): void;
    /** Advance the runtime by `dt` seconds and produce the pose for this frame. */
    tick(dt: number): MotionRuntimeFrame;
    /**
     * Solve every active IK constraint, then the gaze, against `poses`.
     * Pure with respect to runtime timing: the same pose + constraints always
     * produce the same layered output.
     */
    private applyConstraints;
    /** Pose as of the last tick (used as the source of the next cross-fade). */
    currentPoses(): BonePose[];
    status(): MotionRuntimeStatus;
    reset(): void;
}
/** Rewrite/insert a `phase <n>` token so continuous plans can advance. */
export declare function withPhase(command: string, phase: number): string;
/**
 * Blend two pose sets by bone name. Bones present in only one side fade against
 * their own identity, so a gesture that touches the right arm never snaps the
 * left one.
 */
export declare function blendPoses(from: BonePose[], to: BonePose[], t: number): BonePose[];
//# sourceMappingURL=motion-runtime.d.ts.map