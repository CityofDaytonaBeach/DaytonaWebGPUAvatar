import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';
export const DEFAULT_GAZE_CONFIG = {
    defaultAnchor: { x: 0, y: 1.62, z: 1.6 },
    saccadeRadius: 0.05,
    minDwell: 0.5,
    maxDwell: 2.1,
    contactDuration: 5.5,
    breakDuration: 1.1,
    breakOffset: { x: 0.22, y: -0.1, z: 0 },
    thinkingOffset: { x: 0.2, y: 0.26, z: -0.15 },
    smoothing: 0.18,
    intensityByState: { idle: 0.55, listening: 0.95, thinking: 0.6, speaking: 0.85 },
    seed: 0x9a17,
};
export class GazeController {
    config;
    random;
    anchor = null;
    saccade = { x: 0, y: 0, z: 0 };
    dwell = 0;
    contactElapsed = 0;
    breakElapsed = 0;
    breaking = false;
    smoothed;
    saccades = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_GAZE_CONFIG, ...config };
        this.random = new KioskRandom(this.config.seed);
        this.smoothed = { ...this.config.defaultAnchor };
        this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
    }
    /** Person detection feeds the visitor's head position here (or null when lost). */
    setAttentionAnchor(anchor) {
        this.anchor = anchor ? { ...anchor } : null;
    }
    /** Force immediate eye contact (used when a visitor arrives or interrupts). */
    reacquire() {
        this.breaking = false;
        this.breakElapsed = 0;
        this.contactElapsed = 0;
        this.saccade = { x: 0, y: 0, z: 0 };
        this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
    }
    reset() {
        this.random.reseed(this.config.seed);
        this.anchor = null;
        this.saccade = { x: 0, y: 0, z: 0 };
        this.contactElapsed = 0;
        this.breakElapsed = 0;
        this.breaking = false;
        this.saccades = 0;
        this.smoothed = { ...this.config.defaultAnchor };
        this.dwell = this.random.range(this.config.minDwell, this.config.maxDwell);
    }
    tick(dt, state = 'idle') {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        const c = this.config;
        const tracking = this.anchor !== null;
        const base = this.anchor ?? c.defaultAnchor;
        // Saccade scheduling.
        this.dwell -= step;
        if (this.dwell <= 0) {
            const r = c.saccadeRadius;
            this.saccade = {
                x: this.random.signed(r),
                y: this.random.signed(r * 0.6),
                z: this.random.signed(r * 0.3),
            };
            this.dwell = this.random.range(c.minDwell, c.maxDwell);
            this.saccades += 1;
        }
        // Eye-contact rhythm — only meaningful while a visitor is tracked.
        let mode = tracking ? 'contact' : 'ambient';
        if (state === 'thinking') {
            mode = 'averted';
            this.contactElapsed = 0;
            this.breaking = false;
            this.breakElapsed = 0;
        }
        else if (tracking) {
            if (this.breaking) {
                this.breakElapsed += step;
                mode = 'break';
                if (this.breakElapsed >= c.breakDuration) {
                    this.breaking = false;
                    this.breakElapsed = 0;
                    this.contactElapsed = 0;
                }
            }
            else {
                this.contactElapsed += step;
                if (this.contactElapsed >= c.contactDuration) {
                    this.breaking = true;
                    this.breakElapsed = 0;
                    mode = 'break';
                }
            }
        }
        const offset = mode === 'averted'
            ? c.thinkingOffset
            : mode === 'break'
                ? c.breakOffset
                : { x: 0, y: 0, z: 0 };
        const desired = {
            x: base.x + this.saccade.x + offset.x,
            y: base.y + this.saccade.y + offset.y,
            z: base.z + this.saccade.z + offset.z,
        };
        // Critically-damped-ish pursuit: exponential approach, framerate independent.
        const alpha = c.smoothing <= 0 ? 1 : clamp01(1 - Math.exp(-step / c.smoothing));
        const eased = smoothstep(alpha);
        this.smoothed = {
            x: this.smoothed.x + (desired.x - this.smoothed.x) * eased,
            y: this.smoothed.y + (desired.y - this.smoothed.y) * eased,
            z: this.smoothed.z + (desired.z - this.smoothed.z) * eased,
        };
        return {
            target: { ...this.smoothed },
            desired,
            mode,
            intensity: c.intensityByState[state] ?? 0.7,
            tracking,
            saccades: this.saccades,
        };
    }
}
//# sourceMappingURL=gaze-controller.js.map