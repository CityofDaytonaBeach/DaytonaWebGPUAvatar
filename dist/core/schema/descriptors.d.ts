import { PropertyDescriptor, PropertyRegistry } from './registry.js';
/**
 * Default authoritative set of human properties.
 *
 * This is intentionally a representative subset to keep the first release
 * tractable while exercising the full schema pipeline (identity, anatomy,
 * performance, dependencies, GPU layout). Extend descriptors freely â€” the
 * registry derives ids, offsets, defaults and dirty masks automatically.
 */
export declare const DEFAULT_PROPERTY_DESCRIPTORS: PropertyDescriptor[];
/** A convenient prebuilt registry with the default descriptors registered. */
export declare function createDefaultRegistry(): PropertyRegistry;
//# sourceMappingURL=descriptors.d.ts.map