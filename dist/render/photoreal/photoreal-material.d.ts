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
import { SkinPreset } from '../../surface/skin/neural-skin.js';
import { Vec3 } from './color.js';
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
declare const IRIS_COLORS: Record<string, Vec3>;
/** Resolve iris colour from the definition when present, else a sensible default. */
export declare function resolveIrisColor(definition: HumanDefinition): Vec3;
/** The named iris colour presets available to callers. */
export declare function irisColorPreset(name: keyof typeof IRIS_COLORS | string): Vec3;
/**
 * Build the photoreal material for every part of a canonical human. Index 0 is
 * always the skin/body material; the rest follow `canonical.parts` order, so the
 * result maps 1:1 onto the renderer's draw list.
 */
export declare function buildPhotorealMaterials(definition: HumanDefinition, canonical: CanonicalHuman, preset?: SkinPreset): PhotorealPartMaterial[];
/** Photoreal material for one non-skin canonical part. */
export declare function partMaterial(name: string, kind: string, irisColor: Vec3): PhotorealPartMaterial;
export {};
//# sourceMappingURL=photoreal-material.d.ts.map