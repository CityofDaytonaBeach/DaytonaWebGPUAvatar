import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';
import { CharacterEvent } from '../../core/events/character-event.js';
export interface IdentityBudget {
    /**
     * 0 = preserve identity entirely, 1 = full change permitted.
     * Callers raising `amount` are stating that this operation IS an identity
     * edit (e.g. "create a different person"), allowing identity-critical
     * dimensions to shift.
     */
    amount: number;
    /** Identity dimensions explicitly allowed to change. Adds to event paths. */
    allowedDimensions?: string[];
}
export interface IdentityChangeGate {
    allowed: boolean;
    reason: string;
    clampedChanges?: Record<string, {
        requested: number;
        applied: number;
    }>;
}
/**
 * Identity Preservation Solver.
 *
 * Every operation receives an identity-change budget. If a change would modify
 * a property whose identity importance exceeds the budget, the change is
 * refused (or clamped) so unrelated identity does not drift.
 *
 * Rules:
 *  - expression, hair color/length, clothing, pose => identity importance NONE
 *    => pass cheaply.
 *  - identity-critical facial structure (jaw, eye spacing, skull, skin tone)
 *    => protected unless the operation explicitly targets them.
 */
export declare class IdentitySolver {
    private registry;
    constructor(registry: PropertyRegistry);
    /**
     * Gate an event against the current identity. Returns allowed + (optionally)
     * clamped changes to apply instead.
     *
     * A property is "explicitly targeted" if:
     *   - it appears in the event's own changes (asking to change it IS explicit),
     *     or
     *   - it appears in `budget.allowedDimensions`.
     *
     * Identity-critical structure that is NOT explicitly targeted is only
     * modified when the operation carries a full identity budget (amount >= 1).
     */
    gate(event: CharacterEvent, current: HumanDefinition, budget?: IdentityBudget): IdentityChangeGate;
}
//# sourceMappingURL=identity-solver.d.ts.map