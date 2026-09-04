import { IDENTITY_QUAT } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
import {
  distanceVec3,
  forwardKinematics,
  poseMap,
  quatConjugate,
  quatMul,
  scaleVec3,
} from '../skeleton/kinematics.js';

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
export function buildRetargetMap(
  source: BoneDef[],
  target: BoneDef[],
  options: RetargetOptions = {},
): RetargetMap {
  const targetNames = new Set(target.map((b) => b.name));
  const bones = new Map<string, BoneName>();
  const unmapped: string[] = [];

  for (const bone of source) {
    const override = options.boneMap?.[bone.name];
    if (override && targetNames.has(override)) {
      bones.set(bone.name, override);
      continue;
    }
    if (targetNames.has(bone.name)) {
      bones.set(bone.name, bone.name);
      continue;
    }
    unmapped.push(bone.name);
  }

  const scale =
    options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0
      ? options.scale
      : measureScale(source, target);

  return { bones, scale, unmapped };
}

/** Retarget a single pose set from `source` onto `target`. */
export function retargetPose(
  poses: readonly BonePose[],
  source: BoneDef[],
  target: BoneDef[],
  options: RetargetOptions = {},
): RetargetResult {
  const map = buildRetargetMap(source, target, options);
  const sourceByName = new Map(source.map((b) => [b.name, b]));
  const targetByName = new Map(target.map((b) => [b.name, b]));
  const mode = options.translations ?? 'root';

  const applied: BoneName[] = [];
  const skipped: string[] = [];
  const out: BonePose[] = [];

  for (const pose of poses) {
    const targetName = map.bones.get(pose.name);
    const sourceBone = sourceByName.get(pose.name as BoneName);
    const targetBone = targetName ? targetByName.get(targetName) : undefined;
    if (!targetName || !sourceBone || !targetBone) {
      skipped.push(pose.name);
      continue;
    }

    const sourceRest = sourceBone.restRotation ?? IDENTITY_QUAT;
    const targetRest = targetBone.restRotation ?? IDENTITY_QUAT;
    // Re-express the source's rest-relative rotation in the target's rest frame.
    const worldish = quatMul(sourceRest, pose.localRot);
    const localRot = quatMul(quatConjugate(targetRest), worldish);

    const isRoot = targetBone.parent === null;
    const copyTranslation = mode === 'all' || (mode === 'root' && isRoot);
    const localPos = copyTranslation
      ? scaleVec3(pose.localPos, map.scale)
      : { ...targetBone.localPosition };

    out.push({ name: targetName, localPos, localRot });
    applied.push(targetName);
  }

  return { poses: out, map, applied, skipped };
}

/** Retarget every frame of a sampled clip. Frame order and count are preserved. */
export function retargetClip(
  frames: ReadonlyArray<readonly BonePose[]>,
  source: BoneDef[],
  target: BoneDef[],
  options: RetargetOptions = {},
): { frames: BonePose[][]; map: RetargetMap } {
  const map = buildRetargetMap(source, target, options);
  const frameOptions: RetargetOptions = { ...options, scale: map.scale };
  return {
    frames: frames.map((frame) => retargetPose(frame, source, target, frameOptions).poses),
    map,
  };
}

/**
 * How far a retargeted pose drifts, per mapped bone, as a fraction of the target
 * skeleton's height. Used by the tests as an objective quality gate rather than
 * "it looks fine".
 */
export function retargetFidelity(
  poses: readonly BonePose[],
  source: BoneDef[],
  target: BoneDef[],
  options: RetargetOptions = {},
): { maxRelativeDrift: number; meanRelativeDrift: number; bones: number } {
  const result = retargetPose(poses, source, target, options);
  const sourceFk = forwardKinematics(source, poses);
  const targetFk = forwardKinematics(target, result.poses);
  const sourceRest = forwardKinematics(source, []);
  const targetRest = forwardKinematics(target, []);
  const height = Math.max(1e-6, skeletonHeight(target));

  let max = 0;
  let sum = 0;
  let count = 0;
  for (const [sourceName, targetName] of result.map.bones) {
    const s = sourceFk.get(sourceName as BoneName);
    const t = targetFk.get(targetName);
    const sr = sourceRest.get(sourceName as BoneName);
    const tr = targetRest.get(targetName);
    if (!s || !t || !sr || !tr) continue;
    // Compare each rig's displacement from its own rest pose, scaled to target size.
    const sDelta = distanceVec3(s.worldPos, sr.worldPos) * result.map.scale;
    const tDelta = distanceVec3(t.worldPos, tr.worldPos);
    const drift = Math.abs(sDelta - tDelta) / height;
    max = Math.max(max, drift);
    sum += drift;
    count += 1;
  }
  return {
    maxRelativeDrift: max,
    meanRelativeDrift: count > 0 ? sum / count : 0,
    bones: count,
  };
}

export function skeletonHeight(skeleton: BoneDef[]): number {
  const fk = forwardKinematics(skeleton, []);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const t of fk.values()) {
    min = Math.min(min, t.worldPos.y);
    max = Math.max(max, t.worldPos.y);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return max - min;
}

function measureScale(source: BoneDef[], target: BoneDef[]): number {
  const s = skeletonHeight(source);
  const t = skeletonHeight(target);
  if (s <= 1e-6 || t <= 1e-6) return 1;
  return t / s;
}

/** Convenience: pose lookup by bone name for callers assembling frames. */
export function retargetedPoseMap(result: RetargetResult): Map<string, BonePose> {
  return poseMap(result.poses);
}
