import { CanonicalHuman, RegionName, SparseMorph, MorphDelta } from '../canonical/canonical-human.js';
/**
 * Sparse Morph Set.
 *
 * Morphs store deltas only for the vertices they actually affect (region),
 * never for the whole mesh. This is the core compaction concept from the spec.
 * The GPU decompresses these directly.
 */
export declare class SparseMorphSet {
    private canonical;
    readonly byName: Map<string, SparseMorph>;
    constructor(canonical: CanonicalHuman);
    /** Register a morph over a region with a user-supplied delta function. */
    add(name: string, region: RegionName, deltaFn: (vx: number, vy: number, vz: number) => {
        dx: number;
        dy: number;
        dz: number;
    }): void;
    /**
     * Register a morph from precomputed sparse deltas (e.g. compiled shape bases
     * or authored data). Deltas must reference stable vertex ids. This is the
     * insertion point the Human Shape Space uses to feed the existing GPU morph
     * pipeline without changing its transport.
     */
    addRaw(name: string, deltas: MorphDelta[]): void;
    get(name: string): SparseMorph | undefined;
    /** Total delta count across all morphs (a memory metric for telemetry). */
    get totalDeltaCount(): number;
    /** Cache-friendly delta lookup keyed by vertex for accumulation. */
    applyMask(morphName: string, weight: number, out: Float32Array, strides?: number): void;
}
//# sourceMappingURL=sparse-morph.d.ts.map