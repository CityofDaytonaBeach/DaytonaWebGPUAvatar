import { Quat, Vec3 } from '../../core/math/vec.js';
export interface BonePose {
    name: string;
    localPos: Vec3;
    localRot: Quat;
}
export type AnimationChannel = {
    bone: string;
    times: number[];
    rotations: Quat[];
};
/**
 * Skeletal animation system. Holds animation clips, blends them, and produces
 * an ordered list of bone poses for a given time. Layering is supported via a
 * list of active clips with blend weights.
 */
export declare class SkeletalAnimation {
    private clips;
    private clipWeights;
    addClip(name: string, channels: AnimationChannel[]): void;
    setWeight(name: string, weight: number): void;
    /**
     * Compute bone poses at time `t`. Sums weighted rotations across active
     * clips (simple nlerp-style accumulation, v0.1).
     */
    sample(boneNames: string[], t: number): BonePose[];
}
export declare function sampleChannel(channel: AnimationChannel, t: number): Quat;
export declare function nlerp(a: Quat, b: Quat, t: number): Quat;
export declare function normalizeQuat(q: Quat): Quat;
export declare function quatFromEulerDeg(xDeg: number, yDeg: number, zDeg: number): Quat;
//# sourceMappingURL=skeletal-animation.d.ts.map