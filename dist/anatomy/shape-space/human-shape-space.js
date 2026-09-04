import { ShapeBasisRegistry } from './shape-basis.js';
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
export class HumanShapeSpace {
    base;
    bases = new ShapeBasisRegistry();
    coefficients = new Map();
    constructor(base) {
        this.base = base;
    }
    /** Register a shape basis over an entire semantic region. */
    addRegionBasis(name, property, region, deltaFn, tags) {
        const range = this.base.regionRanges.get(region);
        if (!range)
            throw new Error(`Unknown region: ${region}`);
        const deltas = [];
        for (let i = range.start; i < range.start + range.count; i++) {
            const v = this.base.vertices[i];
            const d = deltaFn(v.position.x, v.position.y, v.position.z);
            if (Math.abs(d.dx) + Math.abs(d.dy) + Math.abs(d.dz) > 1e-6) {
                deltas.push({ vertexId: i, dx: d.dx, dy: d.dy, dz: d.dz });
            }
        }
        return this.bases.register(name, property, deltas, tags);
    }
    /** Register a shape basis over an explicit set of stable vertex ids. */
    addVertexBasis(name, property, vertexIds, deltaFn, tags) {
        const deltas = [];
        for (const id of vertexIds) {
            const v = this.base.vertices[id];
            if (!v)
                continue;
            const d = deltaFn(v.position.x, v.position.y, v.position.z);
            if (Math.abs(d.dx) + Math.abs(d.dy) + Math.abs(d.dz) > 1e-6) {
                deltas.push({ vertexId: id, dx: d.dx, dy: d.dy, dz: d.dz });
            }
        }
        return this.bases.register(name, property, deltas, tags);
    }
    /** Register a basis from raw precomputed sparse deltas (e.g. authored data). */
    addRawBasis(name, property, deltas, tags) {
        return this.bases.register(name, property, deltas, tags);
    }
    setCoefficient(basisId, coeff) {
        this.coefficients.set(basisId, coeff);
    }
    coefficient(basisId) {
        return this.coefficients.get(basisId) ?? 0;
    }
    clearCoefficients() {
        this.coefficients.clear();
    }
    /**
     * Evaluate the linear shape-space contribution for the given full coefficient
     * map. Returns a dense per-vertex delta array (length vertexCount*3), which is
     * sparse in practice: unaffected vertices stay 0.
     */
    evaluate(coeffs = this.coefficients) {
        const out = new Float32Array(this.base.vertexCount * 3);
        for (const [basisId, coeff] of coeffs) {
            if (!coeff)
                continue;
            const basis = this.bases.getById(basisId);
            if (!basis)
                continue;
            for (const d of basis.deltas) {
                const off = d.vertexId * 3;
                out[off + 0] += d.dx * coeff;
                out[off + 1] += d.dy * coeff;
                out[off + 2] += d.dz * coeff;
            }
        }
        return out;
    }
    /** The set of vertex ids visibly affected by the given coefficient map. */
    affectedVertexIds(coeffs = this.coefficients) {
        const out = new Set();
        for (const [basisId, coeff] of coeffs) {
            if (!coeff)
                continue;
            const basis = this.bases.getById(basisId);
            if (!basis)
                continue;
            for (const d of basis.deltas)
                out.add(d.vertexId);
        }
        return out;
    }
    /**
     * Compile registered shape bases into the existing sparse morph set so the
     * existing GPU morph pipeline (packSparseMorphs -> GpuMorphDeform) consumes
     * them without any new infrastructure. The optional `prefix` names each morph.
     */
    compileToSparseMorphs(sink, prefix = 'shape_') {
        for (const basis of this.bases.list()) {
            sink.addRaw(`${prefix}${basis.name}`, basis.deltas);
        }
    }
}
//# sourceMappingURL=human-shape-space.js.map