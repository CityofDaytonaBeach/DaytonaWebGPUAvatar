import { AnatomyDimensions } from '../../anatomy/parametric/parametric-anatomy.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { Vec3, vec3 } from '../../core/math/vec.js';
import { RegionName } from '../../geometry/canonical/canonical-human.js';

export type HumanSdfPrimitiveKind = 'sphere' | 'capsule';

export interface HumanSdfPrimitive {
  kind: HumanSdfPrimitiveKind;
  region: RegionName;
  a: Vec3;
  b?: Vec3;
  radius: number;
}

export interface HumanSdfSample {
  distance: number;
  region: RegionName;
  primitive: HumanSdfPrimitive;
}

// ---------------------------------------------------------------------------
// LOD configuration
// ---------------------------------------------------------------------------

export type SdfLodLevel = 0 | 1 | 2 | 3;

export const SDF_LOW_LOD = 0 as SdfLodLevel;
export const SDF_MEDIUM_LOD = 1 as SdfLodLevel;
export const SDF_HIGH_LOD = 2 as SdfLodLevel;
export const SDF_ULTRA_LOD = 3 as SdfLodLevel;

/** Which body-region tiers are included at each LOD. */
export interface SdfLodProfile {
  level: SdfLodLevel;
  /** Include spine/torso tier. */
  includeTorso: boolean;
  /** Include head/neck tier. */
  includeHead: boolean;
  /** Include limb tiers (upper arm, forearm, hand, thigh, shin, foot). */
  includeLimbs: boolean;
  /** Include fine detail tiers (finger/hand tip capsules). */
  includeDigits: boolean;
}

/**
 * Progressive primitive budgets. Each level builds on the previous, so
 * primitive count grows monotonically with LOD:
 *   low    -> torso only (5-ish capsules)
 *   medium -> + head/neck
 *   high   -> + limbs
 *   ultra  -> + hand-tip detail
 */
export const SDF_LOD_PROFILES: Record<SdfLodLevel, SdfLodProfile> = {
  0: {
    level: SDF_LOW_LOD,
    includeTorso: true,
    includeHead: false,
    includeLimbs: false,
    includeDigits: false,
  },
  1: {
    level: SDF_MEDIUM_LOD,
    includeTorso: true,
    includeHead: true,
    includeLimbs: false,
    includeDigits: false,
  },
  2: {
    level: SDF_HIGH_LOD,
    includeTorso: true,
    includeHead: true,
    includeLimbs: true,
    includeDigits: false,
  },
  3: {
    level: SDF_ULTRA_LOD,
    includeTorso: true,
    includeHead: true,
    includeLimbs: true,
    includeDigits: true,
  },
};

// ---------------------------------------------------------------------------
// Collision primitives (sphere / capsule / box union)
// ---------------------------------------------------------------------------

export type CollisionPrimitiveKind = 'sphere' | 'capsule' | 'box';

/** Generic collision primitive usable by hair, cloth and external systems. */
export type CollisionPrimitive =
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'capsule'; a: Vec3; b: Vec3; radius: number }
  | { kind: 'box'; center: Vec3; halfExtents: Vec3 };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type SdfQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface SdfCollisionConfig {
  /** Overall quality tier. */
  quality: SdfQuality;
  /** Maps to a discrete LOD level for the skeleton field. */
  lod: SdfLodLevel;
  /** Padding (metres) around primitives used by cloth/hair collision. */
  collisionPadding: number;
  /** Number of integration sub-steps per collision solve. */
  solveIterations: number;
  /** Enable velocity-based future-position prediction. */
  predictionEnabled: boolean;
  /** Time window (seconds) used for velocity-based position prediction. */
  predictionTime: number;
  /** Enable batch queries; batches process all samples in one traversal. */
  batchingEnabled: boolean;
  /** Include external hair/cloth primitives in the sample traversal. */
  externalCollisionsEnabled: boolean;
  /** Maximum number of external primitives that participate in queries. */
  maxExternalPrimitives: number;
  /** Whether nearest-surface queries approximate distance to sub-mesh detail. */
  exactNearestSurface: boolean;
}

