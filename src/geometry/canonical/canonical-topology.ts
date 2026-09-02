import { RegionName, PartKind } from './canonical-human.js';

export interface CanonicalTopologyVertex {
  id: number;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv: { u: number; v: number };
  region: RegionName;
  weights: Record<string, number>;
}

export interface CanonicalTopologyPart {
  name: string;
  kind: PartKind;
  region: RegionName;
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
}

export interface CanonicalTopology {
  vertices: readonly CanonicalTopologyVertex[];
  indices: Uint32Array;
  parts: readonly CanonicalTopologyPart[];
}
