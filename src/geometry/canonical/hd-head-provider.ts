import type { Vec3 } from '../../core/math/vec.js';
import type {
  CanonicalTopology,
  CanonicalTopologyPart,
  CanonicalTopologyVertex,
} from './canonical-topology.js';
import type { RegionName, PartKind } from './canonical-human.js';
import { REQUIRED_HD_HEAD_REGIONS, REQUIRED_HD_BODY_REGIONS } from './regions.js';
import { validateCanonicalTopology } from './canonical-validator.js';
import type {
  CanonicalHumanAsset,
  CanonicalHumanProvider,
  CanonicalValidationResult,
} from './canonical-provider.js';
import type { HumanLandmark } from './landmark.js';
import { buildHdBodyManifold } from './hd-body-manifold.js';

/** Coordinate frame shared with the block human's skeleton (head bone ~y1.86). */
export interface HdHeadOptions {
  headBone?: string;
  neckBone?: string;
  rings?: number;
  segments?: number;
}

interface GenGeometry {
  positions: Vec3[];
  normals: Vec3[];
  uvs: [number, number][];
  indices: number[];
}

/** Anatomical anchor points used to guarantee required-region coverage. */
const REGION_ANCHORS: Partial<Record<RegionName, { x: number; y: number; z: number }>> = {
  forehead: { x: 0, y: 1.99, z: 0.26 },
  temple_left: { x: -0.09, y: 1.9, z: 0.17 },
  temple_right: { x: 0.09, y: 1.9, z: 0.17 },
  eye_left: { x: -0.06, y: 1.9, z: 0.28 },
  eye_right: { x: 0.06, y: 1.9, z: 0.28 },
  upper_eyelid_left: { x: -0.06, y: 1.912, z: 0.27 },
  upper_eyelid_right: { x: 0.06, y: 1.912, z: 0.27 },
  lower_eyelid_left: { x: -0.06, y: 1.89, z: 0.26 },
  lower_eyelid_right: { x: 0.06, y: 1.89, z: 0.26 },
  nose_bridge: { x: 0, y: 1.87, z: 0.27 },
  nose_tip: { x: 0, y: 1.78, z: 0.3 },
  nose_alar_left: { x: -0.03, y: 1.77, z: 0.26 },
  nose_alar_right: { x: 0.03, y: 1.77, z: 0.26 },
  cheek_left: { x: -0.08, y: 1.82, z: 0.22 },
  cheek_right: { x: 0.08, y: 1.82, z: 0.22 },
  upper_lip: { x: 0, y: 1.735, z: 0.26 },
  lower_lip: { x: 0, y: 1.715, z: 0.25 },
  mouth_corner_left: { x: -0.03, y: 1.74, z: 0.24 },
  mouth_corner_right: { x: 0.03, y: 1.74, z: 0.24 },
  jaw_left: { x: -0.08, y: 1.72, z: 0.18 },
  jaw_right: { x: 0.08, y: 1.72, z: 0.18 },
  chin: { x: 0, y: 1.7, z: 0.24 },
  ear_left: { x: -0.11, y: 1.9, z: 0.16 },
  ear_right: { x: 0.11, y: 1.9, z: 0.16 },
  neck: { x: 0, y: 1.68, z: 0.18 },
};

/**
 * Procedural DAYTONA HD HUMAN V0.1 provider.
 *
 * Generates an anatomy-rich FULL-BODY topology from scratch: a parametric
 * cranium + face skin with fine-grained P4 head regions, real eye parts
 * (sclera / iris / pupil / separate cornea), teeth, tongue and mouth cavity,
 * plus a parametric torso + limb skin with the full HD body region vocabulary
 * and weighted skeleton skinning (pelvis / spine / chest / clavicle / limbs),
 * ~45 surface-relative landmarks and skeleton skin weights — all exposed
 * through the CanonicalHumanProvider seam so the Human runtime consumes it
 * exactly like the block human.
 */
export class HDCanonicalHumanProvider implements CanonicalHumanProvider {
  readonly version = 'DaytonaCanonicalHuman v0.1';
  private readonly headBone: string;
  private readonly neckBone: string;
  private readonly rings: number;
  private readonly segments: number;

  constructor(opts: HdHeadOptions = {}) {
    this.headBone = opts.headBone ?? 'head';
    this.neckBone = opts.neckBone ?? 'neck';
    this.rings = opts.rings ?? 18;
    this.segments = opts.segments ?? 20;
  }

