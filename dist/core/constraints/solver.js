export * from './types.js';
/**
 * Anatomical constraint solver. Prevents invalid humans by enforcing hard,
 * soft and dependency constraints on the HumanDefinition. Different profiles
 * relax or tighten the same rules. Returns structured results so callers know
 * whether a proposed change is admissible and why.
 */
export class ConstraintSolver {
    registry;
    profile;
    constructor(registry, profile = 'REALISTIC') {
        this.registry = registry;
        this.profile = profile;
    }
    setProfile(profile) {
        this.profile = profile;
    }
    getProfile() {
        return this.profile;
    }
    /** Relaxation factor derived from profile. */
    tolerance(path) {
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
     * Never mutates â€” callers decide whether to accept a change.
     */
    validate(definition) {
        const messages = [];
        let violations = 0;
        // Hard: all in-range properties must remain in range.
        for (const meta of this.registry.all()) {
            const v = definition.getById(meta.id);
            if (meta.min !== undefined && v < meta.min)
                violations++;
            if (meta.max !== undefined && v > meta.max)
                violations++;
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
            satisfaction: violations === 0 ? 1 : Math.max(0, 1 - violations * this.tolerance('body.muscularity')),
            messages,
        };
    }
    /**
     * Can a proposed `set` be applied? Returns true if within hard bounds for
     * the current profile.
     */
    canSet(path, value) {
        const meta = this.registry.require(path);
        if (this.profile === 'REALISTIC') {
            if (meta.min !== undefined && value < meta.min)
                return false;
            if (meta.max !== undefined && value > meta.max)
                return false;
        }
        return true;
    }
}
//# sourceMappingURL=solver.js.map