/**
 * Screen-space separable subsurface scattering — CPU reference + WGSL passes.
 *
 * The photoreal skin path already does pre-integrated SSS (curvature-driven
 * diffusion at the terminator), which needs no extra render target. Screen-space
 * SSS is the complementary half: it diffuses light ACROSS the surface, which is
 * what softens pore-scale shading and gives the red bleed under nostrils, lids
 * and ear rims that a per-pixel model cannot express.
 *
 * Implementation follows Jimenez' separable SSS:
 *   - one horizontal then one vertical pass over the lit skin buffer,
 *   - a per-channel Gaussian-sum kernel (red diffuses furthest),
 *   - step size scaled by 1/depth so the kernel covers a constant WORLD width,
 *   - depth-difference rejection so the blur cannot bleed across a silhouette.
 *
 * The kernel is generated here, asserted by tests, and interpolated into the
 * generated WGSL — the same single-source-of-truth rule as the rest of the
 * photoreal layer.
 */

import { PHOTOREAL_CONSTANTS } from './constants.js';
import type { Vec3 } from './color.js';

const C = PHOTOREAL_CONSTANTS;

/** One kernel tap: rgb weight and signed offset in kernel-width units. */
export interface SssTap {
  weight: Vec3;
  offset: number;
}

/**
 * Per-channel diffusion falloff, in kernel-width units. Red light transports
 * furthest through dermis, blue barely at all — this ratio is what makes the
 * bleed read as flesh instead of a grey blur.
 */
export const SSS_FALLOFF: Vec3 = [1, 0.37, 0.19];

/** Sum of two Gaussians — the classic 2-lobe fit to the dipole diffusion profile. */
export function diffusionProfile(x: number, falloff: number): number {
  const f = Math.max(falloff, 1e-4);
  const g = (v: number, variance: number): number =>
    Math.exp(-(v * v) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
  return 0.35 * g(x / f, 0.055) + 0.65 * g(x / f, 0.32);
}

/**
 * Build a symmetric separable kernel with `taps` samples (odd). Weights are
 * normalized per channel so the pass preserves total energy exactly.
 */
export function sssKernel(taps: number = C.sssBlurTaps): SssTap[] {
  const n = taps % 2 === 0 ? taps + 1 : taps;
  const half = (n - 1) / 2;
  const out: SssTap[] = [];
  const totals: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    // Non-linear tap placement: density concentrated near the centre where the
    // profile changes fastest (Jimenez' squared distribution).
    const t = (i - half) / half;
    const offset = Math.sign(t) * t * t;
    const weight: Vec3 = [
      diffusionProfile(offset, SSS_FALLOFF[0]),
      diffusionProfile(offset, SSS_FALLOFF[1]),
      diffusionProfile(offset, SSS_FALLOFF[2]),
    ];
    totals[0] += weight[0];
    totals[1] += weight[1];
    totals[2] += weight[2];
    out.push({ weight, offset });
  }
  for (const tap of out) {
    tap.weight = [tap.weight[0] / totals[0], tap.weight[1] / totals[1], tap.weight[2] / totals[2]];
  }
  return out;
}

/**
 * Screen-space step (in UV) that covers `sssBlurWidth` metres at `depth`
 * metres, for a projection with the given half-FOV tangent and viewport size.
 */
export function sssStepUV(
  depth: number,
  tanHalfFov: number,
  viewportPixels: number,
  width: number = C.sssBlurWidth,
): number {
  const d = Math.max(depth, 1e-3);
  // World width -> normalized device width -> UV, independent of pixel size.
  const ndcWidth = width / (2 * d * Math.max(tanHalfFov, 1e-4));
  return Math.max(ndcWidth, 1 / Math.max(viewportPixels, 1));
}

/** Depth-difference rejection weight: 1 on-surface, →0 across a silhouette. */
export function depthRejection(centerDepth: number, sampleDepth: number): number {
  const delta = Math.abs(sampleDepth - centerDepth);
  return Math.exp(-delta * C.sssDepthFalloff);
}

export interface SssSample {
  /** Linear radiance at the tap. */
  color: Vec3;
  /** View depth at the tap, metres. */
  depth: number;
  /** Skin mask, 0..1 — non-skin taps must not bleed into skin. */
  mask: number;
}

/**
 * One separable pass over a tap list. Rejected taps fall back to the centre
 * sample, so energy is conserved and edges do not darken.
 */
