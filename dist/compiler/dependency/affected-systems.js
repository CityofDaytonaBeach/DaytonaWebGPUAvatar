export function affectedSystemsForChange(registry, graph, changedIds) {
    const direct = new Set(changedIds);
    const affected = graph.affectedBy([...changedIds]);
    const bySystem = new Map();
    for (const id of affected) {
        const meta = registry.requireId(id);
        const system = systemForCategory(meta.category);
        let entry = bySystem.get(system);
        if (!entry) {
            entry = { system, directPropertyIds: [], dependentPropertyIds: [], propertyPaths: [] };
            bySystem.set(system, entry);
        }
        if (direct.has(id))
            entry.directPropertyIds.push(id);
        else
            entry.dependentPropertyIds.push(id);
        entry.propertyPaths.push(meta.path);
    }
    return [...bySystem.values()].sort((a, b) => a.system.localeCompare(b.system));
}
export function systemForCategory(category) {
    switch (category) {
        case 0 /* PropertyCategory.Global */:
            return 'Global';
        case 1024 /* PropertyCategory.Identity */:
            return 'Identity';
        case 2048 /* PropertyCategory.Skeleton */:
            return 'Skeleton';
        case 3072 /* PropertyCategory.Body */:
            return 'BodyGeometry';
        case 4096 /* PropertyCategory.Face */:
            return 'FaceGeometry';
        case 5120 /* PropertyCategory.Skin */:
            return 'SkinMaterial';
        case 6144 /* PropertyCategory.Eyes */:
            return 'EyeSystem';
        case 7168 /* PropertyCategory.Hair */:
            return 'HairSystem';
        case 8192 /* PropertyCategory.Expression */:
            return 'Expression';
        case 9216 /* PropertyCategory.Animation */:
            return 'Animation';
        case 10240 /* PropertyCategory.Physics */:
            return 'Physics';
        case 11264 /* PropertyCategory.LOD */:
            return 'LOD';
        case 12288 /* PropertyCategory.Attachment */:
            return 'Attachment';
        default:
            return 'Global';
    }
}
//# sourceMappingURL=affected-systems.js.map