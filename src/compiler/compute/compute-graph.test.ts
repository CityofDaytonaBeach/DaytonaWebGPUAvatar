import { describe, it, expect } from 'vitest';
import { KernelWork } from '../delta/delta-compiler';
import { ComputeGraph } from './compute-graph';

function work(partial: Partial<KernelWork> & Pick<KernelWork, 'kind'>): KernelWork {
  return {
    propertyIds: [],
    priority: 0,
    vertexRanges: [],
    ...partial,
  };
}

describe('ComputeGraph', () => {
  it('orders plans by descending priority', () => {
    const graph = new ComputeGraph();
    const plan = graph.plan([
      work({ kind: 'Skinning', priority: 1 }),
      work({ kind: 'Skeleton', priority: 9 }),
      work({ kind: 'Hair', priority: 5 }),
    ]);
    expect(plan.map((n) => n.kind)).toEqual(['Skeleton', 'Hair', 'Skinning']);
  });

  it('preserves vertex ranges and property ids in nodes', () => {
    const graph = new ComputeGraph();
    const plan = graph.plan([
      work({
        kind: 'SparseMorph',
        propertyIds: [3, 7],
        vertexRanges: [{ start: 10, count: 5 }],
      }),
    ]);
    expect(plan[0].propertyIds).toEqual([3, 7]);
    expect(plan[0].vertexRanges).toEqual([{ start: 10, count: 5 }]);
  });

  it('returns the cached plan for an identical input', () => {
    const graph = new ComputeGraph();
    const input = [work({ kind: 'Skinning', priority: 2 })];
    const first = graph.plan(input);
    const second = graph.plan(input);
    expect(second).toBe(first); // same instance from cache
  });

  it('rebuilds when the input changes', () => {
    const graph = new ComputeGraph();
    const a = graph.plan([work({ kind: 'Skeleton', priority: 1 })]);
    const b = graph.plan([work({ kind: 'Skeleton', propertyIds: [1], priority: 1 })]);
    expect(b).not.toBe(a);
  });

  it('planWithLod filters masked-out kernels and falls back when none remain', () => {
    const graph = new ComputeGraph();
    const input = [work({ kind: 'Skeleton' }), work({ kind: 'Hair' })];
    const kept = graph.planWithLod(input, new Set(['Skeleton']));
    expect(kept.map((n) => n.kind)).toEqual(['Skeleton']);

    // Mask excludes everything -> fall back to the full work set.
    const fallback = graph.planWithLod(input, new Set(['Cloth']));
    expect(new Set(fallback.map((n) => n.kind))).toEqual(new Set(['Skeleton', 'Hair']));
  });
});
