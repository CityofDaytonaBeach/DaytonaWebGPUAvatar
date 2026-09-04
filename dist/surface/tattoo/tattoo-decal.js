import { vec3 } from '../../core/math/vec.js';
// â”€â”€â”€ Falloff curve functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FALLOFF_CURVES = {
    linear: (t) => 1 - t,
    smooth: (t) => 1 - t * t * (3 - 2 * t),
    smooth2: (t) => {
        const x = 1 - t;
        return 1 - x * x * x * x;
    },
    sharp: (t) => {
        const x = clamp01(t);
        return 1 - x * x;
    },
    round: (t) => {
        const x = clamp01(t);
        return Math.sqrt(1 - x * x);
    },
};
// â”€â”€â”€ Blend mode functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function blendNormal(base, decal, alpha) {
    return base + (decal - base) * alpha;
}
function blendMultiply(base, decal, alpha) {
    return base + (base * decal - base) * alpha;
}
function blendOverlay(base, decal, alpha) {
    const r = base < 0.5 ? 2 * base * decal : 1 - 2 * (1 - base) * (1 - decal);
    return base + (r - base) * alpha;
}
function blendScreen(base, decal, alpha) {
    const r = 1 - (1 - base) * (1 - decal);
    return base + (r - base) * alpha;
}
function applyBlend(mode, base, decal, alpha) {
    switch (mode) {
        case 'multiply':
            return blendMultiply(base, decal, alpha);
        case 'overlay':
            return blendOverlay(base, decal, alpha);
        case 'screen':
            return blendScreen(base, decal, alpha);
        default:
            return blendNormal(base, decal, alpha);
    }
}
// â”€â”€â”€ Existing project functions (unchanged API, extended internals) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Project a tattoo attachment to stable region vertices as a decal sample set. */
export function projectTattooDecal(attachment, canonical, options = {}) {
    if (attachment.kind !== 'tattoo')
        return null;
    const region = attachment.anchor.region;
    if (!region)
        throw new Error('Tattoo decals require a semantic region anchor');
    const vertices = canonical.vertices.filter((v) => v.region === region);
    if (vertices.length === 0)
        throw new Error(`Unknown tattoo region: ${region}`);
    const center = attachment.anchor.localPosition
        ? add(regionCentroid(vertices), attachment.anchor.localPosition)
        : regionCentroid(vertices);
    const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);
    const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
    const samples = [];
    for (const v of vertices) {
        const d = distance(v.position, center);
        if (d > radius)
            continue;
        const opacity = smoothFalloff(d / Math.max(radius, 1e-6));
        samples.push({ vertexId: v.id, region, uv: { ...v.uv }, opacity, color });
    }
    samples.sort((a, b) => a.vertexId - b.vertexId);
    return { id: attachment.id, region, center, radius, samples };
}
export function projectTattooDecals(attachments, canonical, options = {}) {
    return attachments.flatMap((a) => {
        const decal = projectTattooDecal(a, canonical, options);
        return decal ? [decal] : [];
    });
}
// â”€â”€â”€ UV-space decal projection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Place a decal in UV space rather than 3D position. Returns decal samples for
 * vertices whose UV coordinates fall inside the rectangular UV footprint.
 */
export function projectUVDecal(attachment, canonical, options = {}) {
    if (attachment.kind !== 'tattoo')
        return null;
    const region = attachment.anchor.region;
    if (!region)
        throw new Error('Tattoo decals require a semantic region anchor');
    const vertices = canonical.vertices.filter((v) => v.region === region);
    if (vertices.length === 0)
        throw new Error(`Unknown tattoo region: ${region}`);
    const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
    const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);
    const localPos = attachment.anchor.localPosition;
    const cu = localPos ? clamp01(0.5 + localPos.x) : 0.5;
    const cv = localPos ? clamp01(0.5 + localPos.y) : 0.5;
    const halfR = radius * 0.5;
    const samples = [];
    for (const v of vertices) {
        const du = v.uv.u - cu;
        const dv = v.uv.v - cv;
        const dUV = Math.sqrt(du * du + dv * dv);
        if (dUV > halfR)
            continue;
        const opacity = smoothFalloff(dUV / Math.max(halfR, 1e-6));
        samples.push({ vertexId: v.id, region, uv: { ...v.uv }, opacity, color });
    }
    samples.sort((a, b) => a.vertexId - b.vertexId);
    const center3D = regionCentroid(vertices);
    return { id: attachment.id, region, center: center3D, radius, samples };
}
// â”€â”€â”€ Opacity mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Apply a custom opacity map over existing decal samples. The map receives
 * the sample's UV coordinates and radial distance and returns a scalar [0-1]
 * that replaces the original opacity.
 */
