export const QUALITY_LEVELS = ['OFF', 'LOW', 'MED', 'HIGH', 'ULTRA'];
/** Built-in profiles. Deterministic and immutable. */
export const LOD_PRESETS = [
    {
        name: 'cinematic',
        budget: 18,
        focusOn: 'face',
        quality: {
            [4096 /* PropertyCategory.Face */]: 'ULTRA',
            [6144 /* PropertyCategory.Eyes */]: 'ULTRA',
            [5120 /* PropertyCategory.Skin */]: 'ULTRA',
            [7168 /* PropertyCategory.Hair */]: 'HIGH',
            [8192 /* PropertyCategory.Expression */]: 'ULTRA',
            [3072 /* PropertyCategory.Body */]: 'HIGH',
            [2048 /* PropertyCategory.Skeleton */]: 'ULTRA',
            [12288 /* PropertyCategory.Attachment */]: 'MED',
            [10240 /* PropertyCategory.Physics */]: 'HIGH',
            [0 /* PropertyCategory.Global */]: 'HIGH',
            [1024 /* PropertyCategory.Identity */]: 'ULTRA',
            [9216 /* PropertyCategory.Animation */]: 'ULTRA',
            [11264 /* PropertyCategory.LOD */]: 'HIGH',
        },
    },
    {
        name: 'closeup',
        budget: 16,
        focusOn: 'face',
        quality: {
            [4096 /* PropertyCategory.Face */]: 'ULTRA',
            [6144 /* PropertyCategory.Eyes */]: 'ULTRA',
            [5120 /* PropertyCategory.Skin */]: 'HIGH',
            [7168 /* PropertyCategory.Hair */]: 'HIGH',
            [8192 /* PropertyCategory.Expression */]: 'ULTRA',
            [3072 /* PropertyCategory.Body */]: 'MED',
            [2048 /* PropertyCategory.Skeleton */]: 'HIGH',
            [12288 /* PropertyCategory.Attachment */]: 'MED',
            [10240 /* PropertyCategory.Physics */]: 'MED',
            [0 /* PropertyCategory.Global */]: 'HIGH',
            [1024 /* PropertyCategory.Identity */]: 'HIGH',
            [9216 /* PropertyCategory.Animation */]: 'HIGH',
            [11264 /* PropertyCategory.LOD */]: 'MED',
        },
    },
    {
        name: 'medium',
        budget: 12,
        focusOn: 'body',
        quality: {
            [4096 /* PropertyCategory.Face */]: 'HIGH',
            [6144 /* PropertyCategory.Eyes */]: 'HIGH',
            [5120 /* PropertyCategory.Skin */]: 'MED',
            [7168 /* PropertyCategory.Hair */]: 'MED',
            [8192 /* PropertyCategory.Expression */]: 'MED',
            [3072 /* PropertyCategory.Body */]: 'HIGH',
            [2048 /* PropertyCategory.Skeleton */]: 'MED',
            [12288 /* PropertyCategory.Attachment */]: 'LOW',
            [10240 /* PropertyCategory.Physics */]: 'MED',
            [0 /* PropertyCategory.Global */]: 'MED',
            [1024 /* PropertyCategory.Identity */]: 'MED',
            [9216 /* PropertyCategory.Animation */]: 'MED',
            [11264 /* PropertyCategory.LOD */]: 'MED',
        },
    },
    {
        name: 'far',
        budget: 8,
        focusOn: 'none',
        quality: {
            [4096 /* PropertyCategory.Face */]: 'LOW',
            [6144 /* PropertyCategory.Eyes */]: 'LOW',
            [5120 /* PropertyCategory.Skin */]: 'LOW',
            [7168 /* PropertyCategory.Hair */]: 'LOW',
            [8192 /* PropertyCategory.Expression */]: 'LOW',
            [3072 /* PropertyCategory.Body */]: 'MED',
            [2048 /* PropertyCategory.Skeleton */]: 'LOW',
            [12288 /* PropertyCategory.Attachment */]: 'OFF',
            [10240 /* PropertyCategory.Physics */]: 'LOW',
            [0 /* PropertyCategory.Global */]: 'LOW',
            [1024 /* PropertyCategory.Identity */]: 'MED',
            [9216 /* PropertyCategory.Animation */]: 'MED',
            [11264 /* PropertyCategory.LOD */]: 'LOW',
        },
    },
];
/** Stable ordering of subsystems, used for deterministic iteration. */
export const LOD_SUBSYSTEMS = [
    0 /* PropertyCategory.Global */,
    1024 /* PropertyCategory.Identity */,
    2048 /* PropertyCategory.Skeleton */,
    3072 /* PropertyCategory.Body */,
    4096 /* PropertyCategory.Face */,
    5120 /* PropertyCategory.Skin */,
    6144 /* PropertyCategory.Eyes */,
    7168 /* PropertyCategory.Hair */,
    8192 /* PropertyCategory.Expression */,
    9216 /* PropertyCategory.Animation */,
    10240 /* PropertyCategory.Physics */,
    11264 /* PropertyCategory.LOD */,
    12288 /* PropertyCategory.Attachment */,
];
/**
 * Perceptual weighting functions. Face/eyes/skin weigh higher than body â€”
 * a human observer notices errors there first, so those subsystems deserve a
 * larger share of the quality budget.
 */
