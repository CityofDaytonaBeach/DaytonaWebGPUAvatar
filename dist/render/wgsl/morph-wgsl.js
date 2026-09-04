/**
 * Sparse morph GPU-decompress kernel.
 *
 * Each thread owns one vertex. It reads base positions, then for every morph
 * binary-searches that morph's (vertex-sorted) delta range to find whether this
 * vertex is affected, adding weight * delta. Produces deformed working
 * positions. This is a faithful GPU implementation of MorphKernel.accumulate
 * (CPU reference) — the goal is CPU/GPU parity.
 */
export const MORPH_COMPUTE_WGSL = /* wgsl */ `
struct MorphMeta {
  weight : f32,     // start of struct; padded
  _pad0  : u32,
  _pad1  : u32,
  _pad2  : u32,
}
struct Params {
  vertexCount : u32,
  morphCount  : u32,
  _pad0       : u32,
  _pad1       : u32,
}

@group(0) @binding(0) var<storage, read> params    : Params;
@group(0) @binding(1) var<storage, read> basePos   : array<vec3f>;
@group(0) @binding(2) var<storage, read> deltas    : array<vec4f>; // (index, dx, dy, dz)
@group(0) @binding(3) var<storage, read> morphs    : array<vec4f>; // x:weight, z:start, y:count (see packer)
@group(0) @binding(4) var<storage, read_write> outPos : array<vec3f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let v = gid.x;
  if (v >= params.vertexCount) { return; }

  var pos = basePos[v];

  for (var m = 0u; m < params.morphCount; m = m + 1u) {
    let meta = morphs[m];
    let weight = meta.x;
    if (weight == 0.0) { continue; }
    let count = u32(meta.y);
    if (count == 0u) { continue; }
    let start = u32(meta.z);

    // Binary search morph's vertex-sorted delta range for vertex v.
    var lo = 0u;
    var hi = count;
    while (lo < hi) {
      let mid = lo + (hi - lo) / 2u;
      let idx = u32(deltas[start + mid].x);
      if (idx < v)        { lo = mid + 1u; }
      else                { hi = mid; }
    }
    if (lo < count && u32(deltas[start + lo].x) == v) {
      let d = deltas[start + lo];
      pos.x = pos.x + weight * d.y;
      pos.y = pos.y + weight * d.z;
      pos.z = pos.z + weight * d.w;
    }
  }

  outPos[v] = pos;
}
`;
//# sourceMappingURL=morph-wgsl.js.map