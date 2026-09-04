import { buildRegionRanges } from './regions.js';
/**
 * Canonical Human Model.
 *
 * All normal humans derive from ONE compatible canonical topology. This v0.2
 * implementation procedurally generates the body (block human) PLUS separable
 * detail parts â€” sclera/iris eyes, upper/lower teeth, tongue, mouth cavity â€”
 * each with stable per-part vertex ranges, region tags and surface UVs.
 *
 * The body and each part are addressable as sub-meshes of a single global
 * vertex/index array so the morph/skinning/GPU pipeline stays unchanged while
 * parts expose independent identity (Phase 2 requirement: stable IDs, face
 * loops, weights, surface coordinates for each system).
 */
export class CanonicalHuman {
    vertices;
    indices;
    regionRanges = new Map();
    /** Detail parts (eyes/teeth/tongue/mouth cavity). Body is part "body". */
    parts;
    partByRegion = new Map();
    /** Index range of each part in the global index array. */
    partIndexRanges = new Map();
    boneIndex = new Map();
    constructor(boneNames, topology) {
        boneNames.forEach((b, i) => this.boneIndex.set(b, i));
        const headBone = 'head';
        if (topology) {
            // External provider topology (e.g. HD head). Build vertices/parts from
            // the supplied contract; derive regional + per-part ranges identically to
            // the procedural path so every consumer is topology-agnostic.
            const vertices = topology.vertices.map((v) => ({
                id: v.id,
                position: { x: v.position.x, y: v.position.y, z: v.position.z },
                normal: { x: v.normal.x, y: v.normal.y, z: v.normal.z },
                uv: { u: v.uv.u, v: v.uv.v },
                region: v.region,
                weights: { ...v.weights },
            }));
            const parts = topology.parts.map((p) => ({
                name: p.name,
                kind: p.kind,
                region: p.region,
                vertexStart: p.vertexStart,
                vertexCount: p.vertexCount,
                indexStart: p.indexStart,
                indexCount: p.indexCount,
            }));
            this.parts = parts;
            for (const p of parts)
                this.partByRegion.set(p.region, p);
            this.vertices = vertices;
            this.indices = Uint32Array.from(topology.indices);
        }
        else {
            const body = generateBlockHuman(boneNames);
            const vertices = [...body.vertices];
            const indices = Array.from(body.indices);
            // Build detail parts. New parts are appended so their global ids are stable
            // and never collide with the body regardless of body edits.
            const parts = [];
            const detail = buildDetailParts();
            let vertexBase = vertices.length;
            let indexBase = indices.length;
            for (const dp of detail) {
                const start = vertexBase;
                const istart = indexBase;
                for (const v of dp.vertices) {
                    vertices.push({
                        id: start + v.localIndex,
                        position: v.position,
                        normal: v.normal,
                        uv: v.uv,
                        region: dp.region,
                        weights: { [headBone]: 1.0 },
                    });
                }
                for (const vi of dp.indices) {
                    indices.push(start + vi);
                }
                vertexBase += dp.vertices.length;
                indexBase += dp.indices.length;
                const part = {
                    name: dp.name,
                    kind: dp.kind,
                    region: dp.region,
                    vertexStart: start,
                    vertexCount: dp.vertices.length,
                    indexStart: istart,
                    indexCount: dp.indices.length,
                };
                parts.push(part);
                this.partByRegion.set(dp.region, part);
            }
            this.parts = parts;
            this.vertices = vertices;
            this.indices = Uint32Array.from(indices);
        }
        // Build regional ranges (aggregate) — body regions plus detail parts, with
        // coarse-region aliases synthesized over fine sub-regions so HD topologies
        // satisfy the same coarse contract as the procedural block human.
        this.regionRanges = buildRegionRanges(this.vertices);
        // Index ranges per part (for per-part draw/sub-mesh rendering).
        for (const p of this.parts) {
            this.partIndexRanges.set(p.name, { start: p.indexStart, count: p.indexCount });
        }
    }
    /** Build a canonical human from an externally supplied topology + bones. */
    static fromTopology(topology, boneNames) {
        return new CanonicalHuman(boneNames, topology);
    }
    get vertexCount() {
        return this.vertices.length;
    }
    get triangleCount() {
        return this.indices.length / 3;
    }
    /** Vertex range (global ids) of a part, or the body range (0..bodyStart). */
    partVertexRange(name) {
        const p = this.parts.find((x) => x.name === name);
        if (p)
            return { start: p.vertexStart, count: p.vertexCount };
        return null;
    }
    boneId(name) {
        return this.boneIndex.get(name) ?? 0;
    }
    /** Copy base positions+normals into contiguous Float32Arrays. */
    baseGeometry() {
        const positions = new Float32Array(this.vertices.length * 3);
        const normals = new Float32Array(this.vertices.length * 3);
        for (let i = 0; i < this.vertices.length; i++) {
            const { x, y, z } = this.vertices[i].position;
            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            const n = this.vertices[i].normal;
            normals[i * 3 + 0] = n.x;
            normals[i * 3 + 1] = n.y;
            normals[i * 3 + 2] = n.z;
        }
        return { positions, normals };
    }
}
/**
 * Procedural block human: a simple humanoid built from boxes/slabs. This is the
 * body; detail parts (eyes/teeth/tongue/cavity) are appended by CanonicalHuman.
 */
