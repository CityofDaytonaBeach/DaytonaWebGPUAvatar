import { BoneDef } from "../skeleton/skeleton";
import { AnatomyDimensions } from "../parametric/parametric-anatomy";
import { Vec3, vec3 } from "../../core/math/vec";

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

const SKELETON_COLOR: [number, number, number] = [0.9, 0.86, 0.72];
const JOINT_COLOR: [number, number, number] = [0.95, 0.9, 0.78];
const MUSCLE_COLOR: [number, number, number] = [0.78, 0.12, 0.1];

/**
 * Deterministic internal-anatomy prototype. It derives skeleton and major muscle
 * display primitives from the same parametric anatomy/skeleton used by skinning,
 * so anatomy modes remain modular and never become the source of character truth.
 */
export function buildInternalAnatomyView(
  dims: AnatomyDimensions,
  skeleton: BoneDef[],
  mode: InternalAnatomyMode = "anatomy"
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
