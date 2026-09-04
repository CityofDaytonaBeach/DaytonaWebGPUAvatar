import { describe, it, expect } from 'vitest';
import { Human } from '../../human.js';

/**
 * Integration proof for the motion runtime: the compiler now runs *inside* the
 * character's own update loop, so `startMotion` + `update(dt)` moves the rig,
 * while `perform()` and clip playback keep their previous one-shot behaviour.
 */
describe('Human motion runtime integration', () => {
  it('starts a continuous motion and applies poses through update()', async () => {
    const human = await Human.create();
    expect(human.motionRuntimeRef).toBeNull();

    expect(human.startMotion('walk')).toBe(true);
    expect(human.motionRuntimeRef).not.toBeNull();

    for (let i = 0; i < 30; i++) human.update(1 / 60);
    const status = human.motionRuntimeRef!.status();
    expect(status.frames).toBe(30);
    expect(status.activeKind).toBe('walk');
    expect(status.time).toBeCloseTo(0.5, 3);
  });

  it('rejects an unknown motion without activating the runtime path', async () => {
    const human = await Human.create();
    expect(human.startMotion('flibbertigibbet')).toBe(false);
    expect(human.motionRuntimeRef!.status().activeCommand).toBeNull();
    expect(human.motionRuntimeRef!.status().rejected).toBe(1);
  });

  it('stopMotion fades back to rest', async () => {
    const human = await Human.create();
    human.startMotion('wave');
    for (let i = 0; i < 20; i++) human.update(1 / 60);
    human.stopMotion();
    for (let i = 0; i < 40; i++) human.update(1 / 60);
    expect(human.motionRuntimeRef!.status().activeKind).toBe('rest');
  });

  it('leaves perform() behaviour unchanged', async () => {
    const human = await Human.create();
    const result = human.perform('wave');
    expect(result.cancelled).not.toBe(true);
    // perform() does not create the continuous runtime.
    expect(human.motionRuntimeRef).toBeNull();
  });

  it('tickMotion is a no-op before a motion starts', async () => {
    const human = await Human.create();
    expect(human.tickMotion(1 / 60)).toBeNull();
  });
});
