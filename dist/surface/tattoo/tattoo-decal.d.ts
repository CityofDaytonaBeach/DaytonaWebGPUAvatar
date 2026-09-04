import { HumanAttachment } from '../../attachments/attachment-system.js';
import { Vec3 } from '../../core/math/vec.js';
import { CanonicalHuman, MorphDelta, RegionName } from '../../geometry/canonical/canonical-human.js';
export interface TattooDecalSample {
    vertexId: number;
    region: RegionName;
    uv: {
        u: number;
        v: number;
    };
    opacity: number;
    color: [number, number, number];
}
export interface TattooDecal {
    id: string;
    region: RegionName;
    center: Vec3;
    radius: number;
    samples: TattooDecalSample[];
}
export interface TattooDecalOptions {
    defaultRadius?: number;
    defaultColor?: [number, number, number];
}
export type TattooBlendMode = 'normal' | 'multiply' | 'overlay' | 'screen';
export type TattooFalloffCurve = 'linear' | 'smooth' | 'smooth2' | 'sharp' | 'round';
export interface TattooDecalSampleExtended extends TattooDecalSample {
    /** Radial distance from decal center normalised to [0, 1]. */
    radialT: number;
}
export interface TattooDecalExtended extends TattooDecal {
    samples: TattooDecalSampleExtended[];
    blendMode: TattooBlendMode;
    opacity: number;
    /** Per-vertex normal displacement strength in metres (negative = indent). */
    normalStrength: number;
}
export interface TattooOpacityMap {
    /** Scalar [0-1] applied on top of radial falloff, indexed by sample position. */
    (u: number, v: number, radialT: number): number;
}
export interface TattooBakedVertexColors {
    /** Flat RGB triplet per vertex, length = vertexCount * 3. */
    colors: Float32Array;
    /** Binary mask: 1 if vertex was touched by a decal, 0 otherwise. */
    mask: Uint8Array;
    vertexCount: number;
}
export interface TattooBakedNormalOverlay {
    /** Flat XYZ per vertex, length = vertexCount * 3. */
    normals: Float32Array;
    /** Strength per vertex, length = vertexCount. */
    strengths: Float32Array;
    vertexCount: number;
}
export interface TattooGPUExport {
    vertexColors: Float32Array;
    normalOverlay: Float32Array;
    normalStrengths: Float32Array;
    vertexCount: number;
}
/** Project a tattoo attachment to stable region vertices as a decal sample set. */
export declare function projectTattooDecal(attachment: HumanAttachment, canonical: CanonicalHuman, options?: TattooDecalOptions): TattooDecal | null;
export declare function projectTattooDecals(attachments: HumanAttachment[], canonical: CanonicalHuman, options?: TattooDecalOptions): TattooDecal[];
/**
 * Place a decal in UV space rather than 3D position. Returns decal samples for
 * vertices whose UV coordinates fall inside the rectangular UV footprint.
 */
export declare function projectUVDecal(attachment: HumanAttachment, canonical: CanonicalHuman, options?: TattooDecalOptions): TattooDecal | null;
/**
 * Apply a custom opacity map over existing decal samples. The map receives
 * the sample's UV coordinates and radial distance and returns a scalar [0-1]
 * that replaces the original opacity.
 */
export declare function applyOpacityMap(decal: TattooDecal, map: TattooOpacityMap): TattooDecal;
/**
 * Create a decal with extended sample data including radial distance, using a
 * configurable falloff curve.
 */
export declare function projectTattooDecalExtended(attachment: HumanAttachment, canonical: CanonicalHuman, options?: TattooDecalOptions & {
    falloff?: TattooFalloffCurve;
    blendMode?: TattooBlendMode;
    decalOpacity?: number;
    normalStrength?: number;
}): TattooDecalExtended | null;
/**
 * Generate a per-vertex normal overlay from decal samples. Positive
 * normalStrength pushes vertices outward; negative indents them.
 */
export declare function generateDecalNormalOverlay(decal: TattooDecalExtended, canonical: CanonicalHuman): TattooBakedNormalOverlay;
/**
 * Accumulate normal overlays from multiple decals.
 */
export declare function accumulateNormalOverlays(decals: TattooDecalExtended[], canonical: CanonicalHuman): TattooBakedNormalOverlay;
/**
 * Bake a single decal onto a pre-existing vertex color buffer.
 * Colors are blended per-channel using the decal's blend mode.
 * Returns the mutated buffer (no copy).
 */
export declare function bakeDecalVertexColors(colors: Float32Array, mask: Uint8Array | null, decal: TattooDecalExtended, vertexCount: number): {
    colors: Float32Array;
    mask: Uint8Array;
};
/**
 * Bake a single decal onto a fresh buffer (allocate + bake).
 */
