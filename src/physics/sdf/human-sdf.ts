import { AnatomyDimensions } from "../../anatomy/parametric/parametric-anatomy";
import { BoneDef } from "../../anatomy/skeleton/skeleton";
import { Vec3, vec3 } from "../../core/math/vec";
import { RegionName } from "../../geometry/canonical/canonical-human";

export type HumanSdfPrimitiveKind = "sphere" | "capsule";

export interface HumanSdfPrimitive {
  kind: HumanSdfPrimitiveKind;
  region: RegionName;
  a: Vec3;
  b?: Vec3;
  radius: number;
}

export interface HumanSdfSample {
  distance: number;
  region: RegionName;
  primitive: HumanSdfPrimitive;
}

export class HumanSdfField {
  constructor(readonly primitives: HumanSdfPrimitive[]) {}

  sample(p: Vec3): HumanSdfSample {
    if (this.primitives.length === 0) throw new Error("Human SDF has no primitives");
    let best: HumanSdfSample | null = null;
    for (const primitive of this.primitives) {
      const distance = primitive.kind === "sphere"
        ? sphereSdf(p, primitive.a, primitive.radius)
        : capsuleSdf(p, primitive.a, primitive.b ?? primitive.a, primitive.radius);
      if (!best || distance < best.distance) {
        best = { distance, region: primitive.region, primitive };
      }
    }
    return best!;
  }

  distance(p: Vec3): number {
    return this.sample(p).distance;
  }
}

export function buildHumanSdfField(dims: AnatomyDimensions, skeleton: BoneDef[]): HumanSdfField {
  const joints = worldJoints(skeleton);
  const joint = (name: string) => joints.get(name) ?? vec3();
  const primitives: HumanSdfPrimitive[] = [];

  primitives.push({ kind: "capsule", region: "torso", a: joint("pelvis"), b: joint("chest"), radius: Math.max(dims.waistHalfWidth, dims.torsoHalfDepth) * 0.92 });
  primitives.push({ kind: "sphere", region: "head", a: joint("head"), radius: dims.height * 0.09 * dims.headScale });
  primitives.push({ kind: "capsule", region: "neck", a: joint("neck"), b: joint("head"), radius: dims.height * 0.035 });

  addLimb(primitives, "upperarm_l", joint("upperarm_l"), joint("forearm_l"), dims.height * 0.04);
  addLimb(primitives, "upperarm_r", joint("upperarm_r"), joint("forearm_r"), dims.height * 0.04);
  addLimb(primitives, "forearm_l", joint("forearm_l"), joint("hand_l"), dims.height * 0.032);
  addLimb(primitives, "forearm_r", joint("forearm_r"), joint("hand_r"), dims.height * 0.032);
  addLimb(primitives, "hand_l", joint("hand_l"), add(joint("hand_l"), vec3(0, -dims.handLength * 0.45, 0)), dims.height * 0.03);
  addLimb(primitives, "hand_r", joint("hand_r"), add(joint("hand_r"), vec3(0, -dims.handLength * 0.45, 0)), dims.height * 0.03);
  addLimb(primitives, "thigh_l", joint("thigh_l"), joint("shin_l"), dims.height * 0.055);
  addLimb(primitives, "thigh_r", joint("thigh_r"), joint("shin_r"), dims.height * 0.055);
  addLimb(primitives, "shin_l", joint("shin_l"), joint("foot_l"), dims.height * 0.04);
  addLimb(primitives, "shin_r", joint("shin_r"), joint("foot_r"), dims.height * 0.04);

  return new HumanSdfField(primitives);
}

function addLimb(primitives: HumanSdfPrimitive[], region: RegionName, a: Vec3, b: Vec3, radius: number): void {
  primitives.push({ kind: "capsule", region, a, b, radius });
}

function worldJoints(skeleton: BoneDef[]): Map<string, Vec3> {
  const out = new Map<string, Vec3>();
  for (const bone of skeleton) {
    const parent = bone.parent ? out.get(bone.parent) ?? vec3() : vec3();
    out.set(bone.name, add(parent, bone.localPosition));
  }
  return out;
}

function sphereSdf(p: Vec3, center: Vec3, radius: number): number {
  return length(sub(p, center)) - radius;
}

function capsuleSdf(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = clamp(dot(pa, ba) / Math.max(dot(ba, ba), 1e-8), 0, 1);
  return length(sub(pa, scale(ba, h))) - radius;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: Vec3, s: number): Vec3 {
  return vec3(a.x * s, a.y * s, a.z * s);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
