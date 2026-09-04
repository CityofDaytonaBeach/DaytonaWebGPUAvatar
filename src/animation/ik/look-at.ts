import type { Vec3 } from '../../core/math/vec.js';
import { IDENTITY_QUAT } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../skeleton/skeletal-animation.js';
import {
  addVec3,
  clampPoseToLimits,
  dotVec3,
  forwardKinematics,
  normalizeVec3,
  poseMap,
  quatBetween,
  quatConjugate,
  quatMul,
  rotateVec3,
  subVec3,
} from '../skeleton/kinematics.js';
import { mergePoses } from './ik-solver.js';

/**
 * look-at — FK-verified gaze aiming across a bone chain.
 *
 * The compiler's original `solveLookAt` computed yaw/pitch from *rest* positions
 * and wrote fixed 60/40 neck/head splits, so the actual gaze direction after
 * skinning was never measured and any parent rotation (a torso twist, a walk
 * cycle) silently broke it. This solver drives the chain through real forward
 * kinematics: each bone is aimed at the target in its own parent space, weighted
 * along the chain, clamped to authored joint limits, and then the resulting gaze
 * direction is *re-measured* with FK so callers get a real angular error.
 *
 * Deterministic and additive: it consumes a base pose set (whatever the motion
 * runtime produced this frame) and returns that set with the gaze chain merged in.
 */

export interface LookAtOptions {
  /** World-space point to look at. */
  target: Vec3;
  /** Chain to distribute the gaze across, root-first. Defaults to neck -> head. */
  chain?: BoneName[];
  /** Per-bone share of the total rotation, root-first. Normalized if it doesn't sum to 1. */
  weights?: number[];
  /** Maximum total deviation from the rest forward direction, in degrees. */
  maxAngleDeg?: number;
  /** 0..1 blend of the gaze over the base pose (0 = base pose untouched). */
  intensity?: number;
  /** Local-space forward axis of the gaze bone. Defaults to +Z. */
  forwardAxis?: Vec3;
  /** Solver refinement passes (FK re-measure between passes). */
  passes?: number;
  /** Respect authored joint limits (default true). */
  respectLimits?: boolean;
  basePoses?: readonly BonePose[];
}

export interface LookAtResult {
  poses: BonePose[];
  mergedPoses: BonePose[];
  /** FK-measured angle between the gaze bone's forward axis and the target, in degrees. */
  angleErrorDeg: number;
  /** True when the target sat outside `maxAngleDeg` and the gaze was clamped. */
  clamped: boolean;
  /** Requested deviation from rest forward, in degrees (pre-clamp). */
  requestedAngleDeg: number;
  chain: BoneName[];
  passes: number;
  /** FK world position of the gaze (last chain) bone. */
  gazeOrigin: Vec3;
}

const DEFAULT_CHAIN: BoneName[] = ['neck', 'head'];
const DEFAULT_WEIGHTS = [0.6, 0.4];

export function solveLookAtChain(skeleton: BoneDef[], options: LookAtOptions): LookAtResult {
  const byName = new Map(skeleton.map((b) => [b.name, b]));
  const chain = (options.chain ?? DEFAULT_CHAIN).filter((n) => byName.has(n));
  const base = (options.basePoses ?? []).map(clonePose);
  const forward = normalizeVec3(options.forwardAxis ?? { x: 0, y: 0, z: 1 });
  const intensity = clamp01(options.intensity ?? 1);
  const maxAngleDeg = Math.max(0, options.maxAngleDeg ?? 80);
  const passes = Math.max(1, Math.floor(options.passes ?? 2));
  const respectLimits = options.respectLimits ?? true;

  if (chain.length === 0 || intensity === 0) {
    const fk = forwardKinematics(skeleton, base);
    const gazeBone = chain[chain.length - 1];
    return {
      poses: [],
      mergedPoses: base,
      angleErrorDeg: measureGazeError(skeleton, base, gazeBone, forward, options.target),
      clamped: false,
      requestedAngleDeg: 0,
      chain,
      passes: 0,
      gazeOrigin: { ...(gazeBone ? (fk.get(gazeBone)?.worldPos ?? ZERO) : ZERO) },
    };
  }

  const weights = normalizeWeights(options.weights ?? defaultWeights(chain.length), chain.length);
  let working = base.slice();
  let clamped = false;
  let requestedAngleDeg = 0;
  const gazeBone = chain[chain.length - 1];

  for (let pass = 0; pass < passes; pass++) {
    const fk = forwardKinematics(skeleton, working);
    const gaze = fk.get(gazeBone);
    if (!gaze) break;

    const restForwardWorld = normalizeVec3(
      rotateVec3(baseForwardRotation(skeleton, base, gazeBone), forward),
    );
    const toTarget = normalizeVec3(subVec3(options.target, gaze.worldPos));
    if (!isFinite3(toTarget)) break;

    const deviationDeg = angleDeg(restForwardWorld, toTarget);
    if (pass === 0) requestedAngleDeg = deviationDeg;
    let aim = toTarget;
    if (deviationDeg > maxAngleDeg) {
      clamped = true;
      aim = slerpDirection(restForwardWorld, toTarget, maxAngleDeg / deviationDeg);
    }

    const currentForwardWorld = normalizeVec3(rotateVec3(gaze.worldRot, forward));
    const correction = quatBetween(currentForwardWorld, aim);

    // Distribute the correction along the chain in each bone's parent space.
    const poses: BonePose[] = [];
    const baseMap = poseMap(working);
    for (let i = 0; i < chain.length; i++) {
      const bone = byName.get(chain[i])!;
      const share = weights[i] * intensity;
      const partial = scaleRotation(correction, share);
      const parentRot = bone.parent
        ? (fk.get(bone.parent)?.worldRot ?? IDENTITY_QUAT)
        : IDENTITY_QUAT;
      const qPre = quatMul(parentRot, bone.restRotation);
      const existing = baseMap.get(bone.name)?.localRot ?? IDENTITY_QUAT;
      // Express the world-space partial correction in this bone's local frame.
      const worldCurrent = quatMul(qPre, existing);
      const desiredWorld = quatMul(partial, worldCurrent);
      let local = quatMul(quatConjugate(qPre), desiredWorld);
      if (respectLimits) {
        const limited = clampPoseToLimits(bone, local);
        if (limited !== local) clamped = true;
        local = limited;
      }
      poses.push({
        name: bone.name,
        localPos: { ...(baseMap.get(bone.name)?.localPos ?? bone.localPosition) },
        localRot: local,
      });
    }
    working = mergePoses(working, poses);
  }

  const fkFinal = forwardKinematics(skeleton, working);
  const solved = chain
    .map((name) => working.find((p) => p.name === name))
    .filter((p): p is BonePose => Boolean(p));

  return {
    poses: solved.map(clonePose),
    mergedPoses: working,
    angleErrorDeg: measureGazeError(skeleton, working, gazeBone, forward, options.target),
    clamped,
    requestedAngleDeg,
    chain,
    passes,
    gazeOrigin: { ...(fkFinal.get(gazeBone)?.worldPos ?? ZERO) },
  };
}

