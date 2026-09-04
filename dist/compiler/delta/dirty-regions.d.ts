import { PropertyCategory } from '../../core/schema/property.js';
import { PROPERTY_CATEGORIES } from '../../core/schema/property.js';
import { PropertyRegistry } from '../../core/schema/registry.js';
export type DirtyGranularity = 'character' | 'system' | 'region' | 'vertex';
/**
 * Multiple-level invalidation model. Regions form a hierarchy from whole
 * character down to individual vertex ranges.
 */
export declare class DirtyRegionTracker {
    private registry;
    private dirty;
    private systemDirty;
    private regionIdVersion;
    constructor(registry: PropertyRegistry);
    /** Mark a single property (and its category/system) dirty. */
    touch(id: number): void;
    markVertexRegion(regionId: number): void;
    /** Is the whole character dirty? */
    get isCharacterDirty(): boolean;
    isSystemDirty(category: PropertyCategory): boolean;
    /** Clear all dirty state (after work flushed). */
    clear(): void;
    /** Snapshot of dirty category names for diagnostics. */
    describe(): string[];
}
export { PROPERTY_CATEGORIES, PropertyCategory };
//# sourceMappingURL=dirty-regions.d.ts.map