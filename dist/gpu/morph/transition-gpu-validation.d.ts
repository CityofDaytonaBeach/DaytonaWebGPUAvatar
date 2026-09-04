import { Human } from '../../human.js';
import { type GpuLimitsLike, type GpuValidationIssue } from '../device/gpu-validation-harness.js';
import { type TransitionSpec } from '../../core/transitions/parameter-transition.js';
/**
 * Timeline parameter transitions, validated through the GPU morph path.
 *
 * `parameterTransitions` stayed PROTOTYPE for one reason: the curve maths were
 * proven in isolation (`parameter-transition.test.ts`), but nobody proved that a
 * *running* transition survives the trip through the event timeline, the sparse
 * morph compiler, the packed GPU buffers, and the compute dispatch — frame after
 * frame, without a NaN, an out-of-range morph range, or a dispatch that misses
 * part of the mesh.
 *
 * This module walks a transition frame by frame on the real `Human` and, for each
 * frame, re-derives exactly what the GPU would consume:
 *
 *   morphDelta -> packSparseMorphs -> setMorphWeights -> dispatch bounds
 *
 * It is headless: no GPUDevice is required (a device, when present, is used only
 * for live error-scope capture). That makes it a CI gate rather than a demo.
 */
export interface TransitionGpuFrame {
    frame: number;
    time: number;
    /** Value sampled from the transition curve at this frame. */
    sampled: number;
    /** Value actually stored on the definition after the event applied. */
    applied: number;
    /** Absolute difference between curve and definition. */
    drift: number;
    morphDeltaFinite: boolean;
    affectedVertices: number;
    deltaSlots: number;
    morphCount: number;
    boundsOk: boolean;
    issues: GpuValidationIssue[];
}
export interface TransitionGpuValidationReport {
    path: string;
    frames: TransitionGpuFrame[];
    vertexCount: number;
    workgroupSize: number;
    /** Every frame packed and dispatched within bounds, with finite deltas. */
    ok: boolean;
    maxDrift: number;
    /** True when the final frame equals the transition's target value. */
    reachedTarget: boolean;
    finalValue: number;
    targetValue: number;
    nonFiniteFrames: number;
    issues: GpuValidationIssue[];
}
export interface TransitionGpuValidationOptions {
    /** Frames per second of the simulated timeline (default 60). */
    fps?: number;
    /** Workgroup size of the morph kernel (must match the WGSL, default 64). */
    workgroupSize?: number;
    /** Device limits to validate against; defaults to conservative WebGPU minimums. */
    limits?: GpuLimitsLike;
    /** Optional real device — enables live validation error-scope capture. */
    device?: GPUDevice;
    /** Tolerance for curve-vs-definition drift (default 1e-6). */
    tolerance?: number;
}
/**
 * Drive one parameter transition on a real Human and validate every frame's GPU
 * morph payload.
 */
export declare function validateTransitionThroughGpuPath(human: Human, spec: TransitionSpec, options?: TransitionGpuValidationOptions): Promise<TransitionGpuValidationReport>;
/** Default transition cases exercised by the CI gate. */
export declare const DEFAULT_TRANSITION_GPU_CASES: TransitionSpec[];
export interface TransitionGpuSuiteReport {
    ok: boolean;
    reports: TransitionGpuValidationReport[];
    issues: GpuValidationIssue[];
    lines: string[];
}
/** Run every default transition case on a fresh Human and aggregate. */
export declare function runTransitionGpuValidationSuite(options?: TransitionGpuValidationOptions & {
    cases?: readonly TransitionSpec[];
}): Promise<TransitionGpuSuiteReport>;
//# sourceMappingURL=transition-gpu-validation.d.ts.map