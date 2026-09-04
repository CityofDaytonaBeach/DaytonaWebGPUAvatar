export class DependencyNode {
    id;
    path;
    meta;
    inputs = [];
    outputs = [];
    execution;
    lodImportance;
    constructor(meta, execution = 'gpu') {
        this.id = meta.id;
        this.path = meta.path;
        this.meta = meta;
        this.execution = execution;
        this.lodImportance = meta.lodImportance ?? 0;
    }
}
/**
 * Human Dependency Graph. Expressed as nodes (properties) and edges
 * (dependency -> dependent). When a property changes we traverse only its
 * descendants, marking exactly that set dirty â€” never rebuilding unrelated
 * systems.
 */
export class DependencyGraph {
    registry;
    nodes = new Map();
    byPath = new Map();
    constructor(registry) {
        this.registry = registry;
        this.build();
    }
    build() {
        this.nodes.clear();
        this.byPath.clear();
        // One node per registered property.
        for (const meta of this.registry.all()) {
            const node = new DependencyNode(meta);
            this.nodes.set(meta.id, node);
            this.byPath.set(meta.path, node);
        }
        // Wire edges from dependency metadata.
        for (const node of this.nodes.values()) {
            for (const depId of node.meta.dependencies ?? []) {
                const depNode = this.nodes.get(depId);
                if (!depNode)
                    continue;
                depNode.outputs.push(node.id);
                node.inputs.push(depId);
            }
        }
    }
    /** Return the node for a property id (throws if unknown). */
    nodeById(id) {
        const n = this.nodes.get(id);
        if (!n)
            throw new Error(`No dependency node for id ${id}`);
        return n;
    }
    nodeByPath(path) {
        const n = this.byPath.get(path);
        if (!n)
            throw new Error(`No dependency node for path ${path}`);
        return n;
    }
    /**
     * Compute the transitive set of property ids affected when `changedIds`
     * change. The changed set itself is always included. Descendants are found
     * by following the dependency edges via BFS.
     */
    affectedBy(changedIds) {
        const affected = new Set();
        const queue = [];
        for (const id of changedIds) {
            if (this.nodes.has(id)) {
                affected.add(id);
                queue.push(id);
            }
        }
        while (queue.length > 0) {
            const id = queue.shift();
            const node = this.nodes.get(id);
            if (!node)
                continue;
            for (const outId of node.outputs) {
                if (!affected.has(outId)) {
                    affected.add(outId);
                    queue.push(outId);
                }
            }
        }
        return affected;
    }
    /** All nodes, by id. */
    allNodes() {
        return this.nodes.values();
    }
    /** Round-trip a definition's values into a new definition, honoring deps. */
    recompute(values) {
        return values;
    }
}
//# sourceMappingURL=dependency-graph.js.map