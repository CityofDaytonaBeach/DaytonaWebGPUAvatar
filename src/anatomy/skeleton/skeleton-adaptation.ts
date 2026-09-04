import type { Vec3, Quat } from '../../core/math/vec.js';
import type { BoneDef, BoneName } from './skeleton.js';
import type { CanonicalHuman, RegionName } from '../../geometry/canonical/canonical-human.js';

/**
 * Phase C — skeleton adaptation.
 *
 * The shape space (`HumanShapeSpace`) deforms canonical vertices, but the rig is
 * placed from `AnatomyDimensions`, so any identity expressed purely as shape
 * coefficients (a longer jaw, wider shoulders, a taller torso) leaves the joints
 * behind and the character deforms incorrectly once it moves.
 *
 * This module re-derives joint positions *from the deformed mesh itself*:
 * each joint declares the semantic regions that anatomically define it and how
 * to read a position out of them (centroid / proximal end / distal end). The
 * result is converted back into parent-local offsets so the existing
 * FK + skinning path (`buildBoneMatrices`, `combinedSkinMatrices`) is unchanged
 * and the rest pose still produces identity skin matrices.
 *
 * Everything here is deterministic: no randomness, no iteration order
 * dependence, same input mesh -> same skeleton.
 */

export type JointAnchorMode = 'centroid' | 'proximal' | 'distal' | 'front';

export interface JointAnchor {
  bone: BoneName;
  /** Candidate regions, in priority order (first non-empty one wins). */
  regions: RegionName[];
  mode: JointAnchorMode;
  /** How strongly the mesh anchor replaces the rest joint (0..1). */
  weight: number;
}

/**
 * Anatomical anchors. `proximal` = closest to the body core along the limb
 * (max Y for legs/arms in T-pose), `distal` = far end.
 */
export const JOINT_ANCHORS: JointAnchor[] = [
  { bone: 'pelvis', regions: ['pelvis', 'abdomen', 'torso'], mode: 'centroid', weight: 1 },
  { bone: 'chest', regions: ['chest', 'torso'], mode: 'centroid', weight: 0.8 },
  { bone: 'neck', regions: ['neck'], mode: 'distal', weight: 1 },
  { bone: 'head', regions: ['neck'], mode: 'proximal', weight: 1 },
  { bone: 'jaw', regions: ['chin', 'jaw'], mode: 'centroid', weight: 0.7 },
  { bone: 'clavicle_l', regions: ['shoulder_left'], mode: 'centroid', weight: 0.9 },
  { bone: 'clavicle_r', regions: ['shoulder_right'], mode: 'centroid', weight: 0.9 },
  { bone: 'upperarm_l', regions: ['upper_arm_left', 'upperarm_l'], mode: 'proximal', weight: 1 },
  { bone: 'upperarm_r', regions: ['upper_arm_right', 'upperarm_r'], mode: 'proximal', weight: 1 },
  { bone: 'forearm_l', regions: ['forearm_left', 'forearm_l'], mode: 'proximal', weight: 1 },
  { bone: 'forearm_r', regions: ['forearm_right', 'forearm_r'], mode: 'proximal', weight: 1 },
  { bone: 'hand_l', regions: ['hand_left', 'hand_l'], mode: 'proximal', weight: 1 },
  { bone: 'hand_r', regions: ['hand_right', 'hand_r'], mode: 'proximal', weight: 1 },
  { bone: 'thigh_l', regions: ['thigh_left', 'thigh_l'], mode: 'proximal', weight: 1 },
  { bone: 'thigh_r', regions: ['thigh_right', 'thigh_r'], mode: 'proximal', weight: 1 },
  { bone: 'shin_l', regions: ['shin_left', 'shin_l'], mode: 'proximal', weight: 1 },
  { bone: 'shin_r', regions: ['shin_right', 'shin_r'], mode: 'proximal', weight: 1 },
  { bone: 'foot_l', regions: ['foot_left'], mode: 'proximal', weight: 1 },
  { bone: 'foot_r', regions: ['foot_right'], mode: 'proximal', weight: 1 },
];

/** Left/right bone pairs used for symmetry enforcement. */
export const SYMMETRIC_BONE_PAIRS: Array<[BoneName, BoneName]> = [
  ['clavicle_l', 'clavicle_r'],
  ['upperarm_l', 'upperarm_r'],
  ['forearm_l', 'forearm_r'],
  ['hand_l', 'hand_r'],
  ['thigh_l', 'thigh_r'],
  ['shin_l', 'shin_r'],
  ['foot_l', 'foot_r'],
];

export interface SkeletonAdaptationOptions {
  /** Maximum world-space displacement allowed per joint, in metres. */
  maxJointShift?: number;
  /** Mirror L/R joints so a non-symmetric mesh cannot skew the rig. */
  enforceSymmetry?: boolean;
  /** Override the default anchor table. */
  anchors?: JointAnchor[];
}

