import type { CanonicalTopologyVertex } from './canonical-topology.js';
/**
 * HD BODY V0.1 parametric skin builder.
 *
 * Generates a continuous torso + limb skin mesh in the same coordinate frame as
 * the HD HEAD skin (neck collar at y ≈ 1.68, x lateral with right = +x, z depth
 * with front = +z), exposing the full HD_BODY_REGIONS semantic vocabulary and
 * weighted skeleton skinning across pelvis / spine / chest / clavicle /
 * upperarm / forearm / hand / thigh / shin / foot bones. The neck ring fuses
 * cleanly at the HD head's collar so head + body form one compatible topology.
 */
export interface HdBodySkinOptions {
    /** Vertical (y) of the neck collar where the head skin attaches. */
    neckY?: number;
    /** Ring segments (azimuth resolution) per limb/torso column. */
    segments?: number;
}
/**
 * Compose a full-body skin: torso + pelvis, two arms, two legs, two feet.
 * Returns flat vertex/index arrays ready to append to the canonical topology.
 */
export declare function buildHdBodySkin(opts?: HdBodySkinOptions): {
    vertices: CanonicalTopologyVertex[];
    indices: Uint32Array;
};
//# sourceMappingURL=hd-body-skin.d.ts.map