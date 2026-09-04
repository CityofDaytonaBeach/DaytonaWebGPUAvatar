import type { Quat, Vec3 } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from './skeletal-animation.js';
/**
 * kinematics — the forward-kinematics layer the motion/IK systems were missing.
 *
 * Until now the motion compiler produced *local* bone rotations and nothing in
 * the SDK could answer "where did the hand actually end up?". That made IK and
 * look-at unverifiable (they were heuristic pose recipes, hence PROTOTYPE). This
 * module supplies the deterministic FK evaluator plus the small quaternion
 * toolkit that IK, look-at, and retargeting all build on.
 *
 * Conventions (fixed here, once, for the whole animation stack):
 *   worldRot(bone)  = worldRot(parent) * restRotation(bone) * localRot(pose)
 *   worldPos(bone)  = worldPos(parent) + rotate(worldRot(parent), localPosition)
 *
 * Everything is pure and allocation-light: the same skeleton + poses always
 * produce byte-identical transforms, which is what the determinism gates require.
 */
export interface BoneTransform {
    name: BoneName;
    worldPos: Vec3;
    worldRot: Quat;
}
export type PoseMap = ReadonlyMap<string, BonePose>;
export declare function quatMul(a: Quat, b: Quat): Quat;
export declare function quatConjugate(q: Quat): Quat;
export declare function quatFromAxisAngle(axis: Vec3, angleRad: number): Quat;
export declare function rotateVec3(q: Quat, v: Vec3): Vec3;
/** Shortest-arc rotation taking unit vector `from` onto unit vector `to`. */
export declare function quatBetween(from: Vec3, to: Vec3): Quat;
export declare function normalizeVec3(v: Vec3): Vec3;
export declare function addVec3(a: Vec3, b: Vec3): Vec3;
export declare function subVec3(a: Vec3, b: Vec3): Vec3;
export declare function scaleVec3(v: Vec3, s: number): Vec3;
export declare function crossVec3(a: Vec3, b: Vec3): Vec3;
export declare function dotVec3(a: Vec3, b: Vec3): number;
export declare function distanceVec3(a: Vec3, b: Vec3): number;
/** Quaternion → intrinsic XYZ euler angles in degrees (matches quatFromEulerDeg). */
export declare function quatToEulerDeg(q: Quat): Vec3;
/** Order the skeleton parents-first so a single pass can evaluate FK. */
export declare function topologicalBoneOrder(skeleton: BoneDef[]): BoneDef[];
export declare function poseMap(poses: readonly BonePose[]): Map<string, BonePose>;
/**
 * Evaluate world-space transforms for every bone under `poses`.
 * Bones without a pose fall back to their rest transform.
 */
export declare function forwardKinematics(skeleton: BoneDef[], poses?: readonly BonePose[] | PoseMap): Map<BoneName, BoneTransform>;
/** World-space position of a single bone joint under `poses`. */
export declare function boneWorldPosition(skeleton: BoneDef[], bone: BoneName, poses?: readonly BonePose[]): Vec3 | null;
/** Resolve `root -> ... -> leaf` as an ordered bone chain, or null if unrelated. */
export declare function resolveBoneChain(skeleton: BoneDef[], root: BoneName, leaf: BoneName): BoneName[] | null;
/** Clamp a local rotation into the bone's authored euler limits (no-op when absent). */
export declare function clampPoseToLimits(bone: BoneDef, rot: Quat): Quat;
/** Inverse of `quatToEulerDeg` (kept local so kinematics has no import cycle). */
export declare function eulerDegToQuat(xDeg: number, yDeg: number, zDeg: number): Quat;
//# sourceMappingURL=kinematics.d.ts.map