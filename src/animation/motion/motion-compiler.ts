import { BoneDef } from "../../anatomy/skeleton/skeleton";
import { BonePose, quatFromEulerDeg } from "../skeleton/skeletal-animation";

export type MotionKind = "raiseHand" | "lookAtCamera" | "neutral" | "unknown";

export interface MotionPlan {
  kind: MotionKind;
  confidence: number;
  poses: BonePose[];
  reason?: string;
}

/** Deterministic behavior compiler from small semantic commands to bone poses. */
export class MotionCompiler {
  compile(command: string, skeleton: BoneDef[]): MotionPlan {
    const text = command.toLowerCase();
    if (text.includes("neutral") || text.includes("rest pose") || text.includes("stand still")) {
      return { kind: "neutral", confidence: 0.95, poses: [] };
    }
    if (text.includes("look") && (text.includes("camera") || text.includes("forward"))) {
      return {
        kind: "lookAtCamera",
        confidence: 0.85,
        poses: restPoses(skeleton, [
          ["neck", -6, 0, 0],
          ["head", -4, 0, 0],
        ]),
      };
    }
    if (text.includes("raise") && (text.includes("hand") || text.includes("arm"))) {
      const side = text.includes("left") ? "l" : "r";
      const sign = side === "l" ? -1 : 1;
      return {
        kind: "raiseHand",
        confidence: text.includes("left") || text.includes("right") ? 0.9 : 0.72,
        poses: restPoses(skeleton, [
          [`clavicle_${side}`, -10, 0, sign * 8],
          [`upperarm_${side}`, 0, 0, sign * 118],
          [`forearm_${side}`, 0, 0, sign * 26],
          [`hand_${side}`, 0, 0, sign * 8],
        ]),
      };
    }
    return { kind: "unknown", confidence: 0.1, poses: [], reason: `unrecognized motion command: "${command}"` };
  }
}

export function compileMotionCommand(command: string, skeleton: BoneDef[]): MotionPlan {
  return new MotionCompiler().compile(command, skeleton);
}

function restPoses(skeleton: BoneDef[], rotations: Array<[string, number, number, number]>): BonePose[] {
  const byName = new Map(skeleton.map((b) => [b.name, b]));
  return rotations.flatMap(([name, x, y, z]) => {
    const bone = byName.get(name as never);
    if (!bone) return [];
    return [{ name, localPos: { ...bone.localPosition }, localRot: quatFromEulerDeg(x, y, z) }];
  });
}
