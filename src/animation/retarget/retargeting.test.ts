import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import type { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { quatFromEulerDeg } from '../skeleton/skeletal-animation.js';
import {
  buildRetargetMap,
  retargetClip,
  retargetFidelity,
  retargetPose,
  retargetedPoseMap,
  skeletonHeight,
} from './retargeting.js';

const source = defaultSkeleton();

/** A proportionally taller rig: every bone offset scaled uniformly. */
function scaledSkeleton(factor: number): BoneDef[] {
  return defaultSkeleton().map((bone) => ({
    ...bone,
    localPosition: {
      x: bone.localPosition.x * factor,
      y: bone.localPosition.y * factor,
      z: bone.localPosition.z * factor,
    },
  }));
}

const restOffset = (name: string) => ({
  ...defaultSkeleton().find((b) => b.name === name)!.localPosition,
});

/** Rotation-only pose built on the source rig's real rest offsets. */
const pose = [
  { name: 'pelvis' as const, localPos: restOffset('pelvis'), localRot: quatFromEulerDeg(0, 10, 0) },
  {
    name: 'upperarm_r' as const,
    localPos: restOffset('upperarm_r'),
    localRot: quatFromEulerDeg(20, 0, -35),
  },
  {
    name: 'forearm_r' as const,
    localPos: restOffset('forearm_r'),
    localRot: quatFromEulerDeg(0, 0, -40),
  },
];

describe('buildRetargetMap', () => {
  it('maps identical bone names one-to-one with no leftovers', () => {
    const map = buildRetargetMap(source, defaultSkeleton());
    expect(map.unmapped).toEqual([]);
    expect(map.bones.size).toBe(source.length);
    expect(map.scale).toBeCloseTo(1, 9);
  });

  it('measures the translation scale from skeleton heights', () => {
    const map = buildRetargetMap(source, scaledSkeleton(1.25));
    expect(map.scale).toBeCloseTo(1.25, 6);
    expect(skeletonHeight(scaledSkeleton(1.25))).toBeCloseTo(skeletonHeight(source) * 1.25, 6);
  });

  it('honours explicit overrides and records unmapped source bones', () => {
    const target = defaultSkeleton().filter((b) => b.name !== 'hand_l');
    const map = buildRetargetMap(source, target);
    expect(map.unmapped).toContain('hand_l');

    const aliased = buildRetargetMap(source, defaultSkeleton(), { boneMap: { head: 'neck' } });
    expect(aliased.bones.get('head')).toBe('neck');
  });
});

describe('retargetPose', () => {
  it('copies rotations unchanged between identical rigs', () => {
    const result = retargetPose(pose, source, defaultSkeleton());
    expect(result.skipped).toEqual([]);
    expect(result.applied).toEqual(['pelvis', 'upperarm_r', 'forearm_r']);
    for (const original of pose) {
      const out = retargetedPoseMap(result).get(original.name)!;
      expect(out.localRot.x).toBeCloseTo(original.localRot.x, 9);
      expect(out.localRot.y).toBeCloseTo(original.localRot.y, 9);
      expect(out.localRot.z).toBeCloseTo(original.localRot.z, 9);
      expect(out.localRot.w).toBeCloseTo(original.localRot.w, 9);
    }
  });

  it('scales root translation onto a taller rig and leaves other bones at rest offsets', () => {
    const target = scaledSkeleton(1.5);
    const result = retargetPose(pose, source, target);
    const map = retargetedPoseMap(result);

    expect(map.get('pelvis')!.localPos.y).toBeCloseTo(restOffset('pelvis').y * 1.5, 6);
    // Non-root bones keep the *target* rig's own bone lengths.
    const targetForearm = target.find((b) => b.name === 'forearm_r')!;
    expect(map.get('forearm_r')!.localPos).toEqual(targetForearm.localPosition);
  });

  it('translations:"all" scales every mapped bone, "none" scales nothing', () => {
    const target = scaledSkeleton(2);
    const all = retargetedPoseMap(retargetPose(pose, source, target, { translations: 'all' }));
    expect(all.get('forearm_r')!.localPos.y).toBeCloseTo(restOffset('forearm_r').y * 2, 6);

    const none = retargetedPoseMap(retargetPose(pose, source, target, { translations: 'none' }));
    expect(none.get('pelvis')!.localPos).toEqual(
      target.find((b) => b.name === 'pelvis')!.localPosition,
    );
  });

  it('skips source bones the target rig does not have', () => {
    const target = defaultSkeleton().filter((b) => b.name !== 'forearm_r');
    const result = retargetPose(pose, source, target);
    expect(result.skipped).toEqual(['forearm_r']);
    expect(result.applied).toEqual(['pelvis', 'upperarm_r']);
  });

  it('is deterministic', () => {
    const target = scaledSkeleton(1.3);
    expect(retargetPose(pose, source, target).poses).toEqual(
      retargetPose(pose, source, target).poses,
    );
  });
});

describe('retargetClip', () => {
  it('preserves frame count/order and reuses one measured scale', () => {
    const frames = [pose, pose.map((p) => ({ ...p })), []];
    const target = scaledSkeleton(1.4);
    const { frames: out, map } = retargetClip(frames, source, target);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual([]);
    expect(map.scale).toBeCloseTo(1.4, 6);
    expect(out[0]).toEqual(out[1]);
  });
});

describe('retargetFidelity', () => {
  it('reports near-zero drift for an identical rig', () => {
    const f = retargetFidelity(pose, source, defaultSkeleton());
    expect(f.bones).toBeGreaterThan(0);
    expect(f.maxRelativeDrift).toBeLessThan(1e-9);
  });

  it('keeps proportional drift small on a uniformly scaled rig', () => {
    const f = retargetFidelity(pose, source, scaledSkeleton(1.5));
    expect(f.maxRelativeDrift).toBeLessThan(0.02);
    expect(f.meanRelativeDrift).toBeLessThan(0.01);
  });
});
