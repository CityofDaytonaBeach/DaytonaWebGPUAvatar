export * from './types';

import { ConstraintProfile, ConstraintResult } from './types';
import { PropertyRegistry } from '../schema/registry';
import { HumanDefinition } from '../schema/human-definition';

/**
 * Anatomical constraint solver. Prevents invalid humans by enforcing hard,
 * soft and dependency constraints on the HumanDefinition. Different profiles
 * relax or tighten the same rules. Returns structured results so callers know
 * whether a proposed change is admissible and why.
 */
export class ConstraintSolver {
  constructor(
    private registry: PropertyRegistry,
    private profile: ConstraintProfile = 'REALISTIC',
  ) {}

  setProfile(profile: ConstraintProfile): void {
    this.profile = profile;
  }

  getProfile(): ConstraintProfile {
    return this.profile;
  }

  /** Relaxation factor derived from profile. */
  private tolerance(path: string): number {
    void path;
    switch (this.profile) {
      case 'REALISTIC':
        return 0.05;
      case 'STYLIZED':
        return 0.25;
      case 'FANTASY':
        return 10.0;
    }
  }

  /**
   * Validate the whole definition. Returns satisfaction and any messages.
   * Never mutates — callers decide whether to accept a change.
   */
  validate(definition: HumanDefinition): ConstraintResult {
    const messages: string[] = [];
    let violations = 0;

    // Hard: all in-range properties must remain in range.
    for (const meta of this.registry.all()) {
      const v = definition.getById(meta.id);
      if (meta.min !== undefined && v < meta.min) violations++;
      if (meta.max !== undefined && v > meta.max) violations++;
    }

    // Soft: muscularity + bodyFat combination sanity.
    const muscularity = definition.get('body.muscularity');
    const bodyFat = definition.get('body.bodyFat');
    // Extremely high muscularity with extreme fat conflicts anatomically.
    if (muscularity > 0.9 && bodyFat > 0.5) {
      violations++;
      messages.push('high muscularity conflicts with extreme body fat');
    }

    return {
      satisfaction:
        violations === 0 ? 1 : Math.max(0, 1 - violations * this.tolerance('body.muscularity')),
      messages,
    };
  }

  /**
   * Can a proposed `set` be applied? Returns true if within hard bounds for
   * the current profile.
   */
  canSet(path: string, value: number): boolean {
    const meta = this.registry.require(path);
    if (this.profile === 'REALISTIC') {
      if (meta.min !== undefined && value < meta.min) return false;
      if (meta.max !== undefined && value > meta.max) return false;
    }
    return true;
  }
}
