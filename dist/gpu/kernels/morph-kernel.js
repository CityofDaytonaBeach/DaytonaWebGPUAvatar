/**
 * SparseMorph / MorphAccumulation kernel.
 *
 * On WebGPU platforms this is dispatched as a compute pass. When no device is
 * present, a CPU path (SIMD-friendly, typed arrays) accumulates morphs. The
 * CPU path is also the reference implementation used by tests.
 */
export class MorphKernel {
    morphs;
    driver;
    device;
    buffer;
    constructor(morphs, driver, device = null, buffer = null) {
        this.morphs = morphs;
        this.driver = driver;
        this.device = device;
        this.buffer = buffer;
    }
    /** Compute the accumulated morph delta into `out` (strides of 3 floats). */
    accumulate(definition, out) {
        out.fill(0);
        for (const morph of this.morphs.byName.values()) {
            const weight = this.driver.weight(definition, morph.name);
            if (weight === 0)
                continue;
            this.morphs.applyMask(morph.name, weight, out);
        }
    }
    /** Report total delta count (memory metric). */
    get deltaCount() {
        return this.morphs.totalDeltaCount;
    }
}
//# sourceMappingURL=morph-kernel.js.map