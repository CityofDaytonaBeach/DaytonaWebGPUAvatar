export function sparseDelta(vertexId, dx, dy, dz) {
    return { vertexId, dx, dy, dz };
}
/**
 * Deterministic registry of shape bases. Assigns stable, monotonically increasing
 * ids in registration order and rejects duplicate names.
 */
export class ShapeBasisRegistry {
    byId = new Map();
    byName = new Map();
    nextId = 1;
    /** Number of bases registered. */
    get size() {
        return this.byId.size;
    }
    /** Whether a basis name is already registered. */
    has(name) {
        return this.byName.has(name);
    }
    /** Register a basis (id is auto-assigned). Throws on duplicate name. */
    register(name, property, deltas, tags) {
        if (this.byName.has(name))
            throw new Error(`Shape basis already registered: ${name}`);
        const basis = { id: this.nextId++, name, property, deltas, tags };
        this.byId.set(basis.id, basis);
        this.byName.set(basis.name, basis);
        return basis;
    }
    getById(id) {
        return this.byId.get(id);
    }
    getByName(name) {
        return this.byName.get(name);
    }
    list() {
        return [...this.byId.values()];
    }
    /** Total affected vertices across all bases (localised-edit telemetry). */
    get totalAffectedVertices() {
        const seen = new Set();
        for (const b of this.byId.values())
            for (const d of b.deltas)
                seen.add(d.vertexId);
        return seen.size;
    }
}
//# sourceMappingURL=shape-basis.js.map