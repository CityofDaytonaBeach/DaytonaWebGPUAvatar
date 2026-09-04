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
import { PHOTOREAL_CONSTANTS } from './constants.js';
import { clamp01, vdot, vlerp, vnormalize, vscale } from './color.js';
/**
 * Refract the view ray through the corneal dome and return the parallax offset
 * (in iris-plane units) to apply to the iris coordinate.
 *
 * `irisRadius` is in metres; the offset is normalised by it so the result can be
 * added directly to a unit-radius iris coordinate.
 */
export function irisParallaxOffset(normal, viewDir, ior = 1.376, irisRadius = 0.006, corneaDepth = PHOTOREAL_CONSTANTS.corneaDepth) {
    const n = vnormalize(normal);
    const incident = vscale(vnormalize(viewDir), -1);
    const eta = 1 / Math.max(ior, 1.0001);
    const cosI = Math.max(-1, Math.min(1, vdot(incident, n)));
    const k = 1 - eta * eta * (1 - cosI * cosI);
    // Total internal reflection cannot occur entering a denser medium; guard anyway.
    const refr = k >= 0
        ? vnormalize([
            eta * incident[0] + (eta * cosI - Math.sqrt(k)) * n[0],
            eta * incident[1] + (eta * cosI - Math.sqrt(k)) * n[1],
            eta * incident[2] + (eta * cosI - Math.sqrt(k)) * n[2],
        ])
        : incident;
    // March the refracted ray to the iris plane at `corneaDepth` behind the apex.
    const denom = Math.abs(refr[2]) > 1e-4 ? Math.abs(refr[2]) : 1e-4;
    const t = corneaDepth / denom;
    const scale = 1 / Math.max(irisRadius, 1e-5);
    return { du: refr[0] * t * scale, dv: refr[1] * t * scale };
}
/** Pupil radius (fraction of iris radius) for a scene luminance and dilation bias. */
export function pupilRadius(sceneLuminance, dilation = 0.5) {
    const lum = clamp01(sceneLuminance);
    // Bright light constricts; the response is roughly logarithmic.
    const constricted = 0.18 + 0.12 * (1 - Math.log(1 + 9 * lum) / Math.log(10));
    const dilated = 0.55;
    return clamp01(constricted + (dilated - constricted) * clamp01(dilation));
}
/** Limbal ring darkening factor at a normalised iris radius (0 centre, 1 limbus). */
export function limbalRing(radius) {
    const start = PHOTOREAL_CONSTANTS.limbusStart;
    if (radius <= start)
        return 1;
    const t = clamp01((radius - start) / Math.max(1 - start, 1e-4));
    // Smooth, monotonic darkening to ~25% at the limbus.
    return 1 - 0.75 * (t * t * (3 - 2 * t));
}
/**
 * Shade the iris disc: parallax-shifted coordinate, pupil, radial fibre
 * variation, and limbal darkening.
 */
export function shadeIris(u, v, irisColor, normal, viewDir, sceneLuminance = 0.35, dilation = 0.5) {
    const { du, dv } = irisParallaxOffset(normal, viewDir);
    const su = u + du;
    const sv = v + dv;
    const radius = Math.sqrt(su * su + sv * sv);
    const pupil = pupilRadius(sceneLuminance, dilation);
    if (radius <= pupil) {
        // Pupil: near-black with a faint internal bounce so it is not a dead hole.
        return { radius, color: [0.012, 0.012, 0.014], inPupil: true };
    }
    // Radial fibre / crypt variation, deterministic in the angular coordinate.
    const angle = Math.atan2(sv, su);
    const fibre = 0.85 + 0.15 * Math.abs(Math.sin(angle * 24));
    const ring = limbalRing(radius);
    // Inner iris is slightly brighter (collarette).
    const inner = clamp01(1 - (radius - pupil) / Math.max(1 - pupil, 1e-4));
    const boosted = vlerp(irisColor, vscale(irisColor, 1.35), inner * 0.4);
    return { radius, color: vscale(boosted, fibre * ring), inPupil: false };
}
/**
 * Sclera shading: vascular pink rises toward the corners (high |u|), plus a
 * subtle scatter brightening. `cornerness` is 0 at the centre, 1 at the corners.
 */
export function shadeSclera(baseColor, cornerness, vascularColor) {
    const vasc = vascularColor ?? [0.82, 0.42, 0.4];
    const t = clamp01(cornerness) * PHOTOREAL_CONSTANTS.scleraVascularity;
    return vlerp(baseColor, vasc, t);
}
/**
 * Enamel shading factor. `edgeProximity` is 0 at the tooth root and 1 at the
 * incisal edge (thin, translucent); `archDepth` is 0 at the front teeth and 1
 * at the molars (occluded by the mouth cavity).
 */
export function enamelFactor(edgeProximity, archDepth) {
    const trans = PHOTOREAL_CONSTANTS.enamelTranslucency;
    const edge = clamp01(edgeProximity);
    const depth = clamp01(archDepth);
    // Thin edges lose opacity (read slightly grey/blue), deep teeth lose light.
    const translucent = 1 - trans * edge;
    const occluded = 1 - 0.55 * depth;
    return clamp01(translucent * occluded);
}
/** Enamel colour: warm dentin core, cooler translucent edge, occluded by depth. */
export function shadeEnamel(baseColor, edgeProximity, archDepth) {
    const factor = enamelFactor(edgeProximity, archDepth);
    const cool = [0.72, 0.76, 0.82];
    const tinted = vlerp(baseColor, cool, clamp01(edgeProximity) * 0.35);
    return vscale(tinted, factor);
}
//# sourceMappingURL=eye-shading.js.map