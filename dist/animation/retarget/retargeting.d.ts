import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
/**
 * retargeting — move a pose or clip from a source skeleton onto a target skeleton.
 *
 * Motion authored against one rig (a taller human, a differently-proportioned
 * parametric body, an imported clip) has to be replayable on another, otherwise
 * every identity change invalidates the animation library. Retargeting was the
 * last unbuilt piece of the motion story.
 *
 * The mapping is rest-pose relative, which is what makes it correct across rigs
 * with different rest orientations:
 *
 *   localRot_target = rest_target⁻¹ * (rest_source * localRot_source) * rest_target⁻¹⁺
 *
 * concretely: the source's *world-of-rest* delta is re-expressed in the target
 * bone's rest frame, so a "rotate the elbow 40° in its own socket" reads the same
 * on both rigs. Translations are scaled by the skeletons' height ratio so root
 * motion and any authored offsets keep their proportion instead of shrinking.
 *
 * Deterministic, pure, and additive: no existing clip or pose API changes.
 */
export interface RetargetMap {
    /** source bone name -> target bone name. */
    bones: ReadonlyMap<string, BoneName>;
    /** Uniform translation scale (target height / source height). */
    scale: number;
    /** Source bones with no counterpart on the target rig. */
    unmapped: string[];
}
export interface RetargetOptions {
    /** Explicit overrides/extra pairs (source -> target). */
    boneMap?: Record<string, BoneName>;
    /** Force a translation scale instead of measuring skeleton heights. */
    scale?: number;
    /** Copy translations too (default: only the root, which carries locomotion). */
    translations?: 'root' | 'all' | 'none';
}
export interface RetargetResult {
    poses: BonePose[];
    map: RetargetMap;
    /** Bones written on the target rig. */
    applied: BoneName[];
    /** Source bones dropped because the target rig lacks them. */
    skipped: string[];
}
/**
 * Build a name-based bone map with a measured translation scale. Identical bone
 * names map straight across (the common case for two parametric Daytona rigs);
 * `boneMap` supplies the rest for foreign rigs.
 */
export declare function buildRetargetMap(source: BoneDef[], target: BoneDef[], options?: RetargetOptions): RetargetMap;
/** Retarget a single pose set from `source` onto `target`. */
export declare function retargetPose(poses: readonly BonePose[], source: BoneDef[], target: BoneDef[], options?: RetargetOptions): RetargetResult;
/** Retarget every frame of a sampled clip. Frame order and count are preserved. */
export declare function retargetClip(frames: ReadonlyArray<readonly BonePose[]>, source: BoneDef[], target: BoneDef[], options?: RetargetOptions): {
    frames: BonePose[][];
    map: RetargetMap;
};
/**
 * How far a retargeted pose drifts, per mapped bone, as a fraction of the target
 * skeleton's height. Used by the tests as an objective quality gate rather than
 * "it looks fine".
 */
export declare function retargetFidelity(poses: readonly BonePose[], source: BoneDef[], target: BoneDef[], options?: RetargetOptions): {
    maxRelativeDrift: number;
    meanRelativeDrift: number;
    bones: number;
};
export declare function skeletonHeight(skeleton: BoneDef[]): number;
/** Convenience: pose lookup by bone name for callers assembling frames. */
export declare function retargetedPoseMap(result: RetargetResult): Map<string, BonePose>;
//# sourceMappingURL=retargeting.d.ts.map