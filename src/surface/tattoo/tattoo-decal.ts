import { HumanAttachment } from "../../attachments/attachment-system";
import { Vec3, vec3 } from "../../core/math/vec";
import { CanonicalHuman, RegionName, Vertex } from "../../geometry/canonical/canonical-human";

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

/** Project a tattoo attachment to stable region vertices as a decal sample set. */
export function projectTattooDecal(
  attachment: HumanAttachment,
  canonical: CanonicalHuman,
  options: TattooDecalOptions = {}
): TattooDecal | null {
  if (attachment.kind !== "tattoo") return null;
  const region = attachment.anchor.region;
  if (!region) throw new Error("Tattoo decals require a semantic region anchor");
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
  options: TattooDecalOptions = {}
): TattooDecal[] {
  return attachments.flatMap((a) => {
    const decal = projectTattooDecal(a, canonical, options);
    return decal ? [decal] : [];
  });
}

function regionCentroid(vertices: Vertex[]): Vec3 {
  let x = 0, y = 0, z = 0;
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
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function colorData(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number")) {
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
