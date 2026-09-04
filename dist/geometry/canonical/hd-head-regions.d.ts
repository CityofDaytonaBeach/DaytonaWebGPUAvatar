import type { RegionName } from './canonical-human.js';
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
export declare const HEAD_TOP_Y = 2.06;
export declare const HEAD_NECK_Y = 1.68;
/** Face plane: the head profile is centred here in z (front is +z). */
export declare const HEAD_CENTER_Z = 0.2;
/**
 * Ellipsoidal head volume used by the fused (implicit) path. Its radii match the
 * shell profile (`rxAt` / `rzAt`) and its vertical extent matches
 * HEAD_NECK_Y..HEAD_TOP_Y, so both paths occupy the same space.
 */
export declare const HEAD_ELLIPSOID: {
    readonly center: {
        readonly x: 0;
        readonly y: number;
        readonly z: 0.2;
    };
    readonly radii: {
        readonly x: 0.11;
        readonly y: number;
        readonly z: 0.125;
    };
};
/** Lower-face regions that blend head↔jaw (P15 facial skinned connection). */
export declare const JAW_DRIVEN_REGIONS: RegionName[];
/** Skin weights for a head-skin vertex of the given region. */
export declare function headSkinWeights(region: RegionName, headBone?: string, neckBone?: string): Record<string, number>;
/**
 * Assign a fine-grained P4 semantic head region from local geometry.
 *
 * Moved verbatim from HDCanonicalHumanProvider so the fused surface classifies
 * identically; the provider now delegates to this function.
 */
export declare function headRegionFor(y: number, x: number, z: number): RegionName;
/** Anatomical anchor points used to guarantee required-region coverage. */
export declare const REGION_ANCHORS: Partial<Record<RegionName, {
    x: number;
    y: number;
    z: number;
}>>;
/**
 * Force the vertex nearest to each missing region's anatomical anchor into that
 * region. Guarantees the semantic vocabulary is non-empty regardless of mesh
 * density, and is shared by the shell and fused paths.
 */
export declare function ensureHeadRegions<T extends {
    region: RegionName;
    position: {
        x: number;
        y: number;
        z: number;
    };
}>(vertices: T[], required: readonly RegionName[]): void;
//# sourceMappingURL=hd-head-regions.d.ts.map