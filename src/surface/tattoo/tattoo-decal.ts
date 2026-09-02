import { HumanAttachment } from '../../attachments/attachment-system';
import { Vec3, vec3 } from '../../core/math/vec';
import {
  CanonicalHuman,
  MorphDelta,
  RegionName,
  Vertex,
} from '../../geometry/canonical/canonical-human';

// ─── Existing types (unchanged) ──────────────────────────────────────────────

export interface TattooDecalSample {
  vertexId: number;
  region: RegionName;
  uv: { u: number; v: number };
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

// ─── New types ───────────────────────────────────────────────────────────────

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

// ─── Falloff curve functions ─────────────────────────────────────────────────

const FALLOFF_CURVES: Record<TattooFalloffCurve, (t: number) => number> = {
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

// ─── Blend mode functions ────────────────────────────────────────────────────

function blendNormal(base: number, decal: number, alpha: number): number {
  return base + (decal - base) * alpha;
}

function blendMultiply(base: number, decal: number, alpha: number): number {
  return base + (base * decal - base) * alpha;
}

function blendOverlay(base: number, decal: number, alpha: number): number {
  const r = base < 0.5 ? 2 * base * decal : 1 - 2 * (1 - base) * (1 - decal);
  return base + (r - base) * alpha;
}

function blendScreen(base: number, decal: number, alpha: number): number {
  const r = 1 - (1 - base) * (1 - decal);
  return base + (r - base) * alpha;
}

function applyBlend(mode: TattooBlendMode, base: number, decal: number, alpha: number): number {
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

// ─── Existing project functions (unchanged API, extended internals) ───────────

/** Project a tattoo attachment to stable region vertices as a decal sample set. */
export function projectTattooDecal(
  attachment: HumanAttachment,
  canonical: CanonicalHuman,
  options: TattooDecalOptions = {},
): TattooDecal | null {
  if (attachment.kind !== 'tattoo') return null;
  const region = attachment.anchor.region;
  if (!region) throw new Error('Tattoo decals require a semantic region anchor');
  const vertices = canonical.vertices.filter((v) => v.region === region);
  if (vertices.length === 0) throw new Error(`Unknown tattoo region: ${region}`);

  const center = attachment.anchor.localPosition
    ? add(regionCentroid(vertices), attachment.anchor.localPosition)
    : regionCentroid(vertices);
  const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);
  const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
  const samples: TattooDecalSample[] = [];

  for (const v of vertices) {
    const d = distance(v.position, center);
    if (d > radius) continue;
    const opacity = smoothFalloff(d / Math.max(radius, 1e-6));
    samples.push({ vertexId: v.id, region, uv: { ...v.uv }, opacity, color });
  }

  samples.sort((a, b) => a.vertexId - b.vertexId);
  return { id: attachment.id, region, center, radius, samples };
}

export function projectTattooDecals(
  attachments: HumanAttachment[],
  canonical: CanonicalHuman,
  options: TattooDecalOptions = {},
): TattooDecal[] {
  return attachments.flatMap((a) => {
    const decal = projectTattooDecal(a, canonical, options);
    return decal ? [decal] : [];
  });
}

// ─── UV-space decal projection ───────────────────────────────────────────────

/**
 * Place a decal in UV space rather than 3D position. Returns decal samples for
 * vertices whose UV coordinates fall inside the rectangular UV footprint.
 */
export function projectUVDecal(
  attachment: HumanAttachment,
  canonical: CanonicalHuman,
  options: TattooDecalOptions = {},
): TattooDecal | null {
  if (attachment.kind !== 'tattoo') return null;
  const region = attachment.anchor.region;
  if (!region) throw new Error('Tattoo decals require a semantic region anchor');
  const vertices = canonical.vertices.filter((v) => v.region === region);
  if (vertices.length === 0) throw new Error(`Unknown tattoo region: ${region}`);

  const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
  const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);

  const localPos = attachment.anchor.localPosition;
  const cu = localPos ? clamp01(0.5 + localPos.x) : 0.5;
  const cv = localPos ? clamp01(0.5 + localPos.y) : 0.5;

  const halfR = radius * 0.5;
  const samples: TattooDecalSample[] = [];

  for (const v of vertices) {
    const du = v.uv.u - cu;
    const dv = v.uv.v - cv;
    const dUV = Math.sqrt(du * du + dv * dv);
    if (dUV > halfR) continue;
    const opacity = smoothFalloff(dUV / Math.max(halfR, 1e-6));
    samples.push({ vertexId: v.id, region, uv: { ...v.uv }, opacity, color });
  }

  samples.sort((a, b) => a.vertexId - b.vertexId);

  const center3D = regionCentroid(vertices);
  return { id: attachment.id, region, center: center3D, radius, samples };
}

// ─── Opacity mapping ─────────────────────────────────────────────────────────

/**
 * Apply a custom opacity map over existing decal samples. The map receives
 * the sample's UV coordinates and radial distance and returns a scalar [0-1]
 * that replaces the original opacity.
 */
export function applyOpacityMap(decal: TattooDecal, map: TattooOpacityMap): TattooDecal {
  return {
    ...decal,
    samples: decal.samples.map((s) => {
      const radialT = 'radialT' in s ? (s as TattooDecalSampleExtended).radialT : 0;
      return { ...s, opacity: clamp01(map(s.uv.u, s.uv.v, radialT)) };
    }),
  };
}

/**
 * Create a decal with extended sample data including radial distance, using a
 * configurable falloff curve.
 */
export function projectTattooDecalExtended(
  attachment: HumanAttachment,
  canonical: CanonicalHuman,
  options: TattooDecalOptions & {
    falloff?: TattooFalloffCurve;
    blendMode?: TattooBlendMode;
    decalOpacity?: number;
    normalStrength?: number;
  } = {},
): TattooDecalExtended | null {
  if (attachment.kind !== 'tattoo') return null;
  const region = attachment.anchor.region;
  if (!region) throw new Error('Tattoo decals require a semantic region anchor');
  const vertices = canonical.vertices.filter((v) => v.region === region);
  if (vertices.length === 0) throw new Error(`Unknown tattoo region: ${region}`);

  const center = attachment.anchor.localPosition
    ? add(regionCentroid(vertices), attachment.anchor.localPosition)
    : regionCentroid(vertices);
  const radius = numberData(attachment.data?.radius, options.defaultRadius ?? 0.12);
  const color = colorData(attachment.data?.color, options.defaultColor ?? [0.04, 0.035, 0.03]);
  const falloff = FALLOFF_CURVES[options.falloff ?? 'smooth'];
  const samples: TattooDecalSampleExtended[] = [];

  for (const v of vertices) {
    const d = distance(v.position, center);
    const radialT = clamp01(d / Math.max(radius, 1e-6));
    if (radialT > 1) continue;
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

// ─── Normal map generation ───────────────────────────────────────────────────

/**
 * Generate a per-vertex normal overlay from decal samples. Positive
 * normalStrength pushes vertices outward; negative indents them.
 */
export function generateDecalNormalOverlay(
  decal: TattooDecalExtended,
  canonical: CanonicalHuman,
): TattooBakedNormalOverlay {
  const vertexCount = canonical.vertices.length;
  const normals = new Float32Array(vertexCount * 3);
  const strengths = new Float32Array(vertexCount);

  for (const sample of decal.samples) {
    const v = canonical.vertices[sample.vertexId];
    if (!v) continue;
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
export function accumulateNormalOverlays(
  decals: TattooDecalExtended[],
  canonical: CanonicalHuman,
): TattooBakedNormalOverlay {
  const vertexCount = canonical.vertices.length;
  const normals = new Float32Array(vertexCount * 3);
  const strengths = new Float32Array(vertexCount);

  for (const decal of decals) {
    for (const sample of decal.samples) {
      const v = canonical.vertices[sample.vertexId];
      if (!v) continue;
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

// ─── Vertex color baking ─────────────────────────────────────────────────────

/**
 * Bake a single decal onto a pre-existing vertex color buffer.
 * Colors are blended per-channel using the decal's blend mode.
 * Returns the mutated buffer (no copy).
 */
export function bakeDecalVertexColors(
  colors: Float32Array,
  mask: Uint8Array | null,
  decal: TattooDecalExtended,
  vertexCount: number,
): { colors: Float32Array; mask: Uint8Array } {
  const m = mask ?? new Uint8Array(vertexCount);
  const alpha = decal.opacity;

  for (const sample of decal.samples) {
    const idx = sample.vertexId * 3;
    if (idx + 2 >= colors.length) continue;
    const a = clamp01(sample.opacity * alpha);
    if (a <= 0) continue;

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
export function bakeDecalToNewBuffer(
  decal: TattooDecalExtended,
  vertexCount: number,
): TattooBakedVertexColors {
  const colors = new Float32Array(vertexCount * 3);
  const mask = new Uint8Array(vertexCount);
  bakeDecalVertexColors(colors, mask, decal, vertexCount);
  return { colors, mask, vertexCount };
}

// ─── Multi-decal blending ────────────────────────────────────────────────────

/**
 * Blend multiple decals onto a single vertex color buffer, processing decals
 * in order (first = lowest layer, last = highest layer). Overlapping areas
 * accumulate through each decal's blend mode and opacity.
 */
export function blendMultipleDecals(
  decals: TattooDecalExtended[],
  vertexCount: number,
): TattooBakedVertexColors {
  const colors = new Float32Array(vertexCount * 3);
  const mask = new Uint8Array(vertexCount);

  for (const decal of decals) {
    bakeDecalVertexColors(colors, mask, decal, vertexCount);
  }

  return { colors, mask, vertexCount };
}

// ─── Deformable decal support ────────────────────────────────────────────────

/**
 * Re-project decal samples after morph deltas are applied. For each sample,
 * updates the UV coordinates based on the deformed position so the decal
 * tracks the surface. Vertices that moved outside the decal radius are dropped.
 */
export function reprojectDecalWithMorph(
  decal: TattooDecalExtended,
  canonical: CanonicalHuman,
  deltas: MorphDelta[],
): TattooDecalExtended {
  const deltaMap = new Map<number, MorphDelta>();
  for (const d of deltas) deltaMap.set(d.vertexId, d);

  const reprojected: TattooDecalSampleExtended[] = [];

  for (const sample of decal.samples) {
    const v = canonical.vertices[sample.vertexId];
    if (!v) continue;
    const delta = deltaMap.get(sample.vertexId);
    if (!delta) {
      reprojected.push(sample);
      continue;
    }

    const newPos: Vec3 = vec3(
      v.position.x + delta.dx,
      v.position.y + delta.dy,
      v.position.z + delta.dz,
    );
    const d = distance(newPos, decal.center);
    const radialT = clamp01(d / Math.max(decal.radius, 1e-6));
    if (radialT > 1) continue;

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
export function reprojectDecalsWithMorph(
  decals: TattooDecalExtended[],
  canonical: CanonicalHuman,
  deltas: MorphDelta[],
): TattooDecalExtended[] {
  return decals.map((d) => reprojectDecalWithMorph(d, canonical, deltas));
}

// ─── GPU-ready data export ───────────────────────────────────────────────────

/**
 * Export baked vertex colors, normal overlay, and strengths as flat
 * Float32Arrays ready for GPU buffer upload.
 */
export function exportGPUData(
  decals: TattooDecalExtended[],
  canonical: CanonicalHuman,
): TattooGPUExport {
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
export function exportVertexColorBuffer(
  decals: TattooDecalExtended[],
  vertexCount: number,
): Float32Array {
  return blendMultipleDecals(decals, vertexCount).colors;
}

/**
 * Export only the normal overlay as a flat Float32Array (XYZ per vertex).
 */
export function exportNormalOverlayBuffer(
  decals: TattooDecalExtended[],
  canonical: CanonicalHuman,
): Float32Array {
  return accumulateNormalOverlays(decals, canonical).normals;
}

// ─── TattooDecalSystem ───────────────────────────────────────────────────────

/**
 * Manages a collection of decals, projects them from attachments, handles
 * multi-decal blending, morph re-projection, and GPU export.
 */
export class TattooDecalSystem {
  private decals: TattooDecalExtended[] = [];
  private canonical: CanonicalHuman;
  private vertexCount: number;

  /** Dirty flag set when decals change; cleared on export. */
  private dirty = true;

  /** Cached GPU export, invalidated when dirty. */
  private gpuCache: TattooGPUExport | null = null;

  constructor(canonical: CanonicalHuman) {
    this.canonical = canonical;
    this.vertexCount = canonical.vertices.length;
  }

  /** Number of managed decals. */
  get count(): number {
    return this.decals.length;
  }

  /** Whether the GPU export cache is stale. */
  get isDirty(): boolean {
    return this.dirty;
  }

  /** Read-only access to managed decals. */
  getDecals(): readonly TattooDecalExtended[] {
    return this.decals;
  }

  /**
   * Add an attachment projected as a decal. Returns the extended decal or null
   * if the attachment is not a tattoo.
   */
  addFromAttachment(
    attachment: HumanAttachment,
    options: TattooDecalOptions & {
      falloff?: TattooFalloffCurve;
      blendMode?: TattooBlendMode;
      decalOpacity?: number;
      normalStrength?: number;
    } = {},
  ): TattooDecalExtended | null {
    const decal = projectTattooDecalExtended(attachment, this.canonical, options);
    if (!decal) return null;
    this.decals.push(decal);
    this.invalidate();
    return decal;
  }

  /**
   * Add multiple attachments at once.
   */
  addFromAttachments(
    attachments: HumanAttachment[],
    options: TattooDecalOptions & {
      falloff?: TattooFalloffCurve;
      blendMode?: TattooBlendMode;
      decalOpacity?: number;
      normalStrength?: number;
    } = {},
  ): TattooDecalExtended[] {
    const results: TattooDecalExtended[] = [];
    for (const a of attachments) {
      const d = this.addFromAttachment(a, options);
      if (d) results.push(d);
    }
    return results;
  }

  /**
   * Add a pre-built extended decal directly.
   */
  addDecal(decal: TattooDecalExtended): void {
    this.decals.push(decal);
    this.invalidate();
  }

  /** Remove a decal by id. Returns true if found and removed. */
  removeDecal(id: string): boolean {
    const idx = this.decals.findIndex((d) => d.id === id);
    if (idx === -1) return false;
    this.decals.splice(idx, 1);
    this.invalidate();
    return true;
  }

  /** Remove all decals. */
  clear(): void {
    if (this.decals.length === 0) return;
    this.decals.length = 0;
    this.invalidate();
  }

  /**
   * Replace all decals from a list of attachments.
   */
  rebuild(
    attachments: HumanAttachment[],
    options: TattooDecalOptions & {
      falloff?: TattooFalloffCurve;
      blendMode?: TattooBlendMode;
      decalOpacity?: number;
      normalStrength?: number;
    } = {},
  ): void {
    this.clear();
    this.addFromAttachments(attachments, options);
  }

  /**
   * Re-project all decals after morph deltas are applied.
   */
  applyMorph(deltas: MorphDelta[]): void {
    if (this.decals.length === 0) return;
    this.decals = reprojectDecalsWithMorph(this.decals, this.canonical, deltas);
    this.invalidate();
  }

  /**
   * Apply a custom opacity map to a specific decal by id.
   */
  applyOpacityToDecal(id: string, map: TattooOpacityMap): boolean {
    const decal = this.decals.find((d) => d.id === id);
    if (!decal) return false;
    decal.samples = decal.samples.map((s) => {
      const radialT = 'radialT' in s ? (s as TattooDecalSampleExtended).radialT : 0;
      return { ...s, opacity: clamp01(map(s.uv.u, s.uv.v, radialT)) };
    }) as TattooDecalSampleExtended[];
    this.invalidate();
    return true;
  }

  /**
   * Full GPU-ready export. Cached until next mutation.
   */
  exportGPU(): TattooGPUExport {
    if (!this.dirty && this.gpuCache) return this.gpuCache;
    this.gpuCache = exportGPUData(this.decals, this.canonical);
    this.dirty = false;
    return this.gpuCache;
  }

  /**
   * Export only vertex colors as a flat Float32Array.
   */
  exportVertexColors(): Float32Array {
    return exportVertexColorBuffer(this.decals, this.vertexCount);
  }

  /**
   * Export only the normal overlay as a flat Float32Array.
   */
  exportNormalOverlay(): Float32Array {
    return exportNormalOverlayBuffer(this.decals, this.canonical);
  }

  /**
   * Get the baked vertex color buffer and mask (non-GPU, useful for CPU reads).
   */
  bakeColors(): TattooBakedVertexColors {
    return blendMultipleDecals(this.decals, this.vertexCount);
  }

  /**
   * Get the accumulated normal overlay data.
   */
  bakeNormals(): TattooBakedNormalOverlay {
    return accumulateNormalOverlays(this.decals, this.canonical);
  }

  private invalidate(): void {
    this.dirty = true;
    this.gpuCache = null;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function regionCentroid(vertices: Vertex[]): Vec3 {
  let x = 0,
    y = 0,
    z = 0;
  for (const v of vertices) {
    x += v.position.x;
    y += v.position.y;
    z += v.position.z;
  }
  return vec3(x / vertices.length, y / vertices.length, z / vertices.length);
}

function smoothFalloff(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - x * x * (3 - 2 * x);
}

function numberData(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorData(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) {
    return [clamp01(value[0]), clamp01(value[1]), clamp01(value[2])];
  }
  return fallback;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
