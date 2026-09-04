export * from './types.js';
import { ConstraintProfile, ConstraintResult } from './types.js';
import { PropertyRegistry } from '../schema/registry.js';
import { HumanDefinition } from '../schema/human-definition.js';
/**
 * Anatomical constraint solver. Prevents invalid humans by enforcing hard,
 * soft and dependency constraints on the HumanDefinition. Different profiles
 * relax or tighten the same rules. Returns structured results so callers know
 * whether a proposed change is admissible and why.
 */
export declare class ConstraintSolver {
    private registry;
    private profile;
    constructor(registry: PropertyRegistry, profile?: ConstraintProfile);
    setProfile(profile: ConstraintProfile): void;
    getProfile(): ConstraintProfile;
    /** Relaxation factor derived from profile. */
    private tolerance;
    /**
     * Validate the whole definition. Returns satisfaction and any messages.
     * Never mutates â€” callers decide whether to accept a change.
     */
    validate(definition: HumanDefinition): ConstraintResult;
    /**
     * Can a proposed `set` be applied? Returns true if within hard bounds for
     * the current profile.
     */
    canSet(path: string, value: number): boolean;
}
//# sourceMappingURL=solver.d.ts.map