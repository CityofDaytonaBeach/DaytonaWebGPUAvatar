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
 *
 * Buffer layout: positions and normals are TIGHTLY PACKED xyz f32 triples,
 * because the renderer binds the same buffers as vertex attributes with a
 * 12-byte stride. WGSL `array<vec3f>` in a storage buffer has a 16-byte element
 * stride, so declaring these as `array<vec3f>` silently reads/writes at the
 * wrong offsets and the mesh collapses into slabs. They are declared as flat
 * `array<f32>` and indexed manually to keep CPU and GPU layouts identical.
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
@group(0) @binding(1) var<storage, read>   inPositions : array<f32>;
@group(0) @binding(2) var<storage, read>   boneIndices : array<u32>;
@group(0) @binding(3) var<storage, read>   boneWeights : array<f32>;
@group(0) @binding(4) var<storage, read>   boneMatrices : array<mat4x4f>;
@group(0) @binding(5) var<storage, read_write> outPositions : array<f32>;
@group(0) @binding(6) var<storage, read>   inNormals : array<f32>;
@group(0) @binding(7) var<storage, read_write> outNormals : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let vid : u32 = gid.x;
  if (vid >= params.vertexCount) { return; }

  let o = vid * 3u;
  let p = vec3f(inPositions[o], inPositions[o + 1u], inPositions[o + 2u]);
  let n = vec3f(inNormals[o], inNormals[o + 1u], inNormals[o + 2u]);
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

  outPositions[o] = skinnedPos.x;
  outPositions[o + 1u] = skinnedPos.y;
  outPositions[o + 2u] = skinnedPos.z;
  let nn = normalize(skinnedNml);
  outNormals[o] = nn.x;
  outNormals[o + 1u] = nn.y;
  outNormals[o + 2u] = nn.z;
}
`;
//# sourceMappingURL=skin-wgsl.js.map