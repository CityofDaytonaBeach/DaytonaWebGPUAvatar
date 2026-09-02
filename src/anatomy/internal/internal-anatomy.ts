import { BoneDef } from "../skeleton/skeleton";
import { AnatomyDimensions } from "../parametric/parametric-anatomy";
import { Vec3, vec3 } from "../../core/math/vec";

// ---------------------------------------------------------------------------
// Types – existing
// ---------------------------------------------------------------------------

export type InternalAnatomyMode = "normal" | "skeleton" | "muscle" | "anatomy" | "transparentSkin";
export type InternalAnatomyPrimitiveKind = "joint" | "bone" | "muscle";

export interface InternalAnatomyPrimitive {
  kind: InternalAnatomyPrimitiveKind;
  name: string;
  a: Vec3;
  b?: Vec3;
  radius: number;
  color: [number, number, number];
}

export interface InternalAnatomyView {
  mode: InternalAnatomyMode;
  showSkin: boolean;
  skinOpacity: number;
  primitives: InternalAnatomyPrimitive[];
}

// ---------------------------------------------------------------------------
// Types – new: organ system modes
// ---------------------------------------------------------------------------

export type OrganSystemMode =
  | "skeletal"
  | "muscular"
  | "circulatory"
  | "nervous";

export const ORGAN_SYSTEM_COLORS: Record<OrganSystemMode, [number, number, number]> = {
  skeletal: [0.9, 0.86, 0.72],
  muscular: [0.78, 0.12, 0.1],
  circulatory: [0.6, 0.05, 0.05],
  nervous: [0.85, 0.85, 0.2],
};

// ---------------------------------------------------------------------------
// Types – rendering data (GPU-uploadable flat arrays)
// ---------------------------------------------------------------------------

export interface InternalAnatomyRenderData {
  count: number;
  positions: Float32Array;
  colors: Float32Array;
  radii: Float32Array;
}

// ---------------------------------------------------------------------------
// Types – volume estimation
// ---------------------------------------------------------------------------

export interface PrimitiveVolume {
  name: string;
  kind: InternalAnatomyPrimitiveKind;
  volume: number;
}

// ---------------------------------------------------------------------------
// Types – joint visualization
// ---------------------------------------------------------------------------

export type JointMarkerShape = "sphere" | "cone";

export interface JointVisualization {
  name: string;
  position: Vec3;
  shape: JointMarkerShape;
  radius: number;
  color: [number, number, number];
}

// ---------------------------------------------------------------------------
// Types – fracture visualization
// ---------------------------------------------------------------------------

export interface BoneFracture {
  boneName: string;
  fracturePoint: Vec3;
  severity: number;
  displacement: Vec3;
}

export interface FractureVisualization {
  fracture: BoneFracture;
  visual: InternalAnatomyPrimitive;
}

// ---------------------------------------------------------------------------
// Types – muscle activation
// ---------------------------------------------------------------------------

export interface MuscleActivation {
  muscleName: string;
  activation: number;
}

// ---------------------------------------------------------------------------
// Types – heatmap overlay
// ---------------------------------------------------------------------------

export interface HeatmapSample {
  worldPosition: Vec3;
  value: number;
}

export interface HeatmapOverlay {
  samples: HeatmapSample[];
  min: number;
  max: number;
  colors: [number, number, number][];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKELETON_COLOR: [number, number, number] = [0.9, 0.86, 0.72];
const JOINT_COLOR: [number, number, number] = [0.95, 0.9, 0.78];
const MUSCLE_COLOR: [number, number, number] = [0.78, 0.12, 0.1];

const CIRCULATORY_COLOR: [number, number, number] = [0.6, 0.05, 0.05];
const NERVOUS_COLOR: [number, number, number] = [0.85, 0.85, 0.2];

const VOLUME_CYLINDER_FACTOR = Math.PI;
const VOLUME_SPHERE_FACTOR = (4 / 3) * Math.PI;

const HEATMAP_DEFAULT_COLORS: [number, number, number][] = [
  [0.0, 0.0, 1.0],
  [0.0, 1.0, 0.0],
  [1.0, 1.0, 0.0],
  [1.0, 0.0, 0.0],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function worldJoints(skeleton: BoneDef[]): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const bone of skeleton) {
    const parent = bone.parent ? out.get(bone.parent) ?? vec3() : vec3();
    out.set(bone.name, offset(parent, bone.localPosition.x, bone.localPosition.y, bone.localPosition.z));
  }
  return out;
}

function offset(v: Vec3, x: number, y: number, z: number): Vec3 {
  return vec3(v.x + x, v.y + y, v.z + z);
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  );
}

function distance3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// Existing: buildInternalAnatomyView (enhanced with organ systems)
// ---------------------------------------------------------------------------

