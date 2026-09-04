import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GPU_LIMITS,
  GpuValidationHarness,
  validateBufferBinding,
  validateComputeResources,
  validateDispatch,
  validatePackedMorphBounds,
} from './gpu-validation-harness.js';

describe('validateDispatch', () => {
  it('accepts an exactly-covering dispatch', () => {
    const r = validateDispatch({
      scope: 'morph',
      workItems: 640,
      workgroupSize: 64,
      workgroups: [10, 1, 1],
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('accepts the ceil() padding a real kernel produces', () => {
    const r = validateDispatch({
      scope: 'morph',
      workItems: 641,
      workgroupSize: 64,
      workgroups: [Math.ceil(641 / 64), 1, 1],
    });
    expect(r.ok).toBe(true);
  });

  it('flags a dispatch that under-covers the mesh', () => {
    const r = validateDispatch({
      scope: 'morph',
      workItems: 1000,
      workgroupSize: 64,
      workgroups: [4, 1, 1],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain('dispatch.under-covers-work');
  });

  it('flags a fully wasted workgroup', () => {
    const r = validateDispatch({
      scope: 'morph',
      workItems: 64,
      workgroupSize: 64,
      workgroups: [3, 1, 1],
    });
    expect(r.issues.map((i) => i.code)).toContain('dispatch.over-covers-work');
  });

  it('flags workgroup counts beyond device limits', () => {
    const r = validateDispatch({
      scope: 'morph',
      workItems: 1,
      workgroupSize: 64,
      workgroups: [DEFAULT_GPU_LIMITS.maxComputeWorkgroupsPerDimension + 1, 1, 1],
    });
    expect(r.issues.map((i) => i.code)).toContain('dispatch.exceeds-limit');
  });

  it('flags an invalid workgroup size', () => {
    const r = validateDispatch({
      scope: 'x',
      workItems: 0,
      workgroupSize: 0,
      workgroups: [1, 1, 1],
    });
    expect(r.issues.map((i) => i.code)).toContain('dispatch.invalid-workgroup-size');
  });

  it('flags a workgroup size above the invocation limit', () => {
    const r = validateDispatch({
      scope: 'x',
      workItems: 0,
      workgroupSize: DEFAULT_GPU_LIMITS.maxComputeInvocationsPerWorkgroup + 1,
      workgroups: [1, 1, 1],
    });
    expect(r.issues.map((i) => i.code)).toContain('dispatch.workgroup-size-exceeds-limit');
  });
});

describe('validateBufferBinding', () => {
  it('accepts a correctly sized binding', () => {
    const r = validateBufferBinding({
      scope: 'morph',
      label: 'basePositions',
      byteSize: 100 * 12,
      strideBytes: 12,
      maxElementIndex: 99,
    });
    expect(r.ok).toBe(true);
  });

  it('flags an out-of-bounds shader read', () => {
    const r = validateBufferBinding({
      scope: 'morph',
      label: 'basePositions',
      byteSize: 100 * 12,
      strideBytes: 12,
      maxElementIndex: 100,
    });
    expect(r.issues.map((i) => i.code)).toContain('buffer.out-of-bounds');
  });

  it('flags a misaligned offset and a bad stride', () => {
    const r = validateBufferBinding({
      scope: 'morph',
      label: 'deltas',
      byteSize: 64,
      offset: 3,
      strideBytes: 6,
      maxElementIndex: 0,
    });
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('buffer.misaligned-offset');
    expect(codes).toContain('buffer.invalid-stride');
  });

  it('flags an empty buffer', () => {
    const r = validateBufferBinding({
      scope: 'x',
      label: 'empty',
      byteSize: 0,
      strideBytes: 4,
      maxElementIndex: -1,
    });
    expect(r.issues.map((i) => i.code)).toContain('buffer.empty');
  });

  it('reports oversized bindings as out-of-memory', () => {
    const r = validateBufferBinding({
      scope: 'x',
      label: 'huge',
      byteSize: DEFAULT_GPU_LIMITS.maxStorageBufferBindingSize + 16,
      strideBytes: 4,
      maxElementIndex: 0,
    });
    expect(r.issues.some((i) => i.severity === 'out-of-memory')).toBe(true);
  });

  it('applies the uniform limit for uniform bindings', () => {
    const r = validateBufferBinding({
      scope: 'x',
      label: 'params',
      byteSize: DEFAULT_GPU_LIMITS.maxUniformBufferBindingSize + 16,
      strideBytes: 4,
      maxElementIndex: 0,
      kind: 'uniform',
    });
    expect(r.issues.map((i) => i.code)).toContain('buffer.exceeds-binding-limit');
  });
});

describe('validateComputeResources', () => {
  it('aggregates dispatch and binding issues for a whole pass', () => {
    const r = validateComputeResources({
      scope: 'pass',
      dispatch: { scope: 'pass', workItems: 1000, workgroupSize: 64, workgroups: [4, 1, 1] },
      bindings: [
        { scope: 'pass', label: 'positions', byteSize: 12, strideBytes: 12, maxElementIndex: 999 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
    expect(r.checked).toBeGreaterThan(4);
  });
});

describe('validatePackedMorphBounds', () => {
  it('accepts a well-formed packed morph set', () => {
    // one morph, two deltas at slots 0..1, vertices 0 and 1
    const deltaPacked = new Uint32Array([0, 0, 0, 0, 1, 0, 0, 0]);
    const morphStruct = new Uint32Array([0, 2, 0, 0]);
    const r = validatePackedMorphBounds('morph', deltaPacked, morphStruct, 4);
    expect(r.ok).toBe(true);
  });

  it('flags a morph range past the end of the delta array', () => {
    const deltaPacked = new Uint32Array([0, 0, 0, 0]);
    const morphStruct = new Uint32Array([0, 5, 0, 0]);
    const r = validatePackedMorphBounds('morph', deltaPacked, morphStruct, 4);
    expect(r.issues.map((i) => i.code)).toContain('morph.range-out-of-bounds');
  });

  it('flags a vertex index outside the mesh', () => {
    const deltaPacked = new Uint32Array([99, 0, 0, 0]);
    const morphStruct = new Uint32Array([0, 1, 0, 0]);
    const r = validatePackedMorphBounds('morph', deltaPacked, morphStruct, 4);
    expect(r.issues.map((i) => i.code)).toContain('morph.vertex-index-out-of-bounds');
  });

  it('flags misaligned array lengths', () => {
    const r = validatePackedMorphBounds('morph', new Uint32Array(3), new Uint32Array(2), 4);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('morph.delta-misaligned');
    expect(codes).toContain('morph.struct-misaligned');
  });
});

describe('GpuValidationHarness', () => {
  function mockDevice(errors: (GPUError | null)[]): {
    pushErrorScope: () => void;
    popErrorScope: () => Promise<GPUError | null>;
    limits: { maxComputeWorkgroupsPerDimension: number };
  } {
    const queue = [...errors];
    return {
      pushErrorScope: () => undefined,
      popErrorScope: () => Promise.resolve(queue.shift() ?? null),
      limits: { maxComputeWorkgroupsPerDimension: 1024 },
    };
  }

  it('reports clean when no errors are captured', async () => {
    const harness = new GpuValidationHarness(mockDevice([null, null]));
    const value = await harness.capture('pass', () => 42);
    expect(value).toBe(42);
    expect(harness.ok).toBe(true);
    expect(() => harness.assertClean()).not.toThrow();
  });

  it('captures a validation error from the error scope', async () => {
    const harness = new GpuValidationHarness(
      mockDevice([{ message: 'binding size too small' } as GPUError, null]),
    );
    await harness.capture('morph dispatch', () => undefined);
    expect(harness.ok).toBe(false);
    expect(harness.issues[0].code).toBe('device.validation-error');
    expect(harness.issues[0].scope).toBe('morph dispatch');
    expect(() => harness.assertClean()).toThrow(/GPU validation failed/);
  });

  it('captures out-of-memory separately from validation', async () => {
    const harness = new GpuValidationHarness(mockDevice([null, { message: 'oom' } as GPUError]));
    await harness.capture('alloc', () => undefined);
    expect(harness.issues.map((i) => i.severity)).toContain('out-of-memory');
  });

  it('still pops scopes when the work throws', async () => {
    const harness = new GpuValidationHarness(
      mockDevice([{ message: 'bad bind group' } as GPUError, null]),
    );
    await expect(
      harness.capture('boom', () => {
        throw new Error('kernel exploded');
      }),
    ).rejects.toThrow('kernel exploded');
    expect(harness.issues).toHaveLength(1);
  });

  it('merges headless bounds reports and clears', async () => {
    const harness = new GpuValidationHarness(mockDevice([null, null]));
    harness.merge(
      validateDispatch({ scope: 'x', workItems: 1000, workgroupSize: 64, workgroups: [1, 1, 1] }),
    );
    expect(harness.ok).toBe(false);
    expect(harness.report().issues.length).toBeGreaterThan(0);
    harness.clear();
    expect(harness.ok).toBe(true);
  });

  it('uses device limits when present', () => {
    const harness = new GpuValidationHarness(mockDevice([]));
    expect(harness.limits().maxComputeWorkgroupsPerDimension).toBe(1024);
  });
});
