import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { MorphDriver } from '../../geometry/morph/morph-driver.js';

/**
 * SparseMorph / MorphAccumulation kernel.
 *
 * On WebGPU platforms this is dispatched as a compute pass. When no device is
 * present, a CPU path (SIMD-friendly, typed arrays) accumulates morphs. The
 * CPU path is also the reference implementation used by tests.
 */
export class MorphKernel {
  constructor(
    private morphs: SparseMorphSet,
    private driver: MorphDriver,
    private device: GPUDevice | null = null,
    private buffer: GPUBuffer | null = null,
  ) {}

  /** Compute the accumulated morph delta into `out` (strides of 3 floats). */
  accumulate(definition: HumanDefinition, out: Float32Array): void {
    out.fill(0);
    for (const morph of this.morphs.byName.values()) {
      const weight = this.driver.weight(definition, morph.name);
      if (weight === 0) continue;
      this.morphs.applyMask(morph.name, weight, out);
    }
  }

  /** Report total delta count (memory metric). */
  get deltaCount(): number {
    return this.morphs.totalDeltaCount;
  }
}
