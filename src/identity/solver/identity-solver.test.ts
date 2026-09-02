import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../core/schema/descriptors';
import { HumanDefinition } from '../../core/schema/human-definition';
import { createEvent } from '../../core/events/character-event';
import { IdentitySolver } from './identity-solver';
import { IdentityImportance } from '../../core/schema/property';

function makeContext() {
  const registry = createDefaultRegistry();
  const definition = new HumanDefinition(registry);
  return { registry, definition, solver: new IdentitySolver(registry) };
}

describe('IdentitySolver (spec #55 Identity / spec #17)', () => {
  it('passes non-structural events (expression, pose) without touching identity', () => {
    const { definition, solver } = makeContext();
    const evt = createEvent('expression', 'ai', { payload: { name: 'smile', intensity: 1 } });
    const gate = solver.gate(evt, definition, { amount: 0 });
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('non-structural event');
  });

  it('allows identity-importance NONE props (hair, expression) with a zero budget', () => {
    const { definition, solver } = makeContext();
    const hair = createEvent('set', 'ui', { path: 'hair.length', value: 0.9 });
    const gate = solver.gate(hair, definition, { amount: 0 });
    expect(gate.allowed).toBe(true);

    const meta = definition.registryRef.require('hair.length');
    expect(meta.identityImportance).toBe(IdentityImportance.None);
  });

  it('allows explicitly-targeted protected props (facial structure, skin tone)', () => {
    const { definition, solver } = makeContext();
    // The changed path is inherently explicit — asking to change it is consent.
    const jaw = createEvent('set', 'ui', { path: 'face.jaw.width', value: 0.8 });
    const skin = createEvent('set', 'ai', { path: 'skin.pigmentation', value: 0.6 });
    const head = createEvent('set', 'automation', { path: 'identity.headProportion', value: 1.1 });

    expect(solver.gate(jaw, definition, { amount: 0 }).allowed).toBe(true);
    expect(solver.gate(skin, definition, { amount: 0 }).allowed).toBe(true);
    expect(solver.gate(head, definition, { amount: 0 }).allowed).toBe(true);
  });

  it('allows protected props in a batch when the operation carries full identity budget', () => {
    const { definition, solver } = makeContext();
    const evt = createEvent('set', 'developer', {
      changes: { 'identity.seed': 42, 'identity.skullWidth': 0.9 },
    });
    const gate = solver.gate(evt, definition, { amount: 1 });
    expect(gate.allowed).toBe(true);
  });

  it('reports the identity importance classification of protected props', () => {
    const { registry } = makeContext();
    expect(registry.require('identity.id').identityImportance).toBe(IdentityImportance.Critical);
    expect(registry.require('identity.seed').identityImportance).toBe(IdentityImportance.Critical);
    expect(registry.require('identity.skullWidth').identityImportance).toBe(
      IdentityImportance.High,
    );
    expect(registry.require('face.jaw.width').identityImportance).toBeLessThanOrEqual(
      IdentityImportance.High,
    );
  });
});
