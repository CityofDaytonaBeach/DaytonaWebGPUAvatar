import { describe, it, expect } from 'vitest';
import { HumanProfiler } from '../profiler/profiler';
import {
  GpuScheduler,
  PriorityQueue,
  ScheduleItem,
  SchedulerProfile,
} from './gpu-scheduler';

function item(partial: Partial<ScheduleItem>): ScheduleItem {
  return {
    kind: 'Skinning',
    priority: 0,
    estimatedCostMs: 1,
    dirty: true,
    visible: true,
    quality: 1,
    deadline: 0,
    ...partial,
  };
}

function makeScheduler(config?: Partial<ConstructorParameters<typeof GpuScheduler>[1]>) {
  const profiler = new HumanProfiler();
  const scheduler = new GpuScheduler(profiler, config);
  return { profiler, scheduler };
}

/** A minimal profiler stub so we can control averageCpuMs deterministically. */
function stubProfiler(averageCpuMs: number): HumanProfiler {
  return { get averageCpuMs() { return averageCpuMs; } } as unknown as HumanProfiler;
}

describe('PriorityQueue', () => {
  it('pops items in descending priority order', () => {
    const q = new PriorityQueue<number>();
    q.push(1, 3);
    q.push(2, 8);
    q.push(3, 5);
    q.push(4, 1);
    expect(q.pop()).toBe(2);
    expect(q.pop()).toBe(3);
    expect(q.pop()).toBe(1);
    expect(q.pop()).toBe(4);
    expect(q.pop()).toBeUndefined();
  });

  it('reports size, peek and toArray ordering', () => {
    const q = new PriorityQueue<number>();
    expect(q.size).toBe(0);
    q.push(10, 2);
    q.push(20, 9);
    expect(q.size).toBe(2);
    expect(q.peek()).toBe(20);
    expect(q.toArray()).toEqual([20, 10]);
  });

  it('handles heap structure after repeated pops (bubbleDown)', () => {
    const q = new PriorityQueue<number>();
    for (let i = 1; i <= 10; i++) q.push(i, i);
    const out: number[] = [];
    let v: number | undefined;
    while ((v = q.pop()) !== undefined) out.push(v);
    expect(out).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('clear empties the queue', () => {
    const q = new PriorityQueue<number>();
    q.push(1, 1);
    q.push(2, 2);
    q.clear();
    expect(q.size).toBe(0);
  });
});

describe('GpuScheduler.decide', () => {
  it('skips invisible items', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    expect(scheduler.decide(item({ visible: false }))).toBe('skip');
  });

  it('reuses clean items without re-running', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    expect(scheduler.decide(item({ dirty: false }))).toBe('reuse');
  });

  it('executes an affordable dirty item within budget', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    expect(scheduler.decide(item({ estimatedCostMs: 5 }))).toBe('execute');
  });

  it('defers an over-budget, low-priority, low-quality item', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    // Fresh scheduler budget 16.67; cost 100 is unaffordable, priority < 8.
    expect(scheduler.decide(item({ estimatedCostMs: 100, priority: 2, quality: 0.2 }))).toBe(
      'defer',
    );
  });

  it('reduces an over-budget item with quality above 0.5', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    expect(scheduler.decide(item({ estimatedCostMs: 100, priority: 2, quality: 0.8 }))).toBe(
      'reduce',
    );
  });

  it('executes over-budget items at or above the high-priority threshold', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    expect(scheduler.decide(item({ estimatedCostMs: 100, priority: 9 }))).toBe('execute');
  });

  it('defers when CPU load already exceeds the frame budget', () => {
    const scheduler = new GpuScheduler(stubProfiler(9), { frameBudgetMs: 8 });
    // available = 8 - 9 < 0 -> always defer, regardless of cost.
    expect(scheduler.decide(item({ estimatedCostMs: 0.01 }))).toBe('defer');
  });
});

