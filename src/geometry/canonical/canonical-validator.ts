import { RegionName } from "./canonical-human";
import { CanonicalTopology, CanonicalTopologyPart, CanonicalTopologyVertex } from "./canonical-topology";

export interface CanonicalValidationIssue {
  code: string;
  message: string;
}

export interface CanonicalValidationReport {
  valid: boolean;
  vertexCount: number;
  triangleCount: number;
  partCount: number;
  regionCount: number;
  issues: CanonicalValidationIssue[];
}

export const REQUIRED_CANONICAL_REGIONS: RegionName[] = [
  "head", "face", "nose", "jaw", "eyes", "mouth", "neck", "torso",
  "upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "hand_l", "hand_r",
  "thigh_l", "thigh_r", "shin_l", "shin_r",
];

export const REQUIRED_CANONICAL_PARTS = [
  "eye_l", "eye_r", "iris_l", "iris_r", "pupil_l", "pupil_r", "teeth_upper", "teeth_lower", "tongue", "mouth_cavity",
] as const;

export function validateCanonicalTopology(topology: CanonicalTopology): CanonicalValidationReport {
  const issues: CanonicalValidationIssue[] = [];
  const vertexCount = topology.vertices.length;
  const triangleCount = topology.indices.length / 3;
  validateVertices(topology.vertices, issues);
  validateIndices(topology, issues);
  validateRegions(topology, vertexCount, issues);
  validateParts(topology, vertexCount, issues);

  return {
    valid: issues.length === 0,
    vertexCount,
    triangleCount,
    partCount: topology.parts.length,
    regionCount: regionNames(topology.vertices).size,
    issues,
  };
}

export function validateCanonicalHuman(canonical: CanonicalHumanLike): CanonicalValidationReport {
  const topology: CanonicalTopology = {
    vertices: canonical.vertices,
    indices: canonical.indices,
    parts: canonical.parts,
  };
  return validateCanonicalTopology(topology);
}

interface CanonicalHumanLike {
  vertices: readonly CanonicalTopologyVertex[];
  indices: Uint32Array;
  parts: readonly CanonicalTopologyPart[];
}

function validateVertices(vertices: readonly CanonicalTopologyVertex[], issues: CanonicalValidationIssue[]): void {
  const seen = new Set<number>();
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    if (vertex.id !== i) issues.push({ code: "vertex-id-order", message: `vertex ${i} has id ${vertex.id}` });
    if (seen.has(vertex.id)) issues.push({ code: "duplicate-vertex-id", message: `duplicate vertex id ${vertex.id}` });
    seen.add(vertex.id);
    if (!finite3(vertex.position)) issues.push({ code: "invalid-position", message: `vertex ${vertex.id} has non-finite position` });
    if (!finite3(vertex.normal)) issues.push({ code: "invalid-normal", message: `vertex ${vertex.id} has non-finite normal` });
    if (vertex.uv.u < 0 || vertex.uv.u > 1 || vertex.uv.v < 0 || vertex.uv.v > 1) {
      issues.push({ code: "invalid-uv", message: `vertex ${vertex.id} UV is outside [0,1]` });
    }
  }
}

function validateIndices(topology: CanonicalTopology, issues: CanonicalValidationIssue[]): void {
  const vertexCount = topology.vertices.length;
  if (topology.indices.length % 3 !== 0) issues.push({ code: "index-triangle-alignment", message: "index count is not divisible by 3" });
  for (let i = 0; i < topology.indices.length; i++) {
    const index = topology.indices[i];
    if (index >= vertexCount) issues.push({ code: "index-out-of-range", message: `index ${i} references vertex ${index}` });
  }
}

function validateRegions(topology: CanonicalTopology, vertexCount: number, issues: CanonicalValidationIssue[]): void {
  const counts = new Map<RegionName, number>();
  for (const v of topology.vertices) counts.set(v.region, (counts.get(v.region) ?? 0) + 1);
  for (const region of REQUIRED_CANONICAL_REGIONS) {
    if (!(counts.get(region) ?? 0)) issues.push({ code: "missing-region", message: `missing required region ${region}` });
  }
  for (const v of topology.vertices) {
    if (v.id < 0 || v.id >= vertexCount) issues.push({ code: "region-vertex-out-of-range", message: `vertex ${v.id} is out of range` });
  }
}

function validateParts(topology: CanonicalTopology, vertexCount: number, issues: CanonicalValidationIssue[]): void {
  const names = new Set(topology.parts.map((p) => p.name));
  for (const name of REQUIRED_CANONICAL_PARTS) {
    if (!names.has(name)) issues.push({ code: "missing-part", message: `missing required part ${name}` });
  }
  for (const part of topology.parts) validatePart(part, vertexCount, topology.indices.length, issues);
}

function validatePart(part: CanonicalTopologyPart, vertexCount: number, indexCount: number, issues: CanonicalValidationIssue[]): void {
  if (part.vertexStart < 0 || part.vertexCount <= 0 || part.vertexStart + part.vertexCount > vertexCount) {
    issues.push({ code: "part-vertex-range-out-of-bounds", message: `part ${part.name} has invalid vertex range` });
  }
  if (part.indexStart < 0 || part.indexCount <= 0 || part.indexStart + part.indexCount > indexCount) {
    issues.push({ code: "part-index-range-out-of-bounds", message: `part ${part.name} has invalid index range` });
  }
}

function regionNames(vertices: readonly CanonicalTopologyVertex[]): Set<RegionName> {
  const names = new Set<RegionName>();
  for (const v of vertices) names.add(v.region);
  return names;
}

function finite3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}