import { Human } from '../../human.js';
import { EventSource } from '../../core/events/character-event.js';
import { KernelKind } from '../../compiler/delta/delta-compiler.js';
import { AffectedSystemName } from '../../compiler/dependency/affected-systems.js';
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
export interface BenchmarkConfig {
    /** Number of full runs of the entire case list (default 10). */
    iterations: number;
    /** Warmup runs discarded before measurement begins (default 3). */
    warmupRuns: number;
    /** Per-iteration hard timeout in ms â€” benchmark aborts if exceeded (default 30000). */
    timeoutMs: number;
    /** Target fps for frame-pacing simulation â€” null disables pacing (default null). */
    targetFps: number | null;
    /** If true, force CPU-only path even when GPU timestamp-query is available. */
    cpuOnly: boolean;
}
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
export declare const DEFAULT_LOCALIZED_EDIT_BENCHMARKS: LocalizedEditBenchmarkCase[];
export interface GpuFeatureStatus {
    timestampQuerySupported: boolean;
    deviceAvailable: boolean;
    writeTimestampAvailable: boolean;
    reason: string | null;
}
export declare function detectGpuFeatureStatus(device?: GPUDevice): GpuFeatureStatus;
export declare function runLocalizedEditBenchmark(cases?: readonly LocalizedEditBenchmarkCase[], createHuman?: () => Promise<Human>): Promise<LocalizedEditBenchmarkSummary>;
export declare function runLocalizedEditGpuTimestampBenchmark(options?: GpuTimestampBenchmarkOptions): Promise<GpuTimestampBenchmarkResult>;
export declare class BenchmarkSuite {
    private config;
    private cases;
    private createHuman;
    private timestampDevice?;
    constructor(opts?: {
        config?: Partial<BenchmarkConfig>;
        cases?: readonly LocalizedEditBenchmarkCase[];
        createHuman?: () => Promise<Human>;
        device?: GPUDevice;
    });
    /** Run the full benchmark suite and return a comprehensive summary. */
    run(): Promise<BenchmarkRunSummary>;
    private runSingleWithGpuTimestamp;
}
export declare function detectRegressions(summary: BenchmarkRunSummary, baseline: RegressionBaseline, thresholdPercent?: number): BenchmarkRegressionReport;
/** Produces JUnit-compatible XML for CI systems (GitHub Actions, Jenkins, etc.). */
export declare function toJUnitXml(summary: BenchmarkRunSummary, regressions?: BenchmarkRegressionReport): string;
/** Produces a JSON summary suitable for CI artifact archival and dashboard ingestion. */
export declare function toJsonSummary(summary: BenchmarkRunSummary, regressions?: BenchmarkRegressionReport): string;
/** Produces a markdown table for PR comments and README badges. */
export declare function toMarkdownTable(summary: BenchmarkRunSummary, regressions?: BenchmarkRegressionReport): string;
/** Machine-readable export: full result as JSON string. */
export declare function exportBenchmarkResult(summary: BenchmarkRunSummary, regressions?: BenchmarkRegressionReport): string;
//# sourceMappingURL=localized-edit-benchmark.d.ts.map