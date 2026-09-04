import { Quat, Vec3 } from '../../core/math/vec.js';
import { AnatomyDimensions } from '../parametric/parametric-anatomy.js';
export type BoneName = 'root' | 'pelvis' | 'spine_01' | 'spine_02' | 'chest' | 'neck' | 'head' | 'jaw' | 'clavicle_l' | 'clavicle_r' | 'upperarm_l' | 'upperarm_r' | 'forearm_l' | 'forearm_r' | 'hand_l' | 'hand_r' | 'thigh_l' | 'thigh_r' | 'shin_l' | 'shin_r' | 'foot_l' | 'foot_r';
export interface JointLimits {
    minDeg: Vec3;
    maxDeg: Vec3;
}
export interface BoneDef {
    name: BoneName;
    parent: BoneName | null;
    localPosition: Vec3;
    restRotation: Quat;
    limits?: JointLimits;
}
/** Parametric default human skeleton (v0.1 â€” T-pose, 21 joints). */
export declare function defaultSkeleton(): BoneDef[];
/**
 * Parametric joint placement: resolves a T-pose skeleton whose segment lengths
 * and joint offsets match the anatomy dimensions resolved from the Human
 * Definition. Because both the canonical geometry and this skeleton are driven
 * by the same `AnatomyDimensions`, the joints stay registered with the mesh as
 * the identity body properties change.
 */
export declare function placeSkeletonFromDefinition(d: AnatomyDimensions): BoneDef[];
//# sourceMappingURL=skeleton.d.ts.map