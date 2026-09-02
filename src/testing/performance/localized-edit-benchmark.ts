import { Human } from '../../human';
import { EventSource } from '../../core/events/character-event';
import { KernelKind } from '../../compiler/delta/delta-compiler';
import { AffectedSystemName } from '../../compiler/dependency/affected-systems';

// ─── Existing types (kept for backwards compatibility) ────────────────────────

export interface LocalizedEditBenchmarkCase {
  name: string;
  changes: Record<string, number>;
  source?: EventSource;
}

export interface LocalizedEditBenchmarkResult {
  name: string;
  cancelled: boolean;
  cpuTimeMs: number;
  gpuTimeMs: number | null;
  dirtyRegions: string[];
  affectedSystems: AffectedSystemName[];
  computePasses: number;
  kernelKinds: KernelKind[];
  verticesModified: number;
  morphDeltaProcessed: number;
}

export interface LocalizedEditBenchmarkSummary {
  baselineVertexCount: number;
  results: LocalizedEditBenchmarkResult[];
}

export interface GpuTimestampBenchmarkOptions {
  device?: GPUDevice;
  format?: GPUTextureFormat;
  width?: number;
  height?: number;
  cases?: readonly LocalizedEditBenchmarkCase[];
}

export interface GpuTimestampBenchmarkResult {
  supported: boolean;
  reason?: string;
  cpuSummary: LocalizedEditBenchmarkSummary;
}

// ─── New production types ─────────────────────────────────────────────────────

export interface BenchmarkConfig {
  /** Number of full runs of the entire case list (default 10). */
  iterations: number;
  /** Warmup runs discarded before measurement begins (default 3). */
  warmupRuns: number;
  /** Per-iteration hard timeout in ms — benchmark aborts if exceeded (default 30000). */
  timeoutMs: number;
  /** Target fps for frame-pacing simulation — null disables pacing (default null). */
  targetFps: number | null;
  /** If true, force CPU-only path even when GPU timestamp-query is available. */
  cpuOnly: boolean;
}

const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 10,
  warmupRuns: 3,
  timeoutMs: 30_000,
  targetFps: null,
  cpuOnly: false,
};

export interface StatisticalSummary {
  mean: number;
  median: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
  standardDeviation: number;
  samples: number;
}

export interface IterationResult {
  iterationIndex: number;
  wallTimeMs: number;
  results: LocalizedEditBenchmarkResult[];
}

export interface BenchmarkRunSummary {
  config: BenchmarkConfig;
  cases: string[];
  perCaseCpuStats: Record<string, StatisticalSummary>;
  perCaseGpuStats: Record<string, StatisticalSummary>;
  iterations: IterationResult[];
  totalWallTimeMs: number;
  memoryPeakCpuBytes: number | null;
  memoryPeakGpuBytes: number | null;
  gpuTimestampSupported: boolean;
  gpuTimestampReason: string | undefined;
  cancelled: boolean;
  timedOut: boolean;
}

export interface RegressionBaseline {
  /** Per-case CPU time mean from a previous run. */
  cpuMeanMs: Record<string, number>;
  /** Per-case GPU time mean from a previous run (null means not measured). */
  gpuMeanMs: Record<string, number>;
  /** Label for the baseline (e.g. commit SHA, build number). */
  label: string;
}

export interface RegressionFlag {
  caseName: string;
  metric: 'cpu' | 'gpu';
  baselineMs: number;
  currentMs: number;
  changePercent: number;
  /** > 0 means regression, < 0 means improvement. */
  threshold: number;
}

export interface BenchmarkRegressionReport {
  regressions: RegressionFlag[];
  improvements: RegressionFlag[];
  baseline: RegressionBaseline;
}

// ─── Default cases ────────────────────────────────────────────────────────────

