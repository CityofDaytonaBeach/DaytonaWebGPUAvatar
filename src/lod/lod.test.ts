import { describe, it, expect } from 'vitest';
import { PropertyCategory } from '../core/schema/property';
import {
  SemanticLOD,
  LODTransitionManager,
  BudgetAllocator,
  PerceptualLOD,
  budgetForDistance,
  snapLevel,
  perceptualWeight,
  QUALITY_LEVELS,
  LOD_PRESETS,
  LOD_SUBSYSTEMS,
} from './index';

const FACE = PropertyCategory.Face;
const BODY = PropertyCategory.Body;
const HAIR = PropertyCategory.Hair;

describe('SemanticLOD', () => {
  it('defaults every subsystem to ULTRA (index 4)', () => {
    const lod = new SemanticLOD();
    expect(lod.levelFor(FACE)).toBe('ULTRA');
    expect(lod.numeric(FACE)).toBe(4);
  });

  it('stores and reports the requested level', () => {
    const lod = new SemanticLOD();
    lod.set(FACE, 'ULTRA');
    expect(lod.levelFor(FACE)).toBe('ULTRA');
    expect(lod.numeric(FACE)).toBe(4);
    lod.set(BODY, 'LOW');
    expect(lod.numeric(BODY)).toBe(1);
  });

  it('total() sums numeric levels across all subsystems', () => {
    const lod = new SemanticLOD();
    // All default to ULTRA (4).
    expect(lod.total()).toBe(4 * LOD_SUBSYSTEMS.length);
    lod.set(FACE, 'OFF');
    expect(lod.total()).toBe(4 * LOD_SUBSYSTEMS.length - 4);
  });
});

describe('LODTransitionManager', () => {
  it('returns progress 1 / current 0 when idle (no transition)', () => {
    const tm = new LODTransitionManager();
    expect(tm.current(FACE)).toBe(0);
    expect(tm.progress(FACE)).toBe(1);
    expect(tm.isIdle()).toBe(true);
  });

  it('blends from the current level toward the target over time', () => {
    const tm = new LODTransitionManager();
    tm.transition(FACE, 3, 1); // establish a current state at level 3
    tm.update(10);
    expect(tm.current(FACE)).toBeCloseTo(3, 4);
    tm.transition(FACE, 4, 100); // now blend 3 -> 4
    expect(tm.update(50)).toBe(true); // still active
    expect(tm.current(FACE)).toBeGreaterThan(3);
    expect(tm.current(FACE)).toBeLessThan(4);
    expect(tm.progress(FACE)).toBeCloseTo(0.5, 1);
  });

  it('completes once elapsed reaches duration', () => {
    const tm = new LODTransitionManager();
    tm.transition(FACE, 4, 100);
    tm.update(100);
    expect(tm.update(0)).toBe(false);
    expect(tm.current(FACE)).toBeCloseTo(4, 4);
    expect(tm.isIdle()).toBe(true);
  });
});

describe('BudgetAllocator', () => {
  it('never goes below the floor and respects the cap', () => {
    const alloc = new BudgetAllocator({ floor: 1, cap: 4 });
    const out = alloc.allocate(0);
    for (const v of out.values()) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
    }
  });

  it('raises higher-value subsystems first when budget grows', () => {
    const alloc = new BudgetAllocator();
    const small = alloc.allocate(6);
    const large = alloc.allocate(20);
    // Face/eyes should gain at least as much as low-value subsystems.
    expect(large.get(FACE)!).toBeGreaterThanOrEqual(small.get(FACE)!);
    expect(large.get(HAIR)!).toBeGreaterThanOrEqual(small.get(HAIR)!);
  });
});

describe('pure LOD helpers', () => {
  it('snapLevel clamps and rounds to valid levels', () => {
    expect(snapLevel(0)).toBe('OFF');
    expect(snapLevel(1.2)).toBe('LOW');
    expect(snapLevel(3.6)).toBe('ULTRA');
    expect(snapLevel(99)).toBe('ULTRA');
  });

  it('budgetForDistance shrinks with distance and stays bounded', () => {
    expect(budgetForDistance(0)).toBe(16);
    expect(budgetForDistance(12)).toBe(5);
    expect(budgetForDistance(4)).toBeGreaterThan(5);
    expect(budgetForDistance(4)).toBeLessThan(16);
  });

  it('exposes known perceptual weights for face > body', () => {
    expect(perceptualWeight(FACE)).toBeGreaterThan(perceptualWeight(BODY));
  });

  it('defines five quality levels', () => {
    expect(QUALITY_LEVELS).toEqual(['OFF', 'LOW', 'MED', 'HIGH', 'ULTRA']);
  });

  it('defines the four named presets', () => {
    expect(LOD_PRESETS.map((p) => p.name)).toEqual(['cinematic', 'closeup', 'medium', 'far']);
  });
});

describe('PerceptualLOD', () => {
  it('scoreRegion stays within [0,1]', () => {
    const lod = new PerceptualLOD();
    expect(lod.scoreRegion(1, 0, 0)).toBe(0);
    expect(lod.scoreRegion(1, 1, 1)).toBeCloseTo(1, 5);
    // 0.5 * 0.8 * (0.5 + 0) = 0.2
    expect(lod.scoreRegion(0.5, 0.8, 0)).toBeCloseTo(0.2, 5);
    // focus boosts the factor: 0.5 * 0.8 * (0.5 + 0.5) = 0.4
    expect(lod.scoreRegion(0.5, 0.8, 1)).toBeCloseTo(0.4, 5);
  });

  it('redistribute drives transitions and returns allocations', () => {
    const lod = new PerceptualLOD();
    const assigned = lod.redistribute(2, 'closeup');
    expect(assigned.size).toBe(LOD_SUBSYSTEMS.length);
    for (const v of assigned.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4);
    }
  });

  it('lodMask keeps face detail close and drops micro work far away', () => {
    const lod = new PerceptualLOD();
    const close = lod.lodMask(1, 'face');
    expect(close.has('Corrective')).toBe(true);
    expect(close.has('Skinning')).toBe(true);

    const far = lod.lodMask(12, 'none');
    expect(far.has('Corrective')).toBe(false);
    expect(far.has('Hair')).toBe(true);
  });

  it('report surfaces assignments, perf and stats', () => {
    const lod = new PerceptualLOD();
    lod.redistribute(2, 'medium');
    const r = lod.report(2, 'face');
    expect(r.assignments.length).toBe(LOD_SUBSYSTEMS.length);
    expect(r.perf.length).toBe(LOD_SUBSYSTEMS.length);
    expect(r.stats.budgetUsed).toBeGreaterThan(0);
    expect(r.presets).toContain('medium');
  });

  it('resetStats clears counters while keeping state', () => {
    const lod = new PerceptualLOD();
    lod.resetStats();
    const s = lod.getStats();
    expect(s.verticesSaved).toBe(0);
    expect(s.computePassesReduced).toBe(0);
  });
});
