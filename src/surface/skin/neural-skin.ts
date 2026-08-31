import { HumanDefinition } from "../../core/schema/human-definition";
import { CanonicalHuman, RegionName } from "../../geometry/canonical/canonical-human";

export interface SkinResidualSample {
  vertexId: number;
  region: RegionName;
  colorDelta: [number, number, number];
  roughnessDelta: number;
  normalIntensity: number;
}

export interface SkinResidualOptions {
  maxSamples?: number;
  strength?: number;
}

export interface SkinResidualField {
  samples: SkinResidualSample[];
  strength: number;
}

/**
 * Procedural neural-skin residual stand-in. It is deterministic, bounded, and
 * driven by semantic skin state so it can be replaced by a trained model later
 * without changing the public surface API.
 */
export function generateSkinResiduals(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  options: SkinResidualOptions = {}
): SkinResidualField {
  const strength = clamp(options.strength ?? 1, 0, 1);
  const maxSamples = Math.max(0, Math.floor(options.maxSamples ?? canonical.vertexCount));
  const age = definition.get("skin.age") / 100;
  const pigmentation = definition.get("skin.pigmentation");
  const wetness = definition.get("skin.wetness");
  const roughness = definition.get("skin.roughness");
  const samples: SkinResidualSample[] = [];

  for (const v of canonical.vertices) {
    if (samples.length >= maxSamples) break;
    if (!isSkinRegion(v.region)) continue;
    const pores = noise(v.id, v.uv.u, v.uv.v);
    const freckles = noise(v.id * 17 + 3, v.position.x, v.position.y);
    const regionScale = v.region === "face" || v.region === "nose" ? 1.25 : 0.7;
    const ageTerm = (age - 0.3) * 0.035 * regionScale;
    const pigmentTerm = (pigmentation - 0.5) * 0.025;
    const poreTerm = (pores - 0.5) * 0.018 * regionScale;
    samples.push({
      vertexId: v.id,
      region: v.region,
      colorDelta: [
        clampDelta((ageTerm + pigmentTerm + poreTerm) * strength),
        clampDelta((ageTerm * 0.55 + pigmentTerm * 0.6 + (freckles - 0.5) * 0.014) * strength),
        clampDelta((-ageTerm * 0.4 + pigmentTerm * 0.35 + poreTerm * 0.45) * strength),
      ],
      roughnessDelta: clampDelta(((pores - 0.5) * 0.08 + age * 0.04 - wetness * 0.12) * strength),
      normalIntensity: clamp((0.15 + age * 0.5 + roughness * 0.25 + pores * 0.1) * strength, 0, 1),
    });
  }

  return { samples, strength };
}

export function applySkinResidualColor(
  base: [number, number, number],
  residual: SkinResidualSample
): [number, number, number] {
  return [
    clamp(base[0] + residual.colorDelta[0], 0, 1),
    clamp(base[1] + residual.colorDelta[1], 0, 1),
    clamp(base[2] + residual.colorDelta[2], 0, 1),
  ];
}

function isSkinRegion(region: RegionName): boolean {
  return region !== "eye_sclera" && region !== "eye_iris" && region !== "teeth" && region !== "tongue" && region !== "mouth_cavity";
}

function noise(seed: number, a: number, b: number): number {
  const x = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function clampDelta(v: number): number {
  return clamp(v, -0.12, 0.12);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