const PERCEPTUAL_WEIGHTS = {
    [4096 /* PropertyCategory.Face */]: 1.6,
    [6144 /* PropertyCategory.Eyes */]: 1.7,
    [5120 /* PropertyCategory.Skin */]: 1.4,
    [8192 /* PropertyCategory.Expression */]: 1.2,
    [7168 /* PropertyCategory.Hair */]: 1.0,
    [2048 /* PropertyCategory.Skeleton */]: 0.9,
    [9216 /* PropertyCategory.Animation */]: 0.9,
    [3072 /* PropertyCategory.Body */]: 0.7,
    [12288 /* PropertyCategory.Attachment */]: 0.5,
    [10240 /* PropertyCategory.Physics */]: 0.6,
    [0 /* PropertyCategory.Global */]: 0.8,
    [1024 /* PropertyCategory.Identity */]: 0.8,
    [11264 /* PropertyCategory.LOD */]: 0.8,
};
/** Perceptual importance weight of a subsystem (higher => more important). */
export function perceptualWeight(category) {
    return PERCEPTUAL_WEIGHTS[category] ?? 0.8;
}
/** Cost (relative vertex/compute weight) of a single quality level. */
export const QUALITY_COST = {
    0: 0.25, // OFF
    1: 0.5, // LOW
    2: 0.75, // MED
    3: 1.0, // HIGH
    4: 1.25, // ULTRA
};
/** Incremental cost of moving one level upward, from OFF (index). */
export const QUALITY_INCREMENT = [0.25, 0.25, 0.25, 0.25];
/**
 * Human semantic LOD. Reduces quality per-human-subsystem, not uniformly.
 * The face/eyes/skin/hands are weighted separately from body/clothing.
 */
export class SemanticLOD {
    quality = new Map(); // 0..4 (index into QUALITY_LEVELS)
    set(category, level) {
        this.quality.set(category, QUALITY_LEVELS.indexOf(level));
    }
    levelFor(category) {
        return QUALITY_LEVELS[this.quality.get(category) ?? 4] ?? 'HIGH';
    }
    numeric(category) {
        return this.quality.get(category) ?? 4;
    }
    /** Sum of numeric levels across all subsystems (quality budget used). */
    total() {
        let sum = 0;
        for (const c of LOD_SUBSYSTEMS)
            sum += this.quality.get(c) ?? 4;
        return sum;
    }
}
/**
 * Tracks and animates quality transitions per subsystem so quality changes
 * lerp smoothly over time instead of popping between levels.
 */
export class LODTransitionManager {
    transitions = new Map();
    /** Request a transition toward `target` over `duration` ms (default 250). */
    transition(category, target, duration = 250) {
        const current = this.transitions.get(category);
        this.transitions.set(category, {
            from: current ? current.to : target,
            to: target,
            start: current ? current.elapsed : 0,
            duration: Math.max(1, duration),
            elapsed: 0,
        });
    }
    /** Advance all transitions by `dt` ms. Returns true if any is still active. */
    update(dt) {
        let active = false;
        for (const [, t] of this.transitions) {
            t.elapsed += dt;
            if (t.elapsed < t.duration)
                active = true;
        }
        return active;
    }
    /** Current smoothly-blended numeric level for a subsystem. */
    current(category) {
        const t = this.transitions.get(category);
        if (!t)
            return 0;
        const k = Math.min(1, t.elapsed / t.duration);
        const eased = k * k * (3 - 2 * k); // smoothstep
        return t.from + (t.to - t.from) * eased;
    }
    /** 0..1 progress of the binding transition, or 1 when idle. */
    progress(category) {
        const t = this.transitions.get(category);
        if (!t)
            return 1;
        return Math.min(1, t.elapsed / t.duration);
    }
    /** True once every active transition has completed. */
    isIdle() {
        for (const [, t] of this.transitions) {
            if (t.elapsed < t.duration)
                return false;
        }
        return true;
    }
}
const DEFAULT_ALLOCATOR_CONFIG = {
    floor: 1,
    cap: 4,
    faceBias: 0.5,
};
/**
 * Distributes a quality budget across subsystems based on perceptual
 * importance and camera proximity. Deterministic: given the same inputs it
 * always yields the same assignment. Subsystems already at their floor are
 * never starved below it.
 */
