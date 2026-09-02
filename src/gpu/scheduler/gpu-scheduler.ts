import { KernelKind } from "../../compiler/delta/delta-compiler";
import { HumanProfiler } from "../profiler/profiler";

// ─── Existing types (kept for backwards compatibility) ────────────────────────

export type ScheduleDecision = "execute" | "reduce" | "reuse" | "defer" | "skip";

export interface ScheduleItem {
  kind: KernelKind;
  priority: number;
  estimatedCostMs: number;
  dirty: boolean;
  visible: boolean;
  quality: number; // 0..1
  deadline: number;
}

// ─── New production types ─────────────────────────────────────────────────────

export type SchedulerProfile = "mobile" | "desktop" | "high-end";

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

// ─── Frame pacing presets ─────────────────────────────────────────────────────

const FPS_PRESETS: Record<number, Partial<SchedulerConfig>> = {
  20: { frameBudgetMs: 50, profile: "mobile" },
  30: { frameBudgetMs: 33.33, profile: "mobile" },
  60: { frameBudgetMs: 16.67, profile: "desktop" },
  90: { frameBudgetMs: 11.11, profile: "desktop" },
  120: { frameBudgetMs: 8.33, profile: "high-end" },
};

const PROFILE_PRESETS: Record<SchedulerProfile, Partial<SchedulerConfig>> = {
  mobile: { frameBudgetMs: 33.33, targetFps: 30, qualityScaleFactor: 0.4, highPriorityThreshold: 9 },
  desktop: { frameBudgetMs: 16.67, targetFps: 60, qualityScaleFactor: 0.5, highPriorityThreshold: 8 },
  "high-end": { frameBudgetMs: 11.11, targetFps: 90, qualityScaleFactor: 0.6, highPriorityThreshold: 8 },
};

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  targetFps: 60,
  frameBudgetMs: 16.67,
  historyWindow: 60,
  qualityScaleFactor: 0.5,
  highPriorityThreshold: 8,
  timestampQueryEnabled: false,
  profile: "desktop",
};

// ─── Priority queue (min-heap by priority descending, higher = more urgent) ───

export class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];

  get size(): number {
    return this.heap.length;
  }

  push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top.item;
  }

  peek(): T | undefined {
    return this.heap[0]?.item;
  }

  toArray(): T[] {
    return [...this.heap].sort((a, b) => b.priority - a.priority).map((e) => e.item);
  }

  clear(): void {
    this.heap.length = 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.heap[index].priority <= this.heap[parent].priority) break;
      const tmp = this.heap[index];
      this.heap[index] = this.heap[parent];
      this.heap[parent] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const n = this.heap.length;
    while (true) {
      let largest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      if (left < n && this.heap[left].priority > this.heap[largest].priority) largest = left;
      if (right < n && this.heap[right].priority > this.heap[largest].priority) largest = right;
      if (largest === index) break;
      const tmp = this.heap[index];
      this.heap[index] = this.heap[largest];
      this.heap[largest] = tmp;
      index = largest;
    }
  }
}

// ─── Human GPU Scheduler ──────────────────────────────────────────────────────

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
export class GpuScheduler {
  frameBudgetMs: number;
  private config: SchedulerConfig;
  private profiler: HumanProfiler;
  private frameIndex = 0;
  private budgetHistory: number[] = [];
  private gpuBudgetHistory: (number | null)[] = [];
  private cpuBudgetHistory: number[] = [];
  private lastFrameStats: {
    executed: number;
    deferred: number;
    skipped: number;
    reduced: number;
    reused: number;
    scheduleOverheadMs: number;
    gpuFrameMs: number | null;
  } = {
    executed: 0, deferred: 0, skipped: 0, reduced: 0, reused: 0, scheduleOverheadMs: 0, gpuFrameMs: null,
  };
  private totalScheduled = 0;
  private timestampQueryState: SchedulerTimestampQueryState = {
    available: false, querySet: null, resolveBuffer: null, readBuffer: null,
  };
  private timestampDevice: GPUDevice | null = null;
  private priorityQueue = new PriorityQueue<ScheduleItem>();

