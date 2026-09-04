/**
 * Dispatches the sparse morph GPU-decompress compute. Owns the buffers and
 * pipeline for a single character. Call `dispatch()` each frame after updating
 * morph weights. Output lands in `outPositionBuffer`, which a renderer can bind.
 */
export declare class GpuMorphDeform {
    private readonly device;
    private deltaBuffer;
    private morphBuffer;
    private paramsBuffer;
    private basePositionBuffer;
    private outPositionBuffer;
    private pipeline;
    private bindGroup;
    private vertexCount;
    /**
     * @param deltaPacked Uint32Array from packSparseMorphs (index,dx,dy,dz quads).
     * @param morphStruct Uint32Array from packSparseMorphs (per-morph meta).
     */
    constructor(device: GPUDevice, vertexCount: number, basePositions: Float32Array, deltaPacked: Uint32Array, morphStruct: Uint32Array);
    /** Dispatch the morph compute pass into the current encoder. */
    dispatch(encoder: GPUCommandEncoder): void;
    /** Update morph weights from a name->weight map. */
    writeWeights(morphStructBuffer: Uint32Array): void;
    get outputBuffer(): GPUBuffer;
}
//# sourceMappingURL=gpu-morph-deform.d.ts.map