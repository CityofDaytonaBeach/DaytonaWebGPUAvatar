import { describe, expect, it } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import {
  bakeCurvature,
  bakeCurvatureThickness,
  bakeThickness,
  buildOneRing,
} from './curvature-bake.js';
import { PHOTOREAL_CONSTANTS } from './constants.js';
import { PHOTOREAL_HUMAN_WGSL } from '../wgsl/photoreal-wgsl.js';

const C = PHOTOREAL_CONSTANTS;
const canonical = new CanonicalHuman(['root', 'head']);

describe('one-ring adjacency', () => {
  it('links every corner of a triangle to the other two', () => {
    const ring = buildOneRing(new Uint32Array([0, 1, 2]), 3);
    expect([...ring[0]].sort()).toEqual([1, 2]);
    expect([...ring[1]].sort()).toEqual([0, 2]);
  });

  it('deduplicates shared edges and ignores out-of-range indices', () => {
    const ring = buildOneRing(new Uint32Array([0, 1, 2, 1, 2, 3, 0, 1, 9]), 4);
    expect([...ring[1]].sort()).toEqual([0, 2, 3]);
  });

  it('leaves unreferenced vertices empty', () => {
    const ring = buildOneRing(new Uint32Array([0, 1, 2]), 5);
    expect(ring[4].length).toBe(0);
  });
});

describe('curvature bake', () => {
  it('is zero-curvature (clamped to the minimum) on a flat quad', () => {
    const vertices = [
      { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: 1, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
    const curv = bakeCurvature(vertices, new Uint32Array([0, 1, 2, 1, 3, 2]));
    for (const c of curv) expect(c).toBeCloseTo(C.curvatureMin, 6);
  });

  it('reports higher curvature on a tight sphere than a loose one', () => {
    const sphere = (radius: number) => {
      const verts = [];
      const idx: number[] = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const theta = (i / (n - 1)) * Math.PI;
          const phi = (j / n) * 2 * Math.PI;
          const nx = Math.sin(theta) * Math.cos(phi);
          const ny = Math.cos(theta);
          const nz = Math.sin(theta) * Math.sin(phi);
          verts.push({
            position: { x: nx * radius, y: ny * radius, z: nz * radius },
            normal: { x: nx, y: ny, z: nz },
          });
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < n - 1; j++) {
          const a = i * n + j;
          idx.push(a, a + 1, a + n, a + 1, a + n + 1, a + n);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return bakeCurvature(verts as any[], new Uint32Array(idx));
    };
    const tight = sphere(0.01);
    const loose = sphere(0.2);
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(tight)).toBeGreaterThan(mean(loose));
  });

  it('stays inside the shared clamp range on the canonical human', () => {
    const curv = bakeCurvature(canonical.vertices, canonical.indices);
    expect(curv.length).toBe(canonical.vertices.length);
    for (const c of curv) {
      expect(c).toBeGreaterThanOrEqual(Math.fround(C.curvatureMin));
      expect(c).toBeLessThanOrEqual(Math.fround(C.curvatureMax));
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const a = bakeCurvature(canonical.vertices, canonical.indices);
    const b = bakeCurvature(canonical.vertices, canonical.indices);
    expect([...a.slice(0, 64)]).toEqual([...b.slice(0, 64)]);
  });
});

describe('thickness bake', () => {
  it('stays inside the shared clamp range', () => {
    const th = bakeThickness(canonical.vertices);
    for (const t of th) {
      // Float32Array storage, so compare against the float32 rounding of the clamps.
      expect(t).toBeGreaterThanOrEqual(Math.fround(C.thicknessMin));
      expect(t).toBeLessThanOrEqual(Math.fround(C.thicknessMax));
    }
  });

  it('reports thin tissue between two close opposing surfaces', () => {
    const gap = 0.002;
    const vertices = [
      { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: 0, y: 0, z: -gap }, normal: { x: 0, y: 0, z: -1 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
    const th = bakeThickness(vertices);
    expect(th[0]).toBeLessThan(C.thicknessMax);
    expect(th[0]).toBeCloseTo(gap, 4);
  });

  it('falls back to the maximum with no opposing surface', () => {
    const vertices = [
      { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];
    expect(bakeThickness(vertices)[0]).toBeCloseTo(C.thicknessMax, 8);
  });
});

describe('packed bake', () => {
  it('interleaves curvature and thickness per vertex', () => {
    const bake = bakeCurvatureThickness(canonical);
    expect(bake.vertexCount).toBe(canonical.vertices.length);
    expect(bake.packed.length).toBe(bake.vertexCount * 2);
    for (let i = 0; i < 32; i++) {
      expect(bake.packed[i * 2]).toBeCloseTo(bake.curvature[i], 6);
      expect(bake.packed[i * 2 + 1]).toBeCloseTo(bake.thickness[i], 8);
    }
  });

  it('the shader reads the bake at location 4 with the shared clamps', () => {
    expect(PHOTOREAL_HUMAN_WGSL).toContain('@location(4) curvatureThickness : vec2f');
    expect(PHOTOREAL_HUMAN_WGSL).toContain('CURVATURE_MIN');
    expect(PHOTOREAL_HUMAN_WGSL).toContain('THICKNESS_MAX');
    // Zeroed attribute must fall back to the head-wide constants.
    expect(PHOTOREAL_HUMAN_WGSL).toContain('select(SKIN_CURVATURE');
  });
});