export function applyOpacityMap(decal, map) {
    return {
        ...decal,
        samples: decal.samples.map((s) => {
            const radialT = 'radialT' in s ? s.radialT : 0;
            return { ...s, opacity: clamp01(map(s.uv.u, s.uv.v, radialT)) };
        }),
    };
}
/**
 * Create a decal with extended sample data including radial distance, using a
 * configurable falloff curve.
 */
export function projectTattooDecalExtended(attachment, canonical, options = {}) {
    if (attachment.kind !== 'tattoo')
        return null;
    const region = attachment.anchor.region;
    if (!region)
        throw new Error('Tattoo decals require a semantic region anchor');
    const vertices = canonical.vertices.filter((v) => v.region === region);
    if (vertices.length === 0)
        throw new Error(`Unknown tattoo region: ${region}`);
    const center = attachment.anchor.localPosition
        ? add(regionCentroid(vertices), attachment.anchor.localPosition)
        : regionCentroid(vertices);
    const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);
    const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
    const falloff = FALLOFF_CURVES[options.falloff ?? 'smooth'];
    const samples = [];
    for (const v of vertices) {
        const d = distance(v.position, center);
        const radialT = clamp01(d / Math.max(radius, 1e-6));
        if (radialT > 1)
            continue;
        const opacity = falloff(radialT);
        samples.push({
            vertexId: v.id,
            region,
            uv: { ...v.uv },
            opacity,
            color,
            radialT,
        });
    }
    samples.sort((a, b) => a.vertexId - b.vertexId);
    return {
        id: attachment.id,
        region,
        center,
        radius,
        samples,
        blendMode: options.blendMode ?? 'normal',
        opacity: clamp01(options.decalOpacity ?? 1),
        normalStrength: options.normalStrength ?? 0,
    };
}
// â”€â”€â”€ Normal map generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Generate a per-vertex normal overlay from decal samples. Positive
 * normalStrength pushes vertices outward; negative indents them.
 */
export function generateDecalNormalOverlay(decal, canonical) {
    const vertexCount = canonical.vertices.length;
    const normals = new Float32Array(vertexCount * 3);
    const strengths = new Float32Array(vertexCount);
    for (const sample of decal.samples) {
        const v = canonical.vertices[sample.vertexId];
        if (!v)
            continue;
        const s = sample.opacity * decal.normalStrength;
        strengths[sample.vertexId] = s;
        const idx = sample.vertexId * 3;
        normals[idx] = v.normal.x * s;
        normals[idx + 1] = v.normal.y * s;
        normals[idx + 2] = v.normal.z * s;
    }
    return { normals, strengths, vertexCount };
}
/**
 * Accumulate normal overlays from multiple decals.
 */
export function accumulateNormalOverlays(decals, canonical) {
    const vertexCount = canonical.vertices.length;
    const normals = new Float32Array(vertexCount * 3);
    const strengths = new Float32Array(vertexCount);
    for (const decal of decals) {
        for (const sample of decal.samples) {
            const v = canonical.vertices[sample.vertexId];
            if (!v)
                continue;
            const s = sample.opacity * decal.normalStrength * decal.opacity;
            strengths[sample.vertexId] += s;
            const idx = sample.vertexId * 3;
            normals[idx] += v.normal.x * s;
            normals[idx + 1] += v.normal.y * s;
            normals[idx + 2] += v.normal.z * s;
        }
    }
    return { normals, strengths, vertexCount };
}
// â”€â”€â”€ Vertex color baking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Bake a single decal onto a pre-existing vertex color buffer.
 * Colors are blended per-channel using the decal's blend mode.
 * Returns the mutated buffer (no copy).
 */
