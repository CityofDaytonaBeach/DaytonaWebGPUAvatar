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
export declare const SKIN_COMPUTE_WGSL = "\nconst MAX_INFLUENCES : u32 = 4u;\n\nstruct SkinParams {\n  vertexCount : u32,\n  boneCount   : u32,\n  padding0    : u32,\n  padding1    : u32,\n};\n\n@group(0) @binding(0) var<uniform> params : SkinParams;\n@group(0) @binding(1) var<storage, read>   inPositions : array<f32>;\n@group(0) @binding(2) var<storage, read>   boneIndices : array<u32>;\n@group(0) @binding(3) var<storage, read>   boneWeights : array<f32>;\n@group(0) @binding(4) var<storage, read>   boneMatrices : array<mat4x4f>;\n@group(0) @binding(5) var<storage, read_write> outPositions : array<f32>;\n@group(0) @binding(6) var<storage, read>   inNormals : array<f32>;\n@group(0) @binding(7) var<storage, read_write> outNormals : array<f32>;\n\n@compute @workgroup_size(64)\nfn main(@builtin(global_invocation_id) gid : vec3u) {\n  let vid : u32 = gid.x;\n  if (vid >= params.vertexCount) { return; }\n\n  let o = vid * 3u;\n  let p = vec3f(inPositions[o], inPositions[o + 1u], inPositions[o + 2u]);\n  let n = vec3f(inNormals[o], inNormals[o + 1u], inNormals[o + 2u]);\n  let base = vid * MAX_INFLUENCES;\n\n  var skinnedPos = vec3f(0.0, 0.0, 0.0);\n  var skinnedNml = vec3f(0.0, 0.0, 0.0);\n  for (var k : u32 = 0u; k < MAX_INFLUENCES; k++) {\n    let w = boneWeights[base + k];\n    if (w == 0.0) { continue; }\n    let bi = boneIndices[base + k];\n    let m = boneMatrices[bi];\n    let t = m * vec4f(p, 1.0);\n    skinnedPos = skinnedPos + w * t.xyz;\n    // Normal via the rotation (upper 3x3) only; matrices are rigid (no scale).\n    let r = mat3x3f(m[0].xyz, m[1].xyz, m[2].xyz);\n    skinnedNml = skinnedNml + w * (r * n);\n  }\n\n  outPositions[o] = skinnedPos.x;\n  outPositions[o + 1u] = skinnedPos.y;\n  outPositions[o + 2u] = skinnedPos.z;\n  let nn = normalize(skinnedNml);\n  outNormals[o] = nn.x;\n  outNormals[o + 1u] = nn.y;\n  outNormals[o + 2u] = nn.z;\n}\n";
//# sourceMappingURL=skin-wgsl.d.ts.map