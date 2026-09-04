// ---------------------------------------------------------------------------
// Capsule SDF authoring (canonical frame: x right, y up, z front, feet ~0).
// ---------------------------------------------------------------------------
function p(x, y, z) {
    return { x, y, z };
}
function buildCapsules(neckY) {
    const J = {
        pelvis: p(0, 0.98, 0),
        spine01: p(0, 1.1, 0),
        spine02: p(0, 1.2, 0),
        chest: p(0, neckY - 0.1, 0),
        neck: p(0, neckY - 0.02, 0.15),
        shoulderL: p(-0.17, neckY - 0.05, 0),
        shoulderR: p(0.17, neckY - 0.05, 0),
        elbowL: p(-0.19, 0.98, 0),
        elbowR: p(0.19, 0.98, 0),
        wristL: p(-0.19, 0.74, 0),
        wristR: p(0.19, 0.74, 0),
        handL: p(-0.19, 0.72, 0),
        handR: p(0.19, 0.72, 0),
        hipL: p(-0.1, 0.98, 0),
        hipR: p(0.1, 0.98, 0),
        kneeL: p(-0.11, 0.52, 0),
        kneeR: p(0.11, 0.52, 0),
        ankleL: p(-0.09, 0.06, 0),
        ankleR: p(0.09, 0.06, 0),
        toeL: p(-0.09, 0.03, 0.06),
        toeR: p(0.09, 0.03, 0.06),
    };
    const c = (bone, a, b, radius) => ({
        a: J[a],
        b: J[b],
        radius,
        bone,
    });
    return [
        c('chest', 'chest', 'neck', 0.05),
        c('spine_02', 'chest', 'spine02', 0.115),
        c('spine_01', 'spine02', 'pelvis', 0.13),
        c('clavicle_l', 'shoulderL', 'shoulderL', 0.062),
        c('clavicle_r', 'shoulderR', 'shoulderR', 0.062),
        c('upperarm_l', 'shoulderL', 'elbowL', 0.048),
        c('upperarm_r', 'shoulderR', 'elbowR', 0.048),
        c('forearm_l', 'elbowL', 'wristL', 0.036),
        c('forearm_r', 'elbowR', 'wristR', 0.036),
        c('hand_l', 'wristL', 'handL', 0.034),
        c('hand_r', 'wristR', 'handR', 0.034),
        c('thigh_l', 'hipL', 'kneeL', 0.062),
        c('thigh_r', 'hipR', 'kneeR', 0.062),
        c('shin_l', 'kneeL', 'ankleL', 0.042),
        c('shin_r', 'kneeR', 'ankleR', 0.042),
        c('foot_l', 'ankleL', 'toeL', 0.028),
        c('foot_r', 'ankleR', 'toeR', 0.028),
    ];
}
function sdCapsule(pt, c) {
    const pax = pt.x - c.a.x, pay = pt.y - c.a.y, paz = pt.z - c.a.z;
    const bax = c.b.x - c.a.x, bay = c.b.y - c.a.y, baz = c.b.z - c.a.z;
    const len2 = bax * bax + bay * bay + baz * baz || 1e-12;
    const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / len2));
    const qx = pt.x - (c.a.x + bax * t);
    const qy = pt.y - (c.a.y + bay * t);
    const qz = pt.z - (c.a.z + baz * t);
    return Math.hypot(qx, qy, qz) - c.radius;
}
/** Signed distance to the whole body: min over capsules. */
function sdBody(pt, capsules) {
    let best = Infinity;
    let bone = '';
    for (const c of capsules) {
        const d = sdCapsule(pt, c);
        if (d < best) {
            best = d;
            bone = c.bone;
        }
    }
    return { d: best, bone };
}
/** Region for a surface vertex given its owning bone and position. */
function regionFor(bone, qx, qy, qz) {
    switch (bone) {
        case 'spine_01':
            if (qy > 1.1 && qz < 0)
                return 'back';
            return qy > 1.02 ? 'abdomen' : qz < -0.02 ? 'back' : 'pelvis';
        case 'spine_02':
            if (qy > 1.16)
                return qz < 0 ? 'back' : 'chest';
            return qz < -0.02 && qy > 1.1 ? 'back' : 'chest';
        case 'chest':
        case 'neck':
            return qz < 0 && qy > 1.15 ? 'back' : 'chest';
        case 'clavicle_l':
            return 'shoulder_left';
        case 'clavicle_r':
            return 'shoulder_right';
        case 'upperarm_l':
            return 'upper_arm_left';
        case 'upperarm_r':
            return 'upper_arm_right';
        case 'forearm_l':
            return 'forearm_left';
        case 'forearm_r':
            return 'forearm_right';
        case 'hand_l':
            return 'hand_left';
        case 'hand_r':
            return 'hand_right';
        case 'thigh_l':
            return 'thigh_left';
        case 'thigh_r':
            return 'thigh_right';
        case 'shin_l':
            return 'shin_left';
        case 'shin_r':
            return 'shin_right';
        case 'foot_l':
            return 'foot_left';
        case 'foot_r':
            return 'foot_right';
        default:
            return 'chest';
    }
}
/** Discrete bone points for skin-weight gradients (nearest-bone blending). */
function bonePoints(capsules) {
    const map = new Map();
    const add = (bone, pt) => {
        const cur = map.get(bone);
        if (!cur)
            map.set(bone, { ...pt });
        else {
            cur.x = (cur.x + pt.x) / 2;
            cur.y = (cur.y + pt.y) / 2;
            cur.z = (cur.z + pt.z) / 2;
        }
    };
    for (const c of capsules) {
        add(c.bone, c.a);
        add(c.bone, c.b);
    }
    return [...map.entries()].map(([bone, pt]) => ({ bone, pt }));
}
/** Cube corner positions (index matches marching-cubes bit order). */
const MC_CORNERS = [
    p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1),
    p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1),
];
/** Corner pairs for each of the 12 cube edges (standard marching-cubes order). */
const EDGE_CORNER = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
];
/** DFS that walks a tree of crossing edges from a start edge, fanning off it. */
function triangulateLoop(edges, points, out) {
    const r = out;
    const n = edges.length;
    if (n === 3) {
        r.push(edges[0], edges[1], edges[2]);
        return r;
    }
    if (n < 3)
        return r;
    // Find a triangle with maximal basis (greedy ear): pick edges sharing a corner.
    // cornersOnEdge[e] = the two corner ids of that edge.
    const cornerOf = new Map();
    for (const e of edges) {
        const [a, b] = EDGE_CORNER[e];
        cornerOf.set(a, (cornerOf.get(a) ?? []).concat(e));
        cornerOf.set(b, (cornerOf.get(b) ?? []).concat(e));
    }
    // Reduce by triples: for an n-gonal loop we can emit n-2 triangles by a fan.
    // Build the loop order: follow edges by shared corner (each edge shares one
    // corner with its predecessor and one with its successor in a polygon).
    const loop = [];
    loop.push(edges[0]);
    let used = new Set([edges[0]]);
    let cursor = edges[0];
    while (loop.length < n) {
        const [c1, c2] = EDGE_CORNER[cursor];
        const cands = (cornerOf.get(c1) ?? []).concat(cornerOf.get(c2) ?? []);
        let next = -1;
        for (const c of cands)
            if (!used.has(c)) {
                next = c;
                break;
            }
        if (next === -1)
            break;
        loop.push(next);
        used.add(next);
        cursor = next;
    }
    for (let i = 1; i + 1 < loop.length; i++) {
        r.push(loop[0], loop[i], loop[i + 1]);
    }
    return r;
}
/**
 * Build the marching-cubes triangle table programmatically: for each 8-bit
 * inside-mask, identify the crossing cube edges (an edge crosses when its two
 * endpoints differ in inside-state) and triangulate the loop(s) they form.
 * REUSING only surface edges that lie on the cell, this reproduces the classic
 * marching-cubes connectivity without a hard-coded 256-row table.
 */
