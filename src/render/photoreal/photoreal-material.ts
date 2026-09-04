/**
 * Photoreal material assignment.
 *
 * Turns a `HumanDefinition` + skin preset into per-part photoreal material
 * descriptors (albedo, roughness/specular/SSS, scatter colour, flag bits) for
 * every canonical part: skin, sclera, limbus, cornea, iris, pupil, teeth,
 * tongue, mouth cavity. This is the bridge between the semantic parameter layer
 * and the shader's `PartParams` uniform, and it is pure/deterministic so the
 * assignment is testable without a GPU.
 */

import { HumanDefinition } from '../../core/schema/human-definition.js';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { SkinPreset, getSkinPresetProfile } from '../../surface/skin/neural-skin.js';
import { PHOTOREAL_FLAGS } from './constants.js';
import { Vec3, clamp01 } from './color.js';

export interface PhotorealPartMaterial {
  name: string;
  kind: string;
  /** Linear albedo. */
  color: Vec3;
  /** [roughness, specular, sssIntensity]. */
  material: [number, number, number];
  /** Deep-tissue scatter colour. */
  sssColor: Vec3;
  /** Index of refraction (cornea only; 0 elsewhere). */
  ior: number;
  /** Photoreal flag bits (see PHOTOREAL_FLAGS). */
  flags: number;
  opaque: boolean;
}

const IRIS_COLORS: Record<string, Vec3> = {
  brown: [0.24, 0.14, 0.07],
  hazel: [0.34, 0.24, 0.1],
  green: [0.18, 0.32, 0.18],
  blue: [0.16, 0.28, 0.42],
  grey: [0.32, 0.34, 0.36],
};

/** Resolve iris colour from the definition when present, else a sensible default. */
export function resolveIrisColor(definition: HumanDefinition): Vec3 {
  const read = (path: string): number | undefined => {
    try {
      const v = definition.get(path);
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    } catch {
      return undefined;
    }
  };
  const r = read('eyes.irisColorR');
  const g = read('eyes.irisColorG');
  const b = read('eyes.irisColorB');
  if (r !== undefined && g !== undefined && b !== undefined) {
    return [clamp01(r), clamp01(g), clamp01(b)];
  }
  return IRIS_COLORS.brown;
}

/** The named iris colour presets available to callers. */
export function irisColorPreset(name: keyof typeof IRIS_COLORS | string): Vec3 {
  return IRIS_COLORS[name] ?? IRIS_COLORS.brown;
}

function skinAlbedo(definition: HumanDefinition, preset: SkinPreset): Vec3 {
  const profile = getSkinPresetProfile(preset);
  const read = (path: string, fallback: number): number => {
    try {
      const v = definition.get(path);
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  return [
    clamp01(read('skin.baseColorR', profile.baseColor[0])),
    clamp01(read('skin.baseColorG', profile.baseColor[1])),
    clamp01(read('skin.baseColorB', profile.baseColor[2])),
  ];
}

/**
 * Build the photoreal material for every part of a canonical human. Index 0 is
 * always the skin/body material; the rest follow `canonical.parts` order, so the
 * result maps 1:1 onto the renderer's draw list.
 */
export function buildPhotorealMaterials(
  definition: HumanDefinition,
  canonical: CanonicalHuman,
  preset: SkinPreset = SkinPreset.Fair,
): PhotorealPartMaterial[] {
  const profile = getSkinPresetProfile(preset);
  const albedo = skinAlbedo(definition, preset);
  const read = (path: string, fallback: number): number => {
    try {
      const v = definition.get(path);
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const roughness = clamp01(read('skin.roughness', profile.roughness));
  const specular = clamp01(read('skin.specular', profile.specular));
  const wetness = clamp01(read('skin.wetness', 0.3));
  // Wet skin is smoother and more specular — the classic sweat/sebum response.
  const skinRoughness = clamp01(roughness * (1 - 0.45 * wetness));
  const skinSpecular = clamp01(specular + 0.35 * wetness);

  const out: PhotorealPartMaterial[] = [
    {
      name: 'body',
      kind: 'skin',
      color: albedo,
      material: [skinRoughness, skinSpecular, clamp01(profile.sssIntensity)],
      sssColor: [...profile.sssColor] as Vec3,
      ior: 0,
      flags: PHOTOREAL_FLAGS.skin | PHOTOREAL_FLAGS.normalPerturb,
      opaque: true,
    },
  ];

  const irisColor = resolveIrisColor(definition);
  for (const part of canonical.parts) {
    out.push(partMaterial(part.name, part.kind, irisColor));
  }
  return out;
}

/** Photoreal material for one non-skin canonical part. */
export function partMaterial(name: string, kind: string, irisColor: Vec3): PhotorealPartMaterial {
  switch (kind) {
    case 'sclera':
      return {
        name,
        kind,
        // Sclera is never pure white — it is a translucent, slightly warm tissue.
        color: [0.86, 0.84, 0.82],
        material: [0.14, 0.75, 0.55],
        sssColor: [0.86, 0.5, 0.45],
        ior: 0,
        flags: PHOTOREAL_FLAGS.sclera,
        opaque: true,
      };
    case 'limbus':
      return {
        name,
        kind,
        color: [0.14, 0.13, 0.13],
        material: [0.2, 0.5, 0.1],
        sssColor: [0.3, 0.16, 0.16],
        ior: 0,
        flags: 0,
        opaque: true,
      };
    case 'cornea':
      return {
        name,
        kind,
        color: [0.9, 0.92, 0.94],
        material: [0.02, 1.0, 0.0],
        sssColor: [0.35, 0.4, 0.45],
        ior: 1.376,
        flags: PHOTOREAL_FLAGS.refractive,
        opaque: false,
      };
    case 'iris':
      return name.startsWith('pupil')
        ? {
            name,
            kind,
            color: [0.012, 0.012, 0.014],
            material: [0.08, 0.6, 0.0],
            sssColor: [0.05, 0.02, 0.02],
            ior: 0,
            flags: 0,
            opaque: true,
          }
        : {
            name,
            kind,
            color: irisColor,
            material: [0.1, 0.65, 0.18],
            sssColor: [0.4, 0.28, 0.18],
            ior: 0,
            flags: PHOTOREAL_FLAGS.iris,
            opaque: true,
          };
    case 'teeth':
      return {
        name,
        kind,
        color: [0.9, 0.88, 0.82],
        material: [0.16, 0.7, 0.45],
        sssColor: [0.85, 0.75, 0.62],
        ior: 1.63,
        flags: PHOTOREAL_FLAGS.enamel,
        opaque: true,
      };
    case 'tongue':
      return {
        name,
        kind,
        color: [0.62, 0.28, 0.28],
        material: [0.22, 0.6, 0.7],
        sssColor: [0.8, 0.24, 0.22],
        ior: 0,
        flags: 0,
        opaque: true,
      };
    case 'mouth_cavity':
      return {
        name,
        kind,
        color: [0.12, 0.045, 0.05],
        material: [0.45, 0.25, 0.5],
        sssColor: [0.4, 0.1, 0.1],
        ior: 0,
        flags: 0,
        opaque: true,
      };
    default:
      return {
        name,
        kind,
        color: [0.72, 0.56, 0.45],
        material: [0.4, 0.4, 0.35],
        sssColor: [0.9, 0.58, 0.48],
        ior: 0,
        flags: PHOTOREAL_FLAGS.skin,
        opaque: true,
      };
  }
}
