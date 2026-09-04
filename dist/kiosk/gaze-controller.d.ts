import type { Vec3 } from '../core/math/vec.js';
import type { KioskAttentionState } from './blink-controller.js';
/**
 * GazeController — where the kiosk human is looking, and how it gets there.
 *
 * The IK look-at solver already exists; what was missing is *behaviour*: a bare
 * look-at target pinned to the camera stares, which is the single most uncanny
 * thing a kiosk avatar can do. This controller produces a moving gaze point:
 *
 *   - an attention anchor (the visitor's face, supplied by person detection),
 *   - micro-saccades: small, quick jumps around the anchor with dwell times,
 *   - eye-contact rhythm: periodic brief breaks so contact is not continuous,
 *   - aversion while thinking (up/side, the natural "recalling" direction),
 *   - a smoothed pursuit path so the head never snaps between targets,
 *   - graceful fallback to a straight-ahead anchor when no visitor is detected.
 */
export interface GazeConfig {
    /** Default anchor when no visitor is tracked (straight ahead, eye height). */
    defaultAnchor: Vec3;
    /** Radius of micro-saccade offsets, world units. */
    saccadeRadius: number;
    /** Dwell range between saccades, seconds. */
    minDwell: number;
    maxDwell: number;
    /** Seconds of eye contact before a short break. */
    contactDuration: number;
    /** Length of a contact break, seconds. */
    breakDuration: number;
    /** Offset applied during a contact break. */
    breakOffset: Vec3;
    /** Offset applied while thinking (gaze aversion). */
    thinkingOffset: Vec3;
    /** Smoothing time constant for pursuit, seconds (larger = lazier head). */
    smoothing: number;
    /** Per-state gaze intensity handed to the look-at solver. */
    intensityByState: Record<KioskAttentionState, number>;
    seed: number;
}
export declare const DEFAULT_GAZE_CONFIG: GazeConfig;
export type GazeMode = 'contact' | 'break' | 'averted' | 'ambient';
export interface GazeFrame {
    /** Smoothed world-space point to hand to the look-at solver. */
    target: Vec3;
    /** Un-smoothed desired point (useful for tests/telemetry). */
    desired: Vec3;
    mode: GazeMode;
    /** 0..1 look-at blend for the current state. */
    intensity: number;
    /** True when a visitor anchor is currently tracked. */
    tracking: boolean;
    /** Saccades performed since construction/reset. */
    saccades: number;
}
export declare class GazeController {
    private readonly config;
    private readonly random;
    private anchor;
    private saccade;
    private dwell;
    private contactElapsed;
    private breakElapsed;
    private breaking;
    private smoothed;
    private saccades;
    constructor(config?: Partial<GazeConfig>);
    /** Person detection feeds the visitor's head position here (or null when lost). */
    setAttentionAnchor(anchor: Vec3 | null): void;
    /** Force immediate eye contact (used when a visitor arrives or interrupts). */
    reacquire(): void;
    reset(): void;
    tick(dt: number, state?: KioskAttentionState): GazeFrame;
}
//# sourceMappingURL=gaze-controller.d.ts.map