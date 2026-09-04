import { PROPERTY_CATEGORIES, } from './property.js';
const CATEGORY_SLOT_BITS = 10;
const CATEGORY_SLOT_MASK = (1 << CATEGORY_SLOT_BITS) - 1;
export function makePropertyId(category, slot) {
    return category + (slot & CATEGORY_SLOT_MASK);
}
export function propertyCategory(id) {
    return (id & ~CATEGORY_SLOT_MASK);
}
/**
 * The Human Schema Compiler. Single authoritative runtime registry of every
 * property. From descriptors we can generate:
 *   - stable numeric ids
 *   - GPU buffer offsets
 *   - default values
 *   - dependencies
 *   - identity masks
 *   - serialization / deserialization
 *
 * This is the single source of truth for the schema; WGSL layout generation
 * and layout-validation tests derive from it.
 */
export class PropertyRegistry {
    byPath = new Map();
    byId = new Map();
    slotCounters = new Map();
    /** Register descriptors, deterministic, idempotent per path. */
    register(descriptors) {
        const metas = [];
        for (const d of descriptors) {
            if (this.byPath.has(d.path)) {
                throw new Error(`Duplicate property path: ${d.path}`);
            }
            const slot = this.slotCounters.get(d.category) ?? 0;
            this.slotCounters.set(d.category, slot + 1);
            const id = makePropertyId(d.category, slot);
            const meta = {
                id,
                path: d.path,
                type: d.type,
                units: d.units,
                min: d.min,
                max: d.max,
                default: d.default,
                category: d.category,
                persistence: d.persistence,
                identityImportance: d.identityImportance ?? 0 /* IdentityImportance.None */,
                dependencies: [],
                lodImportance: d.lodImportance ?? 0,
                animationCapable: d.animationCapable ?? false,
                automationCapable: d.automationCapable ?? true,
            };
            this.byPath.set(d.path, meta);
            this.byId.set(id, meta);
            metas.push(meta);
        }
        // Resolve dependencies in a second pass so ordering is irrelevant.
        for (let i = 0; i < descriptors.length; i++) {
            const d = descriptors[i];
            const meta = metas[i];
            meta.dependencies = (d.dependencies ?? []).map((p) => this.require(p).id);
        }
        // Recompute gpu offsets after the full batch is registered.
        this.assignGpuOffsets();
        return metas;
    }
    assignGpuOffsets() {
        // Compute offsets sequentially considering 4-byte alignment for f32/u32/i32
        // and 8-byte alignment for f64. This matches WGSL structure member rules.
        // Ordering is registry insertion order (fully deterministic).
        let offset = 0;
        const sorted = [...this.byId.values()].sort((a, b) => a.id - b.id);
        for (const meta of sorted) {
            const size = meta.type === 'f64' ? 8 : meta.type === 'bool' ? 4 : 4;
            const align = size;
            offset = alignUp(offset, align);
            const start = offset;
            // One bool per f32 slot.
            offset += size;
            meta.gpuByteOffset = start;
        }
    }
    require(path) {
        const meta = this.byPath.get(path);
        if (!meta) {
            throw new Error(`Unknown property path: ${path}`);
        }
        return meta;
    }
    requireId(id) {
        const meta = this.byId.get(id);
        if (!meta) {
            throw new Error(`Unknown property id: ${id}`);
        }
        return meta;
    }
    get byPathMap() {
        return this.byPath;
    }
    get sizeBytes() {
        let offset = 0;
        for (const meta of this.byId.values()) {
            const size = meta.type === 'f64' ? 8 : 4;
            offset = alignUp(offset, size) + size;
        }
        return alignUp(offset, 16);
    }
    all() {
        return [...this.byId.values()].sort((a, b) => a.id - b.id);
    }
    /** Category display name for diagnostics. */
    categoryName(category) {
        return PROPERTY_CATEGORIES[category] ?? String(category);
    }
}
export function alignUp(value, align) {
    const rem = value % align;
    return rem === 0 ? value : value + (align - rem);
}
//# sourceMappingURL=registry.js.map