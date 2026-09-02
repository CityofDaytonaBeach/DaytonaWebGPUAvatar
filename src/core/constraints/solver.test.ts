import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../schema/descriptors';
import { HumanDefinition } from '../schema/human-definition';
import { ConstraintSolver } from './solver';

function makeSolver(profile: 'REALISTIC' | 'STYLIZED' | 'FANTASY' = 'REALISTIC') {
  const registry = createDefaultRegistry();
  const definition = new HumanDefinition(registry);
  const solver = new ConstraintSolver(registry, profile);
  return { registry, definition, solver };
}

describe('ConstraintSolver (spec #55 Constraints)', () => {
  it('is clean for a default definition', () => {
    const { definition, solver } = makeSolver();
    const result = solver.validate(definition);
    expect(result.satisfaction).toBe(1);
    expect(result.messages).toHaveLength(0);
  });

  it('REALISTIC profile rejects out-of-hard-bounds values', () => {
    const { solver } = makeSolver('REALISTIC');
    // global.height: min 0.6, max 2.6.
    expect(solver.canSet('global.height', 0.2)).toBe(false);
    expect(solver.canSet('global.height', 3.0)).toBe(false);
    expect(solver.canSet('global.height', 1.8)).toBe(true);
  });

  it('STYLIZED/FANTASY profiles relax the hard bounds', () => {
    const stylized = makeSolver('STYLIZED').solver;
    const fantasy = makeSolver('FANTASY').solver;
    expect(stylized.canSet('global.height', 3.0)).toBe(true);
    expect(fantasy.canSet('identity.skullWidth', 2.5)).toBe(true);
  });

  it('flags the high-muscularity + high-fat soft conflict', () => {
    const { definition, solver } = makeSolver('REALISTIC');
    definition.set('body.muscularity', 0.95);
    definition.set('body.bodyFat', 0.55);

    const result = solver.validate(definition);
    expect(result.satisfaction).toBeLessThan(1);
    expect(result.messages).toContain('high muscularity conflicts with extreme body fat');
    // Tolerance 0.05 under REALISTIC, exactly one violation.
    expect(result.satisfaction).toBeCloseTo(0.95, 5);
  });

  it('does not flag moderate muscularity with high fat', () => {
    const { definition, solver } = makeSolver('REALISTIC');
    definition.set('body.muscularity', 0.8);
    definition.set('body.bodyFat', 0.55);
    // muscularity is NOT above 0.9, so the soft rule does not fire.
    expect(solver.validate(definition).satisfaction).toBe(1);
  });

  it('a bigger profile tolerance softens satisfaction for the same violation', () => {
    const realistic = makeSolver('REALISTIC');
    realistic.definition.set('body.muscularity', 0.95);
    realistic.definition.set('body.bodyFat', 0.55);
    const fantasy = makeSolver('FANTASY');
    fantasy.definition.set('body.muscularity', 0.95);
    fantasy.definition.set('body.bodyFat', 0.55);

    const r = realistic.solver.validate(realistic.definition);
    const f = fantasy.solver.validate(fantasy.definition);
    // FANTASY tolerance (10.0) yields satisfaction floor (0) vs REALISTIC 0.95.
    expect(f.satisfaction).toBeLessThan(r.satisfaction);
  });

  it('validate does not mutate the definition', () => {
    const { definition, solver } = makeSolver('REALISTIC');
    const before = definition.serialize();
    solver.validate(definition);
    expect(definition.serialize()).toEqual(before);
  });
});
