import { detectRegressions, } from './localized-edit-benchmark.js';
/**
 * Default budgets, set from the SDK's own documented targets: a localized
 * parameter edit must stay well inside a 60fps frame (16.6ms) on CPU, and the
 * full-rebuild cases get proportionally more room. These are ceilings, not
 * expectations — typical measured values sit far below them.
 */
export const DEFAULT_BENCHMARK_BUDGETS = [
    { caseName: 'nose width localized edit', maxCpuMeanMs: 8, maxCpuP95Ms: 16.6 },
    { caseName: 'jaw width localized edit', maxCpuMeanMs: 8, maxCpuP95Ms: 16.6 },
];
export const DEFAULT_BENCHMARK_GATE_CONFIG = {
    budgets: DEFAULT_BENCHMARK_BUDGETS,
    regressionThreshold: 0.15,
    skipGpuWhenUnsupported: true,
};
function overshootOf(actual, budget) {
    return budget > 0 ? (actual - budget) / budget : 0;
}
function pct(v) {
    return `${(v * 100).toFixed(1)}%`;
}
/** Evaluate a benchmark run against absolute budgets and an optional baseline. */
export function evaluateBenchmarkGates(summary, config = {}, baseline) {
    const cfg = { ...DEFAULT_BENCHMARK_GATE_CONFIG, ...config };
    const violations = [];
    const evaluated = [];
    const skipped = [];
    const lines = [];
    if (summary.timedOut) {
        violations.push({
            kind: 'run-incomplete',
            caseName: '(suite)',
            message: `benchmark run timed out after ${summary.totalWallTimeMs.toFixed(0)}ms`,
        });
    }
    if (summary.cancelled) {
        violations.push({
            kind: 'run-incomplete',
            caseName: '(suite)',
            message: 'benchmark run was cancelled before completing',
        });
    }
    for (const budget of cfg.budgets) {
        const cpu = summary.perCaseCpuStats[budget.caseName];
        const gpu = summary.perCaseGpuStats[budget.caseName];
        if (!cpu || cpu.samples === 0) {
            if (budget.required) {
                violations.push({
                    kind: 'missing-measurement',
                    caseName: budget.caseName,
                    message: `required case '${budget.caseName}' produced no CPU samples`,
                });
            }
            else {
                skipped.push(`${budget.caseName} (cpu: no samples)`);
            }
            continue;
        }
        evaluated.push(budget.caseName);
        if (cpu.mean > budget.maxCpuMeanMs) {
            violations.push({
                kind: 'cpu-mean-exceeded',
                caseName: budget.caseName,
                message: `cpu mean ${cpu.mean.toFixed(3)}ms over budget ${budget.maxCpuMeanMs}ms (+${pct(overshootOf(cpu.mean, budget.maxCpuMeanMs))})`,
                budgetMs: budget.maxCpuMeanMs,
                actualMs: cpu.mean,
                overshoot: overshootOf(cpu.mean, budget.maxCpuMeanMs),
            });
        }
        if (budget.maxCpuP95Ms != null && cpu.p95 > budget.maxCpuP95Ms) {
            violations.push({
                kind: 'cpu-p95-exceeded',
                caseName: budget.caseName,
                message: `cpu p95 ${cpu.p95.toFixed(3)}ms over budget ${budget.maxCpuP95Ms}ms (+${pct(overshootOf(cpu.p95, budget.maxCpuP95Ms))})`,
                budgetMs: budget.maxCpuP95Ms,
                actualMs: cpu.p95,
                overshoot: overshootOf(cpu.p95, budget.maxCpuP95Ms),
            });
        }
        lines.push(`${budget.caseName}: cpu mean ${cpu.mean.toFixed(3)}ms / budget ${budget.maxCpuMeanMs}ms, p95 ${cpu.p95.toFixed(3)}ms`);
        if (budget.maxGpuMeanMs != null) {
            const gpuMeasured = gpu != null && gpu.samples > 0;
            if (!gpuMeasured) {
                if (cfg.skipGpuWhenUnsupported) {
                    skipped.push(`${budget.caseName} (gpu: ${summary.gpuTimestampReason ?? 'timestamp-query unavailable'})`);
                }
                else {
                    violations.push({
                        kind: 'missing-measurement',
                        caseName: budget.caseName,
                        message: `gpu budget set but no GPU samples (${summary.gpuTimestampReason ?? 'unsupported'})`,
                    });
                }
            }
            else if (gpu.mean > budget.maxGpuMeanMs) {
                violations.push({
                    kind: 'gpu-mean-exceeded',
                    caseName: budget.caseName,
                    message: `gpu mean ${gpu.mean.toFixed(3)}ms over budget ${budget.maxGpuMeanMs}ms (+${pct(overshootOf(gpu.mean, budget.maxGpuMeanMs))})`,
                    budgetMs: budget.maxGpuMeanMs,
                    actualMs: gpu.mean,
                    overshoot: overshootOf(gpu.mean, budget.maxGpuMeanMs),
                });
            }
        }
    }
    if (cfg.maxPeakCpuBytes != null && summary.memoryPeakCpuBytes != null) {
        if (summary.memoryPeakCpuBytes > cfg.maxPeakCpuBytes) {
            violations.push({
                kind: 'memory-exceeded',
                caseName: '(suite)',
                message: `peak cpu memory ${summary.memoryPeakCpuBytes} bytes over budget ${cfg.maxPeakCpuBytes}`,
                budgetMs: undefined,
                actualMs: undefined,
            });
        }
    }
    let regression = null;
    if (baseline) {
        regression = detectRegressions(summary, baseline, cfg.regressionThreshold);
        for (const flag of regression.regressions) {
            violations.push({
                kind: 'regression',
                caseName: flag.caseName,
                message: `${flag.metric} regressed ${pct(flag.changePercent)} vs baseline '${baseline.label}' (${flag.baselineMs.toFixed(3)}ms -> ${flag.currentMs.toFixed(3)}ms)`,
                budgetMs: flag.baselineMs,
                actualMs: flag.currentMs,
                overshoot: flag.changePercent,
            });
        }
        for (const flag of regression.improvements) {
            lines.push(`${flag.caseName}: ${flag.metric} improved ${pct(-flag.changePercent)} vs baseline '${baseline.label}'`);
        }
    }
    return { passed: violations.length === 0, violations, evaluated, skipped, regression, lines };
}
/** Build a reusable baseline artifact from a passing run. */
export function baselineFromSummary(summary, label) {
    const cpuMeanMs = {};
    const gpuMeanMs = {};
    for (const name of summary.cases) {
        const cpu = summary.perCaseCpuStats[name];
        const gpu = summary.perCaseGpuStats[name];
        if (cpu && cpu.samples > 0)
            cpuMeanMs[name] = cpu.mean;
        if (gpu && gpu.samples > 0)
            gpuMeanMs[name] = gpu.mean;
    }
    return { cpuMeanMs, gpuMeanMs, label };
}
/** Render a gate result as a CI log block. */
export function formatGateResult(result) {
    const out = [];
    out.push(result.passed ? 'BENCHMARK GATES: PASS' : 'BENCHMARK GATES: FAIL');
    for (const line of result.lines)
        out.push(`  ${line}`);
    for (const s of result.skipped)
        out.push(`  skipped: ${s}`);
    for (const v of result.violations)
        out.push(`  FAIL [${v.kind}] ${v.caseName}: ${v.message}`);
    return out.join('\n');
}
//# sourceMappingURL=benchmark-gates.js.map