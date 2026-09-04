import { AnatomyDimensions } from '../../anatomy/parametric/parametric-anatomy.js';
import { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import { Vec3 } from '../../core/math/vec.js';
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
export type SdfLodLevel = 0 | 1 | 2 | 3;
export declare const SDF_LOW_LOD: SdfLodLevel;
export declare const SDF_MEDIUM_LOD: SdfLodLevel;
export declare const SDF_HIGH_LOD: SdfLodLevel;
export declare const SDF_ULTRA_LOD: SdfLodLevel;
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
export declare const SDF_LOD_PROFILES: Record<SdfLodLevel, SdfLodProfile>;
export type CollisionPrimitiveKind = 'sphere' | 'capsule' | 'box';
/** Generic collision primitive usable by hair, cloth and external systems. */
export type CollisionPrimitive = {
    kind: 'sphere';
    center: Vec3;
    radius: number;
} | {
    kind: 'capsule';
    a: Vec3;
    b: Vec3;
    radius: number;
} | {
    kind: 'box';
    center: Vec3;
    halfExtents: Vec3;
};
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
export declare function defaultSdfCollisionConfig(quality?: SdfQuality): SdfCollisionConfig;
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
export declare class HumanSdfField {
    readonly primitives: HumanSdfPrimitive[];
    private readonly config;
    private external;
    constructor(primitives: HumanSdfPrimitive[], config?: SdfCollisionConfig);
    /** Attach (or replace) external hair/cloth/custom collision primitives. */
    setExternalCollisions(inputs: ExternalCollisionInputs | null): void;
    /** Get the currently attached external collision primitives. */
    externalCollisions(): readonly CollisionPrimitive[];
    get configSnapshot(): SdfCollisionConfig;
    sample(p: Vec3): HumanSdfSample;
    distance(p: Vec3): number;
    /**
     * Batch distance query: samples many points in a single traversal of the
     * primitive list, returning signed distance + region for each.
     */
    sampleBatch(points: Vec3[]): HumanSdfSample[];
    /** Convenience alias for the batch API. */
    sampleMany(points: Vec3[]): HumanSdfSample[];
    /** Distance-only batch pass. */
    distanceBatch(points: Vec3[]): number[];
    /**
     * Nearest-point-on-surface query: returns signed distance, closest surface
     * point, and outward normal for a single sample point.
     */
    nearestSurface(p: Vec3): HumanSdfNearestSample;
    /** Batch nearest-surface query. */
    nearestSurfaceBatch(points: Vec3[]): HumanSdfNearestSample[];
    /**
     * Predict the future position of a point given its current velocity, then
     * resolve distance + nearest surface at that predicted position without
     * mutating the field.
     */
    predict(p: Vec3, velocity: Vec3, dt?: number): HumanSdfPredictResult;
    /** Batch velocity-based prediction. */
    predictBatch(points: Vec3[], velocities: Vec3[], dt?: number): HumanSdfPredictResult[];
    /**
     * Rebuild joint-space primitives from a fresh skeleton without recreating
     * the field. Replaces the transforms of every skeleton-derived primitive in
     * place and returns the field for chaining.
     */
    updateFromSkeleton(skeleton: BoneDef[], dims: AnatomyDimensions, lod?: SdfLodLevel): HumanSdfField;
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
export declare function buildHumanSdfField(dims: AnatomyDimensions, skeleton: BoneDef[], lod?: SdfLodLevel): HumanSdfField;
/**
 * Closest point on a capsule (cylinder + 2 hemispherical caps) to a query
 * point, together with the segment parameter t in [0,1].
 */
export declare function capsulePointClosest(p: Vec3, a: Vec3, b: Vec3, radius: number): {
    point: Vec3;
    t: number;
    distance: number;
};
/** Distance between two capsules (segment-segment closest approach minus radii). */
export declare function capsuleCapsuleDistance(a1: Vec3, b1: Vec3, r1: number, a2: Vec3, b2: Vec3, r2: number): number;
/** Distance between two spheres. */
export declare function sphereSphereDistance(c1: Vec3, r1: number, c2: Vec3, r2: number): number;
/**
 * Distance between a capsule and an axis-aligned box. Samples the closest
 * point on the capsule axis to the box, then measures signed distance from
 * that axis point to the box surface, minus the capsule radius.
 */
export declare function capsuleBoxDistance(a: Vec3, b: Vec3, r: number, center: Vec3, halfExtents: Vec3): number;
/** Clamp a point to the surface/solid region of an axis-aligned box. */
export declare function clampBoxPoint(p: Vec3, center: Vec3, halfExtents: Vec3): Vec3;
/**
 * Closest-point-of-approach between two line segments. Returns the minimum
 * distance and the closest points on each segment.
 */
export declare function segmentSegmentClosest(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): {
    distance: number;
    closest1: Vec3;
    closest2: Vec3;
    t1: number;
    t2: number;
};
//# sourceMappingURL=human-sdf.d.ts.map