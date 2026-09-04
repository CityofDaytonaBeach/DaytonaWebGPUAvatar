import { KioskBehavior, } from './kiosk-behavior.js';
import { KioskRandom } from './kiosk-random.js';
export const DEFAULT_KIOSK_SOAK_OPTIONS = {
    hours: 2,
    dt: 1 / 30,
    seed: 0x7c0a,
    interruptChance: 0.25,
};
/** Deterministic visitor traffic: arrive → ask → think → speak → (interrupt) → leave. */
export function buildKioskSoakScript(options) {
    const random = new KioskRandom(options.seed);
    const steps = [];
    const total = options.hours * 3600;
    let t = 5;
    while (t < total) {
        const arrive = t;
        const ask = arrive + random.range(1.5, 4);
        const think = ask + random.range(0.8, 2.5);
        const answer = think + random.range(1.2, 3.5);
        const interrupts = random.chance(options.interruptChance);
        const speakFor = random.range(4, 18);
        const end = answer + (interrupts ? speakFor * 0.4 : speakFor);
        steps.push({ at: arrive, action: 'arrive' });
        steps.push({ at: ask, action: 'ask' });
        steps.push({ at: think, action: 'think' });
        steps.push({ at: answer, action: 'answer' });
        steps.push({ at: end, action: interrupts ? 'interrupt' : 'finish' });
        const leave = end + random.range(1, 6);
        steps.push({ at: leave, action: 'leave' });
        t = leave + random.range(4, 40);
    }
    return steps;
}
export function runKioskSoak(options = {}) {
    const opts = { ...DEFAULT_KIOSK_SOAK_OPTIONS, ...options };
    const behavior = new KioskBehavior(opts.behavior ?? {});
    const script = buildKioskSoakScript(opts);
    const anchor = { x: 0.05, y: 1.6, z: 1.5 };
    const totalSeconds = opts.hours * 3600;
    const stepCount = Math.floor(totalSeconds / opts.dt);
    const stateSeconds = {
        idle: 0,
        listening: 0,
        thinking: 0,
        speaking: 0,
    };
    let conversations = 0;
    let interruptions = 0;
    let blinks = 0;
    let gestures = 0;
    let saccades = 0;
    let lastBlinkAt = 0;
    let minGap = Number.POSITIVE_INFINITY;
    let maxGap = 0;
    let maxAttendedGap = 0;
    let gapSum = 0;
    let gapCount = 0;
    let maxGazeDistance = 0;
    let finite = true;
    let visitorPresent = false;
    let currentState = 'idle';
    let currentStateSeconds = 0;
    let longestState = { state: 'idle', seconds: 0 };
    let hash = 0x811c9dc5;
    let cursor = 0;
    let clock = 0;
    const mix = (value) => {
        const q = Math.round(value * 1e4) | 0;
        hash = (hash ^ q) >>> 0;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    };
    for (let i = 0; i < stepCount; i += 1) {
        clock += opts.dt;
        while (cursor < script.length && script[cursor].at <= clock) {
            const step = script[cursor];
            cursor += 1;
            switch (step.action) {
                case 'arrive':
                    conversations += 1;
                    visitorPresent = true;
                    behavior.setVisitor(anchor);
                    break;
                case 'ask':
                    behavior.listen();
                    break;
                case 'think':
                    behavior.think();
                    break;
                case 'answer':
                    behavior.speak();
                    break;
                case 'interrupt':
                    if (behavior.interrupt())
                        interruptions += 1;
                    break;
                case 'finish':
                    behavior.finishSpeaking();
                    break;
                case 'leave':
                    visitorPresent = false;
                    behavior.setVisitor(null);
                    break;
            }
        }
        if (behavior.currentState === 'speaking') {
            behavior.setSpeechEnergy(0.5 + 0.5 * Math.sin(clock * 7.3));
        }
        const frame = behavior.tick(opts.dt);
        if (frame.state === currentState) {
            currentStateSeconds += opts.dt;
        }
        else {
            if (currentStateSeconds > longestState.seconds) {
                longestState = { state: currentState, seconds: currentStateSeconds };
            }
            currentState = frame.state;
            currentStateSeconds = opts.dt;
        }
        stateSeconds[frame.state] += opts.dt;
        if (frame.blink.started) {
            const gap = frame.time - lastBlinkAt;
            if (blinks > 0) {
                minGap = Math.min(minGap, gap);
                maxGap = Math.max(maxGap, gap);
                gapSum += gap;
                gapCount += 1;
                if (visitorPresent)
                    maxAttendedGap = Math.max(maxAttendedGap, gap);
            }
            lastBlinkAt = frame.time;
            blinks += 1;
        }
        const base = frame.gaze.tracking ? anchor : { x: 0, y: 1.62, z: 1.6 };
        const dx = frame.lookAtTarget.x - base.x;
        const dy = frame.lookAtTarget.y - base.y;
        const dz = frame.lookAtTarget.z - base.z;
        maxGazeDistance = Math.max(maxGazeDistance, Math.hypot(dx, dy, dz));
        const values = [
            frame.blink.closure,
            frame.idle.headYaw,
            frame.idle.headPitch,
            frame.idle.headRoll,
            frame.idle.breath,
            frame.lookAtTarget.x,
            frame.lookAtTarget.y,
            frame.lookAtTarget.z,
        ];
        for (const v of values) {
            if (!Number.isFinite(v))
                finite = false;
            mix(v);
        }
        gestures = frame.idle.gestureCount;
        saccades = frame.gaze.saccades;
    }
    if (currentStateSeconds > longestState.seconds) {
        longestState = { state: currentState, seconds: currentStateSeconds };
    }
    return {
        frames: stepCount,
        simulatedSeconds: clock,
        conversations,
        interruptions,
        blinks,
        gestures,
        saccades,
        minBlinkGap: Number.isFinite(minGap) ? minGap : 0,
        maxBlinkGap: maxGap,
        meanBlinkGap: gapCount > 0 ? gapSum / gapCount : 0,
        maxAttendedBlinkGap: maxAttendedGap,
        maxGazeDistance,
        stateSeconds,
        longestState,
        finite,
        fingerprint: (hash >>> 0).toString(16).padStart(8, '0'),
    };
}
//# sourceMappingURL=kiosk-soak.js.map