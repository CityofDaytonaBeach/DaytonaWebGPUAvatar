import { SparseMorph } from '../../geometry/canonical/canonical-human.js';
export interface GpuMorphLayout {
    /** Total number of (index,dx,dy,dz) entries across all morphs. */
    deltaCount: number;
    /** Per-morph: { weightByteOffset, rangeByteOffset } â€” see pack(). */
    morphs: Array<{
        name: string;
    }>;
    deltaArrayBytes: number;
    morphArrayBytes: number;
}
export interface PackedMorphBuffers {
    /** array<u32> packed as index,dx,dy,dz quads (16 bytes per delta). */
    deltaPacked: Uint32Array;
    /** Per morph: { weight:f32(pad 12), offset:u32, count:u32 } struct (16 bytes). */
    morphStruct: Uint32Array;
    /** Sorted list of morph names matching morphStruct order (== morph order). */
    morphOrder: string[];
    /** Range of each morph in deltaPacked (delta-slot index start,count). */
    ranges: Array<{
        start: number;
        count: number;
    }>;
}
type SparseMorphList = ReadonlyArray<SparseMorph>;
/**
 * Packs sparse morphs into tightly packed GPU-friendly buffers.
 *
 * Each morph's deltas are sorted by vertex id so a per-vertex gather kernel can
 * binary-search. Deltas are stored as 4-component quads (index + dx,dy,dz) for
 * ideal storage alignment. This is a lossless compact representation â€” only the
 * affected vertices of each morph appear, never the whole mesh.
 */
export declare function packSparseMorphs(morphs: SparseMorphList): PackedMorphBuffers;
/** Update the weight slot of each morph in a packed morphStruct buffer. */
export declare function setMorphWeights(morphStruct: Uint32Array, morphOrder: string[], weights: Map<string, number>): void;
export {};
//# sourceMappingURL=gpu-morph-buffers.d.ts.map