export function bakeDecalVertexColors(colors, mask, decal, vertexCount) {
    const m = mask ?? new Uint8Array(vertexCount);
    const alpha = decal.opacity;
    for (const sample of decal.samples) {
        const idx = sample.vertexId * 3;
        if (idx + 2 >= colors.length)
            continue;
        const a = clamp01(sample.opacity * alpha);
        if (a <= 0)
            continue;
        colors[idx] = applyBlend(decal.blendMode, colors[idx], sample.color[0], a);
        colors[idx + 1] = applyBlend(decal.blendMode, colors[idx + 1], sample.color[1], a);
        colors[idx + 2] = applyBlend(decal.blendMode, colors[idx + 2], sample.color[2], a);
        m[sample.vertexId] = 1;
    }
    return { colors, mask: m };
}
/**
 * Bake a single decal onto a fresh buffer (allocate + bake).
 */
export function bakeDecalToNewBuffer(decal, vertexCount) {
    const colors = new Float32Array(vertexCount * 3);
    const mask = new Uint8Array(vertexCount);
    bakeDecalVertexColors(colors, mask, decal, vertexCount);
    return { colors, mask, vertexCount };
}
// â”€â”€â”€ Multi-decal blending â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Blend multiple decals onto a single vertex color buffer, processing decals
 * in order (first = lowest layer, last = highest layer). Overlapping areas
 * accumulate through each decal's blend mode and opacity.
 */
export function blendMultipleDecals(decals, vertexCount) {
    const colors = new Float32Array(vertexCount * 3);
    const mask = new Uint8Array(vertexCount);
    for (const decal of decals) {
        bakeDecalVertexColors(colors, mask, decal, vertexCount);
    }
    return { colors, mask, vertexCount };
}
// â”€â”€â”€ Deformable decal support â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Re-project decal samples after morph deltas are applied. For each sample,
 * updates the UV coordinates based on the deformed position so the decal
 * tracks the surface. Vertices that moved outside the decal radius are dropped.
 */
export function reprojectDecalWithMorph(decal, canonical, deltas) {
    const deltaMap = new Map();
    for (const d of deltas)
        deltaMap.set(d.vertexId, d);
    const reprojected = [];
    for (const sample of decal.samples) {
        const v = canonical.vertices[sample.vertexId];
        if (!v)
            continue;
        const delta = deltaMap.get(sample.vertexId);
        if (!delta) {
            reprojected.push(sample);
            continue;
        }
        const newPos = vec3(v.position.x + delta.dx, v.position.y + delta.dy, v.position.z + delta.dz);
        const d = distance(newPos, decal.center);
        const radialT = clamp01(d / Math.max(decal.radius, 1e-6));
        if (radialT > 1)
            continue;
        const falloff = FALLOFF_CURVES.smooth;
        reprojected.push({
            ...sample,
            uv: { ...v.uv },
            opacity: falloff(radialT),
            radialT,
        });
    }
    reprojected.sort((a, b) => a.vertexId - b.vertexId);
    return { ...decal, samples: reprojected };
}
/**
 * Batch re-project all decals in a set after morphing.
 */
export function reprojectDecalsWithMorph(decals, canonical, deltas) {
    return decals.map((d) => reprojectDecalWithMorph(d, canonical, deltas));
}
// â”€â”€â”€ GPU-ready data export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Export baked vertex colors, normal overlay, and strengths as flat
 * Float32Arrays ready for GPU buffer upload.
 */
export function exportGPUData(decals, canonical) {
    const vertexCount = canonical.vertices.length;
    const baked = blendMultipleDecals(decals, vertexCount);
    const normals = accumulateNormalOverlays(decals, canonical);
    return {
        vertexColors: baked.colors,
        normalOverlay: normals.normals,
        normalStrengths: normals.strengths,
        vertexCount,
    };
}
/**
 * Export only the vertex color buffer as a flat Float32Array (RGB per vertex).
 */
export function exportVertexColorBuffer(decals, vertexCount) {
    return blendMultipleDecals(decals, vertexCount).colors;
}
/**
 * Export only the normal overlay as a flat Float32Array (XYZ per vertex).
 */
export function exportNormalOverlayBuffer(decals, canonical) {
    return accumulateNormalOverlays(decals, canonical).normals;
}
// â”€â”€â”€ TattooDecalSystem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Manages a collection of decals, projects them from attachments, handles
 * multi-decal blending, morph re-projection, and GPU export.
 */
