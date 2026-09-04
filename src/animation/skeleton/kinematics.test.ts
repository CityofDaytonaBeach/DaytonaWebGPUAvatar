import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import { quatFromEulerDeg } from './skeletal-animation.js';
import {
  boneWorldPosition,
  distanceVec3,
  eulerDegToQuat,
  forwardKinematics,
  quatBetween,
  quatToEulerDeg,
  resolveBoneChain,
  rotateVec3,
  topologicalBoneOrder,
} from './kinematics.js';

const skeleton = defaultSkeleton();

describe('forwardKinematics', () => {
  it('orders bones parents-first regardless of array order', () => {
    const shuffled = [...skeleton].reverse();
    const order = topologicalBoneOrder(shuffled).map((b) => b.name);
    for (const bone of shuffled) {
      if (!bone.parent) continue;
      expect(order.indexOf(bone.parent)).toBeLessThan(order.indexOf(bone.name));
    }
    expect(order).toHaveLength(skeleton.length);
  });

  it('places rest bones by accumulating parent offsets', () => {
    const fk = forwardKinematics(skeleton, []);
    const pelvis = fk.get('pelvis')!;
    const chest = fk.get('chest')!;
    expect(pelvis.worldPos.y).toBeCloseTo(0.98, 6);
    // pelvis + spine_01 + spine_02 + chest offsets.
    expect(chest.worldPos.y).toBeCloseTo(0.98 + 0.12 + 0.12 + 0.16, 6);
  });

  it('propagates a parent rotation to every descendant', () => {
    const yaw = quatFromEulerDeg(0, 90, 0);
    const restHead = boneWorldPosition(skeleton, 'head', [])!;
    const rotated = boneWorldPosition(skeleton, 'head', [
      { name: 'pelvis', localPos: { x: 0, y: 0.98, z: 0 }, localRot: yaw },
    ])!;
    // A pure yaw about a vertical spine leaves height untouched.
    expect(rotated.y).toBeCloseTo(restHead.y, 6);

    const handRest = boneWorldPosition(skeleton, 'hand_r', [])!;
    const handYawed = boneWorldPosition(skeleton, 'hand_r', [
      { name: 'pelvis', localPos: { x: 0, y: 0.98, z: 0 }, localRot: yaw },
    ])!;
    // The arm swings out of its rest plane: the world position must change.
    expect(distanceVec3(handRest, handYawed)).toBeGreaterThan(0.1);
  });

  it('is deterministic across repeated evaluations', () => {
    const poses = [
      {
        name: 'upperarm_r',
        localPos: { x: 0, y: 0, z: 0 },
        localRot: quatFromEulerDeg(10, 20, 30),
      },
    ];
    const a = forwardKinematics(skeleton, poses).get('hand_r')!;
    const b = forwardKinematics(skeleton, poses).get('hand_r')!;
    expect(a.worldPos).toEqual(b.worldPos);
    expect(a.worldRot).toEqual(b.worldRot);
  });
});

describe('chain resolution', () => {
  it('resolves an arm chain root-first', () => {
    expect(resolveBoneChain(skeleton, 'upperarm_r', 'hand_r')).toEqual([
      'upperarm_r',
      'forearm_r',
      'hand_r',
    ]);
  });

  it('returns null when the bones are not on one chain', () => {
    expect(resolveBoneChain(skeleton, 'hand_l', 'hand_r')).toBeNull();
  });
});

describe('quaternion helpers', () => {
  it('quatBetween rotates one direction exactly onto another', () => {
    const from = { x: 0, y: 1, z: 0 };
    const to = { x: 0.3, y: -0.2, z: 0.9 };
    const q = quatBetween(from, to);
    const moved = rotateVec3(q, from);
    const len = Math.hypot(to.x, to.y, to.z);
    expect(moved.x).toBeCloseTo(to.x / len, 6);
    expect(moved.y).toBeCloseTo(to.y / len, 6);
    expect(moved.z).toBeCloseTo(to.z / len, 6);
  });

  it('quatBetween handles opposite vectors without NaN', () => {
    const q = quatBetween({ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 });
    const moved = rotateVec3(q, { x: 0, y: 1, z: 0 });
    expect(Number.isFinite(moved.x)).toBe(true);
    expect(moved.y).toBeCloseTo(-1, 6);
  });

  it('euler <-> quaternion round-trips inside the non-degenerate range', () => {
    for (const euler of [
      { x: 0, y: 0, z: 0 },
      { x: 12, y: -30, z: 45 },
      { x: -60, y: 20, z: -10 },
    ]) {
      const back = quatToEulerDeg(eulerDegToQuat(euler.x, euler.y, euler.z));
      expect(back.x).toBeCloseTo(euler.x, 4);
      expect(back.y).toBeCloseTo(euler.y, 4);
      expect(back.z).toBeCloseTo(euler.z, 4);
    }
  });

  it('eulerDegToQuat matches the existing animation euler convention', () => {
    const a = eulerDegToQuat(15, -25, 40);
    const b = quatFromEulerDeg(15, -25, 40);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
    expect(a.w).toBeCloseTo(b.w, 9);
  });
});
