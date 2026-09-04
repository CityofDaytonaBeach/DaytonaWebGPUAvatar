/**
 * Deterministic randomness for kiosk behaviour.
 *
 * Kiosk behaviour must *look* organic (blink intervals, saccades, gesture
 * choice) while remaining bit-exactly reproducible: a soak run of 8 simulated
 * hours has to replay identically or it cannot be used as a regression gate.
 * So every "random" decision in this folder comes from this xorshift32 stream,
 * never from `Math.random`.
 */
export declare class KioskRandom {
    private state;
    constructor(seed?: number);
    /** Uniform in [0, 1). */
    next(): number;
    /** Uniform in [min, max). */
    range(min: number, max: number): number;
    /** Uniform in [-amount, amount). */
    signed(amount: number): number;
    /** True with probability `p`. */
    chance(p: number): boolean;
    /** Pick one element deterministically. */
    pick<T>(items: readonly T[]): T;
    /** Reset the stream so a replay starts from the same point. */
    reseed(seed: number): void;
}
/** Smoothstep easing, used for lid and head motion curves. */
export declare function smoothstep(t: number): number;
export declare function clamp01(v: number): number;
//# sourceMappingURL=kiosk-random.d.ts.map