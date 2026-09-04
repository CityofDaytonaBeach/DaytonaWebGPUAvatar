export const CATEGORY_TO_KERNEL = {
    [0 /* PropertyCategory.Global */]: 'Skeleton',
    [1024 /* PropertyCategory.Identity */]: 'SparseMorph',
    [2048 /* PropertyCategory.Skeleton */]: 'Skeleton',
    [3072 /* PropertyCategory.Body */]: 'SparseMorph',
    [4096 /* PropertyCategory.Face */]: 'SparseMorph',
    [5120 /* PropertyCategory.Skin */]: 'Corrective',
    [6144 /* PropertyCategory.Eyes */]: 'Visibility',
    [7168 /* PropertyCategory.Hair */]: 'Hair',
    [8192 /* PropertyCategory.Expression */]: 'MorphAccumulation',
    [9216 /* PropertyCategory.Animation */]: 'Skinning',
    [10240 /* PropertyCategory.Physics */]: 'Cloth',
    [11264 /* PropertyCategory.LOD */]: 'LODSelection',
    [12288 /* PropertyCategory.Attachment */]: 'Attachment',
};
/**
 * Human Delta Compiler.
 *
 * Input : Current Human State + Character Event(s)
 * Output: minimal required GPU computation, as a list of kernel work items.
 *
 * The compiler merges overlapping work across simultaneous changes instead of
 * dispatching redundant passes. Unaffected systems produce no output.
 */
export class DeltaCompiler {
    registry;
    graph;
    ranges;
    constructor(registry, graph, ranges) {
        this.registry = registry;
        this.graph = graph;
        this.ranges = ranges;
    }
    /**
     * Given the set of changed property ids, compute the minimal kernel work.
     * Merges changes that map to the same kernel kind.
     */
    compile(changedIds) {
        const affected = this.graph.affectedBy(changedIds);
        const merged = new Map();
        for (const id of affected) {
            const meta = this.registry.requireId(id);
            const kind = CATEGORY_TO_KERNEL[meta.category];
            if (!kind)
                continue;
            let work = merged.get(kind);
            if (!work) {
                work = { kind, vertexRanges: [], propertyIds: [], priority: this.priorityFor(kind) };
                merged.set(kind, work);
            }
            work.propertyIds.push(id);
        }
        // Attach vertex ranges derived from property region mapping (v0.1 heuristic:
        // face/skin/expression affects the face vertex range; body affects whole body).
        const result = [];
        for (const work of merged.values()) {
            this.assignVertexRanges(work);
            result.push(work);
        }
        return result;
    }
    priorityFor(kind) {
        switch (kind) {
            case 'Skeleton':
            case 'Skinning':
            case 'MorphAccumulation':
                return 10;
            case 'SparseMorph':
            case 'Normal':
                return 8;
            case 'Corrective':
                return 6;
            case 'Attachment':
            case 'Visibility':
                return 4;
            default:
                return 3;
        }
    }
    assignVertexRanges(work) {
        if (!this.ranges)
            return;
        const regions = new Set();
        for (const id of work.propertyIds) {
            const meta = this.registry.requireId(id);
            for (const region of regionsForProperty(meta.path, meta.category))
                regions.add(region);
        }
        work.vertexRanges = mergeRanges([...regions]
            .map((region) => this.ranges?.regionRanges.get(region))
            .filter((range) => !!range));
    }
    /** Compiler-aware merge of several change batches (optimizes multi-change). */
    compileBatch(changeBatches) {
        const flattened = changeBatches.flat();
        const unique = [...new Set(flattened)];
        return this.compile(unique);
    }
}
function regionsForProperty(path, category) {
    if (path.startsWith('face.nose.'))
        return ['nose'];
    if (path.startsWith('face.jaw.'))
        return ['jaw'];
    if (path.startsWith('face.mouth.'))
        return ['mouth'];
    if (path === 'face.eyeSpacing')
        return ['eyes', 'eye_sclera', 'eye_iris'];
    if (path.startsWith('face.'))
        return ['face', 'nose', 'jaw', 'eyes', 'mouth'];
    if (path.startsWith('expression.'))
        return ['face', 'jaw', 'mouth', 'tongue', 'mouth_cavity', 'eyes'];
    if (path === 'body.muscularity' ||
        path === 'body.bodyFat' ||
        path === 'body.chest' ||
        path === 'body.waist' ||
        path === 'body.hips')
        return ['torso'];
    if (path.startsWith('skeleton.') || path.startsWith('global.'))
        return [
            'torso',
            'neck',
            'head',
            'upperarm_l',
            'upperarm_r',
            'forearm_l',
            'forearm_r',
            'hand_l',
            'hand_r',
            'thigh_l',
            'thigh_r',
            'shin_l',
            'shin_r',
        ];
    if (category === 5120 /* PropertyCategory.Skin */)
        return [
            'torso',
            'neck',
            'head',
            'face',
            'nose',
            'jaw',
            'upperarm_l',
            'upperarm_r',
            'forearm_l',
            'forearm_r',
            'hand_l',
            'hand_r',
            'thigh_l',
            'thigh_r',
            'shin_l',
            'shin_r',
        ];
    return [];
}
function mergeRanges(ranges) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last && last.start + last.count >= range.start) {
            const end = Math.max(last.start + last.count, range.start + range.count);
            last.count = end - last.start;
        }
        else {
            merged.push({ start: range.start, count: range.count });
        }
    }
    return merged;
}
//# sourceMappingURL=delta-compiler.js.map