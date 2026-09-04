/**
 * Deterministic randomness for kiosk behaviour.
 *
 * Kiosk behaviour must *look* organic (blink intervals, saccades, gesture
 * choice) while remaining bit-exactly reproducible: a soak run of 8 simulated
 * hours has to replay identically or it cannot be used as a regression gate.
 * So every "random" decision in this folder comes from this xorshift32 stream,
 * never from `Math.random`.
 */
export class KioskRandom {
    state;
    constructor(seed = 0x2b4d1f) {
        this.state = seed >>> 0 || 1;
    }
    /** Uniform in [0, 1). */
    next() {
        let s = this.state;
        s ^= s << 13;
        s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        this.state = s || 1;
        return this.state / 0x100000000;
    }
    /** Uniform in [min, max). */
    range(min, max) {
        return min + (max - min) * this.next();
    }
    /** Uniform in [-amount, amount). */
    signed(amount) {
        return this.range(-amount, amount);
    }
    /** True with probability `p`. */
    chance(p) {
        return this.next() < p;
    }
    /** Pick one element deterministically. */
    pick(items) {
        if (items.length === 0)
            throw new Error('KioskRandom.pick: empty list');
        const index = Math.min(items.length - 1, Math.floor(this.next() * items.length));
        return items[index];
    }
    /** Reset the stream so a replay starts from the same point. */
    reseed(seed) {
        this.state = seed >>> 0 || 1;
    }
}
/** Smoothstep easing, used for lid and head motion curves. */
export function smoothstep(t) {
    const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
    return x * x * (3 - 2 * x);
}
export function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
//# sourceMappingURL=kiosk-random.js.map