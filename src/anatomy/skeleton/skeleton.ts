import { Quat, IDENTITY_QUAT, Vec3 } from '../../core/math/vec';
import { AnatomyDimensions } from '../parametric/parametric-anatomy';

export type BoneName =
  | 'root'
  | 'pelvis'
  | 'spine_01'
  | 'spine_02'
  | 'chest'
  | 'neck'
  | 'head'
  | 'clavicle_l'
  | 'clavicle_r'
  | 'upperarm_l'
  | 'upperarm_r'
  | 'forearm_l'
  | 'forearm_r'
  | 'hand_l'
  | 'hand_r'
  | 'thigh_l'
  | 'thigh_r'
  | 'shin_l'
  | 'shin_r'
  | 'foot_l'
  | 'foot_r';

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

/** Parametric default human skeleton (v0.1 — T-pose, 21 joints). */
export function defaultSkeleton(): BoneDef[] {
  return [
    {
      name: 'root',
      parent: null,
      localPosition: { x: 0, y: 0, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'pelvis',
      parent: 'root',
      localPosition: { x: 0, y: 0.98, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'spine_01',
      parent: 'pelvis',
      localPosition: { x: 0, y: 0.12, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'spine_02',
      parent: 'spine_01',
      localPosition: { x: 0, y: 0.12, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'chest',
      parent: 'spine_02',
      localPosition: { x: 0, y: 0.16, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'neck',
      parent: 'chest',
      localPosition: { x: 0, y: 0.18, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'head',
      parent: 'neck',
      localPosition: { x: 0, y: 0.16, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'clavicle_l',
      parent: 'chest',
      localPosition: { x: -0.16, y: 0.19, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'clavicle_r',
      parent: 'chest',
      localPosition: { x: 0.16, y: 0.19, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'upperarm_l',
      parent: 'clavicle_l',
      localPosition: { x: -0.2, y: -0.05, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'upperarm_r',
      parent: 'clavicle_r',
      localPosition: { x: 0.2, y: -0.05, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'forearm_l',
      parent: 'upperarm_l',
      localPosition: { x: -0.02, y: -0.28, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'forearm_r',
      parent: 'upperarm_r',
      localPosition: { x: 0.02, y: -0.28, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'hand_l',
      parent: 'forearm_l',
      localPosition: { x: 0, y: -0.25, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'hand_r',
      parent: 'forearm_r',
      localPosition: { x: 0, y: -0.25, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'thigh_l',
      parent: 'pelvis',
      localPosition: { x: -0.09, y: -0.06, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'thigh_r',
      parent: 'pelvis',
      localPosition: { x: 0.09, y: -0.06, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'shin_l',
      parent: 'thigh_l',
      localPosition: { x: 0, y: -0.42, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'shin_r',
      parent: 'thigh_r',
      localPosition: { x: 0, y: -0.42, z: 0 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'foot_l',
      parent: 'shin_l',
      localPosition: { x: 0, y: -0.4, z: 0.06 },
      restRotation: IDENTITY_QUAT,
    },
    {
      name: 'foot_r',
      parent: 'shin_r',
      localPosition: { x: 0, y: -0.4, z: 0.06 },
      restRotation: IDENTITY_QUAT,
    },
  ];
}

/**
 * Parametric joint placement: resolves a T-pose skeleton whose segment lengths
 * and joint offsets match the anatomy dimensions resolved from the Human
 * Definition. Because both the canonical geometry and this skeleton are driven
 * by the same `AnatomyDimensions`, the joints stay registered with the mesh as
 * the identity body properties change.
 */
export function placeSkeletonFromDefinition(d: AnatomyDimensions): BoneDef[] {
  const bones = defaultSkeleton();

  // Axial chain lengths (each is a parent-space positive-Y offset).
  const torsoLen = Math.max(0.1, d.shoulderHeight - d.hipHeight - d.height * 0.06);
  const neckHeight = Math.max(0.02, d.shoulderHeight - d.hipHeight - torsoLen);
  const headHeight = d.height * 0.13 * d.headScale;
  const spine1 = torsoLen * 0.4;
  const spine2 = torsoLen * 0.35;
  const chestLen = torsoLen * 0.25;

  const forearmY = -d.forearmLength;
  const handY = -d.handLength;
  const thighY = -d.thighLength;
  const shinY = -d.shinLength;

  const set = (name: string, x: number, y: number, z: number) => {
    const bone = bones.find((b) => b.name === name);
    if (bone) bone.localPosition = { x, y, z };
  };

  set('root', 0, 0, 0);
  set('pelvis', 0, d.hipHeight, 0);
  set('spine_01', 0, spine1, 0);
  set('spine_02', 0, spine2, 0);
  set('chest', 0, chestLen, 0);
  set('neck', 0, neckHeight, 0);
  set('head', 0, headHeight, 0);
  set('clavicle_l', -d.shoulderHalfWidth * 0.92, chestLen, 0);
  set('clavicle_r', d.shoulderHalfWidth * 0.92, chestLen, 0);
  set('upperarm_l', -d.upperarmLength * 0.35, 0, 0);
  set('upperarm_r', d.upperarmLength * 0.35, 0, 0);
  set('forearm_l', 0, forearmY, 0);
  set('forearm_r', 0, forearmY, 0);
  set('hand_l', 0, handY, 0);
  set('hand_r', 0, handY, 0);
  set('thigh_l', -d.shoulderHalfWidth * 0.3, thighY, 0);
  set('thigh_r', d.shoulderHalfWidth * 0.3, thighY, 0);
  set('shin_l', 0, shinY, 0);
  set('shin_r', 0, shinY, 0);
  set('foot_l', 0, -d.footOffsetY, d.footOffsetY * 0.5);
  set('foot_r', 0, -d.footOffsetY, d.footOffsetY * 0.5);

  return bones;
}
