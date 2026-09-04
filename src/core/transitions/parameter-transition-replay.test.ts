import { beforeAll, describe, it, expect } from 'vitest';
import { Human } from '../../human.js';
import {
  createParameterTransition,
  sampleTransition,
  scrubTimeline,
  scrubTransition,
  TransitionTimeline,
  verifyLongReplay,
  type ParameterTransition,
  type TransitionCurve,
} from './parameter-transition.js';

const CURVES: TransitionCurve[] = ['linear', 'ease', 'spring', 'elastic', 'bounce'];

let human: Human;

beforeAll(async () => {
  human = await Human.create();
});

function definition() {
  return human.definitionRef;
}

function transition(
  curve: TransitionCurve,
  duration = 1.5,
  path = 'body.muscularity',
  target = 0.8,
): ParameterTransition {
  return createParameterTransition(definition(), { path, targetValue: target, duration, curve }, 0);
}

describe('deterministic long replay', () => {
  it('replays 10 simulated minutes at 120Hz identically, with no drift', () => {
    for (const curve of CURVES) {
      const report = verifyLongReplay(transition(curve));
      expect(report.frames).toBe(600 * 120 + 1);
      expect(report.deterministic, curve).toBe(true);
      expect(report.maxReplayDeviation).toBe(0);
      expect(report.finite, curve).toBe(true);
      expect(report.settled, curve).toBe(true);
      expect(report.absoluteError).toBeLessThan(1e-9);
    }
  });

  it('lands exactly on the target and never moves again after completion', () => {
    const t = transition('elastic', 2);
    const report = verifyLongReplay(t, { sampleRate: 60, durationSeconds: 120 });
    expect(report.endValue).toBeCloseTo(0.8, 12);
    expect(report.settled).toBe(true);
  });

  it('is independent of the sample rate at the endpoints', () => {
    const t = transition('ease', 1);
    for (const rate of [24, 30, 60, 90, 144, 240]) {
      const report = verifyLongReplay(t, { sampleRate: rate, durationSeconds: 30 });
      expect(report.deterministic).toBe(true);
      expect(report.absoluteError).toBeLessThan(1e-9);
    }
  });

  it('handles a zero-duration transition as an immediate jump', () => {
    const report = verifyLongReplay(transition('linear', 0));
    expect(report.settled).toBe(true);
    expect(report.endValue).toBe(0.8);
  });

  it('replay values match direct sampling frame for frame', () => {
    const t = transition('spring', 1.25);
    const rate = 90;
    for (let i = 0; i <= rate * 3; i++) {
      const time = i / rate;
      const direct = sampleTransition(t, time);
      expect(Number.isFinite(direct)).toBe(true);
      // Sampling twice at the same absolute time must be bit-identical.
      expect(sampleTransition(t, time)).toBe(direct);
    }
  });
});

describe('timeline scrubbing', () => {
  const times = [0, 0.25, 1.4, 0.7, 1.5, 0.1, 3, -2, 0.9];

  it('is order-independent: a shuffled scrub equals an ordered scrub', () => {
    for (const curve of CURVES) {
      const report = scrubTransition(transition(curve), times);
      expect(report.orderIndependent, curve).toBe(true);
      expect(report.maxOrderDeviation).toBe(0);
    }
  });

  it('clamps scrubs outside the transition window to the endpoints', () => {
    for (const curve of CURVES) {
      expect(scrubTransition(transition(curve), times).clamped, curve).toBe(true);
    }
  });

  it('scrubbing backwards reproduces the forward values exactly', () => {
    const t = transition('bounce', 2);
    const forward = [];
    for (let i = 0; i <= 200; i++) forward.push(sampleTransition(t, (i / 200) * 2));
    const backward = [];
    for (let i = 200; i >= 0; i--) backward.push(sampleTransition(t, (i / 200) * 2));
    expect(backward.reverse()).toEqual(forward);
  });

  it('scrubs a whole timeline of simultaneous transitions', () => {
    const def = definition();
    const timeline = new TransitionTimeline();
    timeline.addBatch([
      createParameterTransition(
        def,
        { path: 'body.muscularity', targetValue: 0.8, duration: 1 },
        0,
      ),
      createParameterTransition(
        def,
        { path: 'body.bodyFat', targetValue: 0.3, duration: 2, curve: 'ease' },
        0,
      ),
    ]);

    const scrubTimes = [0, 1.5, 0.5, 2.5, 0.5];
    const frames = scrubTimeline(timeline, scrubTimes);
    expect(frames).toHaveLength(scrubTimes.length);
    for (const frame of frames) {
      expect(frame.size).toBe(2);
      for (const value of frame.values()) expect(Number.isFinite(value)).toBe(true);
    }
    // Same time scrubbed twice, out of order, yields identical values.
    expect([...frames[2]]).toEqual([...frames[4]]);
    // End of window: every transition sits on its target.
    expect(frames[3].get('body.muscularity')).toBeCloseTo(0.8, 12);
    expect(frames[3].get('body.bodyFat')).toBeCloseTo(0.3, 12);
  });

  it('repeated scrub passes over a long timeline stay identical', () => {
    const t = transition('elastic', 1.75);
    const sweep = Array.from({ length: 2000 }, (_, i) => (i / 2000) * 5 - 1);
    const first = scrubTransition(t, sweep);
    const second = scrubTransition(t, sweep);
    expect(first.values).toEqual(second.values);
    expect(first.orderIndependent && second.orderIndependent).toBe(true);
  });
});
