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
import type { CanonicalHuman, Vertex } from '../../geometry/canonical/canonical-human.js';
export interface CurvatureThicknessBake {
    /** Mean curvature per vertex, 1/metres, clamped to the shared range. */
    curvature: Float32Array;
    /** Tissue thickness per vertex, metres, clamped to the shared range. */
    thickness: Float32Array;
    /** Interleaved [curvature, thickness] pairs for direct GPU upload. */
    packed: Float32Array;
    vertexCount: number;
}
/** One-ring adjacency (vertex -> unique neighbour ids) from a triangle list. */
export declare function buildOneRing(indices: Uint32Array, vertexCount: number): Uint32Array[];
/**
 * Discrete mean curvature (1/m) per vertex from normal divergence. Isolated
 * vertices fall back to the flattest allowed curvature.
 */
export declare function bakeCurvature(vertices: readonly Vertex[], indices: Uint32Array): Float32Array;
/**
 * Tissue thickness (metres) per vertex: distance along -normal to the nearest
 * opposing (back-facing) surface sample. Uses a spatial hash, so cost is
 * proportional to vertex count, not its square.
 */
export declare function bakeThickness(vertices: readonly Vertex[]): Float32Array;
/** Bake both signals and interleave them for GPU upload. */
export declare function bakeCurvatureThickness(canonical: CanonicalHuman): CurvatureThicknessBake;
//# sourceMappingURL=curvature-bake.d.ts.map