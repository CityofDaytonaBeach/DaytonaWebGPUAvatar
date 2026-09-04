import type { Vec3 } from '../../core/math/vec.js';
import { IDENTITY_QUAT } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
import {
  addVec3,
  clampPoseToLimits,
  crossVec3,
  distanceVec3,
  dotVec3,
  forwardKinematics,
  normalizeVec3,
  poseMap,
  quatBetween,
  quatConjugate,
  quatFromAxisAngle,
  quatMul,
  resolveBoneChain,
  rotateVec3,
  scaleVec3,
  subVec3,
} from '../skeleton/kinematics.js';

/**
 * ik-solver — FK-verified inverse kinematics for arbitrary-length bone chains.
 *
 * The previous `solveIK2Bone` produced a plausible-looking two-bone pose but
 * nothing could check it: there was no forward-kinematics evaluator, so "did the
 * hand reach the target?" was unanswerable. That is why `motionCompiler` stayed
 * PROTOTYPE. This solver closes the loop:
 *
 *   1. FABRIK (position-space, backward/forward reaching) moves the chain's joint
 *      positions onto the target while preserving each segment's rest length.
 *   2. An optional pole vector rotates the interior joints about the root→target
 *      axis so elbows/knees bend in a chosen direction instead of arbitrarily.
 *   3. Positions are converted back into *local* bone rotations through the same
 *      FK convention the renderer/skinning path uses, then clamped to the bone's
 *      authored joint limits.
 *   4. Because clamping can pull the effector off-target, the whole thing runs as
 *      an outer loop and the final result is measured with real FK — the returned
 *      `error`/`reached` come from the evaluated skeleton, not from the solver's
 *      internal guess.
 *
 * Fully deterministic: no randomness, no time dependence, fixed iteration counts.
 * Existing exports (`solveIK2Bone`, gesture/walk compilation) are untouched.
 */

export interface IKSolveOptions {
  /** World-space effector target. */
  target: Vec3;
  /** Optional bend-direction hint for interior joints (elbow/knee). */
  poleVector?: Vec3;
  /** FABRIK position iterations per outer pass. */
  iterations?: number;
  /** Outer passes (FABRIK -> rotations -> FK re-measure). */
  passes?: number;
  /** Distance (metres) at which the effector counts as having reached the target. */
  tolerance?: number;
  /** Respect authored joint limits (default true). */
  respectLimits?: boolean;
  /** Base pose the chain starts from (ancestors + untouched bones). */
  basePoses?: readonly BonePose[];
}

export interface IKSolveResult {
  /** Local poses for the chain bones (excludes the effector's own rotation). */
  poses: BonePose[];
  /** Full pose set: base poses with the chain's solution merged in. */
  mergedPoses: BonePose[];
  /** FK-measured distance from the effector joint to the target, in metres. */
  error: number;
  reached: boolean;
  /** True when the target lies outside the chain's total reach. */
  targetUnreachable: boolean;
  /** Chain reach (sum of rest segment lengths) in metres. */
  reach: number;
  iterations: number;
  chain: BoneName[];
  /** FK world position of the effector after solving. */
  effectorPosition: Vec3;
}

const DEFAULTS = {
  iterations: 12,
  passes: 3,
  tolerance: 0.01,
  respectLimits: true,
} as const;

/**
 * Solve a chain from `root` to `effector` so the effector joint reaches `target`.
 * Returns an FK-measured result; never throws on a bad chain (reports instead).
 */
