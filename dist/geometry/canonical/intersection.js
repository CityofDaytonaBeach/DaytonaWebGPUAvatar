const EPS = 1e-9;
function cross(ax, ay, az, bx, by, bz) {
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function dot(ax, ay, az, bx, by, bz) {
    return ax * bx + ay * by + az * bz;
}
function sub(ax, ay, az, bx, by, bz) {
    return [ax - bx, ay - by, az - bz];
}
/**
 * Topology-aware self-intersection analyzer (P22 infrastructure).
 *
 * Built once from a canonical mesh, then `analyze()` is called per deformed
 * frame. It detects two failure modes of a distorted mesh:
 *
 *   1. Degenerate triangles (near-zero area -> the surface collapsed locally).
 *   2. Explicit interpenetration of two non-adjacent triangles (spatially
 *      pruned with a uniform grid, so only near-coincident candidates are
 *      tested with a full Möller triangle-triangle intersection test, with
 *      vertex-sharing neighbours excluded as legitimate contact).
 *
 * The result is reported, not asserted: the *current* coarse procedural body
 * is intrinsically self-overlapping at rest (thousands of baseline
 * interpenetrations), so callers must decide what stricter-than-baseline delta
 * is meaningful for their topology. The intersection pass is early-exit capped
 * (`maxPairs`), keeping it cheap enough to run every fuzz seed.
 *
 * `regionScope` optionally restricts analysis to triangles whose *three*
 * vertices all lie in the listed regions.
 */
export class MeshIntersectionAnalyzer {
    triId = [];
    triVertex = [];
    triBaseArea;
    /**
     * For each analyzed triangle, the original triangle ids sharing a vertex.
     * Two triangles that share geometry are legitimate neighbours and are never
     * treated as a self-intersection.
     */
    triNeighbors = [];
    constructor(canonical, regionScope) {
        const idx = canonical.indices;
        const T = canonical.indices.length / 3;
        const scoped = [];
        if (regionScope) {
            for (let t = 0; t < T; t++) {
                const a = idx[t * 3];
                const b = idx[t * 3 + 1];
                const c = idx[t * 3 + 2];
                if (regionScope.has(canonical.vertices[a].region) &&
                    regionScope.has(canonical.vertices[b].region) &&
                    regionScope.has(canonical.vertices[c].region)) {
                    scoped.push(t);
                }
            }
        }
        else {
            for (let t = 0; t < T; t++)
                scoped.push(t);
        }
        this.triBaseArea = new Float32Array(scoped.length);
        for (let k = 0; k < scoped.length; k++) {
            const t = scoped[k];
            this.triId.push(t);
            const a = idx[t * 3];
            const b = idx[t * 3 + 1];
            const c = idx[t * 3 + 2];
            this.triVertex.push([a, b, c]);
            const pa = canonical.vertices[a].position;
            const pb = canonical.vertices[b].position;
            const pc = canonical.vertices[c].position;
            const e1 = sub(pb.x, pb.y, pb.z, pa.x, pa.y, pa.z);
            const e2 = sub(pc.x, pc.y, pc.z, pa.x, pa.y, pa.z);
            const nrm = cross(e1[0], e1[1], e1[2], e2[0], e2[1], e2[2]);
            this.triBaseArea[k] = Math.hypot(nrm[0], nrm[1], nrm[2]);
        }
        // Adjacency via shared vertex ids (only among scoped triangles).
        const K = scoped.length;
        const vertexTris = new Map();
        for (let k = 0; k < K; k++) {
            const [a, b, c] = this.triVertex[k];
            for (const v of [a, b, c]) {
                let list = vertexTris.get(v);
                if (!list) {
                    list = [];
                    vertexTris.set(v, list);
                }
                list.push(k);
            }
        }
        for (let k = 0; k < K; k++) {
            const s = new Set();
            const [a, b, c] = this.triVertex[k];
            for (const v of [a, b, c]) {
                for (const other of vertexTris.get(v) ?? []) {
                    if (other !== k)
                        s.add(other);
                }
            }
            this.triNeighbors.push(s);
        }
    }
    get triangleCount() {
        return this.triVertex.length;
    }
    analyze(positions, maxPairs = 4) {
        const K = this.triVertex.length;
        let degenerateCount = 0;
        let intersectingPairs = 0;
        let firstPair = null;
        // ---- pass 1: degenerate triangles (O(K)) --------------------------------
        // The base topology has zero degenerate triangles in scope, so any collapse
        // to a tiny fraction of the base area signals local surface failure under
        // deformation (a fold-through). No winding heuristic here: smoothed vertex
        // normals legitimately disagree with a given triangle's raw winding, so a
        // "sign flip" is not a reliable fold signal — area collapse is.
        for (let k = 0; k < K; k++) {
            const [a, b, c] = this.triVertex[k];
            const pa = triPos(positions, a);
            const pb = triPos(positions, b);
            const pc = triPos(positions, c);
            const e1 = sub(pb[0], pb[1], pb[2], pa[0], pa[1], pa[2]);
            const e2 = sub(pc[0], pc[1], pc[2], pa[0], pa[1], pa[2]);
            const nrm = cross(e1[0], e1[1], e1[2], e2[0], e2[1], e2[2]);
            const area = Math.hypot(nrm[0], nrm[1], nrm[2]);
            const baseArea = this.triBaseArea[k];
            if (baseArea > 0 && area < baseArea * 0.05)
                degenerateCount++;
        }
        // ---- pass 2: explicit interpenetration via uniform-grid pruning --------
        intersectingPairs = 0;
        firstPair = null;
        // Cell size scaled to the median-ish local scale; reuse largest base area
        // to pick a stable world-space resolution.
        const cell = this.cellSize(positions);
        const grid = new Map();
        // Insert each triangle into all cells its AABB overlaps.
        const cellKey = (gx, gy, gz) => `${gx},${gy},${gz}`;
        for (let t = 0; t < K; t++) {
            const [a, b, c] = this.triVertex[t];
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (const v of [a, b, c]) {
                const x = positions[v * 3];
                const y = positions[v * 3 + 1];
                const z = positions[v * 3 + 2];
                if (x < minX)
                    minX = x;
                if (x > maxX)
                    maxX = x;
                if (y < minY)
                    minY = y;
                if (y > maxY)
                    maxY = y;
                if (z < minZ)
                    minZ = z;
                if (z > maxZ)
                    maxZ = z;
            }
            const gx0 = Math.floor(minX / cell);
            const gy0 = Math.floor(minY / cell);
            const gz0 = Math.floor(minZ / cell);
            const gx1 = Math.floor(maxX / cell);
            const gy1 = Math.floor(maxY / cell);
            const gz1 = Math.floor(maxZ / cell);
            for (let gx = gx0; gx <= gx1; gx++)
                for (let gy = gy0; gy <= gy1; gy++)
                    for (let gz = gz0; gz <= gz1; gz++) {
                        const key = cellKey(gx, gy, gz);
                        let list = grid.get(key);
                        if (!list) {
                            list = [];
                            grid.set(key, list);
                        }
                        list.push(t);
                    }
        }
        outer: for (const list of grid.values()) {
            if (list.length < 2)
                continue;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    const ta = list[i];
                    const tb = list[j];
                    if (ta === tb)
                        continue;
                    if (this.triNeighbors[ta].has(tb))
                        continue;
                    if (this.triNeighbors[tb].has(ta))
                        continue;
                    if (triangleIntersect(positions, this.triVertex[ta][0], this.triVertex[ta][1], this.triVertex[ta][2], this.triVertex[tb][0], this.triVertex[tb][1], this.triVertex[tb][2])) {
                        intersectingPairs++;
                        if (!firstPair)
                            firstPair = [this.triId[ta], this.triId[tb]];
                        if (intersectingPairs >= maxPairs)
                            break outer;
                    }
                }
            }
        }
        return {
            degenerateCount,
            intersectingPairs,
            firstPair,
            valid: degenerateCount === 0 && intersectingPairs === 0,
        };
    }
    cellSize(positions) {
        // World-scale stable cell from the mesh bbox (thirds of the diagonal-minus
        // dominant axis). Keeps per-cell occupancy low without tuning constants.
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];
            if (x < minX)
                minX = x;
            if (x > maxX)
                maxX = x;
            if (y < minY)
                minY = y;
            if (y > maxY)
                maxY = y;
            if (z < minZ)
                minZ = z;
            if (z > maxZ)
                maxZ = z;
        }
        const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
        return Math.max(EPS, diag / 12);
    }
}
function triPos(positions, v) {
    return [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
}
/**
 * Möller–Trumbore triangle–triangle intersection test on the current deformed
 * positions. Returns true if the two triangles intersect (or touch) in 3D.
 */
function triangleIntersect(positions, a0, a1, a2, b0, b1, b2) {
    const p0 = triPos(positions, a0);
    const p1 = triPos(positions, a1);
    const p2 = triPos(positions, a2);
    const q0 = triPos(positions, b0);
    const q1 = triPos(positions, b1);
    const q2 = triPos(positions, b2);
    // Edge-against-triangle tests, both directions: an intersection exists iff any
    // edge of triangle A crosses triangle B's plane inside B, or vice-versa.
    return (edgeIntersectTriangle(p0, p1, q0, q1, q2) ||
        edgeIntersectTriangle(p1, p2, q0, q1, q2) ||
        edgeIntersectTriangle(p2, p0, q0, q1, q2) ||
        edgeIntersectTriangle(q0, q1, p0, p1, p2) ||
        edgeIntersectTriangle(q1, q2, p0, p1, p2) ||
        edgeIntersectTriangle(q2, q0, p0, p1, p2));
}
/**
 * Möller–Trumbore ray–triangle test: does segment [e0,e1] pierce triangle
 * (t0,t1,t2)? Tests both the segment endpoints' plane-side relationship and
 * whether the crossing point lies inside the triangle via barycentric coords.
 */
function edgeIntersectTriangle(e0, e1, t0, t1, t2) {
    const e1v = sub(e1[0], e1[1], e1[2], e0[0], e0[1], e0[2]);
    const t1e = sub(t1[0], t1[1], t1[2], t0[0], t0[1], t0[2]);
    const t2e = sub(t2[0], t2[1], t2[2], t0[0], t0[1], t0[2]);
    const pvec = cross(e1v[0], e1v[1], e1v[2], t2e[0], t2e[1], t2e[2]);
    const det = dot(t1e[0], t1e[1], t1e[2], pvec[0], pvec[1], pvec[2]);
    if (Math.abs(det) < EPS)
        return false; // segment parallel to the plane
    const inv = 1 / det;
    const tvec = sub(e0[0], e0[1], e0[2], t0[0], t0[1], t0[2]);
    const u = dot(tvec[0], tvec[1], tvec[2], pvec[0], pvec[1], pvec[2]) * inv;
    if (u < 0 || u > 1)
        return false;
    const qvec = cross(tvec[0], tvec[1], tvec[2], t1e[0], t1e[1], t1e[2]);
    const v = dot(e1v[0], e1v[1], e1v[2], qvec[0], qvec[1], qvec[2]) * inv;
    if (v < 0 || u + v > 1)
        return false;
    const tt = dot(t2e[0], t2e[1], t2e[2], qvec[0], qvec[1], qvec[2]) * inv;
    // tt in [0,1] means the crossing is on the segment.
    return tt >= 0 && tt <= 1;
}
//# sourceMappingURL=intersection.js.map