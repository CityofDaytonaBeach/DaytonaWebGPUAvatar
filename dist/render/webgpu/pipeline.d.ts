import { CharacterGpuState } from '../../gpu/buffers/character-gpu-state.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { MorphDriver } from '../../geometry/morph/morph-driver.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { BonePose } from '../../animation/skeleton/skeletal-animation.js';
export interface WebGpuHumanPipelineOptions {
    device: GPUDevice;
    format?: GPUTextureFormat;
    /** Total bytes of the HumanParams uniform buffer (from registry.sizeBytes). */
    paramByteSize: number;
    /** Parametric skeleton (bone order) used for skinning influences/matrices. */
    skeleton?: BoneDef[];
}
/**
 * Ties the GPU-resident character path together for one Human:
 *
 *   CharacterGpuState (base geometry + params)
 *   GpuMorphDeform   (sparse morph GPU-decompress -> deformed positions)
 *   SkinningKernel   (bone skinning -> skinned positions)
 *   WebGPURenderer   (draw the skinned mesh)
 *
 * `render()` must be called inside a command encoding that ends with
 * `device.queue.submit([encoder.finish()])`. `upload()` writes params + morph
 * weights; call it before each render when the definition has changed.
 */
export declare class WebGpuHumanPipeline {
    private readonly canonical;
    private readonly morphs;
    private readonly morphDriver;
    readonly state: CharacterGpuState;
    private readonly deform;
    private readonly skin;
    private readonly renderer;
    private readonly packed;
    private readonly skeleton;
    private skinMaterial;
    private tangentBuffer;
    readonly morphNames: string[];
    constructor(canonical: CanonicalHuman, morphs: SparseMorphSet, morphDriver: MorphDriver, opts: WebGpuHumanPipelineOptions);
    /**
     * Upload current definition params + morph weights into GPU-resident state.
     * Cheap; call each frame.
     */
    upload(definition: HumanDefinition): void;
    /**
     * Update the GPU skin matrices from a set of bone poses (rotations/offsets
     * relative to rest). Rest pose (no animation) yields identity skin matrices
     * and leaves the mesh unchanged.
     */
    setPose(poses?: BonePose[]): void;
    /**
     * Dispatch morph + skinning compute and draw the skinned mesh into `view`.
     * Call `upload()` first (or call `renderAndUpload`).
     */
    render(encoder: GPUCommandEncoder, view: GPUTextureView, width: number, height: number): void;
    /** Convenience: upload params/weights, deform, and draw. */
    renderAndUpload(encoder: GPUCommandEncoder, view: GPUTextureView, width: number, height: number, definition: HumanDefinition): void;
}
//# sourceMappingURL=pipeline.d.ts.map