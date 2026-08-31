/**
 * WGSL compute shader for GPU skinned deformation.
 *
 * Reads model-space positions (already morph-deformed) AND model-space normals,
 * plus a per-vertex influence list (up to `MAX_INFLUENCES` bone indices +
 * weights) and a per-bone skin matrix buffer (mat4 per bone, column-major).
 * Produces GPU-resident skinned positions and skinned normals. Both outputs are
 * weighted by the same skin matrices; normals use the upper 3x3 (rotation) part
 * and are renormalized. This is the GPU counterpart to `skinMeshCPU`/skinNormals
 * and must stay byte-identical for the parity test.
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
@group(0) @binding(1) var<storage, read>   inPositions : array<vec3f>;
@group(0) @binding(2) var<storage, read>   boneIndices : array<u32>;
@group(0) @binding(3) var<storage, read>   boneWeights : array<f32>;
@group(0) @binding(4) var<storage, read>   boneMatrices : array<mat4x4f>;
@group(0) @binding(5) var<storage, read_write> outPositions : array<vec3f>;
@group(0) @binding(6) var<storage, read>   inNormals : array<vec3f>;
@group(0) @binding(7) var<storage, read_write> outNormals : array<vec3f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let vid : u32 = gid.x;
  if (vid >= params.vertexCount) { return; }

  let p = inPositions[vid];
  let n = inNormals[vid];
  let base = vid * MAX_INFLUENCES;

  var skinnedPos = vec3f(0.0, 0.0, 0.0);
  var skinnedNml = vec3f(0.0, 0.0, 0.0);
  for (var k : u32 = 0u; k < MAX_INFLUENCES; k++) {
    let w = boneWeights[base + k];
    if (w == 0.0) { continue; }
    let bi = boneIndices[base + k];
    let m = boneMatrices[bi];
    let t = m * vec4f(p, 1.0);
    skinnedPos = skinnedPos + w * t.xyz;
    // Normal via the rotation (upper 3x3) only; matrices are rigid (no scale).
    let r = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);
    skinnedNml = skinnedNml + w * (r * n);
  }

  outPositions[vid] = skinnedPos;
  outNormals[vid] = normalize(skinnedNml);
}
`;
