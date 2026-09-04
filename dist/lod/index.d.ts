import { KernelKind } from '../compiler/delta/delta-compiler.js';
import { PropertyCategory } from '../core/schema/property.js';
export type SubsystemQuality = 'OFF' | 'LOW' | 'MED' | 'HIGH' | 'ULTRA';
export declare const QUALITY_LEVELS: SubsystemQuality[];
export interface PerceptualScore {
    importance: number;
    subsystem: PropertyCategory;
}
/** A named quality budget profile. */
export type LODPresetName = 'closeup' | 'medium' | 'far' | 'cinematic';
/** Baseline quality per subsystem for a named preset. */
export interface LODPreset {
    name: LODPresetName;
    quality: Partial<Record<PropertyCategory, SubsystemQuality>>;
    /** Max total quality budget (sum of numeric levels) this preset allows. */
    budget: number;
    /** Optional default focus hint for the preset. */
    focusOn: 'face' | 'body' | 'hand' | 'none';
}
/** Built-in profiles. Deterministic and immutable. */
export declare const LOD_PRESETS: ReadonlyArray<LODPreset>;
/** Stable ordering of subsystems, used for deterministic iteration. */
export declare const LOD_SUBSYSTEMS: readonly PropertyCategory[];
/** Perceptual importance weight of a subsystem (higher => more important). */
export declare function perceptualWeight(category: PropertyCategory): number;
/** Cost (relative vertex/compute weight) of a single quality level. */
export declare const QUALITY_COST: Readonly<Record<number, number>>;
/** Incremental cost of moving one level upward, from OFF (index). */
export declare const QUALITY_INCREMENT: Readonly<number[]>;
/**
 * Human semantic LOD. Reduces quality per-human-subsystem, not uniformly.
 * The face/eyes/skin/hands are weighted separately from body/clothing.
 */
export declare class SemanticLOD {
    private quality;
    set(category: PropertyCategory, level: SubsystemQuality): void;
    levelFor(category: PropertyCategory): SubsystemQuality;
    numeric(category: PropertyCategory): number;
    /** Sum of numeric levels across all subsystems (quality budget used). */
    total(): number;
}
/**
 * Tracks and animates quality transitions per subsystem so quality changes
 * lerp smoothly over time instead of popping between levels.
 */
export declare class LODTransitionManager {
    private transitions;
    /** Request a transition toward `target` over `duration` ms (default 250). */
    transition(category: PropertyCategory, target: number, duration?: number): void;
    /** Advance all transitions by `dt` ms. Returns true if any is still active. */
    update(dt: number): boolean;
    /** Current smoothly-blended numeric level for a subsystem. */
    current(category: PropertyCategory): number;
    /** 0..1 progress of the binding transition, or 1 when idle. */
    progress(category: PropertyCategory): number;
    /** True once every active transition has completed. */
    isIdle(): boolean;
}
/** Optional tuning knobs for the BudgetAllocator. */
export interface BudgetAllocatorConfig {
    /** Minimum numeric level any alive subsystem may hold. */
    floor: number;
    /** Maximum numeric level any subsystem may reach. */
    cap: number;
    /** How much camera distance pulls budget toward the close face. 0..1. */
    faceBias: number;
}
/**
 * Distributes a quality budget across subsystems based on perceptual
 * importance and camera proximity. Deterministic: given the same inputs it
 * always yields the same assignment. Subsystems already at their floor are
 * never starved below it.
 */
export declare class BudgetAllocator {
    private cfg;
    constructor(cfg?: Partial<BudgetAllocatorConfig>);
    /**
     * Allocate `budget` numeric levels across all subsystems given an optional
     * distance hint (smaller = closer) and focus target.
     * Returns a map of category -> numeric level.
     */
    allocate(budget: number, distance?: number, focusOn?: 'face' | 'body' | 'hand' | 'none'): Map<PropertyCategory, number>;
    /**
     * Blend perceptual weight with a proximity boost for high-importance
     * subsystems. The boost is stronger when the camera is close and focused
     * on the face/hands; it fades once the subject recedes past 8m.
     */
    private proximityFactor;
}
/** Runtime statistics accumulated by the LOD system. */
export interface LODStats {
    verticesSaved: number;
    computePassesReduced: number;
    activeTransitions: number;
    budgetUsed: number;
    budgetCapacity: number;
    lastMaskSize: number;
}
/** Debug/display report emitted by the semantic LOD pipeline. */
export interface LODReport {
    presets: LODPresetName[];
    distance: number;
    focusOn: 'face' | 'body' | 'hand' | 'none';
    transitionManager: LODTransitionManager;
    assignments: Array<{
        category: PropertyCategory;
        level: SubsystemQuality;
        numeric: number;
        weight: number;
    }>;
    stats: LODStats;
    perf: PerceptualScore[];
}
/**
 * Convenience: snap a fully blended float level to the nearest SubsystemQuality.
 */
export declare function snapLevel(numeric: number): SubsystemQuality;
/**
 * Monotonic distance-based quality redistribution. Returns a base budget for
 * the current camera distance. Uses a smooth falloff so the budget shrinks
 * steadily as the subject recedes rather than popping between discrete steps.
 */
export declare function budgetForDistance(distance: number, maxBudget?: number, minBudget?: number): number;
/**
 * Perceptual LOD: computes importance from screen coverage, semantic weight,
 * focus, motion and lighting. Higher importance => keep full fidelity.
 */
export declare class PerceptualLOD {
    private screenHeight;
    private semantic;
    private transitions;
    private allocator;
    private stats;
    private _report;
    constructor(screenHeight?: number);
    /** Estimate importance of a region given its on-screen coverage (0..1). */
    scoreRegion(semanticWeight: number, coverage: number, focus?: number): number;
    /** Smoothly advance transitions; call once per frame with frame dt in ms. */
    update(dt: number): void;
    /**
     * Camera-dependent redistribution: given camera distance and a preset name,
     * derive a budget, allocate it across subsystems (weighted), and drive each
     * subsystem through a smooth transition toward its new level.
     */
    redistribute(distance: number, preset?: LODPresetName, focusOn?: 'face' | 'body' | 'hand' | 'none', duration?: number): Map<PropertyCategory, number>;
    /** Snapshot the current state as a debug LODReport. */
    report(distance: number, focusOn?: 'face' | 'body' | 'hand' | 'none'): LODReport;
    /** Read the most recently built report, or build one on demand. */
    lastReport(): LODReport;
    /** Access the running statistics. */
    getStats(): LODStats;
    /** Reset stats counters while keeping allocations intact. */
    resetStats(): void;
    private preset;
    /**
     * Build a set of kernels to execute given camera proximity and focus.
     * Close face â†’ face/eyes/skin high; distant full-body â†’ reduce micro detail.
     */
    lodMask(distance: number, focusOn: 'face' | 'body' | 'hand' | 'none'): Set<KernelKind>;
}
//# sourceMappingURL=index.d.ts.map