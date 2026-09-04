import { PropertyRegistry } from '../../core/schema/registry.js';
import { PropertyMeta } from '../../core/schema/property.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
export type NodeExecutionType = 'cpu' | 'gpu';
export declare class DependencyNode {
    readonly id: number;
    readonly path: string;
    readonly meta: PropertyMeta;
    readonly inputs: number[];
    readonly outputs: number[];
    execution: NodeExecutionType;
    lodImportance: number;
    constructor(meta: PropertyMeta, execution?: NodeExecutionType);
}
/**
 * Human Dependency Graph. Expressed as nodes (properties) and edges
 * (dependency -> dependent). When a property changes we traverse only its
 * descendants, marking exactly that set dirty â€” never rebuilding unrelated
 * systems.
 */
export declare class DependencyGraph {
    private registry;
    private nodes;
    private byPath;
    constructor(registry: PropertyRegistry);
    private build;
    /** Return the node for a property id (throws if unknown). */
    nodeById(id: number): DependencyNode;
    nodeByPath(path: string): DependencyNode;
    /**
     * Compute the transitive set of property ids affected when `changedIds`
     * change. The changed set itself is always included. Descendants are found
     * by following the dependency edges via BFS.
     */
    affectedBy(changedIds: number[]): Set<number>;
    /** All nodes, by id. */
    allNodes(): IterableIterator<DependencyNode>;
    /** Round-trip a definition's values into a new definition, honoring deps. */
    recompute(values: HumanDefinition): HumanDefinition;
}
//# sourceMappingURL=dependency-graph.d.ts.map