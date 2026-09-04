import { describe, it, expect } from 'vitest';
import { GazeController, DEFAULT_GAZE_CONFIG } from './gaze-controller.js';

const dt = 1 / 60;
const visitor = { x: 0.1, y: 1.58, z: 1.4 };

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('GazeController', () => {
  it('falls back to the ambient anchor when nobody is tracked', () => {
    const gaze = new GazeController();
    let frame = gaze.tick(dt);
    for (let i = 0; i < 60; i += 1) frame = gaze.tick(dt);
    expect(frame.tracking).toBe(false);
    expect(frame.mode).toBe('ambient');
    expect(distance(frame.target, DEFAULT_GAZE_CONFIG.defaultAnchor)).toBeLessThan(0.2);
  });

  it('converges on a tracked visitor without snapping', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    const first = gaze.tick(dt);
    const startDistance = distance(first.target, visitor);
    let frame = first;
    for (let i = 0; i < 120; i += 1) frame = gaze.tick(dt);
    expect(frame.tracking).toBe(true);
    expect(distance(frame.target, visitor)).toBeLessThan(startDistance);
    expect(distance(frame.target, visitor)).toBeLessThan(0.15);
  });

  it('never jumps the gaze target more than a small step per frame', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    let previous = gaze.tick(dt).target;
    for (let i = 0; i < 2000; i += 1) {
      const next = gaze.tick(dt).target;
      expect(distance(previous, next)).toBeLessThan(0.12);
      previous = next;
    }
  });

  it('performs micro-saccades instead of a fixed stare', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    let frame = gaze.tick(dt);
    for (let i = 0; i < Math.round(30 / dt); i += 1) frame = gaze.tick(dt);
    expect(frame.saccades).toBeGreaterThan(8);
  });

  it('breaks eye contact periodically', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    const modes = new Set<string>();
    for (let i = 0; i < Math.round(30 / dt); i += 1) modes.add(gaze.tick(dt, 'listening').mode);
    expect(modes.has('contact')).toBe(true);
    expect(modes.has('break')).toBe(true);
  });

  it('averts gaze while thinking and returns on reacquire', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    let frame = gaze.tick(dt, 'thinking');
    for (let i = 0; i < Math.round(2 / dt); i += 1) frame = gaze.tick(dt, 'thinking');
    expect(frame.mode).toBe('averted');
    const averted = distance(frame.target, visitor);
    gaze.reacquire();
    for (let i = 0; i < Math.round(2 / dt); i += 1) frame = gaze.tick(dt, 'listening');
    expect(distance(frame.target, visitor)).toBeLessThan(averted);
  });

  it('raises look-at intensity while listening', () => {
    const gaze = new GazeController();
    gaze.setAttentionAnchor(visitor);
    expect(gaze.tick(dt, 'listening').intensity).toBeGreaterThan(gaze.tick(dt, 'idle').intensity);
  });

  it('is deterministic for identical seeds', () => {
    const a = new GazeController({ seed: 7 });
    const b = new GazeController({ seed: 7 });
    a.setAttentionAnchor(visitor);
    b.setAttentionAnchor(visitor);
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < 3000; i += 1) {
      left.push(a.tick(dt, 'listening').target.x);
      right.push(b.tick(dt, 'listening').target.x);
    }
    expect(left).toEqual(right);
  });
});
