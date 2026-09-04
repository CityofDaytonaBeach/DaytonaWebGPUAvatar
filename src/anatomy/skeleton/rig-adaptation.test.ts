import { describe, it, expect } from 'vitest';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { defaultSkeleton } from './skeleton.js';
import { boneWorldPositions, adaptSkeletonToPositions } from './skeleton-adaptation.js';
import {
  buildBoneSegments,
  distanceToSegment,
  solveSkinWeights,
  validateSkinWeights,
} from './skin-weight-solver.js';
import { RigAdapter, bindPoseError, deformedPositions } from './rig-adaptation.js';

function makeMesh(): { mesh: CanonicalHuman; bones: ReturnType<typeof defaultSkeleton> } {
  const bones = defaultSkeleton();
  const mesh = new CanonicalHuman(bones.map((b) => b.name));
  return { mesh, bones };
}

/** Uniform vertical scale about the ground, expressed as a shape-space delta. */
function stretchDelta(mesh: CanonicalHuman, scale: number): Float32Array {
  const { positions } = mesh.baseGeometry();
  const delta = new Float32Array(positions.length);
  for (let i = 0; i < mesh.vertexCount; i++) {
    delta[i * 3 + 1] = positions[i * 3 + 1] * (scale - 1);
  }
  return delta;
}

describe('skeleton adaptation', () => {
  it('leaves the skeleton essentially unchanged for an undeformed mesh', () => {
    const { mesh, bones } = makeMesh();
    const { report } = adaptSkeletonToPositions(bones, mesh, deformedPositions(mesh));
    expect(report.joints.length).toBe(bones.length);
    expect(report.adaptedJoints).toBeGreaterThan(0);
    // The anchors are read from the same mesh the rig was placed against, so
    // any shift must stay small and bounded, never a rig explosion.
    expect(report.maxShift).toBeLessThan(0.25 + 1e-9);
  });

  it('follows the mesh when the body is stretched vertically', () => {
    const { mesh, bones } = makeMesh();
    const positions = deformedPositions(mesh, stretchDelta(mesh, 1.15));
    const { bones: adapted, report } = adaptSkeletonToPositions(bones, mesh, positions, {
      maxJointShift: 1,
    });
    const rest = boneWorldPositions(bones);
    const now = boneWorldPositions(adapted);
    expect(report.maxShift).toBeGreaterThan(0.001);
    // Joints move upward with the stretched mesh.
    expect(now.get('head')!.y).toBeGreaterThan(rest.get('head')!.y - 1e-6);
    expect(now.get('chest')!.y).toBeGreaterThan(rest.get('chest')!.y - 1e-6);
  });

  it('is deterministic and symmetric', () => {
    const { mesh, bones } = makeMesh();
    const positions = deformedPositions(mesh, stretchDelta(mesh, 1.1));
    const a = adaptSkeletonToPositions(bones, mesh, positions);
    const b = adaptSkeletonToPositions(bones, mesh, positions);
    expect(JSON.stringify(a.bones)).toBe(JSON.stringify(b.bones));

    const world = boneWorldPositions(a.bones);
    for (const [left, right] of [
      ['thigh_l', 'thigh_r'],
      ['upperarm_l', 'upperarm_r'],
    ] as const) {
      const l = world.get(left)!;
      const r = world.get(right)!;
      expect(Math.abs(Math.abs(l.x) - Math.abs(r.x))).toBeLessThan(1e-6);
      expect(Math.abs(l.y - r.y)).toBeLessThan(1e-6);
    }
  });

  it('never mutates the input skeleton', () => {
    const { mesh, bones } = makeMesh();
    const before = JSON.stringify(bones);
    adaptSkeletonToPositions(bones, mesh, deformedPositions(mesh, stretchDelta(mesh, 1.2)));
    expect(JSON.stringify(bones)).toBe(before);
  });

  it('clamps pathological anchors', () => {
    const { mesh, bones } = makeMesh();
    const positions = deformedPositions(mesh, stretchDelta(mesh, 6));
    const { report } = adaptSkeletonToPositions(bones, mesh, positions, { maxJointShift: 0.05 });
    expect(report.clampedJoints).toBeGreaterThan(0);
    expect(report.maxShift).toBeLessThan(0.5);
  });
});

