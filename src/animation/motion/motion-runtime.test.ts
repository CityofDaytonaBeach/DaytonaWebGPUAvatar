import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import { MotionRuntime, blendPoses, withPhase } from './motion-runtime.js';

const skeleton = defaultSkeleton();

function runtime(): MotionRuntime {
  return new MotionRuntime(skeleton, { defaultBlendDuration: 0.2 });
}

describe('MotionRuntime — command acceptance', () => {
  it('accepts a recognized command and installs it as the active motion', () => {
    const rt = runtime();
    const res = rt.push('wave');
    expect(res.accepted).toBe(true);
    expect(rt.status().activeCommand).toBe('wave');
    expect(rt.status().accepted).toBe(1);
  });

  it('rejects an unrecognized command without disturbing the current pose', () => {
    const rt = runtime();
    rt.push('wave');
    for (let i = 0; i < 20; i++) rt.tick(1 / 60);
    const before = rt.currentPoses();

    const res = rt.push('xyzzy frobnicate');
    expect(res.accepted).toBe(false);
    expect(res.rejection?.reason).toBeTruthy();
    expect(rt.status().activeCommand).toBe('wave');
    expect(rt.currentPoses()).toEqual(before);
    expect(rt.status().rejected).toBe(1);
  });

  it('records rejections in status for diagnostics', () => {
    const rt = runtime();
    rt.push('not a real motion at all');
    const status = rt.status();
    expect(status.rejections).toHaveLength(1);
    expect(status.rejections[0].command).toBe('not a real motion at all');
  });
});

describe('MotionRuntime — cross-fade', () => {
  it('ramps blend from 0 to 1 over the blend duration', () => {
    const rt = runtime();
    rt.push('wave');
    const first = rt.tick(0.05);
    expect(first.blend).toBeGreaterThan(0);
    expect(first.blend).toBeLessThan(1);
    expect(first.blending).toBe(true);

    for (let i = 0; i < 10; i++) rt.tick(0.05);
    const settled = rt.status();
    expect(settled.blend).toBe(1);
    expect(settled.blending).toBe(false);
  });

  it('starts a new fade from the pose currently on screen', () => {
    const rt = runtime();
    rt.push('wave');
    for (let i = 0; i < 4; i++) rt.tick(0.02);
    const mid = rt.currentPoses();
    rt.push('raise right hand');
    const frame = rt.tick(0.001);
    // Immediately after the switch we are still essentially at the old pose.
    expect(frame.blend).toBeLessThan(0.1);
    if (mid.length > 0) {
      const name = mid[0].name;
      const now = frame.poses.find((p) => p.name === name);
      expect(now).toBeDefined();
    }
  });

  it('returns an empty pose set at rest', () => {
    const rt = runtime();
    const frame = rt.tick(1 / 60);
    expect(frame.kind).toBe('rest');
    expect(frame.poses).toEqual([]);
  });
});

describe('MotionRuntime — continuous motion', () => {
  it('advances the walk phase so locomotion cycles', () => {
    const rt = new MotionRuntime(skeleton, { defaultBlendDuration: 0 });
    const pushed = rt.push('walk');
    expect(pushed.accepted).toBe(true);

    const a = rt.tick(0.1);
    for (let i = 0; i < 5; i++) rt.tick(0.1);
    const b = rt.tick(0.1);

    expect(a.continuous).toBe(true);
    const changed = a.poses.some((pose, i) => {
      const other = b.poses[i];
      if (!other) return true;
      return (
        Math.abs(pose.localRot.x - other.localRot.x) +
          Math.abs(pose.localRot.y - other.localRot.y) +
          Math.abs(pose.localRot.z - other.localRot.z) >
        1e-6
      );
    });
    expect(changed).toBe(true);
  });
});

describe('MotionRuntime — determinism', () => {
  it('produces identical poses for identical command and dt sequences', () => {
    const play = (): unknown => {
      const rt = runtime();
      const frames: unknown[] = [];
      rt.push('wave');
      for (let i = 0; i < 12; i++) frames.push(rt.tick(1 / 60));
      rt.push('walk');
      for (let i = 0; i < 12; i++) frames.push(rt.tick(1 / 60));
      return frames;
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('reset returns the runtime to its initial state', () => {
    const rt = runtime();
    rt.push('wave');
    rt.tick(0.1);
    rt.reset();
    const status = rt.status();
    expect(status.time).toBe(0);
    expect(status.frames).toBe(0);
    expect(status.accepted).toBe(0);
    expect(status.activeCommand).toBeNull();
    expect(status.activeKind).toBe('rest');
  });
});

describe('MotionRuntime — release', () => {
  it('fades back to rest and clears the active plan', () => {
    const rt = runtime();
    rt.push('wave');
    for (let i = 0; i < 20; i++) rt.tick(1 / 60);
    rt.release();
    for (let i = 0; i < 30; i++) rt.tick(1 / 60);
    expect(rt.status().activeCommand).toBeNull();
    expect(rt.status().activeKind).toBe('rest');
  });

  it('ignores release when nothing is active', () => {
    const rt = runtime();
    expect(() => rt.release()).not.toThrow();
    expect(rt.status().activeKind).toBe('rest');
  });
});

describe('blendPoses / withPhase', () => {
  it('blends only toward bones present in the target', () => {
    const from = [
      { name: 'a', localPos: { x: 0, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const to = [
      { name: 'a', localPos: { x: 2, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const half = blendPoses(from, to, 0.5);
    expect(half[0].localPos.x).toBeCloseTo(1, 6);
  });

  it('clamps t outside 0..1', () => {
    const from = [
      { name: 'a', localPos: { x: 0, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const to = [
      { name: 'a', localPos: { x: 1, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    expect(blendPoses(from, to, -3)[0].localPos.x).toBeCloseTo(0, 6);
    expect(blendPoses(from, to, 9)[0].localPos.x).toBeCloseTo(1, 6);
  });

  it('includes bones only present on one side', () => {
    const from = [
      { name: 'a', localPos: { x: 0, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const to = [
      { name: 'b', localPos: { x: 1, y: 0, z: 0 }, localRot: { x: 0, y: 0, z: 0, w: 1 } },
    ];
    const out = blendPoses(from, to, 1);
    expect(out.map((p) => p.name).sort()).toEqual(['a', 'b']);
  });

  it('inserts and then rewrites a phase token', () => {
    const once = withPhase('walk', 0.25);
    expect(once).toContain('phase 0.2500');
    const twice = withPhase(once, 0.5);
    expect(twice).toContain('phase 0.5000');
    expect(twice.match(/phase/g)).toHaveLength(1);
  });
});
