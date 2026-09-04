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

import { PHOTOREAL_CONSTANTS } from './constants.js';
import { Vec3, clamp01, vnormalize } from './color.js';

/** Deterministic 2D -> 1D hash in [0,1). Mirrored exactly in WGSL. */
export function hash21(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise on the hash lattice. */
export function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

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
export function microDetail(input: MicroDetailInput): MicroDetail {
  const { poreFrequency, microFrequency, microSlopeMax } = PHOTOREAL_CONSTANTS;
  const scale = Math.max(input.poreScale, 0.05);
  const age = clamp01(input.age);
  const oiliness = clamp01(input.oiliness);

  const fPore = poreFrequency * scale;
  const fMicro = microFrequency * scale;
  const eps = 1e-3;

  const height = (u: number, v: number): number =>
    valueNoise2D(u * fPore, v * fPore) * (0.65 + 0.35 * age) +
    valueNoise2D(u * fMicro, v * fMicro) * 0.25;

  const h0 = height(input.u, input.v);
  const hx = height(input.u + eps, input.v);
  const hy = height(input.u, input.v + eps);

  // Sebum smooths the surface; age deepens it.
  const amplitude = microSlopeMax * (1 - 0.6 * oiliness) * (0.7 + 0.5 * age);
  const gx = (hx - h0) / eps;
  const gy = (hy - h0) / eps;
  const norm = 1 / (1 + Math.abs(gx) + Math.abs(gy));

  const slopeX = clampSigned(-gx * norm * amplitude, microSlopeMax);
  const slopeY = clampSigned(-gy * norm * amplitude, microSlopeMax);

  // Height below the mean reads as a pore/crease: occlude it.
  const depth = clamp01(0.55 - h0) * (0.6 + 0.8 * age);
  const cavity = clamp01(1 - depth);
  const specularOcclusion = clamp01(1 - depth * 0.8);

  return { slopeX, slopeY, cavity, specularOcclusion };
}

function clampSigned(x: number, limit: number): number {
  return x > limit ? limit : x < -limit ? -limit : x;
}

/**
 * Apply a tangent-space slope to a geometric normal using a derived tangent
 * frame. Matches `reconstructNormal` in the shader.
 */
export function perturbNormal(normal: Vec3, slopeX: number, slopeY: number): Vec3 {
  const n = vnormalize(normal);
  const up: Vec3 = Math.abs(n[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  const t = vnormalize([
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ]);
  const b: Vec3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  const z = Math.sqrt(Math.max(1 - slopeX * slopeX - slopeY * slopeY, 0));
  return vnormalize([
    t[0] * slopeX + b[0] * slopeY + n[0] * z,
    t[1] * slopeX + b[1] * slopeY + n[1] * z,
    t[2] * slopeX + b[2] * slopeY + n[2] * z,
  ]);
}
