import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import { quatFromEulerDeg } from '../skeleton/skeletal-animation.js';
import { forwardKinematics } from '../skeleton/kinematics.js';
import { measureGazeError, solveLookAtChain, worldPointFromBone } from './look-at.js';

const skeleton = defaultSkeleton();
const rest = forwardKinematics(skeleton, []);
const headRest = rest.get('head')!.worldPos;
const FORWARD = { x: 0, y: 0, z: 1 };

describe('solveLookAtChain', () => {
  it('aims the head at a target in front of the character', () => {
    const target = { x: 0.6, y: headRest.y + 0.1, z: headRest.z + 2 };
    const result = solveLookAtChain(skeleton, { target, respectLimits: false, passes: 3 });

    expect(result.chain).toEqual(['neck', 'head']);
    // The FK-measured gaze error must beat the rest-pose error by a wide margin.
    const restError = measureGazeError(skeleton, [], 'head', FORWARD, target);
    expect(result.angleErrorDeg).toBeLessThan(restError);
    expect(result.angleErrorDeg).toBeLessThan(1);
  });

  it('distributes rotation across the chain rather than snapping one bone', () => {
    const target = { x: 1.2, y: headRest.y, z: headRest.z + 1.5 };
    const result = solveLookAtChain(skeleton, { target, respectLimits: false });
    const neck = result.poses.find((p) => p.name === 'neck')!;
    const head = result.poses.find((p) => p.name === 'head')!;
    // Both bones must carry some of the turn.
    expect(Math.abs(neck.localRot.y)).toBeGreaterThan(1e-3);
    expect(Math.abs(head.localRot.y)).toBeGreaterThan(1e-3);
  });

  it('clamps beyond maxAngleDeg instead of spinning the neck', () => {
    // Directly behind the character: an unclamped solve would rotate ~180°.
    const behind = { x: 0, y: headRest.y, z: headRest.z - 3 };
    const result = solveLookAtChain(skeleton, {
      target: behind,
      maxAngleDeg: 70,
      respectLimits: false,
    });
    expect(result.clamped).toBe(true);
    expect(result.requestedAngleDeg).toBeGreaterThan(70);
    // Residual error is expected (the target is unreachable), but the gaze must
    // have moved to the clamp boundary, not past it.
    expect(result.angleErrorDeg).toBeGreaterThan(0);
    expect(result.angleErrorDeg).toBeLessThan(result.requestedAngleDeg);
  });

  it('intensity 0 leaves the base pose untouched', () => {
    const base = [
      { name: 'neck', localPos: { x: 0, y: 0.18, z: 0 }, localRot: quatFromEulerDeg(0, 5, 0) },
    ];
    const result = solveLookAtChain(skeleton, {
      target: { x: 2, y: headRest.y, z: headRest.z + 1 },
      intensity: 0,
      basePoses: base,
    });
    expect(result.poses).toEqual([]);
    expect(result.mergedPoses).toEqual(base);
  });

  it('tracks the target through a rotated torso (parent-aware)', () => {
    // Twist the chest, then gaze: a rest-pose-only solver drifts here.
    const base = [
      { name: 'chest', localPos: { x: 0, y: 0.16, z: 0 }, localRot: quatFromEulerDeg(0, 35, 0) },
    ];
    const target = { x: 0, y: headRest.y, z: headRest.z + 2 };
    const result = solveLookAtChain(skeleton, {
      target,
      basePoses: base,
      respectLimits: false,
      passes: 3,
    });
    expect(result.angleErrorDeg).toBeLessThan(1.5);
    // The torso rotation itself must survive the gaze solve.
    const chest = result.mergedPoses.find((p) => p.name === 'chest')!;
    expect(chest.localRot.y).toBeCloseTo(base[0].localRot.y, 9);
  });

  it('is deterministic and finite across a swept arc of targets', () => {
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const target = {
        x: headRest.x + Math.sin(a) * 2,
        y: headRest.y + Math.cos(a) * 0.8,
        z: headRest.z + Math.cos(a) * 2,
      };
      const first = solveLookAtChain(skeleton, { target });
      const second = solveLookAtChain(skeleton, { target });
      expect(first.poses).toEqual(second.poses);
      expect(Number.isFinite(first.angleErrorDeg)).toBe(true);
      for (const p of first.poses) {
        for (const v of [p.localRot.x, p.localRot.y, p.localRot.z, p.localRot.w]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});

describe('worldPointFromBone', () => {
  it('resolves a bone-local offset into world space', () => {
    const point = worldPointFromBone(skeleton, [], 'head', { x: 0, y: 0, z: 0.1 })!;
    expect(point.y).toBeCloseTo(headRest.y, 6);
    expect(point.z).toBeCloseTo(headRest.z + 0.1, 6);
  });

  it('returns null for an unknown bone', () => {
    expect(worldPointFromBone(skeleton, [], 'nope' as never, { x: 0, y: 0, z: 0 })).toBeNull();
  });
});
