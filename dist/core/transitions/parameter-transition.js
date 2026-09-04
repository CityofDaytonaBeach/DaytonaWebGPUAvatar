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
/** Damped spring, pinned at both endpoints so the value settles on target. */
function springBase(t, amplitude, frequency) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return 1 - Math.exp(-6 * t) * Math.cos(frequency * Math.PI * t) * amplitude;
}
/**
 * Decaying elastic ease-out. Pinned at both endpoints (0 -> 0, 1 -> 1) so a
 * transition always settles exactly on its target value; `amplitude` and
 * `frequency` only shape the overshoot in between.
 */
function elasticBase(t, amplitude, frequency) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    const omega = ((2 * Math.PI) / 3) * Math.max(0.1, frequency * 0.1);
    return amplitude * Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * omega) + 1;
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
            shaped = elasticBase(t, amp, freq);
            break;
        case 'bounce':
            shaped =
                t <= 0
                    ? 0
                    : t >= 1
                        ? 1
                        : t < 0.5
                            ? (1 - bounceOutBase(1 - 2 * t)) * 0.5
                            : 0.5 + bounceOutBase(2 * t - 1) * 0.5;
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
/**
 * Replay a transition over a long window (default 10 simulated minutes at
 * 120Hz) twice and compare the passes. Catches accumulated-time drift, late
 * jitter after completion, and any non-determinism in the curve evaluation.
 */
export function verifyLongReplay(transition, options = {}) {
    const sampleRate = Math.max(1, options.sampleRate ?? 120);
    const window = Math.max(transition.duration, options.durationSeconds ?? 600);
    const tolerance = options.tolerance ?? 1e-9;
    const frameCount = Math.floor(window * sampleRate) + 1;
    const pass = () => {
        const out = new Array(frameCount);
        for (let i = 0; i < frameCount; i++) {
            // Absolute time per frame (never accumulated) so drift cannot creep in.
            out[i] = sampleTransition(transition, transition.startTime + i / sampleRate);
        }
        return out;
    };
    const first = pass();
    const second = pass();
    let maxDeviation = 0;
    let finite = true;
    for (let i = 0; i < frameCount; i++) {
        maxDeviation = Math.max(maxDeviation, Math.abs(first[i] - second[i]));
        if (!Number.isFinite(first[i]))
            finite = false;
    }
    const settleFrame = Math.ceil(transition.duration * sampleRate);
    let settled = true;
    for (let i = settleFrame; i < frameCount; i++) {
        if (Math.abs(first[i] - transition.targetValue) > tolerance)
            settled = false;
    }
    const endValue = first[frameCount - 1];
    return {
        transitionId: transition.id,
        frames: frameCount,
        sampleRate,
        endValue,
        absoluteError: Math.abs(endValue - transition.targetValue),
        deterministic: maxDeviation <= tolerance,
        maxReplayDeviation: maxDeviation,
        finite,
        settled,
    };
}
/**
 * Scrub a transition at arbitrary times, forwards or backwards. Sampling is
 * stateless, so a shuffled scrub must reproduce the ordered scrub exactly —
 * this is what makes timeline scrubbing safe in an editor.
 */
export function scrubTransition(transition, times, options = {}) {
    const tolerance = options.tolerance ?? 1e-12;
    const ordered = times.map((t) => sampleTransition(transition, t));
    // Deterministic shuffle (no Math.random) so the check itself is reproducible.
    const indices = times.map((_, i) => i);
    for (let i = indices.length - 1 > 0 ? indices.length - 1 : 0; i > 0; i--) {
        const j = (i * 2654435761) % (i + 1);
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const shuffled = new Array(times.length);
    for (const i of indices)
        shuffled[i] = sampleTransition(transition, times[i]);
    let maxOrderDeviation = 0;
    for (let i = 0; i < ordered.length; i++) {
        maxOrderDeviation = Math.max(maxOrderDeviation, Math.abs(ordered[i] - shuffled[i]));
    }
    // Out-of-range scrubs must clamp to the endpoints (t is clamped to [0,1]).
    const atStart = sampleTransition(transition, transition.startTime);
    const atEnd = sampleTransition(transition, transition.startTime + transition.duration);
    const before = sampleTransition(transition, transition.startTime - 5);
    const after = sampleTransition(transition, transition.startTime + transition.duration + 5);
    const clamped = Math.abs(before - atStart) <= tolerance && Math.abs(after - atEnd) <= tolerance;
    return {
        transitionId: transition.id,
        times: [...times],
        values: ordered,
        orderIndependent: maxOrderDeviation <= tolerance,
        maxOrderDeviation,
        clamped,
    };
}
/**
 * Scrub every active transition on a timeline to one point in time. Returns the
 * per-path values; repeated calls at the same time are identical, and calls at
 * decreasing times are as valid as increasing ones (no internal cursor).
 */
export function scrubTimeline(timeline, times) {
    return times.map((t) => timeline.sampleAll(t));
}
//# sourceMappingURL=parameter-transition.js.map