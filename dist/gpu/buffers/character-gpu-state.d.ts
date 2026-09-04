import { HumanDefinition } from '../../core/schema/human-definition.js';
/**
 * GPU-resident character state manager. Keeps hot character state on the GPU:
 * base vertices, working vertices, normals, parameter buffer. CPU sends small
 * state changes; the GPU computes deformation.
 *
 * v0.1 stores the canonical block human into GPU buffers and updates the
 * parameter buffer from the HumanDefinition.
 */
export declare class CharacterGpuState {
    private device;
    readonly paramBuffer: GPUBuffer;
    readonly basePositionBuffer: GPUBuffer;
    readonly normalBuffer: GPUBuffer;
    readonly uvBuffer: GPUBuffer;
    readonly indexBuffer: GPUBuffer;
    readonly vertexCount: number;
    readonly indexCount: number;
    readonly paramByteSize: number;
    private paramUpload;
    constructor(device: GPUDevice, vertexPositions: Float32Array, normals: Float32Array, uvs: Float32Array | null, indices: Uint32Array, paramByteSize: number);
    /** Upload the current parameter values into the GPU uniform buffer. */
    uploadParameters(definition: HumanDefinition): void;
}
//# sourceMappingURL=character-gpu-state.d.ts.map