function buildTriTable() {
    const table = [];
    for (let mask = 0; mask < 256; mask++) {
        const inside = (k) => (mask >> k) & 1;
        const edges = [];
        for (let e = 0; e < 12; e++) {
            const [a, b] = EDGE_CORNER[e];
            if (inside(a) !== inside(b))
                edges.push(e);
        }
        const points = edges.map((e) => ({ pos: p(0, 0, 0), bone: "", edge: e }));
        const out = [];
        triangulateLoop(edges, points, out);
        table.push(out.length ? out : [-1]);
    }
    return table;
}
const TRI_TABLE = buildTriTable();
/** March a scalar field f on a grid, returning a closed triangle soup. */
function marchGrid(nx, ny, nz, iso, f, posAt) {
    const field = (ix, iy, iz) => ix < 0 || iy < 0 || iz < 0 || ix > nx || iy > ny || iz > nz ? { d: Infinity, bone: "" } : f(ix, iy, iz);
    const verts = [];
    const inds = [];
    const edgeVert = new Map();
    for (let iz = 0; iz < nz; iz++) {
        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const cornerVal = new Array(8);
                const cornerBone = new Array(8);
                for (let ci = 0; ci < 8; ci++) {
                    const cc = MC_CORNERS[ci];
                    const g = field(ix + cc.x, iy + cc.y, iz + cc.z);
                    cornerVal[ci] = g.d;
                    cornerBone[ci] = g.bone;
                }
                let mask = 0;
                for (let ci = 0; ci < 8; ci++)
                    if (cornerVal[ci] < iso)
                        mask |= 1 << ci;
                const tris = TRI_TABLE[mask];
                if (tris.length === 1 && tris[0] === -1)
                    continue;
                const cellEdges = new Set();
                const t = (i) => edgeVert.get(cellEdgeKey(ix, iy, iz, i, nx, ny, nz)) ?? -1;
                const ensureEdge = (e) => {
                    const key = cellEdgeKey(ix, iy, iz, e, nx, ny, nz);
                    const hit = edgeVert.get(key);
                    if (hit !== undefined)
                        return hit;
                    const [c1, c2] = EDGE_CORNER[e];
                    const d1 = cornerVal[c1];
                    const d2 = cornerVal[c2];
                    const fr = Math.max(0, Math.min(1, d1 / (d1 - d2 || 1e-12)));
                    const a = posAt(ix + MC_CORNERS[c1].x, iy + MC_CORNERS[c1].y, iz + MC_CORNERS[c1].z);
                    const b = posAt(ix + MC_CORNERS[c2].x, iy + MC_CORNERS[c2].y, iz + MC_CORNERS[c2].z);
                    const pos = {
                        x: a.x + (b.x - a.x) * fr,
                        y: a.y + (b.y - a.y) * fr,
                        z: a.z + (b.z - a.z) * fr,
                    };
                    const bone = Math.abs(d1) < Math.abs(d2) ? cornerBone[c1] : cornerBone[c2];
                    const vid = verts.length;
                    verts.push({ pos, bone });
                    edgeVert.set(key, vid);
                    cellEdges.add(e);
                    return vid;
                };
                for (let k = 0; k < tris.length; k += 3) {
                    const e0 = tris[k], e1 = tris[k + 1], e2 = tris[k + 2];
                    if (e0 === -1 || e1 === -1 || e2 === -1)
                        break;
                    inds.push(ensureEdge(e0), ensureEdge(e1), ensureEdge(e2));
                }
            }
        }
    }
    return { vertices: verts, indices: Uint32Array.from(inds) };
}
/** Deterministic key for a cube edge, shared across adjacent cells so that the
 * interpolated vertex on that edge is reused (natural watertight weld). */
