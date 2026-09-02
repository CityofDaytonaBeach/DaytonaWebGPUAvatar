import { describe, it, expect } from 'vitest';
import {
  GarmentMesh,
  selectLOD,
  toPhysicsMesh,
  simulateClothStep,
  applyWrinkles,
  generateGarmentLODs,
  toRenderMesh,
} from './garment.js';
import { resolveAnatomy } from '../../anatomy/parametric/parametric-anatomy.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { createDefaultRegistry } from '../../core/schema/descriptors.js';

function testGarment(): GarmentMesh {
  // Two triangles sharing an edge 1-2, so toPhysicsMesh must dedupe it.
  return {
    id: 'cloth',
    kind: 'shirt',
    color: [1, 0, 0],
    vertices: [
      { position: { x: 0, y: 0, z: 0 }, uv: { u: 0, v: 0 } },
      { position: { x: 1, y: 0, z: 0 }, uv: { u: 1, v: 0 } },
      { position: { x: 1, y: 1, z: 0 }, uv: { u: 1, v: 1 } },
      { position: { x: 0, y: 1, z: 0 }, uv: { u: 0, v: 1 } },
    ],
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
}

describe('selectLOD', () => {
  it('returns close range 0 for near distance', () => {
    expect(selectLOD(0.5)).toBe(0);
    expect(selectLOD(1.0)).toBe(0);
  });

  it('returns mid range 1 between thresholds', () => {
    expect(selectLOD(2.0)).toBe(1);
    expect(selectLOD(3.99)).toBe(1);
  });

  it('returns far range 2 at or beyond high threshold', () => {
    expect(selectLOD(4.0)).toBe(2);
    expect(selectLOD(10)).toBe(2);
  });

  it('respects custom thresholds', () => {
    expect(selectLOD(5, [10, 20])).toBe(0);
    expect(selectLOD(15, [10, 20])).toBe(1);
    expect(selectLOD(25, [10, 20])).toBe(2);
  });
});

describe('toPhysicsMesh', () => {
  it('creates one particle per vertex and dedups shared edges', () => {
    const phy = toPhysicsMesh(testGarment());
    expect(phy.particles).toHaveLength(4);
    // Square has 4 unique boundary edges + 1 internal diagonal = 5 constraints.
    expect(phy.constraints).toHaveLength(5);
    expect(phy.gravity.y).toBeCloseTo(-9.81, 3);
    expect(phy.damping).toBeCloseTo(0.98, 3);
    expect(phy.constraints.every((c) => c.stiffness === 1.0)).toBe(true);
  });

  it('allows overriding gravity and mass', () => {
    const phy = toPhysicsMesh(testGarment(), { gravity: { x: 0, y: -5, z: 0 }, particleMass: 2 });
    expect(phy.gravity.y).toBeCloseTo(-5, 3);
    expect(phy.particles[0].mass).toBeCloseTo(2, 3);
  });

  it('builds a triangle particle map matching indices count', () => {
    const phy = toPhysicsMesh(testGarment());
    expect(phy.triangleParticleMap).toHaveLength(2);
  });
});

describe('simulateClothStep', () => {
  it('moves a free particle under gravity', () => {
    const phy = toPhysicsMesh(testGarment(), { gravity: { x: 0, y: -9.81, z: 0 } });
    const before = phy.particles[0].position.y;
    simulateClothStep(phy, 0.1, 0);
    const after = phy.particles[0].position.y;
    expect(after).toBeLessThan(before);
  });

  it('never moves pinned particles', () => {
    const phy = toPhysicsMesh(testGarment());
    phy.particles[0].pinned = true;
    const before = { ...phy.particles[0].position };
    simulateClothStep(phy, 0.2, 3);
    expect(phy.particles[0].position).toEqual(before);
  });

  it('constraint relaxation drives stretched particles toward rest length', () => {
    const phy = toPhysicsMesh(testGarment());
    // Stretch particle B far away from pinned A along X; constraint should pull it back.
    const constraint = phy.constraints.find((c) => c.a === 0 && c.b === 1)!;
    phy.particles[0].pinned = true;
    phy.particles[1].position = {
      x: phy.particles[0].position.x + 5,
      y: phy.particles[0].position.y,
      z: phy.particles[0].position.z,
    };
    phy.particles[1].previousPosition = { ...phy.particles[1].position };
    const rest = constraint.restLength;
    simulateClothStep(phy, 0.016, 10);
    const dist = Math.abs(phy.particles[1].position.x - phy.particles[0].position.x);
    expect(dist).toBeLessThan(2);
    expect(Math.abs(dist - rest)).toBeLessThan(0.5);
  });
});

describe('applyWrinkles', () => {
  it('adds offsets in place up to vertex count', () => {
    const garment = toRenderMesh(testGarment());
    const before = Array.from(garment.positions);
    applyWrinkles(garment, [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.5, z: 0 },
    ]);
    // Vertex 1 = flat index 4 (y). Vertex 3 = flat index 9 (y), untouched.
    expect(garment.positions[4]).toBeCloseTo(before[4] + 0.5, 6);
    expect(garment.positions[9]).toBeCloseTo(before[9], 6);
  });
});

describe('generateGarmentLODs', () => {
  it('produces three strictly descending-detail chains', () => {
    const dims = resolveAnatomy(new HumanDefinition(createDefaultRegistry()));
    const lods = generateGarmentLODs(
      { id: 'shirt', kind: 'wearable', anchor: { region: 'torso' } },
      dims,
    );
    expect(lods.map((l) => l.level)).toEqual([0, 1, 2]);
    expect(lods[2].render.vertexCount).toBeLessThan(lods[1].render.vertexCount);
    expect(lods[1].render.vertexCount).toBeLessThan(lods[0].render.vertexCount);
    expect(lods[0].render.indexCount % 3).toBe(0);
  });
});
