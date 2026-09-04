/**
 * Resolve a surface-relative landmark to a world position given the canonical
 * human. If the referenced triangle is invalid (deleted topology or out of
 * range), returns null. Deterministic.
 */
export function resolveLandmarkPosition(canonical, landmark) {
    const tri = landmark.triangleId;
    const i = tri * 3;
    if (i < 0 || i + 2 >= canonical.indices.length)
        return null;
    const a = canonical.indices[i];
    const b = canonical.indices[i + 1];
    const c = canonical.indices[i + 2];
    if (a >= canonical.vertexCount || b >= canonical.vertexCount || c >= canonical.vertexCount)
        return null;
    const [tA, tB, tC] = landmark.barycentric;
    const sum = tA + tB + tC;
    const norm = sum === 0 ? 1 : sum;
    const pa = canonical.vertices[a].position;
    const pb = canonical.vertices[b].position;
    const pc = canonical.vertices[c].position;
    const na = canonical.vertices[a].normal;
    const nb = canonical.vertices[b].normal;
    const nc = canonical.vertices[c].normal;
    const position = {
        x: (pa.x * tA + pb.x * tB + pc.x * tC) / norm,
        y: (pa.y * tA + pb.y * tB + pc.y * tC) / norm,
        z: (pa.z * tA + pb.z * tB + pc.z * tC) / norm,
    };
    const normal = {
        x: (na.x * tA + nb.x * tB + nc.x * tC) / norm,
        y: (na.y * tA + nb.y * tB + nc.y * tC) / norm,
        z: (na.z * tA + nb.z * tB + nc.z * tC) / norm,
    };
    const nl = Math.hypot(normal.x, normal.y, normal.z) || 1;
    normal.x /= nl;
    normal.y /= nl;
    normal.z /= nl;
    return {
        landmark,
        position: {
            x: position.x + normal.x * landmark.normalOffset,
            y: position.y + normal.y * landmark.normalOffset,
            z: position.z + normal.z * landmark.normalOffset,
        },
        normal,
    };
}
/** Find a triangle id whose region matches `region`; returns -1 if none. */
export function findTriangleInRegion(canonical, region) {
    const triCount = canonical.triangleCount;
    for (let t = 0; t < triCount; t++) {
        const i0 = canonical.indices[t * 3];
        if (canonical.vertices[i0].region === region)
            return t;
    }
    return -1;
}
//# sourceMappingURL=landmark.js.map