export function solveChainIK(
  skeleton: BoneDef[],
  root: BoneName,
  effector: BoneName,
  options: IKSolveOptions,
): IKSolveResult {
  const chain = resolveBoneChain(skeleton, root, effector);
  const base = (options.basePoses ?? []).map(clonePose);
  const empty = (reason: 'chain' | 'degenerate'): IKSolveResult => ({
    poses: [],
    mergedPoses: base,
    error: Number.POSITIVE_INFINITY,
    reached: false,
    targetUnreachable: reason === 'chain',
    reach: 0,
    iterations: 0,
    chain: chain ?? [],
    effectorPosition: { x: 0, y: 0, z: 0 },
  });
  if (!chain || chain.length < 2) return empty('chain');

  const byName = new Map(skeleton.map((b) => [b.name, b]));
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULTS.iterations));
  const passes = Math.max(1, Math.floor(options.passes ?? DEFAULTS.passes));
  const tolerance = Math.max(1e-6, options.tolerance ?? DEFAULTS.tolerance);
  const respectLimits = options.respectLimits ?? DEFAULTS.respectLimits;

  // Rest/base FK gives the starting joint positions and the fixed segment lengths.
  let working = base.slice();
  let fk = forwardKinematics(skeleton, working);
  const startPositions = chain.map((name) => ({
    ...(fk.get(name)?.worldPos ?? { x: 0, y: 0, z: 0 }),
  }));
  const lengths: number[] = [];
  for (let i = 0; i < startPositions.length - 1; i++) {
    lengths.push(distanceVec3(startPositions[i], startPositions[i + 1]));
  }
  const reach = lengths.reduce((a, b) => a + b, 0);
  if (reach <= 1e-6) return empty('degenerate');

  const rootPos = startPositions[0];
  const targetDistance = distanceVec3(rootPos, options.target);
  const targetUnreachable = targetDistance > reach + 1e-9;

  let totalIterations = 0;
  let solvedPoses: BonePose[] = [];
  let error = Number.POSITIVE_INFINITY;
  let effectorPosition = startPositions[startPositions.length - 1];

  for (let pass = 0; pass < passes; pass++) {
    const positions = chain.map((name) => ({
      ...(fk.get(name)?.worldPos ?? { x: 0, y: 0, z: 0 }),
    }));
    positions[0] = { ...rootPos };
    totalIterations += fabrik(positions, lengths, options.target, iterations, tolerance);
    if (options.poleVector) applyPoleVector(positions, options.poleVector, lengths);

    solvedPoses = positionsToLocalPoses(skeleton, byName, chain, positions, working, respectLimits);
    working = mergePoses(base, solvedPoses);
    fk = forwardKinematics(skeleton, working);
    effectorPosition = { ...(fk.get(chain[chain.length - 1])?.worldPos ?? effectorPosition) };
    error = distanceVec3(effectorPosition, options.target);
    if (error <= tolerance) break;
  }

  return {
    poses: solvedPoses,
    mergedPoses: working,
    error,
    reached: error <= tolerance,
    targetUnreachable,
    reach,
    iterations: totalIterations,
    chain,
    effectorPosition,
  };
}

/**
 * Convenience wrapper: solve an arm (`upperarm_* -> hand_*`) or leg
 * (`thigh_* -> foot_*`) chain with a sensible default pole vector.
 */
export function solveLimbIK(
  skeleton: BoneDef[],
  limb: 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r',
  target: Vec3,
  options: Omit<IKSolveOptions, 'target'> = {},
): IKSolveResult {
  const spec: Record<typeof limb, { root: BoneName; effector: BoneName; pole: Vec3 }> = {
    arm_l: { root: 'upperarm_l', effector: 'hand_l', pole: { x: -0.4, y: -0.2, z: -1 } },
    arm_r: { root: 'upperarm_r', effector: 'hand_r', pole: { x: 0.4, y: -0.2, z: -1 } },
    leg_l: { root: 'thigh_l', effector: 'foot_l', pole: { x: -0.1, y: 0, z: 1 } },
    leg_r: { root: 'thigh_r', effector: 'foot_r', pole: { x: 0.1, y: 0, z: 1 } },
  };
  const { root, effector, pole } = spec[limb];
  return solveChainIK(skeleton, root, effector, {
    poleVector: pole,
    ...options,
    target,
  });
}

// ─── FABRIK core ────────────────────────────────────────────────────────────

/** In-place FABRIK. Returns the number of iterations actually run. */
export function fabrik(
  positions: Vec3[],
  lengths: number[],
  target: Vec3,
  iterations: number,
  tolerance: number,
): number {
  const n = positions.length;
  if (n < 2) return 0;
  const origin = { ...positions[0] };
  const reach = lengths.reduce((a, b) => a + b, 0);

  // Out of reach: stretch straight at the target and stop (the classic FABRIK case).
  if (distanceVec3(origin, target) > reach) {
    const dir = normalizeVec3(subVec3(target, origin));
    let cursor = origin;
    positions[0] = { ...origin };
    for (let i = 0; i < lengths.length; i++) {
      cursor = addVec3(cursor, scaleVec3(dir, lengths[i]));
      positions[i + 1] = { ...cursor };
    }
    return 1;
  }

  let run = 0;
  for (let it = 0; it < iterations; it++) {
    run += 1;
    // Backward: pull the effector onto the target, walking toward the root.
    positions[n - 1] = { ...target };
    for (let i = n - 2; i >= 0; i--) {
      positions[i] = movedToward(positions[i + 1], positions[i], lengths[i]);
    }
    // Forward: pin the root back, walking out to the effector.
    positions[0] = { ...origin };
    for (let i = 1; i < n; i++) {
      positions[i] = movedToward(positions[i - 1], positions[i], lengths[i - 1]);
    }
    if (distanceVec3(positions[n - 1], target) <= tolerance) break;
  }
  return run;
}

