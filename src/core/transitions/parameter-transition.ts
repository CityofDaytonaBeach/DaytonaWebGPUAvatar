import { HumanDefinition, PrimitiveValue } from "../schema/human-definition";

export type TransitionCurve = "linear" | "ease" | "biological";

export interface ParameterTransition {
  id: string;
  path: string;
  startValue: PrimitiveValue;
  targetValue: PrimitiveValue;
  startTime: number;
  duration: number;
  curve: TransitionCurve;
}

export interface TransitionSpec {
  id?: string;
  path: string;
  targetValue: PrimitiveValue;
  duration: number;
  curve?: TransitionCurve;
}

export function createParameterTransition(definition: HumanDefinition, spec: TransitionSpec, now: number): ParameterTransition {
  if (spec.duration < 0 || Number.isNaN(spec.duration)) {
    throw new Error(`Invalid transition duration for ${spec.path}`);
  }
  return {
    id: spec.id ?? `transition:${spec.path}:${now}`,
    path: spec.path,
    startValue: definition.get(spec.path),
    targetValue: spec.targetValue,
    startTime: now,
    duration: spec.duration,
    curve: spec.curve ?? "linear",
  };
}

export function sampleTransition(transition: ParameterTransition, now: number): PrimitiveValue {
  if (transition.duration === 0) return transition.targetValue;
  const t = clamp01((now - transition.startTime) / transition.duration);
  const shaped = applyCurve(t, transition.curve);
  return transition.startValue + (transition.targetValue - transition.startValue) * shaped;
}

export function transitionComplete(transition: ParameterTransition, now: number): boolean {
  return now >= transition.startTime + transition.duration;
}

function applyCurve(t: number, curve: TransitionCurve): number {
  switch (curve) {
    case "ease":
      return t * t * (3 - 2 * t);
    case "biological":
      return (1 - Math.cos(Math.PI * t)) * 0.5;
    case "linear":
    default:
      return t;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
