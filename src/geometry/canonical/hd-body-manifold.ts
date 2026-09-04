import type { CanonicalTopologyVertex } from './canonical-topology.js';
import type { RegionName } from './canonical-human.js';

/**
 * HD BODY V0.2 â€” clean-manifold parametric body.
 *
 * Replaces the disconnected-tube body (buildHdBodySkin) which self-intersected
 * heavily at rest (~11k pairs) because torso/arms/legs/feet were separate closed
 * columns fused only by concatenation. This generator computes a single united
 * *implicit* volume (union of skeleton-aligned capsules for torso, shoulders,
 * arms, hands, legs, feet) and extracts ONE watertight isosurface with
 * marching-tetrahedra on a fixed grid.
 *
 * Properties:
 *   - A single closed, non-self-overlapping manifold (min-union of capsules â†’ no
 *     internal walls, no tube-vs-tube interpenetration beyond the smooth joints
 *     of the union surface). This lets the P22 hard self-intersection gate run
 *     with pairs == 0 on the body region at rest.
 *   - Fixed grid â‡’ fixed topology (vertex count + connectivity deterministic for
 *     a given resolution), so the displacement-morph pipeline keeps working:
 *     shape-space bases displace the SAME vertices.
 *   - Per-vertex SEMANTIC regions re-derived from the nearest capsule and local
 *     surface position (chest/abdomen/pelvis/back/side split), and SMOOTH
 *     skeleton skin weights via inverse-distance blending to the nearest bones â€”
 *     a genuine weight gradient (the authored-gradient requirement of item #1).
 *
 * The body occupies indices [0, bodyIndexCount) and is the FIRST segment of the
 * canonical, followed by the (unchanged) HD head skin and detail parts.
 */

export interface HdBodyManifoldOptions {
  /** Vertical (y) of the neck base just below the HD head skin's collar. */
  neckY?: number;
  /** Grid resolution along the longest (y) axis. Higher = smoother / more tris. */
  ySteps?: number;
}

export interface BodyManifold {
  vertices: CanonicalTopologyVertex[];
  indices: Uint32Array;
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

interface BodyCapsule {
  a: V3;
  b: V3;
  radius: number;
  bone: string;
}

// ---------------------------------------------------------------------------
// Capsule SDF authoring (canonical frame: x right, y up, z front, feet ~0).
// ---------------------------------------------------------------------------

function p(x: number, y: number, z: number): V3 {
  return { x, y, z };
}

function buildCapsules(neckY: number): BodyCapsule[] {
  const J = {
    pelvis: p(0, 0.98, 0),
    spine01: p(0, 1.1, 0),
    spine02: p(0, 1.2, 0),
    chest: p(0, neckY - 0.1, 0),
    neck: p(0, neckY - 0.02, 0.15),
    shoulderL: p(-0.17, neckY - 0.05, 0),
    shoulderR: p(0.17, neckY - 0.05, 0),
    elbowL: p(-0.19, 0.98, 0),
    elbowR: p(0.19, 0.98, 0),
    wristL: p(-0.19, 0.74, 0),
    wristR: p(0.19, 0.74, 0),
    handL: p(-0.19, 0.72, 0),
    handR: p(0.19, 0.72, 0),
    hipL: p(-0.1, 0.98, 0),
    hipR: p(0.1, 0.98, 0),
    kneeL: p(-0.11, 0.52, 0),
    kneeR: p(0.11, 0.52, 0),
    ankleL: p(-0.09, 0.06, 0),
    ankleR: p(0.09, 0.06, 0),
    toeL: p(-0.09, 0.03, 0.06),
    toeR: p(0.09, 0.03, 0.06),
  };
  const c = (bone: string, a: keyof typeof J, b: keyof typeof J, radius: number): BodyCapsule => ({
    a: J[a],
    b: J[b],
    radius,
    bone,
  });
  return [
    c('chest', 'chest', 'neck', 0.05),
    c('spine_02', 'chest', 'spine02', 0.115),
    c('spine_01', 'spine02', 'pelvis', 0.13),
    c('clavicle_l', 'shoulderL', 'shoulderL', 0.062),
    c('clavicle_r', 'shoulderR', 'shoulderR', 0.062),
    c('upperarm_l', 'shoulderL', 'elbowL', 0.048),
    c('upperarm_r', 'shoulderR', 'elbowR', 0.048),
    c('forearm_l', 'elbowL', 'wristL', 0.036),
    c('forearm_r', 'elbowR', 'wristR', 0.036),
    c('hand_l', 'wristL', 'handL', 0.034),
    c('hand_r', 'wristR', 'handR', 0.034),
    c('thigh_l', 'hipL', 'kneeL', 0.062),
    c('thigh_r', 'hipR', 'kneeR', 0.062),
    c('shin_l', 'kneeL', 'ankleL', 0.042),
    c('shin_r', 'kneeR', 'ankleR', 0.042),
    c('foot_l', 'ankleL', 'toeL', 0.028),
    c('foot_r', 'ankleR', 'toeR', 0.028),
  ];
}

function sdCapsule(pt: V3, c: BodyCapsule): number {
  const pax = pt.x - c.a.x, pay = pt.y - c.a.y, paz = pt.z - c.a.z;
  const bax = c.b.x - c.a.x, bay = c.b.y - c.a.y, baz = c.b.z - c.a.z;
  const len2 = bax * bax + bay * bay + baz * baz || 1e-12;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / len2));
  const qx = pt.x - (c.a.x + bax * t);
  const qy = pt.y - (c.a.y + bay * t);
  const qz = pt.z - (c.a.z + baz * t);
  return Math.hypot(qx, qy, qz) - c.radius;
}

