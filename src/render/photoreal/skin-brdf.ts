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

import { PHOTOREAL_CONSTANTS, PHOTOREAL_LIGHT_RIG } from './constants.js';
import { Vec3, clamp01, toDisplay, vadd, vdot, vlerp, vmul, vnormalize, vscale } from './color.js';

const PI = Math.PI;

/** Schlick Fresnel with an F0 colour. */
export function fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
  const f = Math.pow(1 - clamp01(cosTheta), 5);
  return [f0[0] + (1 - f0[0]) * f, f0[1] + (1 - f0[1]) * f, f0[2] + (1 - f0[2]) * f];
}

/** Trowbridge-Reitz (GGX) normal distribution. */
export function distributionGGX(ndh: number, roughness: number): number {
  const a = Math.max(roughness * roughness, PHOTOREAL_CONSTANTS.minRoughness ** 2);
  const a2 = a * a;
  const d = ndh * ndh * (a2 - 1) + 1;
  return a2 / (PI * d * d + 1e-9);
}

/**
 * Height-correlated Smith visibility (Heitz), already divided by the
 * 4·NdotL·NdotV denominator of the microfacet BRDF.
 */
export function visibilitySmithCorrelated(ndv: number, ndl: number, roughness: number): number {
  const a = Math.max(roughness * roughness, PHOTOREAL_CONSTANTS.minRoughness ** 2);
  const a2 = a * a;
  const lv = ndl * Math.sqrt(ndv * ndv * (1 - a2) + a2);
  const ll = ndv * Math.sqrt(ndl * ndl * (1 - a2) + a2);
  return 0.5 / Math.max(lv + ll, 1e-6);
}

/**
 * Dual-lobe specular magnitude (scalar, pre-Fresnel). Skin has a sharp
 * oil/sebum lobe over a broader subsurface-scattered lobe; a single GGX lobe is
 * the classic reason CG skin reads as plastic.
 */
export function dualLobeSpecular(ndh: number, ndv: number, ndl: number, roughness: number): number {
  const r0 = Math.max(roughness, PHOTOREAL_CONSTANTS.minRoughness);
  const r1 = Math.min(r0 * PHOTOREAL_CONSTANTS.lobeRoughnessScale, 1);
  const mix = PHOTOREAL_CONSTANTS.specLobeMix;
  const sharp = distributionGGX(ndh, r0) * visibilitySmithCorrelated(ndv, ndl, r0);
  const broad = distributionGGX(ndh, r1) * visibilitySmithCorrelated(ndv, ndl, r1);
  return (1 - mix) * sharp + mix * broad;
}

/**
 * Pre-integrated subsurface diffusion.
 *
 * `curvature` is 1/radius in metres (higher = tighter feature = narrower
 * scatter), `scatterColor` is the deep-tissue transport colour. Returns the
 * per-channel diffuse response for one light, replacing plain Lambert.
 */
export function preIntegratedScatter(
  ndl: number,
  curvature: number,
  scatterColor: Vec3,
  intensity: number,
): Vec3 {
  const wrap = PHOTOREAL_CONSTANTS.sssWrap;
  // Wrapped diffuse: light bleeds past the geometric terminator.
  const wrapped = clamp01((ndl + wrap) / (1 + wrap));
  const lambert = clamp01(ndl);
  // Scatter width shrinks as curvature rises (a nose tip scatters less than a cheek).
  const width = clamp01(PHOTOREAL_CONSTANTS.curvatureScale / (1 + Math.max(curvature, 0)));
  const blend = clamp01(intensity) * width;
  // Per-channel: red transports furthest, so it dominates the terminator.
  const red = wrapped;
  const green = lambert + (wrapped - lambert) * 0.55;
  const blue = lambert + (wrapped - lambert) * 0.25;
  const scattered: Vec3 = [red * scatterColor[0], green * scatterColor[1], blue * scatterColor[2]];
  return vlerp([lambert, lambert, lambert], scattered, blend);
}

/**
 * Translucent back-lighting for thin tissue. `thickness` is in metres;
 * thinner tissue transmits more. Uses a light vector distorted along the
 * normal, matching the standard fast-SSS transmission term.
 */
export function transmission(
  normal: Vec3,
  lightDir: Vec3,
  viewDir: Vec3,
  thickness: number,
  scatterColor: Vec3,
): Vec3 {
  const d = PHOTOREAL_CONSTANTS.sssDistortion;
  const back = vnormalize([
    -lightDir[0] - normal[0] * d,
    -lightDir[1] - normal[1] * d,
    -lightDir[2] - normal[2] * d,
  ]);
  const vdb = Math.pow(clamp01(vdot(viewDir, back)), 4);
  const attenuation = Math.exp(-Math.max(thickness, 0) * 220);
  return vscale(scatterColor, vdb * attenuation * PHOTOREAL_CONSTANTS.transmissionStrength);
}

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
export function shadeSkinLight(surface: SkinSurface, light: LightSample): Vec3 {
  const n = surface.normal;
  const v = surface.viewDir;
  const l = vnormalize(light.direction);
  const h = vnormalize(vadd(l, v));

  const ndl = vdot(n, l);
  const ndv = Math.max(vdot(n, v), 1e-4);
  const ndh = clamp01(vdot(n, h));
  const vdh = clamp01(vdot(v, h));

  const f0: Vec3 = [
    0.028 + 0.06 * surface.specular,
    0.028 + 0.06 * surface.specular,
    0.028 + 0.06 * surface.specular,
  ];
  const F = fresnelSchlick(vdh, f0);

  const specMag = ndl > 0 ? dualLobeSpecular(ndh, ndv, Math.max(ndl, 1e-4), surface.roughness) : 0;
  const spec: Vec3 = vscale(F, specMag * Math.max(ndl, 0));

  const diffuseResponse = preIntegratedScatter(
    ndl,
    surface.curvature,
    surface.scatterColor,
    surface.scatterIntensity,
  );
  // Energy conservation: whatever reflects specularly cannot also diffuse.
  const kD: Vec3 = [1 - F[0], 1 - F[1], 1 - F[2]];
  const diffuse = vmul(vmul(surface.albedo, diffuseResponse), kD);

  const trans = transmission(n, l, v, surface.thickness, surface.scatterColor);

  const radiance = vscale(light.color, light.intensity);
  return vmul(vadd(vadd(diffuse, spec), trans), radiance);
}

/** Full three-point rig + ambient, returning LINEAR radiance (no tone map). */
export function shadeSkinLinear(surface: SkinSurface, rig = PHOTOREAL_LIGHT_RIG): Vec3 {
  let total: Vec3 = [0, 0, 0];
  for (const light of [rig.key, rig.fill, rig.rim]) {
    total = vadd(
      total,
      shadeSkinLight(surface, {
        direction: [...light.direction] as Vec3,
        color: [...light.color] as Vec3,
        intensity: light.intensity,
      }),
    );
  }
  const ambient = vscale(surface.albedo, PHOTOREAL_CONSTANTS.ambient * clamp01(surface.occlusion));
  return vadd(total, ambient);
}

/** Final display-referred sRGB colour for a skin surface. */
export function shadeSkin(surface: SkinSurface, rig = PHOTOREAL_LIGHT_RIG): Vec3 {
  return toDisplay(shadeSkinLinear(surface, rig));
}