/** FK-measured angle between a bone's forward axis and the direction to `target`. */
export function measureGazeError(
  skeleton: BoneDef[],
  poses: readonly BonePose[],
  bone: BoneName | undefined,
  forwardAxis: Vec3,
  target: Vec3,
): number {
  if (!bone) return Number.POSITIVE_INFINITY;
  const fk = forwardKinematics(skeleton, poses);
  const t = fk.get(bone);
  if (!t) return Number.POSITIVE_INFINITY;
  const forward = normalizeVec3(rotateVec3(t.worldRot, normalizeVec3(forwardAxis)));
  const toTarget = normalizeVec3(subVec3(target, t.worldPos));
  if (!isFinite3(forward) || !isFinite3(toTarget)) return Number.POSITIVE_INFINITY;
  return angleDeg(forward, toTarget);
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

function baseForwardRotation(skeleton: BoneDef[], base: readonly BonePose[], bone?: BoneName) {
  if (!bone) return IDENTITY_QUAT;
  // Rest orientation of the gaze bone with the chain's own rotations removed.
  const fk = forwardKinematics(
    skeleton,
    base.filter((p) => p.name !== bone),
  );
  return fk.get(bone)?.worldRot ?? IDENTITY_QUAT;
}

function defaultWeights(length: number): number[] {
  if (length === 2) return [...DEFAULT_WEIGHTS];
  return new Array<number>(length).fill(1 / length);
}

function normalizeWeights(weights: number[], length: number): number[] {
  const padded = new Array<number>(length)
    .fill(0)
    .map((_, i) => (Number.isFinite(weights[i]) && weights[i] > 0 ? weights[i] : 0));
  const sum = padded.reduce((a, b) => a + b, 0);
  if (sum <= 0) return new Array<number>(length).fill(1 / length);
  return padded.map((w) => w / sum);
}

/** Scale a rotation by `t` along its own axis (0 = identity, 1 = full). */
function scaleRotation(q: Quatish, t: number): Quatish {
  const w = Math.max(-1, Math.min(1, q.w));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s <= 1e-9 || !Number.isFinite(angle)) return IDENTITY_QUAT;
  const axis = { x: q.x / s, y: q.y / s, z: q.z / s };
  const half = (angle * t) / 2;
  const sh = Math.sin(half);
  return { x: axis.x * sh, y: axis.y * sh, z: axis.z * sh, w: Math.cos(half) };
}

type Quatish = { x: number; y: number; z: number; w: number };

function slerpDirection(from: Vec3, to: Vec3, t: number): Vec3 {
  const q = scaleRotation(quatBetween(from, to), clamp01(t));
  return normalizeVec3(rotateVec3(q, from));
}

function angleDeg(a: Vec3, b: Vec3): number {
  const cos = Math.max(-1, Math.min(1, dotVec3(a, b)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function isFinite3(v: Vec3): boolean {
  return (
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z) &&
    Math.hypot(v.x, v.y, v.z) > 1e-9
  );
}

function clamp01(v: number): number {
  return !Number.isFinite(v) ? 0 : v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function clonePose(p: BonePose): BonePose {
  return { name: p.name, localPos: { ...p.localPos }, localRot: { ...p.localRot } };
}

// Re-exported so consumers can build world-space gaze targets from bone space.
export function worldPointFromBone(
  skeleton: BoneDef[],
  poses: readonly BonePose[],
  bone: BoneName,
  localOffset: Vec3,
): Vec3 | null {
  const t = forwardKinematics(skeleton, poses).get(bone);
  if (!t) return null;
  return addVec3(t.worldPos, rotateVec3(t.worldRot, localOffset));
}
