import type { RegionName } from './canonical-human.js';

/**
 * P4 semantic regions — HD granularity. A state-of-the-art provider should
 * emit these. Note: a region may span multiple non-contiguous vertex/index
 * ranges; consumers must never assume a region is a single contiguous block.
 */
export const HD_HEAD_REGIONS: RegionName[] = [
  'forehead',
  'temple_left',
  'temple_right',
  'eye_left',
  'eye_right',
  'upper_eyelid_left',
  'lower_eyelid_left',
  'upper_eyelid_right',
  'lower_eyelid_right',
  'nose_bridge',
  'nose_tip',
  'nose_alar_left',
  'nose_alar_right',
  'cheek_left',
  'cheek_right',
  'upper_lip',
  'lower_lip',
  'mouth_corner_left',
  'mouth_corner_right',
  'jaw_left',
  'jaw_right',
  'chin',
  'ear_left',
  'ear_right',
  'neck',
];

export const HD_HEAD_PART_REGIONS: RegionName[] = [
  'eye_sclera',
  'eye_iris',
  'cornea',
  'teeth',
  'tongue',
  'mouth_cavity',
];

export const HD_BODY_REGIONS: RegionName[] = [
  'chest',
  'abdomen',
  'back',
  'shoulder_left',
  'shoulder_right',
  'upper_arm_left',
  'upper_arm_right',
  'forearm_left',
  'forearm_right',
  'hand_left',
  'hand_right',
  'pelvis',
  'thigh_left',
  'thigh_right',
  'shin_left',
  'shin_right',
  'foot_left',
  'foot_right',
];

/** Fine-grained eye-region names that drive eyelid deformations. */
export const EYELID_REGIONS: RegionName[] = [
  'upper_eyelid_left',
  'lower_eyelid_left',
  'upper_eyelid_right',
  'lower_eyelid_right',
];

/** All fine-grained regions a conformant HD HEAD V0.1 topology must provide. */
export const REQUIRED_HD_HEAD_REGIONS: RegionName[] = [...HD_HEAD_REGIONS];

/** All fine-grained regions a conformant HD BODY V0.1 topology must provide. */
export const REQUIRED_HD_BODY_REGIONS: RegionName[] = [...HD_BODY_REGIONS];
