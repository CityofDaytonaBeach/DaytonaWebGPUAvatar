import { KernelKind } from '../compiler/delta/delta-compiler.js';
import { PropertyCategory } from '../core/schema/property.js';

export type SubsystemQuality = 'OFF' | 'LOW' | 'MED' | 'HIGH' | 'ULTRA';

export const QUALITY_LEVELS: SubsystemQuality[] = ['OFF', 'LOW', 'MED', 'HIGH', 'ULTRA'];

export interface PerceptualScore {
  importance: number; // 0..1
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
export const LOD_PRESETS: ReadonlyArray<LODPreset> = [
  {
    name: 'cinematic',
    budget: 18,
    focusOn: 'face',
    quality: {
      [PropertyCategory.Face]: 'ULTRA',
      [PropertyCategory.Eyes]: 'ULTRA',
      [PropertyCategory.Skin]: 'ULTRA',
      [PropertyCategory.Hair]: 'HIGH',
      [PropertyCategory.Expression]: 'ULTRA',
      [PropertyCategory.Body]: 'HIGH',
      [PropertyCategory.Skeleton]: 'ULTRA',
      [PropertyCategory.Attachment]: 'MED',
      [PropertyCategory.Physics]: 'HIGH',
      [PropertyCategory.Global]: 'HIGH',
      [PropertyCategory.Identity]: 'ULTRA',
      [PropertyCategory.Animation]: 'ULTRA',
      [PropertyCategory.LOD]: 'HIGH',
    },
  },
  {
    name: 'closeup',
    budget: 16,
    focusOn: 'face',
    quality: {
      [PropertyCategory.Face]: 'ULTRA',
      [PropertyCategory.Eyes]: 'ULTRA',
      [PropertyCategory.Skin]: 'HIGH',
      [PropertyCategory.Hair]: 'HIGH',
      [PropertyCategory.Expression]: 'ULTRA',
      [PropertyCategory.Body]: 'MED',
      [PropertyCategory.Skeleton]: 'HIGH',
      [PropertyCategory.Attachment]: 'MED',
      [PropertyCategory.Physics]: 'MED',
      [PropertyCategory.Global]: 'HIGH',
      [PropertyCategory.Identity]: 'HIGH',
      [PropertyCategory.Animation]: 'HIGH',
      [PropertyCategory.LOD]: 'MED',
    },
  },
  {
    name: 'medium',
    budget: 12,
    focusOn: 'body',
    quality: {
      [PropertyCategory.Face]: 'HIGH',
      [PropertyCategory.Eyes]: 'HIGH',
      [PropertyCategory.Skin]: 'MED',
      [PropertyCategory.Hair]: 'MED',
      [PropertyCategory.Expression]: 'MED',
      [PropertyCategory.Body]: 'HIGH',
      [PropertyCategory.Skeleton]: 'MED',
      [PropertyCategory.Attachment]: 'LOW',
      [PropertyCategory.Physics]: 'MED',
      [PropertyCategory.Global]: 'MED',
      [PropertyCategory.Identity]: 'MED',
      [PropertyCategory.Animation]: 'MED',
      [PropertyCategory.LOD]: 'MED',
    },
  },
  {
    name: 'far',
    budget: 8,
    focusOn: 'none',
    quality: {
      [PropertyCategory.Face]: 'LOW',
      [PropertyCategory.Eyes]: 'LOW',
      [PropertyCategory.Skin]: 'LOW',
      [PropertyCategory.Hair]: 'LOW',
      [PropertyCategory.Expression]: 'LOW',
      [PropertyCategory.Body]: 'MED',
      [PropertyCategory.Skeleton]: 'LOW',
      [PropertyCategory.Attachment]: 'OFF',
      [PropertyCategory.Physics]: 'LOW',
      [PropertyCategory.Global]: 'LOW',
      [PropertyCategory.Identity]: 'MED',
      [PropertyCategory.Animation]: 'MED',
      [PropertyCategory.LOD]: 'LOW',
    },
  },
];

/** Stable ordering of subsystems, used for deterministic iteration. */
export const LOD_SUBSYSTEMS: readonly PropertyCategory[] = [
  PropertyCategory.Global,
  PropertyCategory.Identity,
  PropertyCategory.Skeleton,
  PropertyCategory.Body,
  PropertyCategory.Face,
  PropertyCategory.Skin,
  PropertyCategory.Eyes,
  PropertyCategory.Hair,
  PropertyCategory.Expression,
  PropertyCategory.Animation,
  PropertyCategory.Physics,
  PropertyCategory.LOD,
  PropertyCategory.Attachment,
];

/**
 * Perceptual weighting functions. Face/eyes/skin weigh higher than body â€”
 * a human observer notices errors there first, so those subsystems deserve a
 * larger share of the quality budget.
 */
const PERCEPTUAL_WEIGHTS: Readonly<Record<number, number>> = {
  [PropertyCategory.Face]: 1.6,
  [PropertyCategory.Eyes]: 1.7,
  [PropertyCategory.Skin]: 1.4,
  [PropertyCategory.Expression]: 1.2,
  [PropertyCategory.Hair]: 1.0,
  [PropertyCategory.Skeleton]: 0.9,
  [PropertyCategory.Animation]: 0.9,
  [PropertyCategory.Body]: 0.7,
  [PropertyCategory.Attachment]: 0.5,
  [PropertyCategory.Physics]: 0.6,
  [PropertyCategory.Global]: 0.8,
  [PropertyCategory.Identity]: 0.8,
  [PropertyCategory.LOD]: 0.8,
};

/** Perceptual importance weight of a subsystem (higher => more important). */
export function perceptualWeight(category: PropertyCategory): number {
  return PERCEPTUAL_WEIGHTS[category] ?? 0.8;
}

/** Cost (relative vertex/compute weight) of a single quality level. */
export const QUALITY_COST: Readonly<Record<number, number>> = {
  0: 0.25, // OFF
  1: 0.5, // LOW
  2: 0.75, // MED
  3: 1.0, // HIGH
  4: 1.25, // ULTRA
};

/** Incremental cost of moving one level upward, from OFF (index). */
export const QUALITY_INCREMENT: Readonly<number[]> = [0.25, 0.25, 0.25, 0.25];

/**
 * Human semantic LOD. Reduces quality per-human-subsystem, not uniformly.
 * The face/eyes/skin/hands are weighted separately from body/clothing.
 */
export class SemanticLOD {
  private quality = new Map<PropertyCategory, number>(); // 0..4 (index into QUALITY_LEVELS)

