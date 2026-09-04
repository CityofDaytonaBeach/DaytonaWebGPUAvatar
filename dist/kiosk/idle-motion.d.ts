import type { KioskAttentionState } from './blink-controller.js';
/**
 * IdleMotion — the "is it alive?" layer.
 *
 * A kiosk human that only moves when speaking looks like a paused video. This
 * module produces the continuous, low-amplitude motion an observer reads as
 * life, plus the per-state postural signature:
 *
 *   - breathing: chest/shoulder rise on a slow asymmetric cycle,
 *   - head drift: three incommensurate sines per axis (never a visible loop),
 *   - weight shift: very slow lateral sway of the hips,
 *   - listening posture: slight forward lean, head tilt, brow raise,
 *   - thinking posture: head down/aside, brow furrow,
 *   - speaking accents: head nods driven by supplied speech energy,
 *   - small gestures: occasional nods/shrugs scheduled per state.
 *
 * Output is a small pose description (angles in radians + expression controls)
 * plus an optional motion command; the behaviour layer routes those to the
 * MotionRuntime and the definition.
 */
export interface IdleMotionConfig {
    /** Breaths per minute. */
    breathRate: number;
    /** Breath amplitude, 0..1. */
    breathAmplitude: number;
    /** Head drift amplitude in radians. */
    headDrift: number;
    /** Lateral weight-shift amplitude in radians. */
    swayAmplitude: number;
    /** Weight-shift period, seconds. */
    swayPeriod: number;
    /** Per-state amplitude multiplier on the drift/sway layer. */
    amplitudeByState: Record<KioskAttentionState, number>;
    /** Mean seconds between small gestures, per state (0 disables). */
    gestureIntervalByState: Record<KioskAttentionState, number>;
    /** Gesture commands eligible per state. */
    gesturesByState: Record<KioskAttentionState, readonly string[]>;
    /** Seconds to cross-fade between postures. */
    postureBlend: number;
    seed: number;
}
export declare const DEFAULT_IDLE_MOTION_CONFIG: IdleMotionConfig;
export interface IdleMotionFrame {
    time: number;
    /** Head rotation offsets in radians. */
    headYaw: number;
    headPitch: number;
    headRoll: number;
    /** Hip lateral sway in radians. */
    sway: number;
    /** 0..1 inhale amount. */
    breath: number;
    /** Forward lean, radians (positive = toward the visitor). */
    lean: number;
    /** Expression controls implied by the posture (brow etc.). */
    expression: Record<string, number>;
    /** Motion command to push this frame, or null. */
    gesture: string | null;
    /** Gestures emitted since construction/reset. */
    gestureCount: number;
}
export declare class IdleMotion {
    private readonly config;
    private readonly random;
    private clock;
    private gestureCountdown;
    private gestures;
    private posture;
    private postureWeight;
    private previousPosture;
    private speechEnergy;
    private gesturesEnabled;
    constructor(config?: Partial<IdleMotionConfig>);
    setState(state: KioskAttentionState): void;
    /** 0..1 speech loudness for this frame; drives speaking head accents. */
    setSpeechEnergy(energy: number): void;
    /** Turn small gestures off (e.g. during an interruption or a scripted beat). */
    setGesturesEnabled(enabled: boolean): void;
    reset(): void;
    tick(dt: number): IdleMotionFrame;
    private blend;
    private leanFor;
    private postureRoll;
    private rollFor;
    private posturePitch;
    private pitchFor;
    private postureExpression;
    private weightOf;
    private scheduleGesture;
}
//# sourceMappingURL=idle-motion.d.ts.map