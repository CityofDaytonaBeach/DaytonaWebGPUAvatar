import { KernelKind, KernelWork } from '../delta/delta-compiler.js';
export type GraphNodeType = 'kernel' | 'feedback' | 'readback';
/**
 * Human Compute Graph. Represents the ordered GPU operations required to
 * produce current perceptual output from the resident state. The graph
 * respects dependencies, merges compatible work, and yields a compact list of
 * dispatches.
 */
export declare class ComputeGraph {
    private nodeSequence;
    private cachedPlan;
    private cachedKey;
    /** Feed a set of kernel work items and produce an execution plan. */
    plan(work: KernelWork[]): GraphNode[];
    /**
     * Reduce the compute plan based on the current perceptual LOD: high-importance
     * systems always execute; optional expensive systems can be dropped/parked.
     */
    planWithLod(work: KernelWork[], lodMask: Set<KernelKind>): GraphNode[];
}
export interface GraphNode {
    type: GraphNodeType;
    kind: KernelKind;
    propertyIds: number[];
    vertexRanges: Array<{
        start: number;
        count: number;
    }>;
}
//# sourceMappingURL=compute-graph.d.ts.map