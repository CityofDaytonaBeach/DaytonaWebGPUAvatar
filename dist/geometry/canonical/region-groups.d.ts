import type { RegionName } from './canonical-human.js';
/**
 * Coarse region groups.
 *
 * The HD canonical human names anatomy granularly (`nose_tip`, `eye_left`,
 * `thigh_left`), while the original coarse vocabulary (`nose`, `eyes`,
 * `thigh_l`) is still the API surface used by tattoos, validators, morph
 * targets and callers. Instead of scattering name comparisons, every consumer
 * resolves a region to its group and matches on that: a request for `nose`
 * covers the whole nose, whichever topology is loaded.
 */
export type RegionGroup = 'head' | 'nose' | 'eyes' | 'ears' | 'mouth' | 'jaw' | 'neck' | 'torso' | 'upperarm_l' | 'upperarm_r' | 'forearm_l' | 'forearm_r' | 'hand_l' | 'hand_r' | 'thigh_l' | 'thigh_r' | 'shin_l' | 'shin_r' | 'foot_l' | 'foot_r';
/** Coarse group a region belongs to. */
export declare function regionGroup(region: RegionName): RegionGroup;
/**
 * True when `region` satisfies a request for `wanted` — exactly the same
 * region, or the same coarse group (so `nose` matches `nose_tip`).
 */
export declare function regionMatches(region: RegionName, wanted: RegionName): boolean;
/** Every region of a mesh vocabulary that satisfies a request for `wanted`. */
export declare function regionsMatching(regions: Iterable<RegionName>, wanted: RegionName): RegionName[];
//# sourceMappingURL=region-groups.d.ts.map