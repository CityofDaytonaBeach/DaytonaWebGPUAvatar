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
export declare class MorphKernel {
    private morphs;
    private driver;
    private device;
    private buffer;
    constructor(morphs: SparseMorphSet, driver: MorphDriver, device?: GPUDevice | null, buffer?: GPUBuffer | null);
    /** Compute the accumulated morph delta into `out` (strides of 3 floats). */
    accumulate(definition: HumanDefinition, out: Float32Array): void;
    /** Report total delta count (memory metric). */
    get deltaCount(): number;
}
//# sourceMappingURL=morph-kernel.d.ts.map