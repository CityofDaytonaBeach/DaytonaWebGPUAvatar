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
export class CorrectiveShapeSolver {
  constructor(
    private shapeSpace: HumanShapeSpace,
    private rules: CorrectiveRule[] = [],
  ) {}

  addRule(rule: CorrectiveRule): void {
    this.rules.push(rule);
  }

  clearRules(): void {
    this.rules.length = 0;
  }

  /** Continuous activation (0..~1) for a single rule under the given coeffs. */
  activation(rule: CorrectiveRule, coeffs: Map<number, number>): number {
    if (rule.inputs.length === 0) return 0;
    let acc = 1;
    for (const input of rule.inputs) {
      const c = coeffs.get(input.basisId) ?? 0;
      const shaped = input.influence ? input.influence(c) : c;
      acc *= shaped;
      if (acc === 0) break;
    }
    return acc;
  }

  /**
   * True if a rule is meaningfully active (activation above a threshold) — used
   * for telemetry / localized-edit proof, not for the actual deformation.
   */
  isActive(rule: CorrectiveRule, coeffs: Map<number, number>, threshold = 0.01): boolean {
    return Math.abs(this.activation(rule, coeffs)) > threshold;
  }

  /** Rules whose activation is above the threshold (P11/P17 telemetry). */
  listActiveRules(coeffs: Map<number, number>, threshold = 0.01): CorrectiveRule[] {
    return this.rules.filter((rule) => this.isActive(rule, coeffs, threshold));
  }

  /**
   * Accumulate the corrective contribution into a dense per-vertex delta array
   * (length vertexCount*3). Returns the same array for chaining.
   */
  evaluate(coeffs: Map<number, number>, out: Float32Array): Float32Array {
    for (const rule of this.rules) {
      const act = this.activation(rule, coeffs);
      if (Math.abs(act) < 1e-9) continue;
      const basis = this.shapeSpace.bases.getById(rule.outputBasisId);
      if (!basis) continue;
      for (const d of basis.deltas) {
        const off = d.vertexId * 3;
        out[off + 0] += d.dx * act;
        out[off + 1] += d.dy * act;
        out[off + 2] += d.dz * act;
      }
    }
    return out;
  }
}
