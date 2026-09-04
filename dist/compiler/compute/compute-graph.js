/**
 * Human Compute Graph. Represents the ordered GPU operations required to
 * produce current perceptual output from the resident state. The graph
 * respects dependencies, merges compatible work, and yields a compact list of
 * dispatches.
 */
export class ComputeGraph {
    nodeSequence = [];
    cachedPlan = null;
    cachedKey = '';
    /** Feed a set of kernel work items and produce an execution plan. */
    plan(work) {
        const key = work.map((w) => `${w.kind}:${w.propertyIds.join(',')}`).join('|');
        if (this.cachedPlan && this.cachedKey === key) {
            return this.cachedPlan;
        }
        const nodes = [];
        // Deterministic ordering by priority (stable within equal priority).
        const sorted = [...work].sort((a, b) => b.priority - a.priority);
        for (const w of sorted) {
            nodes.push({
                type: 'kernel',
                kind: w.kind,
                propertyIds: [...w.propertyIds],
                vertexRanges: [...w.vertexRanges],
            });
        }
        this.cachedPlan = nodes;
        this.cachedKey = key;
        return nodes;
    }
    /**
     * Reduce the compute plan based on the current perceptual LOD: high-importance
     * systems always execute; optional expensive systems can be dropped/parked.
     */
    planWithLod(work, lodMask) {
        const filtered = work.filter((w) => lodMask.has(w.kind));
        return this.plan(filtered.length === 0 ? work : filtered);
    }
}
//# sourceMappingURL=compute-graph.js.map