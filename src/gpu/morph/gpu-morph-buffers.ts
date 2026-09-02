import { SparseMorph } from '../../geometry/canonical/canonical-human.js';

export interface GpuMorphLayout {
  /** Total number of (index,dx,dy,dz) entries across all morphs. */
  deltaCount: number;
  /** Per-morph: { weightByteOffset, rangeByteOffset } â€” see pack(). */
  morphs: Array<{ name: string }>;
  // Flat delta array is (u32 index, f32 dx, f32 dy, f32 dz) -> 4 x u32 slots.
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
  ranges: Array<{ start: number; count: number }>;
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
export function packSparseMorphs(morphs: SparseMorphList): PackedMorphBuffers {
  const morphOrder: string[] = [];
  const ranges: Array<{ start: number; count: number }> = [];
  const deltaQuads: Array<{ index: number; dx: number; dy: number; dz: number }> = [];

  let startSlot = 0;
  for (const morph of morphs) {
    // Sort deltas by vertex id for binary search by the GPU kernel.
    const sorted = [...morph.deltas].sort((a, b) => a.vertexId - b.vertexId);
    for (const d of sorted) {
      deltaQuads.push({ index: d.vertexId, dx: d.dx, dy: d.dy, dz: d.dz });
    }
    ranges.push({ start: startSlot, count: sorted.length });
    startSlot += sorted.length;
    morphOrder.push(morph.name);
  }

  // deltaPacked: 4 slots per quad (index, dx, dy, dz as bitcast floats).
  const deltaPacked = new Uint32Array(deltaQuads.length * 4);
  for (let i = 0; i < deltaQuads.length; i++) {
    const q = deltaQuads[i];
    deltaPacked[i * 4 + 0] = q.index;
    deltaPacked[i * 4 + 1] = f32bits(q.dx);
    deltaPacked[i * 4 + 2] = f32bits(q.dy);
    deltaPacked[i * 4 + 3] = f32bits(q.dz);
  }

  // morphStruct: per morph { weight..., offset:u32, count:u32 } â€” 4 u32 slots.
  // Slots: [0]=weight bits(padded), [1]=count, [2]=offset, [3]=unused padding.
  const morphStruct = new Uint32Array(morphOrder.length * 4);
  for (let i = 0; i < morphOrder.length; i++) {
    morphStruct[i * 4 + 0] = 0; // weight (set at dispatch time by setMorphWeights)
    morphStruct[i * 4 + 1] = ranges[i].count;
    morphStruct[i * 4 + 2] = ranges[i].start;
    morphStruct[i * 4 + 3] = 0;
  }

  return { deltaPacked, morphStruct, morphOrder, ranges };
}

/** Update the weight slot of each morph in a packed morphStruct buffer. */
export function setMorphWeights(
  morphStruct: Uint32Array,
  morphOrder: string[],
  weights: Map<string, number>,
): void {
  for (let i = 0; i < morphOrder.length; i++) {
    const w = weights.get(morphOrder[i]) ?? 0;
    morphStruct[i * 4 + 0] = f32bits(w);
  }
}

function f32bits(v: number): number {
  const buf = new Float32Array(1);
  buf[0] = v;
  return new Uint32Array(buf.buffer)[0];
}
