import { KernelKind } from "../../compiler/delta/delta-compiler";
import { HumanProfiler } from "../profiler/profiler";

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

/**
 * Human GPU Scheduler.
 *
 * Runs against a configurable frame budget (default ~11ms of a 16.67ms frame).
 * Decides per kernel-item whether to execute, reduce quality, reuse the last
 * result, defer, or skip — influenced by priority, cost, dirty state,
 * visibility and quality. Uses profiler moving averages to adapt.
 */
export class GpuScheduler {
  frameBudgetMs: number;

  constructor(frameBudgetMs = 11, private profiler: HumanProfiler) {
    this.frameBudgetMs = frameBudgetMs;
  }

  /** Make a decision for one schedule item each frame. */
  decide(item: ScheduleItem): ScheduleDecision {
    if (!item.visible) return "skip";
    if (!item.dirty) return "reuse";
    const available = this.frameBudgetMs - this.profiler.averageCpuMs;
    if (available < 0) return "defer";
    if (item.estimatedCostMs <= available) return "execute";
    if (item.priority >= 8) return "execute";
    if (item.quality > 0.5) return "reduce";
    return "defer";
  }

  /** Adapt the frame budget to measured load. */
  adapt(measuredMs: number): number {
    // Simple closed-loop: if we're consistently over budget, tighten it.
    const target = 11;
    if (measuredMs > target * 1.15) {
      this.frameBudgetMs = Math.max(6, this.frameBudgetMs - 0.5);
    } else if (measuredMs < target * 0.8) {
      this.frameBudgetMs = Math.min(11, this.frameBudgetMs + 0.5);
    }
    return this.frameBudgetMs;
  }
}
