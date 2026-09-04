import type { RegionName } from './canonical-human.js';
/**
 * P4 semantic regions — HD granularity. A state-of-the-art provider should
 * emit these. Note: a region may span multiple non-contiguous vertex/index
 * ranges; consumers must never assume a region is a single contiguous block.
 */
export declare const HD_HEAD_REGIONS: RegionName[];
export declare const HD_HEAD_PART_REGIONS: RegionName[];
export declare const HD_BODY_REGIONS: RegionName[];
/** Fine-grained eye-region names that drive eyelid deformations. */
export declare const EYELID_REGIONS: RegionName[];
/** All fine-grained regions a conformant HD HEAD V0.1 topology must provide. */
export declare const REQUIRED_HD_HEAD_REGIONS: RegionName[];
/** All fine-grained regions a conformant HD BODY V0.1 topology must provide. */
export declare const REQUIRED_HD_BODY_REGIONS: RegionName[];
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
export declare const COARSE_REGION_FINE_ALIASES: Partial<Record<RegionName, RegionName[]>>;
export interface IndexRange {
    start: number;
    count: number;
}
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
export declare function buildRegionRanges(vertices: ReadonlyArray<{
    region: RegionName;
}> | ReadonlyArray<{
    readonly region: RegionName;
}>): Map<RegionName, IndexRange>;
//# sourceMappingURL=regions.d.ts.map