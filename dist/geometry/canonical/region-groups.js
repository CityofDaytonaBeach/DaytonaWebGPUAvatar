const GROUP_OF = {
    head: 'head',
    face: 'head',
    forehead: 'head',
    temple_left: 'head',
    temple_right: 'head',
    cheek_left: 'head',
    cheek_right: 'head',
    nose: 'nose',
    nose_bridge: 'nose',
    nose_tip: 'nose',
    nose_alar_left: 'nose',
    nose_alar_right: 'nose',
    eyes: 'eyes',
    eye_left: 'eyes',
    eye_right: 'eyes',
    eye_sclera: 'eyes',
    eye_iris: 'eyes',
    cornea: 'eyes',
    upper_eyelid_left: 'eyes',
    lower_eyelid_left: 'eyes',
    upper_eyelid_right: 'eyes',
    lower_eyelid_right: 'eyes',
    ear_left: 'ears',
    ear_right: 'ears',
    mouth: 'mouth',
    upper_lip: 'mouth',
    lower_lip: 'mouth',
    mouth_corner_left: 'mouth',
    mouth_corner_right: 'mouth',
    mouth_cavity: 'mouth',
    jaw: 'jaw',
    jaw_left: 'jaw',
    jaw_right: 'jaw',
    chin: 'jaw',
    teeth: 'jaw',
    tongue: 'jaw',
    neck: 'neck',
    torso: 'torso',
    chest: 'torso',
    abdomen: 'torso',
    back: 'torso',
    pelvis: 'torso',
    shoulder_left: 'torso',
    shoulder_right: 'torso',
    upperarm_l: 'upperarm_l',
    upperarm_r: 'upperarm_r',
    upper_arm_left: 'upperarm_l',
    upper_arm_right: 'upperarm_r',
    forearm_l: 'forearm_l',
    forearm_r: 'forearm_r',
    forearm_left: 'forearm_l',
    forearm_right: 'forearm_r',
    hand_l: 'hand_l',
    hand_r: 'hand_r',
    hand_left: 'hand_l',
    hand_right: 'hand_r',
    thigh_l: 'thigh_l',
    thigh_r: 'thigh_r',
    thigh_left: 'thigh_l',
    thigh_right: 'thigh_r',
    shin_l: 'shin_l',
    shin_r: 'shin_r',
    shin_left: 'shin_l',
    shin_right: 'shin_r',
    foot_left: 'foot_l',
    foot_right: 'foot_r',
};
/** Coarse group a region belongs to. */
export function regionGroup(region) {
    return GROUP_OF[region];
}
/**
 * True when `region` satisfies a request for `wanted` — exactly the same
 * region, or the same coarse group (so `nose` matches `nose_tip`).
 */
export function regionMatches(region, wanted) {
    if (region === wanted)
        return true;
    const a = GROUP_OF[region];
    const b = GROUP_OF[wanted];
    return a !== undefined && a === b;
}
/** Every region of a mesh vocabulary that satisfies a request for `wanted`. */
export function regionsMatching(regions, wanted) {
    const out = [];
    for (const r of regions)
        if (regionMatches(r, wanted))
            out.push(r);
    return out;
}
//# sourceMappingURL=region-groups.js.map