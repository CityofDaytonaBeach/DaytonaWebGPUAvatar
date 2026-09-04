import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import type { BoneDef } from '../../anatomy/skeleton/skeleton.js';
import type { BonePose } from '../../animation/skeleton/skeletal-animation.js';
/** A bone-driven weight source: a coefficient from a bone's world rotation angle. */
export interface MorphBoneWeight {
    kind: 'bone';
    boneName: string;
    /** Local axis of the bone about which the angle is measured ('x'|'y'|'z'). */
    axis: 'x' | 'y' | 'z';
    /** Rest angle (degrees) that counts as neutral (0 coefficient). */
    neutralDeg: number;
    /** Full-span angle (degrees) that maps to +/-1 (signed by deviation direction). */
    spanDeg: number;
}
/**
 * A corrective morph is driven by the continuous product of several shaped
 * coefficients rather than a single property. This is how combination correctives
 * (e.g. wide jaw + wide mouth) and pose/skeleton correctives (e.g. jaw open under
 * head tilt) flow through the existing sparse morph pipeline.
 */
export interface MorphCorrectiveWeight {
    kind: 'corrective';
    /**
     * One entry per contributing factor (a property value or a bone deflection);
     * the activation is their product. Bone factors let pose feed the morph
     * pipeline (P15 pose correctives).
     */
    inputs: Array<{
        property: string;
        influence?: (c: number) => number;
    } | Omit<MorphBoneWeight, 'kind'>>;
}
export type MorphWeightSource = string | MorphCorrectiveWeight | MorphBoneWeight;
/**
 * Maps semantic property values into morph weights that drive the GPU/CPU
 * morph pipeline.
 *
 * One property (e.g. face.eyeSpacing) may drive several morphs spread across
 * multiple parts/regions (body eye boxes, sclera, iris), so a property maps to
 * a list of morph names all sharing the same weight. Corrective morphs are
 * weighted by the continuous product of multiple shaped coefficients.
 *
 * Weight model (matches ShapeCoefficientSolver for consistency):
 *   - default != 0 : (value / default) - 1  (a ratio about neutral)
 *   - default == 0 : value scaled into the property's (min,max) as 0..1
 */
export declare class MorphDriver {
    private registry;
    /** morphName -> weight source (a property path, a corrective combination, or a bone). */
    private morphToProperty;
    private properties;
    /** Current skeleton + pose, used to evaluate bone-driven sources. */
    private bones;
    private poses;
    constructor(registry: PropertyRegistry);
    private register;
    /**
     * Public registration of a single-property (linear) morph — used to wire shape
     * bases compiled into sparse morphs back to their driving property.
     */
    registerBasis(name: string, propPath: string): void;
    /**
     * Register a bone-driven (pose) morph: its weight is the deflection coefficient
     * of the named bone about `axis` relative to rest. Pose is supplied via setPose().
     */
    registerBone(name: string, boneName: string, axis: 'x' | 'y' | 'z', neutralDeg: number, spanDeg: number): void;
    /**
     * Register a corrective morph driven by the continuous product of several
     * shaped coefficients (properties and/or bone deflections). The corrective is
     * exposed as a normal sparse morph so the existing GPU morph pipeline consumes
     * it (weight == product of inputs).
     */
    registerCorrective(morphName: string, inputs: MorphCorrectiveWeight['inputs']): void;
    /**
     * Set the current skeleton + pose used to evaluate bone-driven weight sources.
     * Called by Human whenever a pose is applied so pose changes flow into the morph
     * pipeline (P15 pose correctives).
     */
    setPose(bones: BoneDef[], poses?: BonePose[]): void;
    /** Morph names driven by a property path (linear, single-property morphs). */
    morphsForProperty(propPath: string): string[];
    /** True if a morph's weight source references the given property path. */
    morphUsesProperty(morphName: string, propPath: string): boolean;
    /** True if a morph is driven by the named bone (pose corrective). */
    morphUsesBone(morphName: string, boneName: string): boolean;
    /** Bone deflection coefficient for a single-input bone source. */
    private boneCoefficient;
    /** Weight of a morph based on the current definition. 0 = neutral. */
    weight(definition: HumanDefinition, morphName: string): number;
}
//# sourceMappingURL=morph-driver.d.ts.map