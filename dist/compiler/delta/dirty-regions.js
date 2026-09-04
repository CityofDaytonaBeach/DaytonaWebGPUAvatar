import { PROPERTY_CATEGORIES } from '../../core/schema/property.js';
/**
 * Multiple-level invalidation model. Regions form a hierarchy from whole
 * character down to individual vertex ranges.
 */
export class DirtyRegionTracker {
    registry;
    dirty = new Set(); // category ids dirty
    systemDirty = new Set();
    regionIdVersion = new Map();
    constructor(registry) {
        this.registry = registry;
    }
    /** Mark a single property (and its category/system) dirty. */
    touch(id) {
        const meta = this.registry.requireId(id);
        this.dirty.add(meta.id);
        this.systemDirty.add(meta.category);
    }
    markVertexRegion(regionId) {
        this.regionIdVersion.set(regionId, (this.regionIdVersion.get(regionId) ?? 0) + 1);
    }
    /** Is the whole character dirty? */
    get isCharacterDirty() {
        return this.systemDirty.size > 0 || this.dirty.size > 0;
    }
    isSystemDirty(category) {
        return this.systemDirty.has(category);
    }
    /** Clear all dirty state (after work flushed). */
    clear() {
        this.dirty.clear();
        this.systemDirty.clear();
    }
    /** Snapshot of dirty category names for diagnostics. */
    describe() {
        const names = [];
        for (const cat of this.systemDirty) {
            names.push(PROPERTY_CATEGORIES[cat] ?? String(cat));
        }
        return names;
    }
}
export { PROPERTY_CATEGORIES };
//# sourceMappingURL=dirty-regions.js.map