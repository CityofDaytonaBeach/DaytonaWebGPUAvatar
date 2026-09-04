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
import type { Vec3 } from './color.js';
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
export declare const SSS_FALLOFF: Vec3;
/** Sum of two Gaussians — the classic 2-lobe fit to the dipole diffusion profile. */
export declare function diffusionProfile(x: number, falloff: number): number;
/**
 * Build a symmetric separable kernel with `taps` samples (odd). Weights are
 * normalized per channel so the pass preserves total energy exactly.
 */
export declare function sssKernel(taps?: number): SssTap[];
/**
 * Screen-space step (in UV) that covers `sssBlurWidth` metres at `depth`
 * metres, for a projection with the given half-FOV tangent and viewport size.
 */
export declare function sssStepUV(depth: number, tanHalfFov: number, viewportPixels: number, width?: number): number;
/** Depth-difference rejection weight: 1 on-surface, →0 across a silhouette. */
export declare function depthRejection(centerDepth: number, sampleDepth: number): number;
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
export declare function sssBlurPass(center: SssSample, taps: readonly SssSample[], kernel: SssTap[]): Vec3;
/** Options for the generated separable SSS pass. */
export interface SssBlurWgslOptions {
    /**
     * Apply the photoreal display transform (exposure + ACES + sRGB) on output.
     * The blur runs in linear light, so exactly one pass — the last one, writing
     * the swap-chain — sets this.
     */
    tonemap?: boolean;
}
/** Generated separable SSS post-pass (run twice: horizontal, then vertical). */
export declare function sssBlurWgsl(opts?: SssBlurWgslOptions): string;
/** Horizontal/vertical blur pass in linear light (intermediate target). */
export declare const SSS_BLUR_WGSL: string;
/** Final pass: same blur, plus the display transform for the swap chain. */
export declare const SSS_COMPOSITE_WGSL: string;
/**
 * Pack the `SssParams` uniform: direction (vec2), tanHalfFov, viewportPixels.
 * 16 bytes, matching the WGSL struct layout.
 */
export declare function sssParamsData(direction: readonly [number, number], tanHalfFov: number, viewportPixels: number): Float32Array;
//# sourceMappingURL=sss-blur.d.ts.map