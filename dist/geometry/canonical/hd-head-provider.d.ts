import type { CanonicalHumanAsset, CanonicalHumanProvider, CanonicalValidationResult } from './canonical-provider.js';
/** Coordinate frame shared with the block human's skeleton (head bone ~y1.86). */
export interface HdHeadOptions {
    headBone?: string;
    neckBone?: string;
    rings?: number;
    segments?: number;
    /**
     * Fuse the head into the body's implicit surface so the canonical skin is ONE
     * watertight manifold (default). `false` restores the historical layered
     * head-shell-over-body build.
     */
    fuseHead?: boolean;
    /** Grid resolution of the fused surface along y. */
    ySteps?: number;
}
/**
 * Procedural DAYTONA HD HUMAN V0.1 provider.
 *
 * Generates an anatomy-rich FULL-BODY topology from scratch: a parametric
 * cranium + face skin with fine-grained P4 head regions, real eye parts
 * (sclera / iris / pupil / separate cornea), teeth, tongue and mouth cavity,
 * plus a parametric torso + limb skin with the full HD body region vocabulary
 * and weighted skeleton skinning (pelvis / spine / chest / clavicle / limbs),
 * ~45 surface-relative landmarks and skeleton skin weights — all exposed
 * through the CanonicalHumanProvider seam so the Human runtime consumes it
 * exactly like the block human.
 *
 * By default the head is FUSED into the body surface (`fuseHead`), so the skin
 * is one watertight manifold from crown to feet with no body/head seam cut;
 * `fuseHead: false` restores the layered head-shell build unchanged.
 */
export declare class HDCanonicalHumanProvider implements CanonicalHumanProvider {
    readonly version = "DaytonaCanonicalHuman v0.1";
    private readonly headBone;
    private readonly neckBone;
    private readonly rings;
    private readonly segments;
    private readonly fuseHead;
    private readonly ySteps;
    constructor(opts?: HdHeadOptions);
    load(): Promise<CanonicalHumanAsset>;
    validate(): CanonicalValidationResult;
    topologyVersion(): string;
    private buildGeometry;
    /** Parametric cranium + face skin with P4 region assignment. */
    private buildSkin;
    /**
     * For any required HD head region the sampling missed, force the vertex
     * nearest to a sensible anatomical anchor into that region. Delegates to the
     * shared head contract so the fused surface behaves identically.
     */
    private ensureRequiredRegions;
    private skinWeights;
    private rxAt;
    private rzAt;
    private czAt;
    /** Assign fine-grained P4 semantic regions from local geometry. */
    private regionFor;
    /** Detailed parts: eyes (sclera/iris/pupil/cornea), teeth, tongue, cavity. */
    private buildDetailParts;
    private buildLandmarks;
    private landmarkTriangle;
}
//# sourceMappingURL=hd-head-provider.d.ts.map