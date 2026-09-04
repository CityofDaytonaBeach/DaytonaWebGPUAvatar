import { SkinInfluences } from './skin-mesh.js';
/**
 * Dispatches the GPU skinning compute pass. Reads GPU-resident positions (the
 * morph-deformed working buffer), per-vertex bone influences, and a skin matrix
 * buffer; writes skinned positions a renderer can bind. At the rest pose the
 * skin matrices are identity, so output equals input â€” animation alone moves
 * the vertices bound to rotated bones.
 */
export declare class SkinningKernel {
    private readonly device;
    private paramsBuffer;
    private inBuffer;
    private indicesBuffer;
    private weightsBuffer;
    private matricesBuffer;
    private outBuffer;
    private inNormalBuffer;
    private outNormalBuffer;
    private pipeline;
    private bindGroup;
    private vertexCount;
    constructor(device: GPUDevice, vertexCount: number, inputPositions: GPUBuffer, influences: SkinInfluences, boneMatrices: Float32Array, numBones: number, inputNormals: GPUBuffer);
    private bind;
    /** Dispatch skinning into the current encoder. */
    dispatch(encoder: GPUCommandEncoder): void;
    /** Upload a new set of combined skin matrices (animation update). */
    setBoneMatrices(boneMatrices: Float32Array): void;
    get outputBuffer(): GPUBuffer;
    get outputNormalsBuffer(): GPUBuffer;
}
//# sourceMappingURL=skinning-kernel.d.ts.map