function movedToward(anchor: Vec3, point: Vec3, length: number): Vec3 {
  const delta = subVec3(point, anchor);
  const dist = Math.hypot(delta.x, delta.y, delta.z);
  if (dist <= 1e-9) return addVec3(anchor, { x: 0, y: length, z: 0 });
  return addVec3(anchor, scaleVec3(delta, length / dist));
}

/**
 * Rotate interior joints about the root→effector axis so the bend points at the
 * pole vector. Segment lengths are preserved because the rotation is rigid about
 * an axis through the joint's own projection onto the root→effector line.
 */
export function applyPoleVector(positions: Vec3[], poleVector: Vec3, lengths: number[]): void {
  const n = positions.length;
  if (n < 3) return;
  const root = positions[0];
  const end = positions[n - 1];
  const axis = subVec3(end, root);
  const axisLen = Math.hypot(axis.x, axis.y, axis.z);
  if (axisLen <= 1e-6) return;
  const axisDir = scaleVec3(axis, 1 / axisLen);

  // Desired bend direction, made perpendicular to the chain axis.
  const poleRaw = normalizeVec3(poleVector);
  const desired = normalizeVec3(subVec3(poleRaw, scaleVec3(axisDir, dotVec3(poleRaw, axisDir))));
  if (Math.hypot(desired.x, desired.y, desired.z) <= 1e-6) return;

  // Use the first interior joint to measure the current bend plane, then rotate
  // every interior joint by the same angle so the chain stays rigid.
  const j = positions[1];
  const toJoint = subVec3(j, root);
  const current = normalizeVec3(subVec3(toJoint, scaleVec3(axisDir, dotVec3(toJoint, axisDir))));
  if (Math.hypot(current.x, current.y, current.z) <= 1e-6) return;

  const cos = Math.max(-1, Math.min(1, dotVec3(current, desired)));
  const sign = dotVec3(crossVec3(current, desired), axisDir) < 0 ? -1 : 1;
  const angle = sign * Math.acos(cos);
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-9) return;
  const rot = quatFromAxisAngle(axisDir, angle);

  for (let i = 1; i < n - 1; i++) {
    const rel = subVec3(positions[i], root);
    positions[i] = addVec3(root, rotateVec3(rot, rel));
  }
  void lengths; // lengths are preserved by construction (rigid rotation).
}

// ─── Position -> local rotation conversion ──────────────────────────────────

function positionsToLocalPoses(
  skeleton: BoneDef[],
  byName: Map<BoneName, BoneDef>,
  chain: BoneName[],
  positions: Vec3[],
  basePoses: readonly BonePose[],
  respectLimits: boolean,
): BonePose[] {
  const baseMap = poseMap(basePoses);
  const fkBase = forwardKinematics(skeleton, basePoses);
  const out: BonePose[] = [];

  // Parent world transform of the chain root is unaffected by the solve.
  const rootBone = byName.get(chain[0])!;
  let parentRot = rootBone.parent
    ? (fkBase.get(rootBone.parent)?.worldRot ?? IDENTITY_QUAT)
    : IDENTITY_QUAT;
  let jointPos = { ...positions[0] };

  for (let i = 0; i < chain.length - 1; i++) {
    const bone = byName.get(chain[i])!;
    const child = byName.get(chain[i + 1])!;
    const offset = baseMap.get(child.name)?.localPos ?? child.localPosition;
    const restDir = normalizeVec3(offset);
    const desiredWorld = normalizeVec3(subVec3(positions[i + 1], jointPos));

    const qPre = quatMul(parentRot, bone.restRotation);
    const desiredLocal = rotateVec3(quatConjugate(qPre), desiredWorld);
    let local = quatBetween(restDir, desiredLocal);
    if (respectLimits) local = clampPoseToLimits(bone, local);

    const localPos = baseMap.get(bone.name)?.localPos ?? bone.localPosition;
    out.push({ name: bone.name, localPos: { ...localPos }, localRot: local });

    const worldRot = quatMul(qPre, local);
    jointPos = addVec3(jointPos, rotateVec3(worldRot, offset));
    parentRot = worldRot;
  }
  return out;
}

export function mergePoses(base: readonly BonePose[], overrides: readonly BonePose[]): BonePose[] {
  const map = new Map<string, BonePose>();
  for (const p of base) map.set(p.name, clonePose(p));
  for (const p of overrides) map.set(p.name, clonePose(p));
  return [...map.values()];
}

function clonePose(p: BonePose): BonePose {
  return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}