  async load(): Promise<CanonicalHumanAsset> {
    const geometry = this.buildGeometry();
    const topology: CanonicalTopology = {
      vertices: geometry.vertices,
      indices: geometry.indices,
      parts: geometry.parts,
    };
    const canonical: CanonicalTopology = topology;
    return {
      version: this.version,
      topology: canonical,
      landmarks: this.buildLandmarks(canonical),
      metadata: {
        author: 'engine',
        note: 'procedural HD human (Daytona HD BODY V0.1)',
      },
    };
  }

  validate(): CanonicalValidationResult {
    // Synchronous build is cheap and deterministic; validate a sample asset.
    const asset = this.buildGeometry();
    const report = validateCanonicalTopology({
      vertices: asset.vertices,
      indices: asset.indices,
      parts: asset.parts,
    });
    // The strict canonical contract is expressed in the coarse vocabulary;
    // coarse aliases are synthesized over the HD fine regions, so the report
    // above must already be valid. We additionally assert the full HD head + HD
    // body fine vocabularies explicitly and surface every remaining issue.
    const present = new Set(asset.vertices.map((v) => v.region));
    const missing = [
      ...REQUIRED_HD_HEAD_REGIONS.filter((r) => !present.has(r)),
      ...REQUIRED_HD_BODY_REGIONS.filter((r) => !present.has(r)),
    ].map(
      (r) => ({ code: 'missing-hd-region', message: `missing required HD region ${r}` }) as const,
    );
    const issues = [...report.issues, ...missing];
    return { valid: report.valid && missing.length === 0, report, issues };
  }

  topologyVersion(): string {
    return 'hd-human-0.1';
  }

  // ------------------------------------------------------------------ mesh

  private buildGeometry(): {
    vertices: CanonicalTopologyVertex[];
    indices: Uint32Array;
    parts: CanonicalTopologyPart[];
  } {
    // HD BODY V0.2: clean-manifold parametric body FIRST so it renders as the
    // base body, then the HD head skin, then the detail parts (eyes/teeth/...).
    const body = buildHdBodyManifold({ neckY: 1.68 });
    const skin = this.buildSkin();
    const append = this.buildDetailParts();

    const vertices: CanonicalTopologyVertex[] = [
      ...body.vertices,
      ...skin.vertices,
      ...append.vertices,
    ];
    const indices = Uint32Array.from([...body.indices, ...skin.indices, ...append.indices]);

    // Stable vertex ids must equal the global index (the validator enforces this
    // and every consumer keys off index); re-number after concatenation.
    for (let i = 0; i < vertices.length; i++) vertices[i] = { ...vertices[i], id: i };

    const parts: CanonicalTopologyPart[] = append.partInfos.map((p, i) => ({
      name: p.name,
      kind: p.kind,
      region: p.region,
      vertexStart: body.vertices.length + skin.vertices.length + append.startShift[i],
      vertexCount: p.vertexCount,
      indexStart: body.indices.length + skin.indices.length + append.indexShift[i],
      indexCount: p.indexCount,
    }));

    return { vertices, indices, parts };
  }

  /** Parametric cranium + face skin with P4 region assignment. */
  private buildSkin(): {
    vertices: CanonicalTopologyVertex[];
    indices: Uint32Array;
  } {
    const R = this.rings;
    const S = this.segments;
    const yTop = 2.06;
    const yNeck = 1.68;

    // Vertices grid: row = ring (latitude), col = segment (azimuth).
    const count = (R + 1) * (S + 1);
    const positions: Vec3[] = new Array(count);
    const regions: RegionName[] = new Array(count);

    const idx = (i: number, j: number) => i * (S + 1) + j;

    for (let i = 0; i <= R; i++) {
      const t = i / R;
      const y = yTop - (yTop - yNeck) * t;
      const rx = this.rxAt(y);
      const rz = this.rzAt(y);
      const cz = this.czAt(y);
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        const x = rx * Math.cos(a);
        const z = cz + rz * Math.sin(a);
        positions[idx(i, j)] = { x, y, z };
        regions[idx(i, j)] = this.regionFor(y, x, z);
      }
    }

