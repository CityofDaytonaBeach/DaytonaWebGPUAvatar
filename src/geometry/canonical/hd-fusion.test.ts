import { describe, it, expect } from 'vitest';
import { HDCanonicalHumanProvider } from './hd-head-provider.js';
import { buildHdBodyManifold } from './hd-body-manifold.js';
import { REQUIRED_HD_HEAD_REGIONS, REQUIRED_HD_BODY_REGIONS } from './regions.js';

/** Count connected components of the skin surface via index adjacency. */
function components(vertexCount: number, indices: Uint32Array): number {
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a: number, b: number) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const used = new Uint8Array(vertexCount);
  for (let i = 0; i < indices.length; i += 3) {
    union(indices[i], indices[i + 1]);
    union(indices[i + 1], indices[i + 2]);
    used[indices[i]] = used[indices[i + 1]] = used[indices[i + 2]] = 1;
  }
  const roots = new Set<number>();
  for (let i = 0; i < vertexCount; i++) if (used[i]) roots.add(find(i));
  return roots.size;
}

describe('fused head/body manifold', () => {
  const fused = buildHdBodyManifold({ neckY: 1.68, fuseHead: true, ySteps: 128 });

  it('produces a single connected skin surface from crown to feet', () => {
    expect(components(fused.vertices.length, fused.indices)).toBe(1);
  });

  it('reaches the head crown and the feet in one surface', () => {
    const ys = fused.vertices.map((v) => v.position.y);
    expect(Math.max(...ys)).toBeGreaterThan(2.0);
    expect(Math.min(...ys)).toBeLessThan(0.1);
  });

  it('has no more open edges than the body-only surface (seam removed, none added)', () => {
    const openEdges = (m: { indices: Uint32Array }): number => {
      const counts = new Map<string, number>();
      for (let i = 0; i < m.indices.length; i += 3) {
        const t = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
        for (let e = 0; e < 3; e++) {
          const a = t[e],
            b = t[(e + 1) % 3];
          const k = a < b ? `${a}_${b}` : `${b}_${a}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      return [...counts.values()].filter((c) => c !== 2).length;
    };
    const bodyOnly = buildHdBodyManifold({ neckY: 1.68, ySteps: 128 });
    expect(openEdges(fused)).toBeLessThanOrEqual(openEdges(bodyOnly));
  });

  it('emits valid indices, unit normals and normalized weights', () => {
    for (let i = 0; i < fused.indices.length; i++) {
      expect(fused.indices[i]).toBeLessThan(fused.vertices.length);
    }
    for (const v of fused.vertices) {
      const n = Math.hypot(v.normal.x, v.normal.y, v.normal.z);
      expect(n).toBeGreaterThan(0.99);
      expect(n).toBeLessThan(1.01);
      const w = Object.values(v.weights).reduce((a, b) => a + b, 0);
      expect(Math.abs(w - 1)).toBeLessThan(1e-6);
    }
  });

  it('classifies head anatomy on the fused surface', () => {
    const regions = new Set(fused.vertices.map((v) => v.region));
    for (const r of ['head', 'chin', 'forehead', 'eye_left', 'upper_eyelid_left'] as const) {
      expect(regions.has(r)).toBe(true);
    }
  });
});

describe('HD provider fusion', () => {
  it('is fused by default with no duplicate head shell layer', async () => {
    const asset = await new HDCanonicalHumanProvider({ ySteps: 128 }).load();
    const skinVerts = asset.topology.vertices;
    expect(components(skinVerts.length, asset.topology.indices)).toBeGreaterThan(0);
    const regions = new Set(skinVerts.map((v) => v.region));
    for (const r of [...REQUIRED_HD_HEAD_REGIONS, ...REQUIRED_HD_BODY_REGIONS]) {
      expect(regions.has(r)).toBe(true);
    }
  });

  it('still supports the legacy layered build', async () => {
    const asset = await new HDCanonicalHumanProvider({ fuseHead: false }).load();
    const regions = new Set(asset.topology.vertices.map((v) => v.region));
    for (const r of [...REQUIRED_HD_HEAD_REGIONS, ...REQUIRED_HD_BODY_REGIONS]) {
      expect(regions.has(r)).toBe(true);
    }
  });
});
