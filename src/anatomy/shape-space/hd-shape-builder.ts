import { CanonicalHuman, RegionName } from '../../geometry/canonical/canonical-human.js';
import { HumanShapeSpace } from './human-shape-space.js';
import { CorrectiveRule } from './shape-corrective-solver.js';
import { MorphCorrectiveWeight } from '../../geometry/morph/morph-driver.js';

export interface HdShapeSpec {
  /** Properties wired into the sparse morph pipeline via their shape bases. */
  propertyPaths: string[];
  /** Humanly-readable count of corrective rules registered. */
  correctiveRules: CorrectiveRule[];
  /** Corrective weight sources (morphName -> product inputs) to register in MorphDriver. */
  correctiveMorphs: Array<{ name: string; inputs: NonNullable<MorphCorrectiveWeight['inputs']> }>;
}

/** Fine HD regions covering the full axial figure for global.height. */
const HD_AXIAL_REGIONS_FINE: RegionName[] = [
  'chest',
  'abdomen',
  'back',
  'shoulder_left',
  'shoulder_right',
  'pelvis',
  'neck',
  'forehead',
  'upper_arm_left',
  'upper_arm_right',
  'forearm_left',
  'forearm_right',
  'hand_left',
  'hand_right',
  'thigh_left',
  'thigh_right',
  'shin_left',
  'shin_right',
  'foot_left',
  'foot_right',
];

/** Coarse block-human regions covering the whole figure for global.height. */
const HD_AXIAL_REGIONS_COARSE: RegionName[] = [
  'torso',
  'neck',
  'head',
  'upperarm_l',
  'upperarm_r',
  'forearm_l',
  'forearm_r',
  'hand_l',
  'hand_r',
  'thigh_l',
  'thigh_r',
  'shin_l',
  'shin_r',
  'foot_left',
  'foot_right',
];

/**
 * Builds the Human Shape Space V0.1 for a given canonical topology.
 *
 * Registers exactly the ten first-generation identity controls (direction.md
 * P7) as sparse, reusable shape bases with CORRELATED deformation functions
 * (P8): a control spreads across its adjacent semantic transition regions
 * rather than naively scaling a single vertex axis. Bases are emitted on the
 * fine-grained HD regions when present, and fall back to the coarse block-human
 * regions otherwise, so the same shape space drives both topologies.
 *
 * Returns the spec needed by the Human runtime to:
 *   1. compile bases into the existing sparse morph set (P10),
 *   2. register their property mappings on the MorphDriver,
 *   3. register corrective (combination) rules (P11).
 */
