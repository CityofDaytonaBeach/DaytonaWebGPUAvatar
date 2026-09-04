import { MorphDelta } from '../../geometry/canonical/canonical-human.js';
/**
 * A shape basis is a reusable, sparse per-vertex displacement applied on top of
 * the base canonical human. Conceptually:
 *
 *   Pfinal = Pbase + Σ(Basis_i × coefficient_i) + Σ(Corrective_i × activation_i)
 *
 * Bases intentionally store only the vertices they affect (sparse), so localised
 * edits compile into minimal GPU work when registered into the sparse morph set.
 */
export interface ShapeBasis {
    /** Stable basis id (assigned by the registry). */
    id: number;
    /** Semantic property path this basis responds to, e.g. "face.nose.width". */
    property: string;
    /** Stable basis name, e.g. "NoseWidthBasis". */
    name: string;
    /** Sparse per-vertex displacement list (relative to base). */
    deltas: MorphDelta[];
    /** Free-form telemetry/demo tags (e.g. "nose", "correlated"). */
    tags?: string[];
}
export declare function sparseDelta(vertexId: number, dx: number, dy: number, dz: number): MorphDelta;
/**
 * Deterministic registry of shape bases. Assigns stable, monotonically increasing
 * ids in registration order and rejects duplicate names.
 */
export declare class ShapeBasisRegistry {
    private byId;
    private byName;
    private nextId;
    /** Number of bases registered. */
    get size(): number;
    /** Whether a basis name is already registered. */
    has(name: string): boolean;
    /** Register a basis (id is auto-assigned). Throws on duplicate name. */
    register(name: string, property: string, deltas: MorphDelta[], tags?: string[]): ShapeBasis;
    getById(id: number): ShapeBasis | undefined;
    getByName(name: string): ShapeBasis | undefined;
    list(): ShapeBasis[];
    /** Total affected vertices across all bases (localised-edit telemetry). */
    get totalAffectedVertices(): number;
}
//# sourceMappingURL=shape-basis.d.ts.map