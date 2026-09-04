/**
 * Shared HD head geometry contract.
 *
 * Both head producers consume this module, so the semantic vocabulary is
 * authored exactly once:
 *
 *   - `HDCanonicalHumanProvider.buildSkin()` — the layered head shell (the
 *     historical path, still selectable with `fuseHead: false`).
 *   - `buildHdBodyManifold({ fuseHead: true })` — the fused canonical, where the
 *     head is a term of the body's implicit union and therefore part of ONE
 *     watertight surface with no body/head seam cut.
 *
 * Keeping the classifier and the head volume in one place is what makes the two
 * paths semantically interchangeable: a fused vertex at a given position lands
 * in the same region it would have landed in on the shell.
 */
/** Head crown / neck-collar extents of the canonical frame (metres, y up). */
export const HEAD_TOP_Y = 2.06;
export const HEAD_NECK_Y = 1.68;
/** Face plane: the head profile is centred here in z (front is +z). */
export const HEAD_CENTER_Z = 0.2;
/**
 * Ellipsoidal head volume used by the fused (implicit) path. Its radii match the
 * shell profile (`rxAt` / `rzAt`) and its vertical extent matches
 * HEAD_NECK_Y..HEAD_TOP_Y, so both paths occupy the same space.
 */
export const HEAD_ELLIPSOID = {
    center: { x: 0, y: (HEAD_TOP_Y + HEAD_NECK_Y) / 2, z: HEAD_CENTER_Z },
    radii: { x: 0.11, y: (HEAD_TOP_Y - HEAD_NECK_Y) / 2, z: 0.125 },
};
/** Lower-face regions that blend head↔jaw (P15 facial skinned connection). */
export const JAW_DRIVEN_REGIONS = [
    'jaw_left',
    'jaw_right',
    'chin',
    'upper_lip',
    'lower_lip',
    'mouth_corner_left',
    'mouth_corner_right',
];
/** Skin weights for a head-skin vertex of the given region. */
export function headSkinWeights(region, headBone = 'head', neckBone = 'neck') {
    if (region === 'neck')
        return { [neckBone]: 1.0 };
    if (region === 'jaw_left' || region === 'jaw_right' || region === 'chin') {
        return { [headBone]: 0.45, jaw: 0.55 };
    }
    if (region === 'upper_lip' ||
        region === 'lower_lip' ||
        region === 'mouth_corner_left' ||
        region === 'mouth_corner_right') {
        return { [headBone]: 0.6, jaw: 0.4 };
    }
    return { [headBone]: 1.0 };
}
/**
 * Assign a fine-grained P4 semantic head region from local geometry.
 *
 * Moved verbatim from HDCanonicalHumanProvider so the fused surface classifies
 * identically; the provider now delegates to this function.
 */
