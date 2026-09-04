import { describe, it, expect } from 'vitest';
import { defaultSkeleton } from '../../anatomy/skeleton/skeleton.js';
import { distanceVec3, forwardKinematics } from '../skeleton/kinematics.js';
import { solveLimbIK } from '../ik/ik-solver.js';
import { MotionRuntime } from './motion-runtime.js';

const skeleton = defaultSkeleton();
const rest = forwardKinematics(skeleton, []);
const shoulder = rest.get('upperarm_r')!.worldPos;
const headRest = rest.get('head')!.worldPos;

function runtime(): MotionRuntime {
  return new MotionRuntime(skeleton, { defaultBlendDuration: 0.2 });
}

/** An arm target well inside reach, in front of and below the shoulder. */
function armTarget(): { x: number; y: number; z: number } {
  const reach = solveLimbIK(skeleton, 'arm_r', shoulder).reach;
  return {
    x: shoulder.x + reach * 0.35,
    y: shoulder.y - reach * 0.45,
    z: shoulder.z + reach * 0.4,
  };
}

describe('MotionRuntime — IK constraints', () => {
  it('layers an arm IK target onto the rest pose and reports FK-measured reach', () => {
    const rt = runtime();
    const target = armTarget();
    const id = rt.setIkTarget({ limb: 'arm_r', target, respectLimits: false, tolerance: 0.005 });
    expect(id).toBe('arm_r');

    const frame = rt.tick(1 / 60);
    expect(frame.ik).toHaveLength(1);
    expect(frame.ik[0].chain).toEqual(['upperarm_r', 'forearm_r', 'hand_r']);
    expect(frame.ik[0].reached).toBe(true);
    expect(frame.ik[0].error).toBeLessThan(0.005);

    const hand = forwardKinematics(skeleton, frame.poses).get('hand_r')!.worldPos;
    expect(distanceVec3(hand, target)).toBeLessThan(0.005);
  });

  it('keeps the constraint satisfied while a motion command plays underneath', () => {
    const rt = runtime();
    expect(rt.push('walk forward speed 1.2').accepted).toBe(true);

    for (let i = 0; i < 60; i++) {
      // Walking moves the torso, so the reach target is re-anchored to the
      // shoulder each frame (a body-relative constraint, as a gesture would be).
      const base = rt.currentPoses();
      const current = forwardKinematics(skeleton, base).get('upperarm_r')!.worldPos;
      // Reach is measured against the *current* base pose, not the rest pose:
      // the walking plan's limb poses are shorter than the rest skeleton.
      const reach = solveLimbIK(skeleton, 'arm_r', current, { basePoses: base }).reach;
      const target = {
        x: current.x + reach * 0.2,
        y: current.y - reach * 0.3,
        z: current.z + reach * 0.25,
      };
      rt.setIkTarget({ limb: 'arm_r', target, respectLimits: false, tolerance: 0.005 });

      const frame = rt.tick(1 / 60);
      expect(frame.ik).toHaveLength(1);
      expect(frame.ik[0].targetUnreachable).toBe(false);
      // The anchor is sampled one frame before the tick advances the walk, so a
      // few centimetres of body travel are expected; the solve itself converges.
      expect(frame.ik[0].error).toBeLessThan(0.06);
      const hand = forwardKinematics(skeleton, frame.poses).get('hand_r')!.worldPos;
      expect(distanceVec3(hand, frame.ik[0].target)).toBeLessThan(0.06);
    }
  });

  it('does not disturb bones outside the constrained chain', () => {
    const rt = runtime();
    rt.setIkTarget({ limb: 'arm_r', target: armTarget(), respectLimits: false });
    const frame = rt.tick(1 / 60);
    const fk = forwardKinematics(skeleton, frame.poses);
    for (const bone of ['hand_l', 'foot_r', 'head'] as const) {
      expect(distanceVec3(fk.get(bone)!.worldPos, rest.get(bone)!.worldPos)).toBeLessThan(1e-9);
    }
  });

  it('supports several simultaneous constraints and clears them individually', () => {
    const rt = runtime();
    rt.setIkTarget({ id: 'right', limb: 'arm_r', target: armTarget(), respectLimits: false });
    const leftShoulder = rest.get('upperarm_l')!.worldPos;
    rt.setIkTarget({
      id: 'left',
      limb: 'arm_l',
      target: { x: leftShoulder.x - 0.15, y: leftShoulder.y - 0.3, z: leftShoulder.z + 0.25 },
      respectLimits: false,
    });

    let frame = rt.tick(1 / 60);
    expect(frame.ik.map((f) => f.id).sort()).toEqual(['left', 'right']);
    expect(rt.status().ikConstraints).toHaveLength(2);

    expect(rt.clearIkTarget('left')).toBe(true);
    frame = rt.tick(1 / 60);
    expect(frame.ik.map((f) => f.id)).toEqual(['right']);

    rt.clearIkTargets();
    frame = rt.tick(1 / 60);
    expect(frame.ik).toEqual([]);
  });

  it('flags an unreachable target instead of tearing the arm off', () => {
    const rt = runtime();
    rt.setIkTarget({ limb: 'arm_r', target: { x: shoulder.x + 10, y: shoulder.y, z: 0 } });
    const frame = rt.tick(1 / 60);
    expect(frame.ik[0].targetUnreachable).toBe(true);
    expect(frame.ik[0].reached).toBe(false);
    for (const pose of frame.poses) {
      for (const v of [pose.localRot.x, pose.localRot.y, pose.localRot.z, pose.localRot.w]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('MotionRuntime — gaze', () => {
  it('tracks a look-at target every frame and reports the measured error', () => {
    const rt = runtime();
    rt.setLookAtTarget(
      { x: 0.5, y: headRest.y + 0.2, z: headRest.z + 2 },
      { respectLimits: false, passes: 3 },
    );
    const frame = rt.tick(1 / 60);
    expect(frame.lookAt).not.toBeNull();
    expect(frame.lookAt!.chain).toEqual(['neck', 'head']);
    expect(frame.lookAt!.angleErrorDeg).toBeLessThan(1);
  });

  it('follows a moving target and clears cleanly', () => {
    const rt = runtime();
    rt.push('walk forward speed 1');
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * 0.8 - 0.4;
      rt.setLookAtTarget(
        { x: Math.sin(angle) * 2, y: headRest.y, z: headRest.z + Math.cos(angle) * 2 },
        { respectLimits: false, passes: 2 },
      );
      const frame = rt.tick(1 / 60);
      expect(frame.lookAt!.angleErrorDeg).toBeLessThan(5);
    }
    rt.clearLookAtTarget();
    expect(rt.tick(1 / 60).lookAt).toBeNull();
  });

  it('composes gaze with arm IK in one frame', () => {
    const rt = runtime();
    const target = armTarget();
    rt.setIkTarget({ limb: 'arm_r', target, respectLimits: false, tolerance: 0.005 });
    rt.setLookAtTarget({ x: 0, y: headRest.y, z: headRest.z + 2 }, { respectLimits: false });

    const frame = rt.tick(1 / 60);
    expect(frame.ik).toHaveLength(1);
    expect(frame.lookAt).not.toBeNull();
    // Gaze runs last but must not undo the arm solve (disjoint chains).
    const hand = forwardKinematics(skeleton, frame.poses).get('hand_r')!.worldPos;
    expect(distanceVec3(hand, target)).toBeLessThan(0.01);
  });
});

describe('MotionRuntime — determinism and reset', () => {
  it('two runtimes fed identical input produce identical frames', () => {
    const a = runtime();
    const b = runtime();
    for (const rt of [a, b]) {
      rt.setIkTarget({ limb: 'arm_r', target: armTarget(), respectLimits: false });
      rt.setLookAtTarget({ x: 0.3, y: headRest.y, z: headRest.z + 1.5 });
      rt.push('walk forward speed 1.1');
    }
    for (let i = 0; i < 45; i++) {
      const fa = a.tick(1 / 60);
      const fb = b.tick(1 / 60);
      expect(fa.poses).toEqual(fb.poses);
      expect(fa.ik).toEqual(fb.ik);
      expect(fa.lookAt).toEqual(fb.lookAt);
    }
  });

  it('reset drops constraints along with motion state', () => {
    const rt = runtime();
    rt.setIkTarget({ limb: 'arm_r', target: armTarget() });
    rt.setLookAtTarget({ x: 0, y: headRest.y, z: headRest.z + 2 });
    rt.push('walk forward speed 1');
    rt.tick(1 / 60);

    rt.reset();
    const status = rt.status();
    expect(status.ikConstraints).toEqual([]);
    expect(status.lookAt).toBeNull();
    const frame = rt.tick(1 / 60);
    expect(frame.ik).toEqual([]);
    expect(frame.lookAt).toBeNull();
  });
});