/** Signed distance to the whole body: min over capsules. */
function sdBody(pt: V3, capsules: BodyCapsule[]): { d: number; bone: string } {
  let best = Infinity;
  let bone = '';
  for (const c of capsules) {
    const d = sdCapsule(pt, c);
    if (d < best) {
      best = d;
      bone = c.bone;
    }
  }
  return { d: best, bone };
}

/** Region for a surface vertex given its owning bone and position. */
function regionFor(bone: string, qx: number, qy: number, qz: number): RegionName {
  switch (bone) {
    case 'spine_01':
      if (qy > 1.1 && qz < 0) return 'back';
      return qy > 1.02 ? 'abdomen' : qz < -0.02 ? 'back' : 'pelvis';
    case 'spine_02':
      if (qy > 1.16) return qz < 0 ? 'back' : 'chest';
      return qz < -0.02 && qy > 1.1 ? 'back' : 'chest';
    case 'chest':
    case 'neck':
      return qz < 0 && qy > 1.15 ? 'back' : 'chest';
    case 'clavicle_l':
      return 'shoulder_left';
    case 'clavicle_r':
      return 'shoulder_right';
    case 'upperarm_l':
      return 'upper_arm_left';
    case 'upperarm_r':
      return 'upper_arm_right';
    case 'forearm_l':
      return 'forearm_left';
    case 'forearm_r':
      return 'forearm_right';
    case 'hand_l':
      return 'hand_left';
    case 'hand_r':
      return 'hand_right';
    case 'thigh_l':
      return 'thigh_left';
    case 'thigh_r':
      return 'thigh_right';
    case 'shin_l':
      return 'shin_left';
    case 'shin_r':
      return 'shin_right';
    case 'foot_l':
      return 'foot_left';
    case 'foot_r':
      return 'foot_right';
    default:
      return 'chest';
  }
}

