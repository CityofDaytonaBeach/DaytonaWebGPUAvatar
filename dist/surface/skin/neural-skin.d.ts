import { HumanDefinition } from '../../core/schema/human-definition.js';
import { CanonicalHuman, RegionName } from '../../geometry/canonical/canonical-human.js';
export interface SkinResidualSample {
    vertexId: number;
    region: RegionName;
    colorDelta: [number, number, number];
    roughnessDelta: number;
    normalIntensity: number;
}
export interface SkinResidualOptions {
    maxSamples?: number;
    strength?: number;
}
export interface SkinResidualField {
    samples: SkinResidualSample[];
    strength: number;
}
export declare enum SkinPreset {
    Porcelain = "porcelain",
    Fair = "fair",
    LightOlive = "light_olive",
    Olive = "olive",
    Tan = "tan",
    Brown = "brown",
    DarkBrown = "dark_brown",
    Deep = "deep"
}
export interface SkinPresetProfile {
    baseColor: [number, number, number];
    melanin: number;
    hemoglobin: number;
    carotene: number;
    roughness: number;
    specular: number;
    sssColor: [number, number, number];
    sssIntensity: number;
    poreScale: number;
    wrinkleDepth: number;
    freckleDensity: number;
}
export declare const SKIN_PRESETS: Record<SkinPreset, SkinPresetProfile>;
export interface RegionSkinMaterial {
    roughness: number;
    specular: number;
    sssIntensity: number;
    poreScale: number;
    wrinkleSusceptibility: number;
    oiliness: number;
}
export declare const REGION_MATERIALS: Record<string, RegionSkinMaterial>;
export interface WrinkleMap {
    vertexId: number;
    region: RegionName;
    depth: number;
    direction: [number, number];
}
export interface WrinkleOptions {
    expressionIntensity?: number;
    anatomyAge?: number;
}
export interface BlemishDescriptor {
    kind: 'mole' | 'freckle' | 'scar' | 'liver_spot';
    vertexId: number;
    region: RegionName;
    uv: {
        u: number;
        v: number;
    };
    size: number;
    intensity: number;
    colorShift: [number, number, number];
}
export interface BlemishOptions {
    density?: number;
    seed?: number;
    allowScars?: boolean;
}
export interface AgingState {
    age: number;
    uvExposure: number;
    moisture: number;
    elasticity: number;
    collagenLoss: number;
    wrinkleDepth: number;
    pigmentationVariation: number;
}
export interface PoreDetail {
    vertexId: number;
    region: RegionName;
    coarse: number;
    medium: number;
    fine: number;
    combined: number;
}
export interface PoreOptions {
    scales?: number;
}
/**
 * Flat GPU-uploadable skin material data.
 * Each field is a Float32Array ready for writeBuffer / createTexture.
 */
export interface SkinMaterialExport {
    vertexCount: number;
    /** RGB base color per vertex, stride 3 */
    baseColor: Float32Array;
    /** Roughness per vertex, stride 1 */
    roughness: Float32Array;
    /** Specular intensity per vertex, stride 1 */
    specular: Float32Array;
    /** SSS scatter color RGB per vertex, stride 3 */
    sssColor: Float32Array;
    /** SSS scatter depth/intensity per vertex, stride 1 */
    sssDepth: Float32Array;
    /** Normal detail intensity per vertex, stride 1 */
    normalIntensity: Float32Array;
    /** Pore detail per vertex, stride 1 */
    poreDetail: Float32Array;
    /** Wrinkle depth per vertex, stride 1 */
    wrinkleDepth: Float32Array;
    /** Blemish mask per vertex, stride 1 */
    blemishMask: Float32Array;
    /** Tangent-space normal perturbation X per vertex (skin only), stride 1 */
    normalPerturbX: Float32Array;
    /** Tangent-space normal perturbation Y per vertex (skin only), stride 1 */
    normalPerturbY: Float32Array;
}
/**
 * Computes a composite aging state from definition parameters.
 * Combines chronological age, UV exposure, and moisture loss into
 * derived metrics that drive wrinkle, pigment, and elasticity changes.
 */
export declare function computeAgingState(definition: HumanDefinition, overrides?: Partial<AgingState>): AgingState;
/**
 * Multi-scale pore detail. Generates coarse (large pores),
 * medium, and fine (micro-texture) layers independently, then combines.
 */
export declare function generatePoreDetail(vertexId: number, uv: {
    u: number;
    v: number;
}, region: RegionName, options?: PoreOptions): PoreDetail;
/**
 * Derives wrinkle depth and direction per vertex from expression intensity
 * and anatomical aging state. Wrinkle direction follows the local UV gradient
 * of the wrinkle noise field.
 */
export declare function generateWrinkleMap(vertices: {
    id: number;
    uv: {
        u: number;
        v: number;
    };
    region: RegionName;
}[], aging: AgingState, options?: WrinkleOptions): WrinkleMap[];
/**
 * Procedural blemish placement. Generates moles, freckles, scars, and liver
 * spots with deterministic seeded placement controlled by density and seed.
 */
export declare function generateBlemishes(vertices: {
    id: number;
    uv: {
        u: number;
        v: number;
    };
    region: RegionName;
}[], definition: HumanDefinition, options?: BlemishOptions): BlemishDescriptor[];
/**
 * Approximates per-vertex SSS scatter color and depth.
 * Uses anatomical thickness estimate from region + age-derived
 * absorption to produce scatter color for translucent skin shading.
 */
export declare function computeSSSApproximation(vertexId: number, region: RegionName, aging: AgingState, preset: SkinPresetProfile): {
    color: [number, number, number];
    depth: number;
};
/**
 * Per-vertex tangent-space normal perturbation from multi-scale pore and
 * wrinkle detail. Returns [perturbX, perturbY] where the tangent-space
 * normal is reconstructed as (perturbX, perturbY, sqrt(1 - x^2 - y^2)).
 */
export declare function generateNormalPerturbation(vertexId: number, uv: {
    u: number;
    v: number;
}, region: RegionName, aging: AgingState, poreDetailCombined: number, wrinkleDepthVal: number, strength?: number): [number, number];
/**
 * Generates a flat Float32Array-based material export suitable for
 * direct GPU buffer/texture upload. All fields are per-vertex, tightly packed.
 */
export declare function exportSkinMaterial(definition: HumanDefinition, canonical: CanonicalHuman, preset?: SkinPreset): SkinMaterialExport;
/** Returns the immutable preset profile for a given SkinPreset. */
export declare function getSkinPresetProfile(preset: SkinPreset): SkinPresetProfile;
/** Returns the per-region material properties for a given region. */
export declare function getRegionSkinMaterial(region: RegionName): RegionSkinMaterial;
/**
 * Procedural neural-skin residual stand-in. It is deterministic, bounded, and
 * driven by semantic skin state so it can be replaced by a trained model later
 * without changing the public surface API.
 */
export declare function generateSkinResiduals(definition: HumanDefinition, canonical: CanonicalHuman, options?: SkinResidualOptions): SkinResidualField;
export declare function applySkinResidualColor(base: [number, number, number], residual: SkinResidualSample): [number, number, number];
//# sourceMappingURL=neural-skin.d.ts.map