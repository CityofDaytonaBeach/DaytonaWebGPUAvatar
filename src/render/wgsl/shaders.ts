import { createDefaultRegistry } from "../../core/schema/descriptors";
import { generateHumanParamsWgsl } from "../../core/schema/gpu-layout";

/** WGSL HumanParams generated from the authoritative default registry. */
export const HUMAN_PARAM_STRUCT = generateHumanParamsWgsl(createDefaultRegistry());

/**
 * Vertex shader. Reads position + normal attributes and the uniform params;
 * applies skin color derived from the parameter buffer (v0.1 placeholder for
 * the fuller skin pipeline). Produces a lit color.
 */
export const VERTEX_PLACEHOLDER = `
${HUMAN_PARAM_STRUCT}
@group(0) @binding(0) var<uniform> params : HumanParams;

struct VSIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
};
struct VSOut {
  @builtin(position) clip_position : vec4f,
  @location(0) normal : vec3f,
  @location(1) uv : vec2f,
};
@vertex
fn vs_main(in : VSIn) -> VSOut {
  var out : VSOut;
  let scale = params.global_scale;
  out.clip_position = vec4f(in.position * scale, 1.0);
  out.normal = in.normal;
  out.uv = in.uv;
  return out;
}
`;

export const FRAGMENT_PLACEHOLDER = `
${HUMAN_PARAM_STRUCT}
@group(0) @binding(0) var<uniform> params : HumanParams;

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  let skin = vec3f(params.skin_baseColorR, params.skin_baseColorG, params.skin_baseColorB);
  let lightDir = normalize(vec3f(0.3, -0.8, 0.5));
  let ndl = max(dot(normalize(in.normal), lightDir), 0.0);
  let shade = skin * (0.4 + 0.6 * ndl);
  return vec4f(shade, 1.0);
}
`;

export function buildShaderModule(device: GPUDevice, code: string, label: string): GPUShaderModule {
  return device.createShaderModule({ code, label });
}

export interface HumanRendererShaders {
  vertex: string;
  fragment: string;
}

export function placeholderShaders(): HumanRendererShaders {
  return { vertex: VERTEX_PLACEHOLDER, fragment: FRAGMENT_PLACEHOLDER };
}
