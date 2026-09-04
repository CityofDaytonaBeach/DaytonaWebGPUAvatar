import { CanonicalHuman } from './canonical-human.js';
export interface SelfIntersectionReport {
    /** Number of triangles that collapsed to a degenerate (near-zero) area. */
    degenerateCount: number;
    /** Number of explicit triangle-triangle interpenetrations found. */
    intersectingPairs: number;
    /** First offending pair of triangle ids, if any (for debugging). */
    firstPair: [number, number] | null;
    readonly valid: boolean;
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
 * vertices all lie in the listed regions. `triangleRange` optionally restricts
 * to a contiguous triangle-id range `[start, end)` (used to isolate the leading
 * body segment of the canonical mesh). When both are supplied they are ANDed.
 */
export interface IntersectionScope {
    regionScope?: ReadonlySet<string>;
    triangleRange?: [number, number];
}
export declare class MeshIntersectionAnalyzer {
    private readonly triId;
    private readonly triVertex;
    private readonly triBaseArea;
    /**
     * For each analyzed triangle, the original triangle ids sharing a vertex.
     * Two triangles that share geometry are legitimate neighbours and are never
     * treated as a self-intersection.
     */
    private readonly triNeighbors;
    constructor(canonical: CanonicalHuman, scope?: IntersectionScope);
    get triangleCount(): number;
    analyze(positions: Float32Array, maxPairs?: number): SelfIntersectionReport;
    private cellSize;
}
//# sourceMappingURL=intersection.d.ts.map