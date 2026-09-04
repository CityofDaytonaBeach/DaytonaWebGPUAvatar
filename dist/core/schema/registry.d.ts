import { PropertyMeta, PropertyType, PropertyCategory, PersistenceType, IdentityImportance } from './property.js';
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
export declare function makePropertyId(category: PropertyCategory, slot: number): number;
export declare function propertyCategory(id: number): PropertyCategory;
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
export declare class PropertyRegistry {
    private byPath;
    private byId;
    private slotCounters;
    /** Register descriptors, deterministic, idempotent per path. */
    register(descriptors: PropertyDescriptor[]): PropertyMeta[];
    private assignGpuOffsets;
    require(path: string): PropertyMeta;
    requireId(id: number): PropertyMeta;
    get byPathMap(): ReadonlyMap<string, PropertyMeta>;
    get sizeBytes(): number;
    all(): PropertyMeta[];
    /** Category display name for diagnostics. */
    categoryName(category: PropertyCategory): string;
}
export declare function alignUp(value: number, align: number): number;
//# sourceMappingURL=registry.d.ts.map