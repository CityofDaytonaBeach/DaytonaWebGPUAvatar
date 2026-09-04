import type { CanonicalTopologyVertex } from './canonical-topology.js';
import type { RegionName } from './canonical-human.js';

/**
 * HD BODY V0.2 — clean-manifold parametric body.
 *
 * Replaces the disconnected-tube body (buildHdBodySkin) which self-intersected
 * heavily at rest (~11k pairs) because torso/arms/legs/feet were separate closed
 * columns fused only by concatenation. This generator computes a single united
 * *implicit* volume (union of skeleton-aligned capsules for torso, shoulders,
 * arms, hands, legs, feet) and extracts ONE watertight isosurface with
 * marching-tetrahedra on a fixed grid.
 *
 * Properties:
 *   - A single closed, non-self-overlapping manifold (min-union of capsules → no
 *     internal walls, no tube-vs-tube interpenetration beyond the smooth joints
 *     of the union surface). This lets the P22 hard self-intersection gate run
 *     with pairs == 0 on the body region at rest.
 *   - Fixed grid ⇒ fixed topology (vertex count + connectivity deterministic for
 *     a given resolution), so the displacement-morph pipeline keeps working:
 *     shape-space bases displace the SAME vertices.
 *   - Per-vertex SEMANTIC regions re-derived from the nearest capsule and local
 *     surface position (chest/abdomen/pelvis/back/side split), and SMOOTH
 *     skeleton skin weights via inverse-distance blending to the nearest bones —
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
// Marching cubes (standard 256-case lookup ⇒ watertight isosurface).
// ---------------------------------------------------------------------------

interface CellVert {
  pos: V3;
  bone: string;
}

/** Cube corner positions (index matches marching-cubes bit order). */
const MC_CORNERS: V3[] = [
  p(0, 0, 0),
  p(1, 0, 0),
  p(1, 0, 1),
  p(0, 0, 1),
  p(0, 1, 0),
  p(1, 1, 0),
  p(1, 1, 1),
  p(0, 1, 1),
];

/** Critical: exact coordinate for each of the 12 cube edges. */
const EDGE_CORNER: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// Standard marching-cubes edge selection bitmask (12 bits, one per cube edge).
const EDGE_TABLE: number[] = [
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c, 0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c, 0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c, 0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac, 0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c, 0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc, 0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c, 0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc, 0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc, 0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c, 0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc, 0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c, 0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac, 0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c, 0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c, 0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c, 0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0,
];

// Standard triTable: 256 rows × up to 16 ints; -1 terminates. Values are edge
// indices (0-11) into EDGE_CORNER.
const TRI_TABLE: number[][] = [
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1],
  [3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  [3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  [3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  [9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
  [9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  [8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  [4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  [5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1],
  [9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  [0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  [5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  [9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  [1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1],
  [2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1],
  [11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  [11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1],
  [9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1],
  [2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1],
  [6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1],
  [10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1],
  [10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1],
  [8, 1, 4, 1, 6, 4, 1, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1],
  [0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  [6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1],
  [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1],
  [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1],
  [10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  [7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  [7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  [0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1],
  [7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  [10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  [2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1],
  [7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  [2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1],
  [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1],
  [10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1],
  [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1],
  [7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  [6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  [8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1],
  [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1],
  [6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1],
  [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1],
  [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  [8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  [0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1],
  [1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1],
  [10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
  [10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  [5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1],
  [9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1],
  [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1],
  [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  [7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1],
  [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1],
  [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1],
  [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1],
  [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
  [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
  [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1],
  [6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1],
  [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1],
  [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1],
  [6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1],
  [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
  [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
  [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1],
  [9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
  [1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
  [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1],
  [0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1],
  [5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1],
  [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1],
  [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1],
  [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
  [2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1],
  [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1],
  [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  [1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  [9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  [9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1],
  [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1],
  [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1],
  [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1],
  [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
  [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
  [9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1],
  [5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
  [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1],
  [8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  [0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1],
  [9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1],
  [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1],
  [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1],
  [3, 4, 8, 3, 11, 4, 11, 0, 4, 1, 0, 10, 11, 10, 0, -1],
  [4, 1, 7, 4, 9, 1, 1, 2, 7, 11, 7, 2, ????]

/** Weld duplicated vertices produced across cubes/tets (exact position match). */
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
 * mesh. The sphere must triangulate to a watertight closed surface (χ = 2, zero
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
