import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { HumanShapeSpace } from './human-shape-space.js';
import { CorrectiveRule } from './shape-corrective-solver.js';
import { MorphCorrectiveWeight } from '../../geometry/morph/morph-driver.js';
export interface HdShapeSpec {
    /** Properties wired into the sparse morph pipeline via their shape bases. */
    propertyPaths: string[];
    /** Humanly-readable count of corrective rules registered. */
    correctiveRules: CorrectiveRule[];
    /** Corrective weight sources (morphName -> product inputs) to register in MorphDriver. */
    correctiveMorphs: Array<{
        name: string;
        inputs: NonNullable<MorphCorrectiveWeight['inputs']>;
    }>;
}
/**
 * Builds the Human Shape Space V0.1 for a given canonical topology.
 *
 * Registers exactly the ten first-generation identity controls (direction.md
 * P7) as sparse, reusable shape bases with CORRELATED deformation functions
 * (P8): a control spreads across its adjacent semantic transition regions
 * rather than naively scaling a single vertex axis. Bases are emitted on the
 * fine-grained HD regions when present, and fall back to the coarse block-human
 * regions otherwise, so the same shape space drives both topologies.
 *
 * Returns the spec needed by the Human runtime to:
 *   1. compile bases into the existing sparse morph set (P10),
 *   2. register their property mappings on the MorphDriver,
 *   3. register corrective (combination) rules (P11).
 */
export declare function buildHdShapeSpace(canonical: CanonicalHuman): {
    space: HumanShapeSpace;
    spec: HdShapeSpec;
};
//# sourceMappingURL=hd-shape-builder.d.ts.map