export declare function bakeDecalToNewBuffer(decal: TattooDecalExtended, vertexCount: number): TattooBakedVertexColors;
/**
 * Blend multiple decals onto a single vertex color buffer, processing decals
 * in order (first = lowest layer, last = highest layer). Overlapping areas
 * accumulate through each decal's blend mode and opacity.
 */
export declare function blendMultipleDecals(decals: TattooDecalExtended[], vertexCount: number): TattooBakedVertexColors;
/**
 * Re-project decal samples after morph deltas are applied. For each sample,
 * updates the UV coordinates based on the deformed position so the decal
 * tracks the surface. Vertices that moved outside the decal radius are dropped.
 */
export declare function reprojectDecalWithMorph(decal: TattooDecalExtended, canonical: CanonicalHuman, deltas: MorphDelta[]): TattooDecalExtended;
/**
 * Batch re-project all decals in a set after morphing.
 */
export declare function reprojectDecalsWithMorph(decals: TattooDecalExtended[], canonical: CanonicalHuman, deltas: MorphDelta[]): TattooDecalExtended[];
/**
 * Export baked vertex colors, normal overlay, and strengths as flat
 * Float32Arrays ready for GPU buffer upload.
 */
export declare function exportGPUData(decals: TattooDecalExtended[], canonical: CanonicalHuman): TattooGPUExport;
/**
 * Export only the vertex color buffer as a flat Float32Array (RGB per vertex).
 */
export declare function exportVertexColorBuffer(decals: TattooDecalExtended[], vertexCount: number): Float32Array;
/**
 * Export only the normal overlay as a flat Float32Array (XYZ per vertex).
 */
export declare function exportNormalOverlayBuffer(decals: TattooDecalExtended[], canonical: CanonicalHuman): Float32Array;
/**
 * Manages a collection of decals, projects them from attachments, handles
 * multi-decal blending, morph re-projection, and GPU export.
 */
export declare class TattooDecalSystem {
    private decals;
    private canonical;
    private vertexCount;
    /** Dirty flag set when decals change; cleared on export. */
    private dirty;
    /** Cached GPU export, invalidated when dirty. */
    private gpuCache;
    constructor(canonical: CanonicalHuman);
    /** Number of managed decals. */
    get count(): number;
    /** Whether the GPU export cache is stale. */
    get isDirty(): boolean;
    /** Read-only access to managed decals. */
    getDecals(): readonly TattooDecalExtended[];
    /**
     * Add an attachment projected as a decal. Returns the extended decal or null
     * if the attachment is not a tattoo.
     */
    addFromAttachment(attachment: HumanAttachment, options?: TattooDecalOptions & {
        falloff?: TattooFalloffCurve;
        blendMode?: TattooBlendMode;
        decalOpacity?: number;
        normalStrength?: number;
    }): TattooDecalExtended | null;
    /**
     * Add multiple attachments at once.
     */
    addFromAttachments(attachments: HumanAttachment[], options?: TattooDecalOptions & {
        falloff?: TattooFalloffCurve;
        blendMode?: TattooBlendMode;
        decalOpacity?: number;
        normalStrength?: number;
    }): TattooDecalExtended[];
    /**
     * Add a pre-built extended decal directly.
     */
    addDecal(decal: TattooDecalExtended): void;
    /** Remove a decal by id. Returns true if found and removed. */
    removeDecal(id: string): boolean;
    /** Remove all decals. */
    clear(): void;
    /**
     * Replace all decals from a list of attachments.
     */
    rebuild(attachments: HumanAttachment[], options?: TattooDecalOptions & {
        falloff?: TattooFalloffCurve;
        blendMode?: TattooBlendMode;
        decalOpacity?: number;
        normalStrength?: number;
    }): void;
    /**
     * Re-project all decals after morph deltas are applied.
     */
    applyMorph(deltas: MorphDelta[]): void;
    /**
     * Apply a custom opacity map to a specific decal by id.
     */
    applyOpacityToDecal(id: string, map: TattooOpacityMap): boolean;
    /**
     * Full GPU-ready export. Cached until next mutation.
     */
    exportGPU(): TattooGPUExport;
    /**
     * Export only vertex colors as a flat Float32Array.
     */
    exportVertexColors(): Float32Array;
    /**
     * Export only the normal overlay as a flat Float32Array.
     */
    exportNormalOverlay(): Float32Array;
    /**
     * Get the baked vertex color buffer and mask (non-GPU, useful for CPU reads).
     */
    bakeColors(): TattooBakedVertexColors;
    /**
     * Get the accumulated normal overlay data.
     */
    bakeNormals(): TattooBakedNormalOverlay;
    private invalidate;
}
//# sourceMappingURL=tattoo-decal.d.ts.map