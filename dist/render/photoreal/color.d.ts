/**
 * Colour / tone-mapping utilities for the photoreal path.
 *
 * All shading math runs in linear space; the final pixel is exposed,
 * tone-mapped (ACES fitted approximation) and encoded to sRGB. Kept separate
 * from the BRDF so tests can prove the transfer curves in isolation.
 */
export type Vec3 = [number, number, number];
export declare function vadd(a: Vec3, b: Vec3): Vec3;
export declare function vmul(a: Vec3, b: Vec3): Vec3;
export declare function vscale(a: Vec3, s: number): Vec3;
export declare function vlerp(a: Vec3, b: Vec3, t: number): Vec3;
export declare function vlength(a: Vec3): number;
export declare function vnormalize(a: Vec3): Vec3;
export declare function vdot(a: Vec3, b: Vec3): number;
export declare function clamp01(x: number): number;
/** Perceptual luminance (Rec. 709) of a linear colour. */
export declare function luminance(c: Vec3): number;
/**
 * ACES filmic tone map (Narkowicz fit). Monotonic on [0, inf) and maps 0 -> 0,
 * so a black surface stays black and highlights roll off instead of clipping.
 */
export declare function acesFilmic(x: number): number;
export declare function acesFilmic3(c: Vec3): Vec3;
/** Linear -> sRGB transfer (IEC 61966-2-1). */
export declare function linearToSrgb(x: number): number;
export declare function linearToSrgb3(c: Vec3): Vec3;
/** Full display transform: exposure -> ACES -> sRGB. */
export declare function toDisplay(linear: Vec3, exposure?: 1.15): Vec3;
//# sourceMappingURL=color.d.ts.map