const DEFAULT_LOD_BY_QUALITY: Record<SdfQuality, SdfLodLevel> = {
  low: SDF_LOW_LOD,
  medium: SDF_MEDIUM_LOD,
  high: SDF_HIGH_LOD,
  ultra: SDF_ULTRA_LOD,
};

export function defaultSdfCollisionConfig(quality: SdfQuality = 'medium'): SdfCollisionConfig {
  const lod = DEFAULT_LOD_BY_QUALITY[quality];
  return {
    quality,
    lod,
    collisionPadding: 0.012,
    solveIterations: quality === 'low' ? 1 : quality === 'medium' ? 2 : quality === 'high' ? 4 : 8,
    predictionEnabled: true,
    predictionTime: 1 / 60,
    batchingEnabled: true,
    externalCollisionsEnabled: true,
    maxExternalPrimitives:
      quality === 'low' ? 16 : quality === 'medium' ? 64 : quality === 'high' ? 256 : 1024,
    exactNearestSurface: quality === 'high' || quality === 'ultra',
  };
}

// ---------------------------------------------------------------------------
// HumanSdfField
// ---------------------------------------------------------------------------

export interface HumanSdfNearestSample {
  /** Signed distance to the surface. */
  distance: number;
  /** Closest point on the primitive surface (approx surface point). */
  point: Vec3;
  /** Outward-pointing unit surface normal at the closest point. */
  normal: Vec3;
  /** Region that owns the closest primitive. */
  region: RegionName;
  primitive: HumanSdfPrimitive;
}

export interface HumanSdfBatchResult {
  samples: HumanSdfSample[];
  /** Nearest surface results for each input point. */
  nearest: HumanSdfNearestSample[];
}

export interface ExternalCollisionInputs {
  /** Hair strand particles as spheres (or capsule segments). */
  hair?: CollisionPrimitive[];
  /** Cloth particle collision spheres. */
  cloth?: CollisionPrimitive[];
  /** Arbitrary user collision primitives. */
  custom?: CollisionPrimitive[];
}

export class HumanSdfField {
  readonly primitives: HumanSdfPrimitive[];
  private readonly config: SdfCollisionConfig;
  private external: CollisionPrimitive[];

  constructor(
    primitives: HumanSdfPrimitive[],
    config: SdfCollisionConfig = defaultSdfCollisionConfig(),
  ) {
    this.primitives = primitives;
    this.config = config;
    this.external = [];
  }

  /** Attach (or replace) external hair/cloth/custom collision primitives. */
  setExternalCollisions(inputs: ExternalCollisionInputs | null): void {
    if (!inputs) {
      this.external = [];
      return;
    }
    const hair = inputs.hair ?? [];
    const cloth = inputs.cloth ?? [];
    const custom = inputs.custom ?? [];
    const all = [...hair, ...cloth, ...custom];
    this.external =
      all.length > this.config.maxExternalPrimitives
        ? all.slice(0, this.config.maxExternalPrimitives)
        : all;
  }

  /** Get the currently attached external collision primitives. */
  externalCollisions(): readonly CollisionPrimitive[] {
    return this.external;
  }

  get configSnapshot(): SdfCollisionConfig {
    return { ...this.config };
  }

  sample(p: Vec3): HumanSdfSample {
    if (this.primitives.length === 0 && this.external.length === 0) {
      throw new Error('Human SDF has no primitives');
    }
    let best: HumanSdfSample | null = null;
    for (const primitive of this.primitives) {
      const distance = primitiveDistance(p, primitive);
      if (!best || distance < best.distance) {
        best = { distance, region: primitive.region, primitive };
      }
    }
    if (this.config.externalCollisionsEnabled) {
      for (const primitive of this.external) {
        const distance = collisionPrimitiveDistance(p, primitive);
        if (!best || distance < best.distance) {
          best = {
            distance,
            region: 'torso',
            primitive: toHumanPrimitive(primitive),
          };
        }
      }
    }
    return best!;
  }

  distance(p: Vec3): number {
    return this.sample(p).distance;
  }

