import { PropertyCategory } from '../../core/schema/property';
import { PROPERTY_CATEGORIES } from '../../core/schema/property';
import { PropertyRegistry } from '../../core/schema/registry';

export type DirtyGranularity = 'character' | 'system' | 'region' | 'vertex';

/**
 * Multiple-level invalidation model. Regions form a hierarchy from whole
 * character down to individual vertex ranges.
 */
export class DirtyRegionTracker {
  private dirty = new Set<number>(); // category ids dirty
  private systemDirty = new Set<PropertyCategory>();
  private regionIdVersion = new Map<number, number>();

  constructor(private registry: PropertyRegistry) {}

  /** Mark a single property (and its category/system) dirty. */
  touch(id: number): void {
    const meta = this.registry.requireId(id);
    this.dirty.add(meta.id);
    this.systemDirty.add(meta.category as PropertyCategory);
  }

  markVertexRegion(regionId: number): void {
    this.regionIdVersion.set(regionId, (this.regionIdVersion.get(regionId) ?? 0) + 1);
  }

  /** Is the whole character dirty? */
  get isCharacterDirty(): boolean {
    return this.systemDirty.size > 0 || this.dirty.size > 0;
  }

  isSystemDirty(category: PropertyCategory): boolean {
    return this.systemDirty.has(category);
  }

  /** Clear all dirty state (after work flushed). */
  clear(): void {
    this.dirty.clear();
    this.systemDirty.clear();
  }

  /** Snapshot of dirty category names for diagnostics. */
  describe(): string[] {
    const names: string[] = [];
    for (const cat of this.systemDirty) {
      names.push(PROPERTY_CATEGORIES[cat as number] ?? String(cat));
    }
    return names;
  }
}

export { PROPERTY_CATEGORIES, PropertyCategory };
