import type { CanonicalTopologyVertex } from './canonical-topology.js';
/**
 * HD BODY V0.2 â€” clean-manifold parametric body.
 *
 * Replaces the disconnected-tube body (buildHdBodySkin) which self-intersected
 * heavily at rest (~11k pairs) because torso/arms/legs/feet were separate closed
 * columns fused only by concatenation. This generator computes a single united
 * *implicit* volume (union of skeleton-aligned capsules for torso, shoulders,
 * arms, hands, legs, feet) and extracts ONE watertight isosurface with
 * marching-tetrahedra on a fixed grid.
 *
 * Properties:
 *   - A single closed, non-self-overlapping manifold (min-union of capsules â†’ no
 *     internal walls, no tube-vs-tube interpenetration beyond the smooth joints
 *     of the union surface). This lets the P22 hard self-intersection gate run
 *     with pairs == 0 on the body region at rest.
 *   - Fixed grid â‡’ fixed topology (vertex count + connectivity deterministic for
 *     a given resolution), so the displacement-morph pipeline keeps working:
 *     shape-space bases displace the SAME vertices.
 *   - Per-vertex SEMANTIC regions re-derived from the nearest capsule and local
 *     surface position (chest/abdomen/pelvis/back/side split), and SMOOTH
 *     skeleton skin weights via inverse-distance blending to the nearest bones â€”
 *     a genuine weight gradient (the authored-gradient requirement of item #1).
 *
 * The body occupies indices [0, bodyIndexCount) and is the FIRST segment of the
 * canonical, followed by the (unchanged) HD head skin and detail parts.
 */
export interface HdBodyManifoldOptions {
    /** Vertical (y) of the neck base just below the HD head skin's collar. */
    neckY?: number;
    /** Grid resolution along the longest (y) axis. Higher = smoother / more tris. */
    ySteps?: number;
}
export interface BodyManifold {
    vertices: CanonicalTopologyVertex[];
    indices: Uint32Array;
}
interface V3 {
    x: number;
    y: number;
    z: number;
}
interface CellVert {
    pos: V3;
    bone: string;
}
/**
 * Test helper: march an analytic unit-sphere SDF on a grid and return the welded
 * mesh. The sphere must triangulate to a watertight closed surface (Ï‡ = 2, zero
 * boundary edges); this isolates the marching-tetra extractor from the body SDF.
 */
export declare function marchingCubesProbe(n?: number, tol?: number): {
    vertices: CellVert[];
    indices: Uint32Array;
    chi: number;
    boundaryEdges: number;
    rawBoundary: number;
    rawChi: number;
    rawV: number;
};
/** Build the body: see module doc. */
export declare function buildHdBodyManifold(opts?: HdBodyManifoldOptions): BodyManifold;
export {};
//# sourceMappingURL=hd-body-manifold.d.ts.map