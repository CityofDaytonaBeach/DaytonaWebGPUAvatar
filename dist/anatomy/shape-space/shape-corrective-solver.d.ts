import { HumanShapeSpace } from './human-shape-space.js';
/** Which basis input drives a corrective and how continuously. */
export interface CorrectiveInput {
    /** Shape basis id that this corrective depends on. */
    basisId: number;
    /** Optional shaping function applied to the input's coefficient (default identity). */
    influence?: (c: number) => number;
}
/**
 * A generalized corrective rule: when the `inputs` coefficients are active, the
 * corrective basis (identified by `outputBasisId`) is applied. Activation is
 * continuous (product of shaped inputs), never a hard true/false switch.
 *
 *   activation = Π influence_i(c_i)
 */
export interface CorrectiveRule {
    inputs: CorrectiveInput[];
    /** Shape basis id whose deltas are scaled by the activation. */
    outputBasisId: number;
}
/**
 * Foundation for combination correctives (e.g. wide jaw + wide mouth). Given a
 * coefficient map, computes continuous activations and accumulates the resulting
 * corrective displacement on top of the linear shape space.
 */
export declare class CorrectiveShapeSolver {
    private shapeSpace;
    private rules;
    constructor(shapeSpace: HumanShapeSpace, rules?: CorrectiveRule[]);
    addRule(rule: CorrectiveRule): void;
    clearRules(): void;
    /** Continuous activation (0..~1) for a single rule under the given coeffs. */
    activation(rule: CorrectiveRule, coeffs: Map<number, number>): number;
    /**
     * True if a rule is meaningfully active (activation above a threshold) — used
     * for telemetry / localized-edit proof, not for the actual deformation.
     */
    isActive(rule: CorrectiveRule, coeffs: Map<number, number>, threshold?: number): boolean;
    /** Rules whose activation is above the threshold (P11/P17 telemetry). */
    listActiveRules(coeffs: Map<number, number>, threshold?: number): CorrectiveRule[];
    /**
     * Accumulate the corrective contribution into a dense per-vertex delta array
     * (length vertexCount*3). Returns the same array for chaining.
     */
    evaluate(coeffs: Map<number, number>, out: Float32Array): Float32Array;
}
//# sourceMappingURL=shape-corrective-solver.d.ts.map