function cellEdgeKey(ix, iy, iz, e, nx, ny, nz) {
    const [c1, c2] = EDGE_CORNER[e];
    const p1 = MC_CORNERS[c1], p2 = MC_CORNERS[c2];
    const lx = ix + p1.x, ly = iy + p1.y, lz = iz + p1.z;
    const wx = ix + p2.x, wy = iy + p2.y, wz = iz + p2.z;
    const ax = Math.min(lx, wx), ay = Math.min(ly, wy), az = Math.min(lz, wz);
    const bx = Math.max(lx, wx), by = Math.max(ly, wy), bz = Math.max(lz, wz);
    return (ax + 1) + (ay + 1) * (nx + 2) + (az + 1) * (nx + 2) * (ny + 2) + (bx + 1) * (nx + 2) * (ny + 2) * 2 + (by + 1) * (nx + 2) * (ny + 2) * 3 + (bz + 1) * (nx + 2) * (ny + 2) * 4 + e * (nx + 2) * (ny + 2) * 5;
}
function weld(verts, indices, tol) {
    const key = (v) => `${Math.round(v.x / tol)}/${Math.round(v.y / tol)}/${Math.round(v.z / tol)}`;
    const index = new Map();
    const out = [];
    const remap = new Array(verts.length);
    for (let i = 0; i < verts.length; i++) {
        const k = key(verts[i].pos);
        const hit = index.get(k);
        if (hit !== undefined) {
            remap[i] = hit;
        }
        else {
            const nid = out.length;
            out.push(verts[i]);
            index.set(k, nid);
            remap[i] = nid;
        }
    }
    const newIndices = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i++)
        newIndices[i] = remap[indices[i]];
    return { vertices: out, indices: newIndices };
}
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
/**
 * Test helper: march an analytic unit-sphere SDF on a grid and return the welded
 * mesh. The sphere must triangulate to a watertight closed surface (Ï‡ = 2, zero
 * boundary edges); this isolates the marching-tetra extractor from the body SDF.
 */