  constructor(profiler: HumanProfiler, config?: Partial<SchedulerConfig>);
  /** @deprecated Use the profiler-first overload instead. */
  constructor(frameBudgetMs: number, profiler: HumanProfiler);
  constructor(frameBudgetMsOrProfiler: number | HumanProfiler, profilerOrConfig?: HumanProfiler | Partial<SchedulerConfig>) {
    if (typeof frameBudgetMsOrProfiler === "number") {
      // Legacy overload: (frameBudgetMs, profiler)
      this.profiler = profilerOrConfig as HumanProfiler;
      this.config = { ...DEFAULT_SCHEDULER_CONFIG, frameBudgetMs: frameBudgetMsOrProfiler };
    } else {
      this.profiler = frameBudgetMsOrProfiler;
      this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...profilerOrConfig };
    }
    this.frameBudgetMs = this.config.frameBudgetMs;
  }

  // ─── Timestamp-query integration ─────────────────────────────────────────

  /** Enable timestamp-query GPU timing with the given device. Call once at init. */
  enableTimestampQuery(device: GPUDevice): boolean {
    if (!device.features.has("timestamp-query")) {
      this.config.timestampQueryEnabled = false;
      return false;
    }
    const probe = device.createCommandEncoder();
    if (typeof (probe as { writeTimestamp?: unknown }).writeTimestamp !== "function") {
      this.config.timestampQueryEnabled = false;
      return false;
    }
    this.timestampDevice = device;
    this.config.timestampQueryEnabled = true;
    this.ensureTimestampBuffers(device);
    return true;
  }

  /** Disable timestamp-query and release GPU resources. */
  disableTimestampQuery(): void {
    this.config.timestampQueryEnabled = false;
    this.timestampQueryState.querySet?.destroy();
    this.timestampQueryState.resolveBuffer?.destroy();
    this.timestampQueryState.readBuffer?.destroy();
    this.timestampQueryState = { available: false, querySet: null, resolveBuffer: null, readBuffer: null };
    this.timestampDevice = null;
  }

  private ensureTimestampBuffers(device: GPUDevice): void {
    if (this.timestampQueryState.querySet) return;
    this.timestampQueryState.querySet = device.createQuerySet({ type: "timestamp", count: 2 });
    this.timestampQueryState.resolveBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.timestampQueryState.readBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.timestampQueryState.available = true;
  }

  /** Record GPU timestamp pair around a render pass. Call at start of frame. */
  beginGpuTimestamp(encoder: GPUCommandEncoder): void {
    if (!this.config.timestampQueryEnabled || !this.timestampQueryState.querySet) return;
    (encoder as { writeTimestamp?: (qs: GPUQuerySet, i: number) => void }).writeTimestamp?.(this.timestampQueryState.querySet, 0);
  }

  /** End GPU timestamp pair. Call after render pass. */
  endGpuTimestamp(encoder: GPUCommandEncoder): void {
    if (!this.config.timestampQueryEnabled || !this.timestampQueryState.querySet) return;
    (encoder as { writeTimestamp?: (qs: GPUQuerySet, i: number) => void }).writeTimestamp?.(this.timestampQueryState.querySet, 1);
    const qs = this.timestampQueryState.querySet;
    const resolve = this.timestampQueryState.resolveBuffer!;
    encoder.resolveQuerySet(qs, 0, 2, resolve, 0);
    const read = this.timestampQueryState.readBuffer!;
    encoder.copyBufferToBuffer(resolve, 0, read, 0, 16);
  }

  /** Read back the GPU timestamp asynchronously. Returns ms or null. */
  async readGpuTimestamp(): Promise<number | null> {
    if (!this.config.timestampQueryEnabled || !this.timestampQueryState.readBuffer) return null;
    const buf = this.timestampQueryState.readBuffer;
    try {
      await buf.mapAsync(GPUMapMode.READ);
      const timestamps = new BigUint64Array(buf.getMappedRange().slice(0));
      buf.unmap();
      return Number(timestamps[1] - timestamps[0]) / 1_000_000;
    } catch {
      return null;
    }
  }

  // ─── Core scheduling ─────────────────────────────────────────────────────

  /** Make a decision for one schedule item each frame. */
  decide(item: ScheduleItem): ScheduleDecision {
    if (!item.visible) return "skip";
    if (!item.dirty) return "reuse";

    const available = this.frameBudgetMs - this.profiler.averageCpuMs;
    if (available < 0) return "defer";
    if (item.estimatedCostMs <= available) return "execute";
    if (item.priority >= this.config.highPriorityThreshold) return "execute";
    if (item.quality > 0.5) return "reduce";
    return "defer";
  }

  /** Schedule a batch of items using the priority queue. Returns decisions in priority order. */
  scheduleBatch(items: readonly ScheduleItem[]): Array<{ item: ScheduleItem; decision: ScheduleDecision }> {
    const scheduleStart = nowMs();
    this.priorityQueue.clear();
    for (const item of items) {
      this.priorityQueue.push(item, item.priority);
    }

    const results: Array<{ item: ScheduleItem; decision: ScheduleDecision }> = [];
    let executed = 0;
    let deferred = 0;
    let skipped = 0;
    let reduced = 0;
    let reused = 0;

    let item = this.priorityQueue.pop();
    while (item) {
      const decision = this.decide(item);
      results.push({ item, decision });
      this.totalScheduled++;

      switch (decision) {
        case "execute": executed++; break;
        case "defer": deferred++; break;
        case "skip": skipped++; break;
        case "reduce": reduced++; break;
        case "reuse": reused++; break;
      }

      item = this.priorityQueue.pop();
    }

    this.lastFrameStats.executed = executed;
    this.lastFrameStats.deferred = deferred;
    this.lastFrameStats.skipped = skipped;
    this.lastFrameStats.reduced = reduced;
    this.lastFrameStats.reused = reused;
    this.lastFrameStats.scheduleOverheadMs = nowMs() - scheduleStart;
    this.priorityQueue.clear();

    return results;
  }

  // ─── Adaptive quality scaling ────────────────────────────────────────────

  /** Compute the effective quality factor when reducing. Accounts for measured load. */
  reduceQuality(item: ScheduleItem): number {
    const scaled = item.quality * this.config.qualityScaleFactor;
    return Math.max(0, Math.min(1, scaled));
  }

  /** Adapt the frame budget to measured load and record history. */
  adapt(measuredMs: number): number {
    this.recordHistory(measuredMs);

    const target = this.config.frameBudgetMs;
    if (measuredMs > target * 1.15) {
      this.frameBudgetMs = Math.max(target * 0.4, this.frameBudgetMs - 0.5);
    } else if (measuredMs < target * 0.8) {
      this.frameBudgetMs = Math.min(target, this.frameBudgetMs + 0.5);
    }
    return this.frameBudgetMs;
  }

  /** Adapt using GPU timing when available, otherwise fall back to CPU timing. */
  adaptWithGpuTiming(gpuFrameMs: number | null, cpuFrameMs: number): number {
    this.lastFrameStats.gpuFrameMs = gpuFrameMs;
    const measured = gpuFrameMs ?? cpuFrameMs;
    return this.adapt(measured);
  }

  // ─── Frame pacing ────────────────────────────────────────────────────────

  /** Reconfigure the scheduler for a different FPS target. */
  setTargetFps(fps: number): void {
    this.config.targetFps = fps;
    const preset = FPS_PRESETS[fps];
    if (preset) {
      this.config.frameBudgetMs = preset.frameBudgetMs!;
      if (preset.profile) this.config.profile = preset.profile;
    } else {
      this.config.frameBudgetMs = 1000 / fps;
    }
    this.frameBudgetMs = this.config.frameBudgetMs;
  }

  /** Apply a hardware profile preset (mobile, desktop, high-end). */
  setProfile(profile: SchedulerProfile): void {
    this.config.profile = profile;
    const preset = PROFILE_PRESETS[profile];
    Object.assign(this.config, preset);
    this.frameBudgetMs = this.config.frameBudgetMs;
  }

  // ─── History & stats ─────────────────────────────────────────────────────

  private recordHistory(measuredMs: number): void {
    this.budgetHistory.push(this.frameBudgetMs);
    this.cpuBudgetHistory.push(this.profiler.averageCpuMs);
    this.gpuBudgetHistory.push(this.lastFrameStats.gpuFrameMs);
    this.frameIndex++;

    if (this.budgetHistory.length > this.config.historyWindow) {
      this.budgetHistory.shift();
    }
    if (this.cpuBudgetHistory.length > this.config.historyWindow) {
      this.cpuBudgetHistory.shift();
    }
    if (this.gpuBudgetHistory.length > this.config.historyWindow) {
      this.gpuBudgetHistory.shift();
    }
  }

  /** Get comprehensive scheduler statistics. */
  getStats(): SchedulerStats {
    return {
      frameIndex: this.frameIndex,
      lastGpuFrameMs: this.lastFrameStats.gpuFrameMs,
      lastScheduleOverheadMs: this.lastFrameStats.scheduleOverheadMs,
      averageGpuFrameMs: this.averageOf(this.gpuBudgetHistory),
      averageCpuFrameMs: this.profiler.averageCpuMs,
      lastFrameExecuted: this.lastFrameStats.executed,
      lastFrameDeferred: this.lastFrameStats.deferred,
      lastFrameSkipped: this.lastFrameStats.skipped,
      lastFrameReduced: this.lastFrameStats.reduced,
      lastFrameReused: this.lastFrameStats.reused,
      currentBudgetMs: this.frameBudgetMs,
      totalScheduled: this.totalScheduled,
    };
  }

  /** Get a full debugging report. */
  getReport(): SchedulerReport {
    return {
      stats: this.getStats(),
      budgetHistory: [...this.budgetHistory],
      gpuBudgetHistory: [...this.gpuBudgetHistory],
      profile: this.config.profile,
      config: { ...this.config },
      timestampQueryAvailable: this.config.timestampQueryEnabled,
    };
  }

  get configRef(): Readonly<SchedulerConfig> {
    return this.config;
  }

  private averageOf(arr: readonly (number | null)[]): number | null {
    const valid = arr.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}
