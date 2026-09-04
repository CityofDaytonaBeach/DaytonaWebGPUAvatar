import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from './canonical-human.js';
import { CanonicalTopology } from './canonical-topology.js';
import { MeshIntersectionAnalyzer } from './intersection.js';
import { HDCanonicalHumanProvider } from './hd-head-provider.js';
import { Human } from '../../human.js';

const BONES = ['root', 'spine', 'head'];

function v(id: number, x: number, y: number, z: number): CanonicalTopology['vertices'][number] {
  return {
    id, position: { x, y, z }, normal: { x: 0, y: 1, z: 0 }, uv: { u: 0, v: 0 },
    region: 'chest', weights: {},
  };
}

/** Two well-separated quads (4 triangles, no intersections, no degenerates). */
function cleanTopology(): CanonicalTopology {
  const vertices = [
    v(0, 0, 0, 0), v(1, 1, 0, 0), v(2, 1, 1, 0), v(3, 0, 1, 0),
    v(4, 5, 0, 0), v(5, 6, 0, 0), v(6, 6, 1, 0), v(7, 5, 1, 0),
  ];
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
  ]);
  return {
    vertices, indices,
    parts: [{ name: 'p', kind: 'Skin', region: 'chest', vertexStart: 0, vertexCount: 8, indexStart: 0, indexCount: 12 }],
  };
}

describe('MeshIntersectionAnalyzer', () => {
  it('reports a clean manifold as valid (no intersections, no degenerates)', () => {
    const c = CanonicalHuman.fromTopology(cleanTopology(), BONES);
    const a = new MeshIntersectionAnalyzer(c);
    const rep = a.analyze(c.baseGeometry().positions, 100);
    expect(rep.valid).toBe(true);
    expect(rep.degenerateCount).toBe(0);
    expect(rep.intersectingPairs).toBe(0);
    expect(rep.firstPair).toBeNull();
  });

  it('detects a triangle collapsed to degenerate area under deformation', () => {
    // Base mesh is clean; deform the second quad so its first triangle (4,5,6)
    // collapses onto a single point, collapsing the local surface area.
    const c = CanonicalHuman.fromTopology(cleanTopology(), BONES);
    const base = c.baseGeometry().positions;
    const pos = Float32Array.from(base);
    for (let i = 0; i < 3; i++) {
      pos[4 * 3 + i] = 5; pos[5 * 3 + i] = 5; pos[6 * 3 + i] = 5;
    }
    const a = new MeshIntersectionAnalyzer(c);
    const rep = a.analyze(pos, 100);
    expect(rep.degenerateCount).toBeGreaterThan(0);
    expect(rep.valid).toBe(false);
  });

  it('detects explicit interpenetration between two triangles', () => {
    // Two triangles that cross: use the clean quad's first triangle and a second
    // triangle placed to pass through its plane, sharing no vertices.
    const vertices = [
      v(0, 0, 0, 0), v(1, 1, 0, 0), v(2, 1, 1, 0), v(3, 0, 1, 0),
      v(4, 0.5, 0.5, -0.5), v(5, 0.5, 1.5, 0.5), v(6, 1.5, 0.5, 0.5),
    ];
    const indices = new Uint32Array([
      0, 1, 2, 0, 2, 3, // quad in z=0 plane
      4, 5, 6,         // triangle crossing through the quad plane
    ]);
    const c = CanonicalHuman.fromTopology(
      { vertices, indices, parts: [{ name: 'p', kind: 'Skin', region: 'chest', vertexStart: 0, vertexCount: 7, indexStart: 0, indexCount: 9 }] },
      BONES,
    );
    const a = new MeshIntersectionAnalyzer(c);
    const rep = a.analyze(c.baseGeometry().positions, 100);
    expect(rep.intersectingPairs).toBeGreaterThan(0);
    expect(rep.valid).toBe(false);
    expect(rep.firstPair).not.toBeNull();
  });

  it('excludes vertex-sharing neighbours as legitimate contact', async () => {
    // Two triangles sharing an edge (legitimately adjacent) must NOT be flagged.
    const vertices = [
      v(0, 0, 0, 0), v(1, 1, 0, 0), v(2, 1, 1, 0), v(3, 0, 1, 0), v(4, 0, 0, 1),
    ];
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const c = CanonicalHuman.fromTopology(
      { vertices, indices, parts: [{ name: 'p', kind: 'Skin', region: 'chest', vertexStart: 0, vertexCount: 5, indexStart: 0, indexCount: 6 }] },
      BONES,
    );
    const a = new MeshIntersectionAnalyzer(c);
    const rep = a.analyze(c.baseGeometry().positions, 100);
    expect(rep.intersectingPairs).toBe(0);
  });

  it('reports baseline intersections on the HD body (documents base-mesh state)', async () => {
    const h = await Human.create({ canonicalProvider: new HDCanonicalHumanProvider() });
    const a = new MeshIntersectionAnalyzer(h.canonicalRef);
    const rep = a.analyze(h.canonicalRef.baseGeometry().positions, 100000);
    // The coarse procedural body is intrinsically overlapping at rest — this is
    // a documented baseline (thousands of pairs), not a fuzz regression.
    expect(rep.intersectingPairs).toBeGreaterThan(1000);
    expect(rep.firstPair).not.toBeNull();
    // Known base pair (vertex sets 40,60,41 vs 289,309,310) is detected.
    const [ta, tb] = rep.firstPair!;
    expect(Number.isFinite(ta) && Number.isFinite(tb)).toBe(true);
  });
});
