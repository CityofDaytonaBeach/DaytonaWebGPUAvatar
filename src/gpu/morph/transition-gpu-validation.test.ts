import { describe, it, expect } from 'vitest';
import { Human } from '../../human.js';
import {
  DEFAULT_TRANSITION_GPU_CASES,
  runTransitionGpuValidationSuite,
  validateTransitionThroughGpuPath,
} from './transition-gpu-validation.js';

describe('validateTransitionThroughGpuPath', () => {
  it('drives a transition frame by frame with in-bounds GPU payloads', async () => {
    const human = await Human.create();
    const report = await validateTransitionThroughGpuPath(
      human,
      { path: 'face.nose.width', targetValue: 1.1, duration: 0.2, curve: 'ease' },
      { fps: 30 },
    );
    expect(report.frames.length).toBe(6);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.nonFiniteFrames).toBe(0);
  });

  it('produces finite morph deltas on every frame', async () => {
    const human = await Human.create();
    const report = await validateTransitionThroughGpuPath(
      human,
      { path: 'face.jaw.width', targetValue: 0.92, duration: 0.15, curve: 'biological' },
      { fps: 30 },
    );
    expect(report.frames.every((f) => f.morphDeltaFinite)).toBe(true);
  });

  it('reaches the transition target value by the final frame', async () => {
    const human = await Human.create();
    const report = await validateTransitionThroughGpuPath(
      human,
      { path: 'face.nose.width', targetValue: 1.08, duration: 0.2, curve: 'linear' },
      { fps: 60 },
    );
    expect(report.reachedTarget).toBe(true);
    expect(report.finalValue).toBeCloseTo(1.08, 3);
  });

  it('keeps every packed morph range inside the delta array', async () => {
    const human = await Human.create();
    const report = await validateTransitionThroughGpuPath(
      human,
      { path: 'body.muscularity', targetValue: 0.6, duration: 0.1, curve: 'ease' },
      { fps: 30 },
    );
    expect(report.frames.every((f) => f.boundsOk)).toBe(true);
    expect(report.vertexCount).toBeGreaterThan(0);
  });

  it('detects a dispatch that would miss part of the mesh', async () => {
    const human = await Human.create();
    const report = await validateTransitionThroughGpuPath(
      human,
      { path: 'face.nose.width', targetValue: 1.05, duration: 0.05, curve: 'linear' },
      // A workgroup size larger than the kernel's real one would still cover the
      // mesh; a tiny limit instead makes the grid exceed the device limit.
      { fps: 30, workgroupSize: 64, limits: { maxComputeWorkgroupsPerDimension: 1 } },
    );
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'dispatch.exceeds-limit')).toBe(true);
  });

  it('is deterministic across identical runs', async () => {
    const run = async (): Promise<number[]> => {
      const human = await Human.create();
      const report = await validateTransitionThroughGpuPath(
        human,
        { path: 'face.nose.width', targetValue: 1.12, duration: 0.2, curve: 'ease' },
        { fps: 30 },
      );
      return report.frames.map((f) => f.applied);
    };
    expect(await run()).toEqual(await run());
  });
});

describe('runTransitionGpuValidationSuite', () => {
  it('validates every default transition case', async () => {
    const suite = await runTransitionGpuValidationSuite({ fps: 20 });
    expect(suite.reports).toHaveLength(DEFAULT_TRANSITION_GPU_CASES.length);
    expect(suite.issues).toEqual([]);
    expect(suite.ok).toBe(true);
    expect(suite.lines.every((l) => l.includes('bounds=ok'))).toBe(true);
  }, 30_000);
});