export class TattooDecalSystem {
    decals = [];
    canonical;
    vertexCount;
    /** Dirty flag set when decals change; cleared on export. */
    dirty = true;
    /** Cached GPU export, invalidated when dirty. */
    gpuCache = null;
    constructor(canonical) {
        this.canonical = canonical;
        this.vertexCount = canonical.vertices.length;
    }
    /** Number of managed decals. */
    get count() {
        return this.decals.length;
    }
    /** Whether the GPU export cache is stale. */
    get isDirty() {
        return this.dirty;
    }
    /** Read-only access to managed decals. */
    getDecals() {
        return this.decals;
    }
    /**
     * Add an attachment projected as a decal. Returns the extended decal or null
     * if the attachment is not a tattoo.
     */
    addFromAttachment(attachment, options = {}) {
        const decal = projectTattooDecalExtended(attachment, this.canonical, options);
        if (!decal)
            return null;
        this.decals.push(decal);
        this.invalidate();
        return decal;
    }
    /**
     * Add multiple attachments at once.
     */
    addFromAttachments(attachments, options = {}) {
        const results = [];
        for (const a of attachments) {
            const d = this.addFromAttachment(a, options);
            if (d)
                results.push(d);
        }
        return results;
    }
    /**
     * Add a pre-built extended decal directly.
     */
    addDecal(decal) {
        this.decals.push(decal);
        this.invalidate();
    }
    /** Remove a decal by id. Returns true if found and removed. */
    removeDecal(id) {
        const idx = this.decals.findIndex((d) => d.id === id);
        if (idx === -1)
            return false;
        this.decals.splice(idx, 1);
        this.invalidate();
        return true;
    }
    /** Remove all decals. */
    clear() {
        if (this.decals.length === 0)
            return;
        this.decals.length = 0;
        this.invalidate();
    }
    /**
     * Replace all decals from a list of attachments.
     */
    rebuild(attachments, options = {}) {
        this.clear();
        this.addFromAttachments(attachments, options);
    }
    /**
     * Re-project all decals after morph deltas are applied.
     */
    applyMorph(deltas) {
        if (this.decals.length === 0)
            return;
        this.decals = reprojectDecalsWithMorph(this.decals, this.canonical, deltas);
        this.invalidate();
    }
    /**
     * Apply a custom opacity map to a specific decal by id.
     */
    applyOpacityToDecal(id, map) {
        const decal = this.decals.find((d) => d.id === id);
        if (!decal)
            return false;
        decal.samples = decal.samples.map((s) => {
            const radialT = 'radialT' in s ? s.radialT : 0;
            return { ...s, opacity: clamp01(map(s.uv.u, s.uv.v, radialT)) };
        });
        this.invalidate();
        return true;
    }
    /**
     * Full GPU-ready export. Cached until next mutation.
     */
    exportGPU() {
        if (!this.dirty && this.gpuCache)
            return this.gpuCache;
        this.gpuCache = exportGPUData(this.decals, this.canonical);
        this.dirty = false;
        return this.gpuCache;
    }
    /**
     * Export only vertex colors as a flat Float32Array.
     */
    exportVertexColors() {
        return exportVertexColorBuffer(this.decals, this.vertexCount);
    }
    /**
     * Export only the normal overlay as a flat Float32Array.
     */
    exportNormalOverlay() {
        return exportNormalOverlayBuffer(this.decals, this.canonical);
    }
    /**
     * Get the baked vertex color buffer and mask (non-GPU, useful for CPU reads).
     */
    bakeColors() {
        return blendMultipleDecals(this.decals, this.vertexCount);
    }
    /**
     * Get the accumulated normal overlay data.
     */
    bakeNormals() {
        return accumulateNormalOverlays(this.decals, this.canonical);
    }
    invalidate() {
        this.dirty = true;
        this.gpuCache = null;
    }
}
// â”€â”€â”€ Internal helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function regionCentroid(vertices) {
    let x = 0, y = 0, z = 0;
    for (const v of vertices) {
        x += v.position.x;
        y += v.position.y;
        z += v.position.z;
    }
    return vec3(x / vertices.length, y / vertices.length, z / vertices.length);
}
function smoothFalloff(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - x * x * (3 - 2 * x);
}
function numberData(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function colorData(value, fallback) {
    if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) {
        return [clamp01(value[0]), clamp01(value[1]), clamp01(value[2])];
    }
    return fallback;
}
function add(a, b) {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}
//# sourceMappingURL=tattoo-decal.js.map