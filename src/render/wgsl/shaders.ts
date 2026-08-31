/**
 * WGSL shaders for the human-specific renderer.
 *
 * v0.1: a PBR-ish opaque color shader driven by the GPU parameter buffer.
 * Future versions add skin/eyes/hair specialized paths and compute-based
 * deformation using the kernels defined in gpu/kernels.
 */

export const HUMAN_PARAM_STRUCT = `
struct HumanParams {
  // Mirrors CPU-side layout (see PropertyRegistry.assignGpuOffsets).
  // For v0.1 we only consume a few known values; the struct is padded to
  // match the registry size for layout-validation tests.
  height        : f32,
  scale         : f32,
  id            : u32,
  seed          : u32,
  headProp      : f32,
  skullWidth    : f32,
  asym          : f32,
  neckLen       : f32,
  spineLen      : f32,
  shoulderW     : f32,
  armLen        : f32,
  legLen        : f32,
  muscularity   : f32,
  bodyFat       : f32,
  chest         : f32,
  waist         : f32,
  hips          : f32,
  jawWidth      : f32,
  jawProj       : f32,
  noseWidth     : f32,
  noseLength    : f32,
  mouthWidth    : f32,
  cheekHeight   : f32,
  eyeSpacing    : f32,
  pigmentation  : f32,
  skinR         : f32,
  skinG         : f32,
  skinB         : f32,
  roughness     : f32,
  specular      : f32,
  wetness       : f32,
  age           : f32,
  eyeR          : f32,
  eyeG          : f32,
  eyeB          : f32,
  irisScale     : f32,
  pupilDilation : f32,
  hairLen       : f32,
  hairDensity   : f32,
  hairCurl      : f32,
  hairCR        : f32,
  hairCG        : f32,
  hairCB        : f32,
  hairGray      : f32,
  exprBlinkL    : f32,
  exprBlinkR    : f32,
  exprBrowDL    : f32,
  exprBrowDR    : f32,
  exprBrowIU    : f32,
  exprSquintL   : f32,
  exprSquintR   : f32,
  exprWideL     : f32,
  exprWideR     : f32,
  exprSmileL    : f32,
  exprSmileR    : f32,
  exprFrownL    : f32,
  exprFrownR    : f32,
  exprJawOpen   : f32,
  exprJawFwd    : f32,
  exprPucker    : f32,
  exprTongue    : f32,
  exprCheekL    : f32,
  exprCheekR    : f32,
};
`;

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
  let scale = params.scale;
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
  let skin = vec3f(params.skinR, params.skinG, params.skinB);
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
