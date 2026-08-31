import {
  PropertyMeta,
  PropertyType,
  PropertyCategory,
  PersistenceType,
  IdentityImportance,
  PROPERTY_CATEGORIES,
} from "./property";

/**
 * PropertyDescriptor declares a schema property. The registry assigns it a
 * stable numeric id from its category's base range during registration.
 */
export interface PropertyDescriptor {
  path: string;
  type: PropertyType;
  units?: string;
  min?: number;
  max?: number;
  default: number;
  category: PropertyCategory;
  persistence: PersistenceType;
  identityImportance?: IdentityImportance;
  dependencies?: string[];
  lodImportance?: number;
  animationCapable?: boolean;
  automationCapable?: boolean;
}

const CATEGORY_SLOT_BITS = 10;
const CATEGORY_SLOT_MASK = (1 << CATEGORY_SLOT_BITS) - 1;

export function makePropertyId(category: PropertyCategory, slot: number): number {
  return category + (slot & CATEGORY_SLOT_MASK);
}

export function propertyCategory(id: number): PropertyCategory {
  return (id & ~CATEGORY_SLOT_MASK) as PropertyCategory;
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
  private byPath = new Map<string, PropertyMeta>();
  private byId = new Map<number, PropertyMeta>();
  private slotCounters = new Map<PropertyCategory, number>();

  /** Register descriptors, deterministic, idempotent per path. */
  register(descriptors: PropertyDescriptor[]): PropertyMeta[] {
    const metas: PropertyMeta[] = [];
    for (const d of descriptors) {
      if (this.byPath.has(d.path)) {
        throw new Error(`Duplicate property path: ${d.path}`);
      }
      const slot = this.slotCounters.get(d.category) ?? 0;
      this.slotCounters.set(d.category, slot + 1);
      const id = makePropertyId(d.category, slot);
      const meta: PropertyMeta = {
        id,
        path: d.path,
        type: d.type,
        units: d.units,
        min: d.min,
        max: d.max,
        default: d.default,
        category: d.category,
        persistence: d.persistence,
        identityImportance: d.identityImportance ?? IdentityImportance.None,
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

  private assignGpuOffsets() {
    // Compute offsets sequentially considering 4-byte alignment for f32/u32/i32
    // and 8-byte alignment for f64. This matches WGSL structure member rules.
    // Ordering is registry insertion order (fully deterministic).
    let offset = 0;
    const sorted = [...this.byId.values()].sort((a, b) => a.id - b.id);
    for (const meta of sorted) {
      const size = meta.type === "f64" ? 8 : meta.type === "bool" ? 4 : 4;
      const align = size;
      offset = alignUp(offset, align);
      const start = offset;
      // One bool per f32 slot.
      offset += size;
      meta.gpuByteOffset = start;
    }
  }

  require(path: string): PropertyMeta {
    const meta = this.byPath.get(path);
    if (!meta) {
      throw new Error(`Unknown property path: ${path}`);
    }
    return meta;
  }

  requireId(id: number): PropertyMeta {
    const meta = this.byId.get(id);
    if (!meta) {
      throw new Error(`Unknown property id: ${id}`);
    }
    return meta;
  }

  get byPathMap(): ReadonlyMap<string, PropertyMeta> {
    return this.byPath;
  }

  get sizeBytes(): number {
    let offset = 0;
    for (const meta of this.byId.values()) {
      const size = meta.type === "f64" ? 8 : 4;
      offset = alignUp(offset, size) + size;
    }
    return alignUp(offset, 16);
  }

  all(): PropertyMeta[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** Category display name for diagnostics. */
  categoryName(category: PropertyCategory): string {
    return PROPERTY_CATEGORIES[category] ?? String(category);
  }
}

export function alignUp(value: number, align: number): number {
  const rem = value % align;
  return rem === 0 ? value : value + (align - rem);
}