  /**
   * Batch distance query: samples many points in a single traversal of the
   * primitive list, returning signed distance + region for each.
   */
  sampleBatch(points: Vec3[]): HumanSdfSample[] {
    const out = new Array<HumanSdfSample>(points.length);
    for (let i = 0; i < points.length; i++) out[i] = this.sample(points[i]);
    return out;
  }

  /** Convenience alias for the batch API. */
  sampleMany(points: Vec3[]): HumanSdfSample[] {
    return this.sampleBatch(points);
  }

  /** Distance-only batch pass. */
  distanceBatch(points: Vec3[]): number[] {
    return this.sampleBatch(points).map((s) => s.distance);
  }

  /**
   * Nearest-point-on-surface query: returns signed distance, closest surface
   * point, and outward normal for a single sample point.
   */
  nearestSurface(p: Vec3): HumanSdfNearestSample {
    if (this.primitives.length === 0 && this.external.length === 0) {
      throw new Error('Human SDF has no primitives');
    }
    let best: HumanSdfNearestSample | null = null;
    for (const primitive of this.primitives) {
      const r = nearestOnPrimitive(p, primitive);
      if (!best || r.distance < best.distance) best = r;
    }
    if (this.config.externalCollisionsEnabled) {
      for (const primitive of this.external) {
        const r = nearestOnCollisionPrimitive(p, primitive);
        r.region = 'torso';
        r.primitive = toHumanPrimitive(primitive);
        if (!best || r.distance < best.distance) best = r;
      }
    }
    return best!;
  }

  /** Batch nearest-surface query. */
  nearestSurfaceBatch(points: Vec3[]): HumanSdfNearestSample[] {
    return points.map((p) => this.nearestSurface(p));
  }

  /**
   * Predict the future position of a point given its current velocity, then
   * resolve distance + nearest surface at that predicted position without
   * mutating the field.
   */
  predict(p: Vec3, velocity: Vec3, dt: number = this.config.predictionTime): HumanSdfPredictResult {
    const future = add(p, scale(velocity, dt));
    const nearest = this.nearestSurface(future);
    const depth = nearest.distance - this.config.collisionPadding;
    return {
      current: p,
      predicted: future,
      velocity,
      dt,
      distance: nearest.distance,
      nearest,
      penetrationDepth: Math.min(0, depth),
      willCollide: nearest.distance < this.config.collisionPadding,
    };
  }

  /** Batch velocity-based prediction. */
  predictBatch(points: Vec3[], velocities: Vec3[], dt?: number): HumanSdfPredictResult[] {
    if (points.length !== velocities.length) {
      throw new Error('predictBatch: points and velocities must have equal length');
    }
    const out = new Array<HumanSdfPredictResult>(points.length);
    for (let i = 0; i < points.length; i++) {
      out[i] = this.predict(points[i], velocities[i], dt ?? this.config.predictionTime);
    }
    return out;
  }

  /**
   * Rebuild joint-space primitives from a fresh skeleton without recreating
   * the field. Replaces the transforms of every skeleton-derived primitive in
   * place and returns the field for chaining.
   */
  updateFromSkeleton(
    skeleton: BoneDef[],
    dims: AnatomyDimensions,
    lod: SdfLodLevel = this.config.lod,
  ): HumanSdfField {
    if (this.primitives.length === 0) {
      throw new Error('updateFromSkeleton: field has no primitives to update');
    }
    const rebuilt = buildHumanSdfField(dims, skeleton, lod);
    if (rebuilt.primitives.length !== this.primitives.length) {
      throw new Error('updateFromSkeleton: rebuilt primitive count does not match existing field');
    }
    for (let i = 0; i < this.primitives.length; i++) {
      const dest = this.primitives[i];
      const src = rebuilt.primitives[i];
      dest.a.x = src.a.x;
      dest.a.y = src.a.y;
      dest.a.z = src.a.z;
      if (dest.b && src.b) {
        dest.b.x = src.b.x;
        dest.b.y = src.b.y;
        dest.b.z = src.b.z;
      }
      dest.radius = src.radius;
    }
    return this;
  }
}

