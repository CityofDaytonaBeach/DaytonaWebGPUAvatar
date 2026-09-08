/**
 * Scan-derived BASE HEAD ASSET ingestion (DAYTONA HD HEAD V0.1).
 *
 * The authored/procedural head is an implicit-surface sculpt. It can be made
 * clean, but it can never be *real*: it has no scan-derived facial topology, no
 * authored eyelid/lip/ear loops, and no measured identity space. That is the
 * actual ceiling we kept hitting — not shading.
 *
 * This module opens the seam for a real head: a neutral, engine-agnostic asset
 * format that a scan-derived head model (ICT-FaceKit, GNM, or any other) can be
 * baked into, plus a `CanonicalHumanProvider` that feeds it through the existing
 * canonical topology / validator / adapter path. Nothing else in the SDK changes:
 * HumanDefinition stays the source of truth, the dependency graph, delta
 * compiler, sparse morphs, identity preservation, event timeline, WebGPU
 * pipeline and WebGL2 fallback all keep driving the head exactly as before.
 *
 * ## Licensing is enforced here, on purpose
 *
 * Several of the best public head models are research-only, and their licenses
 * bind *derivatives* too — a head fitted to or sculpted from them inherits the
 * restriction. The SDK ships inside a public city kiosk, so the license of the
 * baked head is a shipping property of the build, not a footnote. Every asset
 * declares its license; `assetLicenseClass()` classifies it, and a provider
 * constructed with `requireShippable` (the default for production builds)
 * refuses to load anything that is not commercially redistributable. Research
 * assets remain fully loadable for evaluation and comparison with
 * `requireShippable: false`.
 */
import type { Vec3 } from '../../core/math/vec.js';
import type { RegionName } from './canonical-human.js';
import type { CanonicalHumanAsset, CanonicalHumanProvider, CanonicalValidationResult } from './canonical-provider.js';
import { type ProportionReport } from '../reference/anthropometry.js';
export type LicenseClass = 
/** Permissive: may be baked into and redistributed with a commercial build. */
'shippable'
/** Research / non-commercial / no-derivatives: evaluation only. */
 | 'research_only'
/** Not recognised — treated as research_only until explicitly classified. */
 | 'unknown';
/**
 * Known permissive licenses. Only these may be baked into a shipped build.
 * Compared case-insensitively against the asset's declared `license` SPDX-ish id.
 */
export declare const SHIPPABLE_LICENSES: readonly string[];
/**
 * Licenses known to be research/non-commercial. Listed explicitly so the
 * classification is auditable rather than a silent fallthrough. These cover the
 * common public head-model terms (FLAME, SMPL-X, METHA, Universal_Head_3DMM,
 * Head360 and similar custom academic terms).
 */
export declare const RESEARCH_ONLY_LICENSES: readonly string[];
export declare function assetLicenseClass(license: string): LicenseClass;
/** True only for licenses that may be redistributed in a commercial build. */
export declare function isShippableLicense(license: string): boolean;
/**
 * A named blendshape (expression / identity basis vector) carried with the base
 * head. Deltas are sparse: `indices[i]` names the vertex, and the three
 * consecutive `deltas` entries are its offset. Sparse because a real expression
 * basis touches a small fraction of the mesh and the SDK's morph pipeline is
 * already sparse.
 */
export interface BaseHeadBlendshape {
    name: string;
    indices: Uint32Array;
    /** length === indices.length * 3 */
    deltas: Float32Array;
}
/** A named landmark expressed as a vertex index into the base mesh. */
export interface BaseHeadLandmark {
    name: string;
    vertexIndex: number;
}
/**
 * A scan-derived neutral head, in the canonical coordinate frame (metres, +y up,
 * +z forward, origin at the feet — the same frame as the block/HD body, head
 * bone near y=1.86).
 */
