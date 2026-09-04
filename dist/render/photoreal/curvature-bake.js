/**
 * Per-vertex curvature + tissue thickness bake.
 *
 * The delivered photoreal shader used two hard-coded scalars for the whole head
 * (`SKIN_CURVATURE`, `SKIN_THICKNESS`). Pre-integrated SSS is a function of
 * curvature, and transmission is a function of thickness, so a single constant
 * makes a nose tip scatter like a cheek and an ear rim transmit like a jaw.
 *
 * This module bakes both signals from the canonical topology, deterministically
 * and with no GPU work:
 *
 *   curvature  discrete mean curvature from normal divergence over the
 *              one-ring: mean over neighbours of dot(nj - ni, pj - pi) / |pj - pi|²
 *              (convex positive), clamped to the shared curvature range.
 *   thickness  inward ray-march proxy: from each vertex, step along -normal and
 *              find the nearest back-facing surface sample (normal opposing the
 *              step) using a uniform spatial hash. That distance is the local
 *              tissue thickness — small on lids/ear rims, large on cheeks/torso.
 *
 * The result is uploaded as one interleaved vec2 vertex attribute
 * (`curvatureThickness`), read by the photoreal shader in place of the constants.
 */
import { PHOTOREAL_CONSTANTS } from './constants.js';
const C = PHOTOREAL_CONSTANTS;
function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}
/** One-ring adjacency (vertex -> unique neighbour ids) from a triangle list. */
export function buildOneRing(indices, vertexCount) {
    const sets = Array.from({ length: vertexCount }, () => new Set());
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const a = indices[t];
        const b = indices[t + 1];
        const c = indices[t + 2];
        if (a >= vertexCount || b >= vertexCount || c >= vertexCount)
            continue;
        sets[a].add(b);
        sets[a].add(c);
        sets[b].add(a);
        sets[b].add(c);
        sets[c].add(a);
        sets[c].add(b);
    }
    return sets.map((s) => Uint32Array.from(s));
}
/**
 * Discrete mean curvature (1/m) per vertex from normal divergence. Isolated
 * vertices fall back to the flattest allowed curvature.
 */
export function bakeCurvature(vertices, indices) {
    const n = vertices.length;
    const ring = buildOneRing(indices, n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const vi = vertices[i];
        const neighbours = ring[i];
        if (neighbours.length === 0) {
            out[i] = C.curvatureMin;
            continue;
        }
        let sum = 0;
        let used = 0;
        for (const j of neighbours) {
            const vj = vertices[j];
            const ex = vj.position.x - vi.position.x;
            const ey = vj.position.y - vi.position.y;
            const ez = vj.position.z - vi.position.z;
            const len2 = ex * ex + ey * ey + ez * ez;
            if (len2 < 1e-12)
                continue;
            const dnx = vj.normal.x - vi.normal.x;
            const dny = vj.normal.y - vi.normal.y;
            const dnz = vj.normal.z - vi.normal.z;
            sum += (dnx * ex + dny * ey + dnz * ez) / len2;
            used++;
        }
        const mean = used > 0 ? Math.abs(sum / used) : 0;
        out[i] = clamp(mean, C.curvatureMin, C.curvatureMax);
    }
    return out;
}
/** Uniform spatial hash over vertex positions, for the inward thickness march. */
class VertexGrid {
    vertices;
    cell;
    cells = new Map();
    constructor(vertices, cell) {
        this.vertices = vertices;
        this.cell = cell;
        for (let i = 0; i < vertices.length; i++) {
            const key = this.key(vertices[i].position.x, vertices[i].position.y, vertices[i].position.z);
            const bucket = this.cells.get(key);
            if (bucket)
                bucket.push(i);
            else
                this.cells.set(key, [i]);
        }
    }
    key(x, y, z) {
        return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
    }
    /** Vertex ids in the cell containing the point and its 26 neighbours. */
    near(x, y, z) {
        const cx = Math.floor(x / this.cell);
        const cy = Math.floor(y / this.cell);
        const cz = Math.floor(z / this.cell);
        const out = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = this.cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (bucket)
                        out.push(...bucket);
                }
            }
        }
        return out;
    }
}
/**
 * Tissue thickness (metres) per vertex: distance along -normal to the nearest
 * opposing (back-facing) surface sample. Uses a spatial hash, so cost is
 * proportional to vertex count, not its square.
 */
export function bakeThickness(vertices) {
    const n = vertices.length;
    const out = new Float32Array(n);
    const cell = Math.max(C.thicknessMax, 1e-3);
    const grid = new VertexGrid(vertices, cell);
    const steps = 6;
    for (let i = 0; i < n; i++) {
        const v = vertices[i];
        let best = C.thicknessMax;
        for (let s = 1; s <= steps; s++) {
            const t = (C.thicknessMax * s) / steps;
            const px = v.position.x - v.normal.x * t;
            const py = v.position.y - v.normal.y * t;
            const pz = v.position.z - v.normal.z * t;
            let hit = false;
            for (const j of grid.near(px, py, pz)) {
                if (j === i)
                    continue;
                const o = vertices[j];
                // Opposing surface only: its normal must face back toward this vertex.
                if (o.normal.x * v.normal.x + o.normal.y * v.normal.y + o.normal.z * v.normal.z > -0.2) {
                    continue;
                }
                const dx = o.position.x - px;
                const dy = o.position.y - py;
                const dz = o.position.z - pz;
                if (dx * dx + dy * dy + dz * dz > cell * cell)
                    continue;
                // Distance from the original vertex to the opposing sample.
                const ox = o.position.x - v.position.x;
                const oy = o.position.y - v.position.y;
                const oz = o.position.z - v.position.z;
                const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
                if (d < best)
                    best = d;
                hit = true;
            }
            if (hit)
                break;
        }
        out[i] = clamp(best, C.thicknessMin, C.thicknessMax);
    }
    return out;
}
/** Bake both signals and interleave them for GPU upload. */
export function bakeCurvatureThickness(canonical) {
    const vertices = canonical.vertices;
    const curvature = bakeCurvature(vertices, canonical.indices);
    const thickness = bakeThickness(vertices);
    const packed = new Float32Array(vertices.length * 2);
    for (let i = 0; i < vertices.length; i++) {
        packed[i * 2] = curvature[i];
        packed[i * 2 + 1] = thickness[i];
    }
    return { curvature, thickness, packed, vertexCount: vertices.length };
}
//# sourceMappingURL=curvature-bake.js.map