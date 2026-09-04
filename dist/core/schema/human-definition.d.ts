import { PropertyRegistry } from './registry.js';
export type PrimitiveValue = number;
/**
 * A versioned Human Definition (HDL). This is the persistent source-of-truth
 * structured state of a character. It holds only semantic parameter values â€”
 * never final mesh geometry. All modifications are recorded transactionally so
 * the definition can be reconstructed deterministically from events.
 */
export declare class HumanDefinition {
    private registry;
    readonly version = "1.0";
    private values;
    constructor(registry: PropertyRegistry, seed?: Record<string, PrimitiveValue>);
    get registryRef(): PropertyRegistry;
    /** Current value of a property by path, validated & clamped. */
    get(path: string): PrimitiveValue;
    /** Current value of a property by numeric id. */
    getById(id: number): PrimitiveValue;
    /** Set a value, clamped into range and typed. Returns previous value. */
    set(path: string, value: PrimitiveValue): PrimitiveValue | undefined;
    /** Set a value by numeric id, clamped into range. Returns previous value. */
    setById(id: number, value: PrimitiveValue): PrimitiveValue | undefined;
    /** Multiply an existing property value (non-destructive adjust). */
    adjust(path: string, factor: number): PrimitiveValue | undefined;
    /** Snapshot the full definition as a plain record keyed by path. */
    serialize(): Record<string, PrimitiveValue>;
    /** JSON-serializable versioned document. */
    toJSON(): Record<string, unknown>;
    /** Deep clone so timelines/snapshots never share mutable state. */
    clone(): HumanDefinition;
    /** Apply a partial patch to this definition (returns affected property ids). */
    patch(patch: Record<string, PrimitiveValue>): number[];
    /** Write the current values into a Float32Array positioned by gpuByteOffset. */
    writeToBuffer(target: Float32Array): void;
}
//# sourceMappingURL=human-definition.d.ts.map