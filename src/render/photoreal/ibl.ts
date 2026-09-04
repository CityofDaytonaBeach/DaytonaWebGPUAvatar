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

import { Vec3, clamp01, vadd, vdot, vscale } from './color.js';
import { PHOTOREAL_CONSTANTS } from './constants.js';

const PI = Math.PI;

/** Nine RGB spherical-harmonic coefficients (L0..L2). */
export type SH9 = readonly Vec3[];

/** Studio environment description — the analytic probe both sides evaluate. */
export const STUDIO_ENVIRONMENT = {
  /** Zenith sky colour (cool, soft). */
  skyTop: [0.34, 0.42, 0.55] as Vec3,
  /** Horizon colour. */
  skyHorizon: [0.5, 0.51, 0.53] as Vec3,
  /** Warm floor bounce colour. */
  floor: [0.3, 0.24, 0.19] as Vec3,
  /** Soft key panel: direction, colour, angular radius (cosine threshold). */
  keyPanel: {
    direction: [0.4, 0.62, 0.68] as Vec3,
    color: [2.6, 2.42, 2.2] as Vec3,
    /** Panel edge softness: cos(theta) where the panel falls to zero. */
    cosOuter: 0.72,
    cosInner: 0.94,
  },
  /** Cool fill panel opposite the key. */
  fillPanel: {
    direction: [-0.62, 0.18, 0.76] as Vec3,
    color: [0.5, 0.58, 0.72] as Vec3,
    cosOuter: 0.55,
    cosInner: 0.9,
  },
} as const;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Radiance arriving from `dir` (unit, +Y up) in the analytic studio.
 * Mirrored exactly by `studioEnvironment()` in the generated WGSL.
 */
export function studioEnvironment(dir: Vec3): Vec3 {
  const d = normalize(dir);
  const up = clamp01(d[1] * 0.5 + 0.5);
  const E = STUDIO_ENVIRONMENT;
  // Sky gradient above the horizon, floor bounce below it.
  const sky: Vec3 = [
    E.skyHorizon[0] + (E.skyTop[0] - E.skyHorizon[0]) * Math.pow(up, 1.5),
    E.skyHorizon[1] + (E.skyTop[1] - E.skyHorizon[1]) * Math.pow(up, 1.5),
    E.skyHorizon[2] + (E.skyTop[2] - E.skyHorizon[2]) * Math.pow(up, 1.5),
  ];
  const below = smoothstep(0.0, 0.45, -d[1]);
  let out: Vec3 = [
    sky[0] + (E.floor[0] - sky[0]) * below,
    sky[1] + (E.floor[1] - sky[1]) * below,
    sky[2] + (E.floor[2] - sky[2]) * below,
  ];
  // Soft panels.
  for (const panel of [E.keyPanel, E.fillPanel]) {
    const c = vdot(d, normalize([...panel.direction] as Vec3));
    const w = smoothstep(panel.cosOuter, panel.cosInner, c);
    out = vadd(out, vscale([...panel.color] as Vec3, w));
  }
  return out;
}

/** Real SH basis (L0..L2), 9 terms, evaluated for a unit direction. */
export function sh9Basis(dir: Vec3): number[] {
  const [x, y, z] = normalize(dir);
  return [
    0.282095, // Y00
    0.488603 * y, // Y1-1
    0.488603 * z, // Y10
    0.488603 * x, // Y11
    1.092548 * x * y, // Y2-2
    1.092548 * y * z, // Y2-1
    0.315392 * (3 * z * z - 1), // Y20
    1.092548 * x * z, // Y21
    0.546274 * (x * x - y * y), // Y22
  ];
}

/** Deterministic Fibonacci-sphere direction i of n (uniform on the sphere). */
export function fibonacciSphere(i: number, n: number): Vec3 {
  const golden = PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(1 - y * y, 0));
  const theta = golden * i;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

/**
 * Project a radiance function onto 9 RGB SH coefficients using a deterministic
 * uniform sphere quadrature (solid angle 4π/n per sample).
 */
export function projectEnvironmentToSH(
  radiance: (dir: Vec3) => Vec3 = studioEnvironment,
  sampleCount = PHOTOREAL_CONSTANTS.iblProjectionSamples,
): Vec3[] {
  const sh: Vec3[] = Array.from({ length: 9 }, () => [0, 0, 0] as Vec3);
  const dOmega = (4 * PI) / sampleCount;
  for (let i = 0; i < sampleCount; i++) {
    const dir = fibonacciSphere(i, sampleCount);
    const L = radiance(dir);
    const basis = sh9Basis(dir);
    for (let k = 0; k < 9; k++) {
      const w = basis[k] * dOmega;
      sh[k] = [sh[k][0] + L[0] * w, sh[k][1] + L[1] * w, sh[k][2] + L[2] * w];
    }
  }
  return sh;
}

/**
 * Cosine-convolved irradiance from SH coefficients (Ramamoorthi & Hanrahan
 * "An Efficient Representation for Irradiance Environment Maps"), divided by π
 * so the result is a diffuse *reflectance multiplier* for a white albedo.
 */