export class BudgetAllocator {
    cfg;
    constructor(cfg = {}) {
        this.cfg = { ...DEFAULT_ALLOCATOR_CONFIG, ...cfg };
    }
    /**
     * Allocate `budget` numeric levels across all subsystems given an optional
     * distance hint (smaller = closer) and focus target.
     * Returns a map of category -> numeric level.
     */
    allocate(budget, distance = 2, focusOn = 'none') {
        const out = new Map();
        let remaining = Math.max(0, budget);
        // Start every subsystem at the floor.
        for (const c of LOD_SUBSYSTEMS)
            out.set(c, this.cfg.floor);
        const prox = distance;
        const weights = new Map();
        for (const c of LOD_SUBSYSTEMS) {
            const w = perceptualWeight(c) * this.proximityFactor(c, prox, focusOn);
            weights.set(c, w);
        }
        // Greedy allocation: repeatedly raise the most-important (cheapest)
        // below-cap subsystem that still fits within the remaining budget.
        while (remaining > 0) {
            let best = null;
            let bestScore = -Infinity;
            for (const c of LOD_SUBSYSTEMS) {
                const cur = out.get(c);
                if (cur >= this.cfg.cap)
                    continue;
                const score = weights.get(c) / QUALITY_INCREMENT[cur];
                if (score > bestScore) {
                    bestScore = score;
                    best = c;
                }
            }
            if (best === null)
                break;
            const cur = out.get(best);
            const inc = QUALITY_INCREMENT[cur];
            if (inc > remaining)
                break;
            out.set(best, cur + 1);
            remaining -= inc;
        }
        return out;
    }
    /**
     * Blend perceptual weight with a proximity boost for high-importance
     * subsystems. The boost is stronger when the camera is close and focused
     * on the face/hands; it fades once the subject recedes past 8m.
     */
    proximityFactor(category, distance, focusOn) {
        const isHighValue = category === 4096 /* PropertyCategory.Face */ ||
            category === 6144 /* PropertyCategory.Eyes */ ||
            category === 5120 /* PropertyCategory.Skin */ ||
            category === 8192 /* PropertyCategory.Expression */ ||
            (focusOn === 'hand' && category === 12288 /* PropertyCategory.Attachment */);
        if (!isHighValue)
            return 1;
        const near = Math.max(0, 1 - distance / 8.0); // 1 at camera, 0 past 8m
        const focusBoost = focusOn === 'face' && category !== 12288 /* PropertyCategory.Attachment */ ? 1.3 : 1;
        return 1 + near * this.cfg.faceBias * 2 * focusBoost;
    }
}
/**
 * Convenience: snap a fully blended float level to the nearest SubsystemQuality.
 */
export function snapLevel(numeric) {
    return QUALITY_LEVELS[Math.round(Math.min(4, Math.max(0, numeric)))] ?? 'HIGH';
}
/**
 * Monotonic distance-based quality redistribution. Returns a base budget for
 * the current camera distance. Uses a smooth falloff so the budget shrinks
 * steadily as the subject recedes rather than popping between discrete steps.
 */
export function budgetForDistance(distance, maxBudget = 16, minBudget = 5) {
    const k = Math.min(1, distance / 12);
    const eased = k * k * (3 - 2 * k);
    return maxBudget - (maxBudget - minBudget) * eased;
}
/**
 * Perceptual LOD: computes importance from screen coverage, semantic weight,
 * focus, motion and lighting. Higher importance => keep full fidelity.
 */
