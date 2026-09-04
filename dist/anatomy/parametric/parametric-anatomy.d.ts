import { HumanDefinition } from '../../core/schema/human-definition.js';
/**
 * Concrete, measured body dimensions resolved from the semantic Human
 * Definition. This is the anatomical-constraint side of the pipeline: it turns
 * high-level identity properties (height, muscularity, bodyFat, limb-length and
 * torso girth factors) into real, closable body & joint metrics that both the
 * canonical geometry (reparemeterized) and the parametric skeleton share.
 */
export interface AnatomyDimensions {
    height: number;
    scale: number;
    hipHeight: number;
    shoulderHeight: number;
    chestY: number;
    waistY: number;
    pelvisY: number;
    chestHalfWidth: number;
    waistHalfWidth: number;
    hipHalfWidth: number;
    torsoHalfDepth: number;
    shoulderHalfWidth: number;
    upperarmLength: number;
    forearmLength: number;
    handLength: number;
    thighLength: number;
    shinLength: number;
    footOffsetY: number;
    headScale: number;
}
export interface AnatomyConstraint {
    message: string;
    satisfaction: number;
}
export declare const NEUTRAL_US_MALE_HEIGHT = 1.78;
/**
 * Resolve concrete anatomy dimensions from a Human Definition.
 *
 * The solver is deterministic and purely functional: same definition -> same
 * dimensions. All factors default to 1.0 at neutral so a default human maps to
 * the canonical reference geometry, and corrective morphs (registered in Human)
 * deform that geometry to match these resolved values.
 */
export declare function resolveAnatomy(def: HumanDefinition): AnatomyDimensions;
/**
 * Validate resolved anatomy against anatomical plausibility constraints.
 * Returns a satisfaction 0..1 and messages; used by the constraint solver as a
 * knowledge-driven check (e.g. waist must not exceed chest).
 */
export declare function validateAnatomy(d: AnatomyDimensions): AnatomyConstraint[];
/** Aggregate satisfaction across all anatomy constraints. */
export declare function anatomySatisfaction(constraints: AnatomyConstraint[]): number;
//# sourceMappingURL=parametric-anatomy.d.ts.map