/**
 * Stable numeric property IDs used internally for all human state access.
 *
 * IDs are never string-looked-up on the GPU. The Human Schema Compiler
 * assigns each registered property a stable numeric id. Categories map to
 * contiguous ranges so that a single id can encode both its category and
 * its slot (id = categoryBase + slot).
 */
export declare const enum PropertyCategory {
    Global = 0,
    Identity = 1024,
    Skeleton = 2048,
    Body = 3072,
    Face = 4096,
    Skin = 5120,
    Eyes = 6144,
    Hair = 7168,
    Expression = 8192,
    Animation = 9216,
    Physics = 10240,
    LOD = 11264,
    Attachment = 12288
}
export declare const PROPERTY_CATEGORIES: Readonly<Record<number, string>>;
export type PropertyType = 'f32' | 'f64' | 'u32' | 'i32' | 'bool';
export declare const enum PersistenceType {
    Identity = "identity",
    Anatomical = "anatomical",
    Cosmetic = "cosmetic",
    Performance = "performance",
    Transient = "transient"
}
export declare const enum IdentityImportance {
    None = 0,
    Low = 1,
    Medium = 2,
    High = 3,
    Critical = 4
}
export interface PropertyMeta {
    /** Stable numeric id. */
    id: number;
    /** Stable dot/path string e.g. "anatomy.face.nose.width". */
    path: string;
    type: PropertyType;
    units?: string;
    min?: number;
    max?: number;
    default: number;
    category: PropertyCategory;
    persistence: PersistenceType;
    identityImportance: IdentityImportance;
    /** Stable dependency ids that this property consumes. */
    dependencies?: number[];
    /** GPU location hint — where this lands inside the uniform/storage buffer. */
    gpuByteOffset?: number;
    lodImportance?: number;
    animationCapable?: boolean;
    automationCapable?: boolean;
}
//# sourceMappingURL=property.d.ts.map