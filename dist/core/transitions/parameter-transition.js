// ---------------------------------------------------------------------------
// Curve implementation constants
// ---------------------------------------------------------------------------
const STEP_THRESHOLD = 0.5;
const SPRING_DEFAULT_AMPLITUDE = 1.0;
const SPRING_DEFAULT_FREQUENCY = 3.0;
const ELASTIC_DEFAULT_AMPLITUDE = 0.75;
const ELASTIC_DEFAULT_FREQUENCY = 10.0;
// ---------------------------------------------------------------------------
// Curve math (deterministic, zero-dependency)
// ---------------------------------------------------------------------------
function clamp01(v) {
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
}
function easeBase(t) {
    return t * t * (3 - 2 * t);
}
function biologicalBase(t) {
    return (1 - Math.cos(Math.PI * t)) * 0.5;
}
function springBase(t, amplitude, frequency) {
    return 1 - Math.exp(-6 * t) * Math.cos(frequency * Math.PI * t) * amplitude;
}
function elasticBase(t, amplitude, frequency) {
    if (t === 0 || t === 1)
        return t;
    const p = 0.3 / (2 * Math.PI);
    const a = amplitude;
    const s = p / 4;
    return (-a * Math.pow(2, 10 * (t - 1)) * Math.sin(((t - 1 - s) * (2 * Math.PI)) / p) * frequency * 0.1);
}
function bounceOutBase(t) {
    if (t < 1 / 2.75) {
        return 7.5625 * t * t;
    }
    else if (t < 2 / 2.75) {
        t -= 1.5 / 2.75;
        return 7.5625 * t * t + 0.75;
    }
    else if (t < 2.5 / 2.75) {
        t -= 2.25 / 2.75;
        return 7.5625 * t * t + 0.9375;
    }
    else {
        t -= 2.625 / 2.75;
        return 7.5625 * t * t + 0.984375;
    }
}
function sineBase(t) {
    return 1 - Math.cos((t * Math.PI) / 2);
}
function cubicBase(t) {
    return t * t * t;
}
function exponentialBase(t) {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
}
function applyCurve(t, curve, variant, overshoot) {
    let shaped;
    const amp = overshoot?.amplitude ??
        (curve === 'elastic' ? ELASTIC_DEFAULT_AMPLITUDE : SPRING_DEFAULT_AMPLITUDE);
    const freq = overshoot?.frequency ??
        (curve === 'elastic' ? ELASTIC_DEFAULT_FREQUENCY : SPRING_DEFAULT_FREQUENCY);
    switch (curve) {
        case 'ease':
            shaped = easeBase(t);
            break;
        case 'biological':
            shaped = biologicalBase(t);
            break;
        case 'spring':
            shaped = springBase(t, amp, freq);
            break;
        case 'step':
            shaped = t >= STEP_THRESHOLD ? 1 : 0;
            break;
        case 'elastic':
            shaped = 1 + elasticBase(t, amp, freq);
            break;
        case 'bounce':
            shaped =
                t < 0.5 ? (1 - bounceOutBase(1 - 2 * t)) * 0.5 : 0.5 + bounceOutBase(2 * t - 1) * 0.5;
            break;
        case 'sine':
            shaped = sineBase(t);
            break;
        case 'cubic':
            shaped = cubicBase(t);
            break;
        case 'exponential':
            shaped = exponentialBase(t);
            break;
        case 'linear':
        default:
            shaped = t;
            break;
    }
    if (variant !== 'easeInOut' && curve !== 'step') {
        shaped = applyVariantRaw(shaped, variant, curve);
    }
    return shaped;
}
function applyVariantRaw(shaped, variant, curve) {
    if (curve === 'spring' || curve === 'elastic' || curve === 'bounce')
        return shaped;
    switch (variant) {
        case 'easeIn':
            return shaped * shaped;
        case 'easeOut':
            return 1 - (1 - shaped) * (1 - shaped);
        case 'easeInOut':
            return shaped < 0.5 ? 2 * shaped * shaped : -1 + (4 - 2 * shaped) * shaped;
        default:
            return shaped;
    }
}
// ---------------------------------------------------------------------------
// Public API: create / sample / complete
// ---------------------------------------------------------------------------
export function createParameterTransition(definition, spec, now) {
    if (spec.duration < 0 || Number.isNaN(spec.duration)) {
        throw new Error(`Invalid transition duration for ${spec.path}`);
    }
    return {
        id: spec.id ?? `transition:${spec.path}:${now}`,
        path: spec.path,
        startValue: definition.get(spec.path),
        targetValue: spec.targetValue,
        startTime: now,
        duration: spec.duration,
        curve: spec.curve ?? 'linear',
        easeVariant: spec.easeVariant ?? 'easeInOut',
        overshoot: spec.overshoot,
    };
}
export function sampleTransition(transition, now) {
    if (transition.duration === 0)
        return transition.targetValue;
    const t = clamp01((now - transition.startTime) / transition.duration);
    const shaped = applyCurve(t, transition.curve, transition.easeVariant, transition.overshoot);
    return transition.startValue + (transition.targetValue - transition.startValue) * shaped;
}
export function transitionComplete(transition, now) {
    return now >= transition.startTime + transition.duration;
}
// ---------------------------------------------------------------------------
// TransitionTimeline â€“ manage multiple simultaneous transitions
// ---------------------------------------------------------------------------
export class TransitionTimeline {
    _active = [];
    _completed = [];
    _failed = [];
    get active() {
        return this._active;
    }
    get completed() {
        return this._completed;
    }
    get failed() {
        return this._failed;
    }
    add(transition) {
        if (transition.duration < 0) {
            this._failed.push({ transition, reason: 'Negative duration' });
            return;
        }
        this._active.push(transition);
    }
    addBatch(transitions) {
        for (const t of transitions)
            this.add(t);
    }
    sampleAll(now) {
        const out = new Map();
        for (const t of this._active) {
            try {
                out.set(t.path, sampleTransition(t, now));
            }
            catch (e) {
                this._failed.push({ transition: t, reason: String(e) });
            }
        }
        return out;
    }
    tick(now) {
        const results = [];
        const remaining = [];
        for (const t of this._active) {
            if (transitionComplete(t, now)) {
                results.push(t.targetValue);
                this._completed.push(t);
            }
            else {
                remaining.push(t);
            }
        }
        this._active = remaining;
        return results;
    }
    clearCompleted() {
        this._completed = [];
    }
    summary() {
        return {
            active: [...this._active],
            completed: [...this._completed],
            failed: [...this._failed],
            total: this._active.length + this._completed.length + this._failed.length,
        };
    }
    /** Remove a transition by id from the active set. */
    cancel(id) {
        const idx = this._active.findIndex((t) => t.id === id);
        if (idx < 0)
            return undefined;
        return this._active.splice(idx, 1)[0];
    }
    /** Remove all transitions for a given path. */
    cancelByPath(path) {
        const removed = [];
        this._active = this._active.filter((t) => {
            if (t.path === path) {
                removed.push(t);
                return false;
            }
            return true;
        });
        return removed;
    }
}
// ---------------------------------------------------------------------------
// Replay & determinism verification
// ---------------------------------------------------------------------------
/**
 * Replays a transition from start to finish at a fixed sample rate and returns
 * the sampled values. Deterministic: same inputs produce identical outputs.
 */
export function replayTransition(transition, sampleRate = 60) {
    const frames = [];
    const frameDuration = 1 / Math.max(1, sampleRate);
    const totalFrames = Math.ceil(transition.duration * sampleRate) + 1;
    for (let i = 0; i <= totalFrames; i++) {
        const t = transition.startTime + i * frameDuration;
        frames.push(sampleTransition(transition, t));
    }
    return frames;
}
/**
 * Verifies that replaying a transition lands on the expected end value.
 * Returns a TransitionBenchmark for measurement.
 */
export function verifyTransitionDeterminism(transition, tolerance = 1e-6) {
    const frames = replayTransition(transition);
    const actualEnd = frames[frames.length - 1];
    const absErr = Math.abs(actualEnd - transition.targetValue);
    return {
        transitionId: transition.id,
        path: transition.path,
        expectedEndValue: transition.targetValue,
        actualEndValue: actualEnd,
        absoluteError: absErr,
        withinTolerance: absErr <= tolerance,
    };
}
/**
 * Batch-verify determinism across multiple transitions.
 */
export function validateTransitionDeterminism(transitions, tolerance = 1e-6) {
    return transitions.map((t) => verifyTransitionDeterminism(t, tolerance));
}
//# sourceMappingURL=parameter-transition.js.map