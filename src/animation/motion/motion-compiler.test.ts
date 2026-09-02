import { describe, expect, it } from 'vitest';
import { resolveAnatomy } from '../../anatomy/parametric/parametric-anatomy';
import { placeSkeletonFromDefinition } from '../../anatomy/skeleton/skeleton';
import { createDefaultRegistry } from '../../core/schema/descriptors';
import { HumanDefinition } from '../../core/schema/human-definition';
import { compileMotionCommand } from './motion-compiler';

const skeleton = placeSkeletonFromDefinition(
  resolveAnatomy(new HumanDefinition(createDefaultRegistry())),
);

describe('motion compiler', () => {
  it('compiles a hand-raise command into rest-preserving arm poses', () => {
    const plan = compileMotionCommand('raise your right hand', skeleton);

    expect(plan.kind).toBe('raiseHand');
    expect(plan.confidence).toBeGreaterThan(0.8);
    expect(plan.poses.map((p) => p.name)).toEqual([
      'clavicle_r',
      'upperarm_r',
      'forearm_r',
      'hand_r',
    ]);
    expect(plan.poses[1].localPos).toEqual(
      skeleton.find((b) => b.name === 'upperarm_r')!.localPosition,
    );
  });

  it('compiles look-at-camera and neutral commands', () => {
    expect(
      compileMotionCommand('look toward the camera', skeleton).poses.map((p) => p.name),
    ).toEqual(['neck', 'head']);
    expect(compileMotionCommand('return to neutral', skeleton).poses).toEqual([]);
  });

  it('rejects unknown behavior commands without generating poses', () => {
    const plan = compileMotionCommand('teleport to the moon', skeleton);

    expect(plan.kind).toBe('unknown');
    expect(plan.poses).toEqual([]);
    expect(plan.reason).toContain('unrecognized');
  });
});