export function sssBlurPass(center: SssSample, taps: readonly SssSample[], kernel: SssTap[]): Vec3 {
  let out: Vec3 = [0, 0, 0];
  for (let i = 0; i < kernel.length; i++) {
    const k = kernel[i];
    const sample = taps[i] ?? center;
    const w = depthRejection(center.depth, sample.depth) * Math.max(0, Math.min(1, sample.mask));
    const src: Vec3 = [
      center.color[0] + (sample.color[0] - center.color[0]) * w,
      center.color[1] + (sample.color[1] - center.color[1]) * w,
      center.color[2] + (sample.color[2] - center.color[2]) * w,
    ];
    out = [
      out[0] + src[0] * k.weight[0],
      out[1] + src[1] * k.weight[1],
      out[2] + src[2] * k.weight[2],
    ];
  }
  return out;
}

const f = (x: number): string => {
  const s = String(x);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

/** Generated separable SSS post-pass (run twice: horizontal, then vertical). */
export const SSS_BLUR_WGSL = ((): string => {
  const kernel = sssKernel();
  const taps = kernel
    .map((t) => `  vec4f(${f(t.weight[0])}, ${f(t.weight[1])}, ${f(t.weight[2])}, ${f(t.offset)}),`)
    .join('\n');
  return `
// GENERATED from photoreal/sss-blur.ts — separable screen-space SSS.
// Pass 1: direction = vec2f(1, 0). Pass 2: direction = vec2f(0, 1).

const SSS_BLUR_WIDTH   : f32 = ${f(C.sssBlurWidth)};
const SSS_DEPTH_FALLOFF: f32 = ${f(C.sssDepthFalloff)};
const SSS_TAPS         : u32 = ${kernel.length}u;

// xyz = per-channel weight, w = offset in kernel-width units.
const SSS_KERNEL = array<vec4f, ${kernel.length}>(
${taps}
);

struct SssParams {
  /** Blur direction in UV space: (1,0) then (0,1). */
  direction : vec2f,
  /** tan(halfFov) of the active projection. */
  tanHalfFov : f32,
  /** Longest viewport edge in pixels (clamps the step to one pixel). */
  viewportPixels : f32,
};

@group(0) @binding(0) var<uniform> sss : SssParams;
@group(0) @binding(1) var litTex   : texture_2d<f32>;
@group(0) @binding(2) var depthTex : texture_2d<f32>;
@group(0) @binding(3) var maskTex  : texture_2d<f32>;
@group(0) @binding(4) var texSampler : sampler;

fn sssStepUV(depth : f32, tanHalfFov : f32, viewportPixels : f32) -> f32 {
  let d = max(depth, 1e-3);
  let ndcWidth = SSS_BLUR_WIDTH / (2.0 * d * max(tanHalfFov, 1e-4));
  return max(ndcWidth, 1.0 / max(viewportPixels, 1.0));
}

fn depthRejection(centerDepth : f32, sampleDepth : f32) -> f32 {
  return exp(-abs(sampleDepth - centerDepth) * SSS_DEPTH_FALLOFF);
}

struct FsIn {
  @builtin(position) clip_position : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> FsIn {
  // Fullscreen triangle.
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : FsIn;
  let p = pos[vi];
  out.clip_position = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  return out;
}

@fragment
fn fs_main(in : FsIn) -> @location(0) vec4f {
  let center = textureSample(litTex, texSampler, in.uv);
  let centerDepth = textureSample(depthTex, texSampler, in.uv).r;
  let skin = textureSample(maskTex, texSampler, in.uv).r;
  if (skin <= 0.0) { return center; }

  let step = sssStepUV(centerDepth, sss.tanHalfFov, sss.viewportPixels) * sss.direction;
  var accum = vec3f(0.0);
  for (var i : u32 = 0u; i < SSS_TAPS; i = i + 1u) {
    let k = SSS_KERNEL[i];
    let uv = in.uv + step * k.w;
    let sampleColor = textureSample(litTex, texSampler, uv).rgb;
    let sampleDepth = textureSample(depthTex, texSampler, uv).r;
    let sampleMask = textureSample(maskTex, texSampler, uv).r;
    let w = depthRejection(centerDepth, sampleDepth) * clamp(sampleMask, 0.0, 1.0);
    let src = mix(center.rgb, sampleColor, w);
    accum = accum + src * k.xyz;
  }
  // Blend by the skin mask so non-skin pixels pass through untouched.
  return vec4f(mix(center.rgb, accum, skin), center.a);
}
`;
})();