describe('GpuScheduler.scheduleBatch', () => {
  it('aggregates executed/deferred/skipped counts', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    const batch = [
      item({ kind: 'Skinning', priority: 10, estimatedCostMs: 1, visible: true, dirty: true }),
      item({ kind: 'Hair', priority: 5, estimatedCostMs: 100, quality: 0.9 }),
      item({ kind: 'Cloth', visible: false }),
      item({ kind: 'Skeleton', dirty: false }),
    ];
    const results = scheduler.scheduleBatch(batch);
    const decisions = results.map((r) => r.decision);
    expect(decisions).toContain('execute');
    expect(decisions).toContain('reduce');
    expect(decisions).toContain('skip');
    expect(decisions).toContain('reuse');

    const stats = scheduler.getStats();
    expect(stats.totalScheduled).toBe(4);
    expect(stats.lastFrameExecuted + stats.lastFrameReduced + stats.lastFrameSkipped + stats.lastFrameReused).toBe(
      4,
    );
  });

  it('returns results in descending priority order', () => {
    const { scheduler, profiler } = makeScheduler();
    profiler.record({ cpuTimeMs: 0 });
    const batch = [
      item({ priority: 1, estimatedCostMs: 1 }),
      item({ priority: 9, estimatedCostMs: 1 }),
      item({ priority: 5, estimatedCostMs: 1 }),
    ];
    const results = scheduler.scheduleBatch(batch);
    expect(results.map((r) => r.item.priority)).toEqual([9, 5, 1]);
  });
});

describe('GpuScheduler adaptive budget', () => {
  it('tightens the budget when measured load is high', () => {
    const { scheduler } = makeScheduler({ targetFps: 60, frameBudgetMs: 16.67 });
    const start = scheduler.frameBudgetMs;
    scheduler.adapt(25); // > 16.67 * 1.15
    expect(scheduler.frameBudgetMs).toBeLessThan(start);
  });

  it('relaxes the budget toward the target when load is low', () => {
    const { scheduler } = makeScheduler({ targetFps: 60, frameBudgetMs: 16.67 });
    // Push to a low value first.
    scheduler.adapt(25);
    const low = scheduler.frameBudgetMs;
    scheduler.adapt(4); // < 16.67 * 0.8
    expect(scheduler.frameBudgetMs).toBeGreaterThan(low);
    expect(scheduler.frameBudgetMs).toBeLessThanOrEqual(16.67);
  });

  it('records bounded history windows in reports', () => {
    const { scheduler } = makeScheduler({ historyWindow: 5 });
    for (let i = 0; i < 20; i++) scheduler.adapt(10);
    const report = scheduler.getReport();
    expect(report.budgetHistory.length).toBeLessThanOrEqual(5);
    expect(report.stats.frameIndex).toBe(20);
  });
});

describe('GpuScheduler frame pacing presets', () => {
  it('setTargetFps maps to known presets', () => {
    const { scheduler } = makeScheduler();
    scheduler.setTargetFps(60);
    expect(scheduler.frameBudgetMs).toBeCloseTo(16.67, 2);
    expect(scheduler.configRef.profile).toBe('desktop');
    scheduler.setTargetFps(120);
    expect(scheduler.frameBudgetMs).toBeCloseTo(8.33, 2);
    expect(scheduler.configRef.profile).toBe('high-end');
  });

  it('setTargetFps computes budget for unknown fps targets', () => {
    const { scheduler } = makeScheduler();
    scheduler.setTargetFps(45);
    expect(scheduler.frameBudgetMs).toBeCloseTo(1000 / 45, 5);
  });

  it('setProfile applies hardware presets', () => {
    const { scheduler } = makeScheduler();
    scheduler.setProfile('mobile' as SchedulerProfile);
    expect(scheduler.frameBudgetMs).toBeCloseTo(33.33, 2);
    expect(scheduler.configRef.qualityScaleFactor).toBe(0.4);
    scheduler.setProfile('high-end');
    expect(scheduler.frameBudgetMs).toBeCloseTo(11.11, 2);
  });

  it('reduceQuality scales quality within [0,1]', () => {
    const { scheduler } = makeScheduler({ qualityScaleFactor: 0.5 });
    expect(scheduler.reduceQuality(item({ quality: 0.8 }))).toBeCloseTo(0.4, 5);
    expect(scheduler.reduceQuality(item({ quality: 3 }))).toBe(1);
    expect(scheduler.reduceQuality(item({ quality: 0 }))).toBe(0);
  });
});
