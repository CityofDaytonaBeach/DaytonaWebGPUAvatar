import { CanonicalHuman, RegionName, MorphDelta } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { ShapeBasis, ShapeBasisRegistry } from './shape-basis.js';

export type VertexDeltaFn = (
  vx: number,
  vy: number,
  vz: number,
) => { dx: number; dy: number; dz: number };

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
  readonly bases = new ShapeBasisRegistry();
  private coefficients = new Map<number, number>();

  constructor(readonly base: CanonicalHuman) {}

  /** Register a shape basis over an entire semantic region. */
  addRegionBasis(
    name: string,
    property: string,
    region: RegionName,
    deltaFn: VertexDeltaFn,
    tags?: string[],
  ): ShapeBasis {
    const range = this.base.regionRanges.get(region);
    if (!range) throw new Error(`Unknown region: ${region}`);
    const deltas: MorphDelta[] = [];
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
  addVertexBasis(
    name: string,
    property: string,
    vertexIds: number[],
    deltaFn: VertexDeltaFn,
    tags?: string[],
  ): ShapeBasis {
    const deltas: MorphDelta[] = [];
    for (const id of vertexIds) {
      const v = this.base.vertices[id];
      if (!v) continue;
      const d = deltaFn(v.position.x, v.position.y, v.position.z);
      if (Math.abs(d.dx) + Math.abs(d.dy) + Math.abs(d.dz) > 1e-6) {
        deltas.push({ vertexId: id, dx: d.dx, dy: d.dy, dz: d.dz });
      }
    }
    return this.bases.register(name, property, deltas, tags);
  }

  /** Register a basis from raw precomputed sparse deltas (e.g. authored data). */
  addRawBasis(name: string, property: string, deltas: MorphDelta[], tags?: string[]): ShapeBasis {
    return this.bases.register(name, property, deltas, tags);
  }

  setCoefficient(basisId: number, coeff: number): void {
    this.coefficients.set(basisId, coeff);
  }

  coefficient(basisId: number): number {
    return this.coefficients.get(basisId) ?? 0;
  }

  clearCoefficients(): void {
    this.coefficients.clear();
  }

  /**
   * Evaluate the linear shape-space contribution for the given full coefficient
   * map. Returns a dense per-vertex delta array (length vertexCount*3), which is
   * sparse in practice: unaffected vertices stay 0.
   */
  evaluate(coeffs: Map<number, number> = this.coefficients): Float32Array {
    const out = new Float32Array(this.base.vertexCount * 3);
    for (const [basisId, coeff] of coeffs) {
      if (!coeff) continue;
      const basis = this.bases.getById(basisId);
      if (!basis) continue;
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
  affectedVertexIds(coeffs: Map<number, number> = this.coefficients): Set<number> {
    const out = new Set<number>();
    for (const [basisId, coeff] of coeffs) {
      if (!coeff) continue;
      const basis = this.bases.getById(basisId);
      if (!basis) continue;
      for (const d of basis.deltas) out.add(d.vertexId);
    }
    return out;
  }

  /**
   * Compile registered shape bases into the existing sparse morph set so the
   * existing GPU morph pipeline (packSparseMorphs -> GpuMorphDeform) consumes
   * them without any new infrastructure. The optional `prefix` names each morph.
   */
  compileToSparseMorphs(sink: SparseMorphSet, prefix = 'shape_'): void {
    for (const basis of this.bases.list()) {
      sink.addRaw(`${prefix}${basis.name}`, basis.deltas);
    }
  }
}