export interface BaseHeadAsset {
    /** Human-readable source, e.g. "ICT-FaceKit generic neutral". */
    name: string;
    /** Source repository or publication URL, for attribution. */
    source: string;
    /** SPDX-ish license id; classified by `assetLicenseClass`. */
    license: string;
    /** Asset format revision. */
    revision: string;
    /** Interleaved xyz, length === vertexCount * 3. */
    positions: Float32Array;
    /** Interleaved xyz normals; recomputed when absent. */
    normals?: Float32Array;
    /** Interleaved uv, length === vertexCount * 2. */
    uvs?: Float32Array;
    /** Triangle list. */
    indices: Uint32Array;
    /**
     * Optional per-vertex semantic region. When omitted, regions are derived from
     * canonical-frame position via `headRegionFor`, so an unlabelled scan mesh is
     * still fully usable.
     */
    regions?: RegionName[];
    landmarks?: BaseHeadLandmark[];
    blendshapes?: BaseHeadBlendshape[];
}
export interface BaseHeadValidationIssue {
    code: string;
    message: string;
}
export interface BaseHeadInspection {
    vertexCount: number;
    triangleCount: number;
    licenseClass: LicenseClass;
    shippable: boolean;
    hasUvs: boolean;
    hasNormals: boolean;
    blendshapeCount: number;
    landmarkCount: number;
    bounds: {
        min: Vec3;
        max: Vec3;
    };
    /** Anthropometric gate result, when enough landmarks are present. */
    proportions: ProportionReport | null;
    issues: BaseHeadValidationIssue[];
    valid: boolean;
}
/**
 * Structurally validate an asset and report everything a reviewer needs before
 * baking it: counts, bounds, license class, and whether it satisfies the
 * anthropometric canons. Never throws.
 */
export declare function inspectBaseHeadAsset(asset: BaseHeadAsset): BaseHeadInspection;
/** Measure the asset's own landmarks against the anthropometry reference. */
export declare function measureAsset(asset: BaseHeadAsset): ProportionReport;
/** Area-weighted vertex normals. Deterministic; used when the asset omits them. */
export declare function computeAssetNormals(positions: Float32Array, indices: Uint32Array): Float32Array;
export interface BaseHeadProviderOptions {
    headBone?: string;
    neckBone?: string;
    /**
     * Refuse to load an asset whose license is not commercially redistributable.
     * Defaults to TRUE: a shipped kiosk build must not carry a research-only head.
     * Set false only for local evaluation and comparison.
     */
    requireShippable?: boolean;
    /**
     * Reject an asset that fails the anthropometric canons. Off by default so a
     * stylised or deliberately atypical head can still be loaded; the report is
     * always available from `inspect()`.
     */
    requireProportions?: boolean;
}
export declare class BaseHeadLicenseError extends Error {
    readonly assetName: string;
    readonly license: string;
    readonly licenseClass: LicenseClass;
    constructor(assetName: string, license: string, licenseClass: LicenseClass);
}
/**
 * Feeds a scan-derived base head through the canonical provider seam, so the
 * runtime consumes a real head exactly as it consumes the procedural one.
 */
export declare class BaseHeadProvider implements CanonicalHumanProvider {
    private readonly asset;
    readonly version = "DaytonaCanonicalHuman v0.1";
    private readonly headBone;
    private readonly neckBone;
    private readonly requireShippable;
    private readonly requireProportions;
    constructor(asset: BaseHeadAsset, opts?: BaseHeadProviderOptions);
    /** Full structural / license / proportion report without building geometry. */
    inspect(): BaseHeadInspection;
    private build;
    /**
     * Convert vertex-index landmarks into the SDK's surface-relative form (triangle
     * + barycentric + normal offset) so they survive deformation.
     */
    private surfaceLandmarks;
    /** Blendshapes carried by the asset, for the sparse morph pipeline. */
    blendshapes(): readonly BaseHeadBlendshape[];
    load(): Promise<CanonicalHumanAsset>;
    validate(): CanonicalValidationResult;
    topologyVersion(): string;
}
//# sourceMappingURL=base-head-asset.d.ts.map