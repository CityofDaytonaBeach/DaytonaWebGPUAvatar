import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';
export const DEFAULT_BLINK_CONFIG = {
    minInterval: 1.9,
    maxInterval: 6.4,
    closeDuration: 0.09,
    holdDuration: 0.035,
    openDuration: 0.16,
    doubleBlinkChance: 0.14,
    doubleBlinkGap: 0.22,
    rateByState: { idle: 1, listening: 1.35, thinking: 0.8, speaking: 1.1 },
    asymmetry: 0.012,
    seed: 0x5b11,
};
export class BlinkController {
    config;
    random;
    countdown = 0;
    elapsed = 0;
    active = false;
    pendingDouble = false;
    blinks = 0;
    suppressed = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_BLINK_CONFIG, ...config };
        this.random = new KioskRandom(this.config.seed);
        this.countdown = this.scheduleInterval('idle');
    }
    get blinkCount() {
        return this.blinks;
    }
    /** Blink as soon as the current blink (if any) finishes. */
    requestBlink() {
        if (this.active)
            this.pendingDouble = true;
        else
            this.countdown = 0;
    }
    /** Hold the lids open for `seconds` (wide-eye, viseme accent, camera check). */
    suppress(seconds) {
        this.suppressed = Math.max(this.suppressed, Math.max(0, seconds));
    }
    reset() {
        this.random.reseed(this.config.seed);
        this.countdown = this.scheduleInterval('idle');
        this.elapsed = 0;
        this.active = false;
        this.pendingDouble = false;
        this.blinks = 0;
        this.suppressed = 0;
    }
    tick(dt, state = 'idle') {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        let started = false;
        if (this.suppressed > 0) {
            this.suppressed = Math.max(0, this.suppressed - step);
            if (!this.active) {
                // Keep the schedule from firing the instant suppression lifts.
                this.countdown = Math.max(this.countdown, 0.12);
            }
        }
        if (this.active) {
            this.elapsed += step;
            if (this.elapsed >= this.blinkDuration()) {
                this.active = false;
                this.elapsed = 0;
                this.blinks += 1;
                if (this.pendingDouble) {
                    this.pendingDouble = false;
                    this.countdown = this.config.doubleBlinkGap;
                }
                else if (this.random.chance(this.config.doubleBlinkChance)) {
                    this.countdown = this.config.doubleBlinkGap;
                }
                else {
                    this.countdown = this.scheduleInterval(state);
                }
            }
        }
        else {
            this.countdown -= step;
            if (this.countdown <= 0 && this.suppressed <= 0) {
                this.active = true;
                this.elapsed = 0;
                this.countdown = 0;
                started = true;
            }
        }
        const closure = this.active ? this.curve(this.elapsed) : 0;
        const offset = this.config.asymmetry;
        const left = this.active ? this.curve(this.elapsed - offset) : 0;
        const right = this.active ? this.curve(this.elapsed + offset) : 0;
        return {
            closure,
            left,
            right,
            phase: this.phase(),
            timeToNext: this.active ? 0 : Math.max(0, this.countdown),
            started,
            count: this.blinks,
        };
    }
    /** Write the frame onto a definition-like target as ARKit blink controls. */
    applyTo(target, frame) {
        target.set('expression.blinkLeft', clamp01(frame.left));
        target.set('expression.blinkRight', clamp01(frame.right));
    }
    blinkDuration() {
        const c = this.config;
        return c.closeDuration + c.holdDuration + c.openDuration;
    }
    phase() {
        if (!this.active)
            return 'open';
        const c = this.config;
        if (this.elapsed < c.closeDuration)
            return 'closing';
        if (this.elapsed < c.closeDuration + c.holdDuration)
            return 'held';
        return 'opening';
    }
    /** Asymmetric lid curve: eased close, flat hold, slower eased reopen. */
    curve(t) {
        const c = this.config;
        if (t <= 0)
            return 0;
        if (t < c.closeDuration)
            return smoothstep(t / c.closeDuration);
        const held = c.closeDuration + c.holdDuration;
        if (t < held)
            return 1;
        const openT = (t - held) / c.openDuration;
        if (openT >= 1)
            return 0;
        return 1 - smoothstep(openT);
    }
    /** Spread intervals with two samples (bias toward the shorter end, long tail). */
    scheduleInterval(state) {
        const c = this.config;
        const scale = c.rateByState[state] ?? 1;
        const a = this.random.next();
        const b = this.random.next();
        const skewed = Math.min(a, b) * 0.65 + a * b * 0.35;
        return (c.minInterval + (c.maxInterval - c.minInterval) * skewed) * scale;
    }
}
//# sourceMappingURL=blink-controller.js.map