export const DEFAULT_LOCALIZED_EDIT_BENCHMARKS: LocalizedEditBenchmarkCase[] = [
  { name: 'nose width localized edit', changes: { 'face.nose.width': 0.9 }, source: 'automation' },
  { name: 'jaw width localized edit', changes: { 'face.jaw.width': 1.1 }, source: 'automation' },
  {
    name: 'body muscularity broader edit',
    changes: { 'body.muscularity': 0.72 },
    source: 'automation',
  },
  { name: 'hair cosmetic edit', changes: { 'hair.length': 0.7 }, source: 'automation' },
];

// ─── Feature detection ────────────────────────────────────────────────────────

export interface GpuFeatureStatus {
  timestampQuerySupported: boolean;
  deviceAvailable: boolean;
  writeTimestampAvailable: boolean;
  reason: string | null;
}

export function detectGpuFeatureStatus(device?: GPUDevice): GpuFeatureStatus {
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
  const hasWrite = typeof (probe as TimestampCommandEncoder).writeTimestamp === 'function';
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

// ─── Statistical helpers (zero-dependency, deterministic) ─────────────────────

function computeStats(values: readonly number[]): StatisticalSummary {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, p5: 0, p95: 0, standardDeviation: 0, samples: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance =
    sorted.reduce((s, v) => {
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

// ─── Memory tracking ──────────────────────────────────────────────────────────

function readPeakMemory(): { cpuBytes: number | null; gpuBytes: number | null } {
  let cpuBytes: number | null = null;
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as { memory?: { usedJSHeapSize?: number } }).memory;
    if (mem?.usedJSHeapSize != null) {
      cpuBytes = mem.usedJSHeapSize;
    }
  }
  let gpuBytes: number | null = null;
  // WebGPU per-device memory info is not standardized; attempt best-effort read.
  // Some browsers expose device.lost with info, but there is no stable API.
  // Return null when unavailable.
  return { cpuBytes, gpuBytes };
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface TimestampCommandEncoder extends GPUCommandEncoder {
  writeTimestamp?: (querySet: GPUQuerySet, queryIndex: number) => void;
}

// ─── Single-run helpers (backwards-compatible) ────────────────────────────────

export async function runLocalizedEditBenchmark(
  cases: readonly LocalizedEditBenchmarkCase[] = DEFAULT_LOCALIZED_EDIT_BENCHMARKS,
  createHuman: () => Promise<Human> = () => Human.create(),
): Promise<LocalizedEditBenchmarkSummary> {
  const results: LocalizedEditBenchmarkResult[] = [];
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

export async function runLocalizedEditGpuTimestampBenchmark(
  options: GpuTimestampBenchmarkOptions = {},
): Promise<GpuTimestampBenchmarkResult> {
  const cases = options.cases ?? DEFAULT_LOCALIZED_EDIT_BENCHMARKS;
  const status = detectGpuFeatureStatus(options.device);
  if (!status.timestampQuerySupported) {
    return {
      supported: false,
      reason: status.reason ?? 'unknown',
      cpuSummary: await runLocalizedEditBenchmark(cases),
    };
  }

  const device = options.device!;
  const format = options.format ?? 'bgra8unorm';
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const results: LocalizedEditBenchmarkResult[] = [];
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
    const encoder = device.createCommandEncoder() as TimestampCommandEncoder;
    encoder.writeTimestamp!(querySet, 0);
    human.gpuPipeline?.render(encoder, view, width, height);
    encoder.writeTimestamp!(querySet, 1);
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

// ─── BenchmarkSuite: multi-iteration, statistical, CI-ready ───────────────────

export class BenchmarkSuite {
  private config: BenchmarkConfig;
  private cases: readonly LocalizedEditBenchmarkCase[];
  private createHuman: () => Promise<Human>;
  private timestampDevice?: GPUDevice;

  constructor(
    opts: {
      config?: Partial<BenchmarkConfig>;
      cases?: readonly LocalizedEditBenchmarkCase[];
      createHuman?: () => Promise<Human>;
      device?: GPUDevice;
    } = {},
  ) {
    this.config = { ...DEFAULT_BENCHMARK_CONFIG, ...opts.config };
    this.cases = opts.cases ?? DEFAULT_LOCALIZED_EDIT_BENCHMARKS;
    this.createHuman = opts.createHuman ?? (() => Human.create());
    this.timestampDevice = opts.device;
  }

  /** Run the full benchmark suite and return a comprehensive summary. */
  async run(): Promise<BenchmarkRunSummary> {
    const featureStatus = detectGpuFeatureStatus(this.timestampDevice);
    const useGpu = !this.config.cpuOnly && featureStatus.timestampQuerySupported;
    const caseNames = this.cases.map((c) => c.name);

    // Memory tracking
    let peakCpuBytes: number | null = null;
    const updatePeakMemory = (): void => {
      const m = readPeakMemory();
      if (m.cpuBytes != null && (peakCpuBytes == null || m.cpuBytes > peakCpuBytes)) {
        peakCpuBytes = m.cpuBytes;
      }
    };

    const allIterations: IterationResult[] = [];
    let cancelled = false;
    let timedOut = false;
    const suiteStart = nowMs();

    for (let i = 0; i < this.config.iterations + this.config.warmupRuns; i++) {
      if (nowMs() - suiteStart > this.config.timeoutMs) {
        timedOut = true;
        break;
      }

      const iterResults: LocalizedEditBenchmarkResult[] = [];
      const iterStart = nowMs();

      for (const item of this.cases) {
        const human = await this.createHuman();

        if (useGpu && this.timestampDevice) {
          const singleGpuResult = await this.runSingleWithGpuTimestamp(item, this.timestampDevice);
          iterResults.push(singleGpuResult);
        } else {
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
    const perCaseCpuStats: Record<string, StatisticalSummary> = {};
    const perCaseGpuStats: Record<string, StatisticalSummary> = {};

    for (const name of caseNames) {
      const cpuTimes: number[] = [];
      const gpuTimes: number[] = [];
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

  private async runSingleWithGpuTimestamp(
    item: LocalizedEditBenchmarkCase,
    device: GPUDevice,
  ): Promise<LocalizedEditBenchmarkResult> {
    const format: GPUTextureFormat = 'bgra8unorm';
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
    const encoder = device.createCommandEncoder() as TimestampCommandEncoder;
    encoder.writeTimestamp!(querySet, 0);
    human.gpuPipeline?.render(encoder, view, width, height);
    encoder.writeTimestamp!(querySet, 1);
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

// ─── Regression detection ─────────────────────────────────────────────────────

const DEFAULT_REGRESSION_THRESHOLD = 0.2; // 20% slower = regression

export function detectRegressions(
  summary: BenchmarkRunSummary,
  baseline: RegressionBaseline,
  thresholdPercent: number = DEFAULT_REGRESSION_THRESHOLD,
): BenchmarkRegressionReport {
  const regressions: RegressionFlag[] = [];
  const improvements: RegressionFlag[] = [];

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
      } else if (change < -thresholdPercent) {
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
      } else if (change < -thresholdPercent) {
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

// ─── CI-ready output formats ──────────────────────────────────────────────────

/** Produces JUnit-compatible XML for CI systems (GitHub Actions, Jenkins, etc.). */
export function toJUnitXml(
  summary: BenchmarkRunSummary,
  regressions?: BenchmarkRegressionReport,
): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  const suiteCount = summary.cases.length;
  const failureCount = regressions?.regressions.length ?? 0;
  const totalTimeS = (summary.totalWallTimeMs / 1000).toFixed(3);
  lines.push(
    `<testsuite name="localized-edit-benchmark" tests="${suiteCount}" failures="${failureCount}" time="${totalTimeS}">`,
  );

  for (const name of summary.cases) {
    const cpuStats = summary.perCaseCpuStats[name];
    const gpuStats = summary.perCaseGpuStats[name];
    const hasFailure = regressions?.regressions.some((r) => r.caseName === name) ?? false;
    const failure = hasFailure
      ? regressions!.regressions.find((r) => r.caseName === name)
      : undefined;

    lines.push(
      `  <testcase name="${escapeXml(name)}" classname="benchmark/localized-edit" time="${cpuStats.mean.toFixed(4)}">`,
    );
    if (failure) {
      lines.push(
        `    <failure message="${failure.metric} regression: +${(failure.changePercent * 100).toFixed(1)}%">`,
      );
      lines.push(
        `      Baseline: ${failure.baselineMs.toFixed(4)}ms, Current: ${failure.currentMs.toFixed(4)}ms`,
      );
      lines.push(`    </failure>`);
    }
    lines.push(`    <system-out>`);
    lines.push(
      `      cpu: mean=${cpuStats.mean.toFixed(4)}ms p95=${cpuStats.p95.toFixed(4)}ms std=${cpuStats.standardDeviation.toFixed(4)}ms n=${cpuStats.samples}`,
    );
    if (gpuStats.samples > 0) {
      lines.push(
        `      gpu: mean=${gpuStats.mean.toFixed(4)}ms p95=${gpuStats.p95.toFixed(4)}ms std=${gpuStats.standardDeviation.toFixed(4)}ms n=${gpuStats.samples}`,
      );
    }
    lines.push(`    </system-out>`);
    lines.push(`  </testcase>`);
  }

  lines.push(`</testsuite>`);
  return lines.join('\n');
}

/** Produces a JSON summary suitable for CI artifact archival and dashboard ingestion. */
export function toJsonSummary(
  summary: BenchmarkRunSummary,
  regressions?: BenchmarkRegressionReport,
): string {
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
export function toMarkdownTable(
  summary: BenchmarkRunSummary,
  regressions?: BenchmarkRegressionReport,
): string {
  const lines: string[] = [];
  lines.push('## Localized Edit Benchmark Results\n');
  lines.push(
    `> Iterations: ${summary.config.iterations} (warmup: ${summary.config.warmupRuns}) · GPU ts: ${summary.gpuTimestampSupported ? 'yes' : 'no'} · Wall: ${(summary.totalWallTimeMs / 1000).toFixed(1)}s`,
  );

  if (summary.timedOut) {
    lines.push('\n> **WARNING**: Benchmark timed out before completion.\n');
  }

  lines.push('');
  lines.push(
    '| Case | CPU mean (ms) | CPU p95 (ms) | CPU σ (ms) | GPU mean (ms) | GPU p95 (ms) | Status |',
  );
  lines.push(
    '|------|---------------|--------------|------------|---------------|--------------|--------|',
  );

  for (const name of summary.cases) {
    const cpu = summary.perCaseCpuStats[name];
    const gpu = summary.perCaseGpuStats[name];
    const regFlag = regressions?.regressions.find((r) => r.caseName === name && r.metric === 'cpu');
    const impFlag = regressions?.improvements.find(
      (r) => r.caseName === name && r.metric === 'cpu',
    );
    let status = 'OK';
    if (regFlag) status = `REGRESSION +${(regFlag.changePercent * 100).toFixed(1)}%`;
    else if (impFlag) status = `IMPROVED ${(impFlag.changePercent * 100).toFixed(1)}%`;

    const gpuMean = gpu.samples > 0 ? gpu.mean.toFixed(4) : 'n/a';
    const gpuP95 = gpu.samples > 0 ? gpu.p95.toFixed(4) : 'n/a';

    lines.push(
      `| ${name} | ${cpu.mean.toFixed(4)} | ${cpu.p95.toFixed(4)} | ${cpu.standardDeviation.toFixed(4)} | ${gpuMean} | ${gpuP95} | ${status} |`,
    );
  }

  if (summary.memoryPeakCpuBytes != null) {
    lines.push(`\nPeak CPU memory: ${(summary.memoryPeakCpuBytes / 1024 / 1024).toFixed(1)} MB`);
  }

  return lines.join('\n');
}

/** Machine-readable export: full result as JSON string. */
export function exportBenchmarkResult(
  summary: BenchmarkRunSummary,
  regressions?: BenchmarkRegressionReport,
): string {
  return toJsonSummary(summary, regressions);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function')
    return performance.now();
  return Date.now();
}
