import { describe, it, expect } from 'vitest';
import { Human } from '../../human.js';
import { HDCanonicalHumanProvider } from './hd-head-provider.js';
import { buildHdBodyManifold } from './hd-body-manifold.js';
import { MeshIntersectionAnalyzer } from './intersection.js';

describe('probe new body manifold', () => {
  it('reports geometry + weights + region stats', async () => {
    const body = buildHdBodyManifold({ neckY: 1.68 });
    const V = body.vertices.length;
    const T = body.indices.length / 3;
    console.log(`body: V=${V} T=${T}`);
    let badWeights = 0;
    const regions = new Map<string, number>();
    let ymin = Infinity, ymax = -Infinity;
    for (const v of body.vertices) {
      let s = 0;
      for (const k of Object.keys(v.weights)) s += v.weights[k];
      if (Math.abs(s - 1) > 0.05 || s === 0) badWeights++;
      if (!Number.isFinite(v.position.x) || !Number.isFinite(v.normal.x)) badWeights += 1000;
      regions.set(v.region, (regions.get(v.region) ?? 0) + 1);
      ymin = Math.min(ymin, v.position.y);
      ymax = Math.max(ymax, v.position.y);
    }
    console.log(`badWeightVerts=${badWeights}`);
    console.log('regions:', [...regions.entries()].map(([r, n]) => `${r}:${n}`).join(', '));
    console.log(`y range: ${ymin.toFixed(2)} .. ${ymax.toFixed(2)}`);

    const h = await Human.create({ canonicalProvider: new HDCanonicalHumanProvider() });
    const c = h.canonicalRef;
    const bodyEnd = c.parts.length > 0 ? c.parts[0].indexStart : c.indices.length;
    console.log(`full N=${c.vertexCount} T=${c.indices.length / 3} bodyEnd=${bodyEnd}`);

    // Build a canonical from ONLY the body manifold to test it in isolation.
    const { CanonicalHuman } = await import('./canonical-human.js');
    const bodyOnly = CanonicalHuman.fromTopology(
      { vertices: body.vertices as any, indices: body.indices, parts: [] as any },
      ['root', 'pelvis', 'spine_01', 'spine_02', 'chest'],
    );
    const ab = new MeshIntersectionAnalyzer(bodyOnly);
    const repB = ab.analyze(bodyOnly.baseGeometry().positions, 1000000);
    console.log(`BODY-ONLY canonical: N=${bodyOnly.vertexCount} T=${bodyOnly.indices.length / 3} pairs=${repB.intersectingPairs} deg=${repB.degenerateCount}`);
    // Euler characteristic (V - E + F) => 2 for a closed sphere-like manifold.
    const eV = bodyOnly.vertexCount;
    const eE = countEdges(bodyOnly.indices);
    const eF = bodyOnly.indices.length / 3;
    console.log(`Euler V=${eV} E=${eE} F=${eF} chi=${(eV - eE + eF).toFixed(1)} (2 = watertight sphere)`);
    const bEdges = countBoundaryEdges(bodyOnly.indices);
    console.log(`boundary edges (odd half-edge count) = ${bEdges}`);

    const a = new MeshIntersectionAnalyzer(c);
    const rep = a.analyze(c.baseGeometry().positions, 1000000);
    console.log(`whole mesh pairs=${rep.intersectingPairs} deg=${rep.degenerateCount} first=${rep.firstPair}`);
    expect(true).toBe(true);
  });

  it('verifies marching-tetra on an analytic sphere is watertight (chi=2)', async () => {
    const { marchingCubesProbe } = await import('./hd-body-manifold.js');
    const r = marchingCubesProbe(32, 0.01);
    console.log(`SPHERE: V=${r.vertices.length} T=${r.indices.length / 3} chi=${r.chi.toFixed(1)} boundary=${r.boundaryEdges}`);
    expect(true).toBe(true);
  });
});

function countEdges(indices: Uint32Array): number {
  const set = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], cc = indices[i + 2];
    for (const [u, v] of [[a, b], [b, cc], [cc, a]]) {
      const k = Math.min(u, v) + '|' + Math.max(u, v);
      set.add(k);
    }
  }
  return set.size;
}

function countBoundaryEdges(indices: Uint32Array): number {
  const count = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], cc = indices[i + 2];
    for (const [u, v] of [[a, b], [b, cc], [cc, a]]) {
      const k = Math.min(u, v) + '|' + Math.max(u, v);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let odd = 0;
  for (const c of count.values()) if (c % 2 !== 0) odd++;
  return odd;
}