    // Smooth normals: average from ring tangents for an outward-facing surface.
    const normals: Vec3[] = new Array(count);
    for (let i = 0; i <= R; i++) {
      const y = positions[idx(i, 0)].y;
      const cz = this.czAt(y);
      for (let j = 0; j <= S; j++) {
        const p = positions[idx(i, j)];
        const radial = { x: p.x, y: 0, z: p.z - cz };
        const rl = Math.hypot(radial.x, radial.z) || 1e-6;
        let n = { x: radial.x / rl, y: 0, z: radial.z / rl };
        if (i === 0) {
          n = { x: 0, y: 1, z: 0 };
        } else if (i === R) {
          n = { x: 0, y: -1, z: 0 };
        }
        normals[idx(i, j)] = n;
      }
    }

    // Indices: quads between consecutive rings/segments.
    const indices: number[] = [];
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < S; j++) {
        const a = idx(i, j);
        const b = idx(i, j + 1);
        const c = idx(i + 1, j);
        const d = idx(i + 1, j + 1);
        indices.push(a, c, b, b, c, d);
      }
    }

    const vertices: CanonicalTopologyVertex[] = new Array(count);
    for (let i = 0; i < count; i++) {
      vertices[i] = {
        id: i,
        position: { ...positions[i] },
        normal: { ...normals[i] },
        uv: { u: (i % (S + 1)) / S, v: Math.floor(i / (S + 1)) / R },
        region: regions[i],
        weights: this.skinWeights(regions[i]),
      };
    }

    // Guarantee the full HD region vocabulary is present even when a thin
    // region band falls between sampled rings. Deterministic and cheap.
    this.ensureRequiredRegions(vertices, positions);

    return { vertices, indices: Uint32Array.from(indices) };
  }

  /**
   * For any required HD head region the sampling missed, force the vertex
   * nearest to a sensible anatomical anchor into that region. Guarantees the
   * semantic vocabulary is non-empty without depending on mesh density.
   */
  private ensureRequiredRegions(vertices: CanonicalTopologyVertex[], positions: Vec3[]): void {
    const present = new Set(vertices.map((v) => v.region));
    const missing = REQUIRED_HD_HEAD_REGIONS.filter((r) => !present.has(r));
    for (const region of missing) {
      const anchor = REGION_ANCHORS[region];
      if (!anchor) continue;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < vertices.length; i++) {
        const p = positions[i];
        const d = (p.x - anchor.x) ** 2 + (p.y - anchor.y) ** 2 + (p.z - anchor.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) vertices[best] = { ...vertices[best], region };
    }
  }

  private skinWeights(region: RegionName): Record<string, number> {
    if (region === 'neck') return { [this.neckBone]: 1.0 };
    // Facial skinned connection (P15): lower-face regions blend head↔jaw so
    // jaw rotation visibly deforms lips/chin while the upper face stays rigid.
    if (region === 'jaw_left' || region === 'jaw_right' || region === 'chin') {
      return { [this.headBone]: 0.45, jaw: 0.55 };
    }
    if (
      region === 'upper_lip' ||
      region === 'lower_lip' ||
      region === 'mouth_corner_left' ||
      region === 'mouth_corner_right'
    ) {
      return { [this.headBone]: 0.6, jaw: 0.4 };
    }
    return { [this.headBone]: 1.0 };
  }

  private rxAt(y: number): number {
    if (y > 1.98) return 0.1 + (y - 1.98) * 0.02;
    return 0.11 - Math.max(0, 1.95 - y) * 0.0 - Math.max(0, 1.7 - y) * 0.0;
  }

  private rzAt(y: number): number {
    if (y >= 1.9) return 0.125 - Math.max(0, y - 1.9) * 0.06;
    return 0.125 - Math.max(0, 1.9 - y) * 0.14;
  }

  private czAt(_y: number): number {
    return 0.2;
  }

  /** Assign fine-grained P4 semantic regions from local geometry. */
  private regionFor(y: number, x: number, z: number): RegionName {
    // Back / crown cranium (z behind face plane) → coarse 'head'.
    if (z < 0.2) {
      if (y > 1.72 && y < 1.96 && Math.abs(x) > 0.075 && Math.abs(x) < 0.115 && z < 0.155) {
        return x < 0 ? 'ear_left' : 'ear_right';
      }
      return 'head';
    }
    const front = z - 0.2; // 0 at face plane, + forward
    const ay = Math.abs(y - 1.9); // distance from eye height

    // Forehead.
    if (y > 1.95) {
      if (Math.abs(x) < 0.05) return 'forehead';
      return 'head';
    }
    // Eye band: central disc → eye_left/right, top/bottom → upper/lower eyelids.
    // Must be checked before temples so the eye area is not swallowed.
    if (ay <= 0.02 && Math.abs(x) >= 0.03 && Math.abs(x) <= 0.095 && front > 0.02) {
      const side = x < 0 ? 'l' : 'r';
      const distFromCenter = Math.abs(Math.abs(x) - 0.06);
      if (distFromCenter <= 0.015) {
        const dy = y - 1.9;
        if (dy > 0.007) return `upper_eyelid_${side}` as RegionName;
        if (dy < -0.007) return `lower_eyelid_${side}` as RegionName;
        return side === 'l' ? 'eye_left' : 'eye_right';
      }
    }
    // Temples (upper side-front), outside the eye disc.
    if (y > 1.86 && y <= 1.92 && Math.abs(x) >= 0.065) {
      return x < 0 ? 'temple_left' : 'temple_right';
    }
    // Nose bridge (front center, mid face).
    if (Math.abs(x) < 0.017 && y >= 1.82 && y < 1.95) {
      return 'nose_bridge';
    }
    // Nose tip + alars (around y1.78 front).
    if (Math.abs(x) < 0.017 && y >= 1.74 && y < 1.82) {
      return 'nose_tip';
    }
    if (Math.abs(x) >= 0.017 && Math.abs(x) < 0.05 && y >= 1.74 && y < 1.82) {
      return x < 0 ? 'nose_alar_left' : 'nose_alar_right';
    }
    // Cheeks (mid face, lateral).
    if (y >= 1.76 && y < 1.9 && Math.abs(x) >= 0.03) {
      if (Math.abs(x) > 0.09) return x < 0 ? 'cheek_left' : 'cheek_right';
      return x < 0 ? 'cheek_left' : 'cheek_right';
    }
    // Upper lip.
    if (Math.abs(x) <= 0.035 && y >= 1.7 && y < 1.75) {
      if (Math.abs(x) > 0.023) {
        return x < 0 ? 'mouth_corner_left' : 'mouth_corner_right';
      }
      const lipSplit = 1.725;
      return y >= lipSplit ? 'lower_lip' : 'upper_lip';
    }
    // Jaw downward corners.
    if (Math.abs(x) >= 0.03 && Math.abs(x) <= 0.1 && y < 1.76) {
      if (y < 1.7) return x < 0 ? 'jaw_left' : 'jaw_right';
      return x < 0 ? 'jaw_left' : 'jaw_right';
    }
    // Chin (front center, low).
    if (Math.abs(x) < 0.035 && y < 1.7) return 'chin';
    // Neck collar.
    if (y <= 1.7) return 'neck';

    return 'head';
  }

  // ----------------------------------------------------------------- parts

  /** Detailed parts: eyes (sclera/iris/pupil/cornea), teeth, tongue, cavity. */
  private buildDetailParts(): {
    vertices: CanonicalTopologyVertex[];
    indices: number[];
    partInfos: Array<{
      name: string;
      kind: PartKind;
      region: RegionName;
      vertexCount: number;
      indexCount: number;
    }>;
    startShift: number[];
    indexShift: number[];
  } {
    const vertices: CanonicalTopologyVertex[] = [];
    const indices: number[] = [];
    const partInfos: Array<{
      name: string;
      kind: PartKind;
      region: RegionName;
      vertexCount: number;
      indexCount: number;
    }> = [];
    const startShift: number[] = [];
    const indexShift: number[] = [];

    const appendPart = (
      name: string,
      kind: PartKind,
      region: RegionName,
      gen: GenGeometry,
    ) => {
      const v0 = vertices.length;
      const i0 = indices.length;
      for (let vi = 0; vi < gen.positions.length; vi++) {
        vertices.push({
          id: v0 + vi,
          position: { ...gen.positions[vi] },
          normal: { ...gen.normals[vi] },
          uv: { u: gen.uvs[vi][0], v: gen.uvs[vi][1] },
          region,
          weights: { [this.headBone]: 1.0 },
        });
      }
      for (const gi of gen.indices) indices.push(v0 + gi);
      partInfos.push({
        name,
        kind,
        region,
        vertexCount: gen.positions.length,
        indexCount: gen.indices.length,
      });
      startShift.push(v0);
      indexShift.push(i0);
    };

    for (const side of [-1, 1] as const) {
      const cx = side * 0.06;
      const ey = 1.9;
      const ez = 0.2;
      appendPart(
        side < 0 ? 'eye_l' : 'eye_r',
        'sclera',
        'eye_sclera',
        sphere(cx, ey, ez, 0.034, 8, 12),
      );
      appendPart(
        side < 0 ? 'iris_l' : 'iris_r',
        'iris',
        'eye_iris',
        disc(cx, ey, ez + 0.005, 0.016),
      );
      appendPart(
        side < 0 ? 'pupil_l' : 'pupil_r',
        'iris',
        'eye_iris',
        disc(cx, ey, ez + 0.008, 0.0075),
      );
      // Limbus: the ring where the transparent cornea meets the sclera, and
      // the iris/sclera boundary. A shallow annulus/cone produces the dark
      // transition ring characteristic of the eye.
      appendPart(
        side < 0 ? 'limbus_l' : 'limbus_r',
        'limbus',
        'eye_iris',
        limbus(cx, ey, ez + 0.006, 0.0195, 0.016, 12),
      );
      // Separate cornea dome (transparent surface over the iris). Marked with
      // kind 'cornea' so the renderer can apply optical refraction (IOR) and
      // corneal specular.
      appendPart(
        side < 0 ? 'cornea_l' : 'cornea_r',
        'cornea',
        'cornea',
        dome(cx, ey, ez, 0.036, 0.022),
      );
    }

    appendPart('teeth_upper', 'teeth', 'teeth', box(0, 1.805, 0.24, 0.05, 0.02, 0.02));
    appendPart('teeth_lower', 'teeth', 'teeth', box(0, 1.775, 0.24, 0.05, 0.02, 0.02));
    appendPart('tongue', 'tongue', 'tongue', box(0, 1.785, 0.23, 0.035, 0.012, 0.03));
    appendPart('mouth_cavity', 'mouth_cavity', 'mouth_cavity', dome(0, 1.79, 0.19, 0.05, 0.05));

    return { vertices, indices, partInfos, startShift, indexShift };
  }

  // -------------------------------------------------------------- landmarks

  private buildLandmarks(topology: CanonicalTopology): HumanLandmark[] {
    const targets: Array<{ name: string; region: RegionName; x: number; y: number; z: number }> = [
      { name: 'head_top', region: 'forehead', x: 0, y: 2.06, z: 0.2 },
      { name: 'eye_left_center', region: 'eye_left', x: -0.06, y: 1.9, z: 0.22 },
      { name: 'eye_right_center', region: 'eye_right', x: 0.06, y: 1.9, z: 0.22 },
      { name: 'nose_bridge', region: 'nose_bridge', x: 0, y: 1.86, z: 0.28 },
      { name: 'nose_tip', region: 'nose_tip', x: 0, y: 1.78, z: 0.3 },
      { name: 'nose_alar_left', region: 'nose_alar_left', x: -0.03, y: 1.77, z: 0.26 },
      { name: 'nose_alar_right', region: 'nose_alar_right', x: 0.03, y: 1.77, z: 0.26 },
      { name: 'mouth_center', region: 'upper_lip', x: 0, y: 1.742, z: 0.26 },
      { name: 'mouth_corner_left', region: 'mouth_corner_left', x: -0.03, y: 1.74, z: 0.24 },
      { name: 'mouth_corner_right', region: 'mouth_corner_right', x: 0.03, y: 1.74, z: 0.24 },
      { name: 'chin', region: 'chin', x: 0, y: 1.7, z: 0.24 },
      { name: 'jaw_angle_left', region: 'jaw_left', x: -0.08, y: 1.72, z: 0.18 },
      { name: 'jaw_angle_right', region: 'jaw_right', x: 0.08, y: 1.72, z: 0.18 },
      { name: 'cheek_left', region: 'cheek_left', x: -0.08, y: 1.82, z: 0.22 },
      { name: 'cheek_right', region: 'cheek_right', x: 0.08, y: 1.82, z: 0.22 },
      { name: 'ear_left_center', region: 'ear_left', x: -0.11, y: 1.9, z: 0.16 },
      { name: 'ear_right_center', region: 'ear_right', x: 0.11, y: 1.9, z: 0.16 },
      { name: 'forehead', region: 'forehead', x: 0, y: 1.98, z: 0.26 },
      { name: 'upper_lip', region: 'upper_lip', x: 0, y: 1.735, z: 0.26 },
      { name: 'lower_lip', region: 'lower_lip', x: 0, y: 1.715, z: 0.25 },
      { name: 'temple_left', region: 'temple_left', x: -0.09, y: 1.9, z: 0.16 },
      { name: 'temple_right', region: 'temple_right', x: 0.09, y: 1.9, z: 0.16 },
      { name: 'neck_front', region: 'neck', x: 0, y: 1.68, z: 0.18 },
      // HD BODY V0.1 landmarks.
      { name: 'chest_center', region: 'chest', x: 0, y: 1.42, z: 0.1 },
      { name: 'abdomen_center', region: 'abdomen', x: 0, y: 1.18, z: 0.098 },
      { name: 'pelvis_center', region: 'pelvis', x: 0, y: 0.97, z: 0.1 },
      { name: 'shoulder_left', region: 'shoulder_left', x: -0.18, y: 1.58, z: 0.02 },
      { name: 'shoulder_right', region: 'shoulder_right', x: 0.18, y: 1.58, z: 0.02 },
      { name: 'upper_arm_left', region: 'upper_arm_left', x: -0.24, y: 1.4, z: 0 },
      { name: 'upper_arm_right', region: 'upper_arm_right', x: 0.24, y: 1.4, z: 0 },
      { name: 'forearm_left', region: 'forearm_left', x: -0.23, y: 1.05, z: 0 },
      { name: 'forearm_right', region: 'forearm_right', x: 0.23, y: 1.05, z: 0 },
      { name: 'hand_left', region: 'hand_left', x: -0.22, y: 0.92, z: 0 },
      { name: 'hand_right', region: 'hand_right', x: 0.22, y: 0.92, z: 0 },
      { name: 'thigh_left', region: 'thigh_left', x: -0.09, y: 0.78, z: 0.01 },
      { name: 'thigh_right', region: 'thigh_right', x: 0.09, y: 0.78, z: 0.01 },
      { name: 'shin_left', region: 'shin_left', x: -0.08, y: 0.4, z: 0.01 },
      { name: 'shin_right', region: 'shin_right', x: 0.08, y: 0.4, z: 0.01 },
      { name: 'foot_left', region: 'foot_left', x: -0.09, y: 0.1, z: 0.08 },
      { name: 'foot_right', region: 'foot_right', x: 0.09, y: 0.1, z: 0.08 },
    ];

    const landmarks: HumanLandmark[] = [];
    for (const t of targets) {
      const tri = this.landmarkTriangle(topology, t.region, { x: t.x, y: t.y, z: t.z });
      if (tri < 0) continue;
      landmarks.push({
        id: landmarks.length,
        name: t.name,
        triangleId: tri,
        barycentric: [1, 0, 0],
        normalOffset: 0.001,
      });
    }
    return landmarks;
  }

  private landmarkTriangle(
    topology: CanonicalTopology,
    region: RegionName,
    target: { x: number; y: number; z: number },
  ): number {
    let best = -1;
    let bestId = -1;
    let bestD = Infinity;
    for (let vi = 0; vi < topology.vertices.length; vi++) {
      const v = topology.vertices[vi];
      if (v.region !== region) continue;
      const d =
        (v.position.x - target.x) ** 2 +
        (v.position.y - target.y) ** 2 +
        (v.position.z - target.z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestId = vi;
      }
    }
    if (bestId < 0) return -1;
    for (let t = 0; t * 3 + 2 < topology.indices.length; t++) {
      const a = topology.indices[t * 3];
      if (a === bestId) {
        best = t;
        break;
      }
    }
    return best;
  }
}

