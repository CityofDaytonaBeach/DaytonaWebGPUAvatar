import { CharacterGpuState } from '../../gpu/buffers/character-gpu-state.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SparseMorphSet } from '../../geometry/morph/sparse-morph.js';
import { MorphDriver } from '../../geometry/morph/morph-driver.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { BonePose } from '../../animation/skeleton/skeletal-animation.js';
import { SkinPreset } from '../../surface/skin/neural-skin.js';
import { ShadingModel } from '../wgsl/photoreal-wgsl.js';
export interface WebGpuHumanPipelineOptions {
    device: GPUDevice;
    format?: GPUTextureFormat;
    /** Total bytes of the HumanParams uniform buffer (from registry.sizeBytes). */
    paramByteSize: number;
    /** Parametric skeleton (bone order) used for skinning influences/matrices. */
    skeleton?: BoneDef[];
    /**
     * Shading model. `'photoreal'` (default) uses the photoreal skin/eye/enamel
     * program (dual-lobe specular, pre-integrated SSS, micro-detail normals, iris
     * parallax, enamel translucency, ACES/sRGB display transform). `'basic'`
     * keeps the original single-lobe program.
     */
    shading?: ShadingModel;
    /** Skin preset driving photoreal material assignment. */
    skinPreset?: SkinPreset;
    /**
     * Definition whose semantic skin parameters seed the photoreal materials and
     * the tangent-perturbation buffer. Defaults to a registry-default definition;
     * pass the runtime definition so materials match the actual human, and call
     * `refreshMaterials()` after skin parameters change.
     */
    definition?: HumanDefinition;
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
    /** Active shading model. */
    readonly shading: ShadingModel;
    private tangentBuffer;
    private readonly skinPreset;
    private renderParts;
    readonly morphNames: string[];
    constructor(canonical: CanonicalHuman, morphs: SparseMorphSet, morphDriver: MorphDriver, opts: WebGpuHumanPipelineOptions);
    /**
     * Re-derive photoreal per-part materials from `definition` and re-bind them.
     * Index buffers are reused, so this is cheap; call it when skin/eye parameters
     * change (not every frame). No-op under `'basic'` shading.
     */
    refreshMaterials(definition: HumanDefinition): void;
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