/**
 * Deterministic internal-anatomy prototype. It derives skeleton and major muscle
 * display primitives from the same parametric anatomy/skeleton used by skinning,
 * so anatomy modes remain modular and never become the source of character truth.
 */
export function buildInternalAnatomyView(
  dims: AnatomyDimensions,
  skeleton: BoneDef[],
  mode: InternalAnatomyMode = "anatomy",
): InternalAnatomyView {
  if (mode === "normal") {
    return { mode, showSkin: true, skinOpacity: 1, primitives: [] };
  }

  const joints = worldJoints(skeleton);
  const primitives: InternalAnatomyPrimitive[] = [];
  const includeSkeleton = mode === "skeleton" || mode === "anatomy" || mode === "transparentSkin";
  const includeMuscle = mode === "muscle" || mode === "anatomy";

  if (includeSkeleton) {
    for (const bone of skeleton) {
      const a = joints.get(bone.name);
      if (!a) continue;
      primitives.push({ kind: "joint", name: `${bone.name}.joint`, a, radius: dims.height * 0.012, color: JOINT_COLOR });
      if (!bone.parent) continue;
      const parent = joints.get(bone.parent);
      if (!parent) continue;
      primitives.push({ kind: "bone", name: `${bone.parent}->${bone.name}`, a: parent, b: a, radius: dims.height * 0.008, color: SKELETON_COLOR });
    }
  }

  if (includeMuscle) {
    addMuscles(primitives, dims, joints);
  }

  return {
    mode,
    showSkin: mode === "transparentSkin",
    skinOpacity: mode === "transparentSkin" ? 0.28 : 0,
    primitives,
  };
}

function addMuscles(primitives: InternalAnatomyPrimitive[], dims: AnatomyDimensions, joints: Map<string, Vec3>): void {
  const joint = (name: string) => joints.get(name) ?? vec3();
  const muscle = (name: string, a: Vec3, b: Vec3, radius: number) => {
    primitives.push({ kind: "muscle", name, a, b, radius, color: MUSCLE_COLOR });
  };

  const armRadius = dims.height * (0.022 + dims.chestHalfWidth * 0.025);
  const legRadius = dims.height * (0.03 + dims.hipHalfWidth * 0.02);
  muscle("pectoralis_l", offset(joint("chest"), -dims.chestHalfWidth * 0.35, 0, 0.02), joint("upperarm_l"), dims.height * 0.035);
  muscle("pectoralis_r", offset(joint("chest"), dims.chestHalfWidth * 0.35, 0, 0.02), joint("upperarm_r"), dims.height * 0.035);
  muscle("biceps_l", joint("upperarm_l"), joint("forearm_l"), armRadius);
  muscle("biceps_r", joint("upperarm_r"), joint("forearm_r"), armRadius);
  muscle("forearm_flexors_l", joint("forearm_l"), joint("hand_l"), armRadius * 0.78);
  muscle("forearm_flexors_r", joint("forearm_r"), joint("hand_r"), armRadius * 0.78);
  muscle("quadriceps_l", joint("thigh_l"), joint("shin_l"), legRadius);
  muscle("quadriceps_r", joint("thigh_r"), joint("shin_r"), legRadius);
  muscle("calf_l", joint("shin_l"), joint("foot_l"), legRadius * 0.72);
  muscle("calf_r", joint("shin_r"), joint("foot_r"), legRadius * 0.72);
}

// ---------------------------------------------------------------------------
// New: organ system view
// ---------------------------------------------------------------------------

export function buildOrganSystemView(
  dims: AnatomyDimensions,
  skeleton: BoneDef[],
  system: OrganSystemMode,
): InternalAnatomyView {
  const joints = worldJoints(skeleton);
  const primitives: InternalAnatomyPrimitive[] = [];
  const color = ORGAN_SYSTEM_COLORS[system];

  if (system === "skeletal") {
    for (const bone of skeleton) {
      const a = joints.get(bone.name);
      if (!a) continue;
      primitives.push({ kind: "joint", name: `${bone.name}.joint`, a, radius: dims.height * 0.012, color });
      if (!bone.parent) continue;
      const parent = joints.get(bone.parent);
      if (!parent) continue;
      primitives.push({ kind: "bone", name: `${bone.parent}->${bone.name}`, a: parent, b: a, radius: dims.height * 0.008, color });
    }
  } else if (system === "muscular") {
    addMuscles(primitives, dims, joints);
    for (const p of primitives) p.color = color;
  } else if (system === "circulatory") {
    addCirculatory(primitives, dims, joints, color);
  } else if (system === "nervous") {
    addNervous(primitives, dims, joints, color);
  }

  return {
    mode: "anatomy",
    showSkin: false,
    skinOpacity: 0,
    primitives,
  };
}

