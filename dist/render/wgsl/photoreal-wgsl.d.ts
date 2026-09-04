/**
 * Photoreal human WGSL — GENERATED from the shared photoreal constants and the
 * light rig in `../photoreal/constants.ts`, so the shader can never drift from
 * the CPU reference model in `../photoreal/*`.
 *
 * Drop-in replacement for `HUMAN_RENDER_WGSL`: identical bind group layout
 * (params / camera / part) and identical vertex attribute layout (position,
 * normal, uv, tangentPerturb), so the renderer swaps the module without any
 * pipeline change.
 *
 * Material inputs per part (`PartParams`):
 *   baseColor.rgb   linear albedo, baseColor.a alpha
 *   material        [roughness, specular, sssIntensity, ior]
 *   sssColor.rgb    deep-tissue scatter colour
 *   flags           PHOTOREAL_FLAGS bit field (skin / iris / sclera / enamel /
 *                   refractive / normalPerturb)
 *
 * Ambient light comes from the spherical-harmonic studio probe baked in
 * `../photoreal/ibl.ts` (9 RGB coefficients interpolated below), not a constant.
 * Curvature and tissue thickness arrive per-vertex at location 4 from the bake
 * in `../photoreal/curvature-bake.ts`; a zeroed attribute falls back to the old
 * head-wide defaults, so the buffer is optional.
 */
/** The full generated photoreal WGSL program (vertex + fragment in one module). */
export declare const PHOTOREAL_HUMAN_WGSL: string;
/** Shading model selector for the renderer/pipeline. */
export type ShadingModel = 'basic' | 'photoreal';
/**
 * Display transform (exposure + ACES + sRGB), extracted so a post-process
 * program can encode the final image identically to the forward shader. The
 * forward program defines these itself; do NOT concatenate both into one module.
 */
export declare const PHOTOREAL_DISPLAY_WGSL: string;
/**
 * G-buffer variant of the photoreal program, for the screen-space SSS graph.
 *
 * Identical shading, three color targets instead of one:
 *   location 0  linear radiance (NOT display-encoded — the blur runs in linear
 *               light and the composite pass applies the display transform)
 *   location 1  view depth in metres, reconstructed from the interpolated
 *               clip w (fragment `position.w` is 1/w_clip, and this projection
 *               puts view distance in w_clip)
 *   location 2  skin mask, so the blur cannot bleed into eyes, teeth or cavity
 */
export declare function photorealGBufferWgsl(base?: string): string;
/** Generated once so the renderer/pipeline can share a single module string. */
export declare const PHOTOREAL_GBUFFER_WGSL: string;
//# sourceMappingURL=photoreal-wgsl.d.ts.map