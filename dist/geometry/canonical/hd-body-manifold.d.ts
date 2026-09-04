import type { CanonicalTopologyVertex } from './canonical-topology.js';
/**
 * HD BODY V0.2 â€” clean-manifold parametric body.
 *
 * Replaces the disconnected-tube body (buildHdBodySkin) which self-intersected
 * heavily at rest (~11k pairs) because torso/arms/legs/feet were separate closed
 * columns fused only by concatenation. This generator computes a single united
 * *implicit* volume (union of skeleton-aligned capsules for torso, shoulders,
 * arms, hands, legs, feet) and extracts ONE watertight isosurface with
 * marching cubes (standard 256-case table) on a fixed grid.
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
    /**
     * Include the head as a term of the implicit union, so the extracted surface
     * is ONE watertight manifold from crown to feet with no body/head seam cut.
     * The eye/teeth/tongue/cavity parts stay separate — they are distinct
     * anatomy inside the skin, not a seam in it.
     */
    fuseHead?: boolean;
}
export interface BodyManifold {
    vertices: CanonicalTopologyVertex[];
    indices: Uint32Array;
}
/** Build the body: see module doc. */
export declare function buildHdBodyManifold(opts?: HdBodyManifoldOptions): BodyManifold;
//# sourceMappingURL=hd-body-manifold.d.ts.map