export function marchingCubesProbe(n = 24, tol = 0.02) {
    const min = -1.2, max = 1.2;
    const size = max - min;
    const cell = size / n;
    const posAt = (ix, iy, iz) => ({
        x: min + ix * cell,
        y: min + iy * cell,
        z: min + iz * cell,
    });
    const f = (_ix, iy, iz) => {
        const q = posAt(0, iy, iz);
        void q;
        return { d: 0, bone: '' }; // placeholder
    };
    // Real sphere field needs ix; rebuild with full pos.
    const fFull = (ix, iy, iz) => {
        const ppos = posAt(ix, iy, iz);
        const d = Math.hypot(ppos.x, ppos.y, ppos.z) - 1;
        return { d, bone: 'chest' };
    };
    void f;
    const raw = marchGrid(n, n, n, 0, fFull, posAt);
    // Report raw (pre-weld) watertightness to isolate weld vs marching emission.
    const rawChi = raw.vertices.length - countEdgesProbe(raw.indices) + raw.indices.length / 3;
    const rawBoundary = countBoundaryProbe(raw.indices);
    void rawChi;
    void rawBoundary;
    const welded = weld(raw.vertices, raw.indices, tol);
    const eE = countEdgesProbe(welded.indices);
    const eF = welded.indices.length / 3;
    const eV = welded.vertices.length;
    return { vertices: welded.vertices, indices: welded.indices, chi: eV - eE + eF, boundaryEdges: countBoundaryProbe(welded.indices), rawBoundary: rawBoundary, rawChi: rawChi, rawV: raw.vertices.length };
}
function countEdgesProbe(indices) {
    const set = new Set();
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        for (const [u, v] of [[a, b], [b, c], [c, a]])
            set.add(Math.min(u, v) + '|' + Math.max(u, v));
    }
    return set.size;
}
function countBoundaryProbe(indices) {
    const m = new Map();
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const k = Math.min(u, v) + '|' + Math.max(u, v);
            m.set(k, (m.get(k) ?? 0) + 1);
        }
    }
    let odd = 0;
    for (const c of m.values())
        if (c % 2 !== 0)
            odd++;
    return odd;
}
/** Build the body: see module doc. */
export function buildHdBodyManifold(opts = {}) {
    const neckY = opts.neckY ?? 1.65;
    const ySteps = opts.ySteps ?? 96;
    const capsules = buildCapsules(neckY);
    const bones = bonePoints(capsules);
    // Field bounds: gather from capsule extents with margin.
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const c of capsules) {
        for (const q of [c.a, c.b]) {
            minX = Math.min(minX, q.x - c.radius);
            minY = Math.min(minY, q.y - c.radius);
            minZ = Math.min(minZ, q.z - c.radius);
            maxX = Math.max(maxX, q.x + c.radius);
            maxY = Math.max(maxY, q.y + c.radius);
            maxZ = Math.max(maxZ, q.z + c.radius);
        }
    }
    const pad = 0.02;
    minX -= pad;
    minY -= pad;
    minZ -= pad;
    maxX += pad;
    maxY += pad;
    maxZ += pad;
    const cellSize = (maxY - minY) / ySteps;
    const nx = Math.max(4, Math.round((maxX - minX) / cellSize));
    const nz = Math.max(4, Math.round((maxZ - minZ) / cellSize));
    const ny = ySteps;
    const posAt = (ix, iy, iz) => ({
        x: minX + ix * cellSize,
        y: minY + iy * cellSize,
        z: minZ + iz * cellSize,
    });
    const f = (ix, iy, iz) => {
        return sdBody(posAt(ix, iy, iz), capsules);
    };
    const iso = 0;
    const raw = marchGrid(nx, ny, nz, iso, f, posAt);
    const welded = weld(raw.vertices, raw.indices, cellSize * 0.02);
    // Assign normals (from SDF gradient), weights, uv, region per vertex.
    const e = 1e-3;
    const vertices = welded.vertices.map((cv) => {
        const pos = cv.pos;
        // central difference normal of the signed distance field (points outward:
        // d decreases toward the interior, so the gradient points outward).
        const gx = sdBody({ x: pos.x + e, y: pos.y, z: pos.z }, capsules).d -
            sdBody({ x: pos.x - e, y: pos.y, z: pos.z }, capsules).d;
        const gy = sdBody({ x: pos.x, y: pos.y + e, z: pos.z }, capsules).d -
            sdBody({ x: pos.x, y: pos.y - e, z: pos.z }, capsules).d;
        const gz = sdBody({ x: pos.x, y: pos.y, z: pos.z + e }, capsules).d -
            sdBody({ x: pos.x, y: pos.y, z: pos.z - e }, capsules).d;
        const gl = Math.hypot(gx, gy, gz) || 1e-12;
        const normal = { x: gx / gl, y: gy / gl, z: gz / gl };
        // inverse-distance skin weights to nearest bones.
        const weights = {};
        const contrib = [];
        let total = 0;
        for (const bp of bones) {
            const dx = pos.x - bp.pt.x, dy = pos.y - bp.pt.y, dz = pos.z - bp.pt.z;
            const d2 = Math.max(1e-8, dx * dx + dy * dy + dz * dz);
            const w = 1 / d2;
            contrib.push({ bone: bp.bone, w });
            total += w;
        }
        contrib.sort((a, b) => b.w - a.w);
        const nInfluences = 4;
        for (let i = 0; i < Math.min(nInfluences, contrib.length); i++) {
            weights[contrib[i].bone] = contrib[i].w / total;
        }
        // Normalize the top-k to 1.
        let wsum = 0;
        for (const k of Object.keys(weights))
            wsum += weights[k];
        if (wsum > 1e-12)
            for (const k of Object.keys(weights))
                weights[k] /= wsum;
        const region = regionFor(cv.bone, pos.x, pos.y, pos.z);
        return {
            id: -1,
            position: pos,
            normal,
            uv: {
                u: Math.max(0, Math.min(1, (pos.x + 0.3) / 0.6)),
                v: Math.max(0, Math.min(1, pos.y / 1.8)),
            },
            region,
            weights,
        };
    });
    // Stable ids (assigned globally by the provider after concatenation, but set
    // to array index here as the canonical contract requires id === index).
    for (let i = 0; i < vertices.length; i++)
        vertices[i] = { ...vertices[i], id: i };
    return { vertices, indices: welded.indices };
}
//# sourceMappingURL=hd-body-manifold.js.map