export function shIrradiance(sh: SH9, normal: Vec3): Vec3 {
  const [x, y, z] = normalize(normal);
  // Convolution coefficients Â_l for a clamped cosine kernel.
  const a0 = 3.141593;
  const a1 = 2.094395;
  const a2 = 0.785398;
  const basis = [
    0.282095 * a0,
    0.488603 * y * a1,
    0.488603 * z * a1,
    0.488603 * x * a1,
    1.092548 * x * y * a2,
    1.092548 * y * z * a2,
    0.315392 * (3 * z * z - 1) * a2,
    1.092548 * x * z * a2,
    0.546274 * (x * x - y * y) * a2,
  ];
  let out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 9; k++) {
    out = [
      out[0] + sh[k][0] * basis[k],
      out[1] + sh[k][1] * basis[k],
      out[2] + sh[k][2] * basis[k],
    ];
  }
  const inv = 1 / PI;
  return [Math.max(out[0] * inv, 0), Math.max(out[1] * inv, 0), Math.max(out[2] * inv, 0)];
}

/** The baked studio probe: 9 RGB SH coefficients, computed once, deterministic. */
export const STUDIO_IRRADIANCE_SH: Vec3[] = projectEnvironmentToSH();

/**
 * Karis' analytic split-sum environment BRDF (the "mobile" approximation of the
 * prefiltered DFG lookup table). Returns the scale/bias applied to F0.
 */
export function environmentBRDF(ndv: number, roughness: number): { scale: number; bias: number } {
  const r = clamp01(roughness);
  const nv = Math.max(ndv, 1e-4);
  const c0 = [-1, -0.0275, -0.572, 0.022];
  const c1 = [1, 0.0425, 1.04, -0.04];
  const rx = r * c0[0] + c1[0];
  const ry = r * c0[1] + c1[1];
  const rz = r * c0[2] + c1[2];
  const rw = r * c0[3] + c1[3];
  const a004 = Math.min(rx * rx, Math.pow(2, -9.28 * nv)) * rx + ry;
  // The analytic fit dips a fraction below zero at grazing angles; the split-sum
  // terms are both non-negative by construction, so clamp rather than ship a
  // negative specular contribution.
  return { scale: Math.max(a004 * -1.04 + rz, 0), bias: Math.max(a004 * 1.04 + rw, 0) };
}

/**
 * Analytic prefiltered specular probe: a mirror sample of the environment
 * blurred toward the SH irradiance as roughness rises. This is the split-sum
 * "L" term without a mip pyramid — exact at roughness 0, and it converges to the
 * correct low-frequency average at roughness 1.
 */
export function prefilteredEnvironment(
  reflectDir: Vec3,
  roughness: number,
  sh: SH9 = STUDIO_IRRADIANCE_SH,
): Vec3 {
  const r = clamp01(roughness);
  const sharp = studioEnvironment(reflectDir);
  const blurred = shIrradiance(sh, reflectDir);
  const t = Math.sqrt(r);
  return [
    sharp[0] + (blurred[0] - sharp[0]) * t,
    sharp[1] + (blurred[1] - sharp[1]) * t,
    sharp[2] + (blurred[2] - sharp[2]) * t,
  ];
}

/** Reflect `v` about `n` (both unit): the mirror direction for a view vector. */
export function reflectDirection(viewDir: Vec3, normal: Vec3): Vec3 {
  const n = normalize(normal);
  const v = normalize(viewDir);
  const d = 2 * vdot(v, n);
  return normalize([n[0] * d - v[0], n[1] * d - v[1], n[2] * d - v[2]]);
}

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
export function iblAmbient(surface: IblSurface, sh: SH9 = STUDIO_IRRADIANCE_SH): Vec3 {
  const C = PHOTOREAL_CONSTANTS;
  const ao = clamp01(surface.occlusion);
  const irradiance = shIrradiance(sh, surface.normal);
  const diffuse: Vec3 = [
    surface.albedo[0] * irradiance[0] * ao * C.iblDiffuseScale,
    surface.albedo[1] * irradiance[1] * ao * C.iblDiffuseScale,
    surface.albedo[2] * irradiance[2] * ao * C.iblDiffuseScale,
  ];
  const ndv = Math.max(vdot(normalize(surface.normal), normalize(surface.viewDir)), 1e-4);
  const { scale, bias } = environmentBRDF(ndv, surface.roughness);
  const prefiltered = prefilteredEnvironment(
    reflectDirection(surface.viewDir, surface.normal),
    surface.roughness,
    sh,
  );
  const so = clamp01(surface.specularOcclusion ?? surface.occlusion);
  const specWeight = (surface.f0 * scale + bias) * so * C.iblSpecularScale;
  return [
    diffuse[0] + prefiltered[0] * specWeight,
    diffuse[1] + prefiltered[1] * specWeight,
    diffuse[2] + prefiltered[2] * specWeight,
  ];
}
