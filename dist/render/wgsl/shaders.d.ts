/** WGSL HumanParams generated from the authoritative default registry. */
export declare const HUMAN_PARAM_STRUCT: string;
/**
 * Vertex shader. Reads position + normal attributes and the uniform params;
 * applies skin color derived from the parameter buffer (v0.1 placeholder for
 * the fuller skin pipeline). Produces a lit color.
 */
export declare const VERTEX_PLACEHOLDER: string;
export declare const FRAGMENT_PLACEHOLDER: string;
export declare function buildShaderModule(device: GPUDevice, code: string, label: string): GPUShaderModule;
export interface HumanRendererShaders {
    vertex: string;
    fragment: string;
}
export declare function placeholderShaders(): HumanRendererShaders;
//# sourceMappingURL=shaders.d.ts.map