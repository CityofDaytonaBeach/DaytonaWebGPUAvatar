import { describe, it, expect } from 'vitest';
import { BlinkController, DEFAULT_BLINK_CONFIG } from './blink-controller.js';

const dt = 1 / 120;

function run(
  controller: BlinkController,
  seconds: number,
  state: Parameters<BlinkController['tick']>[1] = 'idle',
) {
  const closures: number[] = [];
  const gaps: number[] = [];
  let last = 0;
  let blinks = 0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    const frame = controller.tick(dt, state);
    closures.push(frame.closure);
    if (frame.started) {
      if (blinks > 0) gaps.push(frame.time ?? 0);
      blinks += 1;
      gaps[gaps.length] = (i * dt - last) as number;
      last = i * dt;
    }
  }
  return { closures, blinks, gaps };
}

describe('BlinkController', () => {
  it('produces a full closed-then-open lid curve', () => {
    const controller = new BlinkController({ minInterval: 1, maxInterval: 1 });
    let sawClosed = false;
    let sawOpening = false;
    let sawOpen = false;
    for (let i = 0; i < Math.round(4 / dt); i += 1) {
      const frame = controller.tick(dt);
      if (frame.phase === 'held') sawClosed = true;
      if (sawClosed && frame.phase === 'opening') sawOpening = true;
      if (sawOpening && frame.phase === 'open') sawOpen = true;
      expect(frame.closure).toBeGreaterThanOrEqual(0);
      expect(frame.closure).toBeLessThanOrEqual(1);
    }
    expect(sawClosed && sawOpening && sawOpen).toBe(true);
    expect(controller.blinkCount).toBeGreaterThan(1);
  });

  it('reopens slower than it closes (asymmetric, human-like curve)', () => {
    const c = DEFAULT_BLINK_CONFIG;
    expect(c.openDuration).toBeGreaterThan(c.closeDuration);
  });

  it('desynchronises the two lids slightly', () => {
    const controller = new BlinkController({ minInterval: 0.2, maxInterval: 0.2 });
    let differed = false;
    for (let i = 0; i < Math.round(3 / dt); i += 1) {
      const frame = controller.tick(dt);
      if (Math.abs(frame.left - frame.right) > 1e-4) differed = true;
    }
    expect(differed).toBe(true);
  });

  it('keeps blink intervals inside natural bounds and varies them', () => {
    const controller = new BlinkController();
    const gaps: number[] = [];
    let last = 0;
    let t = 0;
    for (let i = 0; i < Math.round(600 / dt); i += 1) {
      t += dt;
      const frame = controller.tick(dt);
      if (frame.started && frame.count > 0) {
        gaps.push(t - last);
        last = t;
      }
    }
    expect(gaps.length).toBeGreaterThan(50);
    const unique = new Set(gaps.map((g) => g.toFixed(3)));
    expect(unique.size).toBeGreaterThan(10);
    const longest = Math.max(...gaps);
    expect(longest).toBeLessThan(DEFAULT_BLINK_CONFIG.maxInterval * 1.6);
  });

  it('blinks less often while listening than while thinking', () => {
    const listening = new BlinkController();
    const thinking = new BlinkController();
    for (let i = 0; i < Math.round(600 / dt); i += 1) {
      listening.tick(dt, 'listening');
      thinking.tick(dt, 'thinking');
    }
    expect(thinking.blinkCount).toBeGreaterThan(listening.blinkCount);
  });

  it('suppresses blinks for the requested window', () => {
    const controller = new BlinkController({ minInterval: 0.1, maxInterval: 0.1 });
    controller.tick(dt);
    controller.suppress(1.5);
    let closureDuringSuppression = 0;
    for (let i = 0; i < Math.round(1.2 / dt); i += 1) {
      closureDuringSuppression = Math.max(closureDuringSuppression, controller.tick(dt).closure);
    }
    expect(closureDuringSuppression).toBe(0);
    let blinked = false;
    for (let i = 0; i < Math.round(2 / dt); i += 1) {
      if (controller.tick(dt).closure > 0.5) blinked = true;
    }
    expect(blinked).toBe(true);
  });

  it('honours a requested blink promptly', () => {
    const controller = new BlinkController({ minInterval: 30, maxInterval: 30 });
    controller.requestBlink();
    let closed = false;
    for (let i = 0; i < Math.round(0.5 / dt); i += 1) {
      if (controller.tick(dt).closure > 0.9) closed = true;
    }
    expect(closed).toBe(true);
  });

  it('is deterministic for identical seeds and reset', () => {
    const a = new BlinkController({ seed: 99 });
    const b = new BlinkController({ seed: 99 });
    const first = run(a, 120).closures;
    const second = run(b, 120).closures;
    expect(first).toEqual(second);
    a.reset();
    expect(run(a, 120).closures).toEqual(second);
  });

  it('ignores non-positive timesteps without stalling', () => {
    const controller = new BlinkController();
    const before = controller.tick(0).timeToNext;
    controller.tick(Number.NaN);
    controller.tick(-1);
    expect(controller.tick(0).timeToNext).toBeCloseTo(before, 10);
  });
});