function addCirculatory(
  primitives: InternalAnatomyPrimitive[],
  dims: AnatomyDimensions,
  joints: Map<string, Vec3>,
  color: [number, number, number],
): void {
  const joint = (name: string) => joints.get(name) ?? vec3();
  const heartPos = offset(joint("chest"), 0, dims.height * 0.04, dims.torsoHalfDepth * 0.3);
  primitives.push({ kind: "joint", name: "heart", a: heartPos, radius: dims.height * 0.028, color });

  const vesselR = dims.height * 0.004;
  primitives.push({ kind: "bone", name: "aorta", a: heartPos, b: offset(heartPos, 0, -dims.height * 0.15, 0), radius: vesselR, color });
  primitives.push({ kind: "bone", name: "carotid_l", a: heartPos, b: offset(joint("neck"), -0.02, dims.height * 0.06, 0), radius: vesselR * 0.6, color });
  primitives.push({ kind: "bone", name: "carotid_r", a: heartPos, b: offset(joint("neck"), 0.02, dims.height * 0.06, 0), radius: vesselR * 0.6, color });
  primitives.push({ kind: "bone", name: "femoral_l", a: joint("thigh_l"), b: joint("shin_l"), radius: vesselR * 0.8, color });
  primitives.push({ kind: "bone", name: "femoral_r", a: joint("thigh_r"), b: joint("shin_r"), radius: vesselR * 0.8, color });
}

function addNervous(
  primitives: InternalAnatomyPrimitive[],
  dims: AnatomyDimensions,
  joints: Map<string, Vec3>,
  color: [number, number, number],
): void {
  const joint = (name: string) => joints.get(name) ?? vec3();
  const brainPos = offset(joint("head"), 0, dims.height * 0.04, 0);
  primitives.push({ kind: "joint", name: "brain", a: brainPos, radius: dims.height * 0.035, color });

  const nerveR = dims.height * 0.003;
  const spineTop = joint("chest");
  primitives.push({ kind: "bone", name: "spinal_cord", a: brainPos, b: spineTop, radius: nerveR, color });
  for (const limb of ["upperarm_l", "upperarm_r", "forearm_l", "forearm_r", "thigh_l", "thigh_r", "shin_l", "shin_r"]) {
    const target = joints.get(limb);
    if (target) {
      primitives.push({ kind: "bone", name: `nerve_${limb}`, a: spineTop, b: target, radius: nerveR * 0.5, color });
    }
  }
}

// ---------------------------------------------------------------------------
// New: GPU-ready flat render data
// ---------------------------------------------------------------------------

export function buildRenderData(primitives: InternalAnatomyPrimitive[]): InternalAnatomyRenderData {
  const count = primitives.length;
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);
  const radii = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const p = primitives[i];
    const off6 = i * 6;
    const off2 = i * 2;
    positions[off6] = p.a.x;
    positions[off6 + 1] = p.a.y;
    positions[off6 + 2] = p.a.z;
    positions[off6 + 3] = p.b?.x ?? p.a.x;
    positions[off6 + 4] = p.b?.y ?? p.a.y;
    positions[off6 + 5] = p.b?.z ?? p.a.z;
    colors[off6] = p.color[0];
    colors[off6 + 1] = p.color[1];
    colors[off6 + 2] = p.color[2];
    colors[off6 + 3] = p.color[0];
    colors[off6 + 4] = p.color[1];
    colors[off6 + 5] = p.color[2];
    radii[off2] = p.radius;
    radii[off2 + 1] = p.b ? p.radius : p.radius;
  }

  return { count, positions, colors, radii };
}

// ---------------------------------------------------------------------------
// New: volume estimation
// ---------------------------------------------------------------------------

export function estimatePrimitiveVolume(p: InternalAnatomyPrimitive): number {
  if (p.b) {
    const len = distance3(p.a, p.b);
    return VOLUME_CYLINDER_FACTOR * p.radius * p.radius * len;
  }
  return VOLUME_SPHERE_FACTOR * p.radius * p.radius * p.radius;
}

export function estimateAllVolumes(primitives: InternalAnatomyPrimitive[]): PrimitiveVolume[] {
  return primitives.map((p) => ({
    name: p.name,
    kind: p.kind,
    volume: estimatePrimitiveVolume(p),
  }));
}

export function totalVolume(volumes: PrimitiveVolume[]): number {
  let sum = 0;
  for (let i = 0; i < volumes.length; i++) sum += volumes[i].volume;
  return sum;
}

// ---------------------------------------------------------------------------
// New: joint visualization markers
// ---------------------------------------------------------------------------

