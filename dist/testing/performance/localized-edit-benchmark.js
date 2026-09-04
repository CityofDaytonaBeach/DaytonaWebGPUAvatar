import { Human } from '../../human.js';
const DEFAULT_BENCHMARK_CONFIG = {
    iterations: 10,
    warmupRuns: 3,
    timeoutMs: 30_000,
    targetFps: null,
    cpuOnly: false,
};
// â”€â”€â”€ Default cases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const DEFAULT_LOCALIZED_EDIT_BENCHMARKS = [
    { name: 'nose width localized edit', changes: { 'face.nose.width': 0.9 }, source: 'automation' },
    { name: 'jaw width localized edit', changes: { 'face.jaw.width': 1.1 }, source: 'automation' },
    {
        name: 'body muscularity broader edit',
        changes: { 'body.muscularity': 0.72 },
        source: 'automation',
    },
    { name: 'hair cosmetic edit', changes: { 'hair.length': 0.7 }, source: 'automation' },
];
export function detectGpuFeatureStatus(device) {
    if (!device) {
        return {
            timestampQuerySupported: false,
            deviceAvailable: false,
            writeTimestampAvailable: false,
            reason: 'No GPUDevice provided',
        };
    }
    const hasFeature = device.features.has('timestamp-query');
    if (!hasFeature) {
        return {
            timestampQuerySupported: false,
            deviceAvailable: true,
            writeTimestampAvailable: false,
            reason: 'timestamp-query feature not enabled on device',
        };
    }
    const probe = device.createCommandEncoder();
    const hasWrite = typeof probe.writeTimestamp === 'function';
    if (!hasWrite) {
        return {
            timestampQuerySupported: false,
            deviceAvailable: true,
            writeTimestampAvailable: false,
            reason: 'GPUCommandEncoder.writeTimestamp unavailable in this runtime',
        };
    }
    return {
        timestampQuerySupported: true,
        deviceAvailable: true,
        writeTimestampAvailable: true,
        reason: null,
    };
}
// â”€â”€â”€ Statistical helpers (zero-dependency, deterministic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function computeStats(values) {
    if (values.length === 0) {
        return { mean: 0, median: 0, min: 0, max: 0, p5: 0, p95: 0, standardDeviation: 0, samples: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, v) => s + v, 0) / n;
    const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const variance = sorted.reduce((s, v) => {
        const d = v - mean;
        return s + d * d;
    }, 0) / n;
    const standardDeviation = Math.sqrt(variance);
    const p5Index = Math.min(Math.floor(n * 0.05), n - 1);
    const p95Index = Math.min(Math.floor(n * 0.95), n - 1);
    return {
        mean,
        median,
        min: sorted[0],
        max: sorted[n - 1],
        p5: sorted[p5Index],
        p95: sorted[p95Index],
        standardDeviation,
        samples: n,
    };
}
// â”€â”€â”€ Memory tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function readPeakMemory() {
    let cpuBytes = null;
    if (typeof performance !== 'undefined' && 'memory' in performance) {
        const mem = performance.memory;
        if (mem?.usedJSHeapSize != null) {
            cpuBytes = mem.usedJSHeapSize;
        }
    }
    let gpuBytes = null;
    // WebGPU per-device memory info is not standardized; attempt best-effort read.
    // Some browsers expose device.lost with info, but there is no stable API.
    // Return null when unavailable.
    return { cpuBytes, gpuBytes };
}
// â”€â”€â”€ Single-run helpers (backwards-compatible) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function runLocalizedEditBenchmark(cases = DEFAULT_LOCALIZED_EDIT_BENCHMARKS, createHuman = () => Human.create()) {
    const results = [];
    let baselineVertexCount = 0;
    for (const item of cases) {
        const human = await createHuman();
        baselineVertexCount = human.canonicalRef.vertexCount;
        const start = nowMs();
        const result = human.modify(item.changes, item.source ?? 'automation');
        const cpuTimeMs = nowMs() - start;
        const metrics = human.profiler.latest();
        results.push({
            name: item.name,
            cancelled: result.cancelled,
            cpuTimeMs,
            gpuTimeMs: null,
            dirtyRegions: result.dirtyRegions,
            affectedSystems: result.affectedSystems.map((system) => system.system),
            computePasses: result.affectedKernelWork.length,
            kernelKinds: result.affectedKernelWork.map((work) => work.kind),
            verticesModified: metrics?.verticesModified ?? 0,
            morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
        });
    }
    return { baselineVertexCount, results };
}
export async function runLocalizedEditGpuTimestampBenchmark(options = {}) {
    const cases = options.cases ?? DEFAULT_LOCALIZED_EDIT_BENCHMARKS;
    const status = detectGpuFeatureStatus(options.device);
    if (!status.timestampQuerySupported) {
        return {
            supported: false,
            reason: status.reason ?? 'unknown',
            cpuSummary: await runLocalizedEditBenchmark(cases),
        };
    }
    const device = options.device;
    const format = options.format ?? 'bgra8unorm';
    const width = options.width ?? 64;
    const height = options.height ?? 64;
    const results = [];
    let baselineVertexCount = 0;
    for (const item of cases) {
        const human = await Human.create({ device, format });
        baselineVertexCount = human.canonicalRef.vertexCount;
        const texture = device.createTexture({
            size: { width, height },
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const view = texture.createView();
        const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
        const resolveBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        const readBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const start = nowMs();
        const result = human.modify(item.changes, item.source ?? 'automation');
        human.uploadGpu();
        const encoder = device.createCommandEncoder();
        encoder.writeTimestamp(querySet, 0);
        human.gpuPipeline?.render(encoder, view, width, height);
        encoder.writeTimestamp(querySet, 1);
        encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
        encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16);
        device.queue.submit([encoder.finish()]);
        await readBuffer.mapAsync(GPUMapMode.READ);
        const timestamps = new BigUint64Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        const gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
        const cpuTimeMs = nowMs() - start;
        const metrics = human.profiler.latest();
        results.push({
            name: item.name,
            cancelled: result.cancelled,
            cpuTimeMs,
            gpuTimeMs,
            dirtyRegions: result.dirtyRegions,
            affectedSystems: result.affectedSystems.map((system) => system.system),
            computePasses: result.affectedKernelWork.length,
            kernelKinds: result.affectedKernelWork.map((work) => work.kind),
            verticesModified: metrics?.verticesModified ?? 0,
            morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
        });
        querySet.destroy();
        resolveBuffer.destroy();
        readBuffer.destroy();
        texture.destroy();
    }
    return { supported: true, cpuSummary: { baselineVertexCount, results } };
}
// â”€â”€â”€ BenchmarkSuite: multi-iteration, statistical, CI-ready â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export class BenchmarkSuite {
    config;
    cases;
    createHuman;
    timestampDevice;
    constructor(opts = {}) {
        this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...opts.config };
        this.cases = opts.cases ?? DEFAULT_LOCALIZED_EDIT_BENCHMARKS;
        this.createHuman = opts.createHuman ?? (() => Human.create());
        this.timestampDevice = opts.device;
    }
    /** Run the full benchmark suite and return a comprehensive summary. */
    async run() {
        const featureStatus = detectGpuFeatureStatus(this.timestampDevice);
        const useGpu = !this.config.cpuOnly && featureStatus.timestampQuerySupported;
        const caseNames = this.cases.map((c) => c.name);
        // Memory tracking
        let peakCpuBytes = null;
        const updatePeakMemory = () => {
            const m = readPeakMemory();
            if (m.cpuBytes != null && (peakCpuBytes == null || m.cpuBytes > peakCpuBytes)) {
                peakCpuBytes = m.cpuBytes;
            }
        };
        const allIterations = [];
        let cancelled = false;
        let timedOut = false;
        const suiteStart = nowMs();
        for (let i = 0; i < this.config.iterations + this.config.warmupRuns; i++) {
            if (nowMs() - suiteStart > this.config.timeoutMs) {
                timedOut = true;
                break;
            }
            const iterResults = [];
            const iterStart = nowMs();
            for (const item of this.cases) {
                const human = await this.createHuman();
                if (useGpu && this.timestampDevice) {
                    const singleGpuResult = await this.runSingleWithGpuTimestamp(item, this.timestampDevice);
                    iterResults.push(singleGpuResult);
                }
                else {
                    const start = nowMs();
                    const result = human.modify(item.changes, item.source ?? 'automation');
                    const cpuTimeMs = nowMs() - start;
                    const metrics = human.profiler.latest();
                    iterResults.push({
                        name: item.name,
                        cancelled: result.cancelled,
                        cpuTimeMs,
                        gpuTimeMs: null,
                        dirtyRegions: result.dirtyRegions,
                        affectedSystems: result.affectedSystems.map((s) => s.system),
                        computePasses: result.affectedKernelWork.length,
                        kernelKinds: result.affectedKernelWork.map((w) => w.kind),
                        verticesModified: metrics?.verticesModified ?? 0,
                        morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
                    });
                }
                if (iterResults.some((r) => r.cancelled)) {
                    cancelled = true;
                }
                updatePeakMemory();
            }
            // Drop warmup iterations
            if (i >= this.config.warmupRuns) {
                allIterations.push({
                    iterationIndex: i - this.config.warmupRuns,
                    wallTimeMs: nowMs() - iterStart,
                    results: iterResults,
                });
            }
        }
        const totalWallTimeMs = nowMs() - suiteStart;
        const peakMem = readPeakMemory();
        if (peakMem.cpuBytes != null && (peakCpuBytes == null || peakMem.cpuBytes > peakCpuBytes)) {
            peakCpuBytes = peakMem.cpuBytes;
        }
        // Build per-case stats
        const perCaseCpuStats = {};
        const perCaseGpuStats = {};
        for (const name of caseNames) {
            const cpuTimes = [];
            const gpuTimes = [];
            for (const iter of allIterations) {
                const match = iter.results.find((r) => r.name === name);
                if (match) {
                    cpuTimes.push(match.cpuTimeMs);
                    if (match.gpuTimeMs != null) {
                        gpuTimes.push(match.gpuTimeMs);
                    }
                }
            }
            perCaseCpuStats[name] = computeStats(cpuTimes);
            perCaseGpuStats[name] = computeStats(gpuTimes);
        }
        return {
            config: this.config,
            cases: caseNames,
            perCaseCpuStats,
            perCaseGpuStats,
            iterations: allIterations,
            totalWallTimeMs,
            memoryPeakCpuBytes: peakCpuBytes,
            memoryPeakGpuBytes: peakMem.gpuBytes,
            gpuTimestampSupported: useGpu,
            gpuTimestampReason: featureStatus.reason ?? undefined,
            cancelled,
            timedOut,
        };
    }
    async runSingleWithGpuTimestamp(item, device) {
        const format = 'bgra8unorm';
        const width = 64;
        const height = 64;
        const human = await Human.create({ device, format });
        const texture = device.createTexture({
            size: { width, height },
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const view = texture.createView();
        const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
        const resolveBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        const readBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const start = nowMs();
        const result = human.modify(item.changes, item.source ?? 'automation');
        human.uploadGpu();
        const encoder = device.createCommandEncoder();
        encoder.writeTimestamp(querySet, 0);
        human.gpuPipeline?.render(encoder, view, width, height);
        encoder.writeTimestamp(querySet, 1);
        encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
        encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16);
        device.queue.submit([encoder.finish()]);
        await readBuffer.mapAsync(GPUMapMode.READ);
        const timestamps = new BigUint64Array(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        const gpuTimeMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
        const cpuTimeMs = nowMs() - start;
        const metrics = human.profiler.latest();
        querySet.destroy();
        resolveBuffer.destroy();
        readBuffer.destroy();
        texture.destroy();
        return {
            name: item.name,
            cancelled: result.cancelled,
            cpuTimeMs,
            gpuTimeMs,
            dirtyRegions: result.dirtyRegions,
            affectedSystems: result.affectedSystems.map((s) => s.system),
            computePasses: result.affectedKernelWork.length,
            kernelKinds: result.affectedKernelWork.map((w) => w.kind),
            verticesModified: metrics?.verticesModified ?? 0,
            morphDeltaProcessed: metrics?.morphDeltaProcessed ?? 0,
        };
    }
}
// â”€â”€â”€ Regression detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEFAULT_REGRESSION_THRESHOLD = 0.2; // 20% slower = regression
export function detectRegressions(summary, baseline, thresholdPercent = DEFAULT_REGRESSION_THRESHOLD) {
    const regressions = [];
    const improvements = [];
    for (const name of summary.cases) {
        const cpuStats = summary.perCaseCpuStats[name];
        const gpuStats = summary.perCaseGpuStats[name];
        const cpuBaseline = baseline.cpuMeanMs[name];
        const gpuBaseline = baseline.gpuMeanMs[name];
        if (cpuStats && cpuBaseline != null && cpuStats.samples > 0) {
            const change = (cpuStats.mean - cpuBaseline) / cpuBaseline;
            if (change > thresholdPercent) {
                regressions.push({
                    caseName: name,
                    metric: 'cpu',
                    baselineMs: cpuBaseline,
                    currentMs: cpuStats.mean,
                    changePercent: change,
                    threshold: thresholdPercent,
                });
            }
            else if (change < -thresholdPercent) {
                improvements.push({
                    caseName: name,
                    metric: 'cpu',
                    baselineMs: cpuBaseline,
                    currentMs: cpuStats.mean,
                    changePercent: change,
                    threshold: thresholdPercent,
                });
            }
        }
        if (gpuStats && gpuBaseline != null && gpuStats.samples > 0) {
            const change = (gpuStats.mean - gpuBaseline) / gpuBaseline;
            if (change > thresholdPercent) {
                regressions.push({
                    caseName: name,
                    metric: 'gpu',
                    baselineMs: gpuBaseline,
                    currentMs: gpuStats.mean,
                    changePercent: change,
                    threshold: thresholdPercent,
                });
            }
            else if (change < -thresholdPercent) {
                improvements.push({
                    caseName: name,
                    metric: 'gpu',
                    baselineMs: gpuBaseline,
                    currentMs: gpuStats.mean,
                    changePercent: change,
                    threshold: thresholdPercent,
                });
            }
        }
    }
    return { regressions, improvements, baseline };
}
// â”€â”€â”€ CI-ready output formats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Produces JUnit-compatible XML for CI systems (GitHub Actions, Jenkins, etc.). */
export function toJUnitXml(summary, regressions) {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    const suiteCount = summary.cases.length;
    const failureCount = regressions?.regressions.length ?? 0;
    const totalTimeS = (summary.totalWallTimeMs / 1000).toFixed(3);
    lines.push(`<testsuite name="localized-edit-benchmark" tests="${suiteCount}" failures="${failureCount}" time="${totalTimeS}">`);
    for (const name of summary.cases) {
        const cpuStats = summary.perCaseCpuStats[name];
        const gpuStats = summary.perCaseGpuStats[name];
        const hasFailure = regressions?.regressions.some((r) => r.caseName === name) ?? false;
        const failure = hasFailure
            ? regressions.regressions.find((r) => r.caseName === name)
            : undefined;
        lines.push(`  <testcase name="${escapeXml(name)}" classname="benchmark/localized-edit" time="${cpuStats.mean.toFixed(4)}">`);
        if (failure) {
            lines.push(`    <failure message="${failure.metric} regression: +${(failure.changePercent * 100).toFixed(1)}%">`);
            lines.push(`      Baseline: ${failure.baselineMs.toFixed(4)}ms, Current: ${failure.currentMs.toFixed(4)}ms`);
            lines.push(`    </failure>`);
        }
        lines.push(`    <system-out>`);
        lines.push(`      cpu: mean=${cpuStats.mean.toFixed(4)}ms p95=${cpuStats.p95.toFixed(4)}ms std=${cpuStats.standardDeviation.toFixed(4)}ms n=${cpuStats.samples}`);
        if (gpuStats.samples > 0) {
            lines.push(`      gpu: mean=${gpuStats.mean.toFixed(4)}ms p95=${gpuStats.p95.toFixed(4)}ms std=${gpuStats.standardDeviation.toFixed(4)}ms n=${gpuStats.samples}`);
        }
        lines.push(`    </system-out>`);
        lines.push(`  </testcase>`);
    }
    lines.push(`</testsuite>`);
    return lines.join('\n');
}
/** Produces a JSON summary suitable for CI artifact archival and dashboard ingestion. */
export function toJsonSummary(summary, regressions) {
    const payload = {
        meta: {
            timestamp: new Date().toISOString(),
            config: summary.config,
            totalWallTimeMs: summary.totalWallTimeMs,
            gpuTimestampSupported: summary.gpuTimestampSupported,
            gpuTimestampReason: summary.gpuTimestampReason,
            cancelled: summary.cancelled,
            timedOut: summary.timedOut,
            memoryPeakCpuBytes: summary.memoryPeakCpuBytes,
            memoryPeakGpuBytes: summary.memoryPeakGpuBytes,
        },
        cases: summary.cases.map((name) => ({
            name,
            cpu: summary.perCaseCpuStats[name],
            gpu: summary.perCaseGpuStats[name],
        })),
        regressions: regressions ? regressions.regressions : [],
        improvements: regressions ? regressions.improvements : [],
    };
    return JSON.stringify(payload, null, 2);
}
/** Produces a markdown table for PR comments and README badges. */
export function toMarkdownTable(summary, regressions) {
    const lines = [];
    lines.push('## Localized Edit Benchmark Results\n');
    lines.push(`> Iterations: ${summary.config.iterations} (warmup: ${summary.config.warmupRuns}) Â· GPU ts: ${summary.gpuTimestampSupported ? 'yes' : 'no'} Â· Wall: ${(summary.totalWallTimeMs / 1000).toFixed(1)}s`);
    if (summary.timedOut) {
        lines.push('\n> **WARNING**: Benchmark timed out before completion.\n');
    }
    lines.push('');
    lines.push('| Case | CPU mean (ms) | CPU p95 (ms) | CPU Ïƒ (ms) | GPU mean (ms) | GPU p95 (ms) | Status |');
    lines.push('|------|---------------|--------------|------------|---------------|--------------|--------|');
    for (const name of summary.cases) {
        const cpu = summary.perCaseCpuStats[name];
        const gpu = summary.perCaseGpuStats[name];
        const regFlag = regressions?.regressions.find((r) => r.caseName === name && r.metric === 'cpu');
        const impFlag = regressions?.improvements.find((r) => r.caseName === name && r.metric === 'cpu');
        let status = 'OK';
        if (regFlag)
            status = `REGRESSION +${(regFlag.changePercent * 100).toFixed(1)}%`;
        else if (impFlag)
            status = `IMPROVED ${(impFlag.changePercent * 100).toFixed(1)}%`;
        const gpuMean = gpu.samples > 0 ? gpu.mean.toFixed(4) : 'n/a';
        const gpuP95 = gpu.samples > 0 ? gpu.p95.toFixed(4) : 'n/a';
        lines.push(`| ${name} | ${cpu.mean.toFixed(4)} | ${cpu.p95.toFixed(4)} | ${cpu.standardDeviation.toFixed(4)} | ${gpuMean} | ${gpuP95} | ${status} |`);
    }
    if (summary.memoryPeakCpuBytes != null) {
        lines.push(`\nPeak CPU memory: ${(summary.memoryPeakCpuBytes / 1024 / 1024).toFixed(1)} MB`);
    }
    return lines.join('\n');
}
/** Machine-readable export: full result as JSON string. */
export function exportBenchmarkResult(summary, regressions) {
    return toJsonSummary(summary, regressions);
}
// â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function escapeXml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function')
        return performance.now();
    return Date.now();
}
//# sourceMappingURL=localized-edit-benchmark.js.map