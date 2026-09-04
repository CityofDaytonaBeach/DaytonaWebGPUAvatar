/**
 * BlinkController — kiosk-grade blink quality.
 *
 * A blink that is a single symmetric triangle every N seconds reads as robotic
 * immediately. This controller reproduces the properties an observer actually
 * notices:
 *
 *   - asymmetric lid curve: fast closing (~90ms), short hold, slower reopen,
 *   - log-normal-ish interval spread instead of a fixed period,
 *   - state-dependent rate (listening blinks less, thinking blinks more),
 *   - occasional double blinks,
 *   - speech-locked suppression so a blink never lands inside a wide-eye or a
 *     mid-viseme accent,
 *   - a deliberate blink on demand (`requestBlink`) for attention beats.
 *
 * The controller owns no rendering: `tick` returns the lid closure and the
 * caller writes `expression.blink*` (see `applyTo`).
 */
export type KioskAttentionState = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface BlinkConfig {
    /** Shortest gap between blinks, seconds. */
    minInterval: number;
    /** Longest gap between blinks, seconds. */
    maxInterval: number;
    /** Lid close time, seconds. */
    closeDuration: number;
    /** Fully-closed hold, seconds. */
    holdDuration: number;
    /** Lid reopen time, seconds (longer than close, as in real blinks). */
    openDuration: number;
    /** Probability that a blink is immediately followed by a second one. */
    doubleBlinkChance: number;
    /** Gap before the second blink of a double, seconds. */
    doubleBlinkGap: number;
    /** Per-state multiplier on the interval (>1 = blinks less often). */
    rateByState: Record<KioskAttentionState, number>;
    /** Small left/right timing offset so both lids are not mathematically identical. */
    asymmetry: number;
    seed: number;
}
export declare const DEFAULT_BLINK_CONFIG: BlinkConfig;
export type BlinkPhase = 'open' | 'closing' | 'held' | 'opening';
export interface BlinkFrame {
    /** 0 = eyes open, 1 = fully closed. */
    closure: number;
    /** Per-eye closure (slightly desynchronised). */
    left: number;
    right: number;
    phase: BlinkPhase;
    /** Seconds until the next scheduled blink starts (0 while blinking). */
    timeToNext: number;
    /** True on the frame a blink starts. */
    started: boolean;
    /** Completed blinks since construction/reset. */
    count: number;
}
export interface BlinkApplyTarget {
    set(path: string, value: number): void;
}
export declare class BlinkController {
    private readonly config;
    private readonly random;
    private countdown;
    private elapsed;
    private active;
    private pendingDouble;
    private blinks;
    private suppressed;
    constructor(config?: Partial<BlinkConfig>);
    get blinkCount(): number;
    /** Blink as soon as the current blink (if any) finishes. */
    requestBlink(): void;
    /** Hold the lids open for `seconds` (wide-eye, viseme accent, camera check). */
    suppress(seconds: number): void;
    reset(): void;
    tick(dt: number, state?: KioskAttentionState): BlinkFrame;
    /** Write the frame onto a definition-like target as ARKit blink controls. */
    applyTo(target: BlinkApplyTarget, frame: BlinkFrame): void;
    private blinkDuration;
    private phase;
    /** Asymmetric lid curve: eased close, flat hold, slower eased reopen. */
    private curve;
    /** Spread intervals with two samples (bias toward the shorter end, long tail). */
    private scheduleInterval;
}
//# sourceMappingURL=blink-controller.d.ts.map