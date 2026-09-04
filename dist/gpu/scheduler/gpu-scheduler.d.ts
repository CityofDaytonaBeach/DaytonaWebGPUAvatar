import { KernelKind } from '../../compiler/delta/delta-compiler.js';
import { HumanProfiler } from '../profiler/profiler.js';
export type ScheduleDecision = 'execute' | 'reduce' | 'reuse' | 'defer' | 'skip';
export interface ScheduleItem {
    kind: KernelKind;
    priority: number;
    estimatedCostMs: number;
    dirty: boolean;
    visible: boolean;
    quality: number;
    deadline: number;
}
export type SchedulerProfile = 'mobile' | 'desktop' | 'high-end';
export interface SchedulerConfig {
    /** Frame pacing target in frames per second. */
    targetFps: number;
    /** Frame budget derived from targetFps (computed automatically). */
    frameBudgetMs: number;
    /** Rolling window size for budget history (default 60). */
    historyWindow: number;
    /** Scaling factor applied to estimated cost when quality is reduced (default 0.5). */
    qualityScaleFactor: number;
    /** Priority threshold above which items always execute regardless of budget (default 8). */
    highPriorityThreshold: number;
    /** Whether timestamp-query GPU timing is enabled (default false). */
    timestampQueryEnabled: boolean;
    /** Hardware profile preset. */
    profile: SchedulerProfile;
}
export interface SchedulerStats {
    /** Current frame index since scheduler was created. */
    frameIndex: number;
    /** Timestamp-query measured GPU time for the last frame, or null if unavailable. */
    lastGpuFrameMs: number | null;
    /** CPU time of the scheduling decision phase in the last frame. */
    lastScheduleOverheadMs: number;
    /** Average GPU frame time over the rolling history window. */
    averageGpuFrameMs: number | null;
    /** Average CPU frame time over the rolling history window. */
    averageCpuFrameMs: number;
    /** Number of items executed in the last frame. */
    lastFrameExecuted: number;
    /** Number of items deferred in the last frame. */
    lastFrameDeferred: number;
    /** Number of items skipped in the last frame. */
    lastFrameSkipped: number;
    /** Number of items reduced in the last frame. */
    lastFrameReduced: number;
    /** Number of items reused in the last frame. */
    lastFrameReused: number;
    /** Current frame budget after adaptation. */
    currentBudgetMs: number;
    /** Cumulative number of items scheduled since creation. */
    totalScheduled: number;
}
export interface SchedulerReport {
    stats: SchedulerStats;
    budgetHistory: readonly number[];
    gpuBudgetHistory: readonly (number | null)[];
    profile: SchedulerProfile;
    config: SchedulerConfig;
    timestampQueryAvailable: boolean;
}
export interface SchedulerTimestampQueryState {
    available: boolean;
    querySet: GPUQuerySet | null;
    resolveBuffer: GPUBuffer | null;
    readBuffer: GPUBuffer | null;
}
export declare class PriorityQueue<T> {
    private heap;
    get size(): number;
    push(item: T, priority: number): void;
    pop(): T | undefined;
    peek(): T | undefined;
    toArray(): T[];
    clear(): void;
    private bubbleUp;
    private bubbleDown;
}
/**
 * Human GPU Scheduler.
 *
 * Runs against a configurable frame budget (default ~16.67ms for 60fps).
 * Supports:
 *  - Configurable frame pacing targets (20/30/60/90/120 fps)
 *  - Adaptive quality scaling when over budget
 *  - Timestamp-query GPU timing integration
 *  - Rolling budget history and statistics
 *  - Priority queue scheduling
 *  - Per-frame metrics and reporting
 *  - Hardware profile presets (mobile, desktop, high-end)
 */
export declare class GpuScheduler {
    frameBudgetMs: number;
    private config;
    private profiler;
    private frameIndex;
    private budgetHistory;
    private gpuBudgetHistory;
    private cpuBudgetHistory;
    private lastFrameStats;
    private totalScheduled;
    private timestampQueryState;
    private timestampDevice;
    private priorityQueue;
    constructor(profiler: HumanProfiler, config?: Partial<SchedulerConfig>);
    /** @deprecated Use the profiler-first overload instead. */
    constructor(frameBudgetMs: number, profiler: HumanProfiler);
    /** Enable timestamp-query GPU timing with the given device. Call once at init. */
    enableTimestampQuery(device: GPUDevice): boolean;
    /** Disable timestamp-query and release GPU resources. */
    disableTimestampQuery(): void;
    private ensureTimestampBuffers;
    /** Record GPU timestamp pair around a render pass. Call at start of frame. */
    beginGpuTimestamp(encoder: GPUCommandEncoder): void;
    /** End GPU timestamp pair. Call after render pass. */
    endGpuTimestamp(encoder: GPUCommandEncoder): void;
    /** Read back the GPU timestamp asynchronously. Returns ms or null. */
    readGpuTimestamp(): Promise<number | null>;
    /** Make a decision for one schedule item each frame. */
    decide(item: ScheduleItem): ScheduleDecision;
    /** Schedule a batch of items using the priority queue. Returns decisions in priority order. */
    scheduleBatch(items: readonly ScheduleItem[]): Array<{
        item: ScheduleItem;
        decision: ScheduleDecision;
    }>;
    /** Compute the effective quality factor when reducing. Accounts for measured load. */
    reduceQuality(item: ScheduleItem): number;
    /** Adapt the frame budget to measured load and record history. */
    adapt(measuredMs: number): number;
    /** Adapt using GPU timing when available, otherwise fall back to CPU timing. */
    adaptWithGpuTiming(gpuFrameMs: number | null, cpuFrameMs: number): number;
    /** Reconfigure the scheduler for a different FPS target. */
    setTargetFps(fps: number): void;
    /** Apply a hardware profile preset (mobile, desktop, high-end). */
    setProfile(profile: SchedulerProfile): void;
    private recordHistory;
    /** Get comprehensive scheduler statistics. */
    getStats(): SchedulerStats;
    /** Get a full debugging report. */
    getReport(): SchedulerReport;
    get configRef(): Readonly<SchedulerConfig>;
    private averageOf;
}
//# sourceMappingURL=gpu-scheduler.d.ts.map