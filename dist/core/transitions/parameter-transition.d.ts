import { HumanDefinition, PrimitiveValue } from '../schema/human-definition.js';
export type TransitionCurve = 'linear' | 'ease' | 'biological' | 'spring' | 'step' | 'elastic' | 'bounce' | 'sine' | 'cubic' | 'exponential';
export type EaseVariant = 'easeIn' | 'easeOut' | 'easeInOut';
export interface OvershootConfig {
    amplitude: number;
    frequency: number;
}
export interface ParameterTransition {
    id: string;
    path: string;
    startValue: PrimitiveValue;
    targetValue: PrimitiveValue;
    startTime: number;
    duration: number;
    curve: TransitionCurve;
    easeVariant: EaseVariant;
    overshoot?: OvershootConfig;
}
export interface TransitionSpec {
    id?: string;
    path: string;
    targetValue: PrimitiveValue;
    duration: number;
    curve?: TransitionCurve;
    easeVariant?: EaseVariant;
    overshoot?: OvershootConfig;
}
export interface TransitionSummary {
    active: ParameterTransition[];
    completed: ParameterTransition[];
    failed: {
        transition: ParameterTransition;
        reason: string;
    }[];
    total: number;
}
export interface TransitionBenchmark {
    transitionId: string;
    path: string;
    expectedEndValue: PrimitiveValue;
    actualEndValue: PrimitiveValue;
    absoluteError: number;
    withinTolerance: boolean;
}
export declare function createParameterTransition(definition: HumanDefinition, spec: TransitionSpec, now: number): ParameterTransition;
export declare function sampleTransition(transition: ParameterTransition, now: number): PrimitiveValue;
export declare function transitionComplete(transition: ParameterTransition, now: number): boolean;
export declare class TransitionTimeline {
    private _active;
    private _completed;
    private _failed;
    get active(): ReadonlyArray<ParameterTransition>;
    get completed(): ReadonlyArray<ParameterTransition>;
    get failed(): ReadonlyArray<{
        transition: ParameterTransition;
        reason: string;
    }>;
    add(transition: ParameterTransition): void;
    addBatch(transitions: ParameterTransition[]): void;
    sampleAll(now: number): Map<string, PrimitiveValue>;
    tick(now: number): PrimitiveValue[];
    clearCompleted(): void;
    summary(): TransitionSummary;
    /** Remove a transition by id from the active set. */
    cancel(id: string): ParameterTransition | undefined;
    /** Remove all transitions for a given path. */
    cancelByPath(path: string): ParameterTransition[];
}
/**
 * Replays a transition from start to finish at a fixed sample rate and returns
 * the sampled values. Deterministic: same inputs produce identical outputs.
 */
export declare function replayTransition(transition: ParameterTransition, sampleRate?: number): PrimitiveValue[];
/**
 * Verifies that replaying a transition lands on the expected end value.
 * Returns a TransitionBenchmark for measurement.
 */
export declare function verifyTransitionDeterminism(transition: ParameterTransition, tolerance?: number): TransitionBenchmark;
/**
 * Batch-verify determinism across multiple transitions.
 */
export declare function validateTransitionDeterminism(transitions: ParameterTransition[], tolerance?: number): TransitionBenchmark[];
export interface LongReplayReport {
    transitionId: string;
    /** Frames sampled across the whole replay window. */
    frames: number;
    /** Sample rate used, in Hz. */
    sampleRate: number;
    /** Value at the final sampled frame. */
    endValue: PrimitiveValue;
    /** |endValue - targetValue| once the window has passed the duration. */
    absoluteError: number;
    /** True when a second, identical replay produced byte-identical frames. */
    deterministic: boolean;
    /** Largest deviation between the two replay passes. */
    maxReplayDeviation: number;
    /** True when every frame is finite. */
    finite: boolean;
    /** True when the value never moves after the transition has completed. */
    settled: boolean;
}
/**
 * Replay a transition over a long window (default 10 simulated minutes at
 * 120Hz) twice and compare the passes. Catches accumulated-time drift, late
 * jitter after completion, and any non-determinism in the curve evaluation.
 */
export declare function verifyLongReplay(transition: ParameterTransition, options?: {
    sampleRate?: number;
    durationSeconds?: number;
    tolerance?: number;
}): LongReplayReport;
export interface ScrubReport {
    transitionId: string;
    /** Times requested, in the order requested. */
    times: number[];
    /** Value sampled at each requested time. */
    values: PrimitiveValue[];
    /** True when scrubbing in a shuffled order yields the same per-time values. */
    orderIndependent: boolean;
    /** Largest per-time difference between ordered and shuffled scrubs. */
    maxOrderDeviation: number;
    /** True when values before the start and after the end are clamped. */
    clamped: boolean;
}
/**
 * Scrub a transition at arbitrary times, forwards or backwards. Sampling is
 * stateless, so a shuffled scrub must reproduce the ordered scrub exactly —
 * this is what makes timeline scrubbing safe in an editor.
 */
export declare function scrubTransition(transition: ParameterTransition, times: readonly number[], options?: {
    tolerance?: number;
}): ScrubReport;
/**
 * Scrub every active transition on a timeline to one point in time. Returns the
 * per-path values; repeated calls at the same time are identical, and calls at
 * decreasing times are as valid as increasing ones (no internal cursor).
 */
export declare function scrubTimeline(timeline: TransitionTimeline, times: readonly number[]): Map<string, PrimitiveValue>[];
//# sourceMappingURL=parameter-transition.d.ts.map