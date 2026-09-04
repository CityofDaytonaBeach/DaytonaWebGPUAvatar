/**
 * P4 semantic regions — HD granularity. A state-of-the-art provider should
 * emit these. Note: a region may span multiple non-contiguous vertex/index
 * ranges; consumers must never assume a region is a single contiguous block.
 */
export const HD_HEAD_REGIONS = [
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
export const HD_HEAD_PART_REGIONS = [
    'eye_sclera',
    'eye_iris',
    'cornea',
    'teeth',
    'tongue',
    'mouth_cavity',
];
export const HD_BODY_REGIONS = [
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
export const EYELID_REGIONS = [
    'upper_eyelid_left',
    'lower_eyelid_left',
    'upper_eyelid_right',
    'lower_eyelid_right',
];
/** All fine-grained regions a conformant HD HEAD V0.1 topology must provide. */
export const REQUIRED_HD_HEAD_REGIONS = [...HD_HEAD_REGIONS];
/** All fine-grained regions a conformant HD BODY V0.1 topology must provide. */
export const REQUIRED_HD_BODY_REGIONS = [...HD_BODY_REGIONS];
/**
 * Coarse-region aliases over fine-grained regions.
 *
 * The canonical contract (validator, shape-basis coarse fallback, delta
 * compiler) is expressed in the coarse vocabulary (torso, upperarm_l, face,
 * nose, ...). An HD topology emits the fine vocabulary (chest, upper_arm_left,
 * eye_left, ...). To let both coexist, a coarse region that is absent from a
 * topology is synthesized as an aggregate alias over its fine sub-regions, so
 * the HD human satisfies the same contract as the procedural block human.
 */
export const COARSE_REGION_FINE_ALIASES = {
    torso: ['chest', 'abdomen', 'back', 'shoulder_left', 'shoulder_right', 'pelvis'],
    upperarm_l: ['upper_arm_left'],
    upperarm_r: ['upper_arm_right'],
    forearm_l: ['forearm_left'],
    forearm_r: ['forearm_right'],
    hand_l: ['hand_left'],
    hand_r: ['hand_right'],
    thigh_l: ['thigh_left'],
    thigh_r: ['thigh_right'],
    shin_l: ['shin_left'],
    shin_r: ['shin_right'],
    face: [
        'forehead',
        'temple_left',
        'temple_right',
        'eye_left',
        'eye_right',
        'upper_eyelid_left',
        'upper_eyelid_right',
        'lower_eyelid_left',
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
    ],
    nose: ['nose_bridge', 'nose_tip', 'nose_alar_left', 'nose_alar_right'],
    jaw: ['jaw_left', 'jaw_right', 'chin'],
    eyes: ['eye_left', 'eye_right'],
    mouth: ['upper_lip', 'lower_lip', 'mouth_corner_left', 'mouth_corner_right'],
};
/**
 * Build region ranges from the per-vertex `region` field, then synthesize any
 * missing coarse regions as aggregate aliases over their fine sub-regions.
 *
 * `start` is the first vertex index carrying the region and `count` is the total
 * number of vertices carrying it (a region may span non-contiguous ranges). This
 * matches the existing coarse-region contract, so an HD topology that emits only
 * fine regions still satisfies every coarse-region consumer (validator, shape
 * basis fallback, delta compiler).
 */
export function buildRegionRanges(vertices) {
    const ranges = new Map();
    for (let i = 0; i < vertices.length; i++) {
        const r = vertices[i].region;
        const existing = ranges.get(r);
        if (existing) {
            existing.count++;
        }
        else {
            ranges.set(r, { start: i, count: 1 });
        }
    }
    for (const [coarse, fines] of Object.entries(COARSE_REGION_FINE_ALIASES)) {
        if (ranges.has(coarse) || !fines)
            continue;
        let start = -1;
        let count = 0;
        for (const fine of fines) {
            const range = ranges.get(fine);
            if (!range)
                continue;
            if (start === -1 || range.start < start)
                start = range.start;
            count += range.count;
        }
        if (start !== -1)
            ranges.set(coarse, { start, count });
    }
    return ranges;
}
//# sourceMappingURL=regions.js.map