export function generateBlockHuman(boneNames) {
    const vertices = [];
    const indices = [];
    const boneId = new Map();
    boneNames.forEach((b, i) => boneId.set(b, i));
    const parts = [
        {
            cx: 0,
            cy: 1.5,
            cz: 0,
            sx: 0.34,
            sy: 0.55,
            sz: 0.22,
            region: 'torso',
            bones: ['spine_01', 'spine_02', 'chest'],
        },
        { cx: 0, cy: 1.85, cz: 0, sx: 0.28, sy: 0.22, sz: 0.26, region: 'head', bones: ['head'] },
        { cx: 0, cy: 1.85, cz: 0.16, sx: 0.24, sy: 0.16, sz: 0.12, region: 'face', bones: ['head'] },
        { cx: 0, cy: 1.86, cz: 0.23, sx: 0.05, sy: 0.08, sz: 0.04, region: 'nose', bones: ['head'] },
        { cx: 0, cy: 1.79, cz: 0.17, sx: 0.2, sy: 0.07, sz: 0.06, region: 'jaw', bones: ['head'] },
        { cx: -0.06, cy: 1.9, cz: 0.19, sx: 0.03, sy: 0.03, sz: 0.02, region: 'eyes', bones: ['head'] },
        { cx: 0.06, cy: 1.9, cz: 0.19, sx: 0.03, sy: 0.03, sz: 0.02, region: 'eyes', bones: ['head'] },
        { cx: 0, cy: 1.79, cz: 0.22, sx: 0.06, sy: 0.02, sz: 0.03, region: 'mouth', bones: ['head'] },
        { cx: 0, cy: 1.85, cz: -0.26, sx: 0.18, sy: 0.12, sz: 0.06, region: 'neck', bones: ['neck'] },
        {
            cx: -0.42,
            cy: 1.9,
            cz: 0,
            sx: 0.14,
            sy: 0.06,
            sz: 0.14,
            region: 'upperarm_l',
            bones: ['upperarm_l'],
        },
        {
            cx: 0.42,
            cy: 1.9,
            cz: 0,
            sx: 0.14,
            sy: 0.06,
            sz: 0.14,
            region: 'upperarm_r',
            bones: ['upperarm_r'],
        },
        {
            cx: -0.72,
            cy: 1.72,
            cz: 0,
            sx: 0.12,
            sy: 0.3,
            sz: 0.12,
            region: 'forearm_l',
            bones: ['forearm_l'],
        },
        {
            cx: 0.72,
            cy: 1.72,
            cz: 0,
            sx: 0.12,
            sy: 0.3,
            sz: 0.12,
            region: 'forearm_r',
            bones: ['forearm_r'],
        },
        { cx: -0.84, cy: 1.58, cz: 0, sx: 0.1, sy: 0.1, sz: 0.1, region: 'hand_l', bones: ['hand_l'] },
        { cx: 0.84, cy: 1.58, cz: 0, sx: 0.1, sy: 0.1, sz: 0.1, region: 'hand_r', bones: ['hand_r'] },
        { cx: 0, cy: 1.25, cz: 0, sx: 0.16, sy: 0.28, sz: 0.2, region: 'thigh_l', bones: ['thigh_l'] },
        { cx: 0, cy: 1.25, cz: 0, sx: -0.16, sy: 0.28, sz: 0.2, region: 'thigh_r', bones: ['thigh_r'] },
        { cx: 0, cy: 0.85, cz: 0, sx: 0.14, sy: 0.3, sz: 0.16, region: 'shin_l', bones: ['shin_l'] },
        { cx: 0, cy: 0.85, cz: 0, sx: -0.14, sy: 0.3, sz: 0.16, region: 'shin_r', bones: ['shin_r'] },
    ];
    parts[10].cx = -0.09;
    parts[11].cx = 0.09;
    parts[12].cx = -0.09;
    parts[13].cx = 0.09;
    let base = 0;
    for (const part of parts) {
        const local = boxVertices(part.cx, part.cy, part.cz, part.sx, part.sy, part.sz);
        const weights = {};
        for (const b of part.bones)
            weights[b] = 1.0;
        for (let v = 0; v < local.positions.length; v++) {
            vertices.push({
                id: base + v,
                position: local.positions[v],
                normal: local.normals[v],
                uv: { u: local.uvs[v][0], v: local.uvs[v][1] },
                region: part.region,
                weights,
            });
        }
        for (const idx of local.indices) {
            indices.push(base + idx);
        }
        base += local.positions.length;
    }
    return { vertices, indices: Uint32Array.from(indices) };
}
function buildDetailParts() {
    const parts = [];
    // Eyes: sclera sphere + iris + pupil for left and right.
    for (const side of [-1, 1]) {
        const cx = side * 0.06;
        const ey = 1.9;
        const ez = 0.2;
        const sclera = sphere(cx, ey, ez, 0.034, 10, 7);
        const iris = disc(side, cx, ey, ez + 0.008, 0.017, 0);
        const pupil = disc(side, cx, ey, ez + 0.012, 0.008, 0);
        parts.push(shade('sclera', { name: side < 0 ? 'eye_l' : 'eye_r', kind: 'sclera', region: 'eye_sclera' }, sclera));
        parts.push(shade('iris', { name: side < 0 ? 'iris_l' : 'iris_r', kind: 'iris', region: 'eye_iris' }, iris));
        parts.push(shade('pupil', { name: side < 0 ? 'pupil_l' : 'pupil_r', kind: 'iris', region: 'eye_iris' }, pupil));
    }
    // Teeth: two small rows inside the mouth.
    parts.push(boxPart('teeth_upper', 'teeth', 'teeth', 0, 1.805, 0.2, 0.05, 0.02, 0.02), boxPart('teeth_lower', 'teeth', 'teeth', 0, 1.775, 0.2, 0.05, 0.02, 0.02));
    // Tongue: a slim slab slightly below the upper teeth.
    parts.push(boxPart('tongue', 'tongue', 'tongue', 0, 1.785, 0.185, 0.035, 0.012, 0.03));
    // Mouth cavity: a small dark hemisphere behind the teeth row.
    parts.push(cavityPart());
    return parts;
}
function shade(what, base, g) {
    void what;
    const verts = g.positions.map((p, i) => ({
        localIndex: i,
        position: p,
        normal: g.normals[i],
        uv: { u: g.uvs[i][0], v: g.uvs[i][1] },
    }));
    return { ...base, vertices: verts, indices: g.indices };
}
function boxPart(name, _what, region, cx, cy, cz, sx, sy, sz) {
    void _what;
    const g = boxVertices(cx, cy, cz, sx, sy, sz);
    const kind = region === 'tongue' ? 'tongue' : 'teeth';
    return shade(region, { name, kind, region }, g);
}
function cavityPart() {
    // Half-sphere facing +z (dark) used as an interior mouth cavity.
    const g = sphere(0, 1.79, 0.185, 0.04, 8, 5);
    return shade('cavity', { name: 'mouth_cavity', kind: 'mouth_cavity', region: 'mouth_cavity' }, g);
}
/** UV-sphere centered at (cx,cy,cz) with given radius. */
function sphere(cx, cy, cz, r, stacks, slices) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= stacks; i++) {
        const phi = (i / stacks) * Math.PI;
        const y = Math.cos(phi);
        const ringR = Math.sin(phi);
        for (let j = 0; j <= slices; j++) {
            const theta = (j / slices) * Math.PI * 2;
            const x = ringR * Math.cos(theta);
            const z = ringR * Math.sin(theta);
            positions.push({ x: cx + x * r, y: cy + y * r, z: cz + z * r });
            normals.push({ x, y, z });
            uvs.push([j / slices, i / stacks]);
            if (i < stacks && j < slices) {
                const a = i * (slices + 1) + j;
                const b = a + slices + 1;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
    }
    return { positions, normals, uvs, indices };
}
/** Flat disc (front cap) at (cx,cy,cz), normal +z, radius r. */
function disc(side, cx, cy, cz, r, _slicesBase) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    void side;
    const slices = 12;
    positions.push({ x: cx, y: cy, z: cz });
    normals.push({ x: 0, y: 0, z: 1 });
    uvs.push([0.5, 0.5]);
    for (let j = 0; j <= slices; j++) {
        const theta = (j / slices) * Math.PI * 2;
        positions.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r, z: cz });
        normals.push({ x: 0, y: 0, z: 1 });
        uvs.push([0.5 + Math.cos(theta) * 0.5, 0.5 + Math.sin(theta) * 0.5]);
        if (j > 0)
            indices.push(0, j, j + 1);
    }
    return { positions, normals, uvs, indices };
}
function boxVertices(cx, cy, cz, sx, sy, sz) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const faces = [
        {
            n: { x: 0, y: 0, z: 1 },
            u: { x: 1, y: 0, z: 0 },
            v: { x: 0, y: 1, z: 0 },
            c: { x: cx, y: cy, z: cz + sz / 2 },
            du: sx,
            dv: sy,
        },
        {
            n: { x: 0, y: 0, z: -1 },
            u: { x: -1, y: 0, z: 0 },
            v: { x: 0, y: 1, z: 0 },
            c: { x: cx, y: cy, z: cz - sz / 2 },
            du: sx,
            dv: sy,
        },
        {
            n: { x: 1, y: 0, z: 0 },
            u: { x: 0, y: 0, z: 1 },
            v: { x: 0, y: 1, z: 0 },
            c: { x: cx + sx / 2, y: cy, z: cz },
            du: sz,
            dv: sy,
        },
        {
            n: { x: -1, y: 0, z: 0 },
            u: { x: 0, y: 0, z: -1 },
            v: { x: 0, y: 1, z: 0 },
            c: { x: cx - sx / 2, y: cy, z: cz },
            du: sz,
            dv: sy,
        },
        {
            n: { x: 0, y: 1, z: 0 },
            u: { x: 1, y: 0, z: 0 },
            v: { x: 0, y: 0, z: 1 },
            c: { x: cx, y: cy + sy / 2, z: cz },
            du: sx,
            dv: sz,
        },
        {
            n: { x: 0, y: -1, z: 0 },
            u: { x: 1, y: 0, z: 0 },
            v: { x: 0, y: 0, z: -1 },
            c: { x: cx, y: cy - sy / 2, z: cz },
            du: sx,
            dv: sz,
        },
    ];
    for (const f of faces) {
        const base = positions.length;
        const halfU = f.du / 2;
        const halfV = f.dv / 2;
        const corners = [
            { p: add3(f.c, add3(scale3(f.u, -halfU), scale3(f.v, -halfV))), uv: [0, 0] },
            { p: add3(f.c, add3(scale3(f.u, halfU), scale3(f.v, -halfV))), uv: [1, 0] },
            { p: add3(f.c, add3(scale3(f.u, -halfU), scale3(f.v, halfV))), uv: [0, 1] },
            { p: add3(f.c, add3(scale3(f.u, halfU), scale3(f.v, halfV))), uv: [1, 1] },
        ];
        for (const c of corners) {
            positions.push(c.p);
            normals.push(f.n);
            uvs.push(c.uv);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    return { positions, normals, uvs, indices };
}
function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function scale3(a, s) {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}
//# sourceMappingURL=canonical-human.js.map