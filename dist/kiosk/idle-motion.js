import { KioskRandom, clamp01, smoothstep } from './kiosk-random.js';
export const DEFAULT_IDLE_MOTION_CONFIG = {
    breathRate: 13,
    breathAmplitude: 0.55,
    headDrift: 0.035,
    swayAmplitude: 0.02,
    swayPeriod: 9.3,
    amplitudeByState: { idle: 1, listening: 0.7, thinking: 0.85, speaking: 1.15 },
    gestureIntervalByState: { idle: 26, listening: 14, thinking: 18, speaking: 9 },
    gesturesByState: {
        idle: ['shrug', 'nod'],
        listening: ['nod', 'nod head'],
        thinking: ['shrug'],
        speaking: ['nod', 'shrug'],
    },
    postureBlend: 0.45,
    seed: 0x3f27,
};
export class IdleMotion {
    config;
    random;
    clock = 0;
    gestureCountdown;
    gestures = 0;
    posture = 'idle';
    postureWeight = 1;
    previousPosture = 'idle';
    speechEnergy = 0;
    gesturesEnabled = true;
    constructor(config = {}) {
        this.config = { ...DEFAULT_IDLE_MOTION_CONFIG, ...config };
        this.random = new KioskRandom(this.config.seed);
        this.gestureCountdown = this.scheduleGesture('idle');
    }
    setState(state) {
        if (state === this.posture)
            return;
        this.previousPosture = this.posture;
        this.posture = state;
        this.postureWeight = 0;
        this.gestureCountdown = this.scheduleGesture(state);
    }
    /** 0..1 speech loudness for this frame; drives speaking head accents. */
    setSpeechEnergy(energy) {
        this.speechEnergy = clamp01(energy);
    }
    /** Turn small gestures off (e.g. during an interruption or a scripted beat). */
    setGesturesEnabled(enabled) {
        this.gesturesEnabled = enabled;
    }
    reset() {
        this.random.reseed(this.config.seed);
        this.clock = 0;
        this.gestures = 0;
        this.posture = 'idle';
        this.previousPosture = 'idle';
        this.postureWeight = 1;
        this.speechEnergy = 0;
        this.gesturesEnabled = true;
        this.gestureCountdown = this.scheduleGesture('idle');
    }
    tick(dt) {
        const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.clock += step;
        const c = this.config;
        if (this.postureWeight < 1) {
            this.postureWeight =
                c.postureBlend <= 0 ? 1 : Math.min(1, this.postureWeight + step / c.postureBlend);
        }
        const t = this.clock;
        const amp = this.blend(c.amplitudeByState[this.previousPosture] ?? 1, c.amplitudeByState[this.posture] ?? 1);
        // Incommensurate periods: the composite never visibly repeats.
        const headYaw = c.headDrift * amp * (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.113 + 1.7) * 0.4);
        const breath = clamp01(0.5 + 0.5 * Math.sin((t * 2 * Math.PI * c.breathRate) / 60 - Math.PI / 2));
        const breathPitch = (breath - 0.5) * 0.012 * c.breathAmplitude;
        const accent = this.posture === 'speaking' ? this.speechEnergy * 0.05 * Math.sin(t * 6.1) : 0;
        const headPitch = c.headDrift * amp * 0.6 * Math.sin(t * 0.29 + 0.5) +
            breathPitch +
            accent +
            this.posturePitch();
        const headRoll = c.headDrift * amp * 0.5 * Math.sin(t * 0.211 + 2.4) + this.postureRoll();
        const sway = c.swayAmplitude * amp * Math.sin((t * 2 * Math.PI) / c.swayPeriod);
        const lean = this.blend(this.leanFor(this.previousPosture), this.leanFor(this.posture));
        let gesture = null;
        const interval = c.gestureIntervalByState[this.posture] ?? 0;
        if (this.gesturesEnabled && interval > 0) {
            this.gestureCountdown -= step;
            if (this.gestureCountdown <= 0) {
                const pool = c.gesturesByState[this.posture] ?? [];
                if (pool.length > 0) {
                    gesture = this.random.pick(pool);
                    this.gestures += 1;
                }
                this.gestureCountdown = this.scheduleGesture(this.posture);
            }
        }
        return {
            time: t,
            headYaw,
            headPitch,
            headRoll,
            sway,
            breath,
            lean,
            expression: this.postureExpression(breath),
            gesture,
            gestureCount: this.gestures,
        };
    }
    blend(from, to) {
        return from + (to - from) * smoothstep(this.postureWeight);
    }
    leanFor(state) {
        switch (state) {
            case 'listening':
                return 0.045;
            case 'thinking':
                return -0.02;
            case 'speaking':
                return 0.02;
            default:
                return 0;
        }
    }
    postureRoll() {
        return this.blend(this.rollFor(this.previousPosture), this.rollFor(this.posture));
    }
    rollFor(state) {
        return state === 'listening' ? 0.055 : state === 'thinking' ? -0.03 : 0;
    }
    posturePitch() {
        return this.blend(this.pitchFor(this.previousPosture), this.pitchFor(this.posture));
    }
    pitchFor(state) {
        return state === 'thinking' ? 0.06 : state === 'listening' ? -0.015 : 0;
    }
    postureExpression(breath) {
        const listening = this.weightOf('listening');
        const thinking = this.weightOf('thinking');
        return {
            'expression.browInnerUp': listening * 0.18,
            'expression.browDownLeft': thinking * 0.22,
            'expression.browDownRight': thinking * 0.22,
            'expression.eyeSquintLeft': thinking * 0.14,
            'expression.eyeSquintRight': thinking * 0.14,
            'expression.mouthPucker': thinking * 0.1,
            'expression.cheekSquintLeft': breath * 0.02,
            'expression.cheekSquintRight': breath * 0.02,
        };
    }
    weightOf(state) {
        const w = smoothstep(this.postureWeight);
        if (this.posture === state)
            return w;
        if (this.previousPosture === state)
            return 1 - w;
        return 0;
    }
    scheduleGesture(state) {
        const mean = this.config.gestureIntervalByState[state] ?? 0;
        if (mean <= 0)
            return Number.POSITIVE_INFINITY;
        return mean * this.random.range(0.6, 1.5);
    }
}
//# sourceMappingURL=idle-motion.js.map