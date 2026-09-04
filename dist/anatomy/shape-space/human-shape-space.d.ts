import { CanonicalHuman, RegionName, MorphDelta } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { ShapeBasis, ShapeBasisRegistry } from './shape-basis.js';
export type VertexDeltaFn = (vx: number, vy: number, vz: number) => {
    dx: number;
    dy: number;
    dz: number;
};
/**
 * Human Shape Space V0.1.
 *
 * Treats semantic identity controls as sparse, reusable shape bases with scalar
 * coefficients rather than simplistic per-vertex scaling. This is the source of
 * truth for the linear part of the deformation:
 *
 *   Pfinal = Pbase + Σ(Basis_i × coefficient_i)
 *
 * Corrective (correlated) deformation is layered on top by CorrectiveShapeSolver
 * out of this same class's bases.
 */
export declare class HumanShapeSpace {
    readonly base: CanonicalHuman;
    readonly bases: ShapeBasisRegistry;
    private coefficients;
    constructor(base: CanonicalHuman);
    /** Register a shape basis over an entire semantic region. */
    addRegionBasis(name: string, property: string, region: RegionName, deltaFn: VertexDeltaFn, tags?: string[]): ShapeBasis;
    /** Register a shape basis over an explicit set of stable vertex ids. */
    addVertexBasis(name: string, property: string, vertexIds: number[], deltaFn: VertexDeltaFn, tags?: string[]): ShapeBasis;
    /** Register a basis from raw precomputed sparse deltas (e.g. authored data). */
    addRawBasis(name: string, property: string, deltas: MorphDelta[], tags?: string[]): ShapeBasis;
    setCoefficient(basisId: number, coeff: number): void;
    coefficient(basisId: number): number;
    clearCoefficients(): void;
    /**
     * Evaluate the linear shape-space contribution for the given full coefficient
     * map. Returns a dense per-vertex delta array (length vertexCount*3), which is
     * sparse in practice: unaffected vertices stay 0.
     */
    evaluate(coeffs?: Map<number, number>): Float32Array;
    /** The set of vertex ids visibly affected by the given coefficient map. */
    affectedVertexIds(coeffs?: Map<number, number>): Set<number>;
    /**
     * Compile registered shape bases into the existing sparse morph set so the
     * existing GPU morph pipeline (packSparseMorphs -> GpuMorphDeform) consumes
     * them without any new infrastructure. The optional `prefix` names each morph.
     */
    compileToSparseMorphs(sink: SparseMorphSet, prefix?: string): void;
}
//# sourceMappingURL=human-shape-space.d.ts.map