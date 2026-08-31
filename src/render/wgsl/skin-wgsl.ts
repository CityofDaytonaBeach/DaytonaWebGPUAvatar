/**
 * WGSL compute shader for GPU skinned deformation.
 *
 * Reads model-space positions (already morph-deformed), a per-vertex influence
 * list (up to `MAX_INFLUENCES` bone indices + weights), and a per-bone skin
 * matrix buffer (mat4 per bone, column-major). Produces GPU-resident skinned
 * positions. This is the GPU counterpart to `skinMeshCPU` and must stay
 * byte-identical for the parity test.
 */
export const SKIN_COMPUTE_WGSL = `
const MAX_INFLUENCES : u32 = 4u;

struct SkinParams {
  vertexCount : u32,
  boneCount   : u32,
  padding0    : u32,
  padding1    : u32,
};

@group(0) @binding(0) var<uniform> params : SkinParams;
@group(0) @binding(1) var<storage, read>   inPositions   : array<vec3f>;
@group(0) @binding(2) var<storage, read>   boneIndices   : array<u32>;
@group(0) @binding(3) var<storage, read>   boneWeights   : array<f32>;
@group(0) @binding(4) var<storage, read>   boneMatrices  : array<mat4x4f>;
@group(0) @binding(5) var<storage, read_write> outPositions : array<vec3f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let vid : u32 = gid.x;
  if (vid >= params.vertexCount) { return; }

  let p = inPositions[vid];
  let base = vid * MAX_INFLUENCES;

  var skinned = vec3f(0.0, 0.0, 0.0);
  for (var k : u32 = 0u; k < MAX_INFLUENCES; k++) {
    let w = boneWeights[base + k];
    if (w == 0.0) { continue; }
    let bi = boneIndices[base + k];
    let m = boneMatrices[bi];
    let t = m * vec4f(p, 1.0);
    skinned = skinned + w * t.xyz;
  }

  outPositions[vid] = skinned;
}
`;
