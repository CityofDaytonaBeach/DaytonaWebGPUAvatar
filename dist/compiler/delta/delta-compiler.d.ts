import { DependencyGraph } from '../dependency/dependency-graph.js';
import { PropertyRegistry } from '../../core/schema/registry.js';
import { PropertyCategory } from '../../core/schema/property.js';
import { IndexRange, RegionName } from '../../geometry/canonical/canonical-human.js';
export type KernelKind = 'SparseMorph' | 'MorphAccumulation' | 'Corrective' | 'Skeleton' | 'Skinning' | 'Normal' | 'Tangent' | 'Subdivision' | 'SDF' | 'Hair' | 'Cloth' | 'Attachment' | 'LODSelection' | 'Visibility';
export interface KernelWork {
    kind: KernelKind;
    /** Vertex ranges this kernel must process (or null = whole mesh). */
    vertexRanges: Array<{
        start: number;
        count: number;
    }>;
    propertyIds: number[];
    priority: number;
}
export interface DeltaVertexRangeSource {
    regionRanges: ReadonlyMap<RegionName, IndexRange>;
}
export declare const CATEGORY_TO_KERNEL: Record<PropertyCategory, KernelKind>;
/**
 * Human Delta Compiler.
 *
 * Input : Current Human State + Character Event(s)
 * Output: minimal required GPU computation, as a list of kernel work items.
 *
 * The compiler merges overlapping work across simultaneous changes instead of
 * dispatching redundant passes. Unaffected systems produce no output.
 */
export declare class DeltaCompiler {
    private registry;
    private graph;
    private ranges?;
    constructor(registry: PropertyRegistry, graph: DependencyGraph, ranges?: DeltaVertexRangeSource | undefined);
    /**
     * Given the set of changed property ids, compute the minimal kernel work.
     * Merges changes that map to the same kernel kind.
     */
    compile(changedIds: number[]): KernelWork[];
    private priorityFor;
    private assignVertexRanges;
    /** Compiler-aware merge of several change batches (optimizes multi-change). */
    compileBatch(changeBatches: number[][]): KernelWork[];
}
//# sourceMappingURL=delta-compiler.d.ts.map