import { type KioskBehaviorConfig, type KioskAttentionState } from './kiosk-behavior.js';
/**
 * Long-running kiosk soak harness.
 *
 * A kiosk is not a demo: it runs unattended for days, cycling thousands of
 * conversations. The failure modes that matter are drift and starvation, not
 * crashes — a blink that slowly stops firing, a gaze that walks off to infinity,
 * a state machine that gets stuck in "thinking" after an interruption. Those are
 * invisible in a 10-second demo and obvious over simulated hours.
 *
 * `runKioskSoak` drives KioskBehavior over a compressed timeline with scripted
 * visitor traffic and returns invariants that a test can gate on: blink cadence
 * bounds, gaze bounded around the anchor, every state visited, no state starved,
 * finite output on every frame, and bit-exact determinism between two runs.
 */
export interface KioskSoakOptions {
    /** Simulated duration, hours. */
    hours: number;
    /** Fixed timestep, seconds. */
    dt: number;
    /** Traffic seed (visitor arrivals, utterance lengths, interruptions). */
    seed: number;
    /** Probability per conversation that the visitor interrupts the answer. */
    interruptChance: number;
    behavior?: Partial<KioskBehaviorConfig>;
}
export declare const DEFAULT_KIOSK_SOAK_OPTIONS: KioskSoakOptions;
export interface KioskSoakReport {
    frames: number;
    simulatedSeconds: number;
    conversations: number;
    interruptions: number;
    blinks: number;
    gestures: number;
    saccades: number;
    /** Blink cadence over the run, seconds. */
    minBlinkGap: number;
    maxBlinkGap: number;
    meanBlinkGap: number;
    /** Longest stretch without a blink while a visitor was present, seconds. */
    maxAttendedBlinkGap: number;
    /** Max distance of the gaze target from the visitor/default anchor. */
    maxGazeDistance: number;
    /** Seconds spent in each attention state. */
    stateSeconds: Record<KioskAttentionState, number>;
    /** Longest continuous stretch in one state, seconds. */
    longestState: {
        state: KioskAttentionState;
        seconds: number;
    };
    /** True when every frame produced finite numbers. */
    finite: boolean;
    /** Order-independent fingerprint of the whole run. */
    fingerprint: string;
}
interface ScriptStep {
    at: number;
    action: 'arrive' | 'ask' | 'think' | 'answer' | 'interrupt' | 'finish' | 'leave';
}
/** Deterministic visitor traffic: arrive → ask → think → speak → (interrupt) → leave. */
export declare function buildKioskSoakScript(options: KioskSoakOptions): ScriptStep[];
export declare function runKioskSoak(options?: Partial<KioskSoakOptions>): KioskSoakReport;
export {};
//# sourceMappingURL=kiosk-soak.d.ts.map