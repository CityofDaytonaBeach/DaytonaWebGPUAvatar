/**
 * Image-based lighting for the photoreal path — CPU reference implementation.
 *
 * The delivered photoreal shading layer used a single constant ambient term as a
 * stand-in for an environment probe. A constant ambient is the second-biggest
 * "CG" tell after single-lobe specular: it flattens every cavity, tints nothing,
 * and gives the same fill to the underside of a chin as to a forehead.
 *
 * This module replaces it WITHOUT introducing an environment texture pipeline:
 *
 *   1. The environment is an ANALYTIC studio: a sky gradient, a warm floor
 *      bounce, a soft key panel and a cool fill panel. It is a pure function of
 *      direction, so it can be evaluated identically on the CPU and in WGSL and
 *      needs no texture upload, no mip chain and no async load.
 *   2. Diffuse irradiance is the environment projected onto 9 spherical
 *      harmonic coefficients (Ramamoorthi/Hanrahan). The projection runs once at
 *      module load over a deterministic Fibonacci sphere, and the resulting
 *      numbers are baked into the generated shader — so the GPU evaluates the
 *      same 9 coefficients the CPU tests assert.
 *   3. Specular ambient uses the split-sum approximation: an analytic
 *      prefiltered environment lookup (mirror sample blurred toward the SH
 *      irradiance as roughness rises) multiplied by Karis' analytic env-BRDF.
 *
 * Everything here is deterministic and unit-testable with no GPU in the loop.
 */
import { Vec3 } from './color.js';
/** Nine RGB spherical-harmonic coefficients (L0..L2). */
export type SH9 = readonly Vec3[];
/** Studio environment description — the analytic probe both sides evaluate. */
export declare const STUDIO_ENVIRONMENT: {
    /** Zenith sky colour (cool, soft). */
    readonly skyTop: Vec3;
    /** Horizon colour. */
    readonly skyHorizon: Vec3;
    /** Warm floor bounce colour. */
    readonly floor: Vec3;
    /** Soft key panel: direction, colour, angular radius (cosine threshold). */
    readonly keyPanel: {
        readonly direction: Vec3;
        readonly color: Vec3;
        /** Panel edge softness: cos(theta) where the panel falls to zero. */
        readonly cosOuter: 0.72;
        readonly cosInner: 0.94;
    };
    /** Cool fill panel opposite the key. */
    readonly fillPanel: {
        readonly direction: Vec3;
        readonly color: Vec3;
        readonly cosOuter: 0.55;
        readonly cosInner: 0.9;
    };
};
/**
 * Radiance arriving from `dir` (unit, +Y up) in the analytic studio.
 * Mirrored exactly by `studioEnvironment()` in the generated WGSL.
 */
export declare function studioEnvironment(dir: Vec3): Vec3;
/** Real SH basis (L0..L2), 9 terms, evaluated for a unit direction. */
export declare function sh9Basis(dir: Vec3): number[];
/** Deterministic Fibonacci-sphere direction i of n (uniform on the sphere). */
export declare function fibonacciSphere(i: number, n: number): Vec3;
/**
 * Project a radiance function onto 9 RGB SH coefficients using a deterministic
 * uniform sphere quadrature (solid angle 4π/n per sample).
 */
export declare function projectEnvironmentToSH(radiance?: (dir: Vec3) => Vec3, sampleCount?: 2048): Vec3[];
/**
 * Cosine-convolved irradiance from SH coefficients (Ramamoorthi & Hanrahan
 * "An Efficient Representation for Irradiance Environment Maps"), divided by π
 * so the result is a diffuse *reflectance multiplier* for a white albedo.
 */
export declare function shIrradiance(sh: SH9, normal: Vec3): Vec3;
/** The baked studio probe: 9 RGB SH coefficients, computed once, deterministic. */
export declare const STUDIO_IRRADIANCE_SH: Vec3[];
/**
 * Karis' analytic split-sum environment BRDF (the "mobile" approximation of the
 * prefiltered DFG lookup table). Returns the scale/bias applied to F0.
 */
export declare function environmentBRDF(ndv: number, roughness: number): {
    scale: number;
    bias: number;
};
/**
 * Analytic prefiltered specular probe: a mirror sample of the environment
 * blurred toward the SH irradiance as roughness rises. This is the split-sum
 * "L" term without a mip pyramid — exact at roughness 0, and it converges to the
 * correct low-frequency average at roughness 1.
 */
export declare function prefilteredEnvironment(reflectDir: Vec3, roughness: number, sh?: SH9): Vec3;
/** Reflect `v` about `n` (both unit): the mirror direction for a view vector. */
export declare function reflectDirection(viewDir: Vec3, normal: Vec3): Vec3;
export interface IblSurface {
    normal: Vec3;
    viewDir: Vec3;
    albedo: Vec3;
    roughness: number;
    /** Dielectric F0 scalar (skin ≈ 0.028..0.088). */
    f0: number;
    /** Diffuse occlusion / cavity, 0..1. */
    occlusion: number;
    /** Specular occlusion, 0..1. */
    specularOcclusion?: number;
}
/**
 * Ambient contribution from the probe: SH diffuse irradiance × albedo × AO,
 * plus split-sum specular. Replaces the old constant `ambient` term.
 */
export declare function iblAmbient(surface: IblSurface, sh?: SH9): Vec3;
//# sourceMappingURL=ibl.d.ts.map