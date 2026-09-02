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

export function sparseDelta(vertexId: number, dx: number, dy: number, dz: number): MorphDelta {
  return { vertexId, dx, dy, dz };
}

/**
 * Deterministic registry of shape bases. Assigns stable, monotonically increasing
 * ids in registration order and rejects duplicate names.
 */
export class ShapeBasisRegistry {
  private byId = new Map<number, ShapeBasis>();
  private byName = new Map<string, ShapeBasis>();
  private nextId = 1;

  /** Number of bases registered. */
  get size(): number {
    return this.byId.size;
  }

  /** Whether a basis name is already registered. */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Register a basis (id is auto-assigned). Throws on duplicate name. */
  register(name: string, property: string, deltas: MorphDelta[], tags?: string[]): ShapeBasis {
    if (this.byName.has(name)) throw new Error(`Shape basis already registered: ${name}`);
    const basis: ShapeBasis = { id: this.nextId++, name, property, deltas, tags };
    this.byId.set(basis.id, basis);
    this.byName.set(basis.name, basis);
    return basis;
  }

  getById(id: number): ShapeBasis | undefined {
    return this.byId.get(id);
  }

  getByName(name: string): ShapeBasis | undefined {
    return this.byName.get(name);
  }

  list(): ShapeBasis[] {
    return [...this.byId.values()];
  }

  /** Total affected vertices across all bases (localised-edit telemetry). */
  get totalAffectedVertices(): number {
    const seen = new Set<number>();
    for (const b of this.byId.values()) for (const d of b.deltas) seen.add(d.vertexId);
    return seen.size;
  }
}
