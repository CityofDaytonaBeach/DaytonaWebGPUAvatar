/**
 * Procedural skin micro-detail — CPU reference implementation.
 *
 * Produces the two signals that separate a photoreal head from a smooth model:
 *
 *  - a tangent-space MICRO-NORMAL from layered pore/micro-texture noise, so
 *    specular highlights break up the way real skin does instead of forming
 *    one clean sheet;
 *  - a CAVITY term (pores/creases occlude ambient light and suppress specular).
 *
 * Deterministic and hash-based — no textures, no assets, identical on CPU and
 * in the generated WGSL (same hash, same frequencies from `constants.ts`).
 */
import { Vec3 } from './color.js';
/** Deterministic 2D -> 1D hash in [0,1). Mirrored exactly in WGSL. */
export declare function hash21(x: number, y: number): number;
/** Smooth value noise on the hash lattice. */
export declare function valueNoise2D(x: number, y: number): number;
export interface MicroDetailInput {
    /** Surface UV. */
    u: number;
    v: number;
    /** Region pore scale (from REGION_MATERIALS.poreScale); 1 = average. */
    poreScale: number;
    /** Aging 0..1 — older skin has deeper pores and coarser micro-texture. */
    age: number;
    /** Oiliness 0..1 — sebum fills pores, flattening the micro-normal. */
    oiliness: number;
}
export interface MicroDetail {
    /** Tangent-space slope, |x|,|y| <= microSlopeMax. */
    slopeX: number;
    slopeY: number;
    /** Cavity/occlusion term, 0..1 (1 = fully open surface). */
    cavity: number;
    /** Specular occlusion, 0..1 — pores swallow highlights. */
    specularOcclusion: number;
}
/**
 * Two octaves: pore-scale features plus sub-pore micro-texture. The gradient is
 * taken as a finite difference of the height field, which is what makes the
 * result a real (integrable) normal map rather than arbitrary noise.
 */
export declare function microDetail(input: MicroDetailInput): MicroDetail;
/**
 * Apply a tangent-space slope to a geometric normal using a derived tangent
 * frame. Matches `reconstructNormal` in the shader.
 */
export declare function perturbNormal(normal: Vec3, slopeX: number, slopeY: number): Vec3;
//# sourceMappingURL=micro-detail.d.ts.map