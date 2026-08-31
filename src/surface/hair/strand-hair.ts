import { HumanDefinition } from "../../core/schema/human-definition";
import { Vec3, vec3 } from "../../core/math/vec";
import { CanonicalHuman, Vertex } from "../../geometry/canonical/canonical-human";

export interface HairStrandPoint {
  position: Vec3;
  radius: number;
}

export interface HairStrand {
  id: number;
  rootVertexId: number;
  points: HairStrandPoint[];
}

export interface StrandHairGeometry {
  strands: HairStrand[];
  color: [number, number, number];
}

export interface StrandHairOptions {
  maxStrands?: number;
  segments?: number;
}

/**
 * Deterministic prototype strand-hair runtime. It samples stable scalp anchors
 * from the canonical head and expands HDL hair parameters into strand polylines.
 */
export function generateStrandHair(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  options: StrandHairOptions = {}
): StrandHairGeometry {
  const maxStrands = Math.max(0, Math.floor(options.maxStrands ?? 96));
  const segments = Math.max(2, Math.floor(options.segments ?? 5));
  const length = definition.get("hair.length");
  const density = definition.get("hair.density");
  const curl = definition.get("hair.curl");
  const gray = definition.get("hair.gray");
  const color = mixColor(
    [definition.get("hair.colorR"), definition.get("hair.colorG"), definition.get("hair.colorB")],
    [0.62, 0.62, 0.62],
    gray
  );

  if (length <= 0 || density <= 0 || maxStrands === 0) return { strands: [], color };

  const anchors = scalpAnchors(canonical);
  const count = Math.min(anchors.length, Math.max(1, Math.round(maxStrands * density)));
  const strands: HairStrand[] = [];
  for (let i = 0; i < count; i++) {
    const anchor = anchors[Math.floor((i * anchors.length) / count)];
    strands.push(makeStrand(i, anchor, length, curl, segments));
  }
  return { strands, color };
}

export function countHairVertices(hair: StrandHairGeometry): number {
  return hair.strands.reduce((sum, strand) => sum + strand.points.length, 0);
}

function scalpAnchors(canonical: CanonicalHuman): Vertex[] {
  const head = canonical.vertices.filter((v) => v.region === "head" && v.position.y >= 1.85);
  return head.sort((a, b) => a.id - b.id);
}

function makeStrand(id: number, root: Vertex, length: number, curl: number, segments: number): HairStrand {
  const points: HairStrandPoint[] = [];
  const rootPos = root.position;
  const side = Math.sign(rootPos.x) || (id % 2 === 0 ? -1 : 1);
  const back = rootPos.z < 0 ? -1 : 0.35;
  const worldLength = 0.08 + length * 0.42;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const curlWave = Math.sin((t * Math.PI * 2) + id * 1.618) * curl * 0.045 * t;
    const fall = worldLength * t;
    points.push({
      position: vec3(
        rootPos.x + side * curlWave,
        rootPos.y - fall,
        rootPos.z + back * curlWave
      ),
      radius: 0.004 * (1 - t) + 0.001 * t,
    });
  }
  return { id, rootVertexId: root.id, points };
}

function mixColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, t));
  return [
    a[0] * (1 - f) + b[0] * f,
    a[1] * (1 - f) + b[1] * f,
    a[2] * (1 - f) + b[2] * f,
  ];
}
