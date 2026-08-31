import { AnatomyDimensions } from "../../anatomy/parametric/parametric-anatomy";
import { HumanAttachment } from "../../attachments/attachment-system";
import { Vec3, vec3 } from "../../core/math/vec";

export type GarmentKind = "shirt" | "sleeve" | "generic";

export interface GarmentVertex {
  position: Vec3;
  uv: { u: number; v: number };
}

export interface GarmentMesh {
  id: string;
  kind: GarmentKind;
  vertices: GarmentVertex[];
  indices: Uint32Array;
  color: [number, number, number];
}

export interface GarmentOptions {
  defaultColor?: [number, number, number];
  looseness?: number;
}

/** Generate separate wearable meshes from semantic wear attachments. */
export function generateGarments(
  attachments: HumanAttachment[],
  dims: AnatomyDimensions,
  options: GarmentOptions = {}
): GarmentMesh[] {
  return attachments.flatMap((attachment) => {
    if (attachment.kind !== "wearable") return [];
    return [generateGarment(attachment, dims, options)];
  });
}

export function generateGarment(
  attachment: HumanAttachment,
  dims: AnatomyDimensions,
  options: GarmentOptions = {}
): GarmentMesh {
  if (attachment.kind !== "wearable") throw new Error("Garments require a wearable attachment");
  const color = colorData(attachment.data?.color, options.defaultColor ?? [0.03, 0.04, 0.06]);
  const looseness = Math.max(0, numberData(attachment.data?.looseness, options.looseness ?? 0.04));
  const label = typeof attachment.data?.type === "string" ? attachment.data.type.toLowerCase() : "";
  const region = attachment.anchor.region;

  if (region === "upperarm_l" || region === "upperarm_r" || label.includes("sleeve")) {
    return makeSleeve(attachment.id, region === "upperarm_r" ? 1 : -1, dims, looseness, color);
  }
  return makeShirt(attachment.id, dims, looseness, color);
}

function makeShirt(id: string, dims: AnatomyDimensions, looseness: number, color: [number, number, number]): GarmentMesh {
  const chest = Math.max(dims.chestHalfWidth, dims.waistHalfWidth) + looseness;
  const waist = dims.waistHalfWidth + looseness * 0.7;
  const depth = dims.torsoHalfDepth + looseness;
  const top = dims.shoulderHeight + 0.03;
  const bottom = dims.hipHeight - 0.08;
  const vertices: GarmentVertex[] = [
    v(-chest, top, depth, 0, 0), v(chest, top, depth, 1, 0), v(waist, bottom, depth, 1, 1), v(-waist, bottom, depth, 0, 1),
    v(chest, top, -depth, 0, 0), v(-chest, top, -depth, 1, 0), v(-waist, bottom, -depth, 1, 1), v(waist, bottom, -depth, 0, 1),
    v(-chest, top, -depth, 0, 0), v(-chest, top, depth, 1, 0), v(-waist, bottom, depth, 1, 1), v(-waist, bottom, -depth, 0, 1),
    v(chest, top, depth, 0, 0), v(chest, top, -depth, 1, 0), v(waist, bottom, -depth, 1, 1), v(waist, bottom, depth, 0, 1),
  ];
  return { id, kind: "shirt", vertices, indices: quadIndices(4), color };
}

function makeSleeve(id: string, side: -1 | 1, dims: AnatomyDimensions, looseness: number, color: [number, number, number]): GarmentMesh {
  const radius = dims.height * 0.055 + looseness;
  const x0 = side * dims.shoulderHalfWidth;
  const x1 = side * (dims.shoulderHalfWidth + dims.upperarmLength + dims.forearmLength * 0.55);
  const y0 = dims.shoulderHeight;
  const y1 = dims.shoulderHeight - dims.forearmLength * 0.85;
  const z = radius;
  const vertices: GarmentVertex[] = [
    v(x0, y0 + radius, z, 0, 0), v(x1, y1 + radius, z, 1, 0), v(x1, y1 - radius, z, 1, 1), v(x0, y0 - radius, z, 0, 1),
    v(x1, y1 + radius, -z, 0, 0), v(x0, y0 + radius, -z, 1, 0), v(x0, y0 - radius, -z, 1, 1), v(x1, y1 - radius, -z, 0, 1),
  ];
  return { id, kind: "sleeve", vertices, indices: quadIndices(2), color };
}

function quadIndices(quadCount: number): Uint32Array {
  const out: number[] = [];
  for (let q = 0; q < quadCount; q++) {
    const i = q * 4;
    out.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  return Uint32Array.from(out);
}

function v(x: number, y: number, z: number, u: number, vv: number): GarmentVertex {
  return { position: vec3(x, y, z), uv: { u, v: vv } };
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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
