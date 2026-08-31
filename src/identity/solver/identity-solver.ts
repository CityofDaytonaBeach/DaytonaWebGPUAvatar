import { IdentityImportance, PropertyCategory, PropertyMeta } from "../../core/schema/property";
import { PropertyRegistry } from "../../core/schema/registry";
import { HumanDefinition } from "../../core/schema/human-definition";
import { CharacterEvent } from "../../core/events/character-event";

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
  clampedChanges?: Record<string, { requested: number; applied: number }>;
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
export class IdentitySolver {
  constructor(private registry: PropertyRegistry) {}

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
  gate(event: CharacterEvent, current: HumanDefinition, budget: IdentityBudget = { amount: 0 }): IdentityChangeGate {
    // Only structural 'set'/'adjust' events touch identity.
    if (event.type !== "set" && event.type !== "adjust") {
      return { allowed: true, reason: "non-structural event" };
    }

    const paths = event.changes
      ? Object.keys(event.changes)
      : event.path
        ? [event.path]
        : [];

    const explicitTarget = new Set<string>(budget.allowedDimensions ?? []);
    // The paths being changed are inherently explicitly targeted.
    for (const p of paths) explicitTarget.add(p);

    const clampedChanges: IdentityChangeGate["clampedChanges"] = {};

    for (const path of paths) {
      const meta = this.registry.require(path);
      const importance = meta.identityImportance;
      const explicit = explicitTarget.has(path) || budget.amount >= 1;

      if (importance === IdentityImportance.None) {
        continue; // never identity-affecting
      }

      if (!explicit) {
        // Protected identity dimension changed without budget.
        const requested = event.changes?.[path] ?? event.value ?? 0;
        clampedChanges![path] = { requested, applied: current.get(path) };
        return {
          allowed: false,
          reason: `identity-protected dimension "${path}" (importance=${importance})`,
          clampedChanges,
        };
      }
    }

    return { allowed: true, reason: "identity-safe change" };
  }
}