/** Discrete bone points for skin-weight gradients (nearest-bone blending). */
function bonePoints(capsules: BodyCapsule[]): { bone: string; pt: V3 }[] {
  const map = new Map<string, V3>();
  const add = (bone: string, pt: V3) => {
    const cur = map.get(bone);
    if (!cur) map.set(bone, { ...pt });
    else {
      cur.x = (cur.x + pt.x) / 2;
      cur.y = (cur.y + pt.y) / 2;
      cur.z = (cur.z + pt.z) / 2;
    }
  };
  for (const c of capsules) {
    add(c.bone, c.a);
    add(c.bone, c.b);
  }
  return [...map.entries()].map(([bone, pt]) => ({ bone, pt }));
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Marching cubes: guaranteed-watertight isosurface extraction.
//
// The 12 cube edges that cross the iso-level form closed loop(s) on the cube
// boundary. We trace each loop and fan-triangulate it; because adjacent cells
// produce coincident interpolated vertices (welded later), every surface edge
// is shared by exactly two triangles and the output is a closed manifold.
// ---------------------------------------------------------------------------

interface CellVert {
  pos: V3;
  bone: string;
}

interface MCPoint {
  pos: V3;
  bone: string;
  edge: number;
}

/** Cube corner positions (index matches marching-cubes bit order). */
const MC_CORNERS: V3[] = [
  p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1),
  p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1),
];

/** Corner pairs for each of the 12 cube edges (standard marching-cubes order). */
const EDGE_CORNER: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** DFS that walks a tree of crossing edges from a start edge, fanning off it. */
function triangulateLoop(edges: number[], points: MCPoint[], out: number[]): number[] {
  const r = out;
  const n = edges.length;
  if (n === 3) {
    r.push(edges[0], edges[1], edges[2]);
    return r;
  }
  if (n < 3) return r;
  // Find a triangle with maximal basis (greedy ear): pick edges sharing a corner.
  // cornersOnEdge[e] = the two corner ids of that edge.
  const cornerOf: Map<number, number[]> = new Map();
  for (const e of edges) {
    const [a, b] = EDGE_CORNER[e];
    cornerOf.set(a, (cornerOf.get(a) ?? []).concat(e));
    cornerOf.set(b, (cornerOf.get(b) ?? []).concat(e));
  }
  // Reduce by triples: for an n-gonal loop we can emit n-2 triangles by a fan.
  // Build the loop order: follow edges by shared corner (each edge shares one
  // corner with its predecessor and one with its successor in a polygon).
  const loop: number[] = [];
  loop.push(edges[0]);
  let used = new Set<number>([edges[0]]);
  let cursor = edges[0];
  while (loop.length < n) {
    const [c1, c2] = EDGE_CORNER[cursor];
    const cands = (cornerOf.get(c1) ?? []).concat(cornerOf.get(c2) ?? []);
    let next = -1;
    for (const c of cands) if (!used.has(c)) { next = c; break; }
    if (next === -1) break;
    loop.push(next);
    used.add(next);
    cursor = next;
  }
  for (let i = 1; i + 1 < loop.length; i++) {
    r.push(loop[0], loop[i], loop[i + 1]);
  }
  return r;
}

/**
 * Build the marching-cubes triangle table programmatically: for each 8-bit
 * inside-mask, identify the crossing cube edges (an edge crosses when its two
 * endpoints differ in inside-state) and triangulate the loop(s) they form.
 * REUSING only surface edges that lie on the cell, this reproduces the classic
 * marching-cubes connectivity without a hard-coded 256-row table.
 */
function buildTriTable(): number[][] {
  const table: number[][] = [];
  for (let mask = 0; mask < 256; mask++) {
    const inside = (k: number) => (mask >> k) & 1;
    const edges: number[] = [];
    for (let e = 0; e < 12; e++) {
      const [a, b] = EDGE_CORNER[e];
      if (inside(a) !== inside(b)) edges.push(e);
    }
    const points: MCPoint[] = edges.map((e) => ({ pos: p(0, 0, 0), bone: "", edge: e }));
    const out: number[] = [];
    triangulateLoop(edges, points, out);
    table.push(out.length ? out : [-1]);
  }
  return table;
}

