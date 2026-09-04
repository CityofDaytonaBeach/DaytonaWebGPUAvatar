import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BENCHMARK_BUDGETS,
  baselineFromSummary,
  evaluateBenchmarkGates,
  formatGateResult,
} from './benchmark-gates.js';
import type { BenchmarkRunSummary, StatisticalSummary } from './localized-edit-benchmark.js';

function stats(mean: number, p95 = mean, samples = 10): StatisticalSummary {
  return {
    mean,
    median: mean,
    min: mean * 0.8,
    max: p95,
    p5: mean * 0.8,
    p95,
    standardDeviation: 0,
    samples,
  };
}

function summary(overrides: Partial<BenchmarkRunSummary> = {}): BenchmarkRunSummary {
  return {
    config: { iterations: 10, warmupRuns: 3, timeoutMs: 30_000, targetFps: null, cpuOnly: true },
    cases: ['nose width localized edit', 'jaw width localized edit'],
    perCaseCpuStats: {
      'nose width localized edit': stats(1.2, 2.5),
      'jaw width localized edit': stats(1.3, 2.7),
    },
    perCaseGpuStats: {},
    iterations: [],
    totalWallTimeMs: 500,
    memoryPeakCpuBytes: 1000,
    memoryPeakGpuBytes: null,
    gpuTimestampSupported: false,
    gpuTimestampReason: 'no device',
    cancelled: false,
    timedOut: false,
    ...overrides,
  };
}

describe('evaluateBenchmarkGates — absolute budgets', () => {
  it('passes a run inside the default budgets', () => {
    const gate = evaluateBenchmarkGates(summary());
    expect(gate.passed).toBe(true);
    expect(gate.violations).toEqual([]);
    expect(gate.evaluated).toHaveLength(2);
  });

  it('fails when a case exceeds its mean budget', () => {
    const gate = evaluateBenchmarkGates(
      summary({
        perCaseCpuStats: {
          'nose width localized edit': stats(50, 60),
          'jaw width localized edit': stats(1.3, 2.7),
        },
      }),
    );
    expect(gate.passed).toBe(false);
    expect(gate.violations.map((v) => v.kind)).toContain('cpu-mean-exceeded');
    const v = gate.violations.find((x) => x.kind === 'cpu-mean-exceeded');
    expect(v?.overshoot).toBeGreaterThan(0);
  });

  it('fails on a p95 tail even when the mean is fine', () => {
    const gate = evaluateBenchmarkGates(
      summary({
        perCaseCpuStats: {
          'nose width localized edit': stats(1.0, 40),
          'jaw width localized edit': stats(1.3, 2.7),
        },
      }),
    );
    expect(gate.violations.map((v) => v.kind)).toContain('cpu-p95-exceeded');
  });

  it('skips a missing optional case but fails a required one', () => {
    const base = summary({ perCaseCpuStats: {} });
    const optional = evaluateBenchmarkGates(base);
    expect(optional.passed).toBe(true);
    expect(optional.skipped.length).toBeGreaterThan(0);

    const required = evaluateBenchmarkGates(base, {
      budgets: DEFAULT_BENCHMARK_BUDGETS.map((b) => ({ ...b, required: true })),
    });
    expect(required.passed).toBe(false);
    expect(required.violations.map((v) => v.kind)).toContain('missing-measurement');
  });

  it('fails an incomplete run regardless of measurements', () => {
    const gate = evaluateBenchmarkGates(summary({ timedOut: true }));
    expect(gate.passed).toBe(false);
    expect(gate.violations.map((v) => v.kind)).toContain('run-incomplete');
  });

  it('fails a cancelled run', () => {
    const gate = evaluateBenchmarkGates(summary({ cancelled: true }));
    expect(gate.violations.map((v) => v.kind)).toContain('run-incomplete');
  });
});

