/**
 * A versioned Human Definition (HDL). This is the persistent source-of-truth
 * structured state of a character. It holds only semantic parameter values â€”
 * never final mesh geometry. All modifications are recorded transactionally so
 * the definition can be reconstructed deterministically from events.
 */
export class HumanDefinition {
    registry;
    version = '1.0';
    values = new Map();
    constructor(registry, seed) {
        this.registry = registry;
        for (const meta of registry.all()) {
            this.values.set(meta.id, meta.default);
        }
        if (seed) {
            for (const [path, value] of Object.entries(seed)) {
                this.set(path, value);
            }
        }
    }
    get registryRef() {
        return this.registry;
    }
    /** Current value of a property by path, validated & clamped. */
    get(path) {
        const meta = this.registry.require(path);
        return this.values.get(meta.id) ?? meta.default;
    }
    /** Current value of a property by numeric id. */
    getById(id) {
        const meta = this.registry.requireId(id);
        return this.values.get(id) ?? meta.default;
    }
    /** Set a value, clamped into range and typed. Returns previous value. */
    set(path, value) {
        return this.setById(this.registry.require(path).id, value);
    }
    /** Set a value by numeric id, clamped into range. Returns previous value. */
    setById(id, value) {
        if (value === undefined || Number.isNaN(value)) {
            throw new Error(`Invalid value for property ${id}`);
        }
        const meta = this.registry.requireId(id);
        const prev = this.values.get(id);
        let next = value;
        if (meta.min !== undefined)
            next = Math.max(next, meta.min);
        if (meta.max !== undefined)
            next = Math.min(next, meta.max);
        if (meta.type === 'u32' || meta.type === 'i32')
            next = Math.round(next);
        this.values.set(id, next);
        return prev;
    }
    /** Multiply an existing property value (non-destructive adjust). */
    adjust(path, factor) {
        const current = this.get(path);
        return this.set(path, current * factor);
    }
    /** Snapshot the full definition as a plain record keyed by path. */
    serialize() {
        const out = {};
        for (const meta of this.registry.all()) {
            out[meta.path] = this.values.get(meta.id) ?? meta.default;
        }
        return out;
    }
    /** JSON-serializable versioned document. */
    toJSON() {
        return {
            version: this.version,
            identity: { id: this.get('identity.id'), seed: this.get('identity.seed') },
            anatomy: this.serialize(),
        };
    }
    /** Deep clone so timelines/snapshots never share mutable state. */
    clone() {
        const next = new HumanDefinition(this.registry);
        next.values = new Map(this.values);
        return next;
    }
    /** Apply a partial patch to this definition (returns affected property ids). */
    patch(patch) {
        const affected = [];
        for (const [path, value] of Object.entries(patch)) {
            const meta = this.registry.require(path);
            this.setById(meta.id, value);
            affected.push(meta.id);
        }
        return affected;
    }
    /** Write the current values into a Float32Array positioned by gpuByteOffset. */
    writeToBuffer(target) {
        for (const meta of this.registry.all()) {
            if (meta.gpuByteOffset === undefined)
                continue;
            target[meta.gpuByteOffset / 4] = this.values.get(meta.id) ?? meta.default;
        }
    }
}
//# sourceMappingURL=human-definition.js.map