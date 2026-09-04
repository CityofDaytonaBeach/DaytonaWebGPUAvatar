/**
 * Photoreal skin BRDF — CPU reference implementation.
 *
 * This is the authoritative, deterministic definition of how skin is shaded.
 * The WGSL in `../wgsl/photoreal-wgsl.ts` is generated from the same constants
 * and mirrors these functions one-for-one, so the shader can be reasoned about
 * (and regression-tested) headlessly, with no GPU in the loop.
 *
 * Model:
 *   - Dual-lobe GGX specular (thin oil layer + broad epidermal lobe), Fresnel
 *     weighted, height-correlated Smith visibility.
 *   - Energy-conserving diffuse: the diffuse lobe is scaled by (1 - F), so
 *     total outgoing radiance never exceeds incoming irradiance.
 *   - Pre-integrated subsurface scattering (Penner/Borshukov style): the
 *     diffuse response is a function of N·L AND local curvature, which is what
 *     produces the soft red terminator that reads as "skin" rather than "clay".
 *   - Back-face transmission for thin tissue (ear rims, nostrils, eyelids).
 *   - Three-point light rig + ambient, then exposure/ACES/sRGB display transform.
 */
import { Vec3 } from './color.js';
/** Schlick Fresnel with an F0 colour. */
export declare function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3;
/** Trowbridge-Reitz (GGX) normal distribution. */
export declare function distributionGGX(ndh: number, roughness: number): number;
/**
 * Height-correlated Smith visibility (Heitz), already divided by the
 * 4·NdotL·NdotV denominator of the microfacet BRDF.
 */
export declare function visibilitySmithCorrelated(ndv: number, ndl: number, roughness: number): number;
/**
 * Dual-lobe specular magnitude (scalar, pre-Fresnel). Skin has a sharp
 * oil/sebum lobe over a broader subsurface-scattered lobe; a single GGX lobe is
 * the classic reason CG skin reads as plastic.
 */
export declare function dualLobeSpecular(ndh: number, ndv: number, ndl: number, roughness: number): number;
/**
 * Pre-integrated subsurface diffusion.
 *
 * `curvature` is 1/radius in metres (higher = tighter feature = narrower
 * scatter), `scatterColor` is the deep-tissue transport colour. Returns the
 * per-channel diffuse response for one light, replacing plain Lambert.
 */
export declare function preIntegratedScatter(ndl: number, curvature: number, scatterColor: Vec3, intensity: number): Vec3;
/**
 * Translucent back-lighting for thin tissue. `thickness` is in metres;
 * thinner tissue transmits more. Uses a light vector distorted along the
 * normal, matching the standard fast-SSS transmission term.
 */
export declare function transmission(normal: Vec3, lightDir: Vec3, viewDir: Vec3, thickness: number, scatterColor: Vec3): Vec3;
export interface SkinSurface {
    /** Shading normal (already micro-detail perturbed), unit length. */
    normal: Vec3;
    /** Direction from the surface toward the eye, unit length. */
    viewDir: Vec3;
    /** Linear albedo (diffuse colour). */
    albedo: Vec3;
    /** Perceptual roughness, 0..1. */
    roughness: number;
    /** Specular reflectance scale, 0..1 (dielectric F0 ~= 0.028 for skin). */
    specular: number;
    /** Deep-tissue scatter colour. */
    scatterColor: Vec3;
    /** Scatter intensity, 0..1. */
    scatterIntensity: number;
    /** Local surface curvature (1/m), drives pre-integrated scatter width. */
    curvature: number;
    /** Tissue thickness in metres for the transmission term. */
    thickness: number;
    /** Ambient occlusion / cavity term, 0..1 (1 = fully open). */
    occlusion: number;
}
export interface LightSample {
    direction: Vec3;
    color: Vec3;
    intensity: number;
}
/** Radiance from one light, in linear space. */
export declare function shadeSkinLight(surface: SkinSurface, light: LightSample): Vec3;
/** Full three-point rig + ambient, returning LINEAR radiance (no tone map). */
export declare function shadeSkinLinear(surface: SkinSurface, rig?: {
    readonly key: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 3.1;
    };
    readonly fill: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 0.85;
    };
    readonly rim: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 1.6;
    };
}): Vec3;
/** Final display-referred sRGB colour for a skin surface. */
export declare function shadeSkin(surface: SkinSurface, rig?: {
    readonly key: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 3.1;
    };
    readonly fill: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 0.85;
    };
    readonly rim: {
        readonly direction: [number, number, number];
        readonly color: [number, number, number];
        readonly intensity: 1.6;
    };
}): Vec3;
//# sourceMappingURL=skin-brdf.d.ts.map