import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import type { Vec3 } from '../../core/math/vec.js';
import {
  addVec3,
  distanceVec3,
  forwardKinematics,
  normalizeVec3,
  quatToEulerDeg,
  scaleVec3,
  subVec3,
} from '../skeleton/kinematics.js';
import { fabrik, solveChainIK, solveLimbIK } from './ik-solver.js';

const skeleton = defaultSkeleton();
const rest = forwardKinematics(skeleton, []);

function restPos(bone: 'upperarm_r' | 'hand_r' | 'thigh_l' | 'foot_l'): Vec3 {
  return { ...rest.get(bone)!.worldPos };
}

/** A target guaranteed to be inside the chain's reach, in a given direction. */
function reachableTarget(root: Vec3, dir: Vec3, reach: number, fraction: number): Vec3 {
  return addVec3(root, scaleVec3(normalizeVec3(dir), reach * fraction));
}

describe('FABRIK core', () => {
  it('reaches an in-range target while preserving segment lengths', () => {
    const positions: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -2, z: 0 },
    ];
    const lengths = [1, 1];
    const target = { x: 1, y: -1, z: 0 };
    fabrik(positions, lengths, target, 20, 1e-6);

    expect(distanceVec3(positions[2], target)).toBeLessThan(1e-4);
    expect(distanceVec3(positions[0], positions[1])).toBeCloseTo(1, 5);
    expect(distanceVec3(positions[1], positions[2])).toBeCloseTo(1, 5);
    expect(positions[0]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('stretches straight toward an out-of-reach target without exploding', () => {
    const positions: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: -2, z: 0 },
    ];
    const target = { x: 0, y: -10, z: 0 };
    fabrik(positions, [1, 1], target, 20, 1e-6);
    expect(positions[2].y).toBeCloseTo(-2, 5);
    expect(distanceVec3(positions[0], positions[1])).toBeCloseTo(1, 5);
  });
});

describe('solveChainIK — FK-verified reach', () => {
  it('drives the hand onto an in-reach target, measured with forward kinematics', () => {
    const root = restPos('upperarm_r');
    const probe = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target: root,
      respectLimits: false,
    });
    const target = reachableTarget(root, { x: 0.6, y: -0.7, z: 0.4 }, probe.reach, 0.8);

    const result = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target,
      respectLimits: false,
      tolerance: 0.005,
    });

    expect(result.chain).toEqual(['upperarm_r', 'forearm_r', 'hand_r']);
    expect(result.targetUnreachable).toBe(false);
    expect(result.reached).toBe(true);
    expect(result.error).toBeLessThan(0.005);

    // The reported effector position must agree with an independent FK pass.
    const fk = forwardKinematics(skeleton, result.mergedPoses);
    expect(distanceVec3(fk.get('hand_r')!.worldPos, target)).toBeLessThan(0.005);
  });

  it('flags an out-of-reach target and still points the chain at it', () => {
    const root = restPos('upperarm_r');
    const far = addVec3(root, { x: 5, y: 0, z: 0 });
    const result = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target: far,
      respectLimits: false,
    });

    expect(result.targetUnreachable).toBe(true);
    expect(result.reached).toBe(false);
    expect(Number.isFinite(result.error)).toBe(true);
    // Effector should be extended along the root->target direction, at ~full reach.
    const dist = distanceVec3(root, result.effectorPosition);
    expect(dist).toBeGreaterThan(result.reach * 0.9);
    expect(dist).toBeLessThan(result.reach * 1.01);
  });

  it('leaves bones outside the chain untouched', () => {
    const root = restPos('upperarm_r');
    const probe = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target: root });
    const target = reachableTarget(root, { x: 0.5, y: -0.8, z: 0.3 }, probe.reach, 0.7);
    const result = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target,
      respectLimits: false,
    });

    const fk = forwardKinematics(skeleton, result.mergedPoses);
    for (const bone of ['head', 'hand_l', 'foot_r'] as const) {
      const before = rest.get(bone)!.worldPos;
      const after = fk.get(bone)!.worldPos;
      expect(distanceVec3(before, after)).toBeLessThan(1e-9);
    }
    expect(result.poses.map((p) => p.name)).toEqual(['upperarm_r', 'forearm_r']);
  });

  it('is deterministic: identical inputs produce identical poses', () => {
    const root = restPos('upperarm_r');
    const target = addVec3(root, { x: 0.2, y: -0.4, z: 0.3 });
    const a = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target });
    const b = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target });
    expect(a.poses).toEqual(b.poses);
    expect(a.error).toBe(b.error);
  });

  it('reports an unusable chain instead of throwing', () => {
    const result = solveChainIK(skeleton, 'hand_l', 'hand_r', { target: { x: 0, y: 1, z: 0 } });
    expect(result.chain).toEqual([]);
    expect(result.poses).toEqual([]);
    expect(result.reached).toBe(false);
  });

  it('produces no NaN for a swept field of targets', () => {
    const root = restPos('upperarm_r');
    const probe = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target: root });
    let bad = 0;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) * 0.8 - 0.2, z: Math.sin(a * 2) * 0.5 };
      const target = reachableTarget(root, dir, probe.reach, 0.6);
      const r = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target, respectLimits: false });
      for (const p of r.poses) {
        for (const v of [p.localRot.x, p.localRot.y, p.localRot.z, p.localRot.w]) {
          if (!Number.isFinite(v)) bad += 1;
        }
      }
      if (!Number.isFinite(r.error)) bad += 1;
    }
    expect(bad).toBe(0);
  });
});