export function headRegionFor(y, x, z) {
    // Back / crown cranium (z behind face plane) → coarse 'head'.
    if (z < HEAD_CENTER_Z) {
        if (y > 1.72 && y < 1.96 && Math.abs(x) > 0.075 && Math.abs(x) < 0.115 && z < 0.155) {
            return x < 0 ? 'ear_left' : 'ear_right';
        }
        return 'head';
    }
    const front = z - HEAD_CENTER_Z; // 0 at face plane, + forward
    const ay = Math.abs(y - 1.9); // distance from eye height
    // Forehead.
    if (y > 1.95) {
        if (Math.abs(x) < 0.05)
            return 'forehead';
        return 'head';
    }
    // Eye band: central disc → eye_left/right, top/bottom → upper/lower eyelids.
    // Must be checked before temples so the eye area is not swallowed.
    if (ay <= 0.02 && Math.abs(x) >= 0.03 && Math.abs(x) <= 0.095 && front > 0.02) {
        const side = x < 0 ? 'left' : 'right';
        const distFromCenter = Math.abs(Math.abs(x) - 0.06);
        if (distFromCenter <= 0.015) {
            const dy = y - 1.9;
            if (dy > 0.007)
                return `upper_eyelid_${side}`;
            if (dy < -0.007)
                return `lower_eyelid_${side}`;
            return side === 'left' ? 'eye_left' : 'eye_right';
        }
    }
    // Temples (upper side-front), outside the eye disc.
    if (y > 1.86 && y <= 1.92 && Math.abs(x) >= 0.065) {
        return x < 0 ? 'temple_left' : 'temple_right';
    }
    // Nose bridge (front center, mid face).
    if (Math.abs(x) < 0.017 && y >= 1.82 && y < 1.95) {
        return 'nose_bridge';
    }
    // Nose tip + alars (around y1.78 front).
    if (Math.abs(x) < 0.017 && y >= 1.74 && y < 1.82) {
        return 'nose_tip';
    }
    if (Math.abs(x) >= 0.017 && Math.abs(x) < 0.05 && y >= 1.74 && y < 1.82) {
        return x < 0 ? 'nose_alar_left' : 'nose_alar_right';
    }
    // Cheeks (mid face, lateral).
    if (y >= 1.76 && y < 1.9 && Math.abs(x) >= 0.03) {
        return x < 0 ? 'cheek_left' : 'cheek_right';
    }
    // Upper lip.
    if (Math.abs(x) <= 0.035 && y >= 1.7 && y < 1.75) {
        if (Math.abs(x) > 0.023) {
            return x < 0 ? 'mouth_corner_left' : 'mouth_corner_right';
        }
        const lipSplit = 1.725;
        return y >= lipSplit ? 'lower_lip' : 'upper_lip';
    }
    // Jaw downward corners.
    if (Math.abs(x) >= 0.03 && Math.abs(x) <= 0.1 && y < 1.76) {
        return x < 0 ? 'jaw_left' : 'jaw_right';
    }
    // Chin (front center, low).
    if (Math.abs(x) < 0.035 && y < 1.7)
        return 'chin';
    // Neck collar.
    if (y <= 1.7)
        return 'neck';
    return 'head';
}
/** Anatomical anchor points used to guarantee required-region coverage. */
export const REGION_ANCHORS = {
    forehead: { x: 0, y: 1.99, z: 0.26 },
    temple_left: { x: -0.09, y: 1.9, z: 0.17 },
    temple_right: { x: 0.09, y: 1.9, z: 0.17 },
    eye_left: { x: -0.06, y: 1.9, z: 0.28 },
    eye_right: { x: 0.06, y: 1.9, z: 0.28 },
    upper_eyelid_left: { x: -0.06, y: 1.912, z: 0.27 },
    upper_eyelid_right: { x: 0.06, y: 1.912, z: 0.27 },
    lower_eyelid_left: { x: -0.06, y: 1.89, z: 0.26 },
    lower_eyelid_right: { x: 0.06, y: 1.89, z: 0.26 },
    nose_bridge: { x: 0, y: 1.87, z: 0.27 },
    nose_tip: { x: 0, y: 1.78, z: 0.3 },
    nose_alar_left: { x: -0.03, y: 1.77, z: 0.26 },
    nose_alar_right: { x: 0.03, y: 1.77, z: 0.26 },
    cheek_left: { x: -0.08, y: 1.82, z: 0.22 },
    cheek_right: { x: 0.08, y: 1.82, z: 0.22 },
    upper_lip: { x: 0, y: 1.735, z: 0.26 },
    lower_lip: { x: 0, y: 1.715, z: 0.25 },
    mouth_corner_left: { x: -0.03, y: 1.74, z: 0.24 },
    mouth_corner_right: { x: 0.03, y: 1.74, z: 0.24 },
    jaw_left: { x: -0.08, y: 1.72, z: 0.18 },
    jaw_right: { x: 0.08, y: 1.72, z: 0.18 },
    chin: { x: 0, y: 1.7, z: 0.24 },
    ear_left: { x: -0.11, y: 1.9, z: 0.16 },
    ear_right: { x: 0.11, y: 1.9, z: 0.16 },
    neck: { x: 0, y: 1.68, z: 0.18 },
};
/**
 * Force the vertex nearest to each missing region's anatomical anchor into that
 * region. Guarantees the semantic vocabulary is non-empty regardless of mesh
 * density, and is shared by the shell and fused paths.
 */
export function ensureHeadRegions(vertices, required) {
    const present = new Set(vertices.map((v) => v.region));
    for (const region of required) {
        if (present.has(region))
            continue;
        const anchor = REGION_ANCHORS[region];
        if (!anchor)
            continue;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i].position;
            const d = (p.x - anchor.x) ** 2 + (p.y - anchor.y) ** 2 + (p.z - anchor.z) ** 2;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        if (best >= 0) {
            vertices[best] = { ...vertices[best], region };
            present.add(region);
        }
    }
}
//# sourceMappingURL=hd-head-regions.js.map