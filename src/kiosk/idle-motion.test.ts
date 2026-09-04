import { describe, it, expect } from 'vitest';
import { IdleMotion, DEFAULT_IDLE_MOTION_CONFIG } from './idle-motion.js';

const dt = 1 / 60;

describe('IdleMotion', () => {
  it('never rests perfectly still', () => {
    const idle = new IdleMotion();
    const yaws: number[] = [];
    for (let i = 0; i < Math.round(20 / dt); i += 1) yaws.push(idle.tick(dt).headYaw);
    const min = Math.min(...yaws);
    const max = Math.max(...yaws);
    expect(max - min).toBeGreaterThan(1e-3);
    expect(max).toBeLessThan(DEFAULT_IDLE_MOTION_CONFIG.headDrift * 2);
  });

  it('breathes on a bounded, cyclic curve', () => {
    const idle = new IdleMotion();
    let min = 1;
    let max = 0;
    for (let i = 0; i < Math.round(30 / dt); i += 1) {
      const breath = idle.tick(dt).breath;
      min = Math.min(min, breath);
      max = Math.max(max, breath);
    }
    expect(min).toBeLessThan(0.1);
    expect(max).toBeGreaterThan(0.9);
  });

  it('does not visibly loop over a minute', () => {
    const idle = new IdleMotion();
    const samples: number[] = [];
    for (let i = 0; i < Math.round(60 / dt); i += 1) {
      const f = idle.tick(dt);
      samples.push(f.headYaw + f.headRoll * 3);
    }
    const half = samples.length / 2;
    let identical = 0;
    for (let i = 0; i < half; i += 1) {
      if (Math.abs(samples[i]! - samples[i + half]!) < 1e-6) identical += 1;
    }
    expect(identical).toBeLessThan(half * 0.5);
  });

  it('leans in while listening and back while thinking', () => {
    const idle = new IdleMotion();
    idle.setState('listening');
    let frame = idle.tick(dt);
    for (let i = 0; i < Math.round(2 / dt); i += 1) frame = idle.tick(dt);
    expect(frame.lean).toBeGreaterThan(0.02);
    expect(frame.expression['expression.browInnerUp']).toBeGreaterThan(0.1);

    idle.setState('thinking');
    for (let i = 0; i < Math.round(2 / dt); i += 1) frame = idle.tick(dt);
    expect(frame.lean).toBeLessThan(0);
    expect(frame.expression['expression.browDownLeft']).toBeGreaterThan(0.1);
  });

  it('cross-fades posture instead of snapping', () => {
    const idle = new IdleMotion({ postureBlend: 0.5 });
    for (let i = 0; i < 10; i += 1) idle.tick(dt);
    idle.setState('listening');
    let previous = idle.tick(dt).lean;
    for (let i = 0; i < Math.round(0.5 / dt); i += 1) {
      const lean = idle.tick(dt).lean;
      expect(Math.abs(lean - previous)).toBeLessThan(0.01);
      previous = lean;
    }
  });

  it('adds speech accents only while speaking', () => {
    const quiet = new IdleMotion();
    const talking = new IdleMotion();
    talking.setState('speaking');
    let quietRange = 0;
    let talkingRange = 0;
    let qMin = 1;
    let qMax = -1;
    let tMin = 1;
    let tMax = -1;
    for (let i = 0; i < Math.round(5 / dt); i += 1) {
      talking.setSpeechEnergy(1);
      const q = quiet.tick(dt).headPitch;
      const t = talking.tick(dt).headPitch;
      qMin = Math.min(qMin, q);
      qMax = Math.max(qMax, q);
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    quietRange = qMax - qMin;
    talkingRange = tMax - tMin;
    expect(talkingRange).toBeGreaterThan(quietRange);
  });

  it('schedules small gestures and can be muted', () => {
    const idle = new IdleMotion({
      gestureIntervalByState: { idle: 2, listening: 2, thinking: 2, speaking: 2 },
    });
    let gestures = 0;
    for (let i = 0; i < Math.round(60 / dt); i += 1) if (idle.tick(dt).gesture) gestures += 1;
    expect(gestures).toBeGreaterThan(3);

    idle.setGesturesEnabled(false);
    let muted = 0;
    for (let i = 0; i < Math.round(60 / dt); i += 1) if (idle.tick(dt).gesture) muted += 1;
    expect(muted).toBe(0);
  });

  it('is deterministic for identical seeds', () => {
    const a = new IdleMotion({ seed: 11 });
    const b = new IdleMotion({ seed: 11 });
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const fa = a.tick(dt);
      const fb = b.tick(dt);
      left.push(`${fa.headYaw}|${fa.gesture ?? ''}`);
      right.push(`${fb.headYaw}|${fb.gesture ?? ''}`);
    }
    expect(left).toEqual(right);
  });
});
