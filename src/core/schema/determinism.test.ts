import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from './descriptors';
import { HumanDefinition } from './human-definition';
import { CanonicalHuman } from '../../geometry/canonical/canonical-human';
import { resolveAnatomy } from '../../anatomy/parametric/parametric-anatomy';
import { generateStrandHair, clumpStrands } from '../../surface/hair/strand-hair';
import { generateGarment, generateWrinkles } from '../../surface/clothing/garment';
import { generatePoreDetail } from '../../surface/skin/neural-skin';

function makeHuman(seed?: Record<string, number>) {
  const registry = createDefaultRegistry();
  const definition = new HumanDefinition(registry, seed);
  return { registry, definition };
}

function canonical() {
  const skeleton = ['spine_01', 'spine_02', 'chest', 'neck', 'head'];
  return new CanonicalHuman(skeleton);
}

function garmentDims() {
  return resolveAnatomy(new HumanDefinition(createDefaultRegistry()));
}

describe('Determinism (spec #53): same input + seed reproduces identical output', () => {
  it('strand hair geometry is identical for the same definition and seed', () => {
    const { definition } = makeHuman({ 'hair.length': 0.8, 'hair.density': 0.7, 'hair.curl': 0.3 });
    const base = canonical();

    const a = generateStrandHair(definition, base, { maxStrands: 48, segments: 4, seed: 1234 });
    const b = generateStrandHair(definition, base, { maxStrands: 48, segments: 4, seed: 1234 });

    expect(a.strands.length).toBe(b.strands.length);
    // Same seed => bit-identical strand point positions.
    expect(a.strands).toEqual(b.strands);
  });

  it('clump binning is deterministic for a given seed', () => {
    const { definition } = makeHuman({ 'hair.length': 0.7, 'hair.density': 0.8 });
    const base = canonical();
    const hair = generateStrandHair(definition, base, { maxStrands: 40, segments: 3, seed: 5 });

    const a = clumpStrands(hair, { clumps: 6, seed: 77 });
    const b = clumpStrands(hair, { clumps: 6, seed: 77 });

    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('garment wrinkle offsets are deterministic for a given seed', () => {
    const dims = garmentDims();
    const attachment = {
      id: 'shirt-1',
      kind: 'wearable' as const,
      anchor: { region: 'torso' as const },
      data: { type: 't-shirt', color: [0.1, 0.2, 0.3] },
    };
    const garment = generateGarment(attachment, dims);

    const a = generateWrinkles(garment, dims, { seed: 42 });
    const b = generateWrinkles(garment, dims, { seed: 42 });
    const c = generateWrinkles(garment, dims, { seed: 43 });

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('pore detail is deterministic across identical invocations', () => {
    const a = generatePoreDetail(7, { u: 0.3, v: 0.6 }, 'face');
    const b = generatePoreDetail(7, { u: 0.3, v: 0.6 }, 'face');
    expect(a).toEqual(b);
  });

  it('a cloned definition serializes identically to its source', () => {
    const seed = {
      'global.height': 1.7,
      'face.nose.width': 0.6,
      'skin.pigmentation': 0.45,
      'hair.colorR': 0.8,
    };
    const { definition } = makeHuman(seed);
    const clone = definition.clone();
    expect(clone.serialize()).toEqual(definition.serialize());
    expect(definition.toJSON()).toEqual(clone.toJSON());
  });
});
