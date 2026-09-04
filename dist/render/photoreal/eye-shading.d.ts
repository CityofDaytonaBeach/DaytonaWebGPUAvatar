/**
 * Photoreal eye and enamel shading — CPU reference implementation.
 *
 * The eye is the single strongest photoreal cue on a head, and it is the one
 * place where naive shading fails obviously: a flat iris disc looks painted on.
 * This module supplies the three effects that fix that, plus tooth enamel:
 *
 *  - IRIS PARALLAX: the iris sits behind a refracting corneal dome, so it
 *    shifts against the pupil as the head turns. Refracting the view ray
 *    through the dome and offsetting the iris lookup gives real eye depth.
 *  - LIMBAL RING: the darkened cornea/sclera transition ring.
 *  - PUPIL DILATION driven by scene luminance.
 *  - SCLERA: vascular tint that rises toward the corners, plus a wet specular.
 *  - ENAMEL: translucent dielectric that brightens toward a tooth's edge and
 *    darkens toward the back of the arch.
 *
 * All functions are pure and mirrored in the generated WGSL.
 */
import { Vec3 } from './color.js';
/**
 * Refract the view ray through the corneal dome and return the parallax offset
 * (in iris-plane units) to apply to the iris coordinate.
 *
 * `irisRadius` is in metres; the offset is normalised by it so the result can be
 * added directly to a unit-radius iris coordinate.
 */
export declare function irisParallaxOffset(normal: Vec3, viewDir: Vec3, ior?: number, irisRadius?: number, corneaDepth?: 0.032): {
    du: number;
    dv: number;
};
/** Pupil radius (fraction of iris radius) for a scene luminance and dilation bias. */
export declare function pupilRadius(sceneLuminance: number, dilation?: number): number;
/** Limbal ring darkening factor at a normalised iris radius (0 centre, 1 limbus). */
export declare function limbalRing(radius: number): number;
export interface IrisSample {
    /** Parallax-corrected iris coordinate radius, 0..1+. */
    radius: number;
    /** Final iris colour (linear). */
    color: Vec3;
    /** True when the sample falls inside the pupil. */
    inPupil: boolean;
}
/**
 * Shade the iris disc: parallax-shifted coordinate, pupil, radial fibre
 * variation, and limbal darkening.
 */
export declare function shadeIris(u: number, v: number, irisColor: Vec3, normal: Vec3, viewDir: Vec3, sceneLuminance?: number, dilation?: number): IrisSample;
/**
 * Sclera shading: vascular pink rises toward the corners (high |u|), plus a
 * subtle scatter brightening. `cornerness` is 0 at the centre, 1 at the corners.
 */
export declare function shadeSclera(baseColor: Vec3, cornerness: number, vascularColor?: Vec3): Vec3;
/**
 * Enamel shading factor. `edgeProximity` is 0 at the tooth root and 1 at the
 * incisal edge (thin, translucent); `archDepth` is 0 at the front teeth and 1
 * at the molars (occluded by the mouth cavity).
 */
export declare function enamelFactor(edgeProximity: number, archDepth: number): number;
/** Enamel colour: warm dentin core, cooler translucent edge, occluded by depth. */
export declare function shadeEnamel(baseColor: Vec3, edgeProximity: number, archDepth: number): Vec3;
//# sourceMappingURL=eye-shading.d.ts.map