describe('pole vector', () => {
  it('moves the elbow toward the pole hint without breaking the solve', () => {
    const root = restPos('upperarm_r');
    const probe = solveChainIK(skeleton, 'upperarm_r', 'hand_r', { target: root });
    const target = reachableTarget(root, { x: 0.4, y: -0.8, z: 0.2 }, probe.reach, 0.6);

    const front = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target,
      poleVector: { x: 0, y: 0, z: 1 },
      respectLimits: false,
    });
    const back = solveChainIK(skeleton, 'upperarm_r', 'hand_r', {
      target,
      poleVector: { x: 0, y: 0, z: -1 },
      respectLimits: false,
    });

    const elbowFront = forwardKinematics(skeleton, front.mergedPoses).get('forearm_r')!.worldPos;
    const elbowBack = forwardKinematics(skeleton, back.mergedPoses).get('forearm_r')!.worldPos;

    // Opposite hints must place the elbow on opposite sides of the chain axis.
    const axis = normalizeVec3(subVec3(target, root));
    const offAxis = (p: Vec3): Vec3 => {
      const rel = subVec3(p, root);
      const along = rel.x * axis.x + rel.y * axis.y + rel.z * axis.z;
      return subVec3(rel, scaleVec3(axis, along));
    };
    const zFront = offAxis(elbowFront).z;
    const zBack = offAxis(elbowBack).z;
    expect(zFront).toBeGreaterThan(zBack);
    expect(front.error).toBeLessThan(0.02);
    expect(back.error).toBeLessThan(0.02);
  });
});

describe('joint limits', () => {
  it('never emits a rotation outside the authored limits', () => {
    const root = restPos('thigh_l');
    const probe = solveLimbIK(skeleton, 'leg_l', root);
    const target = reachableTarget(root, { x: 0.2, y: -0.9, z: 0.6 }, probe.reach, 0.8);
    const result = solveLimbIK(skeleton, 'leg_l', target, { respectLimits: true });

    const byName = new Map(skeleton.map((b) => [b.name, b]));
    for (const pose of result.poses) {
      const limits = byName.get(pose.name)?.limits;
      if (!limits) continue;
      // Re-derive the euler angles the validator uses and check the box.
      const e = quatToEulerDeg(pose.localRot);
      expect(e.x).toBeGreaterThanOrEqual(limits.minDeg.x - 1e-6);
      expect(e.x).toBeLessThanOrEqual(limits.maxDeg.x + 1e-6);
      expect(e.y).toBeGreaterThanOrEqual(limits.minDeg.y - 1e-6);
      expect(e.y).toBeLessThanOrEqual(limits.maxDeg.y + 1e-6);
      expect(e.z).toBeGreaterThanOrEqual(limits.minDeg.z - 1e-6);
      expect(e.z).toBeLessThanOrEqual(limits.maxDeg.z + 1e-6);
    }
  });
});
