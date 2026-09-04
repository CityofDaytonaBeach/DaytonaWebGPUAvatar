/**
 * Colour / tone-mapping utilities for the photoreal path.
 *
 * All shading math runs in linear space; the final pixel is exposed,
 * tone-mapped (ACES fitted approximation) and encoded to sRGB. Kept separate
 * from the BRDF so tests can prove the transfer curves in isolation.
 */

import { PHOTOREAL_CONSTANTS } from './constants.js';

export type Vec3 = [number, number, number];

export function vadd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vmul(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export function vscale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vlerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function vlength(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function vnormalize(a: Vec3): Vec3 {
  const l = vlength(a);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

export function vdot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Perceptual luminance (Rec. 709) of a linear colour. */
export function luminance(c: Vec3): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * ACES filmic tone map (Narkowicz fit). Monotonic on [0, inf) and maps 0 -> 0,
 * so a black surface stays black and highlights roll off instead of clipping.
 */
export function acesFilmic(x: number): number {
  const a = 2.51,
    b = 0.03,
    c = 2.43,
    d = 0.59,
    e = 0.14;
  return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
}

export function acesFilmic3(c: Vec3): Vec3 {
  return [acesFilmic(c[0]), acesFilmic(c[1]), acesFilmic(c[2])];
}

/** Linear -> sRGB transfer (IEC 61966-2-1). */
export function linearToSrgb(x: number): number {
  const v = clamp01(x);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function linearToSrgb3(c: Vec3): Vec3 {
  return [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])];
}

/** Full display transform: exposure -> ACES -> sRGB. */
export function toDisplay(linear: Vec3, exposure = PHOTOREAL_CONSTANTS.exposure): Vec3 {
  return linearToSrgb3(acesFilmic3(vscale(linear, exposure)));
}