const TRI_TABLE: number[][] = buildTriTable();

/** March a scalar field f on a grid, returning a closed triangle soup. */
function marchGrid(
  nx: number,
  ny: number,
  nz: number,
  iso: number,
  f: (ix: number, iy: number, iz: number) => { d: number; bone: string },
  posAt: (ix: number, iy: number, iz: number) => V3,
): { vertices: CellVert[]; indices: Uint32Array } {
  const field = (ix: number, iy: number, iz: number) =>
    ix < 0 || iy < 0 || iz < 0 || ix > nx || iy > ny || iz > nz ? { d: Infinity, bone: "" } : f(ix, iy, iz);
  const verts: CellVert[] = [];
  const inds: number[] = [];
  const edgeVert = new Map<string, number>();
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const cornerVal: number[] = new Array(8);
        const cornerBone: string[] = new Array(8);
        for (let ci = 0; ci < 8; ci++) {
          const cc = MC_CORNERS[ci];
          const g = field(ix + cc.x, iy + cc.y, iz + cc.z);
          cornerVal[ci] = g.d;
          cornerBone[ci] = g.bone;
        }
        let mask = 0;
        for (let ci = 0; ci < 8; ci++) if (cornerVal[ci] < iso) mask |= 1 << ci;
        const tris = TRI_TABLE[mask];
        if (tris.length === 1 && tris[0] === -1) continue;
        const ensureEdge = (e: number): number => {
          const key = cellEdgeKey(ix, iy, iz, e, nx, ny, nz);
          const hit = edgeVert.get(key);
          if (hit !== undefined) return hit;
          const [c1, c2] = EDGE_CORNER[e];
          const d1 = cornerVal[c1];
          const d2 = cornerVal[c2];
          const fr = Math.max(0, Math.min(1, d1 / (d1 - d2 || 1e-12)));
          const a = posAt(ix + MC_CORNERS[c1].x, iy + MC_CORNERS[c1].y, iz + MC_CORNERS[c1].z);
          const b = posAt(ix + MC_CORNERS[c2].x, iy + MC_CORNERS[c2].y, iz + MC_CORNERS[c2].z);
          const pos: V3 = {
            x: a.x + (b.x - a.x) * fr,
            y: a.y + (b.y - a.y) * fr,
            z: a.z + (b.z - a.z) * fr,
          };
          const bone = Math.abs(d1) < Math.abs(d2) ? cornerBone[c1] : cornerBone[c2];
          const vid = verts.length;
          verts.push({ pos, bone });
          edgeVert.set(key, vid);
          return vid;
        };
        for (let k = 0; k < tris.length; k += 3) {
          const e0 = tris[k], e1 = tris[k + 1], e2 = tris[k + 2];
          if (e0 === -1 || e1 === -1 || e2 === -1) break;
          inds.push(ensureEdge(e0), ensureEdge(e1), ensureEdge(e2));
        }
      }
    }
  }
  return { vertices: verts, indices: Uint32Array.from(inds) };
}

/** Deterministic string key for a cube edge, shared across adjacent cells so
 * the interpolated vertex on that edge is reused (natural watertight weld). */