export interface JointAdaptation {
  bone: BoneName;
  restWorld: Vec3;
  adaptedWorld: Vec3;
  shift: number;
  source: 'mesh' | 'rest';
  clamped: boolean;
  /** Region the anchor was read from, when any. */
  region: RegionName | null;
  vertexCount: number;
}

export interface SkeletonAdaptationReport {
  joints: JointAdaptation[];
  adaptedJoints: number;
  maxShift: number;
  meanShift: number;
  clampedJoints: number;
  symmetryEnforced: boolean;
}

const EPS = 1e-9;

function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/** Rotate a vector by a quaternion (v' = q v q*). */
export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** World-space joint positions of a rest skeleton (rest rotations included). */
export function boneWorldPositions(bones: BoneDef[]): Map<BoneName, Vec3> {
  const byName = new Map<BoneName, BoneDef>();
  for (const b of bones) byName.set(b.name, b);
  const world = new Map<BoneName, Vec3>();
  const worldRot = new Map<BoneName, Quat>();

  const resolve = (bone: BoneDef): void => {
    if (world.has(bone.name)) return;
    if (!bone.parent) {
      world.set(bone.name, { ...bone.localPosition });
      worldRot.set(bone.name, bone.restRotation);
      return;
    }
    const parent = byName.get(bone.parent);
    if (!parent) {
      world.set(bone.name, { ...bone.localPosition });
      worldRot.set(bone.name, bone.restRotation);
      return;
    }
    resolve(parent);
    const pPos = world.get(parent.name)!;
    const pRot = worldRot.get(parent.name)!;
    const offset = rotateVec3(pRot, bone.localPosition);
    world.set(bone.name, { x: pPos.x + offset.x, y: pPos.y + offset.y, z: pPos.z + offset.z });
    worldRot.set(bone.name, multiplyQuat(pRot, bone.restRotation));
  };

  for (const b of bones) resolve(b);
  return world;
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * Vertex ids belonging to a region. Regions may be non-contiguous, so the
 * per-vertex tag is authoritative; `regionRanges` is only a fallback for coarse
 * aliases synthesized over fine sub-regions.
 */
export function regionVertexIds(mesh: CanonicalHuman, region: RegionName): number[] {
  const ids: number[] = [];
  for (const v of mesh.vertices) if (v.region === region) ids.push(v.id);
  if (ids.length > 0) return ids;
  const range = mesh.regionRanges.get(region);
  if (!range) return ids;
  for (let i = range.start; i < range.start + range.count; i++) ids.push(i);
  return ids;
}

function positionAt(positions: Float32Array, id: number): Vec3 {
  return { x: positions[id * 3], y: positions[id * 3 + 1], z: positions[id * 3 + 2] };
}

function anchorFrom(positions: Float32Array, ids: number[], mode: JointAnchorMode): Vec3 {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  for (const id of ids) {
    const p = positionAt(positions, id);
    cx += p.x;
    cy += p.y;
    cz += p.z;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
  }
  const n = Math.max(1, ids.length);
  const centroid = { x: cx / n, y: cy / n, z: cz / n };
  switch (mode) {
    case 'centroid':
      return centroid;
    case 'proximal':
      return { x: centroid.x, y: maxY, z: centroid.z };
    case 'distal':
      return { x: centroid.x, y: minY, z: centroid.z };
    case 'front':
      return { x: centroid.x, y: centroid.y, z: minZ };
  }
}

/**
 * Re-place a rest skeleton onto deformed canonical positions.
 *
 * `positions` is a flat xyz array (vertexCount * 3) — normally
 * `deformedPositions(base, shapeSpace.evaluate())`. The returned bones are new
 * objects; the input skeleton is never mutated.
 */
export function adaptSkeletonToPositions(
  bones: BoneDef[],
  mesh: CanonicalHuman,
  positions: Float32Array,
  options: SkeletonAdaptationOptions = {},
): { bones: BoneDef[]; report: SkeletonAdaptationReport } {
  const maxShift = options.maxJointShift ?? 0.25;
  const enforceSymmetry = options.enforceSymmetry ?? true;
  const anchors = options.anchors ?? JOINT_ANCHORS;

  const restWorld = boneWorldPositions(bones);
  const anchorByBone = new Map<BoneName, JointAnchor>();
  for (const a of anchors) anchorByBone.set(a.bone, a);

  const targets = new Map<BoneName, Vec3>();
  const details = new Map<BoneName, JointAdaptation>();

  for (const bone of bones) {
    const rest = restWorld.get(bone.name)!;
    const anchor = anchorByBone.get(bone.name);
    let target = { ...rest };
    let source: 'mesh' | 'rest' = 'rest';
    let region: RegionName | null = null;
    let vertexCount = 0;

    if (anchor) {
      for (const candidate of anchor.regions) {
        const ids = regionVertexIds(mesh, candidate);
        if (ids.length === 0) continue;
        const meshAnchor = anchorFrom(positions, ids, anchor.mode);
        const w = Math.max(0, Math.min(1, anchor.weight));
        target = {
          x: rest.x + (meshAnchor.x - rest.x) * w,
          y: rest.y + (meshAnchor.y - rest.y) * w,
          z: rest.z + (meshAnchor.z - rest.z) * w,
        };
        source = 'mesh';
        region = candidate;
        vertexCount = ids.length;
        break;
      }
    }

    // Clamp so a pathological mesh can never tear the rig apart.
    let clamped = false;
    const dx = target.x - rest.x;
    const dy = target.y - rest.y;
    const dz = target.z - rest.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxShift && dist > EPS) {
      const k = maxShift / dist;
      target = { x: rest.x + dx * k, y: rest.y + dy * k, z: rest.z + dz * k };
      clamped = true;
    }

    targets.set(bone.name, target);
    details.set(bone.name, {
      bone: bone.name,
      restWorld: rest,
      adaptedWorld: target,
      shift: 0,
      source,
      clamped,
      region,
      vertexCount,
    });
  }

  if (enforceSymmetry) {
    for (const [left, right] of SYMMETRIC_BONE_PAIRS) {
      const l = targets.get(left);
      const r = targets.get(right);
      if (!l || !r) continue;
      const halfWidth = (Math.abs(l.x) + Math.abs(r.x)) / 2;
      const y = (l.y + r.y) / 2;
      const z = (l.z + r.z) / 2;
      targets.set(left, { x: -halfWidth, y, z });
      targets.set(right, { x: halfWidth, y, z });
    }
  }

  // Convert world targets back into parent-local offsets, walking parents first
  // so a parent's adapted world position is already final.
  const byName = new Map<BoneName, BoneDef>();
  for (const b of bones) byName.set(b.name, b);
  const out: BoneDef[] = bones.map((b) => ({
    ...b,
    localPosition: { ...b.localPosition },
    limits: b.limits
      ? { minDeg: { ...b.limits.minDeg }, maxDeg: { ...b.limits.maxDeg } }
      : undefined,
  }));
  const outByName = new Map<BoneName, BoneDef>();
  for (const b of out) outByName.set(b.name, b);
  const worldRot = new Map<BoneName, Quat>();

  const localize = (bone: BoneDef): void => {
    if (worldRot.has(bone.name)) return;
    const target = targets.get(bone.name)!;
    const adapted = outByName.get(bone.name)!;
    if (!bone.parent || !byName.has(bone.parent)) {
      adapted.localPosition = { ...target };
      worldRot.set(bone.name, bone.restRotation);
      return;
    }
    const parent = byName.get(bone.parent)!;
    localize(parent);
    const pWorld = targets.get(parent.name)!;
    const pRot = worldRot.get(parent.name)!;
    const delta = { x: target.x - pWorld.x, y: target.y - pWorld.y, z: target.z - pWorld.z };
    adapted.localPosition = rotateVec3(conjugate(pRot), delta);
    worldRot.set(bone.name, multiplyQuat(pRot, bone.restRotation));
  };
  for (const b of bones) localize(b);

  // Final report: measure the real (post-symmetry, post-localization) shift.
  const finalWorld = boneWorldPositions(out);
  let sum = 0;
  let peak = 0;
  let adaptedJoints = 0;
  let clampedJoints = 0;
  const joints: JointAdaptation[] = [];
  for (const bone of bones) {
    const d = details.get(bone.name)!;
    const w = finalWorld.get(bone.name)!;
    const shift = Math.hypot(w.x - d.restWorld.x, w.y - d.restWorld.y, w.z - d.restWorld.z);
    const entry: JointAdaptation = { ...d, adaptedWorld: w, shift };
    joints.push(entry);
    sum += shift;
    if (shift > peak) peak = shift;
    if (entry.source === 'mesh') adaptedJoints += 1;
    if (entry.clamped) clampedJoints += 1;
  }

  return {
    bones: out,
    report: {
      joints,
      adaptedJoints,
      maxShift: peak,
      meanShift: joints.length > 0 ? sum / joints.length : 0,
      clampedJoints,
      symmetryEnforced: enforceSymmetry,
    },
  };
}

/** Human-readable adaptation summary (deterministic, for diagnostics/CI). */
export function skeletonAdaptationReportLines(report: SkeletonAdaptationReport): string[] {
  const lines = [
    `joints=${report.joints.length} adapted=${report.adaptedJoints} clamped=${report.clampedJoints}`,
    `maxShift=${report.maxShift.toFixed(4)}m meanShift=${report.meanShift.toFixed(4)}m symmetry=${report.symmetryEnforced}`,
  ];
  for (const j of report.joints) {
    lines.push(
      `  ${j.bone}: ${j.source}${j.region ? `(${j.region}:${j.vertexCount})` : ''} shift=${j.shift.toFixed(4)}${j.clamped ? ' CLAMPED' : ''}`,
    );
  }
  return lines;
}
