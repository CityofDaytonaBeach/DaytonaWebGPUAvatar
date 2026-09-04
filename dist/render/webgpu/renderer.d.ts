/**
 * Full WGSL program for the human renderer (single module so vertex/fragment
 * share the VSOut type). Reads deformed working positions from the morph
 * compute output, applies a model-view-projection matrix, and shades each
 * rendered part (skin / sclera / iris / teeth / tongue / cavity) with its own
 * base color driven by a per-part uniform.
 */
export declare const HUMAN_RENDER_WGSL: string;
export interface CameraMatrices {
    mvp: Float32Array;
    normalMat: Float32Array;
}
/** One drawable sub-mesh of the canonical human, with its material color. */
export interface RenderPart {
    name: string;
    color: [number, number, number];
    /** Material for PBR shading: [roughness, specular, sssIntensity]. */
    material?: [number, number, number];
    /** Subsurface scatter color (defaults to a muted skin tone). */
    sssColor?: [number, number, number];
    /** Extra photoreal flag bits OR-ed into PartParams.flags (PHOTOREAL_FLAGS). */
    extraFlags?: number;
    /** True if per-vertex tangent-space normal perturbation is supplied. */
    hasNormalMap?: boolean;
    /** True to apply IOR-based corneal refraction (transparent cornea dome). */
    refractive?: boolean;
    /** Refractive index for the cornea surface (e.g. 1.376 for human cornea). */
    ior?: number;
    opaque: boolean;
    /** GPU index buffer for this part's triangles. */
    indexBuffer: GPUBuffer;
    indexCount: number;
}
/**
 * Build a perspective MVP + normal matrix for the block human (fits in unit
 * space roughly -1..4 on Y). `angleY` rotates around Y, `angleX` tilts around X.
 */
export declare function buildCameraMatrices(width: number, height: number, angleY?: number, angleX?: number): CameraMatrices;
/**
 * WebGPU human renderer. Draws the GPU-resident, GPU-deformed character as a
 * set of parts (skin + eyes + teeth + tongue + cavity), each with its own
 * material color from a per-part uniform. Morph output (deformed positions) is
 * bound as the vertex position attribute so deformation is visibly applied.
 */
export declare class WebGPURenderer {
    private device;
    /**
     * Shader program to render with. Defaults to the built-in program; pass
     * `PHOTOREAL_HUMAN_WGSL` for the photoreal skin/eye/enamel model. The bind
     * group and vertex layouts are identical, so this is a pure module swap.
     */
    private readonly shaderCode;
    private pipeline;
    private bindGroupLayout;
    private cameraBuffer;
    private normalBuffer;
    private uvBuffer;
    private tangentBuffer;
    /** Optional baked [curvature, thickness] per vertex (photoreal shading only). */
    private curvatureThicknessBuffer?;
    /** Zero-filled stand-in so the attribute is always bound; zero = "not baked". */
    private curvatureThicknessFallback?;
    /** True when the bound shader declares the location-4 bake attribute. */
    private readonly usesCurvatureThickness;
    private parts;
    /** Per-part bind groups (params + camera + part color). */
    private partBindGroups;
    partNames: string[];
    constructor(device: GPUDevice, format?: GPUTextureFormat, 
    /**
     * Shader program to render with. Defaults to the built-in program; pass
     * `PHOTOREAL_HUMAN_WGSL` for the photoreal skin/eye/enamel model. The bind
     * group and vertex layouts are identical, so this is a pure module swap.
     */
    shaderCode?: string);
    private init;
    /** Attach static per-part geometry; builds a part-color buffer + bind group. */
    setParts(parts: RenderPart[], paramBuffer: GPUBuffer): void;
    /** Attach shared per-vertex normal, UV, and optional tangent-perturb buffers. */
    setSharedNormalsAndUvs(normalBuffer: GPUBuffer, uvBuffer: GPUBuffer): void;
    /**
     * Attach the shared per-vertex tangent perturbation buffer (stride 2 floats).
     * Parts marked hasNormalMap read it; all others ignore it.
     */
    setSharedTangentPerturb(tangentBuffer: GPUBuffer): void;
    /**
     * Attach the shared per-vertex baked [curvature, thickness] buffer (stride 2
     * floats), produced by `bakeCurvatureThickness()`. Ignored by the basic
     * shading model; when absent the photoreal shader falls back to its head-wide
     * constants.
     */
    setSharedCurvatureThickness(buffer: GPUBuffer): void;
    /** Lazily created zero buffer used when no bake has been attached. */
    private curvatureThicknessOrFallback;
    uploadCamera(width: number, height: number): void;
    /**
     * Draw all parts using `deformedBuffer` (positions) and `normalsBuffer`
     * (skinned normals) as vertex attributes 0 and 1.
     */
    draw(encoder: GPUCommandEncoder, view: GPUTextureView, width: number, height: number, deformedBuffer: GPUBuffer, normalsBuffer?: GPUBuffer): void;
}
//# sourceMappingURL=renderer.d.ts.map