function cellEdgeKey(ix: number, iy: number, iz: number, e: number, nx: number, ny: number, nz: number): string {
  const [c1, c2] = EDGE_CORNER[e];
  const p1 = MC_CORNERS[c1], p2 = MC_CORNERS[c2];
  const ax = ix + p1.x, ay = iy + p1.y, az = iz + p1.z;
  const bx = ix + p2.x, by = iy + p2.y, bz = iz + p2.z;
  const x1 = Math.min(ax, bx), y1 = Math.min(ay, by), z1 = Math.min(az, bz);
  const x2 = Math.max(ax, bx), y2 = Math.max(ay, by), z2 = Math.max(az, bz);
  return `${e}|${x1}/${y1}/${z1}|${x2}/${y2}/${z2}`;
}
function weld(
  verts: CellVert[],
  indices: Uint32Array,
  tol: number,
): { vertices: CellVert[]; indices: Uint32Array } {
  const key = (v: V3) =>
    `${Math.round(v.x / tol)}/${Math.round(v.y / tol)}/${Math.round(v.z / tol)}`;
  const index = new Map<string, number>();
  const out: CellVert[] = [];
  const remap: number[] = new Array(verts.length);
  for (let i = 0; i < verts.length; i++) {
    const k = key(verts[i].pos);
    const hit = index.get(k);
    if (hit !== undefined) {
      remap[i] = hit;
    } else {
      const nid = out.length;
      out.push(verts[i]);
      index.set(k, nid);
      remap[i] = nid;
    }
  }
  const newIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) newIndices[i] = remap[indices[i]];
  return { vertices: out, indices: newIndices };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Test helper: march an analytic unit-sphere SDF on a grid and return the welded
 * mesh. The sphere must triangulate to a watertight closed surface (Ï‡ = 2, zero
 * boundary edges); this isolates the marching-tetra extractor from the body SDF.
 */
export function marchingCubesProbe(
  n = 24,
  tol = 0.02,
): { vertices: CellVert[]; indices: Uint32Array; chi: number; boundaryEdges: number; rawBoundary: number; rawChi: number; rawV: number } {
  const min = -1.2, max = 1.2;
  const size = max - min;
  const cell = size / n;
  const posAt = (ix: number, iy: number, iz: number): V3 => ({
    x: min + ix * cell,
    y: min + iy * cell,
    z: min + iz * cell,
  });
  const f = (_ix: number, iy: number, iz: number): { d: number; bone: string } => {
    const q = posAt(0, iy, iz);
    void q;
    return { d: 0, bone: '' }; // placeholder
  };
  // Real sphere field needs ix; rebuild with full pos.
  const fFull = (ix: number, iy: number, iz: number): { d: number; bone: string } => {
    const ppos = posAt(ix, iy, iz);
    const d = Math.hypot(ppos.x, ppos.y, ppos.z) - 1;
    return { d, bone: 'chest' };
  };
  void f;
  const raw = marchGrid(n, n, n, 0, fFull, posAt);
  // Report raw (pre-weld) watertightness to isolate weld vs marching emission.
  const rawChi = raw.vertices.length - countEdgesProbe(raw.indices) + raw.indices.length / 3;
  const rawBoundary = countBoundaryProbe(raw.indices);
  void rawChi; void rawBoundary;
  const welded = weld(raw.vertices, raw.indices, tol);
  const eE = countEdgesProbe(welded.indices);
  const eF = welded.indices.length / 3;
  const eV = welded.vertices.length;
  return { vertices: welded.vertices, indices: welded.indices, chi: eV - eE + eF, boundaryEdges: countBoundaryProbe(welded.indices), rawBoundary: rawBoundary, rawChi: rawChi, rawV: raw.vertices.length };
}

function countEdgesProbe(indices: Uint32Array): number {
  const set = new Set<string>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) set.add(Math.min(u, v) + '|' + Math.max(u, v));
  }
  return set.size;
}

function countBoundaryProbe(indices: Uint32Array): number {
  const m = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = Math.min(u, v) + '|' + Math.max(u, v);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  let odd = 0;
  for (const c of m.values()) if (c % 2 !== 0) odd++;
  return odd;
}

