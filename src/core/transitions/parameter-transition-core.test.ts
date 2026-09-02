import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../schema/descriptors';
import { HumanDefinition } from '../schema/human-definition';
import {
  createParameterTransition,
  sampleTransition,
  transitionComplete,
  TransitionTimeline,
  replayTransition,
  verifyTransitionDeterminism,
  validateTransitionDeterminism,
  ParameterTransition,
} from './parameter-transition';

function makeDef() {
  return new HumanDefinition(createDefaultRegistry());
}

function linear(duration: number): ParameterTransition {
  return {
    id: 't1',
    path: 'body.muscularity',
    startValue: 0.5,
    targetValue: 0.8,
    startTime: 0,
    duration,
    curve: 'linear',
    easeVariant: 'easeInOut',
  };
}

describe('sampleTransition curves', () => {
  it('clamps to start at t=0 and target at t=duration', () => {
    const t = linear(10);
    expect(sampleTransition(t, 0)).toBeCloseTo(0.5, 6);
    expect(sampleTransition(t, 10)).toBeCloseTo(0.8, 6);
    // Past the end stays clamped at the target.
    expect(sampleTransition(t, 99)).toBeCloseTo(0.8, 6);
  });

  it('step curve snaps at the midpoint threshold', () => {
    const t: ParameterTransition = { ...linear(10), curve: 'step' };
    expect(sampleTransition(t, 4.99)).toBeCloseTo(0.5, 6);
    expect(sampleTransition(t, 5)).toBeCloseTo(0.8, 6);
  });

  it('duration 0 immediately returns the target', () => {
    const t = linear(0);
    expect(sampleTransition(t, 0)).toBe(0.8);
  });

  it('linear midpoint is the arithmetic average', () => {
    const t = linear(10);
    expect(sampleTransition(t, 5)).toBeCloseTo(0.65, 6);
  });

  it('rejects negative durations at creation', () => {
    const def = makeDef();
    expect(() =>
      createParameterTransition(
        def,
        { path: 'body.muscularity', targetValue: 0.8, duration: -1 },
        0,
      ),
    ).toThrow();
  });
});

describe('replayTransition / determinism verification', () => {
  it('replays full curve landing on the target within tolerance', () => {
    const t = linear(1);
    const frames = replayTransition(t, 60);
    expect(frames.length).toBeGreaterThan(50);
    const bench = verifyTransitionDeterminism(t);
    expect(bench.withinTolerance).toBe(true);
    expect(bench.absoluteError).toBeLessThanOrEqual(1e-6);
  });

  it('is deterministic across repeated replays', () => {
    const t = linear(2);
    expect(replayTransition(t, 30)).toEqual(replayTransition(t, 30));
  });

  it('batch validation reports per-transition results', () => {
    const results = validateTransitionDeterminism([linear(1), linear(3)]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.withinTolerance)).toBe(true);
  });
});

describe('TransitionTimeline', () => {
  it('adds transitions and tracks completion via tick', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    expect(tl.active.length).toBe(1);
    const completedValues = tl.tick(20);
    expect(completedValues).toEqual([0.8]);
    expect(tl.active.length).toBe(0);
    expect(tl.completed.length).toBe(1);
  });

  it('places negative-duration transitions into failed', () => {
    const tl = new TransitionTimeline();
    tl.add({ ...linear(-5) });
    expect(tl.failed.length).toBe(1);
    expect(tl.active.length).toBe(0);
  });

  it('sampleAll returns mid-flight values without completing them', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    const values = tl.sampleAll(5);
    expect(values.get('body.muscularity')).toBeCloseTo(0.65, 6);
    expect(tl.active.length).toBe(1); // still active
  });

  it('cancel removes a transition by id and returns it', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    const removed = tl.cancel('t1');
    expect(removed?.id).toBe('t1');
    expect(tl.active.length).toBe(0);
    expect(tl.cancel('nope')).toBeUndefined();
  });

  it('cancelByPath removes all transitions for a path', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    tl.add({ ...linear(20), id: 't2' });
    const removed = tl.cancelByPath('body.muscularity');
    expect(removed).toHaveLength(2);
    expect(tl.active.length).toBe(0);
  });

  it('summary reports counts across active/completed/failed', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    tl.add({ ...linear(-1), id: 'bad' });
    tl.tick(100);
    const s = tl.summary();
    expect(s.active).toHaveLength(0);
    expect(s.completed).toHaveLength(1);
    expect(s.failed).toHaveLength(1);
    expect(s.total).toBe(2);
  });

  it('clearCompleted empties the completed list', () => {
    const tl = new TransitionTimeline();
    tl.add(linear(10));
    tl.tick(100);
    tl.clearCompleted();
    expect(tl.completed.length).toBe(0);
  });

  it('transitionComplete reports completion against time', () => {
    expect(transitionComplete(linear(10), 9)).toBe(false);
    expect(transitionComplete(linear(10), 10)).toBe(true);
  });
});