describe('evaluateBenchmarkGates — gpu and memory', () => {
  it('skips a gpu budget when timing is unavailable', () => {
    const gate = evaluateBenchmarkGates(summary(), {
      budgets: [{ caseName: 'nose width localized edit', maxCpuMeanMs: 8, maxGpuMeanMs: 2 }],
    });
    expect(gate.passed).toBe(true);
    expect(gate.skipped.some((s) => s.includes('gpu'))).toBe(true);
  });

  it('fails a missing gpu measurement when skipping is disabled', () => {
    const gate = evaluateBenchmarkGates(summary(), {
      budgets: [{ caseName: 'nose width localized edit', maxCpuMeanMs: 8, maxGpuMeanMs: 2 }],
      skipGpuWhenUnsupported: false,
    });
    expect(gate.passed).toBe(false);
  });

  it('fails a gpu mean over budget', () => {
    const gate = evaluateBenchmarkGates(
      summary({ perCaseGpuStats: { 'nose width localized edit': stats(9) } }),
      { budgets: [{ caseName: 'nose width localized edit', maxCpuMeanMs: 8, maxGpuMeanMs: 2 }] },
    );
    expect(gate.violations.map((v) => v.kind)).toContain('gpu-mean-exceeded');
  });

  it('enforces a peak memory ceiling', () => {
    const gate = evaluateBenchmarkGates(summary({ memoryPeakCpuBytes: 5000 }), {
      maxPeakCpuBytes: 1000,
    });
    expect(gate.violations.map((v) => v.kind)).toContain('memory-exceeded');
  });
});

describe('evaluateBenchmarkGates — regressions', () => {
  it('flags a regression against a baseline', () => {
    const baseline = baselineFromSummary(summary(), 'abc123');
    const slower = summary({
      perCaseCpuStats: {
        'nose width localized edit': stats(3.0, 3.5),
        'jaw width localized edit': stats(1.3, 2.7),
      },
    });
    const gate = evaluateBenchmarkGates(slower, {}, baseline);
    expect(gate.passed).toBe(false);
    expect(gate.violations.map((v) => v.kind)).toContain('regression');
    expect(gate.regression?.regressions[0].caseName).toBe('nose width localized edit');
  });

  it('reports improvements without failing', () => {
    const baseline = baselineFromSummary(summary(), 'abc123');
    const faster = summary({
      perCaseCpuStats: {
        'nose width localized edit': stats(0.4, 0.6),
        'jaw width localized edit': stats(1.3, 2.7),
      },
    });
    const gate = evaluateBenchmarkGates(faster, {}, baseline);
    expect(gate.passed).toBe(true);
    expect(gate.regression?.improvements.length).toBeGreaterThan(0);
    expect(gate.lines.some((l) => l.includes('improved'))).toBe(true);
  });

  it('gates on absolute budgets alone when no baseline exists', () => {
    const gate = evaluateBenchmarkGates(summary(), {}, null);
    expect(gate.regression).toBeNull();
    expect(gate.passed).toBe(true);
  });
});

describe('baselineFromSummary / formatGateResult', () => {
  it('records only measured cases in the baseline', () => {
    const baseline = baselineFromSummary(
      summary({ perCaseGpuStats: { 'nose width localized edit': stats(1, 1, 0) } }),
      'label',
    );
    expect(Object.keys(baseline.cpuMeanMs)).toHaveLength(2);
    expect(Object.keys(baseline.gpuMeanMs)).toHaveLength(0);
    expect(baseline.label).toBe('label');
  });

  it('renders PASS and FAIL blocks', () => {
    expect(formatGateResult(evaluateBenchmarkGates(summary()))).toContain('BENCHMARK GATES: PASS');
    const failing = evaluateBenchmarkGates(summary({ timedOut: true }));
    const text = formatGateResult(failing);
    expect(text).toContain('BENCHMARK GATES: FAIL');
    expect(text).toContain('FAIL [run-incomplete]');
  });
});