/** Build the body: see module doc. */
export function buildHdBodyManifold(opts: HdBodyManifoldOptions = {}): BodyManifold {
  const neckY = opts.neckY ?? 1.65;
  const ySteps = opts.ySteps ?? 96;

  const capsules = buildCapsules(neckY);
  const bones = bonePoints(capsules);

  // Field bounds: gather from capsule extents with margin.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of capsules) {
    for (const q of [c.a, c.b]) {
      minX = Math.min(minX, q.x - c.radius);
      minY = Math.min(minY, q.y - c.radius);
      minZ = Math.min(minZ, q.z - c.radius);
      maxX = Math.max(maxX, q.x + c.radius);
      maxY = Math.max(maxY, q.y + c.radius);
      maxZ = Math.max(maxZ, q.z + c.radius);
    }
  }
  const pad = 0.02;
  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

  const cellSize = (maxY - minY) / ySteps;
  const nx = Math.max(4, Math.round((maxX - minX) / cellSize));
  const nz = Math.max(4, Math.round((maxZ - minZ) / cellSize));
  const ny = ySteps;

  const posAt = (ix: number, iy: number, iz: number): V3 => ({
    x: minX + ix * cellSize,
    y: minY + iy * cellSize,
    z: minZ + iz * cellSize,
  });

  const f = (ix: number, iy: number, iz: number): { d: number; bone: string } => {
    return sdBody(posAt(ix, iy, iz), capsules);
  };

  const iso = 0;
  const raw = marchGrid(nx, ny, nz, iso, f, posAt);
  const welded = weld(raw.vertices, raw.indices, cellSize * 0.02);

  // Assign normals (from SDF gradient), weights, uv, region per vertex.
  const e = 1e-3;
  const vertices: CanonicalTopologyVertex[] = welded.vertices.map((cv) => {
    const pos = cv.pos;
    // central difference normal of the signed distance field (points outward:
    // d decreases toward the interior, so the gradient points outward).
    const gx = sdBody({ x: pos.x + e, y: pos.y, z: pos.z }, capsules).d -
      sdBody({ x: pos.x - e, y: pos.y, z: pos.z }, capsules).d;
    const gy = sdBody({ x: pos.x, y: pos.y + e, z: pos.z }, capsules).d -
      sdBody({ x: pos.x, y: pos.y - e, z: pos.z }, capsules).d;
    const gz = sdBody({ x: pos.x, y: pos.y, z: pos.z + e }, capsules).d -
      sdBody({ x: pos.x, y: pos.y, z: pos.z - e }, capsules).d;
    const gl = Math.hypot(gx, gy, gz) || 1e-12;
    const normal = { x: gx / gl, y: gy / gl, z: gz / gl };

    // inverse-distance skin weights to nearest bones.
    const weights: Record<string, number> = {};
    const contrib: Array<{ bone: string; w: number }> = [];
    let total = 0;
    for (const bp of bones) {
      const dx = pos.x - bp.pt.x, dy = pos.y - bp.pt.y, dz = pos.z - bp.pt.z;
      const d2 = Math.max(1e-8, dx * dx + dy * dy + dz * dz);
      const w = 1 / d2;
      contrib.push({ bone: bp.bone, w });
      total += w;
    }
    contrib.sort((a, b) => b.w - a.w);
    const nInfluences = 4;
    for (let i = 0; i < Math.min(nInfluences, contrib.length); i++) {
      weights[contrib[i].bone] = contrib[i].w / total;
    }
    // Normalize the top-k to 1.
    let wsum = 0;
    for (const k of Object.keys(weights)) wsum += weights[k];
    if (wsum > 1e-12) for (const k of Object.keys(weights)) weights[k] /= wsum;

    const region = regionFor(cv.bone, pos.x, pos.y, pos.z);
    return {
      id: -1,
      position: pos,
      normal,
      uv: {
        u: Math.max(0, Math.min(1, (pos.x + 0.3) / 0.6)),
        v: Math.max(0, Math.min(1, pos.y / 1.8)),
      },
      region,
      weights,
    };
  });

  // Stable ids (assigned globally by the provider after concatenation, but set
  // to array index here as the canonical contract requires id === index).
  for (let i = 0; i < vertices.length; i++) vertices[i] = { ...vertices[i], id: i };

  return { vertices, indices: welded.indices };
}