// ------------------------------------------------------------------ helpers

function sphere(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  stacks: number,
  slices: number,
): { positions: Vec3[]; normals: Vec3[]; uvs: [number, number][]; indices: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    const y = Math.cos(phi);
    const rr = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const theta = (j / slices) * Math.PI * 2;
      const x = rr * Math.cos(theta);
      const z = rr * Math.sin(theta);
      positions.push({ x: cx + x * r, y: cy + y * r, z: cz + z * r });
      normals.push({ x, y, z });
      uvs.push([j / slices, i / stacks]);
      if (i < stacks && j < slices) {
        const a = i * (slices + 1) + j;
        const b = a + slices + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  return { positions, normals, uvs, indices };
}

function disc(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  stacks: number = 2,
  slices: number = 14,
): { positions: Vec3[]; normals: Vec3[]; uvs: [number, number][]; indices: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  positions.push({ x: cx, y: cy, z: cz });
  normals.push({ x: 0, y: 0, z: 1 });
  uvs.push([0.5, 0.5]);
  for (let i = 0; i <= slices; i++) {
    const a = (i / slices) * Math.PI * 2;
    positions.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: cz });
    normals.push({ x: 0, y: 0, z: 1 });
    uvs.push([(Math.cos(a) + 1) / 2, (Math.sin(a) + 1) / 2]);
    if (i < slices) {
      indices.push(0, i + 1, i + 2);
    }
  }
  void stacks;
  return { positions, normals, uvs, indices };
}

