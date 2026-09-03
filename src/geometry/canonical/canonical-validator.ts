import { RegionName } from './canonical-human.js';
import { COARSE_REGION_FINE_ALIASES } from './regions.js';
import {
  CanonicalTopology,
  CanonicalTopologyPart,
  CanonicalTopologyVertex,
} from './canonical-topology.js';

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
  'head',
  'face',
  'nose',
  'jaw',
  'eyes',
  'mouth',
  'neck',
  'torso',
  'upperarm_l',
  'upperarm_r',
  'forearm_l',
  'forearm_r',
  'hand_l',
  'hand_r',
  'thigh_l',
  'thigh_r',
  'shin_l',
  'shin_r',
];

export const REQUIRED_CANONICAL_PARTS = [
  'eye_l',
  'eye_r',
  'iris_l',
  'iris_r',
  'pupil_l',
  'pupil_r',
  'teeth_upper',
  'teeth_lower',
  'tongue',
  'mouth_cavity',
] as const;

export function validateCanonicalTopology(topology: CanonicalTopology): CanonicalValidationReport {
  const issues: CanonicalValidationIssue[] = [];
  const vertexCount = topology.vertices.length;
  const triangleCount = topology.indices.length / 3;
  validateVertices(topology.vertices, issues);
  validateIndices(topology, issues);
  validateRegions(topology, issues);
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

function validateVertices(
  vertices: readonly CanonicalTopologyVertex[],
  issues: CanonicalValidationIssue[],
): void {
  const seen = new Set<number>();
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    if (vertex.id !== i)
      issues.push({ code: 'vertex-id-order', message: `vertex ${i} has id ${vertex.id}` });
    if (seen.has(vertex.id))
      issues.push({ code: 'duplicate-vertex-id', message: `duplicate vertex id ${vertex.id}` });
    seen.add(vertex.id);
    if (!finite3(vertex.position))
      issues.push({
        code: 'invalid-position',
        message: `vertex ${vertex.id} has non-finite position`,
      });
    if (!finite3(vertex.normal))
      issues.push({ code: 'invalid-normal', message: `vertex ${vertex.id} has non-finite normal` });
    if (vertex.uv.u < 0 || vertex.uv.u > 1 || vertex.uv.v < 0 || vertex.uv.v > 1) {
      issues.push({ code: 'invalid-uv', message: `vertex ${vertex.id} UV is outside [0,1]` });
    }
  }
}

function validateIndices(topology: CanonicalTopology, issues: CanonicalValidationIssue[]): void {
  const vertexCount = topology.vertices.length;
  if (topology.indices.length % 3 !== 0)
    issues.push({ code: 'index-triangle-alignment', message: 'index count is not divisible by 3' });
  for (let i = 0; i < topology.indices.length; i++) {
    const index = topology.indices[i];
    if (index >= vertexCount)
      issues.push({ code: 'index-out-of-range', message: `index ${i} references vertex ${index}` });
  }
}

function validateRegions(topology: CanonicalTopology, issues: CanonicalValidationIssue[]): void {
  const counts = new Map<RegionName, number>();
  for (const v of topology.vertices) counts.set(v.region, (counts.get(v.region) ?? 0) + 1);
  for (const region of REQUIRED_CANONICAL_REGIONS) {
    if (counts.get(region)) continue;
    // Coarse-region aliases: an HD topology emits fine regions (chest,
    // upper_arm_left, ...); the coarse contract is satisfied when those fine
    // sub-regions are present, keeping both vocabularies valid.
    const fines = COARSE_REGION_FINE_ALIASES[region];
    if (fines && fines.every((fine) => counts.get(fine))) continue;
    issues.push({ code: 'missing-region', message: `missing required region ${region}` });
  }
}

function validateParts(
  topology: CanonicalTopology,
  vertexCount: number,
  issues: CanonicalValidationIssue[],
): void {
  const names = new Set(topology.parts.map((p) => p.name));
  for (const name of REQUIRED_CANONICAL_PARTS) {
    if (!names.has(name))
      issues.push({ code: 'missing-part', message: `missing required part ${name}` });
  }
  for (const part of topology.parts)
    validatePart(part, vertexCount, topology.indices.length, issues);
  for (let i = 0; i < topology.parts.length; i++) {
    for (let j = i + 1; j < topology.parts.length; j++) {
      if (
        overlap(
          topology.parts[i].vertexStart,
          topology.parts[i].vertexCount,
          topology.parts[j].vertexStart,
          topology.parts[j].vertexCount,
        )
      ) {
        issues.push({
          code: 'part-vertex-range-overlap',
          message: `part ${topology.parts[i].name} overlaps part ${topology.parts[j].name}`,
        });
      }
      if (
        overlap(
          topology.parts[i].indexStart,
          topology.parts[i].indexCount,
          topology.parts[j].indexStart,
          topology.parts[j].indexCount,
        )
      ) {
        issues.push({
          code: 'part-index-range-overlap',
          message: `part ${topology.parts[i].name} overlaps index range of part ${topology.parts[j].name}`,
        });
      }
    }
    validatePartRegionCoverage(topology, topology.parts[i], issues);
  }
}

function validatePart(
  part: CanonicalTopologyPart,
  vertexCount: number,
  indexCount: number,
  issues: CanonicalValidationIssue[],
): void {
  if (
    part.vertexStart < 0 ||
    part.vertexCount <= 0 ||
    part.vertexStart + part.vertexCount > vertexCount
  ) {
    issues.push({
      code: 'part-vertex-range-out-of-bounds',
      message: `part ${part.name} has invalid vertex range`,
    });
  }
  if (
    part.indexStart < 0 ||
    part.indexCount <= 0 ||
    part.indexStart + part.indexCount > indexCount
  ) {
    issues.push({
      code: 'part-index-range-out-of-bounds',
      message: `part ${part.name} has invalid index range`,
    });
  }
}

function validatePartRegionCoverage(
  topology: CanonicalTopology,
  part: CanonicalTopologyPart,
  issues: CanonicalValidationIssue[],
): void {
  if (part.vertexStart < 0 || part.vertexStart + part.vertexCount > topology.vertices.length)
    return;
  for (let i = part.vertexStart; i < part.vertexStart + part.vertexCount; i++) {
    const v = topology.vertices[i];
    if (!v) {
      issues.push({
        code: 'part-vertex-missing',
        message: `part ${part.name} references missing vertex ${i}`,
      });
    } else if (v.region !== part.region) {
      issues.push({
        code: 'part-region-mismatch',
        message: `part ${part.name} region ${part.region} does not match vertex ${i} region ${v.region}`,
      });
    }
  }
}

function overlap(startA: number, countA: number, startB: number, countB: number): boolean {
  return startA < startB + countB && startB < startA + countA;
}

function regionNames(vertices: readonly CanonicalTopologyVertex[]): Set<RegionName> {
  const names = new Set<RegionName>();
  for (const v of vertices) names.add(v.region);
  return names;
}

function finite3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