export class PerceptualLOD {
    screenHeight;
    semantic = new SemanticLOD();
    transitions = new LODTransitionManager();
    allocator = new BudgetAllocator();
    stats = {
        verticesSaved: 0,
        computePassesReduced: 0,
        activeTransitions: 0,
        budgetUsed: 0,
        budgetCapacity: 0,
        lastMaskSize: 0,
    };
    _report = null;
    constructor(screenHeight = 1080) {
        this.screenHeight = screenHeight;
    }
    /** Estimate importance of a region given its on-screen coverage (0..1). */
    scoreRegion(semanticWeight, coverage, focus = 0) {
        return Math.min(1, semanticWeight * coverage * (0.5 + focus * 0.5));
    }
    /** Smoothly advance transitions; call once per frame with frame dt in ms. */
    update(dt) {
        this.transitions.update(dt);
    }
    /**
     * Camera-dependent redistribution: given camera distance and a preset name,
     * derive a budget, allocate it across subsystems (weighted), and drive each
     * subsystem through a smooth transition toward its new level.
     */
    redistribute(distance, preset = 'medium', focusOn, duration = 250) {
        const p = this.preset(preset);
        const focus = focusOn ?? p.focusOn;
        const budget = Math.min(p.budget, budgetForDistance(distance, p.budget, Math.floor(p.budget / 2)));
        const assigned = this.allocator.allocate(budget, distance, focus);
        for (const c of LOD_SUBSYSTEMS) {
            const target = assigned.get(c);
            const base = this.semantic.numeric(c);
            if (base !== target) {
                this.transitions.transition(c, target, duration);
            }
            this.semantic.set(c, snapLevel(target));
        }
        this.stats.budgetUsed = assignedTotal(assigned);
        this.stats.budgetCapacity = budget;
        return assigned;
    }
    /** Snapshot the current state as a debug LODReport. */
    report(distance, focusOn = 'none') {
        const assigned = [];
        const perf = [];
        for (const c of LOD_SUBSYSTEMS) {
            assigned.push({
                category: c,
                level: this.semantic.levelFor(c),
                numeric: this.transitions.current(c),
                weight: perceptualWeight(c),
            });
            perf.push({ subsystem: c, importance: perceptualWeight(c) / 1.7 });
        }
        const active = countActive(this.transitions);
        this.stats.activeTransitions = active;
        const report = {
            presets: LOD_PRESETS.map((p) => p.name),
            distance,
            focusOn,
            transitionManager: this.transitions,
            assignments: assigned,
            stats: { ...this.stats },
            perf,
        };
        this._report = report;
        return report;
    }
    /** Read the most recently built report, or build one on demand. */
    lastReport() {
        if (this._report)
            return this._report;
        return this.report(4);
    }
    /** Access the running statistics. */
    getStats() {
        return { ...this.stats };
    }
    /** Reset stats counters while keeping allocations intact. */
    resetStats() {
        this.stats.verticesSaved = 0;
        this.stats.computePassesReduced = 0;
    }
    preset(name) {
        for (const p of LOD_PRESETS)
            if (p.name === name)
                return p;
        return LOD_PRESETS[1]; // closeup fallback
    }
    /**
     * Build a set of kernels to execute given camera proximity and focus.
     * Close face â†’ face/eyes/skin high; distant full-body â†’ reduce micro detail.
     */
    lodMask(distance, focusOn) {
        // Mirror the existing behavior but drive the mask from the current budget.
        const budget = budgetForDistance(distance);
        const mask = new Set([
            'Skinning',
            'Skeleton',
            'SparseMorph',
            'MorphAccumulation',
            'Corrective',
        ]);
        const baseCount = mask.size;
        if (distance < 3 && (focusOn === 'face' || focusOn === 'none')) {
            // close face: keep everything
        }
        else if (distance < 8) {
            mask.add('Attachment');
            mask.add('Visibility');
        }
        else {
            // distant: drop expensive micro work
            mask.delete('Corrective');
            mask.delete('Attachment');
            mask.delete('Visibility');
            mask.add('Hair'); // hair uses cluster/card LOD
        }
        // Focus on hand: keep normals/attachment but relax face micro detail.
        if (focusOn === 'hand') {
            mask.add('Normal');
        }
        this.stats.lastMaskSize = mask.size;
        this.stats.computePassesReduced = baseCount - mask.size;
        this.stats.verticesSaved = Math.round(budget * 150 + Math.max(0, mask.size - 5) * 400);
        return mask;
    }
}
function assignedTotal(assigned) {
    let sum = 0;
    for (const v of assigned.values())
        sum += v;
    return sum;
}
function countActive(tm) {
    // Deterministic: infer active transitions by checking idle state is not
    // easily enumerated, so count from a small probe of all subsystems.
    let n = 0;
    for (const c of LOD_SUBSYSTEMS) {
        // A transition is "active" when its smoothed state differs from a snap.
        const cur = tm.current(c);
        if (cur !== Math.round(cur))
            n += 1;
    }
    return n;
}
//# sourceMappingURL=index.js.map