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
//# sourceMappingURL=parameter-transition.d.ts.map