export function buildJointVisualizations(
  skeleton: BoneDef[],
  dims: AnatomyDimensions,
  markerShape: JointMarkerShape = "sphere",
): JointVisualization[] {
  const joints = worldJoints(skeleton);
  const result: JointVisualization[] = [];
  for (const bone of skeleton) {
    const pos = joints.get(bone.name);
    if (!pos) continue;
    result.push({
      name: bone.name,
      position: pos,
      shape: markerShape,
      radius: markerShape === "sphere" ? dims.height * 0.012 : dims.height * 0.018,
      color: JOINT_COLOR,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// New: fracture visualization
// ---------------------------------------------------------------------------

export function visualizeFracture(
  fracture: BoneFracture,
  skeleton: BoneDef[],
  dims: AnatomyDimensions,
): FractureVisualization {
  const FRACTURE_COLOR: [number, number, number] = [0.95, 0.3, 0.1];
  const displaced = offset(fracture.fracturePoint, fracture.displacement.x, fracture.displacement.y, fracture.displacement.z);
  const visual: InternalAnatomyPrimitive = {
    kind: "joint",
    name: `fracture_${fracture.boneName}`,
    a: fracture.fracturePoint,
    b: displaced,
    radius: dims.height * 0.01 * (1 + fracture.severity * 0.5),
    color: FRACTURE_COLOR,
  };
  return { fracture, visual };
}

// ---------------------------------------------------------------------------
// New: muscle activation visualization
// ---------------------------------------------------------------------------

export function applyMuscleActivation(
  primitives: InternalAnatomyPrimitive[],
  activations: MuscleActivation[],
): InternalAnatomyPrimitive[] {
  const actMap = new Map<string, number>();
  for (const a of activations) actMap.set(a.muscleName, a.activation);

  return primitives.map((p) => {
    if (p.kind !== "muscle") return p;
    const act = actMap.get(p.name) ?? 0;
    const clampedAct = act <= 0 ? 0 : act >= 1 ? 1 : act;
    const scale = 1 + clampedAct * 0.6;
    const r = Math.round(255 * (0.78 + clampedAct * 0.22));
    const g = Math.round(255 * (0.12 * (1 - clampedAct * 0.5)));
    const b = Math.round(255 * (0.1 * (1 - clampedAct * 0.3)));
    return {
      ...p,
      radius: p.radius * scale,
      color: [r / 255, g / 255, b / 255] as [number, number, number],
    };
  });
}

// ---------------------------------------------------------------------------
// New: heatmap overlay
// ---------------------------------------------------------------------------

function mapValueToColor(value: number, min: number, max: number, colors: [number, number, number][]): [number, number, number] {
  if (max === min) return colors[0];
  const t = clamp01((value - min) / (max - min));
  const segment = t * (colors.length - 1);
  const idx = Math.floor(segment);
  const frac = segment - idx;
  if (idx >= colors.length - 1) return colors[colors.length - 1];
  const c0 = colors[idx];
  const c1 = colors[idx + 1];
  return [
    c0[0] + (c1[0] - c0[0]) * frac,
    c0[1] + (c1[1] - c0[1]) * frac,
    c0[2] + (c1[2] - c0[2]) * frac,
  ];
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

export function applyHeatmapOverlay(
  primitives: InternalAnatomyPrimitive[],
  heatmap: HeatmapOverlay,
): InternalAnatomyPrimitive[] {
  const colors = heatmap.colors.length >= 2 ? heatmap.colors : HEATMAP_DEFAULT_COLORS;

  return primitives.map((p) => {
    let closestDist = Infinity;
    let closestVal = heatmap.min;
    for (const s of heatmap.samples) {
      const d = distance3(p.a, s.worldPosition);
      if (d < closestDist) {
        closestDist = d;
        closestVal = s.value;
      }
      if (p.b) {
        const dB = distance3(p.b, s.worldPosition);
        if (dB < closestDist) {
          closestDist = dB;
          closestVal = s.value;
        }
      }
    }
    const mapped = mapValueToColor(closestVal, heatmap.min, heatmap.max, colors);
    return { ...p, color: mapped };
  });
}

// ---------------------------------------------------------------------------
// New: combined organ-system + heatmap render pipeline
// ---------------------------------------------------------------------------

export function buildAnatomyRenderPipeline(
  dims: AnatomyDimensions,
  skeleton: BoneDef[],
  system: OrganSystemMode,
  activations?: MuscleActivation[],
  heatmap?: HeatmapOverlay,
): { view: InternalAnatomyView; renderData: InternalAnatomyRenderData; volumes: PrimitiveVolume[] } {
  const view = buildOrganSystemView(dims, skeleton, system);
  let primitives = view.primitives;

  if (activations && system === "muscular") {
    primitives = applyMuscleActivation(primitives, activations);
  }
  if (heatmap) {
    primitives = applyHeatmapOverlay(primitives, heatmap);
  }

  return {
    view: { ...view, primitives },
    renderData: buildRenderData(primitives),
    volumes: estimateAllVolumes(primitives),
  };
}
