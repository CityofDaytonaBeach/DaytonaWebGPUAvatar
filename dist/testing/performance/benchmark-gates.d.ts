import { type BenchmarkRegressionReport, type BenchmarkRunSummary, type RegressionBaseline } from './localized-edit-benchmark.js';
/**
 * Benchmark gates — the enforcement half of the performance story.
 *
 * `BenchmarkSuite` already measures per-case CPU/GPU time, p95s, and memory, and
 * `detectRegressions` already compares a run against a baseline. What was missing
 * (direction.md P17: "benchmarks are CI-enforced, not advisory") is a *verdict*:
 * an explicit budget per case plus a pass/fail decision a CI job can exit on.
 *
 * A gate evaluation answers three questions, in this order:
 *
 *   1. Did the run itself complete? (a timed-out or cancelled run is a failure,
 *      never a silent pass)
 *   2. Is every measured case inside its absolute budget (mean and p95)?
 *   3. Against the recorded baseline, did anything regress beyond tolerance?
 *
 * Budgets are absolute milliseconds so they hold meaning without a baseline —
 * a fresh clone with no baseline artifact still gets a real gate. Regression
 * checks layer on top when a baseline exists.
 */
export interface BenchmarkBudget {
    /** Case name as reported by the suite. */
    caseName: string;
    /** Maximum acceptable mean CPU ms. */
    maxCpuMeanMs: number;
    /** Maximum acceptable p95 CPU ms (tail latency, i.e. frame hitches). */
    maxCpuP95Ms?: number;
    /** Maximum acceptable mean GPU ms; ignored when GPU timing is unavailable. */
    maxGpuMeanMs?: number;
    /** When true, a missing measurement for this case fails the gate. */
    required?: boolean;
}
export type GateViolationKind = 'cpu-mean-exceeded' | 'cpu-p95-exceeded' | 'gpu-mean-exceeded' | 'missing-measurement' | 'run-incomplete' | 'memory-exceeded' | 'regression';
export interface GateViolation {
    kind: GateViolationKind;
    caseName: string;
    message: string;
    budgetMs?: number;
    actualMs?: number;
    /** Fractional overshoot, e.g. 0.25 = 25% over budget. */
    overshoot?: number;
}
export interface BenchmarkGateConfig {
    budgets: readonly BenchmarkBudget[];
    /** Regression tolerance as a fraction, e.g. 0.15 = 15% slower fails. */
    regressionThreshold: number;
    /** Optional peak CPU memory ceiling in bytes. */
    maxPeakCpuBytes?: number;
    /** Treat unmeasured GPU budgets as skipped rather than failures (default true). */
    skipGpuWhenUnsupported: boolean;
}
export interface BenchmarkGateResult {
    passed: boolean;
    violations: GateViolation[];
    /** Cases evaluated against a budget. */
    evaluated: string[];
    /** Budgets skipped because the metric was unavailable (e.g. no GPU timing). */
    skipped: string[];
    regression: BenchmarkRegressionReport | null;
    /** Human-readable lines suitable for a CI log or PR comment. */
    lines: string[];
}
/**
 * Default budgets, set from the SDK's own documented targets: a localized
 * parameter edit must stay well inside a 60fps frame (16.6ms) on CPU, and the
 * full-rebuild cases get proportionally more room. These are ceilings, not
 * expectations — typical measured values sit far below them.
 */
export declare const DEFAULT_BENCHMARK_BUDGETS: BenchmarkBudget[];
export declare const DEFAULT_BENCHMARK_GATE_CONFIG: BenchmarkGateConfig;
/** Evaluate a benchmark run against absolute budgets and an optional baseline. */
export declare function evaluateBenchmarkGates(summary: BenchmarkRunSummary, config?: Partial<BenchmarkGateConfig>, baseline?: RegressionBaseline | null): BenchmarkGateResult;
/** Build a reusable baseline artifact from a passing run. */
export declare function baselineFromSummary(summary: BenchmarkRunSummary, label: string): RegressionBaseline;
/** Render a gate result as a CI log block. */
export declare function formatGateResult(result: BenchmarkGateResult): string;
//# sourceMappingURL=benchmark-gates.d.ts.map