  set(category: PropertyCategory, level: SubsystemQuality): void {
    this.quality.set(category, QUALITY_LEVELS.indexOf(level));
  }

  levelFor(category: PropertyCategory): SubsystemQuality {
    return QUALITY_LEVELS[this.quality.get(category) ?? 4] ?? 'HIGH';
  }

  numeric(category: PropertyCategory): number {
    return this.quality.get(category) ?? 4;
  }

  /** Sum of numeric levels across all subsystems (quality budget used). */
  total(): number {
    let sum = 0;
    for (const c of LOD_SUBSYSTEMS) sum += this.quality.get(c) ?? 4;
    return sum;
  }
}

/** Snapshot of one in-flight transition for a subsystem. */
interface Transition {
  from: number;
  to: number;
  start: number;
  duration: number;
  elapsed: number;
}

/**
 * Tracks and animates quality transitions per subsystem so quality changes
 * lerp smoothly over time instead of popping between levels.
 */
export class LODTransitionManager {
  private transitions = new Map<PropertyCategory, Transition>();

  /** Request a transition toward `target` over `duration` ms (default 250). */
  transition(category: PropertyCategory, target: number, duration = 250): void {
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
  update(dt: number): boolean {
    let active = false;
    for (const [, t] of this.transitions) {
      t.elapsed += dt;
      if (t.elapsed < t.duration) active = true;
    }
    return active;
  }

  /** Current smoothly-blended numeric level for a subsystem. */
  current(category: PropertyCategory): number {
    const t = this.transitions.get(category);
    if (!t) return 0;
    const k = Math.min(1, t.elapsed / t.duration);
    const eased = k * k * (3 - 2 * k); // smoothstep
    return t.from + (t.to - t.from) * eased;
  }

  /** 0..1 progress of the binding transition, or 1 when idle. */
  progress(category: PropertyCategory): number {
    const t = this.transitions.get(category);
    if (!t) return 1;
    return Math.min(1, t.elapsed / t.duration);
  }

  /** True once every active transition has completed. */
  isIdle(): boolean {
    for (const [, t] of this.transitions) {
      if (t.elapsed < t.duration) return false;
    }
    return true;
  }
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

const DEFAULT_ALLOCATOR_CONFIG: BudgetAllocatorConfig = {
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
  private cfg: BudgetAllocatorConfig;

  constructor(cfg: Partial<BudgetAllocatorConfig> = {}) {
    this.cfg = { ...DEFAULT_ALLOCATOR_CONFIG, ...cfg };
  }

  /**
   * Allocate `budget` numeric levels across all subsystems given an optional
   * distance hint (smaller = closer) and focus target.
   * Returns a map of category -> numeric level.
   */
  allocate(
    budget: number,
    distance = 2,
    focusOn: 'face' | 'body' | 'hand' | 'none' = 'none',
  ): Map<PropertyCategory, number> {
    const out = new Map<PropertyCategory, number>();
    let remaining = Math.max(0, budget);

    // Start every subsystem at the floor.
    for (const c of LOD_SUBSYSTEMS) out.set(c, this.cfg.floor);

    const prox = distance;
    const weights = new Map<PropertyCategory, number>();
    for (const c of LOD_SUBSYSTEMS) {
      const w = perceptualWeight(c) * this.proximityFactor(c, prox, focusOn);
      weights.set(c, w);
    }

    // Greedy allocation: repeatedly raise the most-important (cheapest)
    // below-cap subsystem that still fits within the remaining budget.
    while (remaining > 0) {
      let best: PropertyCategory | null = null;
      let bestScore = -Infinity;
      for (const c of LOD_SUBSYSTEMS) {
        const cur = out.get(c)!;
        if (cur >= this.cfg.cap) continue;
        const score = weights.get(c)! / QUALITY_INCREMENT[cur];
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best === null) break;
      const cur = out.get(best)!;
      const inc = QUALITY_INCREMENT[cur];
      if (inc > remaining) break;
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
  private proximityFactor(
    category: PropertyCategory,
    distance: number,
    focusOn: 'face' | 'body' | 'hand' | 'none',
  ): number {
    const isHighValue =
      category === PropertyCategory.Face ||
      category === PropertyCategory.Eyes ||
      category === PropertyCategory.Skin ||
      category === PropertyCategory.Expression ||
      (focusOn === 'hand' && category === PropertyCategory.Attachment);
    if (!isHighValue) return 1;
    const near = Math.max(0, 1 - distance / 8.0); // 1 at camera, 0 past 8m
    const focusBoost = focusOn === 'face' && category !== PropertyCategory.Attachment ? 1.3 : 1;
    return 1 + near * this.cfg.faceBias * 2 * focusBoost;
  }
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
export function snapLevel(numeric: number): SubsystemQuality {
  return QUALITY_LEVELS[Math.round(Math.min(4, Math.max(0, numeric)))] ?? 'HIGH';
}

/**
 * Monotonic distance-based quality redistribution. Returns a base budget for
 * the current camera distance. Uses a smooth falloff so the budget shrinks
 * steadily as the subject recedes rather than popping between discrete steps.
 */
export function budgetForDistance(distance: number, maxBudget = 16, minBudget = 5): number {
  const k = Math.min(1, distance / 12);
  const eased = k * k * (3 - 2 * k);
  return maxBudget - (maxBudget - minBudget) * eased;
}

/**
 * Perceptual LOD: computes importance from screen coverage, semantic weight,
 * focus, motion and lighting. Higher importance => keep full fidelity.
 */
export class PerceptualLOD {
  private semantic = new SemanticLOD();
  private transitions = new LODTransitionManager();
  private allocator = new BudgetAllocator();
  private stats: LODStats = {
    verticesSaved: 0,
    computePassesReduced: 0,
    activeTransitions: 0,
    budgetUsed: 0,
    budgetCapacity: 0,
    lastMaskSize: 0,
  };
  private _report: LODReport | null = null;

  constructor(private screenHeight = 1080) {}

  /** Estimate importance of a region given its on-screen coverage (0..1). */
  scoreRegion(semanticWeight: number, coverage: number, focus = 0): number {
    return Math.min(1, semanticWeight * coverage * (0.5 + focus * 0.5));
  }

  /** Smoothly advance transitions; call once per frame with frame dt in ms. */
  update(dt: number): void {
    this.transitions.update(dt);
  }

  /**
   * Camera-dependent redistribution: given camera distance and a preset name,
   * derive a budget, allocate it across subsystems (weighted), and drive each
   * subsystem through a smooth transition toward its new level.
   */
  redistribute(
    distance: number,
    preset: LODPresetName = 'medium',
    focusOn?: 'face' | 'body' | 'hand' | 'none',
    duration = 250,
  ): Map<PropertyCategory, number> {
    const p = this.preset(preset);
    const focus = focusOn ?? p.focusOn;
    const budget = Math.min(
      p.budget,
      budgetForDistance(distance, p.budget, Math.floor(p.budget / 2)),
    );
    const assigned = this.allocator.allocate(budget, distance, focus);

    for (const c of LOD_SUBSYSTEMS) {
      const target = assigned.get(c)!;
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
  report(distance: number, focusOn: 'face' | 'body' | 'hand' | 'none' = 'none'): LODReport {
    const assigned: LODReport['assignments'] = [];
    const perf: PerceptualScore[] = [];
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
    const report: LODReport = {
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
  lastReport(): LODReport {
    if (this._report) return this._report;
    return this.report(4);
  }

  /** Access the running statistics. */
  getStats(): LODStats {
    return { ...this.stats };
  }

  /** Reset stats counters while keeping allocations intact. */
  resetStats(): void {
    this.stats.verticesSaved = 0;
    this.stats.computePassesReduced = 0;
  }

  private preset(name: LODPresetName): LODPreset {
    for (const p of LOD_PRESETS) if (p.name === name) return p;
    return LOD_PRESETS[1]; // closeup fallback
  }

  /**
   * Build a set of kernels to execute given camera proximity and focus.
   * Close face â†’ face/eyes/skin high; distant full-body â†’ reduce micro detail.
   */
  lodMask(distance: number, focusOn: 'face' | 'body' | 'hand' | 'none'): Set<KernelKind> {
    // Mirror the existing behavior but drive the mask from the current budget.
    const budget = budgetForDistance(distance);
    const mask = new Set<KernelKind>([
      'Skinning',
      'Skeleton',
      'SparseMorph',
      'MorphAccumulation',
      'Corrective',
    ]);
    const baseCount = mask.size;

    if (distance < 3 && (focusOn === 'face' || focusOn === 'none')) {
      // close face: keep everything
    } else if (distance < 8) {
      mask.add('Attachment');
      mask.add('Visibility');
    } else {
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

function assignedTotal(assigned: Map<PropertyCategory, number>): number {
  let sum = 0;
  for (const v of assigned.values()) sum += v;
  return sum;
}

function countActive(tm: LODTransitionManager): number {
  // Deterministic: infer active transitions by checking idle state is not
  // easily enumerated, so count from a small probe of all subsystems.
  let n = 0;
  for (const c of LOD_SUBSYSTEMS) {
    // A transition is "active" when its smoothed state differs from a snap.
    const cur = tm.current(c);
    if (cur !== Math.round(cur)) n += 1;
  }
  return n;
}
