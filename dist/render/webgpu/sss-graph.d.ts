/**
 * Live screen-space subsurface-scattering render graph.
 *
 * The forward photoreal pass writes three targets (linear radiance, view depth,
 * skin mask) instead of one; this graph then runs the separable blur from
 * `photoreal/sss-blur.ts` horizontally into an intermediate target and
 * vertically into the swap-chain view, applying the display transform on the
 * final pass. Non-skin pixels (mask 0) pass through unchanged, so eyes, teeth
 * and mouth cavity keep their crisp shading.
 *
 * Everything here is device-side plumbing; the kernel, step scaling and depth
 * rejection all live in the CPU-referenced module and are asserted by its tests.
 */
/** Color target formats of the photoreal G-buffer pass, in shader-location order. */
export declare const SSS_GBUFFER_FORMATS: readonly GPUTextureFormat[];
/** Intermediate target of the horizontal pass (stays in linear light). */
export declare const SSS_INTERMEDIATE_FORMAT: GPUTextureFormat;
/** Clear color of the radiance target — matches the previous single-pass clear. */
export declare const SSS_CLEAR_COLOR: GPUColorDict;
/** Blur direction of each pass, in UV space. */
export declare const SSS_PASS_DIRECTIONS: readonly (readonly [number, number])[];
export declare class SssRenderGraph {
    private readonly device;
    /** Swap-chain format the composite pass writes. */
    private readonly outputFormat;
    /** tan(halfFov) of the active projection; scales the blur to world width. */
    private readonly tanHalfFov;
    private targets?;
    private readonly blurPipeline;
    private readonly compositePipeline;
    private readonly layout;
    private readonly sampler;
    /** One uniform buffer per pass so both passes can be encoded back to back. */
    private readonly paramBuffers;
    constructor(device: GPUDevice, 
    /** Swap-chain format the composite pass writes. */
    outputFormat: GPUTextureFormat, 
    /** tan(halfFov) of the active projection; scales the blur to world width. */
    tanHalfFov: number);
    /** (Re)allocate the G-buffer + intermediate targets for this viewport size. */
    resize(width: number, height: number): void;
    /**
     * Color attachments for the forward G-buffer pass, in shader-location order.
     * `resize()` must have run for the current viewport.
     */
    geometryAttachments(): GPURenderPassColorAttachment[];
    /** Encode both blur passes; the vertical pass writes `outputView`. */
    run(encoder: GPUCommandEncoder, outputView: GPUTextureView): void;
    /** Swap-chain format this graph composites into. */
    get format(): GPUTextureFormat;
    /** Release the G-buffer textures (call when the pipeline is torn down). */
    destroy(): void;
    private destroyTargets;
    private requireTargets;
}
//# sourceMappingURL=sss-graph.d.ts.map