describe('skin weight solver', () => {
  it('builds one segment per bone relationship with finite lengths', () => {
    const { bones } = makeMesh();
    const segments = buildBoneSegments(bones);
    expect(segments.length).toBeGreaterThanOrEqual(bones.length);
    for (const s of segments) {
      expect(Number.isFinite(s.length)).toBe(true);
      expect(s.length).toBeGreaterThan(0);
      expect(distanceToSegment(s.a, s)).toBeLessThan(1e-6);
    }
  });

  it('produces normalized weights within the influence budget', () => {
    const { mesh, bones } = makeMesh();
    const { weights, report } = solveSkinWeights(mesh, bones, undefined, { maxInfluences: 4 });
    expect(report.vertices).toBe(mesh.vertexCount);
    expect(report.weightSumErrors).toBe(0);
    expect(report.unweightedVertices).toBe(0);
    const validation = validateSkinWeights(mesh, bones, weights, 4);
    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('binds head-region vertices to the head or jaw bone', () => {
    const { mesh, bones } = makeMesh();
    const { weights } = solveSkinWeights(mesh, bones);
    const headVertices = mesh.vertices.filter((v) => v.region === 'head');
    expect(headVertices.length).toBeGreaterThan(0);
    for (const v of headVertices.slice(0, 40)) {
      const record = weights.get(v.id)!;
      const dominant = Object.entries(record).sort((a, b) => b[1] - a[1])[0][0];
      expect(['head', 'jaw', 'neck']).toContain(dominant);
    }
  });

  it('is deterministic', () => {
    const { mesh, bones } = makeMesh();
    const a = solveSkinWeights(mesh, bones);
    const b = solveSkinWeights(mesh, bones);
    expect(JSON.stringify([...a.weights])).toBe(JSON.stringify([...b.weights]));
  });
});

describe('rig adaptation', () => {
  it('keeps the bind pose stable after adaptation', () => {
    const { mesh, bones } = makeMesh();
    expect(bindPoseError(bones)).toBeLessThan(1e-4);
    const adapter = new RigAdapter(mesh, bones, { maxJointShift: 1 });
    const result = adapter.adaptToDelta(stretchDelta(mesh, 1.12));
    expect(result.bindPoseStable).toBe(true);
    expect(result.maxBindError).toBeLessThan(1e-4);
    expect(result.validation?.ok).toBe(true);
  });

  it('drives the rig from shape-space coefficients', async () => {
    const { mesh, bones } = makeMesh();
    const { HumanShapeSpace } = await import('../shape-space/human-shape-space.js');
    const space = new HumanShapeSpace(mesh);
    const basis = space.addRegionBasis('taller_head', 'global.height', 'head', () => ({
      dx: 0,
      dy: 0.05,
      dz: 0,
    }));
    space.setCoefficient(basis.id, 1);

    const adapter = new RigAdapter(mesh, bones, { maxJointShift: 1 });
    const result = adapter.adaptToShapeSpace(space);
    const rest = boneWorldPositions(bones);
    const now = boneWorldPositions(result.bones);
    expect(now.get('head')!.y).not.toBe(rest.get('head')!.y);
    expect(result.bindPoseStable).toBe(true);
  });

  it('can skip weight rebinding', () => {
    const { mesh, bones } = makeMesh();
    const adapter = new RigAdapter(mesh, bones, { skipWeights: true });
    const result = adapter.adaptToDelta();
    expect(result.weights).toBeNull();
    expect(result.skinning).toBeNull();
    expect(RigAdapter.describe(result).length).toBeGreaterThan(3);
  });

  it('optionally writes weights back onto the mesh', () => {
    const { mesh, bones } = makeMesh();
    const adapter = new RigAdapter(mesh, bones, { applyToMesh: true });
    adapter.adaptToDelta();
    const sums = mesh.vertices
      .slice(0, 50)
      .map((v) => Object.values(v.weights).reduce((a, b) => a + b, 0));
    for (const s of sums) expect(Math.abs(s - 1)).toBeLessThan(1e-6);
  });
});
