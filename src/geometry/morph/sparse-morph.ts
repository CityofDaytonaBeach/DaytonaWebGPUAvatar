import { CanonicalHuman, RegionName, SparseMorph, MorphDelta } from '../canonical/canonical-human';

/**
 * Sparse Morph Set.
 *
 * Morphs store deltas only for the vertices they actually affect (region),
 * never for the whole mesh. This is the core compaction concept from the spec.
 * The GPU decompresses these directly.
 */
export class SparseMorphSet {
  readonly byName = new Map<string, SparseMorph>();

  constructor(private canonical: CanonicalHuman) {}

  /** Register a morph over a region with a user-supplied delta function. */
  add(
    name: string,
    region: RegionName,
    deltaFn: (vx: number, vy: number, vz: number) => { dx: number; dy: number; dz: number },
  ): void {
    const range = this.canonical.regionRanges.get(region);
    if (!range) {
      throw new Error(`Unknown region: ${region}`);
    }
    const deltas: MorphDelta[] = [];
    for (let i = range.start; i < range.start + range.count; i++) {
      const v = this.canonical.vertices[i];
      const d = deltaFn(v.position.x, v.position.y, v.position.z);
      // Only add a delta if it moves the vertex (keeps morph sparse).
      if (Math.abs(d.dx) + Math.abs(d.dy) + Math.abs(d.dz) > 1e-6) {
        deltas.push({ vertexId: i, dx: d.dx, dy: d.dy, dz: d.dz });
      }
    }
    this.byName.set(name, { name, deltas });
  }

  get(name: string): SparseMorph | undefined {
    return this.byName.get(name);
  }

  /** Total delta count across all morphs (a memory metric for telemetry). */
  get totalDeltaCount(): number {
    let n = 0;
    for (const m of this.byName.values()) n += m.deltas.length;
    return n;
  }

  /** Cache-friendly delta lookup keyed by vertex for accumulation. */
  applyMask(morphName: string, weight: number, out: Float32Array, strides = 3): void {
    const morph = this.byName.get(morphName);
    if (!morph || weight === 0) return;
    for (const d of morph.deltas) {
      const off = d.vertexId * strides;
      out[off + 0] += d.dx * weight;
      out[off + 1] += d.dy * weight;
      out[off + 2] += d.dz * weight;
    }
  }
}