export interface HumanSdfPredictResult {
  current: Vec3;
  predicted: Vec3;
  velocity: Vec3;
  dt: number;
  distance: number;
  nearest: HumanSdfNearestSample;
  /** Negative when the predicted point penetrates the collision surface. */
  penetrationDepth: number;
  willCollide: boolean;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function buildHumanSdfField(
  dims: AnatomyDimensions,
  skeleton: BoneDef[],
  lod: SdfLodLevel = SDF_HIGH_LOD,
): HumanSdfField {
  const profile: SdfLodProfile = SDF_LOD_PROFILES[lod];
  const joints = worldJoints(skeleton);
  const joint = (name: string) => joints.get(name) ?? vec3();
  const primitives: HumanSdfPrimitive[] = [];

  if (profile.includeTorso) {
    primitives.push({
      kind: 'capsule',
      region: 'torso',
      a: joint('pelvis'),
      b: joint('chest'),
      radius: Math.max(dims.waistHalfWidth, dims.torsoHalfDepth) * 0.92,
    });
  }
  if (profile.includeHead) {
    primitives.push({
      kind: 'sphere',
      region: 'head',
      a: joint('head'),
      radius: dims.height * 0.09 * dims.headScale,
    });
    primitives.push({
      kind: 'capsule',
      region: 'neck',
      a: joint('neck'),
      b: joint('head'),
      radius: dims.height * 0.035,
    });
  }
  if (profile.includeLimbs) {
    addLimb(primitives, 'upperarm_l', joint('upperarm_l'), joint('forearm_l'), dims.height * 0.04);
    addLimb(primitives, 'upperarm_r', joint('upperarm_r'), joint('forearm_r'), dims.height * 0.04);
    addLimb(primitives, 'forearm_l', joint('forearm_l'), joint('hand_l'), dims.height * 0.032);
    addLimb(primitives, 'forearm_r', joint('forearm_r'), joint('hand_r'), dims.height * 0.032);
    addLimb(
      primitives,
      'hand_l',
      joint('hand_l'),
      add(joint('hand_l'), vec3(0, -dims.handLength * 0.45, 0)),
      dims.height * 0.03,
    );
    addLimb(
      primitives,
      'hand_r',
      joint('hand_r'),
      add(joint('hand_r'), vec3(0, -dims.handLength * 0.45, 0)),
      dims.height * 0.03,
    );
    addLimb(primitives, 'thigh_l', joint('thigh_l'), joint('shin_l'), dims.height * 0.055);
    addLimb(primitives, 'thigh_r', joint('thigh_r'), joint('shin_r'), dims.height * 0.055);
    addLimb(primitives, 'shin_l', joint('shin_l'), joint('foot_l'), dims.height * 0.04);
    addLimb(primitives, 'shin_r', joint('shin_r'), joint('foot_r'), dims.height * 0.04);
  }
  if (profile.includeDigits) {
    addLimb(
      primitives,
      'hand_l',
      joint('hand_l'),
      add(joint('hand_l'), vec3(0, -dims.handLength * 0.78, 0)),
      dims.height * 0.022,
    );
    addLimb(
      primitives,
      'hand_r',
      joint('hand_r'),
      add(joint('hand_r'), vec3(0, -dims.handLength * 0.78, 0)),
      dims.height * 0.022,
    );
  }

  return new HumanSdfField(primitives, defaultSdfCollisionConfig(qualityForLod(lod)));
}

function qualityForLod(lod: SdfLodLevel): SdfQuality {
  switch (lod) {
    case SDF_LOW_LOD:
      return 'low';
    case SDF_MEDIUM_LOD:
      return 'medium';
    case SDF_HIGH_LOD:
      return 'high';
    case SDF_ULTRA_LOD:
      return 'ultra';
    default:
      return 'medium';
  }
}

function addLimb(
  primitives: HumanSdfPrimitive[],
  region: RegionName,
  a: Vec3,
  b: Vec3,
  radius: number,
): void {
  primitives.push({ kind: 'capsule', region, a, b, radius });
}

function worldJoints(skeleton: BoneDef[]): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const bone of skeleton) {
    const parent = bone.parent ? (out.get(bone.parent) ?? vec3()) : vec3();
    out.set(bone.name, add(parent, bone.localPosition));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Distance / closest-point utilities (exported)
// ---------------------------------------------------------------------------

/**
 * Closest point on a capsule (cylinder + 2 hemispherical caps) to a query
 * point, together with the segment parameter t in [0,1].
 */
export function capsulePointClosest(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  radius: number,
): { point: Vec3; t: number; distance: number } {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const denom = dot(ba, ba);
  const t = denom > 1e-12 ? clamp(dot(pa, ba) / denom, 0, 1) : 0;
  const axisPoint = add(a, scale(ba, t));
  const toAxis = sub(p, axisPoint);
  const len = length(toAxis);
  const point = len > 1e-9 ? add(axisPoint, scale(toAxis, radius / len)) : add(axisPoint, unitY());
  return { point, t, distance: Math.max(0, len - radius) };
}

/** Distance between two capsules (segment-segment closest approach minus radii). */
export function capsuleCapsuleDistance(
  a1: Vec3,
  b1: Vec3,
  r1: number,
  a2: Vec3,
  b2: Vec3,
  r2: number,
): number {
  const { distance: segmentDistance } = segmentSegmentClosest(a1, b1, a2, b2);
  return Math.max(0, segmentDistance - (r1 + r2));
}

/** Distance between two spheres. */
export function sphereSphereDistance(c1: Vec3, r1: number, c2: Vec3, r2: number): number {
  return Math.max(0, length(sub(c1, c2)) - (r1 + r2));
}

/**
 * Distance between a capsule and an axis-aligned box. Samples the closest
 * point on the capsule axis to the box, then measures signed distance from
 * that axis point to the box surface, minus the capsule radius.
 */
export function capsuleBoxDistance(
  a: Vec3,
  b: Vec3,
  r: number,
  center: Vec3,
  halfExtents: Vec3,
): number {
  const { point } = capsulePointClosest(center, a, b, 0);
  const boxDistance = boxSdf(center, halfExtents, point);
  return Math.max(0, boxDistance - r);
}

/** Clamp a point to the surface/solid region of an axis-aligned box. */
export function clampBoxPoint(p: Vec3, center: Vec3, halfExtents: Vec3): Vec3 {
  return vec3(
    clamp(p.x, center.x - halfExtents.x, center.x + halfExtents.x),
    clamp(p.y, center.y - halfExtents.y, center.y + halfExtents.y),
    clamp(p.z, center.z - halfExtents.z, center.z + halfExtents.z),
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function primitiveDistance(p: Vec3, primitive: HumanSdfPrimitive): number {
  return primitive.kind === 'sphere'
    ? sphereSdf(p, primitive.a, primitive.radius)
    : capsuleSdf(p, primitive.a, primitive.b ?? primitive.a, primitive.radius);
}

function collisionPrimitiveDistance(p: Vec3, primitive: CollisionPrimitive): number {
  switch (primitive.kind) {
    case 'sphere':
      return sphereSdf(p, primitive.center, primitive.radius);
    case 'capsule':
      return capsuleSdf(p, primitive.a, primitive.b, primitive.radius);
    case 'box':
      return boxSdf(primitive.center, primitive.halfExtents, p);
  }
}

function nearestOnPrimitive(p: Vec3, primitive: HumanSdfPrimitive): HumanSdfNearestSample {
  if (primitive.kind === 'sphere') {
    return nearestOnSphere(p, primitive.a, primitive.radius, primitive.region, primitive);
  }
  const b = primitive.b ?? primitive.a;
  return nearestOnCapsule(p, primitive.a, b, primitive.radius, primitive.region, primitive);
}

function nearestOnCollisionPrimitive(
  p: Vec3,
  primitive: CollisionPrimitive,
): HumanSdfNearestSample {
  const humanPrimitive = toHumanPrimitive(primitive);
  switch (primitive.kind) {
    case 'sphere':
      return nearestOnSphere(p, primitive.center, primitive.radius, 'torso', humanPrimitive);
    case 'capsule':
      return nearestOnCapsule(
        p,
        primitive.a,
        primitive.b,
        primitive.radius,
        'torso',
        humanPrimitive,
      );
    case 'box': {
      const clamped = clampBoxPoint(p, primitive.center, primitive.halfExtents);
      const distance = boxSdf(primitive.center, primitive.halfExtents, p);
      const toP = sub(p, clamped);
      const len = length(toP);
      const normal = len > 1e-9 ? scale(toP, 1 / len) : unitY();
      return {
        distance,
        point: clamped,
        normal,
        region: 'torso',
        primitive: humanPrimitive,
      };
    }
  }
}

function nearestOnSphere(
  p: Vec3,
  center: Vec3,
  radius: number,
  region: RegionName,
  primitive: HumanSdfPrimitive,
): HumanSdfNearestSample {
  const offset = sub(p, center);
  const len = length(offset);
  const distance = len - radius;
  const normal = len > 1e-9 ? scale(offset, 1 / len) : unitY();
  const point = add(center, scale(normal, radius));
  return { distance, point, normal, region, primitive };
}

function nearestOnCapsule(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  radius: number,
  region: RegionName,
  primitive: HumanSdfPrimitive,
): HumanSdfNearestSample {
  const { point } = capsulePointClosest(p, a, b, 0);
  const toSurface = sub(p, point);
  const len = length(toSurface);
  const distance = len - radius;
  const normal = len > 1e-9 ? scale(toSurface, 1 / len) : unitY();
  const surfacePoint = add(point, scale(normal, radius));
  return { distance, point: surfacePoint, normal, region, primitive };
}

function toHumanPrimitive(primitive: CollisionPrimitive): HumanSdfPrimitive {
  switch (primitive.kind) {
    case 'sphere':
      return { kind: 'sphere', region: 'torso', a: primitive.center, radius: primitive.radius };
    case 'capsule':
      return {
        kind: 'capsule',
        region: 'torso',
        a: primitive.a,
        b: primitive.b,
        radius: primitive.radius,
      };
    case 'box': {
      return {
        kind: 'capsule',
        region: 'torso',
        a: primitive.center,
        radius: Math.max(primitive.halfExtents.x, primitive.halfExtents.y, primitive.halfExtents.z),
      };
    }
  }
}

function sphereSdf(p: Vec3, center: Vec3, radius: number): number {
  return length(sub(p, center)) - radius;
}

function capsuleSdf(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = clamp(dot(pa, ba) / Math.max(dot(ba, ba), 1e-8), 0, 1);
  return length(sub(pa, scale(ba, h))) - radius;
}

/** Signed distance to an axis-aligned box (centered). */
function boxSdf(center: Vec3, halfExtents: Vec3, p: Vec3): number {
  const qx = Math.abs(p.x - center.x) - halfExtents.x;
  const qy = Math.abs(p.y - center.y) - halfExtents.y;
  const qz = Math.abs(p.z - center.z) - halfExtents.z;
  const outside = length(vec3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

/**
 * Closest-point-of-approach between two line segments. Returns the minimum
 * distance and the closest points on each segment.
 */
export function segmentSegmentClosest(
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { distance: number; closest1: Vec3; closest2: Vec3; t1: number; t2: number } {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s: number;
  let t: number;

  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    const denom = a * e - dot(d1, d2) * dot(d1, d2);
    if (denom !== 0) {
      s = clamp((c * e - f * dot(d1, d2)) / denom, 0, 1);
    } else {
      s = 0;
    }
    t = (dot(d1, d2) * s + f) / (e > 1e-12 ? e : 1);
    t = clamp(t, 0, 1);
    // Recalculate s with the constrained t to stay inside the segments.
    s = (dot(d1, d2) * t - c) / (a > 1e-12 ? a : 1);
    s = clamp(s, 0, 1);
  }

  const closest1 = add(p1, scale(d1, s));
  const closest2 = add(p2, scale(d2, t));
  return { distance: length(sub(closest1, closest2)), closest1, closest2, t1: s, t2: t };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return vec3(a.x * s, a.y * s, a.z * s);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function unitY(): Vec3 {
  return vec3(0, 1, 0);
}