export function buildHdShapeSpace(canonical: CanonicalHuman): {
  space: HumanShapeSpace;
  spec: HdShapeSpec;
} {
  const space = new HumanShapeSpace(canonical);
  const spec: HdShapeSpec = {
    propertyPaths: [],
    correctiveRules: [],
    correctiveMorphs: [],
  };

  // Resolve a semantic control to a fine or coarse region basis. If neither the
  // granular nor the coarse region exists, the control is a no-op for this
  // topology — that is fine (e.g. body controls on a head-only topology).
  const addFineControl = (
    name: string,
    property: string,
    fineRegions: RegionName[],
    coarseRegions: RegionName[],
    fn: (vx: number, vy: number, vz: number) => { dx: number; dy: number; dz: number },
    tags?: string[],
  ) => {
    const regions = fineRegions.filter((r) => canonical.regionRanges.has(r));
    const fallback = regions.length === 0 ? coarseRegions.filter((r) => canonical.regionRanges.has(r)) : [];
    const targets = regions.length > 0 ? regions : fallback;
    if (targets.length === 0) return null;
    const ids = new Set<number>();
    for (const region of targets) {
      const range = canonical.regionRanges.get(region)!;
      for (let i = range.start; i < range.start + range.count; i++) ids.add(i);
    }
    const basis = space.addVertexBasis(name, property, [...ids], fn, tags);
    spec.propertyPaths.push(property);
    return basis.id;
  };

  // ---- 10 identity controls (P7) with correlated deformation (P8) ----

  // Nose width: alars widen laterally, tip widens slightly, bridge/cheek blend.
  addFineControl(
    'NoseWidthBasis',
    'face.nose.width',
    ['nose_alar_left', 'nose_alar_right', 'nose_tip', 'nose_bridge'],
    ['nose'],
    (vx, _vy, vz) => {
      const s = Math.sign(vx || 1e-6);
      const magnitude = Math.min(0.05, Math.abs(vx) * 0.28 + 0.012);
      return { dx: s * magnitude, dy: 0, dz: vz < 0.28 ? 0.004 : 0 };
    },
    ['nose', 'correlated'],
  );
  // Nose length: tip + alars project forward (+z; nose points +z in this frame).
  addFineControl(
    'NoseLengthBasis',
    'face.nose.length',
    ['nose_tip', 'nose_alar_left', 'nose_alar_right', 'nose_bridge'],
    ['nose'],
    (_vx, _vy, vz) => ({
      dx: 0,
      dy: 0,
      dz: vz >= 0.26 ? 0.04 : vz >= 0.24 ? 0.02 : 0.008,
    }),
    ['nose', 'correlated'],
  );
  // Jaw width: jaw angles widen laterally, cheeks and chin transition with it.
  addFineControl(
    'JawWidthBasis',
    'face.jaw.width',
    ['jaw_left', 'jaw_right', 'cheek_left', 'cheek_right', 'chin', 'mouth_corner_left', 'mouth_corner_right'],
    ['jaw', 'cheek_left', 'cheek_right'],
    (vx, _vy, _vz) => {
      const s = Math.sign(vx || 1e-6);
      const strength = Math.abs(vx) > 0.05 ? 0.05 : 0.035;
      return { dx: s * strength, dy: 0, dz: 0 };
    },
    ['jaw', 'cheek', 'correlated'],
  );
  // Chin projection: chin + lower lip push forward (+z).
  addFineControl(
    'ChinProjectionBasis',
    'face.chin.projection',
    ['chin', 'lower_lip', 'jaw_left', 'jaw_right'],
    ['jaw'],
    (_vx, _vy, vz) => ({ dx: 0, dy: 0, dz: vz >= 0.22 ? 0.045 : 0.02 }),
    ['chin', 'correlated'],
  );
  // Eye spacing: eye + eyelid regions spread laterally about x=0.
  // (The separately-spawned sclera/iris sub-meshes are moved by the dedicated
  // eyeSpacingSclera / eyeSpacingIris morphs; the shape space drives the border
  // and eyelid geometry here.)
  addFineControl(
    'EyeSpacingBasis',
    'face.eye.spacing',
    [
      'eye_left',
      'eye_right',
      'upper_eyelid_left',
      'upper_eyelid_right',
      'lower_eyelid_left',
      'lower_eyelid_right',
    ],
    ['eyes'],
    (vx, _vy, _vz) => ({ dx: Math.sign(vx || 1e-6) * 0.04, dy: 0, dz: 0 }),
    ['eye', 'correlated'],
  );
  // Eye size: eyelid regions expand about the eye centers (both axes).
  addFineControl(
    'EyeSizeBasis',
    'face.eye.size',
    [
      'upper_eyelid_left',
      'upper_eyelid_right',
      'lower_eyelid_left',
      'lower_eyelid_right',
      'eye_left',
      'eye_right',
    ],
    ['eyes'],
    (vx, vy, _vz) => {
      const cx = Math.abs(vx) <= 0.06 ? 0 : Math.sign(vx) * 0.06;
      return { dx: (vx - cx) * 0.12, dy: (vy - 1.9) * 0.2, dz: 0.004 };
    },
    ['eye', 'correlated'],
  );
  // Cheek width: cheeks widen laterally, jaw and temple transition with them.
  addFineControl(
    'CheekWidthBasis',
    'face.cheek.width',
    ['cheek_left', 'cheek_right', 'jaw_left', 'jaw_right', 'temple_left', 'temple_right'],
    ['cheek_left', 'cheek_right'],
    (vx, _vy, _vz) => {
      const s = Math.sign(vx || 1e-6);
      const strength = Math.abs(vx) > 0.06 ? 0.04 : 0.028;
      return { dx: s * strength, dy: 0, dz: 0 };
    },
    ['cheek', 'correlated'],
  );
  // Mouth width: mouth corners spread, lips widen slightly.
  addFineControl(
    'MouthWidthBasis',
    'face.mouth.width',
    ['mouth_corner_left', 'mouth_corner_right', 'upper_lip', 'lower_lip'],
    ['mouth'],
    (vx, _vy, _vz) => {
      const s = Math.sign(vx || 1e-6);
      const strength = Math.abs(vx) > 0.022 ? 0.05 : 0.02;
      return { dx: s * strength, dy: 0, dz: 0 };
    },
    ['mouth', 'correlated'],
  );
  // Upper lip thickness: upper lip grows vertically (up = +y toward mouth).
  addFineControl(
    'UpperLipThicknessBasis',
    'face.upperLip.thickness',
    ['upper_lip', 'mouth_corner_left', 'mouth_corner_right'],
    ['mouth', 'face'],
    (_vx, vy, _vz) => ({ dx: 0, dy: (1.74 - vy) > 0 ? (1.74 - vy) * 0.5 : 0.015, dz: 0 }),
    ['lip', 'correlated'],
  );
  // Lower lip thickness: lower lip grows downward.
  addFineControl(
    'LowerLipThicknessBasis',
    'face.lowerLip.thickness',
    ['lower_lip', 'mouth_corner_left', 'mouth_corner_right'],
    ['mouth', 'face'],
    (_vx, vy, _vz) => ({ dx: 0, dy: (vy - 1.72) > 0 ? (vy - 1.72) * -0.5 : -0.015, dz: 0 }),
    ['lip', 'correlated'],
  );

  // ---- Combination correctives (P11) ----
  // A corrective is a reusable basis that only activates when several linear
  // inputs are simultaneously active (continuous product activation).
  const correctiveBasis = (
    name: string,
    regions: RegionName[],
    fn: (vx: number, vy: number, vz: number) => { dx: number; dy: number; dz: number },
  ): number | null => {
    const present = regions.filter((r) => canonical.regionRanges.has(r));
    if (present.length === 0) return null;
    const ids = new Set<number>();
    for (const r of present) {
      const range = canonical.regionRanges.get(r)!;
      for (let i = range.start; i < range.start + range.count; i++) ids.add(i);
    }
    return space.addVertexBasis(name, 'face.jaw.width', [...ids], fn, ['corrective']).id;
  };

  const jawBasis = space.bases.getByName('JawWidthBasis')?.id;
  const noseBasis = space.bases.getByName('NoseWidthBasis')?.id;
  const mouthBasis = space.bases.getByName('MouthWidthBasis')?.id;
  const cheekBasis = space.bases.getByName('CheekWidthBasis')?.id;

  // Wide jaw + wide mouth: jaw cheeks and mouth corners push wider together.
  if (jawBasis && mouthBasis) {
    const output = correctiveBasis(
      'WideJawWideMouthCorrective',
      ['jaw_left', 'jaw_right', 'cheek_left', 'cheek_right', 'mouth_corner_left', 'mouth_corner_right'],
      (vx, _vy, _vz) => ({ dx: Math.sign(vx || 1e-6) * 0.025, dy: 0.006, dz: 0 }),
    );
    if (output != null) {
      spec.correctiveRules.push({
        inputs: [{ basisId: jawBasis }, { basisId: mouthBasis }],
        outputBasisId: output,
      });
      spec.correctiveMorphs.push({
        name: 'shape_WideJawWideMouthCorrective',
        inputs: [
          { property: 'face.jaw.width' },
          { property: 'face.mouth.width' },
        ],
      });
    }
  }

  // Wide jaw + wide nose: jaw widening bleeds into nose alar widening.
  if (jawBasis && noseBasis) {
    const output = correctiveBasis(
      'WideJawWideNoseCorrective',
      ['nose_alar_left', 'nose_alar_right', 'jaw_left', 'jaw_right'],
      (vx, _vy, _vz) => ({ dx: Math.sign(vx || 1e-6) * 0.018, dy: 0, dz: 0.005 }),
    );
    if (output != null) {
      spec.correctiveRules.push({
        inputs: [{ basisId: jawBasis }, { basisId: noseBasis }],
        outputBasisId: output,
      });
      spec.correctiveMorphs.push({
        name: 'shape_WideJawWideNoseCorrective',
        inputs: [
          { property: 'face.jaw.width' },
          { property: 'face.nose.width' },
        ],
      });
    }
  }

  // Wide cheeks + wide jaw: cheeks bulge outward.
  if (cheekBasis && jawBasis) {
    const output = correctiveBasis(
      'WideCheeksWideJawCorrective',
      ['cheek_left', 'cheek_right', 'jaw_left', 'jaw_right'],
      (vx, _vy, _vz) => ({ dx: Math.sign(vx || 1e-6) * 0.02, dy: -0.004, dz: 0 }),
    );
    if (output != null) {
      spec.correctiveRules.push({
        inputs: [{ basisId: cheekBasis }, { basisId: jawBasis }],
        outputBasisId: output,
      });
      spec.correctiveMorphs.push({
        name: 'shape_WideCheeksWideJawCorrective',
        inputs: [
          { property: 'face.cheek.width' },
          { property: 'face.jaw.width' },
        ],
      });
    }
  }

  // ---- HD BODY V0.1 identity controls ----
  // The same shape-space treatment the head receives (P6/P8): each body control
  // is a sparse, reusable basis with CORRELATED deformation (spreads across its
  // adjacent semantic transition regions) that compiles into the existing sparse
  // morph / GPU pipeline. Fine HD body regions are preferred; the coarse
  // block-human fallback keeps the same basis working on the debug topology.
  //
  // NOTE: `global.height` and the skeleton.*Length props could also be expressed
  // as a single tall basis each, but scaling about the ground (height) and about
  // a segment origin (limb/neck/spine lengths) are kept separate so a person can
  // be short-necked, long-armed, or big-chested independently (correlated, not a
  // single naive scale).

  // Chest (torso or fine chest/back): pectoral width + depth expands laterally
  // and forward, back and shoulder transition with it. body.chest default 1.0.
  addFineControl(
    'ChestWidthBasis',
    'body.chest',
    ['chest', 'back', 'shoulder_left', 'shoulder_right'],
    ['torso'],
    (vx, _vy, vz) => {
      const s = Math.sign(vx || 1e-6);
      const lateral = Math.abs(vx) >= 0.18 ? 0.045 : 0.028;
      return { dx: s * lateral, dy: 0, dz: vz >= 0.05 ? 0.05 : 0.02 };
    },
    ['chest', 'correlated'],
  );

  // Waist (abdomen): waistline narrows/widens radially about the spine axis.
  // body.waist default 1.0.
  addFineControl(
    'WaistBasis',
    'body.waist',
    ['abdomen', 'chest', 'back', 'pelvis'],
    ['torso'],
    (vx, _vy, vz) => ({
      dx: vx * 0.42,
      dy: 0,
      dz: vz * 0.42,
    }),
    ['waist', 'correlated'],
  );

  // Hips (pelvis): hip width/depth about the spine axis, thigh tops transition.
  // body.hips default 1.0.
  addFineControl(
    'HipWidthBasis',
    'body.hips',
    ['pelvis', 'abdomen', 'thigh_left', 'thigh_right'],
    ['torso'],
    (vx, _vy, vz) => ({
      dx: vx * 0.4,
      dy: 0,
      dz: vz * 0.4,
    }),
    ['hips', 'correlated'],
  );

  // Body fat: overall girth increases about the spine on torso regions and adds
  // a softer fullness to the limbs. body.bodyFat default 0.21.
  addFineControl(
    'BodyFatBasis',
    'body.bodyFat',
    [
      'chest',
      'abdomen',
      'back',
      'shoulder_left',
      'shoulder_right',
      'pelvis',
      'upper_arm_left',
      'upper_arm_right',
      'thigh_left',
      'thigh_right',
    ],
    ['torso', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r'],
    (vx, _vy, vz) => ({
      dx: vx * 0.3,
      dy: 0,
      dz: vz * 0.3,
    }),
    ['bodyFat', 'correlated'],
  );

  // Muscularity: adds limb/torso cross-sectional definition (a "swelled" ring
  // about each segment's spine) without growing length. body.muscularity
  // default 0.48.
  addFineControl(
    'MuscleDefinitionBasis',
    'body.muscularity',
    [
      'chest',
      'back',
      'shoulder_left',
      'shoulder_right',
      'upper_arm_left',
      'upper_arm_right',
      'forearm_left',
      'forearm_right',
      'thigh_left',
      'thigh_right',
      'shin_left',
      'shin_right',
    ],
    [
      'torso',
      'upperarm_l',
      'upperarm_r',
      'forearm_l',
      'forearm_r',
      'thigh_l',
      'thigh_r',
      'shin_l',
      'shin_r',
    ],
    (vx, _vy, vz) => {
      // Expand the cross-section ring about the local spine axis; near the
      // center (spine) the delta is smaller so muscle reads as definition.
      const radius = Math.sqrt(vx * vx + vz * vz);
      const amp = Math.min(0.05, 0.015 + radius * 0.4);
      return { dx: vx * amp, dy: 0, dz: vz * amp };
    },
    ['muscle', 'correlated'],
  );

  // Shoulder width: deltoid/acromion span widens laterally; chest and upper arm
  // transitions follow. skeleton.shoulderWidth default 1.0.
  addFineControl(
    'ShoulderWidthBasis',
    'skeleton.shoulderWidth',
    ['shoulder_left', 'shoulder_right', 'chest', 'back', 'upper_arm_left', 'upper_arm_right'],
    ['torso', 'upperarm_l', 'upperarm_r'],
    (vx, _vy, _vz) => {
      const s = Math.sign(vx || 1e-6);
      return { dx: s * Math.min(0.09, Math.abs(vx) * 0.35 + 0.02), dy: 0, dz: 0 };
    },
    ['shoulder', 'correlated'],
  );

  // Spine length: axial (vertical) stretch of the trunk about the hip origin.
  // skeleton.spineLength default 1.0.
  addFineControl(
    'SpineLengthBasis',
    'skeleton.spineLength',
    ['chest', 'abdomen', 'back'],
    ['torso'],
    (_vx, vy, _vz) => ({ dx: 0, dy: (vy - 1.0) * 0.5, dz: 0 }),
    ['spine', 'correlated'],
  );

  // Neck length: axial stretch of the neck about its base. skeleton.neckLength
  // default 1.0.
  addFineControl(
    'NeckLengthBasis',
    'skeleton.neckLength',
    ['neck', 'chest', 'shoulder_left', 'shoulder_right'],
    ['neck'],
    (_vx, vy, _vz) => ({ dx: 0, dy: vy - 1.78, dz: 0 }),
    ['neck', 'correlated'],
  );

  // Arm length: vertical stretch of the upper arm + forearm about the shoulder,
  // with the hand settling below (transition). skeleton.armLength default 1.0.
  addFineControl(
    'ArmLengthBasis',
    'skeleton.armLength',
    ['upper_arm_left', 'upper_arm_right', 'forearm_left', 'forearm_right', 'hand_left', 'hand_right'],
    ['upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'hand_l', 'hand_r'],
    (_vx, vy, _vz) => ({ dx: 0, dy: (vy - 1.45) * 0.4, dz: 0 }),
    ['arm', 'correlated'],
  );

  // Leg length: vertical stretch of thigh + shin about the hip, foot settling
  // below. skeleton.legLength default 1.0.
  addFineControl(
    'LegLengthBasis',
    'skeleton.legLength',
    ['thigh_left', 'thigh_right', 'shin_left', 'shin_right', 'foot_left', 'foot_right'],
    ['thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_left', 'foot_right'],
    (_vx, vy, _vz) => ({ dx: 0, dy: (vy - 1.0) * 0.4, dz: 0 }),
    ['leg', 'correlated'],
  );

  // Global height: uniform axial stretch of the whole skeleton about the ground.
  // Unlike the per-segment length bases this treats every segment together, so
  // a taller person keeps proportions while length-only edits stay independent.
  // global.height default 1.78. We prefer coarse regions for coverage across the
  // whole figure (torso + neck + head + all limb segments).
  addFineControl(
    'GlobalHeightBasis',
    'global.height',
    HD_AXIAL_REGIONS_FINE,
    HD_AXIAL_REGIONS_COARSE,
    (_vx, vy, _vz) => ({ dx: 0, dy: vy, dz: 0 }),
    ['height', 'correlated'],
  );

  // ---- Body combination corrective (P11) ----
  // Muscular + broad shoulders: muscle definition is amplified on the shoulder
  // line when muscularity AND shoulder width are both elevated (produces a
  // "squared deltoid" bulge rather than double-counting independent spans).
  const muscleBasis = space.bases.getByName('MuscleDefinitionBasis')?.id;
  const shoulderBasis = space.bases.getByName('ShoulderWidthBasis')?.id;
  const bodyCorrectiveBasis = (
    name: string,
    regions: RegionName[],
    fn: (vx: number, vy: number, vz: number) => { dx: number; dy: number; dz: number },
  ): number | null => {
    const present = regions.filter((r) => canonical.regionRanges.has(r));
    if (present.length === 0) return null;
    const ids = new Set<number>();
    for (const r of present) {
      const range = canonical.regionRanges.get(r)!;
      for (let i = range.start; i < range.start + range.count; i++) ids.add(i);
    }
    return space.addVertexBasis(name, 'body.muscularity', [...ids], fn, ['corrective']).id;
  };

  if (muscleBasis && shoulderBasis) {
    const output = bodyCorrectiveBasis(
      'MuscularBroadShouldersCorrective',
      ['shoulder_left', 'shoulder_right', 'chest', 'back', 'upper_arm_left', 'upper_arm_right'],
      (vx, _vy, _vz) => {
        const s = Math.sign(vx || 1e-6);
        const lateral = Math.abs(vx) >= 0.18 ? 0.03 : 0.016;
        return { dx: s * lateral, dy: 0.004, dz: 0.006 };
      },
    );
    if (output != null) {
      spec.correctiveRules.push({
        inputs: [{ basisId: muscleBasis }, { basisId: shoulderBasis }],
        outputBasisId: output,
      });
      spec.correctiveMorphs.push({
        name: 'shape_MuscularBroadShouldersCorrective',
        inputs: [
          { property: 'body.muscularity' },
          { property: 'skeleton.shoulderWidth' },
        ],
      });
    }
  }

  return { space, spec };
}