function dome(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  height: number,
  stacks: number = 3,
  slices: number = 14,
): { positions: Vec3[]; normals: Vec3[]; uvs: [number, number][]; indices: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  for (let i = 0; i <= stacks; i++) {
    const t = i / stacks;
    const vert = Math.sin((t * Math.PI) / 2); // 0 at base -> 1 at cap
    const ringR = Math.cos((t * Math.PI) / 2) * r;
    const yOff = t * height;
    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * Math.PI * 2;
      const x = Math.cos(a) * ringR;
      const z = Math.sin(a) * ringR;
      positions.push({ x: cx + x, y: cy + yOff, z: cz + z });
      const n = { x: x / r, y: vert, z: z / r };
      normals.push(n);
      uvs.push([j / slices, t]);
      if (i < stacks && j < slices) {
        const a0 = i * (slices + 1) + j;
        const b0 = a0 + slices + 1;
        indices.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    }
  }
  return { positions, normals, uvs, indices };
}

/**
 * Limbus ring: a flat annular band (outerRadius > innerRadius) at the iris
 * boundary, giving the darker transition ring where cornea meets sclera.
 */
function limbus(
  cx: number,
  cy: number,
  cz: number,
  outerRadius: number,
  innerRadius: number,
  slices: number = 14,
): { positions: Vec3[]; normals: Vec3[]; uvs: [number, number][]; indices: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];

  // Inner ring
  for (let i = 0; i < slices; i++) {
    const a = (i / slices) * Math.PI * 2;
    positions.push({
      x: cx + Math.cos(a) * innerRadius,
      y: cy + Math.sin(a) * innerRadius,
      z: cz,
    });
    normals.push({ x: 0, y: 0, z: 1 });
    uvs.push([(Math.cos(a) + 1) / 2, (Math.sin(a) + 1) / 2]);
  }
  // Outer ring
  for (let i = 0; i < slices; i++) {
    const a = (i / slices) * Math.PI * 2;
    positions.push({
      x: cx + Math.cos(a) * outerRadius,
      y: cy + Math.sin(a) * outerRadius,
      z: cz,
    });
    normals.push({ x: 0, y: 0, z: 1 });
    uvs.push([(Math.cos(a) + 1) / 2, (Math.sin(a) + 1) / 2]);
  }
  for (let i = 0; i < slices; i++) {
    const i0 = i;
    const i1 = (i + 1) % slices;
    const o0 = slices + i;
    const o1 = slices + ((i + 1) % slices);
    indices.push(i0, o0, o1, i0, o1, i1);
  }
  return { positions, normals, uvs, indices };
}

function box(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): { positions: Vec3[]; normals: Vec3[]; uvs: [number, number][]; indices: number[] } {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const half = { x: sx / 2, y: sy / 2, z: sz / 2 };
  const corners: Array<[number, number, number]> = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
  ];
  for (const c of corners) {
    positions.push({ x: cx + c[0] * half.x, y: cy + c[1] * half.y, z: cz + c[2] * half.z });
    const n = { x: c[0], y: c[1], z: c[2] };
    normals.push(n);
    uvs.push([(c[0] + 1) / 2, (c[1] + 1) / 2]);
  }
  const faces: Array<[number, number, number, number]> = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [3, 2, 6, 7],
    [1, 2, 6, 5],
    [0, 3, 7, 4],
  ];
  for (const [a, b, c, d] of faces) indices.push(a, b, c, a, c, d);
  return { positions, normals, uvs, indices };
}
