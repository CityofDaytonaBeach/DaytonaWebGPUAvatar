import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../../core/schema/descriptors";
import { HumanDefinition } from "../../core/schema/human-definition";
import { CanonicalHuman } from "../../geometry/canonical/canonical-human";
import { SparseMorphSet } from "../../geometry/morph/sparse-morph";
import { MorphDriver } from "../../geometry/morph/morph-driver";
import { MorphKernel } from "../../gpu/kernels/morph-kernel";
import { packSparseMorphs, setMorphWeights, PackedMorphBuffers } from "./gpu-morph-buffers";
import { MORPH_COMPUTE_WGSL } from "../../render/wgsl/morph-wgsl";

const BONES = ["root", "pelvis", "spine_01", "spine_02", "chest", "neck", "head"];

function makeCharacter() {
  const canonical = new CanonicalHuman(BONES);
  const registry = createDefaultRegistry();
  const definition = new HumanDefinition(registry);
  const morphs = new SparseMorphSet(canonical);
  morphs.add("noseWidth", "nose", (vx) => ({ dx: Math.sign(vx) * 0.03, dy: 0, dz: 0 }));
  morphs.add("jawWidth", "jaw", (vx) => ({ dx: Math.sign(vx) * 0.05, dy: 0, dz: 0 }));
  morphs.add("muscularity", "torso", (_vx, vy) => {
    const up = 1 + (vy - 1.5) * 0.5;
    return { dx: 0, dy: 0, dz: up * 0.05 * Math.sign(_vx) };
  });
  const driver = new MorphDriver(registry);
  const kernel = new MorphKernel(morphs, driver);
  const { positions } = baseGeometry(canonical);
  return { canonical, registry, definition, morphs, driver, kernel, positions };
}

function baseGeometry(canonical: CanonicalHuman): { positions: Float32Array } {
  const n = canonical.vertexCount;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3 + 0] = canonical.vertices[i].position.x;
    positions[i * 3 + 1] = canonical.vertices[i].position.y;
    positions[i * 3 + 2] = canonical.vertices[i].position.z;
  }
  return { positions };
}

/** Faithful CPU port of the WGSL kernel (per-vertex binary-search gather). */
function simulateGpuKernel(base: Float32Array, packed: PackedMorphBuffers): Float32Array {
  const vcount = base.length / 3;
  const out = base.slice();
  for (let v = 0; v < vcount; v++) {
    let sumX = out[v * 3 + 0];
    let sumY = out[v * 3 + 1];
    let sumZ = out[v * 3 + 2];
    const sumBaseX = sumX, sumBaseY = sumY, sumBaseZ = sumZ; // deltas only
    void sumBaseX; void sumBaseY; void sumBaseZ;
    let dx = 0, dy = 0, dz = 0;
    for (let m = 0; m < packed.morphOrder.length; m++) {
      const meta = packed.morphStruct[m * 4];
      const weight = bitsToFloat(meta);
      const count = packed.morphStruct[m * 4 + 1];
      const start = packed.morphStruct[m * 4 + 2];
      if (count === 0) continue;
      let lo = 0, hi = count;
      while (lo < hi) {
        const mid = lo + ((hi - lo) >> 1);
        const idx = packed.deltaPacked[(start + mid) * 4 + 0];
        if (idx < v) lo = mid + 1;
        else hi = mid;
      }
      if (lo < count && packed.deltaPacked[(start + lo) * 4 + 0] === v) {
        const q = (start + lo) * 4;
        dx += weight * bitsToFloat(packed.deltaPacked[q + 1]);
        dy += weight * bitsToFloat(packed.deltaPacked[q + 2]);
        dz += weight * bitsToFloat(packed.deltaPacked[q + 3]);
      }
    }
    out[v * 3 + 0] = sumX + dx;
    out[v * 3 + 1] = sumY + dy;
    out[v * 3 + 2] = sumZ + dz;
  }
  return out;
}

function bitsToFloat(bits: number): number {
  const f = new Float32Array(1);
  new Uint32Array(f.buffer)[0] = bits >>> 0;
  return f[0];
}

describe("packSparseMorphs", () => {
  it("sorts deltas by vertex within each morph", () => {
    const { morphs } = makeCharacter();
    const packed = packSparseMorphs([...morphs.byName.values()]);
    const nose = packed.ranges[0];
    for (let i = nose.start; i < nose.start + nose.count - 1; i++) {
      expect(packed.deltaPacked[i * 4] < packed.deltaPacked[(i + 1) * 4]).toBe(true);
    }
  });

  it("records per-morph ranges and total delta count", () => {
    const { morphs } = makeCharacter();
    const packed = packSparseMorphs([...morphs.byName.values()]);
    let total = 0;
    for (const r of packed.ranges) total += r.count;
    expect(total).toBe(packed.deltaPacked.length / 4);
    expect(total).toBeGreaterThan(0);
  });

  it("setMorphWeights writes bit-cast weights into the weight slot", () => {
    const { morphs, driver, definition } = makeCharacter();
    const packed = packSparseMorphs([...morphs.byName.values()]);
    const struct = new Uint32Array(packed.morphStruct);
    const weights = new Map<string, number>();
    for (const name of packed.morphOrder) weights.set(name, driver.weight(definition, name));
    setMorphWeights(struct, packed.morphOrder, weights);
    for (let m = 0; m < packed.morphOrder.length; m++) {
      const expected = weights.get(packed.morphOrder[m]) ?? 0;
      expect(bitsToFloat(struct[m * 4])).toBeCloseTo(expected, 5);
    }
  });
});

describe("GPU/CPU morph parity", () => {
  it("simulated WGSL kernel output equals CPU MorphKernel.accumulate", () => {
    const { canonical, morphs, driver, definition, positions } = makeCharacter();
    definition.set("face.nose.width", 0.7);

    const packed = packSparseMorphs([...morphs.byName.values()]);
    const struct = new Uint32Array(packed.morphStruct);
    const weights = new Map<string, number>();
    for (const name of packed.morphOrder) weights.set(name, driver.weight(definition, name));
    setMorphWeights(struct, packed.morphOrder, weights);

    const gpuDeformed = simulateGpuKernel(positions, {
      ...packed,
      morphStruct: struct,
    });

    const kernel = new MorphKernel(morphs, driver);
    const delta = new Float32Array(canonical.vertexCount * 3);
    kernel.accumulate(definition, delta);
    const cpuDeformed = positions.slice();
    for (let i = 0; i < delta.length; i++) cpuDeformed[i] += delta[i];

    expect(gpuDeformed.length).toBe(cpuDeformed.length);
    for (let i = 0; i < cpuDeformed.length; i++) {
      expect(gpuDeformed[i]).toBeCloseTo(cpuDeformed[i], 4);
    }
  });
});

describe("WGSL kernel spans expected bindings", () => {
  it("contains the five storage bindings used by the dispatch", () => {
    expect(MORPH_COMPUTE_WGSL).toContain("@group(0) @binding(0)");
    expect(MORPH_COMPUTE_WGSL).toContain("@group(0) @binding(4)");
    expect(MORPH_COMPUTE_WGSL).toMatch(/workgroup_size\(64\)/);
  });
});
